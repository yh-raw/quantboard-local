param(
  [switch]$Apply
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\\..")
Set-Location $root

Write-Host "[prepare-github] project root: $root"

function Ensure-GitignoreEntry {
  param([Parameter(Mandatory = $true)][string]$Entry)

  if (-not (Test-Path ".gitignore")) {
    if ($Apply) {
      Set-Content -Path ".gitignore" -Value "$Entry`n" -Encoding utf8
    }
    return
  }

  $lines = Get-Content ".gitignore"
  $exists = $lines -contains $Entry
  if (-not $exists -and $Apply) {
    Add-Content -Path ".gitignore" -Value $Entry -Encoding utf8
  }
}

$requiredIgnore = @(
  ".env*",
  "/node_modules",
  "/.next/"
)

foreach ($entry in $requiredIgnore) {
  Ensure-GitignoreEntry -Entry $entry
}

$sensitiveEnvKeys = @(
  "GITHUB_SECRET",
  "GITHUB_ID",
  "NEXTAUTH_SECRET",
  "TELEGRAM_BOT_TOKEN",
  "MARKET_SYNC_CRON_TOKEN",
  "DATABASE_URL"
)

function IsPlaceholderValue {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return $true }
  $v = $Value.Trim().ToLowerInvariant()
  if ($v -match "replace-with|your-|example|placeholder|changeme|<|^xxx+$") { return $true }
  return $false
}

$warnings = New-Object System.Collections.Generic.List[string]
$errors = New-Object System.Collections.Generic.List[string]

if (Test-Path ".env") {
  $envLines = Get-Content ".env"
  foreach ($line in $envLines) {
    if ($line.TrimStart().StartsWith("#")) { continue }
    if ($line -notmatch '^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$') { continue }
    $key = $Matches[1]
    $value = $Matches[2]
    if ($sensitiveEnvKeys -contains $key) {
      if (-not (IsPlaceholderValue -Value $value)) {
        $warnings.Add(".env contains non-placeholder secret-like value for key: $key")
      }
    }
  }
}

$excludeDirPattern = "\\(node_modules|\.next|\.git|out|build|\.npm-cache|coverage)\\"
$tokenPatterns = @(
  @{ Name = "GitHub PAT"; Regex = "ghp_[A-Za-z0-9]{30,}" },
  @{ Name = "GitHub FineGrained PAT"; Regex = "github_pat_[A-Za-z0-9_]{20,}" },
  @{ Name = "AWS Access Key"; Regex = "AKIA[0-9A-Z]{16}" },
  @{ Name = "Private Key Header"; Regex = "-----BEGIN (RSA|OPENSSH|EC) PRIVATE KEY-----" }
)

$files = Get-ChildItem -Recurse -File | Where-Object {
  $_.FullName -notmatch $excludeDirPattern
}

foreach ($file in $files) {
  $rel = $file.FullName.Substring($root.Path.Length).TrimStart("\")
  if ($rel -eq ".env.example" -or $rel -eq "README.md") { continue }
  if ($file.Length -gt 2MB) { continue }

  try {
    $text = Get-Content -Path $file.FullName -Raw -ErrorAction Stop
  } catch {
    continue
  }

  foreach ($pattern in $tokenPatterns) {
    if ($text -match $pattern.Regex) {
      $errors.Add("$($pattern.Name) pattern found in $rel")
    }
  }
}

$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) {
  Write-Warning "[prepare-github] git command not found. Install Git for Windows before push."
} else {
  if (Test-Path ".git") {
    $trackedEnv = @()
    try {
      $trackedEnv = @(git ls-files | Where-Object { $_ -like ".env*" })
    } catch {
      $trackedEnv = @()
    }

    if ($trackedEnv.Count -gt 0) {
      $errors.Add("tracked env files in git index: $($trackedEnv -join ', ')")
      if ($Apply) {
        git rm --cached -- $trackedEnv | Out-Host
      }
    }
  } else {
    Write-Host "[prepare-github] .git not found (no local git history yet)."
  }
}

Write-Host ""
Write-Host "[prepare-github] security findings:"
if ($warnings.Count -eq 0 -and $errors.Count -eq 0) {
  Write-Host "  - none"
} else {
  $errors | ForEach-Object { Write-Host "  - [ERROR] $_" }
  $warnings | ForEach-Object { Write-Host "  - [WARN]  $_" }
}

Write-Host ""
if ($errors.Count -gt 0) {
  Write-Warning "[prepare-github] Blocking findings detected. Fix before publishing."
  exit 1
}

if ($warnings.Count -gt 0) {
  Write-Warning "[prepare-github] Non-blocking warnings found (.env local secrets). Ensure .env is never committed."
}

Write-Host "[prepare-github] OK. Ready for git init/add/commit/push."
