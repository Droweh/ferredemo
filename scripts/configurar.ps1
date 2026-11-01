# FerroMax · configurador de la demo
# Se ejecuta desde configurar.bat. Valida los datos, genera public/js/config.js
# y, si GitHub CLI está disponible, carga los secretos del repositorio.

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function Write-Step {
  param([string]$Text)
  Write-Host ""
  Write-Host "  $Text" -ForegroundColor Yellow
}

function Write-Ok {
  param([string]$Text)
  Write-Host "  [OK] $Text" -ForegroundColor Green
}

function Write-Warn {
  param([string]$Text)
  Write-Host "  [!] $Text" -ForegroundColor Yellow
}

function Write-Fail {
  param([string]$Text)
  Write-Host "  [X] $Text" -ForegroundColor Red
}

function Test-Command {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-ServiceKey {
  param([string]$Key)

  if ([string]::IsNullOrWhiteSpace($Key)) { return $false }
  if ($Key.StartsWith('sb_secret_') -or $Key -match 'service_role') { return $true }

  if ($Key -match '^eyJ') {
    try {
      $parts = $Key.Split('.')
      if ($parts.Count -ge 2) {
        $payload = $parts[1].Replace('-', '+').Replace('_', '/')
        while (($payload.Length % 4) -ne 0) { $payload += '=' }
        $json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload))
        if ($json -match '"role"\s*:\s*"service_role"') { return $true }
      }
    } catch {
      return $false
    }
  }

  return $false
}

function Write-ConfigFile {
  param(
    [string]$Root,
    [string]$Mode,
    [string]$Url,
    [string]$Key,
    [string]$Turnstile
  )

  $configPath = Join-Path $Root 'public\js\config.js'
  $configDir = Split-Path -Parent $configPath
  if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Force -Path $configDir | Out-Null
  }

  $config = [ordered]@{
    mode = $Mode
    supabaseUrl = $Url
    supabaseAnonKey = $Key
    turnstileSiteKey = $Turnstile
  }

  $json = $config | ConvertTo-Json -Depth 4
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
  $content = @"
/* FerroMax · configuración generada por configurar.bat ($stamp).
   Este archivo contiene solo datos públicos. Nunca pongas una service_role acá. */
window.FERROMAX_CONFIG = $json;
"@

  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($configPath, $content, $utf8)
  return $configPath
}

function Configure-GitHubSecrets {
  param(
    [string]$Root,
    [string]$Url,
    [string]$Key,
    [string]$Turnstile
  )

  Write-Step 'Conexión con GitHub Pages (opcional)'

  if (-not (Test-Command 'git')) {
    Write-Warn 'Git no está instalado.'
    Write-Host '     Instalalo desde https://git-scm.com/download/win o con: winget install Git.Git'
    Write-Host '     Después subí el proyecto a GitHub y cargá los secretos manualmente (ver README.md).'
    return
  }
  if (-not (Test-Command 'gh')) {
    Write-Warn 'GitHub CLI no está instalado.'
    Write-Host '     Instalalo desde https://cli.github.com/ o con: winget install GitHub.cli'
    Write-Host '     Después ejecutá: gh auth login'
    Write-Host '     También podés cargar SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY y TURNSTILE_SITE_KEY'
    Write-Host '     a mano en Settings > Secrets and variables > Actions.'
    return
  }

  Push-Location $Root
  try {
    gh auth status *> $null
    if ($LASTEXITCODE -ne 0) {
      Write-Warn 'GitHub CLI no tiene sesión iniciada.'
      Write-Host '     Ejecutá en una terminal: gh auth login'
      return
    }

    git rev-parse --is-inside-work-tree *> $null
    if ($LASTEXITCODE -ne 0) {
      Write-Warn 'Esta carpeta todavía no es un repositorio Git.'
      Write-Host '     Creá uno, subilo a GitHub y volvé a ejecutar configurar.bat, o cargá los secretos a mano.'
      return
    }

    $repoJson = gh repo view --json nameWithOwner,visibility,defaultBranchRef 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $repoJson) {
      Write-Warn 'No pudimos detectar un repositorio de GitHub para esta carpeta.'
      Write-Host '     Creá el repositorio con: gh repo create ferromax-demo --public --source=. --push'
      return
    }

    $repo = $repoJson | ConvertFrom-Json
    Write-Host "     Repositorio detectado: $($repo.nameWithOwner) ($($repo.visibility))"
    if ($repo.visibility -ne 'PUBLIC') {
      Write-Warn 'GitHub Pages gratuito requiere un repositorio público.'
    }

    $answer = Read-Host '  ¿Cargar los datos como secretos de GitHub Actions ahora? (s/n) [s]'
    if ($answer -and $answer -notmatch '^[sS]') {
      Write-Host '     Saltado. Podés cargarlos después desde la configuración del repositorio.'
      return
    }

    Write-Host '     Cargando secretos...'
    gh secret set SUPABASE_URL --body $Url
    if ($LASTEXITCODE -ne 0) { throw 'No pudimos cargar SUPABASE_URL.' }

    gh secret set SUPABASE_PUBLISHABLE_KEY --body $Key
    if ($LASTEXITCODE -ne 0) { throw 'No pudimos cargar SUPABASE_PUBLISHABLE_KEY.' }

    if ($Turnstile) {
      gh secret set TURNSTILE_SITE_KEY --body $Turnstile
      if ($LASTEXITCODE -ne 0) { throw 'No pudimos cargar TURNSTILE_SITE_KEY.' }
    } else {
      gh secret delete TURNSTILE_SITE_KEY 2>$null
    }

    Write-Ok 'Secretos cargados en el repositorio.'
    Write-Host '     En GitHub: Settings > Pages > Build and deployment > Source: GitHub Actions.'

    $workflowJson = gh workflow list --json name 2>$null
    if ($LASTEXITCODE -eq 0 -and $workflowJson) {
      $workflows = $workflowJson | ConvertFrom-Json
      $hasDeploy = $workflows | Where-Object { $_.name -eq 'Publicar en GitHub Pages' }
      if ($hasDeploy) {
        $deploy = Read-Host '  ¿Disparar el deploy ahora? (s/n) [n]'
        if ($deploy -match '^[sS]') {
          gh workflow run deploy.yml
          if ($LASTEXITCODE -eq 0) {
            Write-Ok 'Deploy solicitado. Revisá la pestaña Actions de GitHub.'
          } else {
            Write-Warn 'No pudimos disparar el deploy. Revisá que el workflow esté en la rama principal.'
          }
        }
      } else {
        Write-Host '     El workflow todavía no está en GitHub. Hacé commit y push para que aparezca.'
      }
    }
  } catch {
    Write-Fail $_.Exception.Message
    Write-Host '     La configuración local sí quedó guardada. Podés cargar los secretos manualmente.'
  } finally {
    Pop-Location
  }
}

try {
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  $OutputEncoding = $utf8
  [Console]::OutputEncoding = $utf8

  $root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
  $configPath = Join-Path $root 'public\js\config.js'

  Write-Host ""
  Write-Host "  ============================================================" -ForegroundColor DarkGray
  Write-Host "   FERROMAX / CONECTAR LA DEMO" -ForegroundColor White
  Write-Host "  ============================================================" -ForegroundColor DarkGray
  Write-Host "   Este asistente genera la configuración pública del sitio." -ForegroundColor Gray
  Write-Host "   La service_role NUNCA se usa en el navegador." -ForegroundColor Gray
  Write-Host ""

  $modeInput = (Read-Host '  Modo: [1] Supabase + demo en línea  /  [2] Solo demo local  [1]').Trim()
  $mode = 'supabase'
  if ($modeInput -eq '2' -or $modeInput -match '^local$') { $mode = 'local' }

  $url = ''
  $key = ''
  $turnstile = ''

  if ($mode -eq 'supabase') {
    Write-Step '1 de 3 · Datos del proyecto Supabase'
    Write-Host '     Dashboard > Project Settings > API. Copiá la Project URL.' -ForegroundColor Gray

    while ([string]::IsNullOrWhiteSpace($url)) {
      $raw = (Read-Host '  Project URL (https://...supabase.co)').Trim()
      if (-not $raw) { Write-Warn 'La URL es obligatoria.'; continue }
      $raw = $raw.TrimEnd('/')
      $raw = $raw -replace '/(rest|auth|storage)/v1$', ''
      $uri = $null
      if (-not [Uri]::TryCreate($raw, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -ne 'https') {
        Write-Warn 'Ingresá una URL absoluta que empiece con https://'
        continue
      }
      if ($uri.AbsolutePath.Trim('/') -ne '') {
        Write-Warn 'Usá solo el origen, por ejemplo https://tu-proyecto.supabase.co (sin /rest/v1 ni otras rutas).'
        continue
      }
      $url = $raw
    }
    Write-Ok "URL: $url"

    while ([string]::IsNullOrWhiteSpace($key)) {
      $rawKey = (Read-Host '  Publishable key / anon public key').Trim()
      if (-not $rawKey) { Write-Warn 'La clave es obligatoria.'; continue }
      if (Test-ServiceKey $rawKey) {
        Write-Fail 'Esa es una clave secreta (service_role / sb_secret_). No se puede usar en el navegador.'
        Write-Host '         Copiá la publishable key o la anon public key.' -ForegroundColor Gray
        continue
      }
      if ($rawKey.Length -lt 20) {
        Write-Warn 'La clave parece demasiado corta. Revisala.'
        continue
      }
      if (-not ($rawKey.StartsWith('sb_publishable_') -or $rawKey.StartsWith('eyJ'))) {
        Write-Warn 'La clave no tiene el formato esperado (sb_publishable_ o JWT anon). Se usará igual.'
      }
      $key = $rawKey
    }
    Write-Ok "Clave pública: ...$($key.Substring([Math]::Max(0, $key.Length - 6)))"

    Write-Step '2 de 3 · Cloudflare Turnstile (gratis)'
    Write-Host '     Dashboard de Turnstile > Add site > dominio de GitHub Pages.' -ForegroundColor Gray
    Write-Host '     La secret key va en Supabase Auth > Attack Protection, no acá.' -ForegroundColor Gray
    $turnstile = (Read-Host '  Site key de Turnstile (Enter para omitir)').Trim()
    if ([string]::IsNullOrWhiteSpace($turnstile)) {
      Write-Warn 'Turnstile no configurado. Si Supabase exige captcha, el registro fallará.'
    } else {
      if ($turnstile -notmatch '^[01]x[0-9A-Za-z_-]+$') {
        Write-Warn 'La site key no parece estándar. Verificá que no sea la secret key.'
      }
      Write-Ok 'Site key guardada.'
    }
  } else {
    Write-Step '1 de 3 · Demo local'
    Write-Host '     Se usarán localStorage + IndexedDB. No requiere internet ni Supabase.' -ForegroundColor Gray
  }

  Write-Step '3 de 3 · Guardando configuración'
  $written = Write-ConfigFile -Root $root -Mode $mode -Url $url -Key $key -Turnstile $turnstile
  Write-Ok "Configuración guardada en: $written"

  if ($mode -eq 'local') {
    Write-Host ""
    Write-Host '  DEMO LOCAL LISTA' -ForegroundColor Cyan
    Write-Host '  Admin:   admin@ferromax.com / Admin1234!' -ForegroundColor Gray
    Write-Host '  Cliente: cliente@ferromax.com / Cliente1234!' -ForegroundColor Gray
    Write-Host '  Abrí index.html con un servidor local para probar.' -ForegroundColor Gray
    Write-Host '  Para publicar en GitHub Pages, volvé a ejecutar en modo Supabase.' -ForegroundColor Gray
  } else {
    Write-Host ""
    Write-Host '  SUPABASE CONFIGURADO EN EL NAVEGADOR' -ForegroundColor Cyan
    Write-Host '  Recordá aplicar las migraciones de supabase/migrations y crear el admin.' -ForegroundColor Gray
    Configure-GitHubSecrets -Root $root -Url $url -Key $key -Turnstile $turnstile
  }

  Write-Host ""
  Write-Host '  Revisá README.md para el paso a paso completo.' -ForegroundColor Gray
  exit 0
} catch {
  Write-Host ""
  Write-Fail $_.Exception.Message
  exit 1
}
