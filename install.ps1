# ReelForge installer for Windows 10/11 (PowerShell).
# Run from the ReelForge folder:  powershell -ExecutionPolicy Bypass -File install.ps1   (or double-click install.bat)
param([switch]$Yes)
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function Ok($m) { Write-Host "  [ok] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [!]  $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host "  [x]  $m" -ForegroundColor Red; Read-Host 'Press Enter to close'; exit 1 }
function Ask($q) { if ($Yes) { return $true }; $a = Read-Host "$q [Y/n]"; return ($a -eq '' -or $a -match '^[Yy]') }

Write-Host "`nReelForge installer`n" -ForegroundColor Cyan

# 1. Node.js 22+
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  if ((Get-Command winget -ErrorAction SilentlyContinue) -and (Ask 'Node.js is missing. Install Node.js LTS with winget?')) {
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    Fail 'Node.js installed. Close this window and run install.bat again (a new terminal picks up Node.js).'
  }
  Fail 'Node.js 22 or newer is required: https://nodejs.org (LTS). Then run install.bat again.'
}
$major = [int](node -p "process.versions.node.split('.')[0]")
if ($major -lt 22) { Fail "Node.js $(node -v) found; ReelForge needs 22 or newer. Update from https://nodejs.org" }
Ok "Node.js $(node -v)"

# 2. pnpm via Corepack
$pnpm = @('corepack', 'pnpm')
try { & corepack pnpm --version *> $null; if ($LASTEXITCODE -ne 0) { throw 'no corepack' } }
catch { Warn 'Corepack unavailable; using npx pnpm'; $pnpm = @('npx', '--yes', 'pnpm@10.28.0') }
function Pnpm { & $pnpm[0] $pnpm[1..($pnpm.Length - 1)] @args; if ($LASTEXITCODE -ne 0) { Fail "pnpm $args failed" } }
Ok "pnpm $(& $pnpm[0] $pnpm[1..($pnpm.Length - 1)] --version)"

# 3. ffmpeg
if (Get-Command ffmpeg -ErrorAction SilentlyContinue) { Ok ((ffmpeg -hide_banner -version | Select-Object -First 1)) }
else {
  Warn 'ffmpeg is not installed (needed to render videos).'
  if ((Get-Command winget -ErrorAction SilentlyContinue) -and (Ask 'Install ffmpeg now with winget (Gyan.FFmpeg)?')) {
    winget install -e --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements
    Warn 'ffmpeg installed. Open a NEW terminal (or restart start.bat) so Windows picks up the new PATH.'
  } else { Warn 'Skipping ffmpeg: install it later with "winget install Gyan.FFmpeg" or from https://ffmpeg.org' }
}

# 4. Dependencies
if ((Test-Path 'packages/runtime/dist/page/runtime.js') -and (Test-Path 'packages/cli/dist/index.js')) {
  Write-Host "`nInstalling runtime dependencies (prebuilt package)..." -ForegroundColor Cyan
  Pnpm install --prod --frozen-lockfile
} else {
  Write-Host "`nInstalling dependencies and building from source..." -ForegroundColor Cyan
  Pnpm install --frozen-lockfile
  Pnpm build
}
Ok 'Dependencies installed'

# 5. Chromium + environment check
Write-Host "`nChecking the environment..." -ForegroundColor Cyan
node packages/cli/bin/reelforge.js doctor --fix

Write-Host "`nReelForge is installed." -ForegroundColor Green
Write-Host '  Open the dashboard:  double-click start.bat'
Write-Host '  Command line:        reelforge.cmd --help'
Write-Host '  Documentation:       documentation\index.html'
if (-not $Yes) { Read-Host "`nPress Enter to close" }
