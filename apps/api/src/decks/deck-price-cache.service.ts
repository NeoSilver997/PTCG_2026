import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

/**
 * DeckPriceCacheService
 *
 * Runs a scheduled batch job to pre-compute and cache budget/premium prices
 * for event decks from the last 7 days.  Cached values are written to
 * `decks.cachedBudgetMin` / `cachedBudgetMax` so the tournament list can be
 * sorted by price without running the full pricing SQL per request.
 *
 * Schedule: runs once on startup, then every 6 hours.
 */
@Injectable()
export class DeckPriceCacheService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DeckPriceCacheService.name);
  private readonly INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
  private readonly BATCH_SIZE = 20;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    // Delay first run by 15 s so the server finishes starting up
    setTimeout(() => this.runAndSchedule(), 15_000);
  }

  private runAndSchedule() {
    this.run().catch((err) =>
      this.logger.error('Deck price cache job failed', err),
    );
    setInterval(() => {
      this.run().catch((err) =>
        this.logger.error('Deck price cache job failed', err),
      );
    }, this.INTERVAL_MS);
  }

  /** Public entry point for manual trigger (e.g. admin endpoint) */
  async run(): Promise<{ processed: number; updated: number; skipped: number; durationMs: number }> {
    const start = Date.now();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    this.logger.log('Starting deck price cache job (last 7 days)...');

    // Find all decks linked to tournaments in the last 7 days
    const deckIds = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT DISTINCT d.id
      FROM decks d
      JOIN tournament_results tr ON tr."deckId" = d.id
      JOIN tournaments t ON t.id = tr."tournamentId"
      WHERE t.date >= ${sevenDaysAgo}
        AND d.id IS NOT NULL
    `;

    if (deckIds.length === 0) {
      this.logger.log('No recent event decks found.');
      return { processed: 0, updated: 0, skipped: 0, durationMs: Date.now() - start };
    }

    this.logger.log(`Found ${deckIds.length} event decks to price-cache`);

    let updated = 0;
    let skipped = 0;

    // Process in batches to avoid memory pressure
    for (let i = 0; i < deckIds.length; i += this.BATCH_SIZE) {
      const batch = deckIds.slice(i, i + this.BATCH_SIZE).map((r) => r.id);
      const results = await this.computePricesForDecks(batch);

      for (const { deckId, budgetMin, budgetMax } of results) {
        if (budgetMin === null) { skipped++; continue; }
        await this.prisma.deck.update({
          where: { id: deckId },
          data: {
            cachedBudgetMin: budgetMin,
            cachedBudgetMax: budgetMax,
            priceUpdatedAt: new Date(),
          },
        });
        updated++;
      }
    }

    this.logger.log(
      `Deck price cache complete — updated: ${updated}, skipped (no prices): ${skipped}`,
    );
    return { processed: deckIds.length, updated, skipped, durationMs: Date.now() - start };
  }

  /**
   * Core pricing SQL — mirrors decks.service.ts addPricingInfo logic:
   * latest price per ZH_TW variant within 90 days, grouped by deck.
   *
   * budgetMin = sum of cheapest variant price × quantity per deck card
   * budgetMax = sum of most expensive variant price × quantity per deck card
   */
  private async computePricesForDecks(
    deckIds: string[],
  ): Promise<Array<{ deckId: string; budgetMin: number | null; budgetMax: number | null }>> {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // One query: for every deck card in the batch, get the cheapest and most
    // expensive latest ZH_TW price grouped by (deckId, jpCardId).
    const rows = await this.prisma.$queryRaw<
      Array<{
        deckId: string;
        jpCardId: string;
        quantity: number;
        cheapestPrice: number | null;
        priciest: number | null;
      }>
    >`
      WITH latest_prices AS (
        SELECT DISTINCT ON ("cardId")
          "cardId",
          price,
          "inStock"
        FROM card_prices
        WHERE price > 0
          AND "fetchedAt" >= ${ninetyDaysAgo}
        ORDER BY "cardId", "fetchedAt" DESC
      ),
      variant_prices AS (
        SELECT
          jp_c.id          AS "jpCardId",
          MIN(lp.price)    AS "cheapestPrice",
          MAX(lp.price)    AS "priciest"
        FROM cards jp_c
        JOIN cards zh_c
          ON zh_c."primaryCardId" = jp_c."primaryCardId"
          AND zh_c.language = 'ZH_TW'
        JOIN latest_prices lp ON lp."cardId" = zh_c.id
        GROUP BY jp_c.id
      )
      SELECT
        dc."deckId"              AS "deckId",
        dc."cardId"              AS "jpCardId",
        dc.quantity              AS "quantity",
        vp."cheapestPrice"       AS "cheapestPrice",
        vp."priciest"            AS "priciest"
      FROM deck_cards dc
      LEFT JOIN variant_prices vp ON vp."jpCardId" = dc."cardId"
      WHERE dc."deckId" = ANY(${deckIds})
    `;

    // Group by deckId and aggregate totals
    const deckMap = new Map<
      string,
      { budgetMin: number; budgetMax: number; hasPrices: boolean }
    >();

    for (const row of rows) {
      if (!deckMap.has(row.deckId)) {
        deckMap.set(row.deckId, { budgetMin: 0, budgetMax: 0, hasPrices: false });
      }
      const entry = deckMap.get(row.deckId)!;
      const qty = Number(row.quantity) || 1;
      const cheap = row.cheapestPrice !== null ? Number(row.cheapestPrice) : null;
      const pricey = row.priciest !== null ? Number(row.priciest) : null;

      if (cheap !== null) {
        entry.budgetMin += cheap * qty;
        entry.budgetMax += (pricey ?? cheap) * qty;
        entry.hasPrices = true;
      }
    }

    // Return results for all requested deckIds (null if no prices found)
    return deckIds.map((id) => {
      const entry = deckMap.get(id);
      if (!entry || !entry.hasPrices) return { deckId: id, budgetMin: null, budgetMax: null };
      return { deckId: id, budgetMin: entry.budgetMin, budgetMax: entry.budgetMax };
    });
  }

  /** Return summary stats for the admin panel */
  async getStats(): Promise<{
    cachedCount: number;
    pendingCount: number;
    lastUpdatedAt: string | null;
  }> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.$queryRaw<
      Array<{ cachedCount: bigint; pendingCount: bigint; lastUpdatedAt: Date | null }>
    >`
      SELECT
        COUNT(*) FILTER (WHERE d."cachedBudgetMin" IS NOT NULL)  AS "cachedCount",
        COUNT(*) FILTER (WHERE d."cachedBudgetMin" IS NULL)      AS "pendingCount",
        MAX(d."priceUpdatedAt")                                  AS "lastUpdatedAt"
      FROM decks d
      JOIN tournament_results tr ON tr."deckId" = d.id
      JOIN tournaments t ON t.id = tr."tournamentId"
      WHERE t.date >= ${sevenDaysAgo}
    `;
    const r = rows[0];
    return {
      cachedCount: Number(r?.cachedCount ?? 0),
      pendingCount: Number(r?.pendingCount ?? 0),
      lastUpdatedAt: r?.lastUpdatedAt ? r.lastUpdatedAt.toISOString() : null,
    };
  }
}
