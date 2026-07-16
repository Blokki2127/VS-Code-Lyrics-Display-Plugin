import * as path from 'path';
import * as fs from 'fs';
import type { TrackInfo } from '../types/index.js';
import type { ILyricsProvider } from './provider.js';
import { getConfig } from '../utils/config.js';
import { logDebug } from '../utils/logger.js';

/**
 * 本地 .lrc 文件歌词提供器
 */
export class LocalProvider implements ILyricsProvider {
  readonly name = 'Local';

  async search(track: TrackInfo): Promise<string | null> {
    const dir = getConfig<string>('lyrics.localPath', '');
    if (!dir) return null;
    if (!fs.existsSync(dir)) return null;

    const patterns = [
      `${track.artist} - ${track.title}.lrc`,
      `${track.artist} - ${track.title}.txt`,
      `${track.title}.lrc`,
      `${track.artist}_${track.title}.lrc`,
    ];

    // 还要尝试模糊匹配（文件名包含歌名和歌手）
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.lrc') || f.endsWith('.txt'));
    const allPatterns = [...patterns];

    // 添加模糊匹配
    for (const file of files) {
      const lower = file.toLowerCase();
      if (lower.includes(track.title.toLowerCase()) && lower.includes(track.artist.toLowerCase())) {
        allPatterns.push(file);
      }
    }

    for (const pattern of allPatterns) {
      const filePath = path.join(dir, pattern);
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          logDebug(`本地歌词找到: ${pattern}`);
          return content; // 保留 LRC 时间戳
        } catch {
          continue;
        }
      }
    }

    return null;
  }
}
