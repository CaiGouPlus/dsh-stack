// CAE 接口层（DeepSeek Harness 插件）
//
// 把本机已实测可用的四个工业软件收敛成同一种调用形状：
//   cae_env     探测路径/版本/通道状态
//   cae_matlab  MATLAB -batch
//   cae_abaqus  .inp 提交（或 abaqus python 后处理）
//   cae_comsol  comsolbatch 批处理
//   cae_acad    AutoCAD COM（PowerShell 脚本或内置探针）
//
// 设计约束（全部来自 2026-11-04 的实测踩坑，别改）：
//   · 子进程 TEMP 必须指向可写目录，否则 COMSOL 会卡死在"正在打开文件"；
//   · COMSOL 必须经 cmd.exe 启动：Node 直接 spawn 与 cmd 都验证过，只有后者稳；
//   · 一切返回都是无损 JSON（不出现 undefined / NaN），日志只回尾部，避免淹没上下文；
//   · 长任务一律给超时，超时返回 ok:false + 已产生的产物，绝不静默失败。

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// 宿主包只在真实 Harness 进程里可解析（Desktop 通过 host module fallback 提供）。
// 独立自测时退化为恒等函数：定义形状保持一致，绝不让导入失败拖垮插件加载。
let rawDefineTool = (options) => options
try {
  const mod = await import('@deepseek-ai/dsh-tools')
  if (typeof mod.defineTool === 'function') rawDefineTool = mod.defineTool
} catch {
  rawDefineTool = (options) => options
}
const defineTool = rawDefineTool

export const name = 'cae-bridge'
export const inject = ['tools']

const ROOT = 'D:\\DSH\\DSH\\cae'
const TMP = join(ROOT, 'tmp')
const LOGDIR = join(ROOT, 'jobs')

const BIN = {
  matlab: 'D:\\Matlab1\\Matlab2023a win\\bin\\matlab.exe',
  abaqus: 'D:\\SIMULIA\\Commands\\abq2025.bat',
  comsol: 'D:\\comsol\\COMSOL63\\Multiphysics\\bin\\win64\\comsolbatch.exe',
  acad: 'D:\\autocad\\AutoCAD 2022\\acad.exe',
  acadcore: 'D:\\autocad\\AutoCAD 2022\\accoreconsole.exe',
  sw: 'C:\\solidworks\\SOLIDWORKS\\SLDWORKS.exe',
}

const VERSION = {
  matlab: 'R2023a',
  abaqus: '2025',
  comsol: '6.3.0.290',
  acad: '2022 (24.1s)',
  sw: '2023 SP5.0',
}

const stmt = (description, required = false) => ({
  type: 'string',
  description,
  ...(required ? { required: true } : {}),
})

const num = (description) => ({ type: 'number', description })
const bool = (description) => ({ type: 'boolean', description })
const jsonParam = (description) => ({ type: 'json', description })

function ensureDirs() {
  try {
    if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true })
    if (!existsSync(LOGDIR)) mkdirSync(LOGDIR, { recursive: true })
  } catch {
    /* 目录建不出来也不能让工具崩 */
  }
}

function childEnv() {
  ensureDirs()
  return { ...process.env, TEMP: TMP, TMP, PYTHONIOENCODING: 'utf-8' }
}

function tail(text, limit = 4000) {
  const s = typeof text === 'string' ? text : ''
  return s.length <= limit ? s : '...' + s.slice(-limit)
}

/** 跑一个进程，返回结构化结果。刻意不抛异常。 */
function run(exe, args, options = {}) {
  ensureDirs()
  const timeoutMs = options.timeoutMs ?? 900000
  const started = Date.now()
  try {
    const res = spawnSync(exe, args, {
      cwd: options.cwd ?? ROOT,
      env: childEnv(),
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    })
    const elapsed = Date.now() - started
    if (res.error && res.error.code === 'ETIMEDOUT') {
      return {
        ok: false,
        exit: null,
        elapsedMs: elapsed,
        stdout: tail(res.stdout),
        stderr: tail(res.stderr || `timeout after ${Math.round(timeoutMs / 1000)}s`),
        timedOut: true,
      }
    }
    if (res.error) {
      return {
        ok: false,
        exit: null,
        elapsedMs: elapsed,
        stdout: tail(res.stdout),
        stderr: String(res.error.message || res.error),
        timedOut: false,
      }
    }
    return {
      ok: res.status === 0,
      exit: res.status,
      elapsedMs: elapsed,
      stdout: tail(res.stdout),
      stderr: tail(res.stderr),
      timedOut: false,
    }
  } catch (error) {
    return {
      ok: false,
      exit: null,
      elapsedMs: Date.now() - started,
      stdout: '',
      stderr: String(error && error.message ? error.message : error),
      timedOut: false,
    }
  }
}

/** 经 cmd.exe 跑：COMSOL 只有这条路径稳定。返回 run() 的结果。 */
function runViaCmd(line, options = {}) {
  ensureDirs()
  const stamp = Date.now()
  const bat = join(TMP, `run-${stamp}.cmd`)
  try {
    writeFileSync(bat, `@echo off\r\n${line}\r\n`, 'utf8')
  } catch (error) {
    return { ok: false, exit: null, elapsedMs: 0, stdout: '', stderr: String(error), timedOut: false }
  }
  return run('cmd.exe', ['/c', bat], options)
}

function artifactsIn(dir, names) {
  const out = []
  for (const n of names) {
    const p = join(dir, n)
    try {
      if (existsSync(p)) out.push({ name: n, path: p, bytes: readFileSync(p).length })
    } catch {
      out.push({ name: n, path: p, bytes: 0 })
    }
  }
  return out
}

function workdirOf(input) {
  const p = String(input)
  const idx = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  return idx > 0 ? p.slice(0, idx) : ROOT
}

function baseName(path) {
  const p = String(path)
  const idx = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  return idx >= 0 ? p.slice(idx + 1) : p
}

function stemOf(path) {
  const b = baseName(path)
  const i = b.lastIndexOf('.')
  return i > 0 ? b.slice(0, i) : b
}

const ACAD_PROBE = String.raw`
$ErrorActionPreference='Continue'
$sw=[System.Diagnostics.Stopwatch]::StartNew()
try { $acad = New-Object -ComObject 'AutoCAD.Application.24' } catch { Write-Output ('CONNECT_FAIL ' + $_.Exception.Message); exit 1 }
Write-Output ('CONNECT_OK ' + [int]$sw.Elapsed.TotalSeconds + 's version=' + $acad.Version)
try { $acad.Visible = $false } catch {}
$doc = $acad.Documents.Add()
$ms = $null
foreach ($i in 1..8) {
  Start-Sleep -Seconds 2
  try { $ms = $doc.ModelSpace } catch {}
  if ($null -ne $ms) { break }
  try { $doc = $acad.ActiveDocument } catch {}
}
if ($null -eq $ms) { Write-Output 'DRAW_FAIL ModelSpace 取不到（AutoCAD 未就绪）'; try { $acad.Quit() } catch {}; exit 2 }
try {
  $null = $ms.AddLine([double[]]@(0,0,0),[double[]]@(100,50,0))
  $null = $ms.AddCircle([double[]]@(50,25,0),20.0)
  Write-Output ('DRAW_OK entities=' + $ms.Count)
  $out = if ($env:DSH_CAE_PROBE_OUT) { $env:DSH_CAE_PROBE_OUT } else { Join-Path $env:TEMP 'dsh-cad-probe.dwg' }; if (Test-Path $out) { Remove-Item $out -Force }
  $doc.SaveAs($out); Write-Output ('SAVE_OK bytes=' + (Get-Item $out).Length)
} catch { Write-Output ('DRAW_FAIL ' + $_.Exception.Message) }
try { $acad.Quit() } catch {}
`

const renderJson = (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }]

function registerTools(ctx) {
  // 1) 环境探测
  ctx.tools.register(defineTool({
    name: 'cae_env',
    description:
      '探测本机工业软件接口状态：MATLAB / Abaqus / COMSOL / AutoCAD / SolidWorks 的安装路径、版本、自动化通道与已知故障。' +
      '任何 CAE 任务开始前先调它，别凭记忆猜路径；返回里 status=blocked 的引擎不要在本次任务里再试。',
    parameters: {},
    timeoutMs: 60000,
    output: { schema: { type: 'json' }, render: renderJson },
    async execute() {
      const engines = {}
      for (const key of ['matlab', 'abaqus', 'comsol', 'acad', 'sw']) {
        engines[key] = {
          version: VERSION[key],
          path: BIN[key],
          installed: existsSync(BIN[key]),
        }
      }
      engines.matlab.channel = 'matlab -batch（COM 亦可用）'
      engines.abaqus.channel = 'abq2025 job= / abq2025 python'
      engines.comsol.channel = 'comsolbatch（必须经 cmd.exe 启动）'
      engines.acad.channel = 'COM AutoCAD.Application.24 / accoreconsole'
      engines.sw.status = 'blocked'
      engines.sw.channel = 'COM SldWorks.Application'
      engines.sw.error = 'TYPE_E_ELEMENTNOTFOUND (0x8002802B)：能连上但成员访问全失败，类型库/自动化注册损坏'
      engines.sw.fix = '需管理员执行 SLDWORKS.exe /regserver 或安装包修复；否则走 FreeCAD：OCCT 或人工出图'
      return {
        ok: true,
        root: ROOT,
        engines,
        notes: [
          'COMSOL 从 Python 子进程启动会假死，本插件统一走 cmd.exe',
          'Abaqus 悬臂梁金标准：0.190463mm vs 理论 0.190476mm（0.007%）',
          'AutoCAD COM：Documents.Add() 后需等 3s 再取 ModelSpace；坐标须 double[]',
        ],
      }
    },
  }))

  // 2) MATLAB
  ctx.tools.register(defineTool({
    name: 'cae_matlab',
    description:
      '在 MATLAB R2023a 里跑一段代码（matlab -batch，无界面）。用于符号/数值计算、批量数据处理、生成图表文件。' +
      '启动约 15–35 秒，适合"一次算完"，不适合高频小调用；要出图就在代码里 saveas/exportgraphics 到 cae 目录再把路径贴回来。',
    parameters: {
      code: stmt('要执行的 MATLAB 代码（可多行，用分号；用 fprintf 打印结果，-batch 只回显 stdout）', true),
      timeout_s: num('超时秒数，默认 900'),
    },
    timeoutMs: 900000,
    output: { schema: { type: 'json' }, render: renderJson },
    async execute(args) {
      const timeoutMs = Math.round((args.timeout_s ?? 900) * 1000)
      const r = run(BIN.matlab, ['-batch', String(args.code ?? '')], { timeoutMs })
      return {
        ok: r.ok,
        engine: 'matlab',
        version: VERSION.matlab,
        elapsed_s: Math.round(r.elapsedMs / 100) / 10,
        stdout_tail: r.stdout,
        stderr_tail: r.stderr,
        error: r.ok ? null : (r.timedOut ? 'timeout' : `exit=${r.exit}`),
      }
    },
  }))

  // 3) Abaqus（提交 or 后处理）
  ctx.tools.register(defineTool({
    name: 'cae_abaqus',
    description:
      'Abaqus 2025：给 input 就提交 .inp 求解并自动收 .odb/.dat/.sta/.msg 与 ***ERROR；给 script 就用 abaqus python 跑后处理脚本' +
      '（脚本里 print("KEY=value") 会被解析成 fields）。求解前确认单位制（mm-N-MPa）与单元类型；' +
      'C3D8R 在单层网格上会沙漏，梁类问题用 C3D8I 或加厚单元。',
    parameters: {
      input: stmt('.inp 绝对路径（与 script 二选一）'),
      script: stmt('后处理脚本绝对路径（与 input 二选一）'),
      workdir: stmt('工作目录；缺省为 input/script 所在目录'),
      job: stmt('作业名；缺省取 .inp 文件名'),
      cpus: num('并行核数；缺省 1'),
      timeout_s: num('超时秒数，默认 3600'),
    },
    timeoutMs: 3600000,
    output: { schema: { type: 'json' }, render: renderJson },
    async execute(args) {
      const timeoutMs = Math.round((args.timeout_s ?? 3600) * 1000)
      if (args.script && !args.input) {
        const script = String(args.script)
        const cwd = args.workdir ? String(args.workdir) : workdirOf(script)
        const r = run(BIN.abaqus, ['python', baseName(script)], { cwd, timeoutMs })
        const fields = {}
        for (const line of r.stdout.split(/\r?\n/)) {
          const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/)
          if (m) fields[m[1]] = m[2].trim()
        }
        return {
          ok: r.ok,
          engine: 'abaqus-post',
          elapsed_s: Math.round(r.elapsedMs / 100) / 10,
          fields,
          stdout_tail: r.stdout,
          stderr_tail: r.stderr,
        }
      }
      if (!args.input) return { ok: false, engine: 'abaqus', error: '需要 input 或 script' }
      const input = String(args.input)
      const cwd = args.workdir ? String(args.workdir) : workdirOf(input)
      const job = args.job ? String(args.job) : stemOf(input)
      const argv = [`job=${job}`, `input=${baseName(input)}`, 'interactive', 'ask_delete=OFF']
      if (args.cpus) argv.push(`cpus=${args.cpus}`)
      const r = runViaCmd(`"${BIN.abaqus}" ${argv.join(' ')}`, { cwd, timeoutMs })
      const dat = join(cwd, `${job}.dat`)
      let datErrors = []
      try {
        if (existsSync(dat)) {
          const txt = readFileSync(dat, 'utf8')
          datErrors = (txt.match(/\*\*\*ERROR:.*/g) || []).slice(0, 10)
        }
      } catch {
        datErrors = []
      }
      const artifacts = artifactsIn(cwd, [`${job}.odb`, `${job}.dat`, `${job}.sta`, `${job}.msg`])
      return {
        ok: r.ok && datErrors.length === 0,
        engine: 'abaqus',
        job,
        elapsed_s: Math.round(r.elapsedMs / 100) / 10,
        workdir: cwd,
        dat_errors: datErrors,
        artifacts,
        stdout_tail: r.stdout,
        error: r.ok ? (datErrors.length ? 'dat 里有 ***ERROR' : null) : (r.timedOut ? 'timeout' : `exit=${r.exit}`),
      }
    },
  }))

  // 4) COMSOL
  ctx.tools.register(defineTool({
    name: 'cae_comsol',
    description:
      'COMSOL 6.3 批处理求解：.mph 进、.mph 出，可选参数扫描（params: {"d":"1,2,3"} 或 {"d":2}）。' +
      '返回求解耗时、日志尾部与输出模型大小。模型要先用桌面版建好模板（本工具不建模）；' +
      '本机已实测：打开 8s + 瞬态求解 3s + 保存 1s。',
    parameters: {
      input: stmt('.mph 模型绝对路径', true),
      output: stmt('输出 .mph 路径；缺省 <input>_solved.mph'),
      params: jsonParam('参数扫描：{"d": 2} 或 {"d": "1,2,3"}（多值会做参数扫描）'),
      cores: num('核数，默认 1'),
      timeout_s: num('超时秒数，默认 3600'),
    },
    timeoutMs: 3600000,
    output: { schema: { type: 'json' }, render: renderJson },
    async execute(args) {
      const input = String(args.input)
      const dir = workdirOf(input)
      const stem = stemOf(input)
      const output = args.output ? String(args.output) : join(dir, `${stem}_solved.mph`)
      const log = join(dir, `${stem}_batch.log`)
      const timeoutMs = Math.round((args.timeout_s ?? 3600) * 1000)
      const parts = [
        `"${BIN.comsol}"`,
        `-inputfile "${input}"`,
        `-outputfile "${output}"`,
        `-batchlog "${log}"`,
        `-np ${args.cores ?? 1}`,
      ]
      if (args.params && typeof args.params === 'object') {
        const names = []
        const values = []
        for (const [k, v] of Object.entries(args.params)) {
          names.push(k)
          values.push(String(v))
        }
        if (names.length) {
          parts.push(`-pname "${names.join(',')}"`)
          parts.push(`-plist ${values.join(' ')}`)
        }
      }
      const r = runViaCmd(parts.join(' '), { timeoutMs })
      let logTail = ''
      try {
        if (existsSync(log)) logTail = tail(readFileSync(log, 'utf8'), 2000)
      } catch {
        logTail = ''
      }
      const outBytes = existsSync(output) ? readFileSync(output).length : 0
      return {
        ok: r.ok && outBytes > 0,
        engine: 'comsol',
        version: VERSION.comsol,
        elapsed_s: Math.round(r.elapsedMs / 100) / 10,
        output,
        output_bytes: outBytes,
        log,
        log_tail: logTail,
        stdout_tail: r.stdout,
        error: r.ok ? (outBytes ? null : '输出模型未生成') : (r.timedOut ? 'timeout' : `exit=${r.exit}`),
      }
    },
  }))

  // 5) AutoCAD
  ctx.tools.register(defineTool({
    name: 'cae_acad',
    description:
      'AutoCAD 2022（COM）：跑一段 PowerShell 脚本操作桌面版 AutoCAD，或 probe 走内置探针（新建图 → 画线画圆 → 存 DWG）。' +
      '脚本里用 $acad 前先 New-Object -ComObject "AutoCAD.Application.24"；坐标必须 [double[]]@(x,y,z)，' +
      'Documents.Add() 之后要 Start-Sleep 3 再取 ModelSpace。返回画布统计与产物大小。',
    parameters: {
      script: stmt('PowerShell 脚本绝对路径（与 probe 二选一）'),
      probe: bool('true 时使用内置探针脚本，不需要提供 script'),
      timeout_s: num('超时秒数，默认 300'),
    },
    timeoutMs: 300000,
    output: { schema: { type: 'json' }, render: renderJson },
    async execute(args) {
      ensureDirs()
      const timeoutMs = Math.round((args.timeout_s ?? 300) * 1000)
      let scriptPath = null
      if (args.probe) {
        scriptPath = join(TMP, 'acad-probe.ps1')
        writeFileSync(scriptPath, ACAD_PROBE, 'utf8')
      } else if (args.script) {
        scriptPath = String(args.script)
      }
      if (!scriptPath) return { ok: false, engine: 'autocad', error: '需要 script 或 probe=true' }
      const r = run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { timeoutMs })
      return {
        ok: r.ok,
        engine: 'autocad',
        version: VERSION.acad,
        elapsed_s: Math.round(r.elapsedMs / 100) / 10,
        script: scriptPath,
        stdout_tail: r.stdout,
        stderr_tail: r.stderr,
        error: r.ok ? null : (r.timedOut ? 'timeout' : `exit=${r.exit}`),
      }
    },
  }))
}

export function apply(ctx) {
  try {
    registerTools(ctx)
  } catch (error) {
    ctx.logger?.warn?.('dsh-cae-bridge: 工具注册失败：%s', error && error.message ? error.message : error)
  }
}
