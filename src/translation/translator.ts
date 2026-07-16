import type { TrackInfo, LyricsResult } from '../types/index.js';
import { detectLanguage, transliterate } from './transliterator.js';
import { getConfig } from '../utils/config.js';
import { logDebug } from '../utils/logger.js';

/**
 * 翻译/音译编排器
 * 负责为歌词结果附加翻译和音译
 */
export class Translator {
  /**
   * 丰富歌词结果（添加翻译 + 音译）
   */
  async enrich(track: TrackInfo, result: LyricsResult): Promise<LyricsResult> {
    const enriched: LyricsResult = { ...result };

    // 翻译
    if (getConfig<boolean>('lyrics.enableTranslation', true)) {
      if (result.translation) {
        // 已有翻译（如网易云内建）
        enriched.translation = result.translation;
      }
    }

    // 音译
    if (getConfig<boolean>('lyrics.enableTransliteration', true)) {
      const lang = detectLanguage(result.lyrics);
      if (lang !== 'unknown' && lang !== 'zh') {
        // 中文不需要音译（对中文用户来说）
        const romanized = transliterate(result.lyrics, lang);
        if (romanized) {
          enriched.transliteration = romanized;
        }
        logDebug(`音译 [${lang}]: ${result.lyrics.substring(0, 30)}...`);
      }
    }

    return enriched;
  }

  /** 为翻译歌词按行对齐做归一化 */
  alignLines(original: string, translation: string): string {
    const origLines = original.split('\n').filter(l => l.trim());
    const transLines = translation.split('\n').filter(l => l.trim());

    // 如果行数相同，直接返回
    if (origLines.length === transLines.length) {
      return translation;
    }

    // 否则返回原始翻译文本，不做强制对齐
    return translation;
  }
}
