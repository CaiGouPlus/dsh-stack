// 酒馆工具层 —— SillyTavern 角色卡解析与归一化
//
// 定位：补**面板导入器**丢字段的那一环。面板的 handleCharFile（见
// dsh-tavern 2.5.0 lib/client.manager.bundle.js:1189）只把
//   { name, desc: description||personality, first: first_mes, enabled }
// 写进 characters.json。卡里其余的东西全部消失：
//   scenario / mes_example / system_prompt / post_history_instructions /
//   alternate_greetings / creator_notes / creator / tags /
//   extensions.regex_scripts / extensions.depth_prompt
// 面板其实**已经**把内嵌 character_book 抽出来写进世界书（同文件 1191–1241），
// 所以本模块不重复那件事，只补真正缺的：字段折叠 + 原始卡归档 + 正则脚本。
//
// 铁律：**不改写卡内容**。原文里有什么就搬什么，只加分区标题；
// 不执行、不求值、不翻译卡里的模板（<%…%> / {{…}} 原样保留，交给服务端既有的
// expandStMacros / cleanSillyTavernVars 处理，见 tavern lib/index.js:1439）。
//
// 纯函数模块（只依赖 node 内置），可单独 node --test。

import zlib from 'node:zlib'

// ── PNG 内嵌卡数据 ─────────────────────────────────────────
//
// SillyTavern 的卡就是一张 PNG，卡数据 base64 存在 tEXt 块里，keyword 通常是
// `chara`（v2）或 `ccv3`（v3）。块结构：
//   length(4,BE) type(4,ASCII) data(length) crc(4)
// tEXt data = keyword\0text(latin1)
// iTXt data = keyword\0 compFlag(1) compMethod(1) langTag\0 translatedKeyword\0 text(utf8)
// zTXt data = keyword\0 compMethod(1) zlib(rest)

export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** 卡数据关键字，按优先级：ccv3（新版）→ chara（v2 标准）→ character（旧）。 */
export const CARD_KEYWORDS = ['ccv3', 'chara', 'character']

export function isPng(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length > 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)
}

/**
 * 取出 PNG 里所有文本块。
 * @param {Buffer} buffer
 * @returns {{keyword: string, text: string, kind: string}[]}
 */
export function parsePngTextChunks(buffer) {
  const out = []
  if (!isPng(buffer)) return out
  let offset = 8
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    // 越界/非法长度：截断的 PNG，能读多少算多少。
    if (length < 0 || dataEnd > buffer.length) break
    if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
      const chunk = buffer.subarray(dataStart, dataEnd)
      const nul = chunk.indexOf(0)
      if (nul > 0) {
        const keyword = chunk.toString('latin1', 0, nul)
        try {
          if (type === 'tEXt') {
            out.push({ keyword, text: chunk.toString('latin1', nul + 1), kind: type })
          } else if (type === 'zTXt') {
            const compressed = chunk.subarray(nul + 2) // 跳过 compressionMethod 一字节
            out.push({ keyword, text: zlib.inflateSync(compressed).toString('utf8'), kind: type })
          } else {
            // iTXt：compFlag(1) compMethod(1) 然后 langTag\0 translatedKeyword\0 然后文本
            const compFlag = chunk[nul + 1]
            let cursor = nul + 3
            const langEnd = chunk.indexOf(0, cursor)
            cursor = langEnd < 0 ? cursor : langEnd + 1
            const transEnd = chunk.indexOf(0, cursor)
            cursor = transEnd < 0 ? cursor : transEnd + 1
            const payload = chunk.subarray(cursor)
            const text = compFlag === 1 ? zlib.inflateSync(payload).toString('utf8') : payload.toString('utf8')
            out.push({ keyword, text, kind: type })
          }
        } catch {
          // 单个块坏掉不影响其它块（zlib 失败 / 编码异常）。
        }
      }
    }
    if (type === 'IEND') break
    offset = dataEnd + 4 // 跳过 CRC
  }
  return out
}

/**
 * 从 PNG 里取出角色卡对象。
 * @returns {{card: object, keyword: string, keywordsSeen: string[]}|null}
 */
export function extractCardFromPng(buffer) {
  const chunks = parsePngTextChunks(buffer)
  const seen = chunks.map((c) => c.keyword)
  for (const keyword of CARD_KEYWORDS) {
    const hit = chunks.find((c) => c.keyword === keyword)
    if (!hit) continue
    const card = decodeCardPayload(hit.text)
    if (card) return { card, keyword: hit.keyword, keywordsSeen: seen }
  }
  // 关键字不认识的卡：试所有块，谁能解析出带 name 的对象就用谁。
  for (const chunk of chunks) {
    const card = decodeCardPayload(chunk.text)
    if (card && typeof card === 'object' && (card.name || card.description || card.first_mes)) {
      return { card, keyword: chunk.keyword, keywordsSeen: seen }
    }
  }
  return null
}

// ── 卡数据解码 ─────────────────────────────────────────────

/**
 * 解码卡数据：JSON 原文，或 base64（URL-safe 也认）编码的 JSON。
 * @param {string} text
 * @returns {object|null}
 */
export function decodeCardPayload(text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object') return parsed
  } catch {
    // 不是 JSON，继续按 base64 试
  }
  try {
    const clean = trimmed.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = Buffer.from(clean, 'base64').toString('utf8').trim()
    const parsed = JSON.parse(decoded)
    if (parsed && typeof parsed === 'object') return parsed
  } catch {
    // 都不是
  }
  return null
}

/** v2/v3 卡的外层信封 `{ spec, data: {...} }` → 卡体；v1 直接就是卡体。 */
export function cardBody(card) {
  if (card && typeof card === 'object' && card.data && typeof card.data === 'object') return card.data
  return card || {}
}

export function specVersion(card) {
  const v = card && typeof card === 'object' ? card.spec : undefined
  if (typeof v === 'string' && v) return v
  const sv = cardBody(card).spec_version
  if (typeof sv === 'string' && sv) return sv
  return 'chara_card_v1?'
}

// ── 内嵌世界书 ─────────────────────────────────────────────

const BOOK_PATHS = [
  ['character_book'], ['characterBook'], ['world_book'], ['worldbook'], ['worldBook'],
  ['world_info'], ['worldinfo'], ['lorebook'], ['lore_book'], ['book'],
  ['extensions', 'character_book'], ['extensions', 'world_book'], ['extensions', 'lorebook'],
  ['data', 'character_book'], ['data', 'world_book'], ['data', 'lorebook'],
  ['data', 'extensions', 'character_book'], ['data', 'extensions', 'world_book']
]

/**
 * 找内嵌世界书。返回原始对象 + 归一化条目数组。
 * ⚠️ 面板导入器自己也做这件事（客户端 deep walk）；这里做是为了**报告**
 * 「这张卡带了多少条世界书」，并把 ST 语义字段（constant / selective /
 * secondary_keys / case_sensitive / insertion_order）原样带进 worldbooks.json
 * —— 面板的匹配器只认 keys∪keywords，其余字段留着不丢，将来修匹配器时数据还在。
 */
export function findEmbeddedBook(card) {
  if (!card || typeof card !== 'object') return null
  for (const p of BOOK_PATHS) {
    let obj = card
    for (const key of p) {
      if (!obj || typeof obj !== 'object') { obj = null; break }
      obj = obj[key]
    }
    const book = coerceBook(obj)
    if (book) return book
  }
  return null
}

function coerceBook(obj) {
  if (!obj) return null
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj) } catch { return null }
  }
  let entries = null
  if (Array.isArray(obj)) entries = obj
  else if (Array.isArray(obj.entries)) entries = obj.entries
  // ST 导出的世界书常用 uid 字典形态：{ entries: { "0": {...}, "1": {...} } }
  else if (obj.entries && typeof obj.entries === 'object') entries = Object.values(obj.entries)
  else if (obj && typeof obj === 'object') entries = Object.values(obj)
  if (!Array.isArray(entries)) return null
  const kept = entries.filter((e) => e && typeof e === 'object' && (e.content || e.text))
  if (!kept.length) return null
  return { raw: obj, entries: kept }
}

/** ST 条目 → 面板条目（保留 ST 语义字段，不改写正文）。 */
export function normalizeBookEntries(entries) {
  return (Array.isArray(entries) ? entries : [])
    .filter((e) => e && typeof e === 'object' && (e.content || e.text))
    .map((e) => {
      const content = typeof e.content === 'string' ? e.content : String(e.text || '')
      // ST：keys 是主字段；部分导出件写 keywords。
      const keys = [
        ...(Array.isArray(e.keys) ? e.keys : []),
        ...(Array.isArray(e.keywords) ? e.keywords : []),
        ...(Array.isArray(e.key) ? e.key : [])
      ].filter((k) => typeof k === 'string' && k.trim()).map((k) => k.trim())
      const secondary = Array.isArray(e.secondary_keys)
        ? e.secondary_keys.filter((k) => typeof k === 'string' && k.trim())
        : []
      const out = {
        name: String(e.name || e.comment || titleFromContent(content) || '未命名条目'),
        comment: typeof e.comment === 'string' ? e.comment : '',
        keys: [...new Set(keys)],
        keywords: [...new Set(keys)],
        content,
        text: content,
        enabled: e.enabled !== false
      }
      // ST 注入语义：留着，不丢（面板当前只按 keys∪keywords 匹配）。
      if (secondary.length) out.secondary_keys = secondary
      if (e.selective === true) out.selective = true
      if (e.constant === true) out.constant = true
      if (e.case_sensitive === true) out.case_sensitive = true
      if (Number.isInteger(e.insertion_order)) out.insertion_order = e.insertion_order
      if (Number.isInteger(e.priority)) out.priority = e.priority
      if (e.position !== undefined) out.position = e.position
      return out
    })
}

function titleFromContent(content) {
  const first = String(content || '').split(/\r?\n/).find((l) => l.trim())
  if (!first) return ''
  const stripped = first.replace(/^[#\s【\[（(]+/, '').replace(/[】\]）)]+\s*$/, '').trim()
  return stripped.length > 0 && stripped.length <= 30 ? stripped : ''
}

// ── 卡字段折叠 ─────────────────────────────────────────────
//
// 面板真正注入的只有 desc / first 两个字段（tavern-tools/lib/data.js
// CARD_INJECTED_FIELDS）。所以「不丢字段」的唯一办法是把 ST 的其余分区折进 desc。
// 分区顺序照 ST 自己的组装顺序（description → personality → scenario →
// mes_example → system_prompt → post_history_instructions），这样提示词里
// 「设定 → 场景 → 示例 → 指令」的相对位置与 ST 一致。

export const CARD_SECTIONS = Object.freeze([
  { key: 'description', title: '角色设定', aliases: ['description', 'char_persona', 'desc'] },
  { key: 'personality', title: '性格', aliases: ['personality'] },
  { key: 'scenario', title: '场景', aliases: ['scenario', 'world_scenario'] },
  { key: 'mes_example', title: '对话示例', aliases: ['mes_example', 'example_dialogue', 'char_greeting_examples'] },
  { key: 'system_prompt', title: '角色系统提示', aliases: ['system_prompt'] },
  { key: 'post_history_instructions', title: '角色后置指令', aliases: ['post_history_instructions', 'post_history_prompt'] }
])

function pickField(body, aliases) {
  for (const a of aliases) {
    const v = body[a]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

/**
 * 把一张 ST 卡折成面板的 `desc`。
 * @returns {{ desc: string, sections: {key: string, title: string, chars: number}[] }}
 */
export function foldCardToDesc(card) {
  const body = cardBody(card)
  const parts = []
  const sections = []
  for (const section of CARD_SECTIONS) {
    const value = pickField(body, section.aliases)
    if (!value) continue
    parts.push(`【${section.title}】\n${value}`)
    sections.push({ key: section.key, title: section.title, chars: value.length })
  }
  return { desc: parts.join('\n\n'), sections }
}

/** 开场白：first_mes / first_message / char_greeting。 */
export function firstMessageOf(card) {
  const body = cardBody(card)
  return pickField(body, ['first_mes', 'first_message', 'char_greeting', 'greeting'])
}

/** 备选开场白数组（alternate_greetings）。 */
export function alternateGreetingsOf(card) {
  const body = cardBody(card)
  const list = body.alternate_greetings
  if (!Array.isArray(list)) return []
  return list.filter((g) => typeof g === 'string' && g.trim()).map((g) => g.trim())
}

/**
 * 卡自带的 ST 正则脚本。四处都找（与 dsh-muv-engine regexScriptsOf 同口径，
// 见 dsh-muv-engine/lib/regex-engine.js:84-94）。
 */
export function regexScriptsOf(card) {
  if (!card || typeof card !== 'object') return []
  if (Array.isArray(card.regexScripts)) return card.regexScripts
  const body = cardBody(card)
  if (Array.isArray(body.regex_scripts)) return body.regex_scripts
  const nested = body?.extensions?.regex_scripts
  if (Array.isArray(nested)) return nested
  if (Array.isArray(card?.data?.extensions?.regex_scripts)) return card.data.extensions.regex_scripts
  return []
}

/** 深度提示（extensions.depth_prompt）——ST 的作者注记，面板无对应字段。 */
export function depthPromptOf(card) {
  const ext = cardBody(card)?.extensions
  const dp = ext && typeof ext === 'object' ? ext.depth_prompt : undefined
  if (!dp || typeof dp !== 'object') return null
  const prompt = typeof dp.prompt === 'string' ? dp.prompt.trim() : ''
  if (!prompt) return null
  return { prompt, depth: Number.isFinite(dp.depth) ? dp.depth : undefined, role: dp.role }
}

// ── 顶层归一化 ─────────────────────────────────────────────

/**
 * 任意来源的卡 → 归一化结果。**不改写入参。**
 * @param {object} card 原始卡（任意 spec）
 * @returns {object}
 */
export function normalizeStCard(card) {
  const body = cardBody(card)
  const { desc, sections } = foldCardToDesc(card)
  const book = findEmbeddedBook(card)
  const name = String(body.name || card?.name || '').trim()
  return {
    spec: specVersion(card),
    name,
    desc,
    sections,
    first: firstMessageOf(card),
    altGreetings: alternateGreetingsOf(card),
    regexScripts: regexScriptsOf(card),
    depthPrompt: depthPromptOf(card),
    book: book ? { name: String(book.raw?.name || book.raw?.title || ''), entries: normalizeBookEntries(book.entries), rawCount: book.entries.length } : null,
    creator: String(body.creator || '').trim(),
    creatorNotes: String(body.creator_notes || '').trim(),
    tags: Array.isArray(body.tags) ? body.tags.filter((t) => typeof t === 'string') : [],
    characterVersion: String(body.character_version || '').trim()
  }
}

/** 从原始卡 JSON 里挑出「面板不认、但归档要留」的字段清单（用于报告）。 */
export function unmappedFields(card) {
  const body = cardBody(card)
  const mapped = new Set([
    ...CARD_SECTIONS.flatMap((s) => s.aliases),
    'first_mes', 'first_message', 'char_greeting', 'greeting',
    'name', 'alternate_greetings', 'regex_scripts', 'extensions'
  ])
  return Object.keys(body).filter((k) => !mapped.has(k))
}
