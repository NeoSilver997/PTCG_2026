import { Injectable, NotFoundException, Logger, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { FindAllTournamentsDto } from './dto/find-all-tournaments.dto';
import { SortBy } from './dto/find-all-tournaments.dto';
import { CreateTournamentDto } from './dto/create-tournament.dto';

@Injectable()
export class TournamentsService {
  private readonly logger = new Logger(TournamentsService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(query: FindAllTournamentsDto) {
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

  async findOne(id: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      include: {
        results: {
          orderBy: { placement: 'asc' },
          include: {
            deck: {
              include: {
                cards: {
                  include: { card: { select: { webCardId: true, name: true, imageUrl: true } } },
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

  async findByEventId(eventId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { eventId },
      include: {
        results: {
          orderBy: { placement: 'asc' },
          include: {
            deck: {
              include: {
                cards: {
                  include: { card: { select: { webCardId: true, name: true, imageUrl: true } } },
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
}
