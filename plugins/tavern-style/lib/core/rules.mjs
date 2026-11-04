/**
 * 文风实验室 · 候选规则库（rules）
 *
 * 规则来自两条路：①「文风实验室」预设对语料做自我总结（LLM 产出 JSON）；
 * ② 工作台改进稿的差异归纳。这里负责**存 / 版本化 / 采纳与否决 / 转成酒馆增强模块**。
 *
 * 落点：`<labRoot>/data/rules/<bucket>.json`
 *   { bucket, updatedAt, versions: [ { at, source, note, rules: [ … ] } ] }
 * 每条规则：{ id, name, rule, bad, good, check, evidence[], confidence, status, enabled }
 *   status: candidate | accepted | rejected    enabled: 是否进增强模块
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ContractError, readJson, statOf, updateJsonFile, writeGuarded } from './contracts.mjs'

export const RULE_PREFIX = '✨增强丨文风·'

function root(labRoot) {
  return join(labRoot, 'data', 'rules')
}

function fileOf(labRoot, bucket) {
  const safe = String(bucket).replace(/[^A-Za-z0-9._\u4e00-\u9fff-]/gu, '_')
  return join(root(labRoot), `${safe}.json`)
}

/** 规则 id：名字 + 正文的短 hash（稳定、可复现）。 */
export function ruleId(rule) {
  return createHash('sha1').update(`${rule?.name ?? ''}|${rule?.rule ?? ''}`, 'utf8').digest('hex').slice(0, 12)
}

/** 把一条规则渲染成酒馆增强模块的正文（三件套 + 证据）。 */
export function ruleToContent(rule) {
  const lines = []
  lines.push(String(rule.rule ?? '').trim())
  if (rule.bad) lines.push('', `违反示例 → 正确示例`, `- 违反：${String(rule.bad).trim()}`, `- 正确：${String(rule.good ?? '').trim()}`)
  else if (rule.good) lines.push('', `正确示例：${String(rule.good).trim()}`)
  if (rule.check) lines.push('', `判定：${String(rule.check).trim()}`)
  if (Array.isArray(rule.evidence) && rule.evidence.length > 0) {
    lines.push('', `证据：${rule.evidence.slice(0, 3).map((e) => `「${String(e).slice(0, 20)}」`).join(' ')}`)
  }
  return lines.join('\n')
}

/** 采纳且启用的规则 → 酒馆模块数组。 */
export function rulesToModules(rules) {
  return (rules ?? [])
    .filter((r) => r.status === 'accepted' && r.enabled !== false)
    .map((r) => ({ name: r.name?.startsWith(RULE_PREFIX) ? r.name : RULE_PREFIX + String(r.name ?? '未命名'), content: ruleToContent(r), enabled: true }))
}

function normalizeRule(input) {
  const rule = {
    name: String(input?.name ?? '').trim(),
    rule: String(input?.rule ?? '').trim(),
    bad: String(input?.bad ?? '').trim(),
    good: String(input?.good ?? '').trim(),
    check: String(input?.check ?? '').trim(),
    evidence: Array.isArray(input?.evidence) ? input.evidence.map(String).slice(0, 5) : [],
    confidence: Number.isFinite(Number(input?.confidence)) ? Number(input.confidence) : 0.5,
    status: ['candidate', 'accepted', 'rejected'].includes(input?.status) ? input.status : 'candidate',
    enabled: input?.enabled !== false,
  }
  if (rule.name === '') rule.name = RULE_PREFIX + '未命名'
  if (!rule.name.startsWith(RULE_PREFIX)) rule.name = RULE_PREFIX + rule.name
  rule.id = ruleId(rule)
  return rule
}

/** 读一个桶（不存在返回空骨架）。 */
export function readBucket(labRoot, bucket) {
  const file = fileOf(labRoot, bucket)
  const doc = readJson(file, undefined)
  if (doc === undefined) {
    return { bucket, file, exists: false, mtimeMs: null, versions: [], current: [], counts: { candidate: 0, accepted: 0, rejected: 0 } }
  }
  const versions = Array.isArray(doc.versions) ? doc.versions : []
  const current = versions.length === 0 ? [] : versions[versions.length - 1].rules ?? []
  const counts = { candidate: 0, accepted: 0, rejected: 0 }
  for (const r of current) counts[r.status] = (counts[r.status] ?? 0) + 1
  return { bucket, file, exists: true, mtimeMs: statOf(file).mtimeMs, versions, current, counts }
}

/** 列所有桶（摘要）。 */
export function listBuckets(labRoot) {
  let names = []
  try {
    names = readdirSync(root(labRoot)).filter((n) => n.endsWith('.json'))
  } catch {
    return []
  }
  return names.map((n) => readBucket(labRoot, n.replace(/\.json$/u, ''))).map((b) => ({
    bucket: b.bucket,
    versions: b.versions.length,
    counts: b.counts,
    latest: b.versions.length === 0 ? 0 : b.versions[b.versions.length - 1].at ?? 0,
    rules: b.current.map((r) => ({ id: r.id, name: r.name, status: r.status, enabled: r.enabled, confidence: r.confidence })),
  }))
}

function ensureDoc(labRoot, bucket) {
  const file = fileOf(labRoot, bucket)
  mkdirSync(root(labRoot), { recursive: true })
  const existing = readJson(file, undefined)
  if (existing !== undefined) return { file, doc: existing }
  const doc = { bucket, updatedAt: Date.now(), versions: [] }
  // 文件首次创建：没有原文件可备份，用 writeGuarded 的空守卫路径（expectedMtimeMs=null）
  writeGuarded({ file, text: JSON.stringify(doc, null, 1) + '\n', labRoot, label: `rules-${bucket}-init`, json: true, expectedMtimeMs: null })
  return { file, doc }
}

/** 追加一个版本（新规则合并进"当前"视图；同名保留已有 status/enabled）。 */
export function addCandidates(labRoot, bucket, incoming, meta = {}) {
  const { file } = ensureDoc(labRoot, bucket)
  const before = readBucket(labRoot, bucket)
  const byName = new Map(before.current.map((r) => [r.name, r]))
  const added = []
  const kept = []
  for (const raw of incoming ?? []) {
    const rule = normalizeRule(raw)
    const existing = byName.get(rule.name)
    if (existing !== undefined) {
      kept.push(rule.name)
      continue
    }
    byName.set(rule.name, rule)
    added.push(rule.name)
  }
  const rules = [...byName.values()]
  const result = updateJsonFile({
    file,
    labRoot,
    label: `rules-${bucket}`,
    mutate: (doc) => {
      const versions = Array.isArray(doc.versions) ? doc.versions : []
      versions.push({ at: Date.now(), source: String(meta.source ?? 'manual'), note: String(meta.note ?? ''), rules })
      doc.versions = versions
      doc.updatedAt = Date.now()
      return doc
    },
  })
  return { file, added, kept, rules, backup: result.backup }
}

/** 改一条规则（状态/启用/正文/名字）。 */
export function updateRule(labRoot, bucket, id, patch) {
  const { file } = ensureDoc(labRoot, bucket)
  let found = null
  const result = updateJsonFile({
    file,
    labRoot,
    label: `rules-${bucket}-update`,
    mutate: (doc) => {
      const versions = Array.isArray(doc.versions) ? doc.versions : []
      const latest = versions[versions.length - 1]
      if (latest === undefined) throw new ContractError('NOT_FOUND', '该桶还没有任何版本')
      latest.rules = (latest.rules ?? []).map((r) => {
        if (r.id !== id) return r
        const next = { ...r }
        if (['candidate', 'accepted', 'rejected'].includes(patch?.status)) next.status = patch.status
        if (typeof patch?.enabled === 'boolean') next.enabled = patch.enabled
        if (typeof patch?.rule === 'string') next.rule = patch.rule
        if (typeof patch?.bad === 'string') next.bad = patch.bad
        if (typeof patch?.good === 'string') next.good = patch.good
        if (typeof patch?.check === 'string') next.check = patch.check
        if (typeof patch?.name === 'string' && patch.name.trim() !== '') {
          next.name = patch.name.startsWith(RULE_PREFIX) ? patch.name : RULE_PREFIX + patch.name
        }
        found = next
        return next
      })
      doc.updatedAt = Date.now()
      return doc
    },
  })
  if (found === null) throw new ContractError('NOT_FOUND', `找不到规则 ${id}`)
  return { rule: found, backup: result.backup }
}

/** 删除一条规则（从"当前"版本移除；旧版本仍在，可回滚）。 */
export function removeRule(labRoot, bucket, id) {
  const { file } = ensureDoc(labRoot, bucket)
  let removed = null
  const result = updateJsonFile({
    file,
    labRoot,
    label: `rules-${bucket}-remove`,
    mutate: (doc) => {
      const versions = Array.isArray(doc.versions) ? doc.versions : []
      const latest = versions[versions.length - 1]
      if (latest === undefined) throw new ContractError('NOT_FOUND', '该桶还没有任何版本')
      const before = latest.rules ?? []
      latest.rules = before.filter((r) => {
        if (r.id === id) {
          removed = r
          return false
        }
        return true
      })
      doc.updatedAt = Date.now()
      return doc
    },
  })
  if (removed === null) throw new ContractError('NOT_FOUND', `找不到规则 ${id}`)
  return { removed, backup: result.backup }
}

/** 版本对照：两个版本之间新增/删除/改动的规则。 */
export function compareVersions(labRoot, bucket, indexA, indexB) {
  const view = readBucket(labRoot, bucket)
  const a = view.versions[indexA]
  const b = view.versions[indexB]
  if (a === undefined || b === undefined) throw new ContractError('NOT_FOUND', '版本序号越界')
  const mapA = new Map((a.rules ?? []).map((r) => [r.name, r]))
  const mapB = new Map((b.rules ?? []).map((r) => [r.name, r]))
  const addedNames = [...mapB.keys()].filter((n) => !mapA.has(n))
  const removedNames = [...mapA.keys()].filter((n) => !mapB.has(n))
  const changed = [...mapB.keys()].filter((n) => mapA.has(n) && dataOf(mapB.get(n)) !== dataOf(mapA.get(n)))
  return {
    from: { index: indexA, at: a.at, source: a.source, count: (a.rules ?? []).length },
    to: { index: indexB, at: b.at, source: b.source, count: (b.rules ?? []).length },
    added: addedNames.map((n) => mapB.get(n).name),
    removed: removedNames.map((n) => mapA.get(n).name),
    changed: changed.map((n) => ({ name: n, from: mapA.get(n), to: mapB.get(n) })),
  }
}

function dataOf(rule) {
  return JSON.stringify({ rule: rule.rule, bad: rule.bad, good: rule.good, check: rule.check, status: rule.status, enabled: rule.enabled })
}

/** 导出"已采纳+启用"的模块（发布通道 / 增强层写入用）。 */
export function acceptedModules(labRoot, bucket) {
  return rulesToModules(readBucket(labRoot, bucket).current)
}

export { existsSync }
