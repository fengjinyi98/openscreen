var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { ipcMain, screen, BrowserWindow, app, desktopCapturer, shell, dialog, nativeImage, Tray, Menu } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs, { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL$1 = process.env["VITE_DEV_SERVER_URL"];
const RENDERER_DIST$1 = path.join(APP_ROOT, "dist");
let hudOverlayWindow = null;
ipcMain.on("hud-overlay-hide", () => {
  if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
    hudOverlayWindow.minimize();
  }
});
function createHudOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;
  const windowWidth = 500;
  const windowHeight = 100;
  const x = Math.floor(workArea.x + (workArea.width - windowWidth) / 2);
  const y = Math.floor(workArea.y + workArea.height - windowHeight - 5);
  const win = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth: 500,
    maxWidth: 500,
    minHeight: 100,
    maxHeight: 100,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs"),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  hudOverlayWindow = win;
  win.on("closed", () => {
    if (hudOverlayWindow === win) {
      hudOverlayWindow = null;
    }
  });
  if (VITE_DEV_SERVER_URL$1) {
    win.loadURL(VITE_DEV_SERVER_URL$1 + "?windowType=hud-overlay");
  } else {
    win.loadFile(path.join(RENDERER_DIST$1, "index.html"), {
      query: { windowType: "hud-overlay" }
    });
  }
  return win;
}
function createEditorWindow() {
  const isMac = process.platform === "darwin";
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    ...isMac && {
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 12, y: 12 }
    },
    transparent: false,
    resizable: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    title: "OpenScreen",
    backgroundColor: "#000000",
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      backgroundThrottling: false
    }
  });
  win.maximize();
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL$1) {
    win.loadURL(VITE_DEV_SERVER_URL$1 + "?windowType=editor");
  } else {
    win.loadFile(path.join(RENDERER_DIST$1, "index.html"), {
      query: { windowType: "editor" }
    });
  }
  return win;
}
function createSourceSelectorWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width: 620,
    height: 420,
    minHeight: 350,
    maxHeight: 500,
    x: Math.round((width - 620) / 2),
    y: Math.round((height - 420) / 2),
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs"),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  if (VITE_DEV_SERVER_URL$1) {
    win.loadURL(VITE_DEV_SERVER_URL$1 + "?windowType=source-selector");
  } else {
    win.loadFile(path.join(RENDERER_DIST$1, "index.html"), {
      query: { windowType: "source-selector" }
    });
  }
  return win;
}
function interpolate(template, values) {
  if (!values) return template;
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => {
    const value = values[key];
    return value === void 0 || value === null ? "" : String(value);
  });
}
function normalizeLanguage(value) {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower === "zh" || lower === "zh-cn" || lower.startsWith("zh-")) return "zh-CN";
  if (lower === "en" || lower.startsWith("en-")) return "en";
  return null;
}
function getAppLanguage() {
  var _a, _b;
  try {
    return normalizeLanguage((_b = (_a = app).getLocale) == null ? void 0 : _b.call(_a)) ?? "en";
  } catch {
    return "en";
  }
}
const zhCN = {
  "Recording: {{source}}": "正在录制：{{source}}",
  "Stop Recording": "停止录制",
  "Open": "打开",
  "Quit": "退出",
  "Save Exported Video": "保存导出的视频",
  "MP4 Video": "MP4 视频",
  "Export cancelled": "已取消导出",
  "Video exported successfully": "视频导出成功",
  "Failed to save exported video": "保存导出的视频失败",
  "Select Video File": "选择视频文件",
  "Video Files": "视频文件",
  "All Files": "所有文件",
  "Failed to open file picker": "打开文件选择器失败",
  "Video stored successfully": "视频保存成功",
  "Failed to store video": "保存视频失败",
  "No recorded video found": "未找到录制视频",
  "Failed to get video path": "获取视频路径失败",
  "Please select a source to record": "请先选择要录制的来源",
  "Invalid recording source": "录制来源无效",
  "FFmpeg recording currently supports only screen sources.": "FFmpeg 录制目前仅支持屏幕来源。",
  "FFmpeg recording is not supported on this platform yet.": "FFmpeg 录制暂不支持当前平台。",
  "Failed to start recording": "开始录制失败",
  "Failed to stop recording": "停止录制失败",
  "Screen": "屏幕"
};
function tMain(key, values) {
  const language = getAppLanguage();
  const template = language === "zh-CN" ? zhCN[key] ?? key : key;
  return interpolate(template, values);
}
function normalizeFps(fps) {
  if (!Number.isFinite(fps) || fps <= 0) return 60;
  return Math.round(fps);
}
function ensureEven(value) {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value);
  return rounded - rounded % 2;
}
async function fileExists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
async function resolveBinary(explicitPath, fallback) {
  if (explicitPath && await fileExists(explicitPath)) return explicitPath;
  return fallback;
}
async function probeEncoder(ffmpegPath, encoder, timeoutMs) {
  return await new Promise((resolve) => {
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=128x128:rate=30",
      "-t",
      "0.2",
      "-c:v",
      encoder,
      "-f",
      "null",
      "-"
    ];
    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
      }
      resolve({ ok: false, error: "encoder probe timeout" });
    }, timeoutMs);
    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: String(err) });
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, error: code === 0 ? void 0 : stderr.trim() || `exit ${code ?? "unknown"}` });
    });
  });
}
async function selectEncoder(ffmpegPath) {
  const platform = process.platform;
  const candidates = platform === "win32" ? ["h264_nvenc", "h264_amf", "h264_qsv", "libx264"] : platform === "darwin" ? ["h264_videotoolbox", "libx264"] : ["libx264"];
  for (const encoder of candidates) {
    const { ok } = await probeEncoder(ffmpegPath, encoder, 4e3);
    if (ok) return encoder;
  }
  return "libx264";
}
function buildVideoFilters(fps) {
  const forcedFps = normalizeFps(fps);
  return [
    `fps=${forcedFps}`,
    "format=yuv420p",
    // 保证宽高为偶数，避免编码器因奇数尺寸失败
    "scale=trunc(iw/2)*2:trunc(ih/2)*2"
  ];
}
function buildEncoderArgs(encoder) {
  switch (encoder) {
    case "h264_nvenc":
      return [
        "-c:v",
        "h264_nvenc",
        "-preset",
        "p7",
        "-rc",
        "vbr",
        "-cq",
        "18",
        "-b:v",
        "0"
      ];
    case "h264_videotoolbox":
      return [
        "-c:v",
        "h264_videotoolbox",
        // 以较高码率优先保证清晰度（接近无损）；具体码率仍会因设备能力调整
        "-b:v",
        "60000k"
      ];
    case "h264_amf":
      return [
        "-c:v",
        "h264_amf",
        "-quality",
        "quality",
        "-rc",
        "cqp",
        "-qp_i",
        "18",
        "-qp_p",
        "18"
      ];
    case "h264_qsv":
      return [
        "-c:v",
        "h264_qsv",
        "-global_quality",
        "18"
      ];
    case "libx264":
    default:
      return [
        "-c:v",
        "libx264",
        // 作为软件回退，优先保证能跑满帧率，文件体积会更大
        "-preset",
        "ultrafast",
        "-crf",
        "18",
        "-tune",
        "stillimage"
      ];
  }
}
function buildCaptureArgs(target, fps) {
  var _a;
  const forcedFps = normalizeFps(fps);
  const platform = process.platform;
  if (platform === "win32") {
    if (target.kind === "screen") {
      const width = ensureEven(target.boundsPx.width);
      const height = ensureEven(target.boundsPx.height);
      const x = Math.round(target.boundsPx.x);
      const y = Math.round(target.boundsPx.y);
      return [
        "-f",
        "gdigrab",
        "-framerate",
        String(forcedFps),
        "-draw_mouse",
        "1",
        "-offset_x",
        String(x),
        "-offset_y",
        String(y),
        "-video_size",
        `${width}x${height}`,
        "-i",
        "desktop"
      ];
    }
    if (target.kind === "window") {
      const title = (_a = target.title) == null ? void 0 : _a.trim();
      if (!title) {
        throw new Error("Invalid window title.");
      }
      return [
        "-f",
        "gdigrab",
        "-framerate",
        String(forcedFps),
        "-draw_mouse",
        "1",
        "-i",
        `title=${title}`
      ];
    }
  }
  if (platform === "darwin") {
    if (target.kind === "screen") {
      const index = typeof target.displayIndex === "number" ? target.displayIndex : 0;
      const device = `Capture screen ${index}`;
      return [
        "-f",
        "avfoundation",
        "-framerate",
        String(forcedFps),
        "-i",
        `${device}:none`
      ];
    }
  }
  throw new Error("Unsupported recording target for current platform.");
}
async function runFfprobe(ffprobePath, filePath, timeoutMs) {
  return await new Promise((resolve) => {
    const args = [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      filePath
    ];
    const proc = spawn(ffprobePath, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
      }
      resolve(null);
    }, timeoutMs);
    proc.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        console.warn("ffprobe failed:", stderr.trim());
        resolve(null);
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        const root = typeof parsed === "object" && parsed !== null ? parsed : {};
        const format = typeof root.format === "object" && root.format !== null ? root.format : {};
        const streams = Array.isArray(root.streams) ? root.streams : [];
        const rawVideoStream = streams.find(
          (value) => typeof value === "object" && value !== null && value.codec_type === "video"
        ) ?? {};
        const videoStream = rawVideoStream;
        const parseRate = (value) => {
          if (!value || typeof value !== "string") return void 0;
          const [numStr, denStr] = value.split("/");
          const num = Number(numStr);
          const den = Number(denStr);
          if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return void 0;
          return num / den;
        };
        const sizeBytes = Number(format.size);
        const durationSeconds = Number(format.duration);
        const result = {
          formatName: typeof format.format_name === "string" ? format.format_name : void 0,
          durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : void 0,
          sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : void 0,
          video: {
            codec: typeof videoStream.codec_name === "string" ? videoStream.codec_name : void 0,
            width: Number.isFinite(Number(videoStream.width)) ? Number(videoStream.width) : void 0,
            height: Number.isFinite(Number(videoStream.height)) ? Number(videoStream.height) : void 0,
            avgFrameRate: parseRate(
              typeof videoStream.avg_frame_rate === "string" ? videoStream.avg_frame_rate : void 0
            ),
            rFrameRate: parseRate(
              typeof videoStream.r_frame_rate === "string" ? videoStream.r_frame_rate : void 0
            ),
            bitRate: Number.isFinite(Number(videoStream.bit_rate)) ? Number(videoStream.bit_rate) : void 0,
            pixFmt: typeof videoStream.pix_fmt === "string" ? videoStream.pix_fmt : void 0
          }
        };
        resolve(result);
      } catch (error) {
        console.warn("Failed to parse ffprobe output:", error);
        resolve(null);
      }
    });
  });
}
class FfmpegRecorder {
  constructor(config) {
    __publicField(this, "config");
    __publicField(this, "session", null);
    __publicField(this, "starting", false);
    __publicField(this, "stopping", false);
    this.config = config;
  }
  isRecording() {
    return this.session !== null;
  }
  async start(options) {
    if (this.session || this.starting || this.stopping) {
      return { success: false, backend: "ffmpeg", message: "Recording already in progress." };
    }
    this.starting = true;
    try {
      const ffmpegPath = await resolveBinary(
        this.config.ffmpegPath || process.env.OPENSCREEN_FFMPEG_PATH,
        "ffmpeg"
      );
      const ffprobePath = await resolveBinary(
        this.config.ffprobePath || process.env.OPENSCREEN_FFPROBE_PATH,
        "ffprobe"
      );
      if (!ffmpegPath) {
        return { success: false, backend: "ffmpeg", message: "FFmpeg not found." };
      }
      if (!ffprobePath) {
        return { success: false, backend: "ffmpeg", message: "FFprobe not found." };
      }
      const fps = normalizeFps(options.fps);
      const encoder = await selectEncoder(ffmpegPath);
      const outputDir = path.dirname(options.outputPath);
      await fs.mkdir(outputDir, { recursive: true });
      const captureArgs = buildCaptureArgs(options.target, fps);
      const vf = buildVideoFilters(fps).join(",");
      const args = [
        "-hide_banner",
        "-y",
        // 输出更稳定的 CFR
        ...captureArgs,
        "-vf",
        vf,
        ...buildEncoderArgs(encoder),
        "-movflags",
        "+faststart",
        options.outputPath
      ];
      const proc = spawn(ffmpegPath, args, {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"]
      });
      proc.stdout.on("data", () => {
      });
      let stderrBuffer = "";
      proc.stderr.on("data", (chunk) => {
        const text = String(chunk);
        stderrBuffer += text;
        const trimmed = text.trim();
        if (trimmed) console.log("[ffmpeg]", trimmed);
      });
      return await new Promise((resolve) => {
        const startedAt = Date.now();
        let settled = false;
        const settle = (result) => {
          if (settled) return;
          settled = true;
          resolve(result);
        };
        const startupTimer = setTimeout(() => {
          if (proc.exitCode !== null) {
            settle({
              success: false,
              backend: "ffmpeg",
              message: stderrBuffer.trim() || `FFmpeg exited early with code ${proc.exitCode}.`
            });
            return;
          }
          this.session = { proc, outputPath: options.outputPath, startedAt, encoder, ffmpegPath, ffprobePath };
          settle({ success: true, backend: "ffmpeg", ffmpegPath, ffprobePath, encoder });
        }, 400);
        proc.on("error", (error) => {
          clearTimeout(startupTimer);
          settle({ success: false, backend: "ffmpeg", message: String(error) });
        });
        proc.on("close", (code) => {
          var _a;
          if (!settled) {
            clearTimeout(startupTimer);
            settle({
              success: false,
              backend: "ffmpeg",
              message: stderrBuffer.trim() || `FFmpeg exited with code ${code ?? "unknown"}.`
            });
            return;
          }
          if (((_a = this.session) == null ? void 0 : _a.proc) === proc && code !== null && code !== 0) {
            this.session = null;
          }
        });
      });
    } finally {
      this.starting = false;
    }
  }
  async stop() {
    var _a;
    if (!this.session) {
      return { success: false, backend: "ffmpeg", message: "No active recording session." };
    }
    if (this.stopping) {
      return { success: false, backend: "ffmpeg", message: "Stop already in progress." };
    }
    const activeSession = this.session;
    const { proc, outputPath, ffprobePath } = activeSession;
    this.stopping = true;
    const waitForExit = async (timeoutMs) => {
      return await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), timeoutMs);
        proc.once("close", (code) => {
          clearTimeout(timer);
          resolve(typeof code === "number" ? code : null);
        });
      });
    };
    try {
      try {
        proc.stdin.write("q");
        proc.stdin.end();
      } catch {
      }
      let exitCode = await waitForExit(6e3);
      if (exitCode === null) {
        try {
          proc.kill("SIGKILL");
        } catch {
        }
        exitCode = await waitForExit(3e3);
      }
      if (!await fileExists(outputPath)) {
        return { success: false, backend: "ffmpeg", message: "Recording did not produce an output file." };
      }
      const probe = await runFfprobe(ffprobePath, outputPath, 4e3);
      if (exitCode !== 0) {
        return {
          success: false,
          backend: "ffmpeg",
          message: `FFmpeg exited with code ${exitCode ?? "unknown"}.`,
          path: outputPath,
          probe: probe ?? void 0
        };
      }
      return { success: true, backend: "ffmpeg", path: outputPath, probe: probe ?? void 0 };
    } catch (error) {
      return { success: false, backend: "ffmpeg", message: String(error) };
    } finally {
      if (((_a = this.session) == null ? void 0 : _a.proc) === activeSession.proc) {
        this.session = null;
      }
      this.stopping = false;
    }
  }
}
let selectedSource = null;
function registerIpcHandlers(createEditorWindow2, createSourceSelectorWindow2, getMainWindow, getSourceSelectorWindow, onRecordingStateChange) {
  const ffmpegRecorder = new FfmpegRecorder({ recordingsDir: RECORDINGS_DIR });
  ipcMain.handle("get-sources", async (_, opts) => {
    const sources = await desktopCapturer.getSources(opts);
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      display_id: source.display_id,
      thumbnail: source.thumbnail ? source.thumbnail.toDataURL() : null,
      appIcon: source.appIcon ? source.appIcon.toDataURL() : null
    }));
  });
  ipcMain.handle("select-source", (_, source) => {
    selectedSource = source;
    const sourceSelectorWin = getSourceSelectorWindow();
    if (sourceSelectorWin) {
      sourceSelectorWin.close();
    }
    return selectedSource;
  });
  ipcMain.handle("get-selected-source", () => {
    return selectedSource;
  });
  ipcMain.handle("open-source-selector", () => {
    const sourceSelectorWin = getSourceSelectorWindow();
    if (sourceSelectorWin) {
      sourceSelectorWin.focus();
      return;
    }
    createSourceSelectorWindow2();
  });
  ipcMain.handle("switch-to-editor", () => {
    const mainWin = getMainWindow();
    if (mainWin) {
      mainWin.close();
    }
    createEditorWindow2();
  });
  ipcMain.handle("start-recording", async (_, options) => {
    try {
      if (!selectedSource) {
        return { success: false, backend: "ffmpeg", message: tMain("Please select a source to record") };
      }
      if (!selectedSource.id || typeof selectedSource.id !== "string") {
        return { success: false, backend: "ffmpeg", message: tMain("Invalid recording source") };
      }
      const platform = process.platform;
      const sourceId = selectedSource.id;
      const isScreenSource = sourceId.startsWith("screen:");
      const isWindowSource = sourceId.startsWith("window:");
      if (platform === "darwin" && !isScreenSource) {
        return {
          success: false,
          backend: "ffmpeg",
          message: tMain("FFmpeg recording currently supports only screen sources.")
        };
      }
      if (platform === "win32" && !isScreenSource && !isWindowSource) {
        return { success: false, backend: "ffmpeg", message: tMain("Invalid recording source") };
      }
      if (platform !== "win32" && platform !== "darwin") {
        return {
          success: false,
          backend: "ffmpeg",
          message: tMain("FFmpeg recording is not supported on this platform yet.")
        };
      }
      const fps = Number(options == null ? void 0 : options.fps) || 60;
      const timestamp = Date.now();
      const fileName = `recording-${timestamp}.mp4`;
      const outputPath = path.join(RECORDINGS_DIR, fileName);
      const startResult = isScreenSource ? await (async () => {
        const displays = screen.getAllDisplays();
        const displayId = String(selectedSource.display_id ?? "");
        const displayIndex = displays.findIndex((d) => String(d.id) === displayId);
        const display = displayIndex >= 0 ? displays[displayIndex] : screen.getPrimaryDisplay();
        const scaleFactor = Number(display.scaleFactor) || 1;
        const bounds = display.bounds;
        const boundsPx = {
          x: Math.round(bounds.x * scaleFactor),
          y: Math.round(bounds.y * scaleFactor),
          width: Math.round(bounds.width * scaleFactor),
          height: Math.round(bounds.height * scaleFactor)
        };
        boundsPx.width = boundsPx.width - boundsPx.width % 2;
        boundsPx.height = boundsPx.height - boundsPx.height % 2;
        return await ffmpegRecorder.start({
          fps,
          outputPath,
          target: {
            kind: "screen",
            boundsPx,
            displayIndex: displayIndex >= 0 ? displayIndex : 0
          }
        });
      })() : await (async () => {
        const candidates = [selectedSource == null ? void 0 : selectedSource.rawName, selectedSource == null ? void 0 : selectedSource.name].filter((value) => typeof value === "string").map((value) => value.trim()).filter(Boolean);
        const uniqueTitles = Array.from(new Set(candidates));
        if (uniqueTitles.length === 0) {
          return { success: false, backend: "ffmpeg", message: tMain("Invalid recording source") };
        }
        let result = null;
        for (const title of uniqueTitles) {
          result = await ffmpegRecorder.start({ fps, outputPath, target: { kind: "window", title } });
          if (result.success) break;
        }
        return result ?? { success: false, backend: "ffmpeg", message: tMain("Invalid recording source") };
      })();
      if (startResult.success && onRecordingStateChange) {
        const sourceName = (selectedSource == null ? void 0 : selectedSource.name) || tMain("Screen");
        onRecordingStateChange(true, sourceName);
      }
      return startResult;
    } catch (error) {
      console.error("Failed to start ffmpeg recording:", error);
      return { success: false, backend: "ffmpeg", message: tMain("Failed to start recording") };
    }
  });
  ipcMain.handle("stop-recording", async () => {
    try {
      const stopResult = await ffmpegRecorder.stop();
      if (onRecordingStateChange) {
        const sourceName = (selectedSource == null ? void 0 : selectedSource.name) || tMain("Screen");
        onRecordingStateChange(false, sourceName);
      }
      return stopResult;
    } catch (error) {
      console.error("Failed to stop ffmpeg recording:", error);
      return { success: false, backend: "ffmpeg", message: tMain("Failed to stop recording") };
    }
  });
  ipcMain.handle("store-recorded-video", async (_, videoData, fileName) => {
    try {
      const videoPath = path.join(RECORDINGS_DIR, fileName);
      await fs.writeFile(videoPath, Buffer.from(videoData));
      currentVideoPath = videoPath;
      return {
        success: true,
        path: videoPath,
        message: tMain("Video stored successfully")
      };
    } catch (error) {
      console.error("Failed to store video:", error);
      return {
        success: false,
        message: tMain("Failed to store video"),
        error: String(error)
      };
    }
  });
  ipcMain.handle("get-recorded-video-path", async () => {
    try {
      const files = await fs.readdir(RECORDINGS_DIR);
      const videoFiles = files.filter((file) => file.endsWith(".webm") || file.endsWith(".mp4"));
      if (videoFiles.length === 0) {
        return { success: false, message: tMain("No recorded video found") };
      }
      const latestVideo = videoFiles.sort().reverse()[0];
      const videoPath = path.join(RECORDINGS_DIR, latestVideo);
      return { success: true, path: videoPath };
    } catch (error) {
      console.error("Failed to get video path:", error);
      return { success: false, message: tMain("Failed to get video path"), error: String(error) };
    }
  });
  ipcMain.handle("set-recording-state", (_, recording) => {
    const source = selectedSource || { name: tMain("Screen") };
    if (onRecordingStateChange) {
      onRecordingStateChange(recording, source.name);
    }
  });
  ipcMain.handle("open-external-url", async (_, url) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error("Failed to open URL:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("get-asset-base-path", () => {
    try {
      if (app.isPackaged) {
        return path.join(process.resourcesPath, "assets");
      }
      return path.join(app.getAppPath(), "public", "assets");
    } catch (err) {
      console.error("Failed to resolve asset base path:", err);
      return null;
    }
  });
  ipcMain.handle("save-exported-video", async (_, videoData, fileName) => {
    try {
      const result = await dialog.showSaveDialog({
        title: tMain("Save Exported Video"),
        defaultPath: path.join(app.getPath("downloads"), fileName),
        filters: [
          { name: tMain("MP4 Video"), extensions: ["mp4"] }
        ],
        properties: ["createDirectory", "showOverwriteConfirmation"]
      });
      if (result.canceled || !result.filePath) {
        return {
          success: false,
          cancelled: true,
          message: tMain("Export cancelled")
        };
      }
      await fs.writeFile(result.filePath, Buffer.from(videoData));
      return {
        success: true,
        path: result.filePath,
        message: tMain("Video exported successfully")
      };
    } catch (error) {
      console.error("Failed to save exported video:", error);
      return {
        success: false,
        message: tMain("Failed to save exported video"),
        error: String(error)
      };
    }
  });
  ipcMain.handle("open-video-file-picker", async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: tMain("Select Video File"),
        defaultPath: RECORDINGS_DIR,
        filters: [
          { name: tMain("Video Files"), extensions: ["webm", "mp4", "mov", "avi", "mkv"] },
          { name: tMain("All Files"), extensions: ["*"] }
        ],
        properties: ["openFile"]
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, cancelled: true };
      }
      return {
        success: true,
        path: result.filePaths[0]
      };
    } catch (error) {
      console.error("Failed to open file picker:", error);
      return {
        success: false,
        message: tMain("Failed to open file picker"),
        error: String(error)
      };
    }
  });
  let currentVideoPath = null;
  ipcMain.handle("set-current-video-path", (_, path2) => {
    currentVideoPath = path2;
    return { success: true };
  });
  ipcMain.handle("get-current-video-path", () => {
    return currentVideoPath ? { success: true, path: currentVideoPath } : { success: false };
  });
  ipcMain.handle("clear-current-video-path", () => {
    currentVideoPath = null;
    return { success: true };
  });
  ipcMain.handle("get-platform", () => {
    return process.platform;
  });
}
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RECORDINGS_DIR = path.join(app.getPath("userData"), "recordings");
async function ensureRecordingsDir() {
  try {
    await fs.mkdir(RECORDINGS_DIR, { recursive: true });
    console.log("RECORDINGS_DIR:", RECORDINGS_DIR);
    console.log("User Data Path:", app.getPath("userData"));
  } catch (error) {
    console.error("Failed to create recordings directory:", error);
  }
}
process.env.APP_ROOT = path.join(__dirname, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let mainWindow = null;
let sourceSelectorWindow = null;
let tray = null;
let selectedSourceName = "";
const defaultTrayIcon = getTrayIcon("openscreen.png");
const recordingTrayIcon = getTrayIcon("rec-button.png");
function createWindow() {
  mainWindow = createHudOverlayWindow();
}
function createTray() {
  tray = new Tray(defaultTrayIcon);
}
function getTrayIcon(filename) {
  return nativeImage.createFromPath(path.join(process.env.VITE_PUBLIC || RENDERER_DIST, filename)).resize({
    width: 24,
    height: 24,
    quality: "best"
  });
}
function updateTrayMenu(recording = false) {
  if (!tray) return;
  const trayIcon = recording ? recordingTrayIcon : defaultTrayIcon;
  const trayToolTip = recording ? tMain("Recording: {{source}}", { source: selectedSourceName }) : "OpenScreen";
  const menuTemplate = recording ? [
    {
      label: tMain("Stop Recording"),
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("stop-recording-from-tray");
        }
      }
    }
  ] : [
    {
      label: tMain("Open"),
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.isMinimized() && mainWindow.restore();
        } else {
          createWindow();
        }
      }
    },
    {
      label: tMain("Quit"),
      click: () => {
        app.quit();
      }
    }
  ];
  tray.setImage(trayIcon);
  tray.setToolTip(trayToolTip);
  tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));
}
function createEditorWindowWrapper() {
  if (mainWindow) {
    mainWindow.close();
    mainWindow = null;
  }
  mainWindow = createEditorWindow();
}
function createSourceSelectorWindowWrapper() {
  sourceSelectorWindow = createSourceSelectorWindow();
  sourceSelectorWindow.on("closed", () => {
    sourceSelectorWindow = null;
  });
  return sourceSelectorWindow;
}
app.on("window-all-closed", () => {
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.whenReady().then(async () => {
  const { ipcMain: ipcMain2 } = await import("electron");
  ipcMain2.on("hud-overlay-close", () => {
    app.quit();
  });
  createTray();
  updateTrayMenu();
  await ensureRecordingsDir();
  registerIpcHandlers(
    createEditorWindowWrapper,
    createSourceSelectorWindowWrapper,
    () => mainWindow,
    () => sourceSelectorWindow,
    (recording, sourceName) => {
      selectedSourceName = sourceName;
      if (!tray) createTray();
      updateTrayMenu(recording);
      if (!recording) {
        if (mainWindow) mainWindow.restore();
      }
    }
  );
  createWindow();
});
export {
  MAIN_DIST,
  RECORDINGS_DIR,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
