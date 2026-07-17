import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';

export interface ElogTrackInfo {
  artist: string;
  title: string;
  album: string;
  duration: number;   // seconds
  position: number;    // seconds
  isPlaying: boolean;
  sourceApp: string;
}

/**
 * 网易云 elog 事件读取器
 * 监控 cloudmusic.elog 文件，实时解析播放事件
 * 参考：MyLifeTracker/StalinDev54
 */
export class NeteaseElogReader extends EventEmitter {
  private filePath: string;
  private fileSize = 0;
  private watchTimer: ReturnType<typeof setInterval> | null = null;

  // 播放状态追踪
  private currentSongId = -1;
  private currentTrackName = '';
  private currentArtist = '';
  private currentAlbum = '';
  private currentDuration = 0;
  private isPlaying = false;
  private lastPosition = 0;           // 暂停时的位置
  private relativeTime = 0;           // Date.now() - position*1000（播放中）
  private lastEventTime = 0;          // 上次事件的时间戳

  constructor() {
    super();
    this.filePath = path.join(
      process.env.LOCALAPPDATA || '',
      'NetEase/CloudMusic/cloudmusic.elog'
    );
  }

  /** 获取当前播放位置 */
  get position(): number {
    if (this.isPlaying) {
      return Math.min(
        (Date.now() - this.relativeTime) / 1000,
        this.currentDuration || Infinity
      );
    }
    return this.lastPosition;
  }

  /** 获取当前曲目信息 */
  get trackInfo(): ElogTrackInfo | null {
    if (this.currentSongId === -1) return null;
    return {
      artist: this.currentArtist,
      title: this.currentTrackName,
      album: this.currentAlbum,
      duration: this.currentDuration,
      position: this.position,
      isPlaying: this.isPlaying,
      sourceApp: 'cloudmusic.exe',
    };
  }

  /** 启动监控 */
  start(): void {
    try {
      if (!fs.existsSync(this.filePath)) {
        console.log('[Elog] File not found:', this.filePath);
        return;
      }

      // 读取初始内容以获取当前状态
      const buffer = fs.readFileSync(this.filePath);
      const decoded = this.decode(buffer);
      const lines = decoded.split('\n');

      // 从日志中恢复播放状态（倒序分析最近的事件）
      this.recoverState(lines);

      this.fileSize = buffer.length;

      // 每 500ms 检查文件变化
      this.watchTimer = setInterval(() => this.poll(), 500);

      console.log('[Elog] Started monitoring, songId:', this.currentSongId);
    } catch (err) {
      console.error('[Elog] Start error:', err);
    }
  }

  /** 停止监控 */
  stop(): void {
    if (this.watchTimer) {
      clearInterval(this.watchTimer);
      this.watchTimer = null;
    }
  }

  /** 轮询检查新日志 */
  private poll(): void {
    try {
      const stats = fs.statSync(this.filePath);

      if (stats.size < this.fileSize) {
        this.fileSize = 0;
      }

      if (stats.size > this.fileSize) {
        const fd = fs.openSync(this.filePath, 'r');
        const buf = Buffer.alloc(stats.size - this.fileSize);
        fs.readSync(fd, buf, 0, buf.length, this.fileSize);
        fs.closeSync(fd);
        this.fileSize = stats.size;

        const decoded = this.decode(new Uint8Array(buf));
        const lines = decoded.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) this.processLine(trimmed);
        }
      }

      // 播放中持续发射位置
      if (this.isPlaying) {
        this.emit('position', this.position);
      }
    } catch {
      // 静默
    }
  }

  /** 从历史日志中恢复播放状态 */
  private recoverState(lines: string[]): void {
    const relevantLines: string[] = [];
    let foundExit = false;

    // 倒序查找，直到找到 EXIT（表示软件曾退出过）
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (line.includes('【app】,{"actionId":"exitApp"}')) {
        foundExit = true;
        break;
      }
      if (
        line.includes('【playing】,"playOneTrackInPlayingList"') ||
        line.includes('【playing】,"checkPlayPrivilege"') ||
        line.includes('【playing】,"setPlayingPosition"') ||
        line.includes('【playing】,"native播放state"')
      ) {
        relevantLines.unshift(line);
      }
    }

    if (foundExit) return; // 上次启动了但已退出，从零开始

    // 按时间顺序回放事件
    let songId = -1;
    let trackName = '';
    let artist = '';
    let album = '';
    let duration = 0;
    let playing = false;
    let position = 0;
    let relativeTime = 0;
    let lastEventTime = Date.now();

    for (const line of relevantLines) {
      const header = this.parseHeader(line);
      if (header) lastEventTime = header.timestamp;

      if (line.includes('"playOneTrackInPlayingList"')) {
        const data = this.extractJson(line);
        if (data) {
          songId = +data.id;
          trackName = data.track?.name || '';
          artist = data.track?.artists?.map((a: {name: string}) => a.name).join('/') || '';
          album = data.track?.album?.name || '';
          duration = (data.track?.duration || 0) / 1000;
          playing = true;
          position = 0;
          relativeTime = Date.now();
        }
      } else if (line.includes('"checkPlayPrivilege"')) {
        const data = this.extractJson(line);
        if (data) {
          songId = +data.id;
          trackName = data.name || '';
          artist = data.artists?.map((a: {name: string}) => a.name).join('/') || '';
          album = data.album?.name || '';
          duration = (data.duration || 0) / 1000;
          playing = true;
          position = 0;
          relativeTime = Date.now();
        }
      } else if (line.includes('"setPlayingPosition"')) {
        const m = line.match(/"setPlayingPosition",(\d+(?:\.\d+)?)/);
        if (m) {
          position = +m[1];
          if (playing) {
            relativeTime = Date.now() - position * 1000;
          }
        }
      } else if (line.includes('"native播放state"')) {
        const m = line.match(/"native播放state",(\d+)/);
        if (m) {
          const newPlaying = m[1] === '1';
          if (newPlaying && !playing) {
            relativeTime = Date.now() - position * 1000;
          } else if (!newPlaying && playing) {
            position = (Date.now() - relativeTime) / 1000;
          }
          playing = newPlaying;
        }
      }
    }

    this.currentSongId = songId;
    this.currentTrackName = trackName;
    this.currentArtist = artist;
    this.currentAlbum = album;
    this.currentDuration = duration;
    this.isPlaying = playing;
    this.lastPosition = position;
    this.relativeTime = relativeTime;
    this.lastEventTime = lastEventTime;

    if (songId !== -1) {
      console.log(`[Elog] Recovered: ${artist} - ${trackName}, playing=${playing}, pos=${this.position.toFixed(1)}s`);
    }
  }

  /** 处理一行新日志 */
  private processLine(line: string): void {
    if (!line || !line.includes('【playing】')) return;

    const header = this.parseHeader(line);
    const now = Date.now();
    const eventTime = header ? header.timestamp : now;

    // setPlayingPosition — 用户拖动进度
    if (line.includes('"setPlayingPosition"')) {
      const m = line.match(/"setPlayingPosition",(\d+(?:\.\d+)?)/);
      if (m) {
        this.lastPosition = +m[1];
        if (this.isPlaying) {
          this.relativeTime = now - this.lastPosition * 1000;
        }
        this.lastEventTime = eventTime;
        this.emit('position', this.position);
      }
      return;
    }

    // native播放state — 播放/暂停 (1=play, 2=pause)
    if (line.includes('"native播放state"')) {
      const m = line.match(/"native播放state",(\d+)/);
      if (m) {
        const newPlaying = m[1] === '1';
        if (newPlaying && !this.isPlaying) {
          // 恢复播放
          this.relativeTime = now - this.lastPosition * 1000;
        } else if (!newPlaying && this.isPlaying) {
          // 暂停
          this.lastPosition = (now - this.relativeTime) / 1000;
        }
        this.isPlaying = newPlaying;
        this.lastEventTime = eventTime;
        this.emit('status', this.isPlaying);
      }
      return;
    }

    // playOneTrackInPlayingList / checkPlayPrivilege — 切歌
    if (line.includes('"playOneTrackInPlayingList"') || line.includes('"checkPlayPrivilege"')) {
      const data = this.extractJson(line);
      if (!data) return;

      const newId = +data.id || +data.track?.id || -1;
      if (newId === this.currentSongId) return; // 同一首歌，忽略

      this.currentSongId = newId;
      this.currentTrackName = data.track?.name || data.name || '';
      this.currentArtist = (data.track?.artists || data.artists || [])
        .map((a: {name: string}) => a.name).join('/');
      this.currentAlbum = data.track?.album?.name || data.album?.name || '';
      this.currentDuration = (data.track?.duration || data.duration || 0) / 1000;
      this.isPlaying = true;
      this.lastPosition = 0;
      this.relativeTime = now;
      this.lastEventTime = eventTime;

      const info = this.trackInfo;
      if (info) this.emit('trackChange', info);
      return;
    }
  }

  /** 解码 elog 字节 */
  private decode(dataArray: Uint8Array): string {
    const bytesArr = Array.from(dataArray);
    const decodedBytes = bytesArr.map((byte) => {
      const hexDigit = (Math.floor(byte / 16) ^ ((byte % 16) + 8)) % 16;
      return (
        hexDigit * 16 +
        Math.floor(byte / 64) * 4 +
        (~Math.floor(byte / 16) & 3)
      );
    });

    let decodedBuf = new Uint8Array(decodedBytes);
    while (decodedBuf.length > 0) {
      try {
        return new TextDecoder('utf-8').decode(decodedBuf);
      } catch {
        decodedBuf = decodedBuf.slice(1);
      }
    }
    return '';
  }

  /** 提取日志行中的 JSON */
  private extractJson(line: string): Record<string, unknown> | null {
    const match = line.match(/\{.*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /** 解析日志头 */
  private parseHeader(line: string): { timestamp: number } | null {
    const match = line.match(/\[(\d+):\d+\/(\d+):INFO/);
    if (!match) return null;
    // timestamp = startup_time (ms since boot) + boot_time
    const startupMs = parseInt(match[2], 10);
    const bootTime = Date.now() - (os.uptime() * 1000);
    return { timestamp: bootTime + startupMs };
  }

  dispose(): void {
    this.stop();
  }
}
