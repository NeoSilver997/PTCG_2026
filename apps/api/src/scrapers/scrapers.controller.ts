import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Res,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { Observable, fromEvent, merge, of } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';
import { ScrapersService } from './scrapers.service';
import { CreateScraperJobDto } from './dto/create-scraper-job.dto';

@ApiTags('scraper-jobs')
@Controller('scraper-jobs')
export class ScrapersController {
  constructor(private readonly scrapersService: ScrapersService) {}

  @Get()
  @Throttle({ long: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'List all scraper jobs (latest 100)' })
  findAll(): Promise<Array<Record<string, unknown>>> {
    return this.scrapersService.findAll();
  }

  @Get(':id')
  @Throttle({ long: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'Get a scraper job with logs' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Param('id') id: string): Promise<Record<string, unknown>> {
    return this.scrapersService.findOne(id);
  }

  @Post()
  @Throttle({ short: { limit: 3, ttl: 3000 } })
  @ApiOperation({ summary: 'Start a new scraper job' })
  @HttpCode(HttpStatus.CREATED)
  start(@Body() dto: CreateScraperJobDto): Promise<Record<string, unknown>> {
    return this.scrapersService.startJob(dto);
  }

  @Delete(':id')
  @Throttle({ medium: { limit: 20, ttl: 10000 } })
  @ApiOperation({ summary: 'Cancel a running scraper job' })
  @HttpCode(HttpStatus.NO_CONTENT)
  cancel(@Param('id') id: string) {
    return this.scrapersService.cancelJob(id);
  }

  @Sse(':id/stream')
  @ApiOperation({ summary: 'SSE stream of live logs for a job' })
  streamLogs(@Param('id') id: string): Observable<MessageEvent> {
    const emitter = this.scrapersService.logEmitters.get(id);

    if (!emitter) {
      // Job not running — return existing logs as single event then close
      return new Observable((subscriber) => {
        this.scrapersService.findOne(id).then((job) => {
          subscriber.next({ data: { logs: job.logs, done: true } } as MessageEvent);
          subscriber.complete();
        });
      });
    }

    const log$ = fromEvent(emitter, 'log').pipe(
      map((entry) => ({ data: { log: entry } } as MessageEvent)),
    );

    const done$ = fromEvent(emitter, 'done').pipe(
      map((result) => ({ data: { done: true, result } } as MessageEvent)),
    );

    return merge(log$, done$);
  }
}
