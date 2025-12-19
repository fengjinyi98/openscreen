import { useState, useRef, useEffect } from "react";
import { fixWebmDuration } from "@fix-webm-duration/fix";
import { useI18n } from "@/i18n";

type UseScreenRecorderReturn = {
  recording: boolean;
  recordingPending: boolean;
  toggleRecording: () => void;
};

type RecordingBackend = "ffmpeg" | "mediaRecorder" | null;

type SelectedSource = {
  id: string;
  name?: string;
  rawName?: string;
  display_id?: string;
};

function isSelectedSource(value: unknown): value is SelectedSource {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string"
  );
}

export function useScreenRecorder(): UseScreenRecorderReturn {
  const { t } = useI18n();
  const [recording, setRecording] = useState(false);
  const [recordingPending, setRecordingPending] = useState(false);
  const recordingBackend = useRef<RecordingBackend>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startTime = useRef<number>(0);
  const stopPending = useRef(false);

  // 目标：尽量接近无损的 4K@60fps；硬件性能不足时自动降级
  const TARGET_FRAME_RATE = 60;
  const TARGET_WIDTH = 3840;
  const TARGET_HEIGHT = 2160;
  const FOUR_K_PIXELS = TARGET_WIDTH * TARGET_HEIGHT;
  const selectMimeType = () => {
    const preferred = [
      "video/webm;codecs=av1",
      "video/webm;codecs=h264",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm"
    ];

    return preferred.find(type => MediaRecorder.isTypeSupported(type)) ?? "video/webm";
  };

  const computeBitrate = (width: number, height: number) => {
    const pixels = width * height;
    const highFrameRateBoost = TARGET_FRAME_RATE >= 60 ? 1.7 : 1;

    if (pixels >= FOUR_K_PIXELS) {
      return Math.round(45_000_000 * highFrameRateBoost);
    }

    if (pixels >= 2560 * 1440) {
      return Math.round(28_000_000 * highFrameRateBoost);
    }

    return Math.round(18_000_000 * highFrameRateBoost);
  };

  const stopRecording = useRef(async () => {
    if (stopPending.current) return;
    stopPending.current = true;

    try {
      if (recordingBackend.current === "ffmpeg") {
        const result = await window.electronAPI.stopRecording();
        setRecording(false);
        recordingBackend.current = null;
        window.electronAPI?.setRecordingState(false);

        if (!result.success || !result.path) {
          console.error("Failed to stop ffmpeg recording:", result.message, result.probe);
          alert(result.message ? t(result.message) : t("Failed to stop recording"));
          return;
        }

        if (result.probe?.video) {
          const v = result.probe.video;
          const avgFps = typeof v.avgFrameRate === "number" ? v.avgFrameRate.toFixed(2) : "unknown";
          console.log(
            `录制自检：${v.codec ?? "unknown"} ${v.width ?? "?"}x${v.height ?? "?"} avgFps=${avgFps}`
          );
        }

        await window.electronAPI.setCurrentVideoPath(result.path);
        await window.electronAPI.switchToEditor();
        return;
      }

      if (mediaRecorder.current?.state === "recording") {
        if (stream.current) {
          stream.current.getTracks().forEach(track => track.stop());
        }
        mediaRecorder.current.stop();
        setRecording(false);
        recordingBackend.current = null;
        window.electronAPI?.setRecordingState(false);
      }
    } catch (error) {
      console.error("Error stopping recording:", error);
      setRecording(false);
      recordingBackend.current = null;
      window.electronAPI?.setRecordingState(false);
    } finally {
      stopPending.current = false;
    }
  });

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    
    if (window.electronAPI?.onStopRecordingFromTray) {
      cleanup = window.electronAPI.onStopRecordingFromTray(() => {
        stopRecording.current();
      });
    }

    return () => {
      if (cleanup) cleanup();
      
      if (recordingBackend.current === "ffmpeg") {
        stopRecording.current();
        return;
      }

      if (mediaRecorder.current?.state === "recording") {
        mediaRecorder.current.stop();
      }
      if (stream.current) {
        stream.current.getTracks().forEach(track => track.stop());
        stream.current = null;
      }
    };
  }, []);

  const startRecordingWithFfmpeg = async (selectedSource: unknown): Promise<boolean> => {
    try {
      if (!isSelectedSource(selectedSource)) return false;
      const sourceId = selectedSource.id;
      if (!sourceId || typeof sourceId !== "string") return false;

      const platform = await window.electronAPI.getPlatform().catch(() => "win32");
      const isSupportedPlatform = platform === "win32" || platform === "darwin";
      const isScreenSource = sourceId.startsWith("screen:");
      const isWindowSource = sourceId.startsWith("window:");
      const hasFfmpegApi =
        typeof window.electronAPI?.startRecording === "function" &&
        typeof window.electronAPI?.stopRecording === "function";

      const canUseFfmpegForSource =
        (platform === "win32" && (isScreenSource || isWindowSource)) ||
        (platform === "darwin" && isScreenSource);

      if (!hasFfmpegApi || !isSupportedPlatform || !canUseFfmpegForSource) return false;

      const result = await window.electronAPI.startRecording({ fps: TARGET_FRAME_RATE });
      if (!result.success) {
        console.error("Failed to start ffmpeg recording:", result.message);
        alert(result.message ? t(result.message) : t("Failed to start recording"));
        // 已尝试 ffmpeg，但失败；避免静默回退导致用户误判
        return true;
      }

      console.log(`FFmpeg recording started (encoder=${result.encoder ?? "unknown"})`);
      startTime.current = Date.now();
      recordingBackend.current = "ffmpeg";
      setRecording(true);
      window.electronAPI?.setRecordingState(true);
      return true;
    } catch (error) {
      console.error("Failed to start ffmpeg recording:", error);
      alert(t("Failed to start recording"));
      return true;
    }
  };

  type ChromeDesktopCaptureConstraints = {
    audio: false;
    video: {
      mandatory: {
        chromeMediaSource: "desktop";
        chromeMediaSourceId: string;
        maxWidth: number;
        maxHeight: number;
        maxFrameRate: number;
        minFrameRate: number;
      };
    };
  };

  const startRecordingWithMediaRecorder = async (selectedSource: SelectedSource) => {
    try {
      const desktopConstraints: ChromeDesktopCaptureConstraints = {
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: selectedSource.id,
            maxWidth: TARGET_WIDTH,
            maxHeight: TARGET_HEIGHT,
            maxFrameRate: TARGET_FRAME_RATE,
            minFrameRate: 30,
          },
        },
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(
        desktopConstraints as unknown as MediaStreamConstraints
      );
      stream.current = mediaStream;
      if (!stream.current) {
        throw new Error(t("Media stream is not available."));
      }
      const videoTrack = stream.current.getVideoTracks()[0];
      try {
        await videoTrack.applyConstraints({
          frameRate: { ideal: TARGET_FRAME_RATE, max: TARGET_FRAME_RATE },
          width: { ideal: TARGET_WIDTH, max: TARGET_WIDTH },
          height: { ideal: TARGET_HEIGHT, max: TARGET_HEIGHT },
        });
      } catch (error) {
        console.warn("Unable to lock 4K/60fps constraints, using best available track settings.", error);
      }

      const settings = videoTrack.getSettings();
      let { width = 1920, height = 1080 } = settings;
      const { frameRate = TARGET_FRAME_RATE } = settings;

      // 确保宽高为偶数，避免 VP9/AV1 编码器因奇数尺寸失败
      width = Math.floor(width / 2) * 2;
      height = Math.floor(height / 2) * 2;

      const videoBitsPerSecond = computeBitrate(width, height);
      const mimeType = selectMimeType();

      console.log(
        `Recording at ${width}x${height} @ ${frameRate ?? TARGET_FRAME_RATE}fps using ${mimeType} / ${Math.round(
          videoBitsPerSecond / 1_000_000
        )} Mbps`
      );

      chunks.current = [];
      const recorder = new MediaRecorder(stream.current, {
        mimeType,
        videoBitsPerSecond,
      });
      mediaRecorder.current = recorder;
      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) chunks.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.current = null;
        if (chunks.current.length === 0) return;
        const duration = Date.now() - startTime.current;
        const recordedChunks = chunks.current;
        const buggyBlob = new Blob(recordedChunks, { type: mimeType });
        // 提前清空 chunks，避免 blob 创建后占用过多内存
        chunks.current = [];
        const timestamp = Date.now();
        const videoFileName = `recording-${timestamp}.webm`;

        try {
          const videoBlob = await fixWebmDuration(buggyBlob, duration);
          const arrayBuffer = await videoBlob.arrayBuffer();
          const videoResult = await window.electronAPI.storeRecordedVideo(arrayBuffer, videoFileName);
          if (!videoResult.success) {
            console.error("Failed to store video:", videoResult.message);
            return;
          }

          if (videoResult.path) {
            await window.electronAPI.setCurrentVideoPath(videoResult.path);
          }

          await window.electronAPI.switchToEditor();
        } catch (error) {
          console.error("Error saving recording:", error);
        }
      };
      recorder.onerror = () => {
        setRecording(false);
        recordingBackend.current = null;
        window.electronAPI?.setRecordingState(false);
      };
      recorder.start(1000);
      startTime.current = Date.now();
      recordingBackend.current = "mediaRecorder";
      setRecording(true);
      window.electronAPI?.setRecordingState(true);
    } catch (error) {
      console.error("Failed to start recording:", error);
      setRecording(false);
      recordingBackend.current = null;
      if (stream.current) {
        stream.current.getTracks().forEach(track => track.stop());
        stream.current = null;
      }
    }
  };

  const startRecording = async () => {
    if (recordingPending) return;
    setRecordingPending(true);

    try {
      const selectedSource = await window.electronAPI.getSelectedSource();
      if (!selectedSource || !isSelectedSource(selectedSource)) {
        alert(t("Please select a source to record"));
        return;
      }

      const handledByFfmpeg = await startRecordingWithFfmpeg(selectedSource);
      if (handledByFfmpeg) return;

      await startRecordingWithMediaRecorder(selectedSource);
    } finally {
      setRecordingPending(false);
    }
  };

  const toggleRecording = () => {
    if (recordingPending) return;
    recording ? stopRecording.current() : startRecording();
  };

  return { recording, recordingPending, toggleRecording };
}
