import { Injectable, NotFoundException, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateScraperJobDto } from './dto/create-scraper-job.dto';
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
    const job = await this.prisma.scraperJob.create({
      data: {
        source: dto.source as any,
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    this.logBuffers.set(job.id, []);
    const emitter = new EventEmitter();
    this.logEmitters.set(job.id, emitter);

    this.logger.log(`Starting scraper job ${job.id} for region ${dto.source}`);

    // Resolve Python scraper path relative to workspace root
    const scraperPath = path.resolve(
      __dirname,
      '../../../../scrapers/src/jpevents_scraper.py',
    );

    const args = [
      scraperPath,
      '--skip-recent',
      String(dto.skipRecentCount ?? 50),
      '--region',
      dto.source,
    ];

    if (dto.forceReimport) {
      args.push('--force-reimport');
    }

    const proc = spawn('python', args, {
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
