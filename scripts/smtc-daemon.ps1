# SMTC 长驻监控脚本
# 持续运行，仅在媒体状态变化时通过 stdout 输出 JSON
# 要求: powershell.exe (v5.1) - 有 WinRT 内建投影
# pwsh.exe (v7+) 不支持此脚本

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [Text.Encoding]::UTF8

# WinRT 异步辅助方法
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.RuntimeWindowsRuntimeExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

Function Await($WinRtTask, $ResultType) {
    try {
        return $asTask.MakeGenericMethod($ResultType).Invoke($null, @($WinRtTask)).Result
    }
    catch {
        return $null
    }
}

# 加载 WinRT 类型（只加载一次）
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null

$lastHash = ""
$lastPosition = -1
$pollInterval = 500

# 从命令行参数读取轮询间隔
if ($args.Count -gt 0) {
    $val = [int]$args[0]
    if ($val -ge 200 -and $val -le 2000) {
        $pollInterval = $val
    }
}

while ($true) {
    try {
        $manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) `
                        ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

        if ($null -eq $manager) {
            if ($lastHash -ne "none") {
                Write-Output '{"type":"no_media"}'
                $lastHash = "none"
            }
            Start-Sleep -Milliseconds $pollInterval
            continue
        }

        $session = $manager.GetCurrentSession()

        if ($null -eq $session) {
            if ($lastHash -ne "none") {
                Write-Output '{"type":"no_media"}'
                $lastHash = "none"
            }
            Start-Sleep -Milliseconds $pollInterval
            continue
        }

        $mediaProps = Await ($session.TryGetMediaPropertiesAsync()) `
                           ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
        $playback = $session.GetPlaybackInfo()
        $timeline = $session.GetTimelineProperties()

        if ($null -eq $mediaProps) {
            Start-Sleep -Milliseconds $pollInterval
            continue
        }

        $artist = ($mediaProps.Artist -replace '"', '\"')
        $title  = ($mediaProps.Title  -replace '"', '\"')
        $album  = ($mediaProps.AlbumTitle -replace '"', '\"')
        $status = $playback.PlaybackStatus.ToString()
        $pos    = [int]$timeline.Position.TotalSeconds
        $dur    = [int]$timeline.EndTime.TotalSeconds
        $source = $session.SourceAppUserModelId

        # 用 hash 检测曲目/状态变化
        $newHash = "$artist|$title|$album|$status|$source"

        if ($newHash -ne $lastHash) {
            $json = "{`"type`":`"track`",`"artist`":`"$artist`",`"title`":`"$title`",`"album`":`"$album`",`"status`":`"$status`",`"position`":$pos,`"duration`":$dur,`"source`":`"$source`"}"
            Write-Output $json
            $lastHash = $newHash
            $lastPosition = $pos
        }
        # 曲目没变但播放位置变了 → 输出位置更新
        elseif ($status -eq "Playing" -and [Math]::Abs($pos - $lastPosition) -ge 2) {
            Write-Output "{`"type`":`"position`",`"position`":$pos}"
            $lastPosition = $pos
        }
    }
    catch {
        # 静默处理异常，避免刷屏
    }

    Start-Sleep -Milliseconds $pollInterval
}
