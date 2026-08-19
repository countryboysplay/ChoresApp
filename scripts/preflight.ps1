<#
.SYNOPSIS
    Chore Quest - Stage 0 pre-flight environment check (Windows 11 backend host).

.DESCRIPTION
    READ-ONLY. This script inspects the machine and reports findings. It does not
    install anything, does not modify power settings, does not touch PostgreSQL,
    and does not write outside the report file.

    Run it in the intended project parent folder, then paste the report back into
    the chat so Stage 0 findings reflect the real machine.

.EXAMPLE
    cd C:\Dev
    powershell -ExecutionPolicy Bypass -File .\chore-quest\scripts\preflight.ps1
#>

[CmdletBinding()]
param(
    [string]$ReportPath = "$PSScriptRoot\..\docs\preflight-report.txt",
    [int[]]$PortsToCheck = @(5173, 4173, 3000, 8080, 5432)
)

$ErrorActionPreference = 'Continue'
$lines = New-Object System.Collections.Generic.List[string]

function Add-Line { param([string]$Text) $lines.Add($Text); Write-Host $Text }
function Add-Section { param([string]$Title) Add-Line ""; Add-Line "=== $Title ===" }

function Get-CommandVersion {
    param([string]$Command, [string]$VersionArg = '--version')
    $cmd = Get-Command $Command -ErrorAction SilentlyContinue
    if (-not $cmd) { return $null }
    try {
        $raw = & $Command $VersionArg 2>&1 | Select-Object -First 1
        return [pscustomobject]@{ Path = $cmd.Source; Version = ($raw | Out-String).Trim() }
    } catch {
        return [pscustomobject]@{ Path = $cmd.Source; Version = 'present, version query failed' }
    }
}

Add-Line "CHORE QUEST - STAGE 0 PRE-FLIGHT REPORT"
Add-Line "Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss K')"

# ---------------------------------------------------------------- machine ----
Add-Section "Machine and OS"
$os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
Add-Line "Computer name : $env:COMPUTERNAME"
Add-Line "OS            : $($os.Caption) build $($os.BuildNumber)"
Add-Line "Architecture  : $env:PROCESSOR_ARCHITECTURE"
Add-Line "Local time    : $(Get-Date)"
Add-Line "Time zone     : $((Get-TimeZone).Id)  [spec requires scheduling in America/Chicago regardless]"

Add-Section "PowerShell"
Add-Line "Version       : $($PSVersionTable.PSVersion)"
Add-Line "Edition       : $($PSVersionTable.PSEdition)"
Add-Line "ExecutionPolicy (CurrentUser): $(Get-ExecutionPolicy -Scope CurrentUser)"
$pwshCore = Get-Command pwsh -ErrorAction SilentlyContinue
Add-Line "pwsh 7+ present: $(if ($pwshCore) { 'YES - ' + $pwshCore.Source } else { 'no (Windows PowerShell 5.1 is acceptable)' })"

# ------------------------------------------------------------------ tools ----
Add-Section "Required tooling"
foreach ($t in @(
    @{ Name = 'git';  Arg = '--version' },
    @{ Name = 'node'; Arg = '--version' },
    @{ Name = 'npm';  Arg = '--version' },
    @{ Name = 'npx';  Arg = '--version' }
)) {
    $info = Get-CommandVersion -Command $t.Name -VersionArg $t.Arg
    if ($info) { Add-Line ("{0,-6}: {1}   [{2}]" -f $t.Name, $info.Version, $info.Path) }
    else       { Add-Line ("{0,-6}: MISSING" -f $t.Name) }
}

$nodeInfo = Get-CommandVersion -Command node
if ($nodeInfo) {
    $major = 0
    if ($nodeInfo.Version -match 'v(\d+)\.') { $major = [int]$Matches[1] }
    if ($major -ge 20 -and $major % 2 -eq 0) { Add-Line "Node LTS check: OK (major $major)" }
    elseif ($major -gt 0)                    { Add-Line "Node LTS check: WARNING - major $major is not a supported LTS line (want 20 or 22)" }
}

Add-Section "Git configuration"
if (Get-Command git -ErrorAction SilentlyContinue) {
    Add-Line "user.name     : $(git config --global user.name)"
    Add-Line "user.email set: $(if (git config --global user.email) { 'yes' } else { 'NO' })"
    Add-Line "core.autocrlf : $(git config --global core.autocrlf)"
} else {
    Add-Line "git not available"
}

# ------------------------------------------------------------- postgresql ----
Add-Section "PostgreSQL"
$pgSvc = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue
if ($pgSvc) {
    foreach ($s in $pgSvc) { Add-Line "Service       : $($s.Name) - status $($s.Status), startup $((Get-CimInstance Win32_Service -Filter "Name='$($s.Name)'").StartMode)" }
} else {
    Add-Line "Service       : no postgresql* Windows service found"
}
$psqlInfo = Get-CommandVersion -Command psql
if ($psqlInfo) { Add-Line "psql          : $($psqlInfo.Version)   [$($psqlInfo.Path)]" }
else           { Add-Line "psql          : not on PATH (may still be installed under C:\Program Files\PostgreSQL\<ver>\bin)" }
$pgDirs = Get-ChildItem 'C:\Program Files\PostgreSQL' -Directory -ErrorAction SilentlyContinue
if ($pgDirs) { Add-Line "Install dirs  : $($pgDirs.Name -join ', ')" }

# ------------------------------------------------------------------ ports ----
Add-Section "Port availability"
foreach ($p in $PortsToCheck) {
    $listener = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
    if ($listener) {
        $procName = (Get-Process -Id ($listener | Select-Object -First 1).OwningProcess -ErrorAction SilentlyContinue).ProcessName
        Add-Line ("Port {0,-5}: IN USE by {1}" -f $p, $procName)
    } else {
        Add-Line ("Port {0,-5}: free" -f $p)
    }
}

# -------------------------------------------------------------- workspace ----
Add-Section "Project workspace"
$root = Resolve-Path "$PSScriptRoot\.." -ErrorAction SilentlyContinue
Add-Line "Repo root     : $root"
Add-Line "Current dir   : $((Get-Location).Path)"
try {
    $probe = Join-Path $root ".write-probe.tmp"
    'probe' | Out-File -FilePath $probe -Encoding ascii -ErrorAction Stop
    Remove-Item $probe -Force
    Add-Line "Writable      : YES"
} catch {
    Add-Line "Writable      : NO - $($_.Exception.Message)"
}
if (Test-Path (Join-Path $root '.git')) { Add-Line "Git repo      : already initialized" }
else { Add-Line "Git repo      : not initialized yet" }

$drive = Get-PSDrive -Name ((Get-Location).Drive.Name) -ErrorAction SilentlyContinue
if ($drive) { Add-Line ("Free space    : {0:N1} GB on {1}:" -f ($drive.Free / 1GB), $drive.Name) }

Add-Line "Data dir C:\ChoreQuestData exists: $(Test-Path 'C:\ChoreQuestData')  [not created by this script]"

# ------------------------------------------------------------------ power ----
Add-Section "Power / always-on (informational only - nothing changed)"
try {
    $plan = powercfg /getactivescheme 2>&1 | Out-String
    Add-Line $plan.Trim()
    Add-Line "NOTE: spec 34 requires the laptop stay awake while plugged in (screen may sleep)."
    Add-Line "      This script deliberately does NOT change power settings."
} catch {
    Add-Line "powercfg query failed: $($_.Exception.Message)"
}

# ----------------------------------------------------------------- output ----
Add-Section "Summary"
$missing = @()
foreach ($n in @('git','node','npm')) { if (-not (Get-Command $n -ErrorAction SilentlyContinue)) { $missing += $n } }
if ($missing.Count -gt 0) { Add-Line "BLOCKERS: missing $($missing -join ', ')" } else { Add-Line "Core tooling present: git, node, npm" }
if (-not $pgSvc -and -not $psqlInfo) { Add-Line "PostgreSQL not detected - required before Stage 3 (schema/migrations), not before Stage 1." }

try {
    $reportDir = Split-Path $ReportPath -Parent
    if (-not (Test-Path $reportDir)) { New-Item -ItemType Directory -Path $reportDir -Force | Out-Null }
    $lines | Out-File -FilePath $ReportPath -Encoding utf8
    Write-Host ""
    Write-Host "Report written to: $ReportPath" -ForegroundColor Green
} catch {
    Write-Warning "Could not write report file: $($_.Exception.Message)"
}
