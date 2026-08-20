<#
.SYNOPSIS
  Registers (or removes) the Windows Scheduled Task that runs Chore Quest.

.DESCRIPTION
  The household's app should not depend on somebody having a window open. A
  power cut, a Windows update at 3am, or a stray Ctrl+C currently takes the
  chores down until a person notices - and takes the nightly backup and the
  certificate renewal with it.

  This registers a task that starts at boot, before anyone logs in, and runs as
  you rather than as SYSTEM. That last part is deliberate and not cosmetic:
  PostgreSQL is on this machine's *user* PATH and not the machine PATH, so a
  task running as SYSTEM would start perfectly and then fail every nightly
  backup. The app now finds pg_dump by absolute path regardless, but running as
  the account that owns the files is still the honest arrangement - it needs to
  read backend/.env and write into backend/storage.

.PARAMETER Remove
  Unregisters the task instead of creating it.

.EXAMPLE
  # In an ELEVATED PowerShell (right-click, Run as administrator):
  .\scripts\install-startup.ps1

.EXAMPLE
  .\scripts\install-startup.ps1 -Remove
#>
[CmdletBinding()]
param(
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'

$TaskName = 'Chore Quest'
$repoRoot = Split-Path -Parent $PSScriptRoot
$serveScript = Join-Path $repoRoot 'scripts\serve.mjs'

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]$identity
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error @"
This needs an elevated PowerShell.

A task that starts at boot - before anybody logs in - can only be registered by
an administrator. That is the whole point of it: a laptop that reboots for a
Windows update at 3am has to bring the household back up without waiting for
someone to sign in.

Close this window, right-click PowerShell, choose "Run as administrator", then:
  cd $repoRoot
  .\scripts\install-startup.ps1
"@
  }
}

Assert-Administrator

if ($Remove) {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Output "Removed the '$TaskName' task. Chore Quest will not start on its own any more."
  } else {
    Write-Output "There is no '$TaskName' task to remove."
  }
  return
}

# --- checks, before anything is registered -----------------------------------

if (-not (Test-Path $serveScript)) {
  Write-Error "Cannot find $serveScript. Run this from inside the repository."
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  Write-Error 'node is not on PATH for this account, so the task would have nothing to run.'
}

if (-not (Test-Path (Join-Path $repoRoot 'backend\.env'))) {
  Write-Error 'backend/.env does not exist. Chore Quest has nothing to start with.'
}

if (-not (Test-Path (Join-Path $repoRoot 'backend\dist\server.js'))) {
  Write-Warning 'backend/dist is missing. Run "npm run build" before the next reboot.'
}

# PostgreSQL has to be up before the app is useful. It is a service with
# Automatic start, so Windows handles the ordering - but if somebody has set it
# to Manual, the app will start into a database that is not there.
$pg = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pg -and $pg.StartType -ne 'Automatic') {
  Write-Warning "The PostgreSQL service start type is '$($pg.StartType)', not Automatic. After a reboot the database may not be running."
} elseif (-not $pg) {
  Write-Warning 'No PostgreSQL service found. The app will start but have no database.'
}

# --- the task ----------------------------------------------------------------

$action = New-ScheduledTaskAction -Execute $node -Argument "`"$serveScript`"" -WorkingDirectory $repoRoot

$trigger = New-ScheduledTaskTrigger -AtStartup
# Postgres and the network need a moment. The app tolerates neither being ready
# - the pool connects lazily and the certificate is read from disk - so this is
# about avoiding a pointless first restart rather than about correctness.
$trigger.Delay = 'PT30S'

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -RestartCount 10 `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew

# Run as the current user, whether or not anybody is logged in. S4U means
# Windows does not need the account password stored anywhere to do it.
$principal = New-ScheduledTaskPrincipal `
  -UserId "$env:USERDOMAIN\$env:USERNAME" `
  -LogonType S4U `
  -RunLevel Limited

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Output "Replaced the existing '$TaskName' task."
}

Register-ScheduledTask `
  -TaskName $TaskName `
  -Description 'Serves the household Chore Quest app. Starts at boot and restarts if it stops.' `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal | Out-Null

Write-Output @"

Registered '$TaskName'.

  Runs        $node "$serveScript"
  As          $env:USERDOMAIN\$env:USERNAME, whether logged in or not
  Starts      30 seconds after boot
  If it dies  Task Scheduler retries every minute, up to 10 times; the launcher
              itself also restarts the server with backoff before that
  Logs        backend\storage\logs\, one file per day, kept a fortnight

Start it now without rebooting:
  Start-ScheduledTask -TaskName '$TaskName'

Check on it:
  Get-ScheduledTask -TaskName '$TaskName' | Get-ScheduledTaskInfo

Stop it:
  Stop-ScheduledTask -TaskName '$TaskName'

Remove it:
  .\scripts\install-startup.ps1 -Remove

Anything already serving on port 443 will stop this from starting, so close the
window running "npm run serve" before starting the task.
"@
