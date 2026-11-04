# ask.ps1 —— 本地模型的推荐调用入口
#
# 用法：
#   pwsh -File ask.ps1 "你的问题"
#   pwsh -File ask.ps1 -MaxTokens 800 -System "只输出 JSON" "从下面抽人名：..."
#   pwsh -File ask.ps1 -Json "你好"        # 输出原始响应（含 timings / usage）
#   pwsh -File ask.ps1 -NoStart "你好"     # 服务没起时不自动拉起，直接失败
#
# 退出码：0 成功 / 2 服务不可用 / 3 请求失败
#
# 设计说明：
#   - 手动解析 $args。只要用 param() 声明具名参数，PowerShell 就会按声明顺序做位置绑定，
#     裸字符串会被塞进第一个 int 参数然后报类型转换错误。
#   - 自动拉起走子进程，因为 start-llama.ps1 结尾有 exit，在当前进程里调用会一起退出。

$root = 'D:\DSH\llama'
$base = 'http://127.0.0.1:11435'

$maxTokens = 512
$system    = ''
$temp      = 0.7
$jsonOut   = $false
$noStart   = $false
$rest      = @()

for ($i = 0; $i -lt $args.Count; $i++) {
  switch -Regex ($args[$i]) {
    '^(-MaxTokens|-m)$' { $maxTokens = [int]$args[$i + 1]; $i++; break }
    '^(-System|-s)$'     { $system = [string]$args[$i + 1]; $i++; break }
    '^(-Temp|-t)$'       { $temp = [double]$args[$i + 1]; $i++; break }
    '^(-Json|-j)$'       { $jsonOut = $true; break }
    '^(-NoStart|-n)$'    { $noStart = $true; break }
    default              { $rest += [string]$args[$i] }
  }
}

$prompt = ($rest -join ' ').Trim()
if (-not $prompt) { $prompt = '你好，介绍一下你自己。' }

function Test-Up {
  try {
    return (Invoke-WebRequest -Uri "$base/health" -TimeoutSec 2 -UseBasicParsing).Content -match 'ok'
  } catch { return $false }
}

if (-not (Test-Up)) {
  if ($noStart) {
    [Console]::Error.WriteLine("[ask] 服务未运行（-NoStart 已指定，不自动拉起）")
    exit 2
  }
  [Console]::Error.WriteLine("[ask] 服务未运行，正在拉起 llama-server ...")
  Start-Process -FilePath 'pwsh' -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $root 'start-llama.ps1')
  ) -Wait -WindowStyle Hidden | Out-Null

  $up = $false
  for ($k = 0; $k -lt 45; $k++) {
    Start-Sleep -Seconds 1
    if (Test-Up) { $up = $true; break }
  }
  if (-not $up) {
    [Console]::Error.WriteLine("[ask] 启动失败，看日志：" + (Join-Path $env:TEMP 'llama-server.err.log'))
    exit 2
  }
}

$messages = @()
if ($system) { $messages += @{ role = 'system'; content = $system } }
$messages += @{ role = 'user'; content = $prompt }

$payload = @{
  model       = 'qwen3.5-4b'
  messages    = $messages
  max_tokens  = $maxTokens
  temperature = $temp
  stream      = $false
} | ConvertTo-Json -Depth 6 -Compress

try {
  $resp = Invoke-RestMethod -Uri "$base/v1/chat/completions" -Method Post `
    -ContentType 'application/json; charset=utf-8' `
    -Body ([System.Text.Encoding]::UTF8.GetBytes($payload)) -TimeoutSec 600
} catch {
  [Console]::Error.WriteLine("[ask] 请求失败：" + $_.Exception.Message)
  exit 3
}

if ($jsonOut) {
  $resp | ConvertTo-Json -Depth 20
} else {
  $resp.choices[0].message.content
  if ($resp.timings) {
    [Console]::Error.WriteLine(("[ask] {0} tok 输入 @ {1:N0} tok/s | {2} tok 输出 @ {3:N0} tok/s" -f `
      $resp.timings.prompt_n, $resp.timings.prompt_per_second, `
      $resp.timings.predicted_n, $resp.timings.predicted_per_second))
  }
}
