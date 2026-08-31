$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$TargetDir = Join-Path $ProjectRoot "third_party\webview2-bootstrapper"
$Target = Join-Path $TargetDir "MicrosoftEdgeWebview2Setup.exe"
$Uri = "https://go.microsoft.com/fwlink/p/?LinkId=2124703"

function Test-PeFile([string]$Path) {
    if (-not (Test-Path $Path)) { return $false }
    $item = Get-Item $Path
    if ($item.Length -lt 100KB) { return $false }
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $b0 = $stream.ReadByte()
        $b1 = $stream.ReadByte()
        return ($b0 -eq 0x4D -and $b1 -eq 0x5A)
    } finally {
        $stream.Dispose()
    }
}

if (Test-PeFile $Target) {
    Write-Host "WebView2 Evergreen Bootstrapper already present: $Target"
    exit 0
}

New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
if (Test-Path $Target) { Remove-Item -Force $Target }

Write-Host "Downloading official Microsoft Edge WebView2 Evergreen Bootstrapper ..."
Invoke-WebRequest -Uri $Uri -OutFile $Target -UseBasicParsing

if (-not (Test-PeFile $Target)) {
    if (Test-Path $Target) { Remove-Item -Force $Target }
    throw "Downloaded WebView2 Bootstrapper is not a valid PE executable."
}

Write-Host "WebView2 Evergreen Bootstrapper ready: $Target"
