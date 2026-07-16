// 歌词显示插件 — 共享类型定义

/** SMTC 曲目信息 */
export interface TrackInfo {
  artist: string;
  title: string;
  album: string;
  duration: number;
  position: number;
  playbackStatus: string;
  sourceApp: string;
}

/** LRC 解析后的行 */
export interface LrcLine {
  time: number;  // 秒
  text: string;  // 去时间戳的歌词文本
}

/** 歌词获取结果 */
export interface LyricsResult {
  lyrics: string;            // 纯文本歌词（换行分隔）
  lrcLines?: LrcLine[];      // LRC 解析后的行数组（用于当前句匹配）
  translation?: string;      // 翻译文本（换行分隔，行对应原文）
  transliteration?: string;  // 音译文本（换行分隔，行对应原文）
  source: string;            // 歌词来源名称
}

/** 歌词提供器接口 */
export interface ILyricsProvider {
  readonly name: string;
  search(track: TrackInfo): Promise<string | null>;
}

/** 样式配置 */
export interface StyleConfig {
  activeFontSize: number;
  normalFontSize: number;
  activeFontWeight: string;
  activeLineColor: string;
  normalLineColor: string;
  inactiveOpacity: number;
  translationFontSize: number;
  translationColor: string;
  transliterationFontSize: number;
  transliterationColor: string;
  transliterationItalic: boolean;
  lineSpacing: number;
  transitionDuration: number;
  backgroundColor: string;
}
