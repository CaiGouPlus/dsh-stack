#requires -Version 5.1
<#
  dsh-stack installer
  ------------------------------------------------------------------
  把本仓库里的插件 / Skill / desktop profile 配置装到本机 DSH。

  设计原则：
  - 插件原路径 D:\DSH\<插件名> 用 junction 指回仓库，保留插件内写死的
    D:/DSH/... 默认路径，profile 的 link: 依赖也无需改写。
  - profile package.json 与 cordis.patch.yml 按“只补缺失”合并，已有配置优先。
  - 所有被覆盖的内容先备份到 %USERPROFILE%\.dsh\.stack-backups\<时间>。
  - 默认幂等：重复运行不会重复添加。

  典型用法：
    powershell -ExecutionPolicy Bypass -File .\install.ps1
    powershell -ExecutionPolicy Bypass -File .\install.ps1 -DshRoot C:\DSH
    powershell -ExecutionPolicy Bypass -File .\install.ps1 -DryRun
#>
[CmdletBinding()]
param(
  # 仓库根目录（默认脚本所在目录）
  [string]$Repo = '',

  # 插件在磁盘上的“原路径”根目录。默认 D:\DSH；没有 D 盘时退到 %USERPROFILE%\DSH
  [string]$DshRoot = $(if (Test-Path 'D:\') { 'D:\DSH' } else { Join-Path $env:USERPROFILE 'DSH' }),

  # DSH profile 名（桌面端默认 desktop）
  [string]$ProfileName = 'desktop',

  # 仅供测试：直接指定 profile 目录
  [string]$ProfileDir = '',

  # cordis.patch.yml 处理方式：merge=按 id 补缺失；replace=整份替换；skip=不动
  [ValidateSet('merge', 'replace', 'skip')]
  [string]$PatchMode = 'merge',

  [switch]$SkipDeps,
  [switch]$SkipSkills,
  [switch]$SkipEnv,
  [switch]$DryRun,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
if (-not $Repo) { $Repo = $PSScriptRoot }
if (-not $Repo) { throw '无法确定仓库根目录，请用 -Repo 指定。' }

function Write-Step([string]$msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok([string]$msg) { Write-Host "    $msg" -ForegroundColor Green }
function Write-Warn([string]$msg) { Write-Host "    [警告] $msg" -ForegroundColor Yellow }
function Write-Plan([string]$msg) { Write-Host "    [dry-run] $msg" -ForegroundColor DarkGray }

# ------------------------------------------------------------------
# 0. 基本检查
# ------------------------------------------------------------------
$Repo = (Resolve-Path -LiteralPath $Repo).Path
$stackPath = Join-Path $Repo 'stack.json'
if (-not (Test-Path -LiteralPath $stackPath)) {
  throw "找不到 stack.json：$stackPath（请在仓库根目录运行）"
}
$stack = Get-Content -LiteralPath $stackPath -Raw -Encoding UTF8 | ConvertFrom-Json

if (-not $ProfileDir) {
  $ProfileDir = Join-Path (Join-Path $env:USERPROFILE '.dsh\profiles') $ProfileName
}
$ProfileDir = [IO.Path]::GetFullPath($ProfileDir)
if (-not (Test-Path -LiteralPath $ProfileDir)) {
  throw "找不到 DSH profile 目录：$ProfileDir`n请先安装并启动一次 DSH Desktop（生成 profile 后完全退出），再运行本脚本。"
}

$pkgPath = Join-Path $ProfileDir 'package.json'
$patchPath = Join-Path $ProfileDir 'cordis.patch.yml'
if (-not (Test-Path -LiteralPath $pkgPath)) {
  throw "profile 缺少 package.json：$pkgPath"
}

if (-not $DryRun) {
  $running = Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue
  if ($running -and -not $Force) {
    throw "检测到 DSH 正在运行（$($running.Count) 个进程）。请先从托盘完全退出 DSH 再运行；确认无碍可加 -Force。"
  }
}

$backupRoot = Join-Path (Join-Path $env:USERPROFILE '.dsh\.stack-backups') $stamp
function New-BackupDir {
  if (-not (Test-Path -LiteralPath $backupRoot)) {
    New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
  }
}

Write-Host "dsh-stack installer" -ForegroundColor White
Write-Host "  仓库:    $Repo"
Write-Host "  DshRoot: $DshRoot"
Write-Host "  Profile: $ProfileDir"
Write-Host "  模式:    $(if ($DryRun) {'dry-run'} else {'apply'}) / patch=$PatchMode"

# ------------------------------------------------------------------
# 1. junction：D:\DSH\<插件> -> 仓库 plugins\<插件>
# ------------------------------------------------------------------
function Test-IsReparsePoint($item) {
  return (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)
}

function Ensure-Junction {
  param([string]$Path, [string]$Target)

  $targetFull = [IO.Path]::GetFullPath($Target)
  if (-not (Test-Path -LiteralPath $targetFull)) {
    Write-Warn "源目录不存在，跳过：$targetFull"
    return $false
  }

  $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
  if ($item) {
    if (Test-IsReparsePoint $item) {
      $now = @($item.Target) | Select-Object -First 1
      if ($now) {
        try { $now = [IO.Path]::GetFullPath([string]$now) } catch { }
        if ($now -ieq $targetFull) {
          Write-Ok "已就绪：$Path"
          return $true
        }
      }
    }
    if ($DryRun) {
      Write-Plan "将替换 $Path 为指向 $Target 的 junction"
      return $true
    }
    if (-not $Force) {
      Write-Warn "已存在且不是指向仓库的 junction，跳过：$Path（确认要替换可加 -Force）"
      return $false
    }
    $leaf = Split-Path -Leaf $Path
    $oldName = "$leaf.stack-old-$stamp"
    Rename-Item -LiteralPath $Path -NewName $oldName
    Write-Ok "旧目录已改名：$(Join-Path (Split-Path -Parent $Path) $oldName)"
  }

  if ($DryRun) {
    Write-Plan "创建 junction：$Path -> $Target"
    return $true
  }
  $parent = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }
  New-Item -ItemType Junction -Path $Path -Target $targetFull | Out-Null
  Write-Ok "junction：$Path -> $Target"
  return $true
}

Write-Step "恢复插件路径（junction）"
$linked = 0
foreach ($p in $stack.plugins) {
  $src = Join-Path (Join-Path $Repo 'plugins') $p.dir
  $dst = Join-Path $DshRoot $p.dir
  if (Ensure-Junction -Path $dst -Target $src) { $linked++ }
}
Write-Ok "插件 junction：$linked / $($stack.plugins.Count)"

Write-Step "恢复 D:\DSH\skills（供插件里写死的 D:/DSH/skills 默认路径使用）"
$skillsSrc = Join-Path $Repo 'skills'
$skillsLink = Join-Path $DshRoot 'skills'
if (Test-Path -LiteralPath $skillsLink) {
  $it = Get-Item -LiteralPath $skillsLink -Force
  if (-not (Test-IsReparsePoint $it)) {
    Write-Warn "$skillsLink 已存在且不是 junction（本机原有 skill 目录），保留不动；Skill 仍会复制到 ~/.dsh/skills。"
  } else {
    Ensure-Junction -Path $skillsLink -Target $skillsSrc | Out-Null
  }
} else {
  Ensure-Junction -Path $skillsLink -Target $skillsSrc | Out-Null
}

# ------------------------------------------------------------------
# 2. profile package.json：合并 link: 依赖与 bundles
# ------------------------------------------------------------------
function Merge-ProfileJson {
  param([string]$Path, [string]$SnapshotPath)

  $existing = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
  $snap = Get-Content -LiteralPath $SnapshotPath -Raw -Encoding UTF8 | ConvertFrom-Json

  # dependencies
  if (-not $existing.PSObject.Properties['dependencies']) {
    $existing | Add-Member -NotePropertyName dependencies -NotePropertyValue ([pscustomobject]@{})
  }
  foreach ($p in $stack.plugins) {
    $link = 'link:' + ((Join-Path $DshRoot $p.dir).Replace('\', '/'))
    $existing.dependencies | Add-Member -NotePropertyName $p.package -NotePropertyValue $link -Force
  }
  # 快照里的非本地依赖（npm 包）也补上；本地包路径已按 DshRoot 重新生成，不能直接用快照
  $localNames = @($stack.plugins | ForEach-Object { $_.package })
  foreach ($prop in $snap.dependencies.PSObject.Properties) {
    if ($localNames -contains $prop.Name) { continue }
    $existing.dependencies | Add-Member -NotePropertyName $prop.Name -NotePropertyValue $prop.Value -Force
  }

  # dsh.profile.bundles：以快照顺序为准，再补本机多出来的
  if (-not $existing.PSObject.Properties['dsh']) {
    $existing | Add-Member -NotePropertyName dsh -NotePropertyValue ([pscustomobject]@{})
  }
  if (-not $existing.dsh.PSObject.Properties['profile']) {
    $existing.dsh | Add-Member -NotePropertyName profile -NotePropertyValue ([pscustomobject]@{})
  }
  if (-not $existing.dsh.profile.PSObject.Properties['bundles']) {
    $existing.dsh.profile | Add-Member -NotePropertyName bundles -NotePropertyValue @()
  }
  $merged = New-Object System.Collections.ArrayList
  foreach ($b in @($snap.dsh.profile.bundles)) {
    if ($b -and -not $merged.Contains($b)) { [void]$merged.Add($b) }
  }
  foreach ($b in @($existing.dsh.profile.bundles)) {
    if ($b -and -not $merged.Contains($b)) { [void]$merged.Add($b) }
  }
  $existing.dsh.profile.bundles = @($merged)

  $json = ($existing | ConvertTo-Json -Depth 40) -replace "`r`n", "`n"
  [IO.File]::WriteAllText($Path, $json + "`n", (New-Object System.Text.UTF8Encoding($false)))
}

Write-Step "合并 profile package.json"
$snapPkg = Join-Path (Join-Path $Repo 'config\profile-desktop') 'package.json'
if (-not (Test-Path -LiteralPath $snapPkg)) { throw "缺少快照：$snapPkg" }
if ($DryRun) {
  Write-Plan "将合并 $(@($stack.plugins).Count) 个 link: 依赖，并补齐 bundles"
} else {
  New-BackupDir
  Copy-Item -LiteralPath $pkgPath -Destination (Join-Path $backupRoot 'package.json') -Force
  Merge-ProfileJson -Path $pkgPath -SnapshotPath $snapPkg
  Write-Ok "package.json 已合并（备份：$backupRoot\package.json）"
}

# ------------------------------------------------------------------
# 3. cordis.patch.yml：按 id 去重合并
# ------------------------------------------------------------------
function Get-TopLevelBlocks {
  param([string]$Text)
  $lines = $Text -split "`r?`n"
  $blocks = New-Object System.Collections.ArrayList
  $cur = $null
  foreach ($line in $lines) {
    if ($line -match '^- ') {
      if ($null -ne $cur) { [void]$blocks.Add($cur.ToString().TrimEnd()) }
      $cur = New-Object System.Text.StringBuilder
      [void]$cur.AppendLine($line)
    } elseif ($null -ne $cur) {
      [void]$cur.AppendLine($line)
    }
  }
  if ($null -ne $cur) { [void]$blocks.Add($cur.ToString().TrimEnd()) }
  return $blocks
}

function Get-BlockKey {
  param([string]$Block)
  if ($Block -match '(?m)^- id:\s*(.+)$') {
    return $Matches[1].Trim().Trim([char[]]@("'", '"'))
  }
  if ($Block -match '(?m)^- insert:') {
    if ($Block -match '(?m)^\s+-\s+id:\s*(.+)$') {
      return 'insert:' + $Matches[1].Trim().Trim([char[]]@("'", '"'))
    }
  }
  return $null
}

function Merge-CordisPatch {
  param([string]$Path, [string]$SnapshotPath, [string]$Mode)

  if ($Mode -eq 'skip') { return 'skip' }
  if ($Mode -eq 'replace' -or -not (Test-Path -LiteralPath $Path)) {
    Copy-Item -LiteralPath $SnapshotPath -Destination $Path -Force
    return 'replace'
  }

  $existing = (Get-Content -LiteralPath $Path -Raw -Encoding UTF8).Replace("`r`n", "`n")
  if ([string]::IsNullOrWhiteSpace($existing)) {
    Copy-Item -LiteralPath $SnapshotPath -Destination $Path -Force
    return 'replace-empty'
  }
  $snap = (Get-Content -LiteralPath $SnapshotPath -Raw -Encoding UTF8).Replace("`r`n", "`n")

  $ids = @{}
  foreach ($b in (Get-TopLevelBlocks $existing)) {
    $k = Get-BlockKey $b
    if ($k) { $ids[$k] = $true }
  }
  $add = New-Object System.Collections.ArrayList
  foreach ($b in (Get-TopLevelBlocks $snap)) {
    $k = Get-BlockKey $b
    if ($k -and -not $ids.ContainsKey($k)) {
      [void]$add.Add($b)
      $ids[$k] = $true
    }
  }
  if ($add.Count -eq 0) { return 'no-change' }

  $merged = $existing.TrimEnd() + "`n`n" + ($add -join "`n`n") + "`n"
  [IO.File]::WriteAllText($Path, $merged, (New-Object System.Text.UTF8Encoding($false)))
  return "merge+$($add.Count)"
}

Write-Step "合并 cordis.patch.yml（$PatchMode）"
$snapPatch = Join-Path (Join-Path $Repo 'config\profile-desktop') 'cordis.patch.yml'
if (-not (Test-Path -LiteralPath $snapPatch)) { throw "缺少快照：$snapPatch" }
if ($DryRun) {
  Write-Plan "将按 id 补缺失条目（已有条目优先）；-PatchMode replace 可整份替换"
} else {
  New-BackupDir
  if (Test-Path -LiteralPath $patchPath) {
    Copy-Item -LiteralPath $patchPath -Destination (Join-Path $backupRoot 'cordis.patch.yml') -Force
  }
  $patchResult = Merge-CordisPatch -Path $patchPath -SnapshotPath $snapPatch -Mode $PatchMode
  Write-Ok "cordis.patch.yml：$patchResult"
}

# ------------------------------------------------------------------
# 4. Skill 复制到 ~/.dsh/skills
# ------------------------------------------------------------------
function Install-Skills {
  $destRoot = Join-Path (Join-Path $env:USERPROFILE '.dsh') 'skills'
  if (-not (Test-Path -LiteralPath $destRoot)) {
    if ($DryRun) { Write-Plan "创建 $destRoot" }
    else { New-Item -ItemType Directory -Path $destRoot -Force | Out-Null }
  }
  $n = 0
  foreach ($s in $stack.skills) {
    $src = Join-Path (Join-Path $Repo 'skills') $s.name
    $dst = Join-Path $destRoot $s.name
    if (-not (Test-Path -LiteralPath $src)) { Write-Warn "缺少 skill：$src"; continue }
    if ($DryRun) { Write-Plan "复制 skill：$($s.name)"; $n++; continue }
    if (Test-Path -LiteralPath $dst) {
      $bak = Join-Path (Join-Path $backupRoot 'skills') $s.name
      $bakParent = Split-Path -Parent $bak
      if (-not (Test-Path -LiteralPath $bakParent)) { New-Item -ItemType Directory -Path $bakParent -Force | Out-Null }
      Copy-Item -LiteralPath $dst -Destination $bak -Recurse -Force
      Remove-Item -LiteralPath $dst -Recurse -Force
    }
    Copy-Item -LiteralPath $src -Destination $dst -Recurse -Force
    $n++
  }
  Write-Ok "Skill：$n / $($stack.skills.Count) 已复制到 $destRoot"
}

if ($SkipSkills) {
  Write-Step "Skill 已跳过（-SkipSkills）"
} else {
  Write-Step "安装 Skill 到 ~/.dsh/skills"
  Install-Skills
}

# ------------------------------------------------------------------
# 5. 环境变量（DshRoot 不是 D:\DSH 时，覆盖写死的默认路径）
# ------------------------------------------------------------------
if ($SkipEnv) {
  Write-Step "环境变量已跳过（-SkipEnv）"
} elseif ($DshRoot -ne 'D:\DSH') {
  Write-Step "写入用户环境变量（因为 DshRoot != D:\DSH）"
  $vars = @{
    DSH_TAVERN_STYLE_LAB    = (Join-Path $DshRoot 'tavern-style')
    DSH_DESLOP_DIR          = (Join-Path $DshRoot 'skills\deslop')
    DSH_BLOCK_CONTRACT_PACK = (Join-Path $DshRoot 'dnd-plugin\contract\display-blocks-pack.json')
  }
  foreach ($k in $vars.Keys) {
    if ($DryRun) { Write-Plan "$k = $($vars[$k])" }
    else {
      [Environment]::SetEnvironmentVariable($k, $vars[$k], 'User')
      Set-Item -Path ("Env:" + $k) -Value $vars[$k]
      Write-Ok "$k = $($vars[$k])"
    }
  }
}

# ------------------------------------------------------------------
# 6. 安装依赖
# ------------------------------------------------------------------
if ($SkipDeps) {
  Write-Step "依赖安装已跳过（-SkipDeps）"
} elseif ($DryRun) {
  Write-Step "依赖安装（dry-run 跳过）"
  Write-Plan "将运行 pnpm install（优先 PATH 里的 pnpm，否则用 DSH 自带 pnpm）"
} else {
  Write-Step "安装 profile 依赖（pnpm install）"
  Push-Location $ProfileDir
  try {
    $pnpmCmd = Get-Command pnpm -ErrorAction SilentlyContinue
    if ($pnpmCmd) {
      Write-Ok "使用 pnpm：$($pnpmCmd.Source)"
      & $pnpmCmd.Source install --config.confirmModulesPurge=false
    } else {
      $exe = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\DeepSeek Harness.exe'
      $pnpmCjs = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\primary-runtime\dependencies\pnpm\bin\pnpm.cjs'
      if (-not (Test-Path -LiteralPath $exe) -or -not (Test-Path -LiteralPath $pnpmCjs)) {
        throw '找不到 pnpm，也找不到 DSH 自带 pnpm。请手动在 profile 目录运行 pnpm install。'
      }
      Write-Ok '使用 DSH 自带 pnpm'
      $env:ELECTRON_RUN_AS_NODE = '1'
      & $exe --expose-internals $pnpmCjs install --config.confirmModulesPurge=false
    }
    if ($LASTEXITCODE -ne 0) { throw "pnpm install 失败（exit=$LASTEXITCODE）" }
    Write-Ok '依赖安装完成'
  } catch {
    Write-Warn $_.Exception.Message
    Write-Warn "可稍后手动执行：cd `"$ProfileDir`"; pnpm install"
  } finally {
    Pop-Location
  }
}

# ------------------------------------------------------------------
# 7. 汇总
# ------------------------------------------------------------------
Write-Host ""
Write-Host "完成。" -ForegroundColor Green
if ($DryRun) {
  Write-Host "以上为 dry-run，没有改动任何文件。去掉 -DryRun 重跑即可落地。" -ForegroundColor Yellow
} else {
  Write-Host "备份目录：$backupRoot"
  Write-Host ""
  Write-Host "下一步：" -ForegroundColor Cyan
  Write-Host "  1. 启动 DSH Desktop（首次启动会加载新插件，稍等几秒）。"
  Write-Host "  2. 设置 → 模型/Provider：填 ZHIPU_API_KEY、XIAOMI_API_KEY、LOCAL_LLM_KEY，或登录 DeepSeek 账号。"
  Write-Host "  3. 打开插件页确认 13 个插件都在；若有红色报错，先看 profile 的 pnpm 输出。"
  Write-Host "  4. 若 DSH 更新后 patch 被重置，重新运行本脚本即可（幂等）。"
}
