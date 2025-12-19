import { ipcMain, desktopCapturer, BrowserWindow, shell, app, dialog, screen } from 'electron'

import fs from 'node:fs/promises'
import path from 'node:path'
import { RECORDINGS_DIR } from '../main'
import { tMain } from '../i18n'
import { FfmpegRecorder } from '../recording/ffmpegRecorder'

type SelectedSource = {
  id: string
  name: string
  rawName?: string
  display_id?: string
  thumbnail?: string | null
  appIcon?: string | null
}

let selectedSource: SelectedSource | null = null

export function registerIpcHandlers(
  createEditorWindow: () => void,
  createSourceSelectorWindow: () => BrowserWindow,
  getMainWindow: () => BrowserWindow | null,
  getSourceSelectorWindow: () => BrowserWindow | null,
  onRecordingStateChange?: (recording: boolean, sourceName: string) => void
) {
  const ffmpegRecorder = new FfmpegRecorder({ recordingsDir: RECORDINGS_DIR })

  ipcMain.handle('get-sources', async (_, opts) => {
    const sources = await desktopCapturer.getSources(opts)
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      display_id: source.display_id,
      thumbnail: source.thumbnail ? source.thumbnail.toDataURL() : null,
      appIcon: source.appIcon ? source.appIcon.toDataURL() : null
    }))
  })

  ipcMain.handle('select-source', (_, source) => {
    selectedSource = source
    const sourceSelectorWin = getSourceSelectorWindow()
    if (sourceSelectorWin) {
      sourceSelectorWin.close()
    }
    return selectedSource
  })

  ipcMain.handle('get-selected-source', () => {
    return selectedSource
  })

  ipcMain.handle('open-source-selector', () => {
    const sourceSelectorWin = getSourceSelectorWindow()
    if (sourceSelectorWin) {
      sourceSelectorWin.focus()
      return
    }
    createSourceSelectorWindow()
  })

  ipcMain.handle('switch-to-editor', () => {
    const mainWin = getMainWindow()
    if (mainWin) {
      mainWin.close()
    }
    createEditorWindow()
  })

  ipcMain.handle('start-recording', async (_, options?: { fps?: number }) => {
    try {
      if (!selectedSource) {
        return { success: false, backend: 'ffmpeg', message: tMain('Please select a source to record') }
      }

      if (!selectedSource.id || typeof selectedSource.id !== 'string') {
        return { success: false, backend: 'ffmpeg', message: tMain('Invalid recording source') }
      }

      const platform = process.platform
      const sourceId = selectedSource.id
      const isScreenSource = sourceId.startsWith('screen:')
      const isWindowSource = sourceId.startsWith('window:')

      if (platform === 'darwin' && !isScreenSource) {
        return {
          success: false,
          backend: 'ffmpeg',
          message: tMain('FFmpeg recording currently supports only screen sources.'),
        }
      }

      if (platform === 'win32' && !isScreenSource && !isWindowSource) {
        return { success: false, backend: 'ffmpeg', message: tMain('Invalid recording source') }
      }

      if (platform !== 'win32' && platform !== 'darwin') {
        return {
          success: false,
          backend: 'ffmpeg',
          message: tMain('FFmpeg recording is not supported on this platform yet.'),
        }
      }

      const fps = Number(options?.fps) || 60
      const timestamp = Date.now()
      const fileName = `recording-${timestamp}.mp4`
      const outputPath = path.join(RECORDINGS_DIR, fileName)

      const startResult = isScreenSource
        ? await (async () => {
            const displays = screen.getAllDisplays()
            const displayId = String(selectedSource.display_id ?? '')
            const displayIndex = displays.findIndex(d => String(d.id) === displayId)
            const display = displayIndex >= 0 ? displays[displayIndex] : screen.getPrimaryDisplay()

            const scaleFactor = Number(display.scaleFactor) || 1
            const bounds = display.bounds
            const boundsPx = {
              x: Math.round(bounds.x * scaleFactor),
              y: Math.round(bounds.y * scaleFactor),
              width: Math.round(bounds.width * scaleFactor),
              height: Math.round(bounds.height * scaleFactor),
            }
            // 保证编码兼容：宽高为偶数
            boundsPx.width = boundsPx.width - (boundsPx.width % 2)
            boundsPx.height = boundsPx.height - (boundsPx.height % 2)

            return await ffmpegRecorder.start({
              fps,
              outputPath,
              target: {
                kind: 'screen',
                boundsPx,
                displayIndex: displayIndex >= 0 ? displayIndex : 0,
              },
            })
          })()
        : await (async () => {
            const candidates = [selectedSource?.rawName, selectedSource?.name]
              .filter((value: unknown): value is string => typeof value === 'string')
              .map(value => value.trim())
              .filter(Boolean)

            const uniqueTitles = Array.from(new Set(candidates))
            if (uniqueTitles.length === 0) {
              return { success: false, backend: 'ffmpeg', message: tMain('Invalid recording source') }
            }

            let result = null as Awaited<ReturnType<typeof ffmpegRecorder.start>> | null
            for (const title of uniqueTitles) {
              result = await ffmpegRecorder.start({ fps, outputPath, target: { kind: 'window', title } })
              if (result.success) break
            }

            return (
              result ?? { success: false, backend: 'ffmpeg', message: tMain('Invalid recording source') }
            )
          })()

      if (startResult.success && onRecordingStateChange) {
        const sourceName = selectedSource?.name || tMain('Screen')
        onRecordingStateChange(true, sourceName)
      }

      return startResult
    } catch (error) {
      console.error('Failed to start ffmpeg recording:', error)
      return { success: false, backend: 'ffmpeg', message: tMain('Failed to start recording') }
    }
  })

  ipcMain.handle('stop-recording', async () => {
    try {
      const stopResult = await ffmpegRecorder.stop()

      if (onRecordingStateChange) {
        const sourceName = selectedSource?.name || tMain('Screen')
        onRecordingStateChange(false, sourceName)
      }

      return stopResult
    } catch (error) {
      console.error('Failed to stop ffmpeg recording:', error)
      return { success: false, backend: 'ffmpeg', message: tMain('Failed to stop recording') }
    }
  })



  ipcMain.handle('store-recorded-video', async (_, videoData: ArrayBuffer, fileName: string) => {
    try {
      const videoPath = path.join(RECORDINGS_DIR, fileName)
      await fs.writeFile(videoPath, Buffer.from(videoData))
      currentVideoPath = videoPath;
      return {
        success: true,
        path: videoPath,
        message: tMain('Video stored successfully')
      }
    } catch (error) {
      console.error('Failed to store video:', error)
      return {
        success: false,
        message: tMain('Failed to store video'),
        error: String(error)
      }
    }
  })



  ipcMain.handle('get-recorded-video-path', async () => {
    try {
      const files = await fs.readdir(RECORDINGS_DIR)
      const videoFiles = files.filter(file => file.endsWith('.webm') || file.endsWith('.mp4'))
      
      if (videoFiles.length === 0) {
        return { success: false, message: tMain('No recorded video found') }
      }
      
      const latestVideo = videoFiles.sort().reverse()[0]
      const videoPath = path.join(RECORDINGS_DIR, latestVideo)
      
      return { success: true, path: videoPath }
    } catch (error) {
      console.error('Failed to get video path:', error)
      return { success: false, message: tMain('Failed to get video path'), error: String(error) }
    }
  })

  ipcMain.handle('set-recording-state', (_, recording: boolean) => {
    const source = selectedSource || { name: tMain('Screen') }
    if (onRecordingStateChange) {
      onRecordingStateChange(recording, source.name)
    }
  })


  ipcMain.handle('open-external-url', async (_, url: string) => {
    try {
      await shell.openExternal(url)
      return { success: true }
    } catch (error) {
      console.error('Failed to open URL:', error)
      return { success: false, error: String(error) }
    }
  })

  // Return base path for assets so renderer can resolve file:// paths in production
  ipcMain.handle('get-asset-base-path', () => {
    try {
      if (app.isPackaged) {
        return path.join(process.resourcesPath, 'assets')
      }
      return path.join(app.getAppPath(), 'public', 'assets')
    } catch (err) {
      console.error('Failed to resolve asset base path:', err)
      return null
    }
  })

  ipcMain.handle('save-exported-video', async (_, videoData: ArrayBuffer, fileName: string) => {
    try {
      const result = await dialog.showSaveDialog({
        title: tMain('Save Exported Video'),
        defaultPath: path.join(app.getPath('downloads'), fileName),
        filters: [
          { name: tMain('MP4 Video'), extensions: ['mp4'] }
        ],
        properties: ['createDirectory', 'showOverwriteConfirmation']
      });

      if (result.canceled || !result.filePath) {
        return {
          success: false,
          cancelled: true,
          message: tMain('Export cancelled')
        };
      }
      await fs.writeFile(result.filePath, Buffer.from(videoData));
      
      return {
        success: true,
        path: result.filePath,
        message: tMain('Video exported successfully')
      };
    } catch (error) {
      console.error('Failed to save exported video:', error)
      return {
        success: false,
        message: tMain('Failed to save exported video'),
        error: String(error)
      }
    }
  })

  ipcMain.handle('open-video-file-picker', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: tMain('Select Video File'),
        defaultPath: RECORDINGS_DIR,
        filters: [
          { name: tMain('Video Files'), extensions: ['webm', 'mp4', 'mov', 'avi', 'mkv'] },
          { name: tMain('All Files'), extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, cancelled: true };
      }

      return {
        success: true,
        path: result.filePaths[0]
      };
    } catch (error) {
      console.error('Failed to open file picker:', error);
      return {
        success: false,
        message: tMain('Failed to open file picker'),
        error: String(error)
      };
    }
  });

  let currentVideoPath: string | null = null;

  ipcMain.handle('set-current-video-path', (_, path: string) => {
    currentVideoPath = path;
    return { success: true };
  });

  ipcMain.handle('get-current-video-path', () => {
    return currentVideoPath ? { success: true, path: currentVideoPath } : { success: false };
  });

  ipcMain.handle('clear-current-video-path', () => {
    currentVideoPath = null;
    return { success: true };
  });

  ipcMain.handle('get-platform', () => {
    return process.platform;
  });
}
