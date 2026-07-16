# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A VS Code extension that displays currently playing music lyrics on Windows. Uses SMTC (System Media Transport Controls) via a long-running PowerShell process to detect media playback, fetches lyrics from online APIs (NetEase, QQ Music, LRCLIB) or local `.lrc` files, and renders them in a webview panel with current-line emphasis.

## Build & Run

- `npm run build` — esbuild production build to `dist/`
- `npm run watch` — esbuild dev mode with auto-rebuild
- `npm run package` — `vsce package` to produce `.vsix`
- F5 in VS Code — launch Extension Development Host (uses `npm run watch` as preLaunchTask)

## Architecture

```
SMTC (Windows) → PowerShell daemon (.ps1) → stdout JSON → smtcReader.ts (EventEmitter)
    → lyricsFetcher.ts (multi-provider orchestrator + cache)
    → translator.ts (translation + transliteration enrichment)
    → lyricsPanel.ts (webview) + statusBar.ts
```

### Key Files

| File | Role |
|------|------|
| [extension.ts](src/extension.ts) | Entry point, wires all components, registers commands |
| [smtcReader.ts](src/smtcReader.ts) | Spawns long-running PowerShell process, emits `trackChange`/`noMedia`/`positionChange` |
| [lyricsFetcher.ts](src/lyricsFetcher.ts) | Orchestrates multi-provider lyrics lookup with in-memory cache |
| [lyricsPanel.ts](src/display/lyricsPanel.ts) | Webview panel — renders lyrics with config-driven CSS, current-line highlighting, translation/transliteration |
| [statusBar.ts](src/display/statusBar.ts) | Status bar item — compact track info, hover tooltip, no click handler |
| [lrcParser.ts](src/lyricsProviders/lrcParser.ts) | LRC timestamp parsing, current-line matching, plain text extraction |
| [translator.ts](src/translation/translator.ts) | Enriches lyrics results with translation and transliteration |
| [transliterator.ts](src/translation/transliterator.ts) | Japanese→romaji, Korean→romaja, Chinese→pinyin conversion |
| [smtc-daemon.ps1](scripts/smtc-daemon.ps1) | PowerShell script — long-running SMTC monitor, outputs JSON on state change |

### Provider Pattern

Lyrics providers implement `ILyricsProvider` (defined in [provider.ts](src/lyricsProviders/provider.ts)) with a `search(track)` method. Current providers:
- `LrclibProvider` — free, no-key API at lrclib.net
- `NeteaseProvider` — NetEase Cloud Music API (includes built-in translation via `tlyric`)
- `QQMusicProvider` — QQ Music unofficial API
- `LocalProvider` — reads `.lrc`/`.txt` files from configured directory

### SMTC Daemon

A single PowerShell process runs for the extension's lifetime (not spawned per-poll). It sleeps 500ms between checks, outputs JSON to stdout only when media state changes, and auto-restarts on crash. Must use `powershell.exe` (v5.1) not `pwsh.exe` (v7+), because PowerShell 7 dropped built-in WinRT projection.

## Configuration

All settings under `lyrics.*` namespace. See [package.json](package.json) `contributes.configuration` for the full list. Key groups:
- `lyrics.source` / `lyrics.onlineProvider` — lyrics source selection
- `lyrics.enableTranslation` / `lyrics.enableTransliteration` — translation toggles
- `lyrics.style.*` — 15 customizable CSS properties (font sizes, colors, opacity, spacing, animation)
- `lyrics.panelPosition` — "beside" / "active" / "bottom"

## Key Design Decisions

- **No runtime npm dependencies** — uses only Node.js built-ins (`child_process`, `https`, `fs`, `readline`, `path`, `events`)
- **Long-running PS process over per-poll spawn** — eliminates ~50-100ms process creation overhead per check
- **PostMessage for position updates** — avoids full HTML rebuild on every playback position change; only a CSS class swap via `webview.postMessage`
- **Config-driven CSS injection** — all style values read from VS Code settings and inlined into webview HTML at render time; `onDidChangeConfiguration` triggers CSS rebuild
- **Hash-based change detection in PS** — only outputs JSON when artist/title/album/status/source changes; skips identical outputs
