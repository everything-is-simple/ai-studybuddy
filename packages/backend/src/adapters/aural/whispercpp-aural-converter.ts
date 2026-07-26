import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config, getWhisperCppEnvironment } from '../../config/env';
import { getClassCaptureTmpDir } from '../../db/paths';

export class WhisperCppAuralConverterError extends Error {
  constructor(
    public readonly code:
      | 'ASR_RUNTIME_UNAVAILABLE'
      | 'ASR_INVALID_AUDIO_FORMAT'
      | 'ASR_FILE_TOO_LARGE'
      | 'ASR_PROCESS_TIMEOUT'
      | 'ASR_TRANSCRIPTION_FAILED'
      | 'ASR_EMPTY_TRANSCRIPT',
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'WhisperCppAuralConverterError';
  }
}

export interface AuralUploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface AuralTranscript {
  text: string;
}

interface WhisperCppRuntime {
  cliPath: string;
  modelPath: string;
  timeoutMs: number;
  maxFileBytes: number;
}

interface WavFormat {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataSize: number;
}

function runtimeFromConfig(): WhisperCppRuntime {
  return {
    cliPath: config.localAsrWhisperCliPath,
    modelPath: config.localAsrWhisperModelPath,
    timeoutMs: config.localAsrWhisperTimeoutMs,
    maxFileBytes: config.localAsrWhisperMaxFileBytes,
  };
}

function readWavFormat(buffer: Buffer): WavFormat {
  if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new WhisperCppAuralConverterError('ASR_INVALID_AUDIO_FORMAT', 400, '仅支持 RIFF/WAVE PCM 音频');
  }
  let offset = 12;
  let format: Omit<WavFormat, 'dataSize'> | undefined;
  let dataSize: number | undefined;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;
    if (chunkEnd > buffer.length) {
      throw new WhisperCppAuralConverterError('ASR_INVALID_AUDIO_FORMAT', 400, 'WAV 文件不完整');
    }
    if (chunkId === 'fmt ') {
      if (chunkSize < 16) throw new WhisperCppAuralConverterError('ASR_INVALID_AUDIO_FORMAT', 400, 'WAV 格式块无效');
      format = {
        audioFormat: buffer.readUInt16LE(chunkStart),
        channels: buffer.readUInt16LE(chunkStart + 2),
        sampleRate: buffer.readUInt32LE(chunkStart + 4),
        bitsPerSample: buffer.readUInt16LE(chunkStart + 14),
      };
    } else if (chunkId === 'data') {
      dataSize = chunkSize;
    }
    offset = chunkEnd + (chunkSize % 2);
  }
  if (!format || dataSize === undefined || dataSize === 0) {
    throw new WhisperCppAuralConverterError('ASR_INVALID_AUDIO_FORMAT', 400, 'WAV 缺少有效音频数据');
  }
  if (format.audioFormat !== 1 || format.channels !== 1 || format.sampleRate !== 16000 || format.bitsPerSample !== 16 || dataSize % 2 !== 0) {
    throw new WhisperCppAuralConverterError(
      'ASR_INVALID_AUDIO_FORMAT',
      400,
      '仅支持 16 kHz、单声道、16-bit PCM WAV 音频'
    );
  }
  return { ...format, dataSize };
}

function getTranscriptFromJson(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { transcription?: Array<{ text?: unknown }> };
    const text = (parsed.transcription ?? [])
      .map((segment) => (typeof segment.text === 'string' ? segment.text : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text || ['[BLANK_AUDIO]', '[BLANK_AUDIO ]', '[ Silence ]'].includes(text)) {
      throw new WhisperCppAuralConverterError('ASR_EMPTY_TRANSCRIPT', 422, '未得到可编辑的转写文本');
    }
    return text;
  } catch (error) {
    if (error instanceof WhisperCppAuralConverterError) throw error;
    throw new WhisperCppAuralConverterError('ASR_TRANSCRIPTION_FAILED', 502, '本机转写输出无效');
  }
}

export class WhisperCppAuralConverter {
  constructor(
    private readonly runtime: WhisperCppRuntime = runtimeFromConfig(),
    private readonly spawnProcess: typeof spawn = spawn
  ) {}

  async transcribe(file: AuralUploadedFile): Promise<AuralTranscript> {
    if (!file || file.size <= 0 || file.buffer.length <= 0) {
      throw new WhisperCppAuralConverterError('ASR_INVALID_AUDIO_FORMAT', 400, '音频文件为空');
    }
    if (file.size !== file.buffer.length || file.size > this.runtime.maxFileBytes) {
      throw new WhisperCppAuralConverterError('ASR_FILE_TOO_LARGE', 413, '音频文件超过当前课堂转写大小限制');
    }
    const normalizedMime = file.mimetype.split(';')[0]?.trim().toLowerCase() ?? '';
    if (normalizedMime && normalizedMime !== 'audio/wav' && normalizedMime !== 'audio/x-wav' && normalizedMime !== 'application/octet-stream') {
      throw new WhisperCppAuralConverterError('ASR_INVALID_AUDIO_FORMAT', 400, '仅支持 WAV 音频文件');
    }
    if (!file.originalname.toLowerCase().endsWith('.wav')) {
      throw new WhisperCppAuralConverterError('ASR_INVALID_AUDIO_FORMAT', 400, '仅支持 .wav 音频文件');
    }
    readWavFormat(file.buffer);
    if (!this.runtime.cliPath || !this.runtime.modelPath || !fs.existsSync(this.runtime.cliPath) || !fs.existsSync(this.runtime.modelPath)) {
      throw new WhisperCppAuralConverterError('ASR_RUNTIME_UNAVAILABLE', 503, '本机课堂转写运行时尚未配置或不可用');
    }

    await fsp.mkdir(getClassCaptureTmpDir(), { recursive: true });
    const runDir = await fsp.mkdtemp(path.join(getClassCaptureTmpDir(), 'request-'));
    const inputPath = path.join(runDir, `${crypto.randomUUID()}.wav`);
    const outputBase = path.join(runDir, 'transcript');
    try {
      await fsp.writeFile(inputPath, file.buffer, { flag: 'wx' });
      await this.runCli(inputPath, outputBase);
      const json = await fsp.readFile(`${outputBase}.json`, 'utf8');
      return { text: getTranscriptFromJson(json) };
    } catch (error) {
      if (error instanceof WhisperCppAuralConverterError) throw error;
      throw new WhisperCppAuralConverterError('ASR_TRANSCRIPTION_FAILED', 502, '本机课堂转写失败');
    } finally {
      await fsp.rm(runDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => undefined);
    }
  }

  private runCli(inputPath: string, outputBase: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = ['-m', this.runtime.modelPath, '-f', inputPath, '-l', 'zh', '-ng', '-nt', '-nf', '-ojf', '-of', outputBase, '-nth', '0.60'];
      let settled = false;
      let timedOut = false;
      const settle = (callback: () => void) => {
        if (settled) return;
        settled = true;
        callback();
      };
      let child;
      try {
        child = this.spawnProcess(this.runtime.cliPath, args, {
          windowsHide: true,
          stdio: ['ignore', 'ignore', 'pipe'],
          env: getWhisperCppEnvironment({ tempRoot: path.dirname(inputPath) }),
        });
      } catch {
        reject(new WhisperCppAuralConverterError('ASR_RUNTIME_UNAVAILABLE', 503, '本机课堂转写运行时无法启动'));
        return;
      }
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, this.runtime.timeoutMs);
      child.stderr.on('data', () => undefined);
      child.on('error', () => {
        clearTimeout(timer);
        settle(() => reject(new WhisperCppAuralConverterError('ASR_RUNTIME_UNAVAILABLE', 503, '本机课堂转写运行时无法启动')));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (timedOut) {
          settle(() => reject(new WhisperCppAuralConverterError('ASR_PROCESS_TIMEOUT', 504, '本机课堂转写超时')));
          return;
        }
        if (code !== 0) {
          settle(() => reject(new WhisperCppAuralConverterError('ASR_TRANSCRIPTION_FAILED', 502, '本机课堂转写失败')));
          return;
        }
        settle(resolve);
      });
    });
  }
}
