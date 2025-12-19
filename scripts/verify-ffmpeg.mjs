import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const run = async (cmd, args, { timeoutMs = 60_000 } = {}) => {
  return await new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {
        // ignore
      }
      reject(new Error(`${cmd} 超时（${timeoutMs}ms）`));
    }, timeoutMs);

    proc.stdout.on('data', chunk => {
      stdout += String(chunk);
    });
    proc.stderr.on('data', chunk => {
      stderr += String(chunk);
    });

    proc.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on('close', code => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
};

const parseRate = (value) => {
  if (!value || typeof value !== 'string') return null;
  const [n, d] = value.split('/');
  const num = Number(n);
  const den = Number(d);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  return num / den;
};

const main = async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openscreen-ffmpeg-check-'));
  const outPath = path.join(tmpDir, `ffmpeg-check-${Date.now()}.mp4`);

  try {
    const width = 1280;
    const height = 720;
    const fps = 60;
    const durationSeconds = 2;

    const ffmpegArgs = [
      '-hide_banner',
      '-y',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      `testsrc2=size=${width}x${height}:rate=${fps}`,
      '-t',
      String(durationSeconds),
      '-vf',
      `fps=${fps},format=yuv420p,scale=trunc(iw/2)*2:trunc(ih/2)*2`,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '18',
      '-tune',
      'stillimage',
      '-movflags',
      '+faststart',
      outPath,
    ];

    const ffmpeg = await run('ffmpeg', ffmpegArgs, { timeoutMs: 60_000 });
    if (ffmpeg.code !== 0) {
      throw new Error(`ffmpeg 执行失败（code=${ffmpeg.code}）\n${ffmpeg.stderr.trim()}`);
    }

    const ffprobeArgs = [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      outPath,
    ];
    const ffprobe = await run('ffprobe', ffprobeArgs, { timeoutMs: 15_000 });
    if (ffprobe.code !== 0) {
      throw new Error(`ffprobe 执行失败（code=${ffprobe.code}）\n${ffprobe.stderr.trim()}`);
    }

    const json = JSON.parse(ffprobe.stdout);
    const streams = Array.isArray(json.streams) ? json.streams : [];
    const video = streams.find(s => s?.codec_type === 'video') ?? {};
    const format = json?.format ?? {};

    const actualWidth = Number(video.width);
    const actualHeight = Number(video.height);
    const avgFps = parseRate(video.avg_frame_rate);
    const codec = video.codec_name;
    const duration = Number(format.duration);

    const errors = [];
    if (codec !== 'h264') errors.push(`编码器不符合预期：${codec}`);
    if (actualWidth !== width || actualHeight !== height) {
      errors.push(`分辨率不符合预期：${actualWidth}x${actualHeight}`);
    }
    if (avgFps === null || Math.abs(avgFps - fps) > 0.5) errors.push(`帧率不符合预期：${avgFps}`);
    if (!Number.isFinite(duration) || Math.abs(duration - durationSeconds) > 0.6) {
      errors.push(`时长不符合预期：${duration}`);
    }

    if (errors.length > 0) {
      throw new Error(`FFmpeg 冒烟测试未通过：\n- ${errors.join('\n- ')}`);
    }

    console.log('FFmpeg/FFprobe 冒烟测试通过');
    console.log(`- 输出：${outPath}`);
    console.log(`- codec=${codec} size=${actualWidth}x${actualHeight} avgFps=${avgFps} duration=${duration}`);
  } finally {
    // 清理临时目录（即使失败也尽量清理）
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
};

main().catch(err => {
  console.error('FFmpeg/FFprobe 冒烟测试失败');
  console.error(String(err?.stack || err));
  process.exitCode = 1;
});
