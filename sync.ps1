#requires -Version 5.1
<#
  dsh-stack sync
  ------------------------------------------------------------------
  把本机正在使用的插件 / Skill / desktop profile 配置同步回仓库，
  然后由你 git commit / push。install.ps1 负责反方向（仓库 -> 本机）。

  用法：
    powershell -ExecutionPolicy Bypass -File .\sync.ps1
    powershell -ExecutionPolicy Bypass -File .\sync.ps1 -DshRoot C:\DSH
    powershell -ExecutionPolicy Bypass -File .\sync.ps1 -DryRun
#>
[CmdletBinding()]
param(
  [string]$Repo = '',
  [string]$DshRoot = $(if (Test-Path 'D:\') { 'D:\DSH' } else { Join-Path $env:USERPROFILE 'DSH' }),
  [string]$ProfileName = 'desktop',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
if (-not $Repo) { $Repo = $PSScriptRoot }
if (-not $Repo) { throw '无法确定仓库根目录，请用 -Repo 指定。' }

function Write-Step([string]$msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok([string]$msg) { Write-Host "    $msg" -ForegroundColor Green }
function Write-Warn([string]$msg) { Write-Host "    [警告] $msg" -ForegroundColor Yellow }
function Write-Plan([string]$msg) { Write-Host "    [dry-run] $msg" -ForegroundColor DarkGray }

$Repo = (Resolve-Path -LiteralPath $Repo).Path
$stackPath = Join-Path $Repo 'stack.json'
if (-not (Test-Path -LiteralPath $stackPath)) { throw "找不到 stack.json：$stackPath" }
$stack = Get-Content -LiteralPath $stackPath -Raw -Encoding UTF8 | ConvertFrom-Json

function Invoke-Robocopy {
  param([string]$Source, [string]$Dest, [string[]]$ExtraExcludeDirs = @(), [string[]]$ExcludeFiles = @())
  $excludeDirs = @('node_modules', '.git', '__pycache__', '.cache') + $ExtraExcludeDirs
  $rcArgs = @($Source, $Dest, '/MIR', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:1', '/W:1')
  $rcArgs += '/XD'
  $rcArgs += $excludeDirs
  if ($ExcludeFiles.Count -gt 0) {
    $rcArgs += '/XF'
    $rcArgs += $ExcludeFiles
  }
  if ($DryRun) {
    Write-Plan "robocopy $Source -> $Dest"
    return $true
  }
  & robocopy @rcArgs | Out-Null
  $code = $LASTEXITCODE
  if ($code -ge 8) {
    Write-Warn "robocopy 失败（exit=$code）：$Source"
    return $false
  }
  return $true
}

# ------------------------------------------------------------------
# 1. 插件
# ------------------------------------------------------------------
Write-Step "同步插件到仓库"
$crosspet = Join-Path (Join-Path $env:LOCALAPPDATA 'CrossPet') 'dsh-plugin-crosspet'
$pluginDirs = @()
foreach ($p in $stack.plugins) {
  $src = if ($p.dir -eq 'crosspet') { $crosspet } else { Join-Path $DshRoot $p.dir }
  if (-not (Test-Path -LiteralPath $src)) { Write-Warn "源目录不存在，跳过：$src"; continue }
  $dst = Join-Path (Join-Path $Repo 'plugins') $p.dir
  if (-not (Test-Path -LiteralPath $dst) -and -not $DryRun) {
    New-Item -ItemType Directory -Path $dst -Force | Out-Null
  }
  $extra = @()
  if ($p.dir -eq 'tavern-style') { $extra = @('data', 'lab-workspace') }
  $files = @()
  if ($p.dir -eq 'dsh-remote-plugin') {
    $files = @('dsh-remote-mb-0.8.1.apk', 'dsh-remote-mb-0.8.1.zip', 'dsh-remote-mb-0.8.2.apk', 'dsh-remote-mb-0.8.2.zip')
  }
  if (Invoke-Robocopy -Source $src -Dest $dst -ExtraExcludeDirs $extra -ExcludeFiles $files) {
    Write-Ok $p.dir
    $pluginDirs += $p.dir
  }
}

# 发现仓库里新增的插件目录（未写进 stack.json 的）
$pluginsRoot = Join-Path $Repo 'plugins'
if (Test-Path -LiteralPath $pluginsRoot) {
  $known = @($stack.plugins | ForEach-Object { $_.dir })
  foreach ($d in (Get-ChildItem -LiteralPath $pluginsRoot -Directory)) {
    if ($known -contains $d.Name) { continue }
    $pkgFile = Join-Path $d.FullName 'package.json'
    if (-not (Test-Path -LiteralPath $pkgFile)) { continue }
    $pkg = Get-Content -LiteralPath $pkgFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $stack.plugins += [pscustomobject]@{
      dir      = $d.Name
      package  = $pkg.name
      version  = $pkg.version
      bundle   = $false
      linkPath = ($DshRoot + '/' + $d.Name).Replace('\', '/')
    }
    Write-Ok "发现新插件并登记：$($d.Name)（bundle=false，请按需加入 profile）"
  }
}

# 更新版本号
foreach ($p in $stack.plugins) {
  $pkgFile = Join-Path (Join-Path $pluginsRoot $p.dir) 'package.json'
  if (Test-Path -LiteralPath $pkgFile) {
    $pkg = Get-Content -LiteralPath $pkgFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $p.version = $pkg.version
    $p.package = $pkg.name
  }
}

# ------------------------------------------------------------------
# 2. Skill
# ------------------------------------------------------------------
Write-Step "同步 Skill 到仓库"
$liveSkills = Join-Path (Join-Path $env:USERPROFILE '.dsh') 'skills'
$devSkills = Join-Path $DshRoot 'skills'
$names = @()
foreach ($root in @($liveSkills, $devSkills)) {
  if (-not (Test-Path -LiteralPath $root)) { continue }
  $names += (Get-ChildItem -LiteralPath $root -Directory | Where-Object { $_.Name -ne '.stack-backups' } | ForEach-Object { $_.Name })
}
$names = $names | Sort-Object -Unique
$syncedSkills = @()
foreach ($name in $names) {
  $live = Join-Path $liveSkills $name
  $dev = Join-Path $devSkills $name
  $src = if (Test-Path -LiteralPath $live) { $live } else { $dev }
  if (Test-Path -LiteralPath $live -and Test-Path -LiteralPath $dev) {
    $liveTime = (Get-ChildItem -LiteralPath $live -Recurse -File | Measure-Object LastWriteTime -Maximum).Maximum
    $devTime = (Get-ChildItem -LiteralPath $dev -Recurse -File | Measure-Object LastWriteTime -Maximum).Maximum
    if ($devTime -gt $liveTime) { $src = $dev }
  }
  if (-not (Test-Path -LiteralPath $src)) { continue }
  $dst = Join-Path (Join-Path $Repo 'skills') $name
  if (Invoke-Robocopy -Source $src -Dest $dst) {
    Write-Ok $name
    $syncedSkills += $name
  }
}

# 更新 stack.json 的 skill 列表（保留已有项，补新项）
$existingSkillNames = @($stack.skills | ForEach-Object { $_.name })
foreach ($name in $syncedSkills) {
  if ($existingSkillNames -notcontains $name) {
    $stack.skills += [pscustomobject]@{ name = $name; files = 0 }
  }
}

# ------------------------------------------------------------------
# 3. profile 配置快照
# ------------------------------------------------------------------
Write-Step "快照 desktop profile 配置"
$profileDir = Join-Path (Join-Path $env:USERPROFILE '.dsh\profiles') $ProfileName
$pkgPath = Join-Path $profileDir 'package.json'
$patchPath = Join-Path $profileDir 'cordis.patch.yml'
$cfgDir = Join-Path $Repo 'config\profile-desktop'
if (-not (Test-Path -LiteralPath $cfgDir)) { New-Item -ItemType Directory -Path $cfgDir -Force | Out-Null }
if ((Test-Path -LiteralPath $pkgPath) -and (Test-Path -LiteralPath $patchPath)) {
  if ($DryRun) {
    Write-Plan "复制 package.json / cordis.patch.yml"
  } else {
    Copy-Item -LiteralPath $pkgPath -Destination (Join-Path $cfgDir 'package.json') -Force
    Copy-Item -LiteralPath $patchPath -Destination (Join-Path $cfgDir 'cordis.patch.yml') -Force
    # 快照里的本地插件路径统一成出厂默认 D:/DSH/<dir>，实际安装路径由 install.ps1 重写
    $snapPkgPath = Join-Path $cfgDir 'package.json'
    $snap = Get-Content -LiteralPath $snapPkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($p in $stack.plugins) {
      $link = 'link:D:/DSH/' + $p.dir
      $snap.dependencies | Add-Member -NotePropertyName $p.package -NotePropertyValue $link -Force
    }
    $snapJson = $snap | ConvertTo-Json -Depth 40
    [IO.File]::WriteAllText($snapPkgPath, $snapJson + "`n", (New-Object System.Text.UTF8Encoding($false)))
    Write-Ok "config/profile-desktop/*"
  }
} else {
  Write-Warn "找不到 profile 文件，跳过：$profileDir"
}

# ------------------------------------------------------------------
# 4. 写回 stack.json
# ------------------------------------------------------------------
if ($DryRun) {
  Write-Step "dry-run：不写 stack.json"
} else {
  $stack.generatedAt = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')
  $json = $stack | ConvertTo-Json -Depth 20
  [IO.File]::WriteAllText($stackPath, $json + "`n", (New-Object System.Text.UTF8Encoding($false)))
  Write-Step "已更新 stack.json"
  Write-Host ""
  Write-Host "接下来：" -ForegroundColor Cyan
  Write-Host "  git status"
  Write-Host "  git add -A"
  Write-Host '  git commit -m "sync: update plugins/skills/config"'
  Write-Host "  git push"
}
