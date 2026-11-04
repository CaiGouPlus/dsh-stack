/**
 * @local/dsh-tavern-style —— 宿主（Node）半边 · P1–P5 完整版
 *
 * 设计原则（《tavern 文风学习模块 v2.4 方案》）：
 *   1. 只依赖两类稳定契约：酒馆的**用户数据文件** + DSH 平台扩展点（webServer 路由）；
 *   2. **不 import、不 patch 任何酒馆运行时代码**；
 *   3. 所有写入经 core/contracts.mjs：写前备份 → mtime 守卫 → 原子替换 → 回读校验（失败自动回滚）；
 *   4. 会话文件**只读**（append-only 多帧 zstd，回写会毁档）。
 *
 * 路由一律用「精确路径 + 查询串/JSON body」，避免路径参数解析带来的不确定性。
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ContractError, backupRoot, listBackups, readText, restoreBackup, statOf } from './core/contracts.mjs'
import {
  LAB_PRESET_ID,
  PRESET_ROOT,
  labPresetInfo,
  labRoot,
  publishTargets,
  readAnti,
  readEditedMessages,
  readPreset,
  readRegistry,
  tavernInfo,
  writeAnti,
  writeEditedMessage,
  writePreset,
} from './core/tavern.mjs'
import { antiRulesView, deslopCorpus } from './core/anti.mjs'
import { applyEnhancePack, enhancePackView } from './core/enhance.mjs'
import { bucketStats, listSessions, policyView, readSession } from './core/sessions.mjs'
import { compare, distributionDistance, metrics } from './core/score.mjs'
import { aggregate, exportMarkdown, get as getImprovement, listAll, listForSession, remove as removeImprovement, save as saveImprovement } from './core/improvements.mjs'
import { addCandidates, acceptedModules, compareVersions, listBuckets, readBucket, removeRule, rulesToModules, updateRule } from './core/rules.mjs'
import { apply as publishApply, labStats, preview as publishPreview } from './core/publish.mjs'
import {
  DEFAULT_MAX_CALLS,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
  buildModuleBlock,
  estimateReplay,
  extractScenesFromSessions,
  listReplays,
  readFixtures,
  readReplay,
  removeReplay,
  resolveModel,
  runReplay,
  writeFixtures,
} from './core/replay.mjs'

export const name = 'tavern-style'
export const inject = ['webServer']

const CACHE_MS = 10_000
let overviewCache = { at: 0, data: undefined }

/* ────────────────────────── 读文件 / 工具 ────────────────────────── */

function readJsonFile(file, fallback) {
  const text = readText(file)
  if (text === undefined) return fallback
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

function listFiles(root, prefix) {
  const out = []
  const walk = (dir, rel) => {
    let entries = []
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      const next = rel === '' ? entry.name : rel + '/' + entry.name
      if (entry.isDirectory()) walk(full, next)
      else {
        const st = statOf(full)
        if (st.exists) out.push({ path: prefix + next, bytes: st.size, at: st.mtimeMs })
      }
    }
  }
  walk(root, '')
  return out
}

function labView() {
  const workspace = join(labRoot(), 'lab-workspace')
  const outputs = listFiles(join(workspace, 'out'), 'out/')
  return {
    root: labRoot(),
    workspace,
    inbox: listFiles(join(workspace, 'inbox'), 'inbox/'),
    features: listFiles(join(workspace, 'features'), 'features/'),
    outputs: outputs.sort((a, b) => b.at - a.at),
  }
}

/**
 * 定位装着 dsh-tavern 的 profile 目录（已移入 core/tavern.mjs，这里保留薄封装给 doctor 用）。
 * 见 core/tavern.mjs 的 findTavernPackageFile()：`DSH_PROFILE_DIR` 在 Electron 宿主进程里可能不存在，
 * 所以那里会退化为扫描 `<DSH_HOME>/profiles/<profile>/`。
 */

/* ────────────────────────── 总览 ────────────────────────── */

function buildOverview() {
  const tavern = tavernInfo()
  const registry = readRegistry()
  const lab = labPresetInfo()
  return {
    at: Date.now(),
    doctor: {
      stage: 'P5 完整版',
      writable: true,
      note: '写入均带备份 / mtime 守卫 / 原子替换 / 回读校验；会话文件只读；A/B 回放默认限量 ≤10 次调用。',
      tavernPresent: tavern.present,
      tavernVersion: tavern.version,
      profileDir: tavern.profileDir,
      presetRoot: PRESET_ROOT,
      backupRoot: backupRoot(labRoot()),
      labRoot: labRoot(),
    },
    tavern,
    presets: {
      registryFile: registry.file,
      presets: registry.presets.map((p) => {
        const preset = readPreset(p.dir)
        return { ...p, modules: { file: preset.file, exists: preset.exists, total: preset.stats.total, stats: preset.stats, mtimeMs: preset.mtimeMs } }
      }),
      lab: { ...lab, stats: labStats().stats },
    },
    antiCliche: readAnti(),
    sessions: bucketStats(),
    lab: labView(),
    rules: { buckets: listBuckets(labRoot()).map((b) => ({ bucket: b.bucket, versions: b.versions, counts: b.counts, latest: b.latest })) },
    improvements: (() => {
      const all = listAll(labRoot())
      return { sessions: all.sessions.length, total: all.total }
    })(),
    replays: (() => {
      const all = listReplays(labRoot())
      return { total: all.length, latest: all.length === 0 ? null : all[0] }
    })(),
  }
}

/* ────────────────────────── HTTP 工具 ────────────────────────── */

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }

function send(res, status, body) {
  res.writeHead(status, JSON_HEADERS)
  res.end(JSON.stringify(body))
}

function ok(res, data) {
  send(res, 200, { ok: true, data })
}

function fail(res, error) {
  const code = error instanceof ContractError ? error.code : 'ERROR'
  const status = code === 'NOT_FOUND' ? 404 : code === 'CONFLICT' ? 409 : code === 'PROTECTED' ? 403 : code === 'UNAVAILABLE' ? 503 : 400
  send(res, status, { ok: false, code, error: String(error?.message ?? error) })
}

async function readBody(req, limit = 4 * 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new ContractError('INVALID', '请求体过大')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new ContractError('INVALID', `请求体不是合法 JSON：${String(error?.message ?? error)}`)
  }
}

function query(req) {
  const url = new URL(req.url ?? '/', 'http://dsh.invalid')
  return Object.fromEntries(url.searchParams.entries())
}

function readParam(value, name) {
  const text = String(value ?? '').trim()
  if (text === '') throw new ContractError('INVALID', `缺少参数 ${name}`)
  return text
}

/* ────────────────────────── 各路由实现 ────────────────────────── */

/** GET /overview */
function routeOverview(req, res) {
  const now = Date.now()
  if (overviewCache.data !== undefined && now - overviewCache.at < CACHE_MS) return ok(res, overviewCache.data)
  const data = buildOverview()
  overviewCache = { at: now, data }
  return ok(res, data)
}

/** GET /preset?dir= —— 读增强层全文（编辑用，含每条 content） */
function routeReadPreset(req, res) {
  const dir = readParam(query(req).dir, 'dir')
  const preset = readPreset(dir)
  return ok(res, {
    dir,
    file: preset.file,
    exists: preset.exists,
    mtimeMs: preset.mtimeMs,
    stats: preset.stats,
    groups: preset.groups.map((g) => ({
      name: g.name,
      collapsed: g.collapsed,
      modules: g.modules.map((m) => ({ name: m.name, content: m.content, enabled: m.enabled, chars: m.chars, protected: m.protected })),
    })),
  })
}

/** POST /preset —— 写增强层 {dir, groups, expectedMtimeMs, templateVarPolicy?} */
async function routeWritePreset(req, res) {
  const body = await readBody(req)
  const dir = readParam(body.dir, 'dir')
  if (!Array.isArray(body.groups)) throw new ContractError('INVALID', 'groups 必须是数组')
  const policy = body.templateVarPolicy === 'clean' ? 'clean' : 'keep'
  const result = writePreset(dir, body.groups, { expectedMtimeMs: body.expectedMtimeMs ?? null, templateVarPolicy: policy })
  overviewCache = { at: 0, data: undefined }
  return ok(res, result)
}

/** GET /anti */
function routeReadAnti(req, res) {
  return ok(res, readAnti())
}

/** POST /anti —— 写反八股 {enabled, bannedWords, expectedMtimeMs} */
async function routeWriteAnti(req, res) {
  const body = await readBody(req)
  const result = writeAnti({ enabled: body.enabled, bannedWords: body.bannedWords }, { expectedMtimeMs: body.expectedMtimeMs ?? null })
  overviewCache = { at: 0, data: undefined }
  return ok(res, result)
}

/**
 * GET /anti/rules —— 反八股**正文**（只读）。
 * 15 条结构禁令 + 首尾句 + 与酒馆 index.js 的镜像核对 + **逐字一致**的注入预览。
 */
function routeAntiRules(req, res) {
  return ok(res, antiRulesView())
}

/** GET /anti/corpus —— 本地 deslop 语料（只读候选：12 条硬禁令 + 三类词表条目）。 */
function routeAntiCorpus(req, res) {
  return ok(res, deslopCorpus())
}

/**
 * GET /enhance/pack —— 内置增强层模块包**全文**（只读）。
 * 酒馆自己的面板只给 `{name, enabled, chars}`，正文在那边看不到；这里是唯一能看见正文的入口。
 * 同时给出运行时注入块（`enhanceRuntime=true` 时追加到最后一段）的只读镜像 + 漂移核对。
 */
function routeEnhancePack(req, res) {
  return ok(res, enhancePackView())
}

/**
 * POST /enhance/apply —— 把内置包套用进某个预设 {dir, names?, overwrite?, groupIndex?, expectedMtimeMs?}
 * 语义与酒馆 `applyEnhancePack()` 一致：同名默认跳过，受保护模块（变量/格式/era）永远保留用户版本。
 */
async function routeEnhanceApply(req, res) {
  const body = await readBody(req)
  const dir = readParam(body.dir, 'dir')
  const result = applyEnhancePack(dir, {
    names: Array.isArray(body.names) ? body.names : undefined,
    overwrite: body.overwrite === true,
    groupIndex: Number.isInteger(body.groupIndex) ? body.groupIndex : 0,
    expectedMtimeMs: body.expectedMtimeMs ?? null,
    templateVarPolicy: body.templateVarPolicy,
  })
  overviewCache = { at: 0, data: undefined }
  return ok(res, result)
}

/** GET /sessions?limit=&onlyAllowed= */
function routeSessions(req, res) {
  const params = query(req)
  const limit = Number.parseInt(params.limit ?? '200', 10)
  const list = listSessions({ limit: Number.isFinite(limit) ? limit : 200, onlyAllowed: params.onlyAllowed !== 'false' })
  return ok(res, list)
}

/** GET /session?dir=&file= —— 轮次 + 模型输出 + 已有改进 + 指标 */
function routeSession(req, res) {
  const params = query(req)
  const dir = readParam(params.dir, 'dir')
  const file = readParam(params.file, 'file')
  const full = readSession(dir, file)
  const saved = listForSession(labRoot(), full.header?.id ?? '')
  const bySeq = new Map(saved.map((r) => [r.seq, r]))
  const turns = full.turns.map((turn) => ({
    turn: turn.turn,
    user: turn.user.slice(0, 4000),
    userChars: turn.user.length,
    assistants: turn.assistants.map((a) => {
      const record = bySeq.get(a.seq)
      return {
        seq: a.seq,
        step: a.step,
        chars: a.chars,
        reasoningChars: a.reasoningChars,
        toolCalls: a.toolCalls,
        at: a.at,
        text: a.text,
        metrics: metrics(a.text),
        improved: record === undefined ? null : { improved: record.improved, tags: record.tags, note: record.note, at: record.at, delta: record.delta },
      }
    }),
  }))
  return ok(res, {
    sessionId: full.header?.id ?? null,
    dir,
    file,
    title: full.title,
    preset: full.header?.agentPreset ?? null,
    cwd: full.header?.cwd ?? null,
    frames: full.frames,
    badFrames: full.badFrames,
    events: full.events,
    assistantTotal: full.assistantTotal,
    improvements: saved.length,
    turns,
  })
}

/** POST /improvement —— 保存改进 */
async function routeSaveImprovement(req, res) {
  const body = await readBody(req)
  const result = saveImprovement(labRoot(), body)
  overviewCache = { at: 0, data: undefined }
  return ok(res, { record: result.record, file: result.file, delta: result.diff.delta, before: result.diff.before, after: result.diff.after })
}

/** POST /improvement/remove */
async function routeRemoveImprovement(req, res) {
  const body = await readBody(req)
  const result = removeImprovement(labRoot(), readParam(body.sessionId, 'sessionId'), Number(body.seq))
  overviewCache = { at: 0, data: undefined }
  return ok(res, result)
}

/** POST /improvement/push —— 推到酒馆显示层（可选，界面默认关闭） */
async function routePushImprovement(req, res) {
  const body = await readBody(req)
  const result = writeEditedMessage(readParam(body.sessionId, 'sessionId'), Number(body.turnIndex ?? 0), String(body.text ?? ''), {})
  return ok(res, { ...result, edited: readEditedMessages().file })
}

/** GET /improvements */
function routeImprovements(req, res) {
  const params = query(req)
  const all = listAll(labRoot(), { withText: params.withText === 'true' })
  return ok(res, { ...all, aggregate: aggregate(labRoot()) })
}

/** GET /rules */
function routeRules(req, res) {
  return ok(res, { buckets: listBuckets(labRoot()) })
}

/** GET /rules/bucket?bucket= */
function routeRuleBucket(req, res) {
  const bucket = readParam(query(req).bucket, 'bucket')
  const view = readBucket(labRoot(), bucket)
  return ok(res, {
    bucket: view.bucket,
    file: view.file,
    exists: view.exists,
    mtimeMs: view.mtimeMs,
    counts: view.counts,
    versions: view.versions.map((v, index) => ({ index, at: v.at, source: v.source, note: v.note, count: (v.rules ?? []).length })),
    rules: view.current,
    acceptedModules: acceptedModules(labRoot(), bucket),
  })
}

/** POST /rules/bucket —— 新增候选（也接受"自我总结"产出的 JSON） */
async function routeAddRules(req, res) {
  const body = await readBody(req)
  const bucket = readParam(body.bucket, 'bucket')
  const incoming = Array.isArray(body.rules) ? body.rules : []
  const result = addCandidates(labRoot(), bucket, incoming, { source: body.source ?? 'manual', note: body.note ?? '' })
  overviewCache = { at: 0, data: undefined }
  return ok(res, { added: result.added, kept: result.kept, count: result.rules.length, backup: result.backup })
}

/** POST /rules/update */
async function routeUpdateRule(req, res) {
  const body = await readBody(req)
  const bucket = readParam(body.bucket, 'bucket')
  const result = updateRule(labRoot(), bucket, readParam(body.id, 'id'), body.patch ?? body)
  overviewCache = { at: 0, data: undefined }
  return ok(res, result)
}

/** POST /rules/remove */
async function routeRemoveRule(req, res) {
  const body = await readBody(req)
  const result = removeRule(labRoot(), readParam(body.bucket, 'bucket'), readParam(body.id, 'id'))
  overviewCache = { at: 0, data: undefined }
  return ok(res, result)
}

/** POST /rules/to-preset —— 把已采纳规则写进「文风实验室」预设的增强层 */
async function routeRulesToPreset(req, res) {
  const body = await readBody(req)
  const bucket = readParam(body.bucket, 'bucket')
  const modules = acceptedModules(labRoot(), bucket)
  if (modules.length === 0) throw new ContractError('INVALID', '该桶没有"已采纳且启用"的规则')
  const lab = readPreset(LAB_PRESET_ID)
  const groups = lab.groups.map((g) => ({ name: g.name, collapsed: g.collapsed, modules: g.modules.map((m) => ({ name: m.name, content: m.content, enabled: m.enabled })) }))
  if (groups.length === 0) groups.push({ name: '通用增强', modules: [] })
  const byName = new Map()
  for (const g of groups) for (const m of g.modules) if (!byName.has(m.name)) byName.set(m.name, m)
  let added = 0
  let updated = 0
  for (const module of modules) {
    const existing = byName.get(module.name)
    if (existing === undefined) {
      groups[0].modules.push(module)
      added += 1
    } else if (existing.content !== module.content) {
      existing.content = module.content
      updated += 1
    }
  }
  const written = writePreset(LAB_PRESET_ID, groups, { expectedMtimeMs: body.expectedMtimeMs ?? lab.mtimeMs })
  overviewCache = { at: 0, data: undefined }
  return ok(res, { added, updated, stats: written.stats, backup: written.backup, labDir: lab.dir })
}

/** POST /publish/preview */
async function routePublishPreview(req, res) {
  const body = await readBody(req)
  const targets = Array.isArray(body.targets) && body.targets.length > 0 ? body.targets.map(String) : publishTargets().map((p) => p.dir)
  return ok(res, publishPreview(labRoot(), targets, { overwrite: body.overwrite === true, all: body.all === true }))
}

/** POST /publish/apply */
async function routePublishApply(req, res) {
  const body = await readBody(req)
  const targets = Array.isArray(body.targets) && body.targets.length > 0 ? body.targets.map(String) : []
  if (targets.length === 0) throw new ContractError('INVALID', '必须显式给出 targets（避免误发布）')
  const result = publishApply(labRoot(), targets, { overwrite: body.overwrite === true, all: body.all === true, expectedMtime: body.expectedMtime ?? {} })
  overviewCache = { at: 0, data: undefined }
  return ok(res, result)
}

/** GET /backups?original= */
function routeBackups(req, res) {
  const params = query(req)
  const all = listBackups(labRoot(), params.original === undefined ? undefined : params.original)
  return ok(res, { root: backupRoot(labRoot()), backups: all.slice(0, 200).map((b) => ({ id: b.id, original: b.original, label: b.label, at: b.at, size: b.size, hash: b.hash })) })
}

/** POST /rollback {id} */
async function routeRollback(req, res) {
  const body = await readBody(req)
  const id = readParam(body.id, 'id')
  const hit = listBackups(labRoot()).find((b) => b.id === id)
  if (hit === undefined) throw new ContractError('NOT_FOUND', `找不到备份 ${id}`)
  const result = restoreBackup(hit)
  overviewCache = { at: 0, data: undefined }
  return ok(res, { ...result, from: hit.id, original: hit.original })
}

/** GET /compare —— 分布拟合 + 改进聚合 + 桶版本
 *  桶选择器：`bucket` = 规则桶（沿用），`sampleBucket` = 分布抽样的会话桶（默认同 bucket），
 *  `sampleSessions` = 抽样会话条数（1–10，默认 3）。 */
function routeCompare(req, res) {
  const params = query(req)
  const aggregateData = aggregate(labRoot())
  const lab = labStats()

  // 目标分布 = 改进稿（你的目标）；待测 = 选定桶里最近的模型输出
  const improvedTexts = listAll(labRoot(), { withText: true }).sessions.flatMap((s) => s.items.map((r) => r.improved)).filter((t) => typeof t === 'string' && t.trim() !== '')
  const bucket = params.bucket
  const sampleBucket = typeof params.sampleBucket === 'string' && params.sampleBucket !== '' ? params.sampleBucket : bucket
  const wantSessions = Number.parseInt(params.sampleSessions ?? '3', 10)
  const sampleSessions = Math.min(10, Math.max(1, Number.isFinite(wantSessions) ? wantSessions : 3))
  let modelTexts = []
  const usedSessions = []
  if (typeof sampleBucket === 'string' && sampleBucket !== '') {
    const list = listSessions({ limit: 300, onlyAllowed: true })
    for (const session of list.sessions.filter((s) => s.preset === sampleBucket)) {
      if (usedSessions.length >= sampleSessions) break
      try {
        const full = readSession(session.dir, session.file)
        let taken = 0
        for (const turn of full.turns) {
          for (const a of turn.assistants) {
            if (a.chars > 200) {
              modelTexts.push(a.text)
              taken += 1
            }
          }
        }
        if (taken > 0) usedSessions.push({ sessionId: session.sessionId, texts: taken, mtimeMs: session.mtimeMs })
      } catch {
        /* 跳过读不了的会话 */
      }
    }
  }
  modelTexts = modelTexts.slice(0, 20)

  const stats = bucketStats()
  return ok(res, {
    improvements: aggregateData,
    lab,
    rules: listBuckets(labRoot()),
    distance: improvedTexts.length > 0 && modelTexts.length > 0 ? distributionDistance(improvedTexts, modelTexts) : null,
    sampleCounts: { targets: improvedTexts.length, samples: modelTexts.length, sessions: usedSessions.length },
    bucket: bucket ?? null,
    sampleBucket: sampleBucket ?? null,
    sampleSessions,
    usedSessions,
    sampleBuckets: stats.buckets.filter((b) => !b.key.includes('[')),
  })
}

/** POST /rules/import —— 从实验室工作区 out/rules/*.json 导入候选规则（闭环最后一步） */
async function routeImportRules(req, res) {
  const body = await readBody(req)
  const dir = join(labRoot(), 'lab-workspace', 'out', 'rules')
  let names = []
  try {
    names = readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.json') && !n.startsWith('_'))
  } catch {
    throw new ContractError('NOT_FOUND', `还读不到规则目录：${dir}`)
  }
  if (Array.isArray(body.files) && body.files.length > 0) names = names.filter((n) => body.files.includes(n))
  const report = []
  for (const name of names) {
    const file = join(dir, name)
    const doc = readJsonFile(file, undefined)
    if (doc === undefined) {
      report.push({ file: name, ok: false, error: '不是合法 JSON' })
      continue
    }
    const rules = Array.isArray(doc) ? doc : Array.isArray(doc.rules) ? doc.rules : []
    if (rules.length === 0) {
      report.push({ file: name, ok: false, error: '里没有 rules 数组' })
      continue
    }
    const bucket = String(body.bucket ?? doc.bucket ?? name.replace(/\.rules\.json$/u, '').replace(/\.json$/u, ''))
    const result = addCandidates(labRoot(), bucket, rules, { source: 'lab-preset:' + name, note: doc.notes ?? doc.note ?? '' })
    report.push({ file: name, ok: true, bucket, added: result.added.length, kept: result.kept.length })
  }
  overviewCache = { at: 0, data: undefined }
  return ok(res, { dir, files: names.length, report })
}

/** GET /rules/compare?bucket=&a=&b= */
function routeCompareVersions(req, res) {
  const params = query(req)
  const bucket = readParam(params.bucket, 'bucket')
  const a = Number.parseInt(params.a ?? '0', 10)
  const b = Number.parseInt(params.b ?? '1', 10)
  return ok(res, compareVersions(labRoot(), bucket, a, b))
}

/** POST /export/improvement {sessionId, seq} */
async function routeExportImprovement(req, res) {
  const body = await readBody(req)
  const record = getImprovement(labRoot(), readParam(body.sessionId, 'sessionId'), Number(body.seq))
  if (record === undefined) throw new ContractError('NOT_FOUND', '该改进不存在')
  const file = exportMarkdown(labRoot(), record)
  return ok(res, { file })
}

/** POST /snapshot —— 手动落一份总览快照 */
async function routeSnapshot(req, res) {
  const dir = join(labRoot(), 'data')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'overview.json')
  const data = buildOverview()
  writeFileSync(file, JSON.stringify(data, null, 1), 'utf8')
  overviewCache = { at: Date.now(), data }
  return ok(res, { file, at: data.at })
}

/* ────────────────────────── A/B 回放 ────────────────────────── */

/** 插件运行时服务（apply() 时捕获）。测试里为空 → 回放只报 UNAVAILABLE，其余功能不受影响。 */
const runtime = { llm: null, defaultModel: null }

/** GET /replay/fixtures?target= */
function routeReadFixtures(req, res) {
  const target = readParam(query(req).target, 'target')
  return ok(res, readFixtures(labRoot(), target))
}

/** POST /replay/fixtures {target, scenes, expectedMtimeMs} */
async function routeWriteFixtures(req, res) {
  const body = await readBody(req)
  const target = readParam(body.target, 'target')
  const result = writeFixtures(labRoot(), target, body.scenes, { expectedMtimeMs: body.expectedMtimeMs ?? null })
  return ok(res, result)
}

/** POST /replay/fixtures/extract {bucket, limit} —— 从最近会话抓场景（只抽 user 消息） */
async function routeExtractScenes(req, res) {
  const body = await readBody(req)
  return ok(res, extractScenesFromSessions(labRoot(), { bucket: body.bucket, limit: body.limit }))
}

function replayScenes(body) {
  if (Array.isArray(body.scenes) && body.scenes.length > 0) return body.scenes
  const target = String(body.target ?? '')
  if (target === '') throw new ContractError('INVALID', '需要 scenes 或 target（已保存的夹具）')
  return readFixtures(labRoot(), target).scenes
}

/** POST /replay/estimate —— 跑前成本预估（不调模型） */
async function routeReplayEstimate(req, res) {
  const body = await readBody(req)
  const moduleSource = buildModuleBlock(labRoot(), body.modulesPreset ?? 'style-lab')
  const estimate = estimateReplay({
    scenes: replayScenes(body),
    moduleBlock: moduleSource.block,
    maxCalls: body.maxCalls ?? DEFAULT_MAX_CALLS,
    maxTokens: body.maxTokens ?? DEFAULT_MAX_TOKENS,
    priceInput: body.priceInput ?? 0,
    priceOutput: body.priceOutput ?? 0,
  })
  return ok(res, {
    ...estimate,
    modulesPreset: moduleSource.dir,
    moduleBlockChars: moduleSource.chars,
    moduleBlockTruncated: moduleSource.truncated,
    model: resolveModel(body, runtime),
    defaults: { maxCalls: DEFAULT_MAX_CALLS, maxTokens: DEFAULT_MAX_TOKENS, temperature: DEFAULT_TEMPERATURE },
  })
}

/** HTTP 响应里把生成文本截到 1500 字（全文留在 data/replays 的记录文件里）。 */
function summarizeReplay(record) {
  return {
    ...record,
    rows: record.rows.map((row) => ({
      ...row,
      a: { ...row.a, text: String(row.a.text ?? '').slice(0, 1500) },
      b: { ...row.b, text: String(row.b.text ?? '').slice(0, 1500) },
    })),
  }
}

/** POST /replay/run —— 真实调用（限量；必须 confirm:true，且调用前应先看 /replay/estimate） */
async function routeReplayRun(req, res) {
  const body = await readBody(req)
  if (body.confirm !== true) throw new ContractError('INVALID', '未确认执行（先点「预估」，确认后才带 confirm:true 执行）')
  const targetTexts = listAll(labRoot(), { withText: true }).sessions.flatMap((s) => s.items.map((r) => r.improved)).filter((t) => typeof t === 'string' && t.trim() !== '')
  const result = await runReplay(
    labRoot(),
    {
      confirm: true,
      target: body.target,
      scenes: replayScenes(body),
      modulesPreset: body.modulesPreset ?? 'style-lab',
      maxCalls: body.maxCalls ?? DEFAULT_MAX_CALLS,
      maxTokens: body.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: body.temperature ?? DEFAULT_TEMPERATURE,
      provider: body.provider,
      model: body.model,
      targetTexts,
    },
    runtime,
  )
  overviewCache = { at: 0, data: undefined }
  return ok(res, { file: result.file, record: summarizeReplay(result.record) })
}

/** GET /replay/history */
function routeReplayHistory(req, res) {
  return ok(res, { root: join(labRoot(), 'data', 'replays'), replays: listReplays(labRoot()) })
}

/** GET /replay/record?id= */
function routeReplayRecord(req, res) {
  const id = readParam(query(req).id, 'id')
  return ok(res, readReplay(labRoot(), id))
}

/** POST /replay/remove {id} */
async function routeReplayRemove(req, res) {
  const body = await readBody(req)
  return ok(res, removeReplay(labRoot(), readParam(body.id, 'id')))
}

/* ────────────────────────── 文本体检 / 成果浏览 ────────────────────────── */

/**
 * POST /analyze {text} —— 对任意文本跑一遍指标（纯计算：不调模型、不写盘、免费）。
 * 复用 core/score.mjs 的 metrics()，与「改进工作台」的打分口径完全一致。
 */
async function routeAnalyze(req, res) {
  const body = await readBody(req)
  const text = String(body.text ?? '')
  if (text.trim() === '') throw new ContractError('INVALID', 'text 不能为空：粘一段正文再体检')
  if (text.length > 200_000) throw new ContractError('INVALID', 'text 太长（上限 20 万字符），请切分后再体检')
  const m = metrics(text)
  return ok(res, { ...m, avgParagraph: m.avgParagraphChars })
}

/** GET /lab/outputs —— lab-workspace/out/ 下的成果清单（报告 / 风格卡 / 候选规则 / 已发布）。 */
function routeLabOutputs(req, res) {
  const view = labView()
  const kindOf = (path) => {
    if (path.startsWith('out/reports/')) return '报告'
    if (path.startsWith('out/cards/')) return '风格卡'
    if (path.startsWith('out/rules/')) return '候选规则'
    if (path.startsWith('out/published/')) return '已发布'
    return '其他'
  }
  const entries = view.outputs.map((f) => ({ file: f.path, kind: kindOf(f.path), at: f.at, bytes: f.bytes }))
  return ok(res, { root: view.workspace, entries })
}

/** GET /lab/output?file= —— 读一份成果正文（只允许 lab-workspace/out/ 之内）。 */
function routeLabOutput(req, res) {
  const file = readParam(query(req).file, 'file')
  const rel = String(file).replace(/\\/gu, '/')
  if (rel.includes('..')) throw new ContractError('INVALID', 'file 只能是 out/ 下的相对路径')
  const normalized = rel.startsWith('out/') ? rel : 'out/' + rel
  const root = join(labRoot(), 'lab-workspace', 'out')
  const full = join(labRoot(), 'lab-workspace', ...normalized.split('/'))
  if (!full.startsWith(root)) throw new ContractError('INVALID', 'file 越界：只能读 out/ 下的成果')
  const text = readText(full)
  if (text === undefined) throw new ContractError('NOT_FOUND', '成果文件不存在：' + normalized)
  return ok(res, { file: normalized, content: text })
}

/* ────────────────────────── 路由表 ────────────────────────── */

const ROUTES = [
  { path: '/api/tavern-style/overview', method: 'GET', handler: routeOverview },
  { path: '/api/tavern-style/preset', method: 'GET', handler: routeReadPreset },
  { path: '/api/tavern-style/preset', method: 'POST', handler: routeWritePreset },
  { path: '/api/tavern-style/anti', method: 'GET', handler: routeReadAnti },
  { path: '/api/tavern-style/anti', method: 'POST', handler: routeWriteAnti },
  { path: '/api/tavern-style/anti/rules', method: 'GET', handler: routeAntiRules },
  { path: '/api/tavern-style/anti/corpus', method: 'GET', handler: routeAntiCorpus },
  { path: '/api/tavern-style/enhance/pack', method: 'GET', handler: routeEnhancePack },
  { path: '/api/tavern-style/enhance/apply', method: 'POST', handler: routeEnhanceApply },
  { path: '/api/tavern-style/sessions', method: 'GET', handler: routeSessions },
  { path: '/api/tavern-style/session', method: 'GET', handler: routeSession },
  { path: '/api/tavern-style/improvement', method: 'POST', handler: routeSaveImprovement },
  { path: '/api/tavern-style/improvement/remove', method: 'POST', handler: routeRemoveImprovement },
  { path: '/api/tavern-style/improvement/push', method: 'POST', handler: routePushImprovement },
  { path: '/api/tavern-style/improvement/export', method: 'POST', handler: routeExportImprovement },
  { path: '/api/tavern-style/improvements', method: 'GET', handler: routeImprovements },
  { path: '/api/tavern-style/rules', method: 'GET', handler: routeRules },
  { path: '/api/tavern-style/rules/bucket', method: 'GET', handler: routeRuleBucket },
  { path: '/api/tavern-style/rules/bucket', method: 'POST', handler: routeAddRules },
  { path: '/api/tavern-style/rules/update', method: 'POST', handler: routeUpdateRule },
  { path: '/api/tavern-style/rules/remove', method: 'POST', handler: routeRemoveRule },
  { path: '/api/tavern-style/rules/to-preset', method: 'POST', handler: routeRulesToPreset },
  { path: '/api/tavern-style/rules/import', method: 'POST', handler: routeImportRules },
  { path: '/api/tavern-style/rules/compare', method: 'GET', handler: routeCompareVersions },
  { path: '/api/tavern-style/publish/preview', method: 'POST', handler: routePublishPreview },
  { path: '/api/tavern-style/publish/apply', method: 'POST', handler: routePublishApply },
  { path: '/api/tavern-style/backups', method: 'GET', handler: routeBackups },
  { path: '/api/tavern-style/rollback', method: 'POST', handler: routeRollback },
  { path: '/api/tavern-style/compare', method: 'GET', handler: routeCompare },
  { path: '/api/tavern-style/replay/fixtures', method: 'GET', handler: routeReadFixtures },
  { path: '/api/tavern-style/replay/fixtures', method: 'POST', handler: routeWriteFixtures },
  { path: '/api/tavern-style/replay/fixtures/extract', method: 'POST', handler: routeExtractScenes },
  { path: '/api/tavern-style/replay/estimate', method: 'POST', handler: routeReplayEstimate },
  { path: '/api/tavern-style/replay/run', method: 'POST', handler: routeReplayRun },
  { path: '/api/tavern-style/replay/history', method: 'GET', handler: routeReplayHistory },
  { path: '/api/tavern-style/replay/record', method: 'GET', handler: routeReplayRecord },
  { path: '/api/tavern-style/replay/remove', method: 'POST', handler: routeReplayRemove },
  { path: '/api/tavern-style/analyze', method: 'POST', handler: routeAnalyze },
  { path: '/api/tavern-style/lab/outputs', method: 'GET', handler: routeLabOutputs },
  { path: '/api/tavern-style/lab/output', method: 'GET', handler: routeLabOutput },
  { path: '/api/tavern-style/snapshot', method: 'POST', handler: routeSnapshot },
]

/* ────────────────────────── 插件入口 ────────────────────────── */

/**
 * ⚠️ 硬约束（2026-09-28 代码级证据定位到的启动失败根因）：
 *   dsh-host-webserver 的 `register(route)` 里有
 *     `if (table.has(route.path)) throw new Error('webserver: duplicate ... route "${path}"')`
 *   —— **同一个 path 只能注册一次**。按 GET/POST 各注册一条会在第二次抛出，
 *   而异常发生在 `ctx.effect` 回调里会被吞掉 → 该插件行永远停在 fiber `loading`
 *   （web boot 报 `1 entry did not activate`，渲染器控制台没有任何报错）。
 *   正确做法：**一个 path 只注册一条**，方法在 handler 内分派（不支持的方法回 405）。
 */
const ROUTE_GROUPS = (() => {
  const groups = new Map()
  for (const route of ROUTES) {
    if (!groups.has(route.path)) groups.set(route.path, new Map())
    groups.get(route.path).set(route.method, route.handler)
  }
  return groups
})()

/** 按注册顺序的路由元数据（path + 允许的方法），供自检脚本按 path 匹配并挑方法。 */
export const routesMetadata = [...ROUTE_GROUPS.entries()].map(([path, methods]) => ({ path, methods: [...methods.keys()] }))

export function apply(ctx) {
  // 捕获 A/B 回放要用的平台服务（可选依赖：拿不到就只是回放不可用，不影响其它功能）
  try {
    if (typeof ctx.get === 'function') {
      runtime.llm = ctx.get('llm') ?? null
      runtime.defaultModel = ctx.get('agentDefaultModel') ?? null
    }
  } catch {
    /* 服务不存在 / 上下文不允许 → 保持 null */
  }

  const routeObjects = [...ROUTE_GROUPS.entries()].map(([path, methods]) => ({
    kind: 'exact',
    path,
    handler: async (req, res) => {
      const method = String(req.method ?? 'GET').toUpperCase()
      const handler = methods.get(method)
      if (handler === undefined) {
        return send(res, 405, { ok: false, code: 'METHOD', error: `${path} 只接受 ${[...methods.keys()].join(' / ')}` })
      }
      try {
        await handler(req, res)
      } catch (error) {
        fail(res, error)
      }
    },
  }))

  ctx.effect(() => {
    const disposers = routeObjects.map((route) => ctx.webServer.register(route))
    return () => {
      for (const dispose of disposers) {
        try {
          if (typeof dispose === 'function') dispose()
        } catch {
          /* ignore */
        }
      }
    }
  }, 'tavern-style: api routes')

  /** 启动 5 秒后落一份快照（不阻塞启动、失败静默）。 */
  ctx.effect(() => {
    const timer = setTimeout(() => {
      try {
        const dir = join(labRoot(), 'data')
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, 'overview.json'), JSON.stringify(buildOverview(), null, 1), 'utf8')
      } catch {
        /* ignore */
      }
    }, 5000)
    return () => clearTimeout(timer)
  }, 'tavern-style: snapshot')

  // 确保插件自有目录存在（成果落点）
  try {
    for (const sub of ['data', 'data/improvements', 'data/rules', 'lab-workspace/inbox', 'lab-workspace/features', 'lab-workspace/out/reports', 'lab-workspace/out/rules', 'lab-workspace/out/cards', 'lab-workspace/out/published']) {
      const dir = join(labRoot(), sub)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    }
  } catch {
    /* ignore */
  }
}
