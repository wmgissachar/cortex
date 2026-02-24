#Requires -Version 5.1
<#
.SYNOPSIS
    Cortex setup script for Windows.
.DESCRIPTION
    Sets up Cortex on a fresh Windows machine:
    - Checks prerequisites (Node.js 20+, pnpm, Docker Desktop)
    - Starts PostgreSQL via Docker Compose
    - Installs dependencies, runs migrations & seed
    - Builds the MCP server
    - Generates .mcp.json with a fresh API key
.NOTES
    Run from the Cortex root directory: .\setup.ps1
#>

$ErrorActionPreference = "Stop"
$CortexRoot = $PSScriptRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Cortex Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Check Node.js ─────────────────────────────────────────────────────────

Write-Host "[1/9] Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = (node --version 2>$null)
    if (-not $nodeVersion) { throw "not found" }
    $major = [int]($nodeVersion -replace '^v','').Split('.')[0]
    if ($major -lt 20) {
        Write-Host "  Node.js $nodeVersion found, but v20+ is required." -ForegroundColor Red
        Write-Host "  Download from: https://nodejs.org/" -ForegroundColor Gray
        exit 1
    }
    Write-Host "  Node.js $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "  Node.js not found. Install v20+ from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# ── 2. Check / install pnpm ──────────────────────────────────────────────────

Write-Host "[2/9] Checking pnpm..." -ForegroundColor Yellow
$pnpmVersion = pnpm --version 2>$null
if ($pnpmVersion) {
    Write-Host "  pnpm $pnpmVersion" -ForegroundColor Green
} else {
    Write-Host "  pnpm not found. Installing via corepack..." -ForegroundColor Gray
    corepack enable
    corepack prepare pnpm@latest --activate
    $pnpmVersion = pnpm --version
    Write-Host "  pnpm $pnpmVersion installed" -ForegroundColor Green
}

# ── 3. Check Docker & start PostgreSQL ────────────────────────────────────────

Write-Host "[3/9] Starting PostgreSQL via Docker Compose..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version 2>$null
    if (-not $dockerVersion) { throw "not found" }
    Write-Host "  $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "  Docker not found. Install Docker Desktop from https://www.docker.com/products/docker-desktop/" -ForegroundColor Red
    Write-Host "  After installing, make sure Docker Desktop is running, then re-run this script." -ForegroundColor Gray
    exit 1
}

Push-Location $CortexRoot
docker compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Docker Compose failed. Is Docker Desktop running?" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location
Write-Host "  PostgreSQL container started" -ForegroundColor Green

# ── 4. Create .env from .env.example ──────────────────────────────────────────

Write-Host "[4/9] Checking .env..." -ForegroundColor Yellow
$envPath = Join-Path $CortexRoot ".env"
$envExamplePath = Join-Path $CortexRoot ".env.example"

if (Test-Path $envPath) {
    Write-Host "  .env already exists, keeping it" -ForegroundColor Green
} else {
    Copy-Item $envExamplePath $envPath
    # Generate a random JWT secret
    $jwtSecret = -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
    (Get-Content $envPath) -replace 'change-me-to-a-random-64-char-string', $jwtSecret | Set-Content $envPath
    Write-Host "  Created .env from .env.example (JWT secret auto-generated)" -ForegroundColor Green
    Write-Host "  >>> IMPORTANT: Edit .env and add your OPENAI_KEY and TAVILY_API_KEY <<<" -ForegroundColor Magenta
}

# ── 5. Install dependencies ──────────────────────────────────────────────────

Write-Host "[5/9] Installing dependencies..." -ForegroundColor Yellow
Push-Location $CortexRoot
pnpm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "  pnpm install failed" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location
Write-Host "  Dependencies installed" -ForegroundColor Green

# ── 6. Wait for PostgreSQL to be ready ────────────────────────────────────────

Write-Host "[6/9] Waiting for PostgreSQL to be ready..." -ForegroundColor Yellow
$maxRetries = 30
$retryCount = 0
while ($retryCount -lt $maxRetries) {
    $ready = docker compose -f (Join-Path $CortexRoot "docker-compose.yml") exec -T postgres pg_isready -U postgres 2>$null
    if ($LASTEXITCODE -eq 0) { break }
    $retryCount++
    Start-Sleep -Seconds 1
}
if ($retryCount -eq $maxRetries) {
    Write-Host "  PostgreSQL did not become ready in time" -ForegroundColor Red
    exit 1
}
Write-Host "  PostgreSQL is ready" -ForegroundColor Green

# ── 7. Run migrations & seed ─────────────────────────────────────────────────

Write-Host "[7/9] Running database migrations..." -ForegroundColor Yellow
Push-Location $CortexRoot
pnpm migrate
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Migrations failed" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location
Write-Host "  Migrations complete" -ForegroundColor Green

Write-Host "       Running database seed..." -ForegroundColor Yellow
Push-Location $CortexRoot
pnpm seed
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Seed failed" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location
Write-Host "  Database seeded" -ForegroundColor Green

# ── 8. Build MCP server ──────────────────────────────────────────────────────

Write-Host "[8/9] Building MCP server..." -ForegroundColor Yellow
Push-Location $CortexRoot
pnpm build:mcp
if ($LASTEXITCODE -ne 0) {
    Write-Host "  MCP build failed" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location
Write-Host "  MCP server built" -ForegroundColor Green

# ── 9. Generate .mcp.json with API key ────────────────────────────────────────

Write-Host "[9/9] Generating .mcp.json with API key..." -ForegroundColor Yellow

# Load .env for DATABASE_URL
$envContent = Get-Content $envPath
$envVars = @{}
foreach ($line in $envContent) {
    if ($line -match '^\s*([^#][^=]+)=(.*)$') {
        $envVars[$matches[1].Trim()] = $matches[2].Trim()
    }
}

$apiPort = if ($envVars['PORT']) { $envVars['PORT'] } else { "3000" }
$apiUrl = "http://localhost:$apiPort/v1"

# Start the API server briefly to create an API key
Write-Host "  Starting API server to generate API key..." -ForegroundColor Gray

$env:DATABASE_URL = $envVars['DATABASE_URL']
$env:JWT_SECRET = $envVars['JWT_SECRET']
$env:JWT_EXPIRES_IN = if ($envVars['JWT_EXPIRES_IN']) { $envVars['JWT_EXPIRES_IN'] } else { "15m" }
$env:JWT_REFRESH_EXPIRES_IN = if ($envVars['JWT_REFRESH_EXPIRES_IN']) { $envVars['JWT_REFRESH_EXPIRES_IN'] } else { "7d" }
$env:PORT = $apiPort
$env:HOST = if ($envVars['HOST']) { $envVars['HOST'] } else { "0.0.0.0" }
$env:LOG_LEVEL = "error"
$env:NODE_ENV = "development"

# Start API in background
$apiProcess = Start-Process -FilePath "node" -ArgumentList "--import","tsx","packages/api/src/index.ts" -WorkingDirectory $CortexRoot -PassThru -NoNewWindow -RedirectStandardOutput "NUL" -RedirectStandardError "NUL"

# Wait for API to be ready
$apiReady = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $null = Invoke-RestMethod -Uri "$apiUrl/../health" -Method Get -ErrorAction SilentlyContinue 2>$null
        $apiReady = $true
        break
    } catch {
        # Try alternative health check
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:$apiPort/v1/topics" -Method Get -ErrorAction SilentlyContinue 2>$null
            if ($response.StatusCode -lt 500) {
                $apiReady = $true
                break
            }
        } catch {}
    }
    Start-Sleep -Seconds 1
}

$mcpJsonPath = Join-Path $CortexRoot ".mcp.json"
$startJsPath = (Join-Path $CortexRoot "packages\mcp\start.js") -replace '\\', '\\\\'

if ($apiReady) {
    try {
        # Login as admin
        $loginBody = @{ email = "admin@cortex.local"; password = "admin123" } | ConvertTo-Json
        $loginResponse = Invoke-RestMethod -Uri "$apiUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
        $token = $loginResponse.access_token

        # Create API key
        $keyBody = @{ name = "mcp-agent" } | ConvertTo-Json
        $headers = @{ Authorization = "Bearer $token" }
        $keyResponse = Invoke-RestMethod -Uri "$apiUrl/auth/api-keys" -Method Post -Body $keyBody -ContentType "application/json" -Headers $headers
        $apiKey = $keyResponse.api_key

        # Write .mcp.json
        $mcpConfig = @"
{
  "mcpServers": {
    "cortex": {
      "command": "node",
      "args": ["$startJsPath"],
      "env": {
        "CORTEX_API_URL": "$apiUrl",
        "CORTEX_API_KEY": "$apiKey"
      }
    }
  }
}
"@
        Set-Content -Path $mcpJsonPath -Value $mcpConfig -Encoding UTF8
        Write-Host "  .mcp.json generated with fresh API key" -ForegroundColor Green
    } catch {
        Write-Host "  Could not auto-generate API key: $_" -ForegroundColor Yellow
        Write-Host "  You can create one manually later (see README.md)" -ForegroundColor Gray

        # Write .mcp.json with placeholder
        $mcpConfig = @"
{
  "mcpServers": {
    "cortex": {
      "command": "node",
      "args": ["$startJsPath"],
      "env": {
        "CORTEX_API_URL": "$apiUrl",
        "CORTEX_API_KEY": "YOUR_API_KEY_HERE"
      }
    }
  }
}
"@
        Set-Content -Path $mcpJsonPath -Value $mcpConfig -Encoding UTF8
        Write-Host "  .mcp.json generated with placeholder (fill in API key manually)" -ForegroundColor Yellow
    }
} else {
    Write-Host "  API server didn't start in time. .mcp.json will need manual setup." -ForegroundColor Yellow
    $mcpConfig = @"
{
  "mcpServers": {
    "cortex": {
      "command": "node",
      "args": ["$startJsPath"],
      "env": {
        "CORTEX_API_URL": "$apiUrl",
        "CORTEX_API_KEY": "YOUR_API_KEY_HERE"
      }
    }
  }
}
"@
    Set-Content -Path $mcpJsonPath -Value $mcpConfig -Encoding UTF8
}

# Stop the temporary API server
if ($apiProcess -and !$apiProcess.HasExited) {
    Stop-Process -Id $apiProcess.Id -Force -ErrorAction SilentlyContinue
}

# ── Done ──────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Cortex Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  1. Edit .env and add your API keys:" -ForegroundColor White
Write-Host "     - OPENAI_KEY   (required for AI features)" -ForegroundColor Gray
Write-Host "     - TAVILY_API_KEY (required for web research)" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Start the development servers:" -ForegroundColor White
Write-Host "     pnpm dev" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. Open the web UI:" -ForegroundColor White
Write-Host "     http://localhost:5173" -ForegroundColor Gray
Write-Host ""
Write-Host "  4. Login with:" -ForegroundColor White
Write-Host "     Email:    admin@cortex.local" -ForegroundColor Gray
Write-Host "     Password: admin123" -ForegroundColor Gray
Write-Host ""
Write-Host "  5. MCP integration for Claude Code:" -ForegroundColor White
Write-Host "     Copy .mcp.json to your project root, or add the" -ForegroundColor Gray
Write-Host "     'cortex' server entry to your existing .mcp.json." -ForegroundColor Gray
Write-Host "     See CLAUDE.md for the full integration guide." -ForegroundColor Gray
Write-Host ""
