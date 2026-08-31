param(
    [string]$Version = "1.0.4191.47"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Target = Join-Path $ProjectRoot "third_party\webview2"
$Header = Join-Path $Target "build\native\include\WebView2.h"
$Lib = Join-Path $Target "build\native\x64\WebView2LoaderStatic.lib"

if ((Test-Path $Header) -and (Test-Path $Lib)) {
    Write-Host "WebView2 SDK already present: $Target"
    exit 0
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Target) | Out-Null
if (Test-Path $Target) { Remove-Item -Recurse -Force $Target }
New-Item -ItemType Directory -Force -Path $Target | Out-Null

$Temp = Join-Path $env:TEMP "Microsoft.Web.WebView2.$Version.nupkg"
$Uri = "https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/$Version"

Write-Host "Downloading Microsoft.Web.WebView2 $Version ..."
Invoke-WebRequest -Uri $Uri -OutFile $Temp -UseBasicParsing

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($Temp, $Target)
Remove-Item -Force $Temp

if (-not (Test-Path $Header)) { throw "WebView2.h not found after extraction." }
if (-not (Test-Path $Lib)) { throw "WebView2LoaderStatic.lib not found after extraction." }

Write-Host "WebView2 SDK ready: $Target"
