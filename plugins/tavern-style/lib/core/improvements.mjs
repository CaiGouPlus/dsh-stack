/**
 * 文风实验室 · 改进工作台存储（improvements）
 *
 * 存"你在插件里改出来的版本"——教学信号最强的一类语料。
 * 落点：`<labRoot>/data/improvements/<sessionId>/<seq>.json`
 *   { sessionId, seq, turn, step, original, improved, tags[], note, at,
 *     beforeScore, afterScore, pushedToTavern }
 *
 * 注意：**绝不回写会话日志**（append-only 多帧 zstd，回写会毁档）。
 * 只有"推送到酒馆显示层"是可选动作，且写的是酒馆自己的 edited-messages.json（带备份）。
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ContractError, readJson, statOf, atomicWrite, backupFile } from './contracts.mjs'
import { compare } from './score.mjs'

export const TAGS = ['八股', 'AI味', '出戏', '抢话', '视角越界', '太长', '重复', '结尾升华', '节奏', '用词']

function root(labRoot) {
  return join(labRoot, 'data', 'improvements')
}

function sessionDir(labRoot, sessionId) {
  return join(root(labRoot), String(sessionId).replace(/[^A-Za-z0-9._-]/gu, '_'))
}

function fileOf(labRoot, sessionId, seq) {
  return join(sessionDir(labRoot, sessionId), `${String(seq)}.json`)
}

/** 保存（或覆盖）一条改进。同 seq 覆盖前先备份。 */
export function save(labRoot, payload) {
  const sessionId = String(payload?.sessionId ?? '').trim()
  const seq = Number(payload?.seq)
  const improved = String(payload?.improved ?? '')
  if (sessionId === '') throw new ContractError('INVALID', '缺少 sessionId')
  if (!Number.isFinite(seq)) throw new ContractError('INVALID', '缺少 seq（模型消息序号）')
  if (improved.trim() === '') throw new ContractError('INVALID', '改进正文为空')

  const original = String(payload?.original ?? '')
  const diff = compare(original, improved)
  const tags = Array.isArray(payload?.tags) ? payload.tags.map(String).filter((t) => TAGS.includes(t)) : []

  const dir = sessionDir(labRoot, sessionId)
  mkdirSync(dir, { recursive: true })
  const file = fileOf(labRoot, sessionId, seq)
  const before = statOf(file)
  if (before.exists) backupFile(file, labRoot, 'improvement')

  const record = {
    sessionId,
    seq,
    turn: Number.isFinite(Number(payload?.turn)) ? Number(payload.turn) : null,
    step: Number.isFinite(Number(payload?.step)) ? Number(payload.step) : null,
    original,
    improved,
    tags,
    note: String(payload?.note ?? ''),
    at: Date.now(),
    beforeScore: diff.before.score,
    afterScore: diff.after.score,
    delta: diff.delta,
    pushedToTavern: payload?.pushedToTavern === true,
  }
  atomicWrite(file, JSON.stringify(record, null, 1) + '\n')
  return { record, file, diff }
}

/** 读一条。 */
export function get(labRoot, sessionId, seq) {
  return readJson(fileOf(labRoot, sessionId, seq), undefined)
}

/** 删除一条（可回滚：删前备份）。 */
export function remove(labRoot, sessionId, seq) {
  const file = fileOf(labRoot, sessionId, seq)
  if (!existsSync(file)) throw new ContractError('NOT_FOUND', '该改进不存在')
  const backup = backupFile(file, labRoot, 'improvement-remove')
  rmSync(file, { force: true })
  return { removed: file, backup }
}

/** 列一条会话的改进。 */
export function listForSession(labRoot, sessionId) {
  const dir = sessionDir(labRoot, sessionId)
  let names = []
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  const out = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    const record = readJson(join(dir, name), undefined)
    if (record !== undefined) out.push(record)
  }
  return out.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
}

/** 全量列举（列表页用，只给摘要以免过大）。 */
export function listAll(labRoot, options = {}) {
  const withText = options.withText === true
  const base = root(labRoot)
  let sessions = []
  try {
    sessions = readdirSync(base)
  } catch {
    return { sessions: [], total: 0 }
  }
  const out = []
  let total = 0
  for (const session of sessions) {
    const records = listForSession(labRoot, session)
    if (records.length === 0) continue
    total += records.length
    out.push({
      sessionId: session,
      count: records.length,
      avgDelta: Math.round(records.reduce((n, r) => n + (r.delta?.score ?? 0), 0) / records.length),
      tags: [...new Set(records.flatMap((r) => r.tags ?? []))],
      latest: Math.max(...records.map((r) => r.at ?? 0)),
      items: withText
        ? records
        : records.map((r) => ({
            seq: r.seq,
            turn: r.turn,
            step: r.step,
            tags: r.tags,
            note: r.note,
            at: r.at,
            beforeScore: r.beforeScore,
            afterScore: r.afterScore,
            delta: r.delta,
            chars: { original: (r.original ?? '').length, improved: (r.improved ?? '').length },
          })),
    })
  }
  out.sort((a, b) => b.latest - a.latest)
  return { sessions: out, total }
}

/** 汇总：最常被消灭的八股类型、平均提升、标签分布（比对页用）。 */
export function aggregate(labRoot) {
  const all = listAll(labRoot, { withText: true }).sessions.flatMap((s) => s.items)
  const removed = new Map()
  const added = new Map()
  const byTag = new Map()
  let scoreDelta = 0
  for (const record of all) {
    const diff = compare(record.original, record.improved)
    for (const name of diff.removed) {
      const deltaCount = (diff.before.aiHits.byPattern[name] ?? 0) - (diff.after.aiHits.byPattern[name] ?? 0)
      removed.set(name, (removed.get(name) ?? 0) + deltaCount)
    }
    for (const name of diff.added) added.set(name, (added.get(name) ?? 0) + 1)
    for (const tag of record.tags ?? []) byTag.set(tag, (byTag.get(tag) ?? 0) + 1)
    scoreDelta += diff.delta.score
  }
  const sortDesc = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }))
  return {
    improvements: all.length,
    scoreDeltaAvg: all.length === 0 ? 0 : Math.round(scoreDelta / all.length),
    removedPatterns: sortDesc(removed).slice(0, 12),
    addedPatterns: sortDesc(added).slice(0, 8),
    byTag: sortDesc(byTag),
  }
}

/** 把一条改进导出成 Markdown（放进 lab 的 out/ 作为成果）。 */
export function exportMarkdown(labRoot, record) {
  const diff = compare(record.original ?? '', record.improved ?? '')
  const lines = [
    `# 改进记录 · seq ${record.seq}（turn ${record.turn ?? '?'} / step ${record.step ?? '?'}）`,
    '',
    `- 标签：${(record.tags ?? []).join('、') || '（无）'}`,
    `- 批注：${record.note || '（无）'}`,
    `- 分数：${diff.before.score} → ${diff.after.score}（Δ${diff.delta.score}）`,
    `- 八股命中：${diff.before.aiHits.total} → ${diff.after.aiHits.total}（Δ${diff.delta.aiHits}）`,
    `- 消灭的类型：${diff.removed.join('、') || '（无）'}`,
    '',
    '## 模型原文',
    '',
    '```text',
    record.original ?? '',
    '```',
    '',
    '## 你的改进',
    '',
    '```text',
    record.improved ?? '',
    '```',
    '',
  ]
  const dir = join(labRoot, 'lab-workspace', 'out', 'reports')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `improvement-${record.sessionId}-${record.seq}.md`)
  writeFileSync(file, lines.join('\n'), 'utf8')
  return file
}
