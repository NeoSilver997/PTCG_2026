import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CardExtractionDto, ExtractionResponseDto } from './dto/card-extraction.dto';
import { spawn } from 'child_process';
import * as http from 'http';
import { Rarity } from '@ptcg/database';

/**
 * Qwen-VL 推理服务
 * 
 * 负责调用 Python 微调模型进行卡牌图像文本提取
 * 支持两种模式:
 * 1. HTTP 模式：调用独立的 Python 推理服务（推荐）
 * 2. 子进程模式：直接运行 Python 脚本（备用）
 */
@Injectable()
export class QwenVlService {
  private readonly logger = new Logger(QwenVlService.name);
  private readonly inferenceServiceUrl: string;
  private readonly pythonScriptPath: string;
  private readonly confidenceThreshold: number;
  private readonly timeout: number;
  private readonly maxRetries: number;
  /** Ollama base URL, e.g. http://192.168.50.56:11434. When set, Ollama is tried first. */
  private readonly ollamaBaseUrl: string;
  /** Ollama model tag (default: qwen3-vl:latest based on 100% benchmark accuracy). */
  private readonly ollamaModel: string;

  private static readonly OLLAMA_PROMPTS: Record<string, string> = {
    'zh-HK': '請以 JSON 格式提取圖片中的寶可夢卡資訊，包含欄位：name（卡名）, hp（HP值）, type（屬性）, abilities（特性陣列）, attacks（招式陣列）, setCode（系列代碼）, cardNumber（卡片編號）, rarity（稀有度）',
    'ja-JP': 'このポケモンカードの情報をJSONで抽出してください。フィールド：name（カード名）, hp, type（タイプ）, abilities（特性の配列）, attacks（ワザの配列）, setCode（セット記号）, cardNumber（カード番号）, rarity（レアリティ）',
    'en-US': 'Extract all card information as JSON with fields: name, hp, type, abilities (array), attacks (array), setCode, cardNumber, rarity',
  };

  constructor(private configService: ConfigService) {
    this.inferenceServiceUrl = this.configService.get<string>(
      'QWEN_VL_INFERENCE_URL',
      'http://localhost:8000',
    );
    this.pythonScriptPath = this.configService.get<string>(
      'QWEN_VL_SCRIPT_PATH',
      './scripts/qwen-vl-finetune/inference_service.py',
    );
    this.confidenceThreshold = this.configService.get<number>(
      'QWEN_VL_CONFIDENCE_THRESHOLD',
      0.7,
    );
    this.timeout = this.configService.get<number>(
      'QWEN_VL_TIMEOUT',
      30000,
    );
    this.maxRetries = this.configService.get<number>(
      'QWEN_VL_MAX_RETRIES',
      2,
    );
    this.ollamaBaseUrl = this.configService.get<string>('OLLAMA_BASE_URL', '');
    this.ollamaModel = this.configService.get<string>('OLLAMA_MODEL', 'qwen3-vl:latest');
  }

  /**
   * 从图像提取卡牌信息
   * 
   * @param imageBuffer 图像 Buffer
   * @param language 语言 (ja-JP, zh-HK, en-US)
   * @returns 提取结果
   */
  async extractFromImage(
    imageBuffer: Buffer,
    language: string = 'en-US',
  ): Promise<ExtractionResponseDto> {
    this.logger.debug(`开始提取卡牌信息，语言：${language}`);

    let lastError: Error | null = null;

    // When OLLAMA_BASE_URL is configured, try Ollama first.
    // Fall back to the Python HTTP inference service.
    const backends: Array<() => Promise<ExtractionResponseDto>> = this.ollamaBaseUrl
      ? [
          () => this.extractViaOllama(imageBuffer, language),
          () => this.extractViaHttp(imageBuffer, language),
        ]
      : [() => this.extractViaHttp(imageBuffer, language)];

    for (const backend of backends) {
      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        try {
          const result = await backend();

          if (result.confidence < this.confidenceThreshold) {
            this.logger.warn(
              `低置信度结果：${result.confidence.toFixed(2)} < ${this.confidenceThreshold}`,
            );
            result.warnings = result.warnings || [];
            result.warnings.push(
              `低置信度：${result.confidence.toFixed(2)}，建议人工审核`,
            );
          }

          return result;
        } catch (error) {
          lastError = error;
          this.logger.warn(
            `提取失败 (尝试 ${attempt + 1}/${this.maxRetries + 1}): ${error.message}`,
          );

          if (attempt < this.maxRetries) {
            await this.sleep(1000 * (attempt + 1));
          }
        }
      }

      this.logger.warn(`Backend exhausted, trying next backend if available.`);
    }

    throw new HttpException(
      `卡牌提取失败：${lastError?.message}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  /**
   * 批量提取卡牌信息
   * 
   * @param imageBuffers 图像 Buffer 列表
   * @param language 语言
   * @returns 批量提取结果
   */
  async batchExtract(
    imageBuffers: Buffer[],
    language: string = 'en-US',
  ): Promise<{ results: ExtractionResponseDto[]; totalTimeMs: number }> {
    this.logger.debug(`批量提取 ${imageBuffers.length} 张卡牌`);

    const startTime = Date.now();
    const results: ExtractionResponseDto[] = [];

    // 并发处理（限制并发数）
    const concurrencyLimit = 3;
    for (let i = 0; i < imageBuffers.length; i += concurrencyLimit) {
      const batch = imageBuffers.slice(i, i + concurrencyLimit);
      const batchPromises = batch.map((buffer) =>
        this.extractFromImage(buffer, language).catch((error) => ({
          success: false,
          confidence: 0,
          inference_time_ms: 0,
          error: error.message,
        })),
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    const totalTimeMs = Date.now() - startTime;

    return {
      results,
      totalTimeMs,
    };
  }

  /**
   * Call the Ollama /api/generate endpoint with a vision model.
   *
   * Env vars:
   *   OLLAMA_BASE_URL  e.g. http://192.168.50.56:11434  (no trailing slash, no /v1)
   *   OLLAMA_MODEL     e.g. qwen3-vl:latest or llama3.2-vision:latest
   */
  private async extractViaOllama(
    imageBuffer: Buffer,
    language: string,
  ): Promise<ExtractionResponseDto> {
    const startTime = Date.now();
    const base64Image = imageBuffer.toString('base64');
    const prompt =
      QwenVlService.OLLAMA_PROMPTS[language] ??
      QwenVlService.OLLAMA_PROMPTS['en-US'];

    const response = await fetch(`${this.ollamaBaseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.ollamaModel,
        prompt,
        images: [base64Image],
        stream: false,
        options: { num_predict: 4096, temperature: 0.1 },
      }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Ollama ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = (await response.json()) as { response?: string };
    const rawText = data.response ?? '';

    const parsed = this.parseOllamaOutput(rawText);
    if (!parsed) {
      throw new Error(`Ollama returned non-JSON output: ${rawText.slice(0, 100)}`);
    }

    const inferenceTimeMs = Date.now() - startTime;
    const confidence = typeof parsed['confidence'] === 'number'
      ? Math.min(Math.max(parsed['confidence'] as number, 0), 1)
      : 0.85;

    const [setCode, cardNumber] = this.splitCardCode(
      (parsed['cardCode'] as string) ?? '',
    );

    this.logger.debug(
      `Ollama extracted: ${parsed['cardName']} | ${parsed['cardCode']} | ${parsed['rarity']} | ${inferenceTimeMs}ms`,
    );

    return {
      success: true,
      confidence,
      inference_time_ms: inferenceTimeMs,
      data: {
        name: (parsed['cardName'] as string) || undefined,
        setCode: (parsed['set'] as string) || setCode || undefined,
        cardNumber: cardNumber || undefined,
        rarity: (parsed['rarity'] as Rarity) || undefined,
      } as CardExtractionDto,
    };
  }

  /**
   * Strip <think>…</think> blocks emitted by reasoning models (qwen3-vl, etc.)
   * then locate and parse the first valid JSON object in the text.
   */
  private parseOllamaOutput(text: string): Record<string, unknown> | null {
    const stripped = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    for (const candidate of [stripped, text]) {
      // Direct parse
      try { return JSON.parse(candidate); } catch { /* continue */ }

      // Fenced code block
      const fenced = candidate.match(/```json\s*([\s\S]*?)\s*```/);
      if (fenced) try { return JSON.parse(fenced[1]); } catch { /* continue */ }

      // First {...} block
      const start = candidate.indexOf('{');
      const end = candidate.lastIndexOf('}') + 1;
      if (start >= 0 && end > start) {
        try { return JSON.parse(candidate.slice(start, end)); } catch { /* continue */ }
      }
    }
    return null;
  }

  /**
   * Split an Ollama-extracted card code like "SV4a 089/091" or "159/XY-P"
   * into [setCode, cardNumber]. Returns ['', code] when no set prefix is found.
   */
  private splitCardCode(code: string): [string, string] {
    const m = code.match(/^([A-Za-z][A-Za-z0-9]*)\s+(.+)$/);
    return m ? [m[1], m[2]] : ['', code];
  }

  /**
   * 通过 HTTP 调用推理服务
   */
  private async extractViaHttp(
    imageBuffer: Buffer,
    language: string,
  ): Promise<ExtractionResponseDto> {
    return new Promise((resolve, reject) => {
      const boundary = '----WebKitFormBoundary' + Math.random().toString(16);
      const bodyParts: Buffer[] = [];

      // 构建 multipart/form-data 请求体
      bodyParts.push(
        Buffer.from(`--${boundary}\r\n`),
      );
      bodyParts.push(
        Buffer.from(`Content-Disposition: form-data; name="image"; filename="card.jpg"\r\n`),
      );
      bodyParts.push(
        Buffer.from(`Content-Type: image/jpeg\r\n\r\n`),
      );
      bodyParts.push(imageBuffer);
      bodyParts.push(Buffer.from(`\r\n`));
      bodyParts.push(
        Buffer.from(`--${boundary}\r\n`),
      );
      bodyParts.push(
        Buffer.from(`Content-Disposition: form-data; name="language"\r\n\r\n`),
      );
      bodyParts.push(Buffer.from(language));
      bodyParts.push(Buffer.from(`\r\n`));
      bodyParts.push(Buffer.from(`--${boundary}--\r\n`));

      const body = Buffer.concat(bodyParts);

      const url = new URL(`${this.inferenceServiceUrl}/api/cards/extract-from-image`);
      url.searchParams.append('language', language);

      const options = {
        hostname: url.hostname,
        port: url.port || 8000,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
        timeout: this.timeout,
      };

      const req = http.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const response: ExtractionResponseDto = JSON.parse(data);
            resolve(response);
          } catch (error) {
            reject(new Error(`解析响应失败：${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`HTTP 请求失败：${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`请求超时 (${this.timeout}ms)`));
      });

      req.write(body);
      req.end();
    });
  }

  /**
   * 通过子进程调用 Python 脚本（备用模式）
   */
  private async extractViaSubprocess(
    imageBuffer: Buffer,
    language: string,
  ): Promise<ExtractionResponseDto> {
    return new Promise((resolve, reject) => {
      const base64Image = imageBuffer.toString('base64');

      const pythonProcess = spawn('python', [
        this.pythonScriptPath,
        '--extract',
        '--base64',
        base64Image,
        '--language',
        language,
      ]);

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        this.logger.debug(`Python stderr: ${data.toString()}`);
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const response: ExtractionResponseDto = JSON.parse(stdout);
            resolve(response);
          } catch (error) {
            reject(new Error(`解析 Python 输出失败：${error.message}`));
          }
        } else {
          reject(new Error(`Python 进程退出码：${code}, ${stderr}`));
        }
      });

      pythonProcess.on('error', (error) => {
        reject(new Error(`启动 Python 进程失败：${error.message}`));
      });
    });
  }

  /**
   * 检查推理服务健康状态
   */
  async healthCheck(): Promise<{ healthy: boolean; message: string; backend?: string }> {
    // Check Ollama first if configured
    if (this.ollamaBaseUrl) {
      try {
        const r = await fetch(`${this.ollamaBaseUrl}/api/tags`, {
          signal: AbortSignal.timeout(5000),
        });
        if (r.ok) {
          const data = (await r.json()) as { models?: Array<{ name: string }> };
          const models = data.models?.map((m) => m.name) ?? [];
          const modelReady = models.includes(this.ollamaModel);
          return {
            healthy: modelReady,
            backend: `ollama:${this.ollamaModel}`,
            message: modelReady
              ? `Ollama ready (${this.ollamaModel})`
              : `Ollama reachable but model '${this.ollamaModel}' not found. Available: ${models.slice(0, 5).join(', ')}`,
          };
        }
      } catch (error) {
        this.logger.warn(`Ollama health check failed: ${error.message}`);
      }
    }

    // Fall back to Python HTTP service check
    try {
      const result = await this.fetchHealth();
      return {
        healthy: result.model_loaded === true,
        backend: 'python-http',
        message: result.model_loaded ? '推理服务正常' : '推理服务就绪但模型未加载',
      };
    } catch (error) {
      return {
        healthy: false,
        backend: 'none',
        message: `推理服务不可用：${error.message}`,
      };
    }
  }

  private async fetchHealth(): Promise<{ model_loaded: boolean }> {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.inferenceServiceUrl}/health`);

      http
        .get(url.toString(), (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (error) {
              reject(new Error(`解析健康检查响应失败`));
            }
          });
        })
        .on('error', (error) => {
          reject(error);
        })
        .setTimeout(5000, () => {
          reject(new Error('健康检查超时'));
        });
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
