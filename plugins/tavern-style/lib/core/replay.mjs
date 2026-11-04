/**
 * 文风实验室 · A/B 回放（replay）
 *
 * 目的：用**固定夹具场景**对同一模型跑两臂（A = 不带增强块 / B = 带增强块），
 * 用同一个评分器对比，直接量出"增强模块是否让输出更像你要的样子"。
 *
 * 审核决策（2026-09-26 锁定 #4）：**允许真实 API，但限量**——
 *   默认每次 ≤10 次调用（两臂各 ≤5），跑前给成本预估，额度可在页面调（硬上限 20 次）。
 *
 * 安全边界：
 *   - 只有用户在界面点「执行」且带 confirm:true 才会真调模型；
 *   - 夹具 / 结果都落在插件自己的 data/ 下（带备份的原子写）；
 *   - 会话只读（夹具"从会话抓场景"只抽 user 消息当场景 prompt，不抽正文做学习）。
 *
 * 模型调用面（DSH 平台服务，不直连任何厂商 SDK）：
 *   services.callModel?: 自定义调用（测试注入）；
 *   否则用 services.llm.stream()（`ctx.get('llm')`）+ services.defaultModel（默认模型选择）。
 */

import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { ContractError, atomicWrite, backupFile, readJson, statOf, writeGuarded } from './contracts.mjs'
import { estimateTokens, isProtectedName, readPreset } from './tavern.mjs'
import { metrics, distributionDistance } from './score.mjs'
import { listSessions, readSession } from './sessions.mjs'

export const DEFAULT_MAX_CALLS = 10
export const HARD_MAX_CALLS = 20
export const DEFAULT_MAX_TOKENS = 600
export const DEFAULT_TEMPERATURE = 0.9
export const CALL_TIMEOUT_MS = 90_000
export const MODULE_BLOCK_CHAR_CAP = 2000
export const SCENE_CHARS_CAP = 2000

/* ────────────────────────── 夹具（fixtures） ────────────────────────── */

function fixturesDir(labRoot) {
  return join(labRoot, 'data', 'fixtures')
}

function replaysDir(labRoot) {
  return join(labRoot, 'data', 'replays')
}

function safeName(text) {
  return String(text ?? '').replace(/[^A-Za-z0-9._\u4e00-\u9fff-]/gu, '_').slice(0, 60) || 'untitled'
}

/** 场景规整：{id, title, system, prompt}。prompt 为空的场景丢弃。 */
export function normalizeScene(input, index = 0) {
  const prompt = String(input?.prompt ?? '').trim()
  return {
    id: String(input?.id ?? `scene-${index + 1}`),
    title: String(input?.title ?? `场景 ${index + 1}`).trim() || `场景 ${index + 1}`,
    system: String(input?.system ?? '').trim(),
    prompt: prompt.slice(0, SCENE_CHARS_CAP),
  }
}

export function readFixtures(labRoot, target) {
  const key = safeName(target)
  const file = join(fixturesDir(labRoot), `${key}.json`)
  const doc = readJson(file, undefined)
  const scenes = Array.isArray(doc?.scenes) ? doc.scenes.map(normalizeScene).filter((s) => s.prompt !== '') : []
  return { target: key, file, exists: doc !== undefined, mtimeMs: statOf(file).mtimeMs, scenes, updatedAt: doc?.updatedAt ?? null }
}

export function writeFixtures(labRoot, target, scenes, options = {}) {
  const key = safeName(target)
  const file = join(fixturesDir(labRoot), `${key}.json`)
  mkdirSync(fixturesDir(labRoot), { recursive: true })
  const normalized = (Array.isArray(scenes) ? scenes : []).map(normalizeScene).filter((s) => s.prompt !== '')
  if (normalized.length === 0) throw new ContractError('INVALID', '夹具至少要有一个带 prompt 的场景')
  if (normalized.length > 20) throw new ContractError('INVALID', '夹具最多 20 个场景')
  const text = JSON.stringify({ target: key, updatedAt: Date.now(), scenes: normalized }, null, 1) + '\n'
  const result = writeGuarded({ file, text, labRoot, label: `fixtures-${key}`, json: true, expectedMtimeMs: options.expectedMtimeMs ?? statOf(file).mtimeMs })
  return { ...result, target: key, scenes: normalized }
}

/**
 * 从最近会话"抓场景"（只抽 **user 消息**当场景 prompt；不抽 assistant 正文）。
 * 用途：给夹具提供"真实场景原点"，省得手写；抓完仍可在页面逐条改。
 */
export function extractScenesFromSessions(labRoot, options = {}) {
  const bucket = String(options.bucket ?? '').trim()
  const limit = Math.min(10, Math.max(1, Number(options.limit ?? 5) || 5))
  if (bucket === '') throw new ContractError('INVALID', '缺少 bucket（预设 id）')
  const list = listSessions({ limit: 200, onlyAllowed: true })
  const picked = []
  const seen = new Set()
  for (const session of list.sessions) {
    if (session.preset !== bucket) continue
    let full
    try {
      full = readSession(session.dir, session.file)
    } catch {
      continue
    }
    for (const turn of full.turns) {
      const text = String(turn.user ?? '').trim()
      if (text.length < 20) continue
      const prompt = text.slice(0, SCENE_CHARS_CAP)
      const stamp = prompt.slice(0, 24)
      if (seen.has(stamp)) continue
      seen.add(stamp)
      picked.push(normalizeScene({ id: `scene-${picked.length + 1}`, title: `场景${picked.length + 1}·${session.sessionId.slice(8, 16)}`, prompt }, picked.length))
      if (picked.length >= limit) break
    }
    if (picked.length >= limit) break
  }
  return { bucket, scenes: picked, scanned: list.sessions.filter((s) => s.preset === bucket).length }
}

/* ────────────────────────── 增强块与两臂 ────────────────────────── */

/** 从一个预设的增强层取"启用且非受保护"模块拼成注入块（超出上限截断）。 */
export function buildModuleBlock(labRoot, presetDir) {
  const preset = readPreset(presetDir)
  const parts = []
  let chars = 0
  for (const group of preset.groups) {
    for (const m of group.modules) {
      if (m.enabled === false) continue
      if (isProtectedName(m.name)) continue
      const piece = `【${m.name}】\n${m.content}`
      if (chars + piece.length > MODULE_BLOCK_CHAR_CAP) {
        parts.push(piece.slice(0, Math.max(0, MODULE_BLOCK_CHAR_CAP - chars)))
        chars = MODULE_BLOCK_CHAR_CAP
        break
      }
      parts.push(piece)
      chars += piece.length
    }
    if (chars >= MODULE_BLOCK_CHAR_CAP) break
  }
  return { dir: presetDir, exists: preset.exists, block: parts.join('\n\n'), chars, truncated: chars >= MODULE_BLOCK_CHAR_CAP }
}

/** 两臂 prompt 组装：A 不带增强块，B 把增强块拼进 system（位置稳定、可审计）。 */
export function buildArms(scene, moduleBlock) {
  const base = scene.system
  return {
    a: { system: base, prompt: scene.prompt },
    b: {
      system: base === '' ? `【增强模块】\n${moduleBlock}` : `${base}\n\n【增强模块】\n${moduleBlock}`,
      prompt: scene.prompt,
    },
  }
}

/** 调用计划：两臂配对、限量（默认 10 次 / 硬上限 20 次）。 */
export function planReplay(options = {}) {
  const requested = Number(options.maxCalls ?? DEFAULT_MAX_CALLS)
  const maxCalls = Math.min(HARD_MAX_CALLS, Math.max(2, Number.isFinite(requested) ? Math.floor(requested) : DEFAULT_MAX_CALLS))
  const perArm = Math.floor(maxCalls / 2)
  const scenes = (Array.isArray(options.scenes) ? options.scenes : []).map(normalizeScene).filter((s) => s.prompt !== '')
  const chosen = scenes.slice(0, perArm)
  return {
    maxCalls,
    perArm,
    scenes: chosen,
    calls: chosen.length * 2,
    skipped: Math.max(0, scenes.length - chosen.length),
    hardCap: HARD_MAX_CALLS,
  }
}

/** 成本预估：token 用粗估（中文 ~1.5 字/token），价格由调用方填（0 = 只报 token）。 */
export function estimateReplay(options = {}) {
  const plan = planReplay(options)
  const moduleBlock = typeof options.moduleBlock === 'string' ? options.moduleBlock : ''
  const maxTokens = Math.max(64, Number(options.maxTokens ?? DEFAULT_MAX_TOKENS) || DEFAULT_MAX_TOKENS)
  const rows = []
  let estInputTokens = 0
  for (const scene of plan.scenes) {
    const arms = buildArms(scene, moduleBlock)
    const inputA = estimateTokens(arms.a.system.length + arms.a.prompt.length) + 24
    const inputB = estimateTokens(arms.b.system.length + arms.b.prompt.length) + 24
    estInputTokens += inputA + inputB
    rows.push({ id: scene.id, title: scene.title, inputA, inputB })
  }
  const estOutputTokens = plan.calls * maxTokens
  const priceInput = Number(options.priceInput ?? 0) || 0
  const priceOutput = Number(options.priceOutput ?? 0) || 0
  const cost = priceInput > 0 || priceOutput > 0
    ? {
        currency: '（按你填的单价）',
        input: round2((estInputTokens / 1e6) * priceInput),
        output: round2((estOutputTokens / 1e6) * priceOutput),
        total: round2((estInputTokens / 1e6) * priceInput + (estOutputTokens / 1e6) * priceOutput),
        pricePerMillion: { input: priceInput, output: priceOutput },
      }
    : null
  return {
    plan,
    rows,
    estInputTokens,
    estOutputTokens,
    estTotalTokens: estInputTokens + estOutputTokens,
    maxTokensPerCall: maxTokens,
    cost,
  }
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100
}

/* ────────────────────────── 执行 ────────────────────────── */

/** 默认调用实现：DSH 平台 llm 服务（流式），拿满文本 + 真实用量。 */
function makeLlmCallModel(services) {
  const llm = services?.llm
  if (!llm || typeof llm.stream !== 'function') return null
  return async function callModel(req) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS)
    try {
      const textParts = []
      let usage = null
      let finish = null
      const stream = llm.stream({
        provider: req.provider,
        model: req.model,
        system: req.system,
        messages: [{ role: 'user', content: [{ type: 'text', text: req.prompt }] }],
        temperature: req.temperature,
        maxTokens: req.maxTokens,
        signal: controller.signal,
      })
      for await (const chunk of stream) {
        if (chunk == null) continue
        if (chunk.type === 'text-delta') textParts.push(String(chunk.text ?? ''))
        else if (chunk.type === 'usage') usage = chunk.usage
        else if (chunk.type === 'finish') finish = chunk.reason
      }
      if (finish && typeof finish === 'object' && (finish.kind === 'error' || finish.kind === 'aborted')) {
        const message = finish.failure?.message ?? finish.kind
        throw new Error(`模型调用未完成（${finish.kind}）：${message}`)
      }
      return { text: textParts.join(''), usage }
    } finally {
      clearTimeout(timer)
    }
  }
}

/** 解析本轮用的模型：请求显式值优先，否则取 DSH 默认模型选择。 */
export function resolveModel(options, services) {
  let selection = null
  try {
    selection = services?.defaultModel?.currentSelection?.() ?? null
  } catch {
    selection = null
  }
  return {
    provider: String(options?.provider ?? selection?.provider ?? '') || null,
    model: String(options?.model ?? selection?.model ?? '') || null,
  }
}

/**
 * 跑一轮 A/B 回放。只有传入 `options.confirm === true` 才执行（路由层也再挡一道）。
 * @param services {callModel?|llm?+defaultModel?}
 */
export async function runReplay(labRoot, options = {}, services = {}) {
  if (options?.confirm !== true) throw new ContractError('INVALID', '未确认执行（需要 confirm: true）')
  const callModel = typeof services?.callModel === 'function' ? services.callModel : makeLlmCallModel(services)
  if (callModel === null) throw new ContractError('UNAVAILABLE', 'llm 服务不可用（宿主没有 ctx.get("llm")，或未在插件上下文）')

  const target = safeName(options.target)
  const moduleSource = buildModuleBlock(labRoot, options.modulesPreset ?? 'style-lab')
  const plan = planReplay({ scenes: options.scenes, maxCalls: options.maxCalls })
  if (plan.scenes.length === 0) throw new ContractError('INVALID', '没有可跑的场景（先保存夹具或抓取场景）')

  const model = resolveModel(options, services)
  if (model.provider === null || model.model === null) throw new ContractError('INVALID', '未能确定模型（请在请求里显式给 provider / model）')

  const temperature = Number.isFinite(Number(options.temperature)) ? Number(options.temperature) : DEFAULT_TEMPERATURE
  const maxTokens = Math.max(64, Number(options.maxTokens ?? DEFAULT_MAX_TOKENS) || DEFAULT_MAX_TOKENS)

  const startedAt = Date.now()
  const rows = []
  for (const scene of plan.scenes) {
    const arms = buildArms(scene, moduleSource.block)
    const row = { id: scene.id, title: scene.title, a: await callArm(callModel, arms.a, { model, temperature, maxTokens }), b: await callArm(callModel, arms.b, { model, temperature, maxTokens }) }
    row.delta = {
      score: row.b.score - row.a.score,
      aiHits: row.b.aiHits - row.a.aiHits,
      weighted: round2(row.b.weighted - row.a.weighted),
    }
    rows.push(row)
  }

  const armStats = (key) => {
    const list = rows.map((r) => r[key])
    const avg = (fn) => (list.length === 0 ? 0 : round2(list.reduce((n, r) => n + fn(r), 0) / list.length))
    const usageTokens = (r) => {
      const u = r.usage
      if (u === null || u === undefined) return 0
      return Number(u.totalTokens ?? 0) || (Number(u.inputTokens ?? 0) + Number(u.outputTokens ?? 0))
    }
    return {
      avgScore: avg((r) => r.score),
      avgAiHits: avg((r) => r.aiHits),
      avgWeighted: avg((r) => r.weighted),
      avgChars: avg((r) => r.chars),
      avgSentence: avg((r) => r.avgSentence),
      avgDialogueRatio: avg((r) => r.dialogueRatio),
      tokens: list.reduce((n, r) => n + usageTokens(r), 0),
    }
  }
  const a = armStats('a')
  const b = armStats('b')

  // 可选：两臂输出 vs 目标分布（目标 = 你的改进稿，由路由层提供）
  let distance = null
  const targetTexts = (Array.isArray(options.targetTexts) ? options.targetTexts : []).filter((t) => typeof t === 'string' && t.trim() !== '')
  if (targetTexts.length > 0) {
    distance = {
      a: distributionDistance(targetTexts, rows.map((r) => r.a.text).filter(Boolean)),
      b: distributionDistance(targetTexts, rows.map((r) => r.b.text).filter(Boolean)),
    }
  }

  const record = {
    id: `${stamp()}-${target}`,
    at: startedAt,
    finishedAt: Date.now(),
    target,
    modulesPreset: moduleSource.dir,
    moduleBlockChars: moduleSource.chars,
    model,
    temperature,
    maxTokens,
    plan: { maxCalls: plan.maxCalls, perArm: plan.perArm, calls: plan.calls, skipped: plan.skipped },
    arms: { a: a, b: b, delta: { score: round2(b.avgScore - a.avgScore), aiHits: round2(b.avgAiHits - a.avgAiHits) } },
    distance,
    rows,
  }

  mkdirSync(replaysDir(labRoot), { recursive: true })
  const file = join(replaysDir(labRoot), `${safeName(record.id)}.json`)
  atomicWrite(file, JSON.stringify(record, null, 1) + '\n')
  return { record, file }
}

async function callArm(callModel, arm, params) {
  const startedAt = Date.now()
  try {
    const result = await callModel({
      provider: params.model.provider,
      model: params.model.model,
      system: arm.system,
      prompt: arm.prompt,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
    })
    const text = String(result?.text ?? '')
    const m = metrics(text)
    return {
      ok: true,
      text,
      chars: m.chars,
      score: m.score,
      aiHits: m.aiHits.total,
      weighted: m.aiHits.weighted,
      avgSentence: m.avgSentence,
      dialogueRatio: m.dialogueRatio,
      usage: result?.usage ?? null,
      ms: Date.now() - startedAt,
    }
  } catch (error) {
    return { ok: false, text: '', chars: 0, score: 0, aiHits: 0, weighted: 0, avgSentence: 0, dialogueRatio: 0, usage: null, ms: Date.now() - startedAt, error: String(error?.message ?? error) }
  }
}

function stamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return String(date.getFullYear()) + p(date.getMonth() + 1) + p(date.getDate()) + '-' + p(date.getHours()) + p(date.getMinutes()) + p(date.getSeconds())
}

/* ────────────────────────── 历史 ────────────────────────── */

export function listReplays(labRoot) {
  let names = []
  try {
    names = readdirSync(replaysDir(labRoot)).filter((n) => n.endsWith('.json'))
  } catch {
    return []
  }
  const out = []
  for (const name of names) {
    const doc = readJson(join(replaysDir(labRoot), name), undefined)
    if (doc === undefined) continue
    out.push({
      id: doc.id ?? name.replace(/\.json$/u, ''),
      at: doc.at ?? 0,
      target: doc.target ?? '',
      model: doc.model ?? null,
      calls: doc.plan?.calls ?? 0,
      deltaScore: doc.arms?.delta?.score ?? 0,
      aScore: doc.arms?.a?.avgScore ?? 0,
      bScore: doc.arms?.b?.avgScore ?? 0,
    })
  }
  return out.sort((x, y) => y.at - x.at)
}

export function readReplay(labRoot, id) {
  const key = safeName(id)
  const file = join(replaysDir(labRoot), `${key}.json`)
  const doc = readJson(file, undefined)
  if (doc === undefined) throw new ContractError('NOT_FOUND', `找不到回放记录 ${id}`)
  return { file, record: doc }
}

export function removeReplay(labRoot, id) {
  const key = safeName(id)
  const file = join(replaysDir(labRoot), `${key}.json`)
  const doc = readJson(file, undefined)
  if (doc === undefined) throw new ContractError('NOT_FOUND', `找不到回放记录 ${id}`)
  const backup = backupFile(file, labRoot, 'replay-remove')
  rmSync(file, { force: true })
  return { removed: file, backup }
}
