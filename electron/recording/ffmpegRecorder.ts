import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';

export type RecordingBackend = 'ffmpeg';

export type RecordingTarget =
  | {
      kind: 'screen';
      boundsPx: { x: number; y: number; width: number; height: number };
      displayIndex?: number;
    }
  | {
      kind: 'window';
      title: string;
    };

export type StartRecordingOptions = {
  fps: number;
  outputPath: string;
  target: RecordingTarget;
};

export type RecordingProbe = {
  formatName?: string;
  durationSeconds?: number;
  sizeBytes?: number;
  video?: {
    codec?: string;
    width?: number;
    height?: number;
    avgFrameRate?: number;
    rFrameRate?: number;
    bitRate?: number;
    pixFmt?: string;
  };
};

export type StartRecordingResult = {
  success: boolean;
  backend: RecordingBackend;
  message?: string;
  ffmpegPath?: string;
  ffprobePath?: string;
  encoder?: string;
};

export type StopRecordingResult = {
  success: boolean;
  backend: RecordingBackend;
  message?: string;
  path?: string;
  probe?: RecordingProbe;
};

type RecorderConfig = {
  recordingsDir: string;
  ffmpegPath?: string;
  ffprobePath?: string;
};

type ActiveSession = {
  proc: ChildProcessWithoutNullStreams;
  outputPath: string;
  startedAt: number;
  encoder: string;
  ffmpegPath: string;
  ffprobePath: string;
};

function normalizeFps(fps: number): number {
  if (!Number.isFinite(fps) || fps <= 0) return 60;
  return Math.round(fps);
}

function ensureEven(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value);
  return rounded - (rounded % 2);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveBinary(explicitPath: string | undefined, fallback: string): Promise<string | null> {
  if (explicitPath && (await fileExists(explicitPath))) return explicitPath;
  return fallback;
}

async function probeEncoder(
  ffmpegPath: string,
  encoder: string,
  timeoutMs: number
): Promise<{ ok: boolean; error?: string }> {
  return await new Promise(resolve => {
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=128x128:rate=30',
      '-t',
      '0.2',
      '-c:v',
      encoder,
      '-f',
      'null',
      '-',
    ];

    const proc = spawn(ffmpegPath, args, { windowsHide: true });

    let stderr = '';
    const timer = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {
        // ignore
      }
      resolve({ ok: false, error: 'encoder probe timeout' });
    }, timeoutMs);

    proc.stderr.on('data', chunk => {
      stderr += String(chunk);
    });

    proc.on('error', err => {
      clearTimeout(timer);
      resolve({ ok: false, error: String(err) });
    });

    proc.on('close', code => {
      clearTimeout(timer);
      resolve({ ok: code === 0, error: code === 0 ? undefined : (stderr.trim() || `exit ${code ?? 'unknown'}`) });
    });
  });
}

async function selectEncoder(ffmpegPath: string): Promise<string> {
  const platform = process.platform;
  const candidates: string[] =
    platform === 'win32'
      ? ['h264_nvenc', 'h264_amf', 'h264_qsv', 'libx264']
      : platform === 'darwin'
        ? ['h264_videotoolbox', 'libx264']
        : ['libx264'];

  for (const encoder of candidates) {
    const { ok } = await probeEncoder(ffmpegPath, encoder, 4_000);
    if (ok) return encoder;
  }

  return 'libx264';
}

function buildVideoFilters(fps: number): string[] {
  const forcedFps = normalizeFps(fps);
  return [
    `fps=${forcedFps}`,
    'format=yuv420p',
    // 保证宽高为偶数，避免编码器因奇数尺寸失败
    'scale=trunc(iw/2)*2:trunc(ih/2)*2',
  ];
}

function buildEncoderArgs(encoder: string): string[] {
  switch (encoder) {
    case 'h264_nvenc':
      return [
        '-c:v',
        'h264_nvenc',
        '-preset',
        'p7',
        '-rc',
        'vbr',
        '-cq',
        '18',
        '-b:v',
        '0',
      ];
    case 'h264_videotoolbox':
      return [
        '-c:v',
        'h264_videotoolbox',
        // 以较高码率优先保证清晰度（接近无损）；具体码率仍会因设备能力调整
        '-b:v',
        '60000k',
      ];
    case 'h264_amf':
      return [
        '-c:v',
        'h264_amf',
        '-quality',
        'quality',
        '-rc',
        'cqp',
        '-qp_i',
        '18',
        '-qp_p',
        '18',
      ];
    case 'h264_qsv':
      return [
        '-c:v',
        'h264_qsv',
        '-global_quality',
        '18',
      ];
    case 'libx264':
    default:
      return [
        '-c:v',
        'libx264',
        // 作为软件回退，优先保证能跑满帧率，文件体积会更大
        '-preset',
        'ultrafast',
        '-crf',
        '18',
        '-tune',
        'stillimage',
      ];
  }
}

function buildCaptureArgs(target: RecordingTarget, fps: number): string[] {
  const forcedFps = normalizeFps(fps);
  const platform = process.platform;

  if (platform === 'win32') {
    if (target.kind === 'screen') {
      const width = ensureEven(target.boundsPx.width);
      const height = ensureEven(target.boundsPx.height);
      const x = Math.round(target.boundsPx.x);
      const y = Math.round(target.boundsPx.y);
      return [
        '-f',
        'gdigrab',
        '-framerate',
        String(forcedFps),
        '-draw_mouse',
        '1',
        '-offset_x',
        String(x),
        '-offset_y',
        String(y),
        '-video_size',
        `${width}x${height}`,
        '-i',
        'desktop',
      ];
    }

    if (target.kind === 'window') {
      const title = target.title?.trim();
      if (!title) {
        throw new Error('Invalid window title.');
      }
      // gdigrab 支持 title=xxx 方式按窗口标题捕获
      return [
        '-f',
        'gdigrab',
        '-framerate',
        String(forcedFps),
        '-draw_mouse',
        '1',
        '-i',
        `title=${title}`,
      ];
    }
  }

  if (platform === 'darwin') {
    if (target.kind === 'screen') {
      const index = typeof target.displayIndex === 'number' ? target.displayIndex : 0;
      // avfoundation 设备名通常是 “Capture screen N”
      const device = `Capture screen ${index}`;
      return [
        '-f',
        'avfoundation',
        '-framerate',
        String(forcedFps),
        '-i',
        `${device}:none`,
      ];
    }
  }

  throw new Error('Unsupported recording target for current platform.');
}

async function runFfprobe(ffprobePath: string, filePath: string, timeoutMs: number): Promise<RecordingProbe | null> {
  return await new Promise(resolve => {
    const args = [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath,
    ];

    const proc = spawn(ffprobePath, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {
        // ignore
      }
      resolve(null);
    }, timeoutMs);

    proc.stdout.on('data', chunk => {
      stdout += String(chunk);
    });
    proc.stderr.on('data', chunk => {
      stderr += String(chunk);
    });

    proc.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });

    proc.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) {
        console.warn('ffprobe failed:', stderr.trim());
        resolve(null);
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as unknown;
        const root =
          typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
        const format =
          typeof root.format === 'object' && root.format !== null
            ? (root.format as Record<string, unknown>)
            : ({} as Record<string, unknown>);
        const streams = Array.isArray(root.streams) ? root.streams : [];
        const rawVideoStream =
          streams.find(
            (value): value is Record<string, unknown> =>
              typeof value === 'object' &&
              value !== null &&
              (value as Record<string, unknown>).codec_type === 'video'
          ) ?? ({} as Record<string, unknown>);
        const videoStream = rawVideoStream;

        const parseRate = (value: string | undefined): number | undefined => {
          if (!value || typeof value !== 'string') return undefined;
          const [numStr, denStr] = value.split('/');
          const num = Number(numStr);
          const den = Number(denStr);
          if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return undefined;
          return num / den;
        };

        const sizeBytes = Number(format.size);
        const durationSeconds = Number(format.duration);
        const result: RecordingProbe = {
          formatName: typeof format.format_name === 'string' ? format.format_name : undefined,
          durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : undefined,
          sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : undefined,
          video: {
            codec: typeof videoStream.codec_name === 'string' ? videoStream.codec_name : undefined,
            width: Number.isFinite(Number(videoStream.width)) ? Number(videoStream.width) : undefined,
            height: Number.isFinite(Number(videoStream.height)) ? Number(videoStream.height) : undefined,
            avgFrameRate: parseRate(
              typeof videoStream.avg_frame_rate === 'string' ? videoStream.avg_frame_rate : undefined
            ),
            rFrameRate: parseRate(
              typeof videoStream.r_frame_rate === 'string' ? videoStream.r_frame_rate : undefined
            ),
            bitRate: Number.isFinite(Number(videoStream.bit_rate)) ? Number(videoStream.bit_rate) : undefined,
            pixFmt: typeof videoStream.pix_fmt === 'string' ? videoStream.pix_fmt : undefined,
          },
        };
        resolve(result);
      } catch (error) {
        console.warn('Failed to parse ffprobe output:', error);
        resolve(null);
      }
    });
  });
}

export class FfmpegRecorder {
  private config: RecorderConfig;
  private session: ActiveSession | null = null;
  private starting = false;
  private stopping = false;

  constructor(config: RecorderConfig) {
    this.config = config;
  }

  isRecording(): boolean {
    return this.session !== null;
  }

  async start(options: StartRecordingOptions): Promise<StartRecordingResult> {
    if (this.session || this.starting || this.stopping) {
      return { success: false, backend: 'ffmpeg', message: 'Recording already in progress.' };
    }

    this.starting = true;

    try {
      const ffmpegPath = await resolveBinary(
        this.config.ffmpegPath || process.env.OPENSCREEN_FFMPEG_PATH,
        'ffmpeg'
      );
      const ffprobePath = await resolveBinary(
        this.config.ffprobePath || process.env.OPENSCREEN_FFPROBE_PATH,
        'ffprobe'
      );

      if (!ffmpegPath) {
        return { success: false, backend: 'ffmpeg', message: 'FFmpeg not found.' };
      }
      if (!ffprobePath) {
        return { success: false, backend: 'ffmpeg', message: 'FFprobe not found.' };
      }

      const fps = normalizeFps(options.fps);
      const encoder = await selectEncoder(ffmpegPath);

      const outputDir = path.dirname(options.outputPath);
      await fs.mkdir(outputDir, { recursive: true });

      const captureArgs = buildCaptureArgs(options.target, fps);
      const vf = buildVideoFilters(fps).join(',');
      const args = [
        '-hide_banner',
        '-y',
        // 输出更稳定的 CFR
        ...captureArgs,
        '-vf',
        vf,
        ...buildEncoderArgs(encoder),
        '-movflags',
        '+faststart',
        options.outputPath,
      ];

      const proc = spawn(ffmpegPath, args, {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // 避免 stdout 缓冲区占满导致子进程阻塞（正常情况下 ffmpeg 不会输出大量 stdout）
      proc.stdout.on('data', () => {
        // ignore
      });

      let stderrBuffer = '';
      proc.stderr.on('data', chunk => {
        // 录制失败时这些日志非常关键；生产环境可考虑做节流或落盘
        const text = String(chunk);
        stderrBuffer += text;
        const trimmed = text.trim();
        if (trimmed) console.log('[ffmpeg]', trimmed);
      });

      return await new Promise(resolve => {
        const startedAt = Date.now();
        let settled = false;

        const settle = (result: StartRecordingResult) => {
          if (settled) return;
          settled = true;
          resolve(result);
        };

        const startupTimer = setTimeout(() => {
          // 录制任务预期会一直运行直到用户手动停止；若在启动窗口内就已退出（即便 exitCode=0），也应视为失败
          if (proc.exitCode !== null) {
            settle({
              success: false,
              backend: 'ffmpeg',
              message: stderrBuffer.trim() || `FFmpeg exited early with code ${proc.exitCode}.`,
            });
            return;
          }

          this.session = { proc, outputPath: options.outputPath, startedAt, encoder, ffmpegPath, ffprobePath };
          settle({ success: true, backend: 'ffmpeg', ffmpegPath, ffprobePath, encoder });
        }, 400);

        proc.on('error', error => {
          clearTimeout(startupTimer);
          settle({ success: false, backend: 'ffmpeg', message: String(error) });
        });

        proc.on('close', code => {
          if (!settled) {
            clearTimeout(startupTimer);
            settle({
              success: false,
              backend: 'ffmpeg',
              message: stderrBuffer.trim() || `FFmpeg exited with code ${code ?? 'unknown'}.`,
            });
            return;
          }

          // 若录制过程中 ffmpeg 意外退出，则清理 session
          if (this.session?.proc === proc && code !== null && code !== 0) {
            this.session = null;
          }
        });
      });
    } finally {
      this.starting = false;
    }
  }

  async stop(): Promise<StopRecordingResult> {
    if (!this.session) {
      return { success: false, backend: 'ffmpeg', message: 'No active recording session.' };
    }

    if (this.stopping) {
      return { success: false, backend: 'ffmpeg', message: 'Stop already in progress.' };
    }

    const activeSession = this.session;
    const { proc, outputPath, ffprobePath } = activeSession;
    this.stopping = true;

    const waitForExit = async (timeoutMs: number): Promise<number | null> => {
      return await new Promise(resolve => {
        const timer = setTimeout(() => resolve(null), timeoutMs);
        proc.once('close', code => {
          clearTimeout(timer);
          resolve(typeof code === 'number' ? code : null);
        });
      });
    };

    try {
      // 优雅停止：向 ffmpeg 发送 “q”
      try {
        proc.stdin.write('q');
        proc.stdin.end();
      } catch {
        // ignore
      }

      let exitCode = await waitForExit(6_000);
      if (exitCode === null) {
        try {
          proc.kill('SIGKILL');
        } catch {
          // ignore
        }
        exitCode = await waitForExit(3_000);
      }

      if (!(await fileExists(outputPath))) {
        return { success: false, backend: 'ffmpeg', message: 'Recording did not produce an output file.' };
      }

      const probe = await runFfprobe(ffprobePath, outputPath, 4_000);
      if (exitCode !== 0) {
        return {
          success: false,
          backend: 'ffmpeg',
          message: `FFmpeg exited with code ${exitCode ?? 'unknown'}.`,
          path: outputPath,
          probe: probe ?? undefined,
        };
      }

      return { success: true, backend: 'ffmpeg', path: outputPath, probe: probe ?? undefined };
    } catch (error) {
      return { success: false, backend: 'ffmpeg', message: String(error) };
    } finally {
      if (this.session?.proc === activeSession.proc) {
        this.session = null;
      }
      this.stopping = false;
    }
  }
}
