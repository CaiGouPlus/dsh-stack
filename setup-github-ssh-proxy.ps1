#requires -Version 5.1
<#
  setup-github-ssh-proxy.ps1
  ------------------------------------------------------------------
  让 GitHub 的 SSH（git clone / push）走本机 Clash 的 mixed-port。

  背景：Clash 只开“系统代理”时，浏览器和 curl -x 能走代理，但 git 的 SSH
  传输不读系统代理，会直连 github.com；在国内网络下常见“clone 卡在几 MB、
  push 却正常”。

  用法：
    powershell -ExecutionPolicy Bypass -File .\setup-github-ssh-proxy.ps1
    powershell -ExecutionPolicy Bypass -File .\setup-github-ssh-proxy.ps1 -ProxyPort 7890
    powershell -ExecutionPolicy Bypass -File .\setup-github-ssh-proxy.ps1 -Remove
#>
[CmdletBinding()]
param(
  [string]$ProxyHost = '127.0.0.1',
  [int]$ProxyPort = 7897,
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$markerStart = '# >>> dsh-stack github ssh proxy'
$markerEnd = '# <<< dsh-stack github ssh proxy'

function Write-Step([string]$m) { Write-Host ""; Write-Host "==> $m" -ForegroundColor Cyan }
function Write-Ok([string]$m) { Write-Host "    $m" -ForegroundColor Green }
function Write-Warn([string]$m) { Write-Host "    [警告] $m" -ForegroundColor Yellow }

$sshDir = Join-Path $env:USERPROFILE '.ssh'
if (-not (Test-Path -LiteralPath $sshDir)) {
  New-Item -ItemType Directory -Path $sshDir -Force | Out-Null
}
$configPath = Join-Path $sshDir 'config'
$existing = if (Test-Path -LiteralPath $configPath) {
  [string](Get-Content -LiteralPath $configPath -Raw)
} else { '' }

# 去掉旧的受管块（如果存在）
$pattern = "(?s)\r?\n?" + [regex]::Escape($markerStart) + ".*?" + [regex]::Escape($markerEnd) + "\r?\n?"
$clean = [regex]::Replace($existing, $pattern, "`n").TrimEnd()

if ($Remove) {
  [IO.File]::WriteAllText($configPath, ($clean + "`n"), (New-Object System.Text.UTF8Encoding($false)))
  Write-Step "已移除 GitHub SSH 代理配置"
  Write-Ok "文件：$configPath"
  exit 0
}

Write-Step "检查 Clash 端口"
$listening = Get-NetTCPConnection -State Listen -LocalPort $ProxyPort -ErrorAction SilentlyContinue
if (-not $listening) {
  Write-Warn "127.0.0.1:$ProxyPort 没有在监听。请确认 Clash Verge 已启动，并把 mixed-port 改成你的实际端口。"
} else {
  Write-Ok "127.0.0.1:$ProxyPort 正在监听"
}

Write-Step "查找 Git 自带的 connect.exe"
$candidates = @(
  (Join-Path $env:ProgramFiles 'Git\mingw64\bin\connect.exe'),
  (Join-Path $env:ProgramFiles 'Git\usr\bin\connect.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Git\mingw64\bin\connect.exe')
)
$connect = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $connect) {
  $cmd = Get-Command connect.exe -ErrorAction SilentlyContinue
  if ($cmd) { $connect = $cmd.Source }
}
if (-not $connect) {
  throw "找不到 connect.exe。它是 Git for Windows 自带的，通常在 C:\Program Files\Git\mingw64\bin\connect.exe。"
}
$connectForSsh = $connect.Replace('\', '/')
Write-Ok $connect

$block = @"
$markerStart
Host github.com
  HostName ssh.github.com
  Port 443
  User git
  ProxyCommand "$connectForSsh" -H ${ProxyHost}:${ProxyPort} %h %p
  ServerAliveInterval 30
$markerEnd
"@

if (Test-Path -LiteralPath $configPath) {
  Copy-Item -LiteralPath $configPath -Destination ($configPath + '.bak-' + (Get-Date -Format 'yyyyMMdd-HHmmss')) -Force
}

[IO.File]::WriteAllText($configPath, ($clean + "`n`n" + $block + "`n"), (New-Object System.Text.UTF8Encoding($false)))
Write-Step "已写入 $configPath"
Get-Content -LiteralPath $configPath | ForEach-Object { Write-Host "    $_" }

Write-Step "验证 ssh -T git@github.com"
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
  $out = & ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -T git@github.com 2>&1
  $text = ($out | ForEach-Object { $_.ToString() }) -join "`n"
  Write-Host $text
  # GitHub 成功认证时也会返回 exit 1（不提供 shell），所以以输出为准
  if ($text -match 'successfully authenticated') {
    Write-Ok "GitHub SSH 走代理正常"
  } elseif ($text -match 'Permission denied|Could not resolve|Connection') {
    Write-Warn "SSH 没通：检查 SSH key 是否已加到 GitHub，或 Clash 当前节点是否可用。"
  } else {
    Write-Warn "SSH 返回了非预期输出，请按上面的信息排查。"
  }
} finally {
  $ErrorActionPreference = $prevEap
}

Write-Host ""
Write-Host "完成。之后 git clone/push 会自动走 Clash；不想用了运行 -Remove。" -ForegroundColor Green
