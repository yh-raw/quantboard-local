param(
  [switch]$Force,
  [switch]$AlsoRemoveEnvFiles
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\\..")
Set-Location $root

function Fail([string]$Message) {
  Write-Error $Message
  exit 1
}

$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) {
  Fail "git command not found. Install Git for Windows first."
}

if (-not (Test-Path ".git")) {
  Fail ".git directory not found. No local history to purge."
}

$filterRepo = Get-Command git-filter-repo -ErrorAction SilentlyContinue
if (-not $filterRepo) {
  Write-Host "git-filter-repo is required."
  Write-Host "Install options:"
  Write-Host "  - pip install git-filter-repo"
  Write-Host "  - or choco install git-filter-repo"
  exit 1
}

if (-not $Force) {
  Write-Host "This operation rewrites git history. Re-run with -Force to continue."
  exit 1
}

$status = git status --porcelain
if ($status) {
  Fail "Working tree is not clean. Commit/stash changes first."
}

$replaceFile = Join-Path $env:TEMP ("quantboard-replace-{0}.txt" -f ([Guid]::NewGuid().ToString("N")))

$replacements = New-Object System.Collections.Generic.List[string]
$replacements.Add("regex:ghp_[A-Za-z0-9]{30,}==>***REMOVED***")
$replacements.Add("regex:github_pat_[A-Za-z0-9_]{20,}==>***REMOVED***")
$replacements.Add("regex:AKIA[0-9A-Z]{16}==>***REMOVED***")
$replacements.Add("regex:-----BEGIN (RSA|OPENSSH|EC) PRIVATE KEY-----==>***REMOVED***")

if (Test-Path ".env") {
  $sensitiveKeys = @("GITHUB_SECRET", "NEXTAUTH_SECRET", "TELEGRAM_BOT_TOKEN", "MARKET_SYNC_CRON_TOKEN")
  $envLines = Get-Content ".env"
  foreach ($line in $envLines) {
    if ($line.TrimStart().StartsWith("#")) { continue }
    if ($line -notmatch '^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$') { continue }
    $key = $Matches[1]
    $value = $Matches[2]
    if (($sensitiveKeys -contains $key) -and -not [string]::IsNullOrWhiteSpace($value)) {
      $escaped = [Regex]::Escape($value)
      $replacements.Add("regex:$escaped==>***REMOVED***")
    }
  }
}

Set-Content -Path $replaceFile -Value $replacements -Encoding utf8

Write-Host "[purge-history] rewrite commit history (replace leaked tokens)..."
git filter-repo --replace-text $replaceFile --force

if ($AlsoRemoveEnvFiles) {
  Write-Host "[purge-history] remove .env and .env.* from all history..."
  git filter-repo --path-glob ".env*" --invert-paths --force
}

Remove-Item -Path $replaceFile -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "[purge-history] done."
Write-Host "Next steps:"
Write-Host "  1) Rotate all leaked secrets (GitHub OAuth Secret, NEXTAUTH_SECRET, Telegram token...)."
Write-Host "  2) Force push rewritten history:"
Write-Host "     git push --force --all"
Write-Host "     git push --force --tags"
