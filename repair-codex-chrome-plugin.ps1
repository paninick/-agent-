$ErrorActionPreference = 'Stop'

$workspace = 'D:\Documents\New project 2'
$logPath = Join-Path $workspace 'chrome-plugin-repair.log'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$pluginRoot = 'D:\AgentData\codex\plugins\cache\openai-bundled\chrome'
$marketplaceRoot = 'D:\AgentData\codex\.tmp\bundled-marketplaces\openai-bundled'

function Write-RepairLog([string]$Message) {
    "$(Get-Date -Format o) $Message" | Add-Content -LiteralPath $logPath
}

Write-RepairLog 'Waiting for Codex desktop processes to exit.'
while (Get-Process -Name 'Codex' -ErrorAction SilentlyContinue) {
    Start-Sleep -Seconds 2
}

Start-Sleep -Seconds 3

if (Test-Path -LiteralPath $pluginRoot) {
    $pluginBackup = "$pluginRoot.repair-backup-$stamp"
    Move-Item -LiteralPath $pluginRoot -Destination $pluginBackup
    Write-RepairLog "Moved plugin cache to $pluginBackup"
}

if (Test-Path -LiteralPath $marketplaceRoot) {
    $marketplaceBackup = "$marketplaceRoot.repair-backup-$stamp"
    Move-Item -LiteralPath $marketplaceRoot -Destination $marketplaceBackup
    Write-RepairLog "Moved marketplace cache to $marketplaceBackup"
}

Write-RepairLog 'Repair completed. Start Codex again.'
