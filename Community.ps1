param([switch]$Share, [switch]$Stop)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$runtimeDir = Join-Path $projectRoot 'runtime'
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$statePath = Join-Path $runtimeDir 'processes.json'
$state = @{serverPid=0; tunnelPid=0; tunnelExe=''; url=''}
if (Test-Path -LiteralPath $statePath) {
    $saved = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    foreach ($key in @('serverPid','tunnelPid','tunnelExe','url')) { $state[$key] = $saved.$key }
}
function Test-OwnedProcess($processId, $marker) {
    if (-not $processId) { return $false }
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
    return $processInfo -and $processInfo.CommandLine -and $processInfo.CommandLine.Contains($marker)
}
$serverPath = Join-Path $projectRoot 'server.mjs'
if ($Stop) {
    if (Test-OwnedProcess $state.tunnelPid $state.tunnelExe) { Stop-Process -Id $state.tunnelPid }
    if (Test-OwnedProcess $state.serverPid $serverPath) { Stop-Process -Id $state.serverPid }
    $state.serverPid=0; $state.tunnelPid=0; $state.url=''
    $state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
    Write-Host 'Community stopped. Your database and images are preserved.'
    exit
}
if (-not (Test-OwnedProcess $state.serverPid $serverPath)) {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    $nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' }
    if (-not (Test-Path -LiteralPath $nodePath)) { throw 'Install Node.js 24 or newer, then run again.' }
    $env:TRUST_PROXY='1'; $env:PORT='3000'; $env:HOST='127.0.0.1'
    $proc = Start-Process -FilePath $nodePath -ArgumentList ('"' + $serverPath + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'server.log') -RedirectStandardError (Join-Path $runtimeDir 'server-error.log') -PassThru
    $state.serverPid=$proc.Id
    $state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
    $ready=$false
    for ($i=0;$i -lt 20;$i++) {
        Start-Sleep -Milliseconds 500
        if ($proc.HasExited) { throw ('Server failed to start. Read ' + (Join-Path $runtimeDir 'server-error.log')) }
        try { $health=Invoke-RestMethod 'http://127.0.0.1:3000/api/health'; if ($health.ok) { $ready=$true;break } } catch {}
    }
    if (-not $ready) { throw 'Server did not become ready.' }
}
Write-Host 'Local: http://127.0.0.1:3000'
if ($Share) {
    if (-not (Test-OwnedProcess $state.tunnelPid $state.tunnelExe)) {
        $cloudflared = Join-Path $runtimeDir 'cloudflared.exe'
        if (-not (Test-Path -LiteralPath $cloudflared)) {
            Invoke-WebRequest 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $cloudflared
        }
        $log=Join-Path $runtimeDir 'tunnel-error.log'
        $proc=Start-Process -FilePath $cloudflared -ArgumentList 'tunnel','--url','http://127.0.0.1:3000','--no-autoupdate' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'tunnel.log') -RedirectStandardError $log -PassThru
        $state.tunnelPid=$proc.Id; $state.tunnelExe=$cloudflared; $state.url=''
        $state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
        for ($i=0;$i -lt 60;$i++) {
            Start-Sleep -Seconds 1
            if ($proc.HasExited) { throw ('Tunnel failed. Read ' + $log) }
            $logText=Get-Content -LiteralPath $log -Raw -ErrorAction SilentlyContinue
            if ($logText -match 'https://[a-z0-9-]+\.trycloudflare\.com') { $state.url=$Matches[0];break }
        }
        if (-not $state.url) { throw ('No public address was returned. Read ' + $log) }
        $state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
    }
    $state.url | Set-Content -LiteralPath (Join-Path $projectRoot 'PUBLIC-URL.txt') -Encoding UTF8
    Write-Host ('Share with friends: ' + $state.url)
    Write-Host 'It may take several seconds for the public address to become available.'
}
Write-Host 'Keep this PC awake. Closing this window does not stop the server.'
