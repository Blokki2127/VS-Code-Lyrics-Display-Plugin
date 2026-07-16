import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | null = null;

/** 获取 VS Code 输出通道 */
export function getLogger(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('歌词显示');
  }
  return outputChannel;
}

/** 打印信息日志 */
export function logInfo(message: string): void {
  const channel = getLogger();
  channel.appendLine(`[信息] ${new Date().toLocaleTimeString()} ${message}`);
}

/** 打印错误日志 */
export function logError(message: string, error?: unknown): void {
  const channel = getLogger();
  const errMsg = error instanceof Error ? error.message : String(error ?? '');
  channel.appendLine(`[错误] ${new Date().toLocaleTimeString()} ${message}${errMsg ? ' - ' + errMsg : ''}`);
}

/** 打印调试日志 */
export function logDebug(message: string): void {
  const channel = getLogger();
  channel.appendLine(`[调试] ${new Date().toLocaleTimeString()} ${message}`);
}
