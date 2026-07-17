import { spawn, type ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import type { TrackInfo } from './types/index.js';
import { logInfo, logError, logDebug } from './utils/logger.js';
import { getConfig } from './utils/config.js';

export class SmtcReader extends EventEmitter {
  private psProcess: ChildProcess | null = null;
  private scriptPath: string = '';
  private _isRunning: boolean = false;

  constructor(private context: vscode.ExtensionContext) {
    super();
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  /** 初始化并启动 SMTC 监控 */
  start(): void {
    this.prepareScript();
    this.launch();
  }

  /** 准备 PowerShell 脚本到可写目录 */
  private prepareScript(): void {
    const destDir = path.join(this.context.globalStorageUri.fsPath);
    const dest = path.join(destDir, 'smtc-daemon.ps1');

    fs.mkdirSync(destDir, { recursive: true });

    const srcScript = path.join(this.context.extensionPath, 'dist', 'smtc-daemon.ps1');
    if (fs.existsSync(srcScript)) {
      fs.copyFileSync(srcScript, dest);
      this.scriptPath = dest;
      logInfo(`PS 脚本已复制到 ${dest}`);
    } else {
      // 开发模式：直接从 scripts 目录加载
      const devSrc = path.join(this.context.extensionPath, 'scripts', 'smtc-daemon.ps1');
      if (fs.existsSync(devSrc)) {
        fs.copyFileSync(devSrc, dest);
        this.scriptPath = dest;
        logInfo(`PS 脚本已复制（开发模式）到 ${dest}`);
      } else {
        logError('找不到 smtc-daemon.ps1 脚本');
        vscode.window.showErrorMessage('歌词插件：找不到 SMTC 监控脚本');
        return;
      }
    }
  }

  /** 启动 PowerShell 长驻进程 */
  private launch(): void {
    if (this.psProcess) {
      this.psProcess.kill();
      this.psProcess = null;
    }

    const interval = getConfig<number>('lyrics.pollingInterval', 500);

    logInfo(`启动 SMTC 监控进程 (轮询间隔: ${interval}ms)`);

    this.psProcess = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-File', this.scriptPath,
      String(interval)
    ], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    this._isRunning = true;

    const rl = createInterface({ input: this.psProcess.stdout! });

    rl.on('line', (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      try {
        const data = JSON.parse(trimmed);

        if (data.type === 'track') {
          const track: TrackInfo = {
            artist: data.artist || '',
            title: data.title || '',
            album: data.album || '',
            duration: data.duration || 0,
            position: data.position || 0,
            playbackStatus: data.status || 'Unknown',
            sourceApp: data.source || '',
          };
          logDebug(`曲目: ${track.artist} - ${track.title}`);
          this.emit('trackChange', track);
        } else if (data.type === 'position') {
          this.emit('positionChange', data.position as number);
        } else if (data.type === 'no_media') {
          logDebug('无媒体播放');
          this.emit('noMedia');
        }
      } catch {
        // 忽略 JSON 解析错误
      }
    });

    // stderr 日志
    if (this.psProcess.stderr) {
      this.psProcess.stderr.on('data', (chunk: Buffer) => {
        const msg = chunk.toString().trim();
        if (msg) logError(`PS stderr: ${msg}`);
      });
    }

    // 进程退出 → 自动重启
    this.psProcess.on('exit', (code, signal) => {
      this._isRunning = false;
      logInfo(`SMTC 进程退出 (code: ${code}, signal: ${signal})`);
      if (code !== 0 && code !== null) {
        logInfo('5秒后尝试重启...');
        setTimeout(() => {
          if (this.psProcess === null || this.psProcess.killed) {
            this.launch();
          }
        }, 3000);
      }
    });
  }

  /** 手动刷新（强制触发 trackChange） */
  forceUpdate(): void {
    // 杀掉当前进程 → 自动重启 → 新的 track info
    if (this.psProcess) {
      this.psProcess.kill();
      this.psProcess = null;
    }
    setTimeout(() => this.launch(), 1000);
  }

  /** 停止 SMTC 监控 */
  stop(): void {
    if (this.psProcess) {
      this.psProcess.kill();
      this.psProcess = null;
    }
    this._isRunning = false;
    logInfo('SMTC 监控已停止');
  }

  dispose(): void {
    this.stop();
  }
}
