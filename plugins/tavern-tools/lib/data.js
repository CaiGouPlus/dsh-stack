// 酒馆工具层 —— 数据访问层
//
// 设计铁律：
//   1. **不引入第二份数据真相**。人物卡、世界书、预设模块全部直接读写
//      chen731215/dsh-tavern 2.5.0 面板自己用的那些文件：
//        $DSH_HOME/.agent-presets/presets.json          预设注册表
//        $DSH_HOME/.agent-presets/session-bindings.json 会话→预设绑定
//        $DSH_HOME/.agent-presets/<dir>/characters.json 角色卡数组
//        $DSH_HOME/.agent-presets/<dir>/worldbooks.json 世界书（v2 对象或旧数组）
//        $DSH_HOME/.agent-presets/<dir>/presets.json    预设模块数组
//        $DSH_HOME/.agent-presets/<dir>/preset.yml      显示名
//      面板里看到的 = 模型读到的 = 写回去的。
//
//   2. **不重复实现面板已有的能力**。特别是：
//      · 世界书自动注入（关键词/常驻/阶段选择）—— 面板自己做，工具只补
//        「按需主动查阅未被注入的条目」；
//      · 历史正文检索 —— DSH 原生 session_query 已提供全文检索，面板的记忆总结
//        （tavern-data/sessions/<id>/memory.md，按 autoEvery 自动生成）也覆盖了
//        「回忆剧情」，工具层不重复造；
//      · 注入本身（tavern:card / nsfw / edits / enhance 四段）—— 不碰。
//
//   3. agent.cordis.yml 是**客户端生成的快照**（面板点「保存预设」时由前端拼好
//      写入），服务端每轮真正注入的是 index.js 里 cardTextFor() 现读的
//      characters.json + worldbooks.json + presets.json。所以本层只写后三者，
//      下一轮回复即生效；快照文件留给面板自己维护，避免两套写法互覆。
//
// 纯函数模块（只碰 fs/path），可单独 node --test，不依赖 cordis 上下文。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// ── 路径解析（与面板 resolveDshHome 同序：$DSH_HOME（非空）→ ~/.dsh）──
export function resolveDshHome(env = process.env) {
  const raw = env && typeof env.DSH_HOME === 'string' ? env.DSH_HOME.trim() : ''
  return raw ? path.resolve(raw) : path.join(os.homedir(), '.dsh')
}

export function resolveRoot(dshHome) {
  return path.join(dshHome || resolveDshHome(), '.agent-presets')
}

export const DEFAULT_PRESET_ID = 'default'
export const DEFAULT_PRESET_DIR = 'tavern-lite'

// ── 通用读写 ────────────────────────────────────────────────
function readJsonAny(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

export function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

/** 原子写：临时文件 + rename，避免面板正在读时读到半截 JSON。 */
export function writeJsonAtomic(file, value) {
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = path.join(dir, `.${path.basename(file)}.tmp-${process.pid}-${Date.now()}`)
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
  fs.renameSync(tmp, file)
}

function presetDisplayName(dir) {
  const m = /^\s*name:\s*(.+)$/m.exec(readText(path.join(dir, 'preset.yml')))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
}

// ── 预设注册表 ──────────────────────────────────────────────
export function readPresetsMeta(root) {
  const value = readJsonAny(path.join(root, 'presets.json'))
  const list = Array.isArray(value) ? value : Array.isArray(value?.presets) ? value.presets : []
  return { presets: list.filter((p) => p && typeof p === 'object' && typeof p.id === 'string') }
}

/** 磁盘上真实存在、能当酒馆预设用的目录（含 preset.yml）。 */
export function scanPresetDirs(root) {
  let names = []
  try {
    names = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }
  const out = []
  for (const name of names) {
    const dir = path.join(root, name)
    if (!fs.existsSync(path.join(dir, 'preset.yml'))) continue
    const hasData = fs.existsSync(path.join(dir, 'agent.cordis.yml')) ||
      fs.existsSync(path.join(dir, 'characters.json')) ||
      fs.existsSync(path.join(dir, 'worldbooks.json'))
    if (hasData) out.push({ id: name, dir: name, name: presetDisplayName(dir) || name })
  }
  return out
}

export function listPresets(root) {
  const byId = new Map()
  for (const p of readPresetsMeta(root).presets) {
    byId.set(p.id, {
      id: p.id,
      dir: typeof p.dir === 'string' && p.dir ? p.dir : p.id,
      name: typeof p.name === 'string' && p.name ? p.name : p.id,
      mode: p.mode || ''
    })
  }
  for (const s of scanPresetDirs(root)) {
    if (!byId.has(s.id)) byId.set(s.id, { id: s.id, dir: s.dir, name: s.name, mode: '' })
  }
  return [...byId.values()]
}

export function getPresetDir(root, presetId) {
  if (!presetId || typeof presetId !== 'string') return ''
  const entry = listPresets(root).find((p) => p.id === presetId)
  if (!entry) return ''
  const dir = path.join(root, entry.dir)
  return fs.existsSync(dir) ? dir : ''
}

/**
 * 会话绑定的预设 id。
 *
 * ⚠️ 这条路径**不允许静默兜底**。面板的权威来源是 DSH 会话事件流里的
 * `agent-preset/selected`（见面板 resolveAuthoritativePreset，fail-closed 语义），
 * 本层读不到；能读到的只有面板自己的记账 session-bindings.json + cwdPresets。
 * 所以：
 *   · 有显式 presetId      → 用它（调用方明确指定）；
 *   · 记账里只有 legacy 条目（面板视为未绑定）→ 拒绝，要求显式指定；
 *   · 记账解析不出          → **拒绝**（返回 ok:false + 可用预设清单），
 *     绝不退回 default/tavern-lite —— 写工具静默写到别的预设是数据事故。
 */
export function resolvePreset(root, sessionId, explicitPresetId) {
  const all = listPresets(root)
  const ids = all.map((p) => p.id)

  if (explicitPresetId) {
    if (ids.includes(explicitPresetId)) return { ok: true, presetId: explicitPresetId, source: 'argument' }
    return { ok: false, reason: 'explicit-unknown', available: ids, tried: explicitPresetId }
  }

  if (sessionId) {
    const bindings = readJsonAny(path.join(root, 'session-bindings.json'))
    const rec = bindings && typeof bindings === 'object' ? bindings[sessionId] : undefined
    if (rec && typeof rec === 'object') {
      const pid = rec.presetId
      // legacy 条目在面板语义里等于「未绑定」，不能当依据。
      if (rec.source === 'legacy') return { ok: false, reason: 'legacy-binding', available: ids, tried: pid }
      if (typeof pid === 'string' && ids.includes(pid)) return { ok: true, presetId: pid, source: 'binding' }
      return { ok: false, reason: 'binding-invalid', available: ids, tried: pid }
    }
    return { ok: false, reason: 'unbound', available: ids }
  }

  return { ok: false, reason: 'no-session', available: ids }
}

// ── 角色卡 ──────────────────────────────────────────────────
export function readCharacters(dir) {
  const value = readJsonAny(path.join(dir, 'characters.json'))
  const list = Array.isArray(value) ? value : Array.isArray(value?.characters) ? value.characters : []
  return list.filter((c) => c && typeof c === 'object')
}

export function writeCharacters(dir, list) {
  writeJsonAtomic(path.join(dir, 'characters.json'), list)
}

/** 面板 cardTextFor 真正注入的字段：desc / first / text / content。 */
export const CARD_INJECTED_FIELDS = Object.freeze(['desc', 'first', 'text', 'content'])

export function cardInjectedText(card) {
  const parts = []
  for (const field of CARD_INJECTED_FIELDS) {
    if (typeof card[field] === 'string' && card[field].trim()) parts.push(card[field].trim())
  }
  return parts.join('\n')
}

export function cardIndex(card) {
  return {
    name: typeof card.name === 'string' ? card.name : '',
    enabled: card.enabled !== false,
    injectedChars: cardInjectedText(card).length
  }
}

// ── 世界书 ──────────────────────────────────────────────────
/**
 * 归一化世界书。面板支持两种落盘格式：
 *   v2  { version:2, injectMode:'keyword'|'full', groups:[{name,enabled,entries:[…]}] }
 *   旧  [ { name, enabled, entries:[…] } ]
 */
export function readWorldbookEntries(dir) {
  const raw = readWorldbookRaw(dir)
  const groups = raw.kind === 'legacy-array' ? raw.value : raw.value.groups
  const out = []
  groups.forEach((g, gi) => {
    if (!g || typeof g !== 'object') return
    const entries = Array.isArray(g.entries) ? g.entries : []
    entries.forEach((e, ei) => {
      if (!e || typeof e !== 'object') return
      out.push({
        group: typeof g.name === 'string' && g.name ? g.name : `组${gi + 1}`,
        gi,
        ei,
        entry: e,
        enabled: e.enabled !== false && g.enabled !== false,
        content: typeof e.content === 'string' ? e.content : typeof e.text === 'string' ? e.text : '',
        keys: entryKeys(e)
      })
    })
  })
  return {
    format: raw.kind === 'missing' ? 'missing' : raw.kind,
    injectMode: typeof raw.value.injectMode === 'string' ? raw.value.injectMode : 'full',
    entries: out
  }
}

/** ST 语义：keys ∪ keywords 并集（与面板 utils.matchWorldbookEntries 一致）。 */
export function entryKeys(entry) {
  const list = [
    ...(Array.isArray(entry.keys) ? entry.keys : []),
    ...(Array.isArray(entry.keywords) ? entry.keywords : [])
  ].filter((k) => typeof k === 'string' && k.trim())
  return [...new Set(list.map((k) => k.trim()))]
}

export function readWorldbookRaw(dir) {
  const value = readJsonAny(path.join(dir, 'worldbooks.json'))
  if (Array.isArray(value)) return { kind: 'legacy-array', value }
  if (value && typeof value === 'object' && Array.isArray(value.groups)) return { kind: 'v2', value }
  return { kind: 'missing', value: { version: 2, injectMode: 'full', groups: [] } }
}

export function writeWorldbookRaw(dir, raw) {
  writeJsonAtomic(path.join(dir, 'worldbooks.json'), raw.value)
}

/** 条目对外引用号：稳定、可复述、与检索结果一一对应。 */
export function entryRef(item) {
  return `${item.group}#${item.ei + 1}`
}

// ── 预设模块 ────────────────────────────────────────────────
export function readPresetModules(dir) {
  const value = readJsonAny(path.join(dir, 'presets.json'))
  return Array.isArray(value) ? value.filter((m) => m && typeof m === 'object') : []
}

export function writePresetModules(dir, modules) {
  writeJsonAtomic(path.join(dir, 'presets.json'), modules)
}

// ── 会话记忆与关系网（只读；面板负责生成与注入）────────────
export function sessionDataDir(dshHome, sessionId) {
  return path.join(dshHome, 'tavern-data', 'sessions', sessionId)
}

export function readSessionMemory(dshHome, sessionId) {
  return readText(path.join(sessionDataDir(dshHome, sessionId), 'memory.md'))
}

export function readSessionRelations(dshHome, sessionId) {
  return readJsonAny(path.join(sessionDataDir(dshHome, sessionId), 'relations.json'))
}

// ── 检索实现（移植自 flizzywine/dsh-tavern 的 worldbook_search 算法）──
//
// 这是**算法移植**：原实现吃它们自己的条目视图（{ref,title,content,primaryKeys}），
// 这里吃面板的 {group,ei,content,keys}。保留的关键语义：
//   1. 静态检索永不执行模板 —— 命中片段直接来自原文，不把 <%…%>/{{…}} 当已求值；
//   2. 中文分词用 Intl.Segmenter，但显式多词短语（空格分隔）优先，
//      避免「武当」被切成「武」+「当」而误命中；
//   3. 打分：标题命中 > keys 命中 > 正文命中，全串命中额外加权。
const SEGMENTER = (() => {
  try {
    return new Intl.Segmenter('zh', { granularity: 'word' })
  } catch {
    return null
  }
})()

const normalize = (value) => String(value || '').normalize('NFKC').toLowerCase()

/** 去掉模板与标签，只留可读文本（用于片段与打分，不改写原文）。 */
export function literalText(value) {
  return String(value || '')
    .replace(/<%[\s\S]*?%>/g, ' ')
    .replace(/\{\{[\s\S]*?\}\}/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function queryTerms(query) {
  const needle = normalize(query)
  const phrases = needle.split(/\s+/).filter(Boolean)
  const segmented = SEGMENTER
    ? [...SEGMENTER.segment(needle)].filter((p) => p.isWordLike).map((p) => p.segment)
    : []
  return [...new Set(phrases.length > 1 ? phrases : [needle, ...segmented.filter((w) => w.length > 1)])]
}

export function searchEntries(entries, query, { offset = 0, limit = 5, includeDisabled = false } = {}) {
  const needle = normalize(query)
  const words = queryTerms(query)
  const scored = []
  entries.forEach((item, index) => {
    if (!includeDisabled && !item.enabled) return
    if (!String(item.content || '').trim()) return
    const title = String(item.entry.name || item.entry.comment || '')
    const body = literalText(item.content)
    const heading = normalize(title)
    const keys = normalize(item.keys.join(' '))
    const text = normalize(body)
    const hits = words.filter((word) => heading.includes(word) || keys.includes(word) || text.includes(word))
    if (!hits.length) return
    const score = (hits.length / Math.max(1, words.length)) * 20 +
      (heading.includes(needle) ? 50 : 0) +
      hits.reduce((sum, word) => sum + (heading.includes(word) ? 100 : keys.includes(word) ? 20 : 0), 0)
    const position = Math.max(0, text.indexOf(hits.find((word) => text.includes(word)) || ''))
    const start = Math.max(0, position - 60)
    scored.push({
      index,
      item,
      score,
      matchedTerms: hits,
      templated: /<%|\{\{/.test(item.content),
      snippet: (start ? '…' : '') + body.slice(start, start + 300) + (body.length > start + 300 ? '…' : '')
    })
  })
  scored.sort((a, b) => b.score - a.score || a.index - b.index)
  return {
    total: scored.length,
    offset,
    hasMore: offset + limit < scored.length,
    entries: scored.slice(offset, offset + limit)
  }
}
