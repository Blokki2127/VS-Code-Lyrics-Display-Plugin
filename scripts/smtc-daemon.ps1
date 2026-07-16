# SMTC 长驻监控 - 持续运行，变化时输出 JSON 到 stdout
$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskM = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1

function Await($op, $type) {
    try {
        $m = $asTaskM.MakeGenericMethod($type)
        $task = $m.Invoke($null, @($op))
        return $task.GetType().GetProperty('Result').GetValue($task)
    } catch { return $null }
}

[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null

$lastHash = ""
$lastPos = -1
$interval = 500
if ($args.Count -gt 0) { $v = [int]$args[0]; if ($v -ge 200 -and $v -le 2000) { $interval = $v } }

while ($true) {
    try {
        $mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) `
                     ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
        if ($null -eq $mgr) {
            if ($lastHash -ne "none") {
                [Console]::WriteLine('{"type":"no_media"}')
                $lastHash = "none"
            }
            Start-Sleep -Milliseconds $interval; continue
        }
        $sess = $mgr.GetCurrentSession()
        if ($null -eq $sess) {
            if ($lastHash -ne "none") {
                [Console]::WriteLine('{"type":"no_media"}')
                $lastHash = "none"
            }
            Start-Sleep -Milliseconds $interval; continue
        }
        $prop = Await ($sess.TryGetMediaPropertiesAsync()) `
                      ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
        if ($null -eq $prop) { Start-Sleep -Milliseconds $interval; continue }
        $pb = $sess.GetPlaybackInfo()
        $tm = $null
        try { $tm = $sess.GetTimelineProperties() } catch {}

        $a = if ($prop.Artist) { $prop.Artist } else { "" }
        $t = if ($prop.Title) { $prop.Title } else { "" }
        $al = if ($prop.AlbumTitle) { $prop.AlbumTitle } else { "" }
        $st = $pb.PlaybackStatus.ToString()
        $src = if ($sess.SourceAppUserModelId) { $sess.SourceAppUserModelId } else { "" }
        $pos = if ($tm) { [int]$tm.Position.TotalSeconds } else { 0 }
        $dur = if ($tm) { [int]$tm.EndTime.TotalSeconds } else { 0 }

        $newHash = "$a|$t|$al|$st|$src"
        if ($newHash -ne $lastHash) {
            $json = "{`"type`":`"track`",`"artist`":`"" + ($a -replace '"','\"' -replace '\\','\\') + "`",`"title`":`"" + ($t -replace '"','\"' -replace '\\','\\') + "`",`"album`":`"" + ($al -replace '"','\"' -replace '\\','\\') + "`",`"status`":`"$st`",`"position`":$pos,`"duration`":$dur,`"source`":`"" + ($src -replace '"','\"' -replace '\\','\\') + "`"}"
            [Console]::WriteLine($json)
            $lastHash = $newHash
            $lastPos = $pos
        }
        elseif ($st -eq "Playing" -and [Math]::Abs($pos - $lastPos) -ge 2) {
            [Console]::WriteLine("{`"type`":`"position`",`"position`":$pos}")
            $lastPos = $pos
        }
    } catch {}
    Start-Sleep -Milliseconds $interval
}
