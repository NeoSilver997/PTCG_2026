import { Injectable, NotFoundException, Logger, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { FindAllTournamentsDto } from './dto/find-all-tournaments.dto';
import { SortBy } from './dto/find-all-tournaments.dto';
import { CreateTournamentDto } from './dto/create-tournament.dto';

@Injectable()
export class TournamentsService {
  private readonly logger = new Logger(TournamentsService.name);

  constructor(private prisma: PrismaService) {}

  async getCardUsageTrend(periodsRaw?: string, regionRaw?: string) {
    const periods = Math.min(Math.max(Number(periodsRaw || 10) || 10, 2), 52);
    const validRegions = new Set(['JP', 'HK', 'EN']);
    const region = regionRaw && validRegions.has(regionRaw.toUpperCase())
      ? regionRaw.toUpperCase()
      : null;

    const regionSql = region ? `AND t.region = '${region}'` : '';

    const rows = await this.prisma.$queryRawUnsafe<Array<{
      period_start: Date;
      period_end: Date;
      total_cards: number;
      pokemon: number;
      trainer: number;
      item: number;
      stadium: number;
      tools: number;
    }>>(
      `
      WITH usage AS (
        SELECT
          to_timestamp(floor(extract(epoch FROM t.date) / 1209600) * 1209600)::date AS period_start,
          (to_timestamp(floor(extract(epoch FROM t.date) / 1209600) * 1209600) + interval '13 days')::date AS period_end,
          SUM(dc.quantity)::int AS total_cards,
          SUM(CASE WHEN c.supertype = 'POKEMON' THEN dc.quantity ELSE 0 END)::int AS pokemon,
          SUM(CASE WHEN c.supertype = 'TRAINER' THEN dc.quantity ELSE 0 END)::int AS trainer,
          SUM(CASE WHEN c.supertype = 'TRAINER' AND 'ITEM' = ANY(c.subtypes) THEN dc.quantity ELSE 0 END)::int AS item,
          SUM(CASE WHEN c.supertype = 'TRAINER' AND 'STADIUM' = ANY(c.subtypes) THEN dc.quantity ELSE 0 END)::int AS stadium,
          SUM(CASE WHEN c.supertype = 'TRAINER' AND 'TOOL' = ANY(c.subtypes) THEN dc.quantity ELSE 0 END)::int AS tools
        FROM tournaments t
        JOIN tournament_results tr ON tr."tournamentId" = t.id
        JOIN decks d ON d.id = tr."deckId"
        JOIN deck_cards dc ON dc."deckId" = d.id
        JOIN cards c ON c.id = dc."cardId"
        WHERE t.date >= now() - (${periods} * interval '14 days')
          ${regionSql}
        GROUP BY 1, 2
      )
      SELECT *
      FROM usage
      ORDER BY period_start ASC
      `,
    );

    return {
      periods,
      region,
      data: rows.map((row) => ({
        periodStart: row.period_start,
        periodEnd: row.period_end,
        totalCards: row.total_cards ?? 0,
        pokemon: row.pokemon ?? 0,
        trainer: row.trainer ?? 0,
        item: row.item ?? 0,
        stadium: row.stadium ?? 0,
        tools: row.tools ?? 0,
      })),
    };
  }

  async findAll(query: FindAllTournamentsDto): Promise<{ data: any[]; meta: { total: number; skip: number; take: number } }> {
    const where: any = {};

    if (query.region) where.region = query.region;
    if (query.type) where.type = query.type;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { location: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.dateFrom || query.dateTo) {
      where.date = {};
      if (query.dateFrom) where.date.gte = new Date(query.dateFrom);
      if (query.dateTo) where.date.lte = new Date(query.dateTo);
    }

    const [data, total] = await Promise.all([
      this.prisma.tournament.findMany({
        where,
        skip: query.skip ?? 0,
        take: query.take ?? 50,
        orderBy: query.sortBy === SortBy.PLAYERS
          ? { playerCount: query.sortOrder ?? 'desc' }
          : { date: query.sortOrder ?? 'desc' },
        include: {
          _count: { select: { results: true } },
        },
      }),
      this.prisma.tournament.count({ where }),
    ]);

    return { data, meta: { total, skip: query.skip ?? 0, take: query.take ?? 50 } };
  }

  async findOne(id: string): Promise<any> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      include: {
        results: {
          orderBy: { placement: 'asc' },
          include: {
            deck: {
              include: {
                cards: {
                  include: {
                    card: {
                      select: {
                        webCardId: true,
                        name: true,
                        imageUrl: true,
                        supertype: true,
                        subtypes: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!tournament) {
      throw new NotFoundException(`Tournament ${id} not found`);
    }

    await this.hydrateDeckExtras(tournament);

    return tournament;
  }

  async findByEventId(eventId: string): Promise<any> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { eventId },
      include: {
        results: {
          orderBy: { placement: 'asc' },
          include: {
            deck: {
              include: {
                cards: {
                  include: {
                    card: {
                      select: {
                        webCardId: true,
                        name: true,
                        imageUrl: true,
                        supertype: true,
                        subtypes: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!tournament) {
      throw new NotFoundException(`Tournament with eventId ${eventId} not found`);
    }

    await this.hydrateDeckExtras(tournament);

    return tournament;
  }

  private async hydrateDeckExtras(tournament: any) {
    if (!tournament?.results?.length) return;

    // Augment decks with deckCode + deckData (columns added after Prisma client was generated)
    const deckIds = (tournament.results as any[])
      .filter((r) => r.deck)
      .map((r) => r.deck.id as string);

    if (deckIds.length > 0) {
      const extras = await this.prisma.$queryRaw<
        Array<{ id: string; deckCode: string | null; deckData: any }>
      >`SELECT id, "deckCode", "deckData" FROM decks WHERE id = ANY(${deckIds}::text[])`;
      const map = new Map(extras.map((e) => [e.id, e]));
      for (const result of tournament.results as any[]) {
        if (result.deck) {
          const extra = map.get(result.deck.id);
          if (extra) {
            result.deck.deckCode = extra.deckCode;
            result.deck.deckData = extra.deckData;
          }
        }
      }
    }
  }

  async create(dto: CreateTournamentDto) {
    const existing = await this.prisma.tournament.findUnique({
      where: { eventId: dto.eventId },
    });

    if (existing) {
      throw new ConflictException(`Tournament with eventId ${dto.eventId} already exists`);
    }

    const tournament = await this.prisma.tournament.create({
      data: {
        eventId: dto.eventId,
        name: dto.name,
        type: dto.type as any ?? 'CHAMPIONSHIP',
        date: new Date(dto.date),
        location: dto.location,
        region: dto.region as any ?? 'JP',
        playerCount: dto.playerCount,
        ageGroup: dto.ageGroup,
        sourceUrl: dto.sourceUrl ?? '',
      },
    });

    this.logger.log(`Created tournament: ${tournament.id} (${tournament.name})`);
    return tournament;
  }

  async upsertMany(tournaments: CreateTournamentDto[]) {
    let created = 0;
    let skipped = 0;

    for (const dto of tournaments) {
      const existing = await this.prisma.tournament.findUnique({
        where: { eventId: dto.eventId },
      });

      if (existing) {
        skipped++;
        continue;
      }

      await this.prisma.tournament.create({
        data: {
          eventId: dto.eventId,
          name: dto.name,
          type: dto.type as any ?? 'CHAMPIONSHIP',
          date: new Date(dto.date),
          location: dto.location,
          region: dto.region as any ?? 'JP',
          playerCount: dto.playerCount,
          ageGroup: dto.ageGroup,
          sourceUrl: dto.sourceUrl ?? '',
        },
      });
      created++;
    }

    this.logger.log(`Upsert complete: ${created} created, ${skipped} skipped`);
    return { created, skipped };
  }

  async getDeckMetaSummary(regionRaw?: string, limitRaw?: string, sinceDateRaw?: string) {
    const validRegions = new Set(['JP', 'HK', 'EN']);
    const region = regionRaw && validRegions.has(regionRaw.toUpperCase())
      ? regionRaw.toUpperCase()
      : null;
    const limit = Math.min(Math.max(Number(limitRaw || 25) || 25, 5), 100);

    const regionSql = region ? `AND t.region = '${region}'` : '';
    // Validate ISO date (YYYY-MM-DD) before interpolating to prevent injection
    const sinceDate = sinceDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(sinceDateRaw)
      ? sinceDateRaw
      : null;
    const sinceDateSql = sinceDate ? `AND t.date >= '${sinceDate}'::timestamp` : '';

    // Get top cards by frequency — grouped by name so reprints are merged
    const topCards = await this.prisma.$queryRawUnsafe<Array<{
      name: string;
      card_image: string;
      supertype: string;
      frequency: number;
      deck_count: number;
    }>>(
      `
      SELECT
        c.name,
        MIN(c."imageUrl") FILTER (WHERE c."imageUrl" IS NOT NULL) as card_image,
        c.supertype,
        SUM(dc.quantity)::int as frequency,
        COUNT(DISTINCT d.id)::int as deck_count
      FROM deck_cards dc
      JOIN cards c ON c.id = dc."cardId"
      JOIN decks d ON d.id = dc."deckId"
      JOIN tournament_results tr ON tr."deckId" = d.id
      JOIN tournaments t ON t.id = tr."tournamentId"
      WHERE 1=1 ${regionSql} ${sinceDateSql}
      GROUP BY c.name, c.supertype
      ORDER BY frequency DESC
      LIMIT ${limit}
      `,
    );

    // Get Pokemon types distribution in tournament-winning decks
    const typeDistribution = await this.prisma.$queryRawUnsafe<Array<{
      pokemon_type: string;
      deck_count: number;
      avg_placement: number;
      win_rate_percent: number;
    }>>(
      `
      WITH deck_types AS (
        SELECT
          d.id as deck_id,
          tr.placement,
          unnest(c.types)::text as pokemon_type
        FROM decks d
        JOIN tournament_results tr ON tr."deckId" = d.id
        JOIN tournaments t ON t.id = tr."tournamentId"
        JOIN deck_cards dc ON dc."deckId" = d.id
        JOIN cards c ON c.id = dc."cardId"
        WHERE c.supertype = 'POKEMON' ${regionSql} ${sinceDateSql}
      ),
      type_stats AS (
        SELECT
          pokemon_type,
          COUNT(DISTINCT deck_id)::int as deck_count,
          ROUND(AVG(placement)::numeric, 2)::float as avg_placement,
          ROUND(100.0 * COUNT(DISTINCT CASE WHEN placement <= 8 THEN deck_id END) / COUNT(DISTINCT deck_id), 1)::float as win_rate_percent
        FROM deck_types
        GROUP BY pokemon_type
      )
      SELECT * FROM type_stats
      WHERE deck_count >= 5
      ORDER BY win_rate_percent DESC, deck_count DESC
      LIMIT 15
      `,
    );

    // Get deck composition statistics
    const deckStats = await this.prisma.$queryRawUnsafe<Array<{
      total_decks: number;
      avg_pokemon: number;
      avg_trainer: number;
      avg_energy: number;
      avg_cards_total: number;
    }>>(
      `
      SELECT
        COUNT(DISTINCT d.id)::int as total_decks,
        ROUND(AVG(CASE WHEN c.supertype = 'POKEMON' THEN dc.quantity ELSE 0 END)::numeric, 1)::float as avg_pokemon,
        ROUND(AVG(CASE WHEN c.supertype = 'TRAINER' THEN dc.quantity ELSE 0 END)::numeric, 1)::float as avg_trainer,
        ROUND(AVG(CASE WHEN c.supertype = 'ENERGY' THEN dc.quantity ELSE 0 END)::numeric, 1)::float as avg_energy,
        ROUND(AVG(dc.quantity)::numeric, 1)::float as avg_cards_total
      FROM decks d
      JOIN tournament_results tr ON tr."deckId" = d.id
      JOIN tournaments t ON t.id = tr."tournamentId"
      JOIN deck_cards dc ON dc."deckId" = d.id
      JOIN cards c ON c.id = dc."cardId"
      WHERE 1=1 ${regionSql} ${sinceDateSql}
      `,
    );

    // Get deck archetypes by key Pokemon (highest evolution + EX priority, ported from PTCG_CardDB rebuild_deck_cache logic)
    // Also surfaces key2 image and most common ACE_SPEC card per archetype
    const archetypes = await this.prisma.$queryRawUnsafe<Array<{
      archetype_name: string;
      deck_count: number;
      avg_placement: number;
      key1_image: string | null;
      key2_image: string | null;
      key_item_name: string | null;
      key_item_image: string | null;
    }>>(
      `
      WITH pre_evolutions AS (
        SELECT DISTINCT dc."deckId", c_base.name as pre_evo_name
        FROM deck_cards dc
        JOIN cards c_evolved ON c_evolved.id = dc."cardId"
          AND c_evolved.supertype = 'POKEMON'
          AND c_evolved."evolvesFrom" IS NOT NULL
        JOIN cards c_base ON c_base.name = c_evolved."evolvesFrom" AND c_base.supertype = 'POKEMON'
        JOIN deck_cards dc_base ON dc_base."deckId" = dc."deckId" AND dc_base."cardId" = c_base.id
        JOIN tournament_results tr ON tr."deckId" = dc."deckId"
        JOIN tournaments t ON t.id = tr."tournamentId"
        WHERE 1=1 ${regionSql} ${sinceDateSql}
      ),
      deck_key_pokemon AS (
        SELECT
          d.id as deck_id,
          tr.placement,
          c.name,
          c."imageUrl",
          dc.quantity,
          ROW_NUMBER() OVER (
            PARTITION BY d.id
            ORDER BY
              (CASE WHEN c.name ILIKE '%ex' THEN 1000 ELSE 0 END +
               CASE c."evolutionStage"
                 WHEN 'STAGE_2' THEN 300
                 WHEN 'STAGE_1' THEN 200
                 ELSE 100
               END) DESC,
              dc.quantity DESC,
              c.name ASC
          ) as rn
        FROM decks d
        JOIN tournament_results tr ON tr."deckId" = d.id
        JOIN tournaments t ON t.id = tr."tournamentId"
        JOIN deck_cards dc ON dc."deckId" = d.id
        JOIN cards c ON c.id = dc."cardId"
        WHERE c.supertype = 'POKEMON' AND dc.quantity >= 2 ${regionSql} ${sinceDateSql}
          AND NOT EXISTS (
            SELECT 1 FROM pre_evolutions pe WHERE pe."deckId" = d.id AND pe.pre_evo_name = c.name
          )
      ),
      deck_archetype_names AS (
        SELECT
          deck_id,
          placement,
          CASE
            WHEN COUNT(*) >= 2
              THEN MIN(CASE WHEN rn = 1 THEN name END) || '/' || MIN(CASE WHEN rn = 2 THEN name END)
            ELSE MIN(CASE WHEN rn = 1 THEN name END)
          END as archetype_name,
          MIN(CASE WHEN rn = 1 THEN "imageUrl" END) as key1_image,
          MIN(CASE WHEN rn = 2 THEN "imageUrl" END) as key2_image
        FROM deck_key_pokemon
        WHERE rn <= 2
        GROUP BY deck_id, placement
      ),
      archetype_ace_specs AS (
        SELECT
          COALESCE(dan.archetype_name, 'Unknown') as archetype_name,
          c.name as item_name,
          MIN(c."imageUrl") as item_image,
          COUNT(DISTINCT dan.deck_id) as item_count,
          ROW_NUMBER() OVER (
            PARTITION BY COALESCE(dan.archetype_name, 'Unknown')
            ORDER BY COUNT(DISTINCT dan.deck_id) DESC
          ) as rn
        FROM deck_archetype_names dan
        JOIN deck_cards dc ON dc."deckId" = dan.deck_id
        JOIN cards c ON c.id = dc."cardId"
        WHERE c.rarity = 'ACE_SPEC'
        GROUP BY COALESCE(dan.archetype_name, 'Unknown'), c.name
      )
      SELECT
        COALESCE(dan.archetype_name, 'Unknown') as archetype_name,
        COUNT(DISTINCT dan.deck_id)::int as deck_count,
        ROUND(AVG(dan.placement)::numeric, 2)::float as avg_placement,
        MIN(dan.key1_image) as key1_image,
        MIN(dan.key2_image) as key2_image,
        MAX(CASE WHEN aas.rn = 1 THEN aas.item_name END) as key_item_name,
        MAX(CASE WHEN aas.rn = 1 THEN aas.item_image END) as key_item_image
      FROM deck_archetype_names dan
      LEFT JOIN archetype_ace_specs aas ON aas.archetype_name = COALESCE(dan.archetype_name, 'Unknown')
      GROUP BY dan.archetype_name
      HAVING COUNT(DISTINCT dan.deck_id) >= 2
      ORDER BY deck_count DESC
      LIMIT 30
      `,
    );

    return {
      region: region || 'ALL',
      sinceDate: sinceDate || null,
      topCards: topCards.map((card) => ({
        name: card.name,
        imageUrl: card.card_image,
        supertype: card.supertype,
        frequency: card.frequency,
        deckCount: card.deck_count,
      })),
      typeDistribution: typeDistribution.map((type) => ({
        pokemonType: type.pokemon_type,
        deckCount: type.deck_count,
        avgPlacement: type.avg_placement,
        winRatePercent: type.win_rate_percent,
      })),
      deckStats: deckStats[0] ? {
        totalDecks: deckStats[0].total_decks,
        avgPokemon: deckStats[0].avg_pokemon,
        avgTrainer: deckStats[0].avg_trainer,
        avgEnergy: deckStats[0].avg_energy,
        avgCardsTotal: deckStats[0].avg_cards_total,
      } : null,
      archetypes: archetypes.map((arch) => ({
        archetypeName: arch.archetype_name,
        deckCount: arch.deck_count,
        avgPlacement: arch.avg_placement,
        key1Image: arch.key1_image,
        key2Image: arch.key2_image,
        keyItemName: arch.key_item_name,
        keyItemImage: arch.key_item_image,
      })),
    };
  }

  async getArchetypeDecks(
    archetypeNameRaw: string,
    regionRaw?: string,
    sinceDateRaw?: string,
    skipRaw?: string,
    takeRaw?: string,
  ) {
    // Escape single quotes to prevent SQL injection in the name filter
    const archetypeName = archetypeNameRaw.replace(/'/g, "''");
    const validRegions = new Set(['JP', 'HK', 'EN']);
    const region = regionRaw && validRegions.has(regionRaw.toUpperCase())
      ? regionRaw.toUpperCase()
      : null;
    const sinceDate = sinceDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(sinceDateRaw)
      ? sinceDateRaw
      : null;
    const skip = Math.max(Number(skipRaw || 0) || 0, 0);
    const take = Math.min(Math.max(Number(takeRaw || 30) || 30, 5), 100);
    const regionSql = region ? `AND t.region = '${region}'` : '';
    const sinceDateSql = sinceDate ? `AND t.date >= '${sinceDate}'::timestamp` : '';

    const decks = await this.prisma.$queryRawUnsafe<Array<{
      deck_id: string;
      deck_code: string | null;
      placement: number;
      player_name: string;
      tournament_name: string;
      tournament_date: string;
      event_id: string;
      archetype_name: string;
      key1_image: string | null;
      key2_image: string | null;
      top_cards: string; // JSON
      pokemon_count: number;
      trainer_count: number;
      item_count: number;
      energy_count: number;
    }>>(
      `
      WITH pre_evolutions AS (
        SELECT DISTINCT dc."deckId", c_base.name as pre_evo_name
        FROM deck_cards dc
        JOIN cards c_evolved ON c_evolved.id = dc."cardId"
          AND c_evolved.supertype = 'POKEMON'
          AND c_evolved."evolvesFrom" IS NOT NULL
        JOIN cards c_base ON c_base.name = c_evolved."evolvesFrom" AND c_base.supertype = 'POKEMON'
        JOIN deck_cards dc_base ON dc_base."deckId" = dc."deckId" AND dc_base."cardId" = c_base.id
        JOIN tournament_results tr ON tr."deckId" = dc."deckId"
        JOIN tournaments t ON t.id = tr."tournamentId"
        WHERE 1=1 ${regionSql} ${sinceDateSql}
      ),
      deck_key_pokemon AS (
        SELECT
          d.id as deck_id,
          tr.placement,
          tr."playerName" as player_name,
          t.name as tournament_name,
          t.date as tournament_date,
          t."eventId" as event_id,
          c.name,
          c."imageUrl",
          dc.quantity,
          ROW_NUMBER() OVER (
            PARTITION BY d.id
            ORDER BY
              (CASE WHEN c.name ILIKE '%ex' THEN 1000 ELSE 0 END +
               CASE c."evolutionStage"
                 WHEN 'STAGE_2' THEN 300
                 WHEN 'STAGE_1' THEN 200
                 ELSE 100
               END) DESC,
              dc.quantity DESC,
              c.name ASC
          ) as rn
        FROM decks d
        JOIN tournament_results tr ON tr."deckId" = d.id
        JOIN tournaments t ON t.id = tr."tournamentId"
        JOIN deck_cards dc ON dc."deckId" = d.id
        JOIN cards c ON c.id = dc."cardId"
        WHERE c.supertype = 'POKEMON' AND dc.quantity >= 2 ${regionSql} ${sinceDateSql}
          AND NOT EXISTS (
            SELECT 1 FROM pre_evolutions pe WHERE pe."deckId" = d.id AND pe.pre_evo_name = c.name
          )
      ),
      deck_archetype_names AS (
        SELECT
          deck_id, placement, player_name, tournament_name, tournament_date, event_id,
          CASE
            WHEN COUNT(*) >= 2
              THEN MIN(CASE WHEN rn = 1 THEN name END) || '/' || MIN(CASE WHEN rn = 2 THEN name END)
            ELSE MIN(CASE WHEN rn = 1 THEN name END)
          END as archetype_name,
          MIN(CASE WHEN rn = 1 THEN "imageUrl" END) as key1_image,
          MIN(CASE WHEN rn = 2 THEN "imageUrl" END) as key2_image
        FROM deck_key_pokemon
        WHERE rn <= 2
        GROUP BY deck_id, placement, player_name, tournament_name, tournament_date, event_id
      ),
      filtered AS (
        SELECT * FROM deck_archetype_names
        WHERE COALESCE(archetype_name, 'Unknown') = '${archetypeName}'
      ),
      deck_card_ranked AS (
        SELECT
          dc."deckId",
          c.name,
          c."imageUrl",
          dc.quantity,
          c.supertype,
          ROW_NUMBER() OVER (
            PARTITION BY dc."deckId"
            ORDER BY
              CASE c.supertype WHEN 'POKEMON' THEN 0 WHEN 'TRAINER' THEN 1 ELSE 2 END,
              dc.quantity DESC
          ) as card_rn
        FROM filtered f
        JOIN deck_cards dc ON dc."deckId" = f.deck_id
        JOIN cards c ON c.id = dc."cardId"
      ),
      deck_top_cards AS (
        SELECT
          "deckId",
          json_agg(
            json_build_object('name', name, 'imageUrl', "imageUrl", 'quantity', quantity, 'supertype', supertype)
            ORDER BY card_rn
          ) as top_cards
        FROM deck_card_ranked
        WHERE card_rn <= 12
        GROUP BY "deckId"
      ),
      deck_counts AS (
        SELECT
          dc."deckId",
          SUM(CASE WHEN c.supertype = 'POKEMON' THEN dc.quantity ELSE 0 END)::int as pokemon_count,
          SUM(CASE WHEN c.supertype = 'TRAINER' THEN dc.quantity ELSE 0 END)::int as trainer_count,
          SUM(CASE WHEN c.supertype = 'TRAINER' AND 'ITEM' = ANY(c.subtypes) THEN dc.quantity ELSE 0 END)::int as item_count,
          SUM(CASE WHEN c.supertype = 'ENERGY' THEN dc.quantity ELSE 0 END)::int as energy_count
        FROM filtered f
        JOIN deck_cards dc ON dc."deckId" = f.deck_id
        JOIN cards c ON c.id = dc."cardId"
        GROUP BY dc."deckId"
      )
      SELECT
        f.deck_id,
        deck_tbl."deckCode" as deck_code,
        f.placement,
        f.player_name,
        f.tournament_name,
        f.tournament_date,
        f.event_id,
        f.archetype_name,
        f.key1_image,
        f.key2_image,
        COALESCE(dtc.top_cards::text, '[]') as top_cards,
        COALESCE(dct.pokemon_count, 0) as pokemon_count,
        COALESCE(dct.trainer_count, 0) as trainer_count,
        COALESCE(dct.item_count, 0) as item_count,
        COALESCE(dct.energy_count, 0) as energy_count
      FROM filtered f
      LEFT JOIN decks deck_tbl ON deck_tbl.id = f.deck_id
      LEFT JOIN deck_top_cards dtc ON dtc."deckId" = f.deck_id
      LEFT JOIN deck_counts dct ON dct."deckId" = f.deck_id
      ORDER BY f.placement ASC, f.tournament_date DESC
      LIMIT ${take} OFFSET ${skip}
      `,
    );

    const countResult = await this.prisma.$queryRawUnsafe<[{ total: number }]>(
      `
      WITH pre_evolutions AS (
        SELECT DISTINCT dc."deckId", c_base.name as pre_evo_name
        FROM deck_cards dc
        JOIN cards c_evolved ON c_evolved.id = dc."cardId"
          AND c_evolved.supertype = 'POKEMON'
          AND c_evolved."evolvesFrom" IS NOT NULL
        JOIN cards c_base ON c_base.name = c_evolved."evolvesFrom" AND c_base.supertype = 'POKEMON'
        JOIN deck_cards dc_base ON dc_base."deckId" = dc."deckId" AND dc_base."cardId" = c_base.id
        JOIN tournament_results tr ON tr."deckId" = dc."deckId"
        JOIN tournaments t ON t.id = tr."tournamentId"
        WHERE 1=1 ${regionSql} ${sinceDateSql}
      ),
      deck_key_pokemon AS (
        SELECT
          d.id as deck_id,
          tr.placement,
          c.name,
          c."imageUrl",
          dc.quantity,
          ROW_NUMBER() OVER (
            PARTITION BY d.id
            ORDER BY
              (CASE WHEN c.name ILIKE '%ex' THEN 1000 ELSE 0 END +
               CASE c."evolutionStage"
                 WHEN 'STAGE_2' THEN 300
                 WHEN 'STAGE_1' THEN 200
                 ELSE 100
               END) DESC,
              dc.quantity DESC,
              c.name ASC
          ) as rn
        FROM decks d
        JOIN tournament_results tr ON tr."deckId" = d.id
        JOIN tournaments t ON t.id = tr."tournamentId"
        JOIN deck_cards dc ON dc."deckId" = d.id
        JOIN cards c ON c.id = dc."cardId"
        WHERE c.supertype = 'POKEMON' AND dc.quantity >= 2 ${regionSql} ${sinceDateSql}
          AND NOT EXISTS (
            SELECT 1 FROM pre_evolutions pe WHERE pe."deckId" = d.id AND pe.pre_evo_name = c.name
          )
      ),
      deck_archetype_names AS (
        SELECT deck_id,
          CASE
            WHEN COUNT(*) >= 2
              THEN MIN(CASE WHEN rn = 1 THEN name END) || '/' || MIN(CASE WHEN rn = 2 THEN name END)
            ELSE MIN(CASE WHEN rn = 1 THEN name END)
          END as archetype_name
        FROM deck_key_pokemon WHERE rn <= 2
        GROUP BY deck_id
      )
      SELECT COUNT(*)::int as total
      FROM deck_archetype_names
      WHERE COALESCE(archetype_name, 'Unknown') = '${archetypeName}'
      `,
    );

    return {
      archetypeName: archetypeNameRaw,
      total: countResult[0]?.total ?? 0,
      skip,
      take,
      decks: decks.map((d) => ({
        deckId: d.deck_id,
        deckCode: d.deck_code,
        placement: d.placement,
        playerName: d.player_name,
        tournamentName: d.tournament_name,
        tournamentDate: d.tournament_date,
        eventId: d.event_id,
        key1Image: d.key1_image,
        key2Image: d.key2_image,
        topCards: (() => { try { return JSON.parse(d.top_cards); } catch { return []; } })(),
        pokemonCount: Number(d.pokemon_count) || 0,
        trainerCount: Number(d.trainer_count) || 0,
        itemCount: Number(d.item_count) || 0,
        energyCount: Number(d.energy_count) || 0,
      })),
    };
  }

  async getPlayerLeaderboard(regionRaw?: string, sinceDateRaw?: string, limitRaw?: string) {
    const validRegions = new Set(['JP', 'HK', 'EN']);
    const region = regionRaw && validRegions.has(regionRaw.toUpperCase())
      ? regionRaw.toUpperCase()
      : null;
    const limit = Math.min(Math.max(Number(limitRaw || 50) || 50, 10), 200);

    const regionSql = region ? `AND t.region = '${region}'` : '';
    const sinceDate = sinceDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(sinceDateRaw)
      ? sinceDateRaw
      : null;
    const sinceDateSql = sinceDate ? `AND t.date >= '${sinceDate}'::timestamp` : '';

    const rows = await this.prisma.$queryRawUnsafe<Array<{
      rank: number;
      player_name: string;
      total_points: number;
      tournaments_played: number;
      best_placement: number;
      wins: number;
      last_decks: string | any[] | null;
    }>>(
      `
      WITH pre_evolutions AS (
        SELECT DISTINCT dc."deckId", c_base.name as pre_evo_name
        FROM deck_cards dc
        JOIN cards c_evolved ON c_evolved.id = dc."cardId"
          AND c_evolved.supertype = 'POKEMON'
          AND c_evolved."evolvesFrom" IS NOT NULL
        JOIN cards c_base ON c_base.name = c_evolved."evolvesFrom" AND c_base.supertype = 'POKEMON'
        JOIN deck_cards dc_base ON dc_base."deckId" = dc."deckId" AND dc_base."cardId" = c_base.id
        JOIN tournament_results tr ON tr."deckId" = dc."deckId"
        JOIN tournaments t ON t.id = tr."tournamentId"
        WHERE 1=1 ${regionSql} ${sinceDateSql}
      ),
      deck_key_pokemon AS (
        SELECT
          d.id as deck_id,
          c.name,
          c."imageUrl",
          dc.quantity,
          ROW_NUMBER() OVER (
            PARTITION BY d.id
            ORDER BY
              (CASE WHEN c.name ILIKE '%ex' THEN 1000 ELSE 0 END +
               CASE c."evolutionStage"
                 WHEN 'STAGE_2' THEN 300
                 WHEN 'STAGE_1' THEN 200
                 ELSE 100
               END) DESC,
              dc.quantity DESC,
              c.name ASC
          ) as rn
        FROM decks d
        JOIN deck_cards dc ON dc."deckId" = d.id
        JOIN cards c ON c.id = dc."cardId"
        WHERE c.supertype = 'POKEMON' AND dc.quantity >= 2
          AND NOT EXISTS (
            SELECT 1 FROM pre_evolutions pe WHERE pe."deckId" = d.id AND pe.pre_evo_name = c.name
          )
      ),
      deck_archetype_names AS (
        SELECT
          deck_id,
          CASE
            WHEN COUNT(*) >= 2
              THEN MIN(CASE WHEN rn = 1 THEN name END) || '/' || MIN(CASE WHEN rn = 2 THEN name END)
            ELSE MIN(CASE WHEN rn = 1 THEN name END)
          END as archetype_name,
          MIN(CASE WHEN rn = 1 THEN "imageUrl" END) as key1_image,
          MIN(CASE WHEN rn = 2 THEN "imageUrl" END) as key2_image
        FROM deck_key_pokemon
        WHERE rn <= 2
        GROUP BY deck_id
      ),
      player_points AS (
        SELECT
          tr."playerName" as player_name,
          tr.id as result_id,
          tr.placement,
          tr."deckId" as deck_id,
          t.name as tournament_name,
          t.date as tournament_date,
          t."eventId" as event_id,
          CASE
            WHEN tr.placement = 1 THEN 20
            WHEN tr.placement = 2 THEN 10
            WHEN tr.placement = 3 THEN 5
            WHEN tr.placement = 4 THEN 3
            WHEN tr.placement <= 8 THEN 2
            WHEN tr.placement <= 16 THEN 1
            ELSE 0
          END as pts
        FROM tournament_results tr
        JOIN tournaments t ON t.id = tr."tournamentId"
        WHERE tr."deckId" IS NOT NULL ${regionSql} ${sinceDateSql}
      ),
      player_totals AS (
        SELECT
          player_name,
          SUM(pts)::int as total_points,
          COUNT(*)::int as tournaments_played,
          MIN(placement)::int as best_placement,
          SUM(CASE WHEN placement = 1 THEN 1 ELSE 0 END)::int as wins,
          ROW_NUMBER() OVER (ORDER BY SUM(pts) DESC, MIN(placement) ASC, player_name ASC) as rank
        FROM player_points
        GROUP BY player_name
        LIMIT ${limit}
      ),
      player_last_decks AS (
        SELECT
          pp.player_name,
          pp.placement,
          pp.tournament_name,
          pp.tournament_date,
          pp.event_id,
          d."deckCode" as deck_code,
          COALESCE(dan.archetype_name, '???') as archetype_name,
          dan.key1_image,
          dan.key2_image,
          ROW_NUMBER() OVER (PARTITION BY pp.player_name ORDER BY pp.tournament_date DESC, pp.placement ASC) as deck_rn
        FROM player_points pp
        JOIN player_totals pt ON pt.player_name = pp.player_name
        LEFT JOIN decks d ON d.id = pp.deck_id
        LEFT JOIN deck_archetype_names dan ON dan.deck_id = pp.deck_id
      )
      SELECT
        pt.rank,
        pt.player_name,
        pt.total_points,
        pt.tournaments_played,
        pt.best_placement,
        pt.wins,
        json_agg(
          json_build_object(
            'placement', pld.placement,
            'tournamentName', pld.tournament_name,
            'tournamentDate', pld.tournament_date,
            'eventId', pld.event_id,
            'deckCode', pld.deck_code,
            'archetypeName', pld.archetype_name,
            'key1Image', pld.key1_image,
            'key2Image', pld.key2_image
          ) ORDER BY pld.tournament_date DESC, pld.placement ASC
        ) FILTER (WHERE pld.deck_rn <= 5) as last_decks
      FROM player_totals pt
      LEFT JOIN player_last_decks pld ON pld.player_name = pt.player_name AND pld.deck_rn <= 5
      GROUP BY pt.rank, pt.player_name, pt.total_points, pt.tournaments_played, pt.best_placement, pt.wins
      ORDER BY pt.rank
      `,
    );

    return rows.map(r => ({
      rank: Number(r.rank),
      playerName: r.player_name,
      totalPoints: Number(r.total_points),
      tournamentsPlayed: Number(r.tournaments_played),
      bestPlacement: Number(r.best_placement),
      wins: Number(r.wins),
      lastDecks: (() => {
        try {
          const d = typeof r.last_decks === 'string' ? JSON.parse(r.last_decks) : r.last_decks;
          return Array.isArray(d) ? d : [];
        } catch { return []; }
      })(),
    }));
  }
}
