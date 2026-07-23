$ErrorActionPreference = 'Stop'

$workspace = 'D:\Documents\New project 2'
$logPath = Join-Path $workspace 'codex-marketplace-fix.log'
$fixedConfig = Join-Path $workspace 'config.chrome-repair.toml'
$targetConfig = 'D:\AgentData\codex\config.toml'
$marketplaceRoot = 'D:\AgentData\codex\.tmp\bundled-marketplaces\openai-bundled'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

function Write-FixLog([string]$Message) {
    "$(Get-Date -Format o) $Message" | Add-Content -LiteralPath $logPath
}

Write-FixLog 'Waiting for Codex desktop processes to exit.'
while (Get-Process -Name 'Codex' -ErrorAction SilentlyContinue) {
    Start-Sleep -Seconds 2
}
Start-Sleep -Seconds 3

Copy-Item -LiteralPath $targetConfig -Destination "$targetConfig.marketplace-backup-$stamp" -Force
Copy-Item -LiteralPath $fixedConfig -Destination $targetConfig -Force
Write-FixLog 'Replaced duplicate marketplace source with canonical D: path.'

if (Test-Path -LiteralPath $marketplaceRoot) {
    Move-Item -LiteralPath $marketplaceRoot -Destination "$marketplaceRoot.path-backup-$stamp"
    Write-FixLog 'Moved generated marketplace cache aside for clean regeneration.'
}

Write-FixLog 'Fix completed. Start Codex again.'
