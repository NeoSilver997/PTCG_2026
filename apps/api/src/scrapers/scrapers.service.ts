import { Injectable, NotFoundException, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateScraperJobDto, JobType } from './dto/create-scraper-job.dto';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { EventEmitter } from 'events';

type LogEntry = { ts: string; line: string };

@Injectable()
export class ScrapersService implements OnModuleDestroy {
  private readonly logger = new Logger(ScrapersService.name);
  /** In-memory log buffer per job id — ephemeral, not persisted */
  private readonly logBuffers = new Map<string, LogEntry[]>();
  /** Active child processes keyed by job id */
  private readonly processes = new Map<string, ChildProcess>();
  /** Per-job event emitters for SSE streaming */
  readonly logEmitters = new Map<string, EventEmitter>();

  constructor(private prisma: PrismaService) {}

  onModuleDestroy() {
    for (const [, proc] of this.processes) {
      proc.kill('SIGTERM');
    }
  }

  async findAll(): Promise<Array<Record<string, unknown>>> {
    const jobs = await this.prisma.scraperJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return jobs.map((j) => ({
      ...j,
      logs: this.logBuffers.get(j.id) ?? [],
    }));
  }

  async findOne(id: string): Promise<Record<string, unknown>> {
    const job = await this.prisma.scraperJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException(`ScraperJob ${id} not found`);
    return {
      ...job,
      logs: this.logBuffers.get(id) ?? [],
    };
  }

  async startJob(dto: CreateScraperJobDto): Promise<Record<string, unknown>> {
    const jobType = dto.jobType ?? JobType.TOURNAMENT_EVENTS;

    // ScraperJob.source is a Region enum (JP/HK/EN) — map jobType to the closest region
    const jobRegion: 'JP' | 'HK' | 'EN' =
      jobType === JobType.TOURNAMENT_EVENTS ? (dto.source as 'JP' | 'HK' | 'EN' ?? 'JP') :
      jobType === JobType.HK_CARDS         ? 'HK' :
      jobType === JobType.EN_CARDS         ? 'EN' :
      'JP'; // JP_CARDS, CARD_IMPORT, MARKET_PRICES, SEED_TOURNAMENTS, etc.

    const job = await this.prisma.scraperJob.create({
      data: {
        source: jobRegion as any,
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    this.logBuffers.set(job.id, []);
    const emitter = new EventEmitter();
    this.logEmitters.set(job.id, emitter);

    this.logger.log(`Starting ${jobType} job ${job.id}`);

    // Resolve base paths
    const workspaceRoot = path.resolve(__dirname, '../../../..');
    const scrapersDir   = path.resolve(workspaceRoot, 'scrapers');
    const srcDir        = path.resolve(scrapersDir, 'src');

    let command: string;
    let args: string[];
    let cwd = workspaceRoot;

    switch (jobType) {

      case JobType.TOURNAMENT_EVENTS:
        command = 'python';
        args = [
          path.resolve(srcDir, 'jpevents_scraper.py'),
          '--skip-recent', String(dto.skipRecentCount ?? 50),
          '--region', dto.source ?? 'JP',
          '--max-events', String(dto.maxEvents ?? 50),
        ];
        if (dto.forceReimport) args.push('--force-reimport');
        if (dto.reloadInfo)    args.push('--reload-info');
        cwd = scrapersDir;
        break;

      case JobType.JP_CARDS:
        command = 'python';
        args = [path.resolve(srcDir, 'japanese_card_scraper.py')];
        if (dto.idRangeStart != null && dto.idRangeCount != null)
          args.push('--id-range', String(dto.idRangeStart), String(dto.idRangeCount));
        if (dto.cardIds)            args.push('--ids', dto.cardIds);
        if (dto.cacheHtml)          args.push('--cache-html');
        if (dto.cacheOnly)          args.push('--cache-only');
        if (dto.refreshCache)       args.push('--refresh-cache');
        if (dto.threads && dto.threads > 1) args.push('--threads', String(dto.threads));
        if (dto.minRequestInterval != null) args.push('--min-request-interval', String(dto.minRequestInterval));
        if (dto.expansions)         args.push('--expansions', dto.expansions);
        if (dto.compactJson)        args.push('--compact-json');
        if (dto.quiet)              args.push('--quiet');
        if (dto.outputFile)         args.push('--output', dto.outputFile);
        cwd = scrapersDir;
        break;

      case JobType.HK_CARDS:
        command = 'python';
        args = [path.resolve(srcDir, 'hk_card_scraper.py')];
        if (dto.idRangeStart != null && dto.idRangeCount != null)
          args.push('--id-range', String(dto.idRangeStart), String(dto.idRangeCount));
        if (dto.cardIds)       args.push('--ids', dto.cardIds);
        if (dto.cacheHtml)     args.push('--cache-html');
        if (dto.cacheOnly)     args.push('--cache-only');
        if (dto.refreshCache)  args.push('--refresh-cache');
        if (dto.threads && dto.threads > 1) args.push('--threads', String(dto.threads));
        if (dto.quiet)         args.push('--quiet');
        if (dto.htmlCacheDir)  args.push('--html-cache-dir', dto.htmlCacheDir);
        if (dto.outputFile)    args.push('--output', dto.outputFile);
        cwd = scrapersDir;
        break;

      case JobType.EN_CARDS:
        command = 'python';
        args = [path.resolve(srcDir, 'english_card_scraper.py')];
        if (dto.idRangeStart != null && dto.idRangeCount != null)
          args.push('--id-range', String(dto.idRangeStart), String(dto.idRangeCount));
        if (dto.cardIds)      args.push('--ids', dto.cardIds);
        if (dto.cacheHtml)    args.push('--cache-html');
        if (dto.cacheOnly)    args.push('--cache-only');
        if (dto.refreshCache) args.push('--refresh-cache');
        if (dto.threads && dto.threads > 1) args.push('--threads', String(dto.threads));
        if (dto.quiet)        args.push('--quiet');
        if (dto.outputFile)   args.push('--output', dto.outputFile);
        cwd = scrapersDir;
        break;

      case JobType.CARD_IMPORT:
        command = 'npx';
        args = ['tsx', 'scrapers/import-cards-direct.ts'];
        if (dto.baseDir)          args.push(dto.baseDir);
        if (dto.regionOrPattern)  args.push(dto.regionOrPattern);
        break;

      case JobType.MARKET_PRICES:
        command = 'npx';
        args = ['tsx', 'scrapers/import-market-prices.ts'];
        if (dto.dryRun)       args.push('--dry-run');
        if (dto.verbose)      args.push('--verbose');
        if (dto.marketFile)   args.push(`--file=${dto.marketFile}`);
        break;

      case JobType.SEED_TOURNAMENTS:
        command = 'npx';
        args = ['tsx', 'scrapers/seed-tournaments.ts'];
        if (dto.seedAll)         args.push('--all');
        else if (dto.seedLimit)  args.push(`--limit=${dto.seedLimit}`);
        if (dto.eventId)         args.push(`--event-id=${dto.eventId}`);
        if (dto.refreshExisting) args.push('--refresh-existing');
        if (dto.sourceRoot)      args.push(`--source-root=${dto.sourceRoot}`);
        if (dto.dryRun)          args.push('--dry-run');
        if (dto.verbose)         args.push('--verbose');
        break;

      case JobType.RESYNC_DECKS:
        command = 'npx';
        args = ['tsx', 'scrapers/resync-deck-cards.ts'];
        if (dto.dryRun)         args.push('--dry-run');
        if (dto.processLimit)   args.push(`--limit=${dto.processLimit}`);
        if (dto.reportFile)     args.push(`--report-file=${dto.reportFile}`);
        break;

      case JobType.REMAP_DECKS:
        command = 'npx';
        args = ['tsx', 'scrapers/remap-deck-cards.ts'];
        if (dto.dryRun)   args.push('--dry-run');
        if (dto.verbose)  args.push('--verbose');
        if (dto.deckId)   args.push(`--deck-id=${dto.deckId}`);
        break;

      case JobType.REMOVE_DUPLICATES:
        command = 'npx';
        args = ['tsx', 'scrapers/remove-duplicates.ts'];
        if (dto.dryRun) args.push('--dry-run');
        break;

      default:
        command = 'python';
        args = [
          path.resolve(srcDir, 'jpevents_scraper.py'),
          '--skip-recent', String(dto.skipRecentCount ?? 50),
          '--region', dto.source ?? 'JP',
          '--max-events', String(dto.maxEvents ?? 50),
        ];
        cwd = scrapersDir;
    }

    this.logger.log(`Spawning: ${command} ${args.join(' ')}`);

    const proc = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PTCG_DB_URL: process.env.DATABASE_URL ?? '',
      },
    });

    this.processes.set(job.id, proc);

    const appendLog = (line: string) => {
      const entry: LogEntry = { ts: new Date().toISOString(), line };
      this.logBuffers.get(job.id)?.push(entry);
      // Trim buffer to last 1000 lines to prevent unbounded memory growth
      const buf = this.logBuffers.get(job.id);
      if (buf && buf.length > 1000) buf.splice(0, buf.length - 1000);
      emitter.emit('log', entry);
    };

    // Emit the full command as first log line so it appears in the UI
    appendLog(`$ ${command} ${args.join(' ')}`);
    appendLog(`cwd: ${cwd}`);

    proc.stdout?.on('data', (chunk: Buffer) => {
      chunk
        .toString()
        .split('\n')
        .filter(Boolean)
        .forEach(appendLog);
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      chunk
        .toString()
        .split('\n')
        .filter(Boolean)
        .forEach((line) => appendLog(`[STDERR] ${line}`));
    });

    proc.on('close', async (code) => {
      const success = code === 0;
      this.logger.log(`Scraper job ${job.id} finished with code ${code}`);
      appendLog(`Process exited with code ${code}`);
      emitter.emit('done', { code });

      const errorLines = this.logBuffers
        .get(job.id)
        ?.filter((e) => e.line.startsWith('[STDERR]'));

      await this.prisma.scraperJob.update({
        where: { id: job.id },
        data: {
          status: success ? 'SUCCESS' : 'FAILED',
          completedAt: new Date(),
          errors: errorLines as any,
        },
      });

      this.processes.delete(job.id);
    });

    return job;
  }

  async cancelJob(id: string) {
    const job = await this.prisma.scraperJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException(`ScraperJob ${id} not found`);

    const proc = this.processes.get(id);
    if (proc) {
      proc.kill('SIGTERM');
      this.processes.delete(id);
    }

    await this.prisma.scraperJob.update({
      where: { id },
      data: { status: 'FAILED', completedAt: new Date() },
    });
  }
}
