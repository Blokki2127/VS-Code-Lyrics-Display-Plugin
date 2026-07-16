import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync } from 'fs';

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

const ctx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outdir: 'dist',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node16',
  sourcemap: !isProduction,
  minify: isProduction,
  plugins: [{
    name: 'copy-ps1',
    setup(build) {
      build.onEnd(() => {
        mkdirSync('dist', { recursive: true });
        copyFileSync('scripts/smtc-daemon.ps1', 'dist/smtc-daemon.ps1');
      });
    }
  }]
});

if (isWatch) {
  await ctx.watch();
  console.log('[watch] 监听中...');
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log('[build] 构建完成');
}
