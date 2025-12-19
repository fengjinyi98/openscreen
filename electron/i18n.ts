import { app } from 'electron'

export type Language = 'en' | 'zh-CN'

type InterpolationValues = Record<string, string | number>

function interpolate(template: string, values?: InterpolationValues): string {
  if (!values) return template
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key: string) => {
    const value = values[key]
    return value === undefined || value === null ? '' : String(value)
  })
}

function normalizeLanguage(value: string | null | undefined): Language | null {
  if (!value) return null
  const lower = value.toLowerCase()
  if (lower === 'zh' || lower === 'zh-cn' || lower.startsWith('zh-')) return 'zh-CN'
  if (lower === 'en' || lower.startsWith('en-')) return 'en'
  return null
}

export function getAppLanguage(): Language {
  try {
    return normalizeLanguage(app.getLocale?.()) ?? 'en'
  } catch {
    return 'en'
  }
}

const zhCN: Record<string, string> = {
  'Recording: {{source}}': '正在录制：{{source}}',
  'Stop Recording': '停止录制',
  'Open': '打开',
  'Quit': '退出',

  'Save Exported Video': '保存导出的视频',
  'MP4 Video': 'MP4 视频',
  'Export cancelled': '已取消导出',
  'Video exported successfully': '视频导出成功',
  'Failed to save exported video': '保存导出的视频失败',

  'Select Video File': '选择视频文件',
  'Video Files': '视频文件',
  'All Files': '所有文件',
  'Failed to open file picker': '打开文件选择器失败',

  'Video stored successfully': '视频保存成功',
  'Failed to store video': '保存视频失败',
  'No recorded video found': '未找到录制视频',
  'Failed to get video path': '获取视频路径失败',

  'Please select a source to record': '请先选择要录制的来源',
  'Invalid recording source': '录制来源无效',
  'FFmpeg recording currently supports only screen sources.': 'FFmpeg 录制目前仅支持屏幕来源。',
  'FFmpeg recording is not supported on this platform yet.': 'FFmpeg 录制暂不支持当前平台。',
  'Failed to start recording': '开始录制失败',
  'Failed to stop recording': '停止录制失败',

  'Screen': '屏幕',
}

export function tMain(key: string, values?: InterpolationValues): string {
  const language = getAppLanguage()
  const template = language === 'zh-CN' ? (zhCN[key] ?? key) : key
  return interpolate(template, values)
}

