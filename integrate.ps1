#Requires -Version 5.1
<#
.SYNOPSIS
    Connect any project to Cortex.
.DESCRIPTION
    Run this script from any project directory to wire up Cortex integration.
    It creates/updates .mcp.json and CLAUDE.md so that Claude Code agents
    in that project can access the shared Cortex knowledge base.

    Usage:
      cd C:\path\to\your-project
      C:\path\to\cortex\integrate.ps1

    Or from the Cortex directory:
      .\integrate.ps1 -TargetDir C:\path\to\your-project
.PARAMETER TargetDir
    The project directory to integrate. Defaults to the current directory.
#>
param(
    [string]$TargetDir = (Get-Location).Path
)

$ErrorActionPreference = "Stop"
$CortexRoot = $PSScriptRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Cortex Integration" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Cortex:  $CortexRoot" -ForegroundColor Gray
Write-Host "  Target:  $TargetDir" -ForegroundColor Gray
Write-Host ""

# ── Validate Cortex installation ──────────────────────────────────────────────

$cortexMcpJson = Join-Path $CortexRoot ".mcp.json"
$cortexSnippet = Join-Path $CortexRoot "cortex-claude-snippet.md"
$startJs = Join-Path $CortexRoot "packages\mcp\start.js"

if (-not (Test-Path $startJs)) {
    Write-Host "ERROR: Cortex MCP server not found at $startJs" -ForegroundColor Red
    Write-Host "  Run setup.ps1 first to install Cortex." -ForegroundColor Gray
    exit 1
}

if (-not (Test-Path $cortexSnippet)) {
    Write-Host "ERROR: cortex-claude-snippet.md not found in $CortexRoot" -ForegroundColor Red
    exit 1
}

# ── Read API key from Cortex .mcp.json ────────────────────────────────────────

$apiKey = $null
$apiUrl = "http://localhost:3000/v1"

if (Test-Path $cortexMcpJson) {
    $mcpConfig = Get-Content $cortexMcpJson -Raw | ConvertFrom-Json
    $cortexServer = $mcpConfig.mcpServers.cortex
    if ($cortexServer.env.CORTEX_API_KEY) {
        $apiKey = $cortexServer.env.CORTEX_API_KEY
        $apiUrl = $cortexServer.env.CORTEX_API_URL
    }
}

if (-not $apiKey) {
    Write-Host "WARNING: No API key found in $cortexMcpJson" -ForegroundColor Yellow
    Write-Host "  Run setup.ps1 first, or manually set the API key in the generated .mcp.json" -ForegroundColor Gray
    $apiKey = "YOUR_API_KEY_HERE"
}

# ── Validate target directory ─────────────────────────────────────────────────

if (-not (Test-Path $TargetDir)) {
    Write-Host "ERROR: Target directory does not exist: $TargetDir" -ForegroundColor Red
    exit 1
}

# ── Step 1: Create/update .mcp.json ───────────────────────────────────────────

Write-Host "[1/2] Setting up .mcp.json..." -ForegroundColor Yellow

$targetMcpJson = Join-Path $TargetDir ".mcp.json"
$startJsEscaped = $startJs -replace '\\', '\\\\'

$cortexEntry = @{
    command = "node"
    args = @($startJsEscaped)
    env = @{
        CORTEX_API_URL = $apiUrl
        CORTEX_API_KEY = $apiKey
    }
}

if (Test-Path $targetMcpJson) {
    # Merge into existing .mcp.json
    $existing = Get-Content $targetMcpJson -Raw | ConvertFrom-Json
    if (-not $existing.mcpServers) {
        $existing | Add-Member -NotePropertyName "mcpServers" -NotePropertyValue @{} -Force
    }

    # Check if cortex entry already exists
    if ($existing.mcpServers.cortex) {
        Write-Host "  .mcp.json already has a cortex entry — updating it" -ForegroundColor Gray
        $existing.mcpServers.cortex = $cortexEntry
    } else {
        Write-Host "  Adding cortex to existing .mcp.json" -ForegroundColor Gray
        $existing.mcpServers | Add-Member -NotePropertyName "cortex" -NotePropertyValue $cortexEntry -Force
    }

    $existing | ConvertTo-Json -Depth 10 | Set-Content $targetMcpJson -Encoding UTF8
} else {
    # Create new .mcp.json
    $newConfig = @{
        mcpServers = @{
            cortex = $cortexEntry
        }
    }
    $newConfig | ConvertTo-Json -Depth 10 | Set-Content $targetMcpJson -Encoding UTF8
}

Write-Host "  .mcp.json ready" -ForegroundColor Green

# ── Step 2: Create/update CLAUDE.md ───────────────────────────────────────────

Write-Host "[2/2] Setting up CLAUDE.md..." -ForegroundColor Yellow

$targetClaudeMd = Join-Path $TargetDir "CLAUDE.md"
$snippetContent = Get-Content $cortexSnippet -Raw

if (Test-Path $targetClaudeMd) {
    $existingContent = Get-Content $targetClaudeMd -Raw

    if ($existingContent -match "cortex_get_context") {
        Write-Host "  CLAUDE.md already contains Cortex instructions — skipping" -ForegroundColor Gray
        Write-Host "  (Delete the Cortex section manually if you want to replace it)" -ForegroundColor Gray
    } else {
        # Append Cortex snippet
        $separator = "`n`n---`n`n"
        $newContent = $existingContent.TrimEnd() + $separator + $snippetContent
        Set-Content $targetClaudeMd -Value $newContent -Encoding UTF8
        Write-Host "  Appended Cortex instructions to existing CLAUDE.md" -ForegroundColor Green
    }
} else {
    # Create new CLAUDE.md with just the Cortex snippet
    Set-Content $targetClaudeMd -Value $snippetContent -Encoding UTF8
    Write-Host "  Created CLAUDE.md with Cortex instructions" -ForegroundColor Green
}

# ── Done ──────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Integration Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Files created/updated in $TargetDir :" -ForegroundColor White
Write-Host "    .mcp.json  — MCP server config (Cortex connection)" -ForegroundColor Gray
Write-Host "    CLAUDE.md  — Agent instructions (how to use Cortex)" -ForegroundColor Gray
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Cyan
Write-Host "    1. Make sure Cortex is running:  cd $CortexRoot && pnpm dev" -ForegroundColor Gray
Write-Host "    2. Open Claude Code in $TargetDir" -ForegroundColor Gray
Write-Host "    3. The agent will automatically have access to Cortex tools" -ForegroundColor Gray
Write-Host "    4. Tell it: 'Call cortex_get_context to see the knowledge base'" -ForegroundColor Gray
Write-Host ""
