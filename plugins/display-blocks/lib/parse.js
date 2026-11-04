// 展示层 · 解析（机器块 + 行内标注）
//
// 两件事，都不碰 DOM：
//   ① extractBlocks —— 把「[[任意标记]]{json}」从正文里切出来；
//   ② parseInline   —— 把行内标注（稀有度 / 颜色标签）切成 token。
//
// 判据纪律（沿用项目里踩过的真实 bug 教训）：
//   · 机器块判据必须是 `[[X]]{` **且大括号能配平解析出对象** —— 只测 /\[\[X\]\]/
//     会把皮肤自己写的「来源：[[商店]] …」这类说明文字误当机器块。
//   · 块可以被正文包着（不要求独占开头），因为别的卡不一定守那条契约。
//   · 稀有度标注**只在词表命中时才成立** —— 词表外的「（某某）」原样保留，
//     所以不会把普通括号内容染上颜色。

/* 词表查询直接 import —— spec.js 不反向依赖本模块，没有循环。 */
import { colorOf, rarityColor } from './spec.js'

/** 机器块标记：`[[名字]]{`。名字限制长度与字符，避免把 [[[1]]] 之类的噪音吃进来。 */
const MARKER_RE = /\[\[([^[\]\n]{1,16})\]\]\s*\{/g

/**
 * 从 `text[from]` 起，按大括号配平切出一个 JSON 对象。
 * 字符串内的 `{}`、转义引号都跳过；未闭合返回 null。
 */
export function balancedObject(text, from) {
  const t = String(text || '')
  const start = t.indexOf('{', from)
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < t.length; i++) {
    const c = t[i]
    if (inStr) {
      if (esc) { esc = false; continue }
      if (c === '\\') { esc = true; continue }
      if (c === '"') inStr = false
      continue
    }
    if (c === '"') { inStr = true; continue }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        const raw = t.slice(start, i + 1)
        try {
          const json = JSON.parse(raw)
          return json && typeof json === 'object' ? { json, raw, start, end: i + 1 } : null
        } catch {
          return null
        }
      }
    }
  }
  return null
}

/**
 * 把正文切成「文本段 / 机器块段」。
 * @param {string} text
 * @returns {{kind:'text',text:string}|{kind:'block',marker:string,json:object,raw:string,gap:string}[]}
 *   block.gap = `]]` 与 `{` 之间的原文（通常为空白；透传给别人渲染时要原样保留）
 */
export function extractBlocks(text) {
  const s = String(text || '')
  if (!s) return []
  const out = []
  let cursor = 0
  MARKER_RE.lastIndex = 0
  let m
  while ((m = MARKER_RE.exec(s)) !== null) {
    const marker = m[1]
    const braceAt = m.index + m[0].length - 1   // `{` 的位置
    const hit = balancedObject(s, braceAt)
    if (!hit) continue                              // 解析不出对象 → 当普通文本，继续找下一个
    if (hit.start !== braceAt) continue
    if (m.index > cursor) out.push({ kind: 'text', text: s.slice(cursor, m.index) })
    // gap：`[[标记]]` 的收尾 `]]` 之后、`{` 之前的原文切片（MARKER_RE 的 \s* 吞掉的空白）
    const headEnd = m.index + marker.length + 4     // `[[` + 名字 + `]]`
    out.push({ kind: 'block', marker, json: hit.json, raw: hit.raw, gap: s.slice(headEnd, braceAt) })
    cursor = hit.end
    MARKER_RE.lastIndex = hit.end
  }
  if (cursor < s.length) out.push({ kind: 'text', text: s.slice(cursor) })
  return out
}

// ── 行内标注 ───────────────────────────────────────────────

/** 稀有度标注的定界符对。`[]` 放最后，因为颜色标签也用 `[]`，先处理带闭合的那种。 */
const RARITY_PAIRS = [['（', '）'], ['【', '】'], ['[', ']']]

/** 生效的稀有度定界符对：spec.delimiters.rarity 可覆盖（见 mergeSpec），缺省用内置三种。 */
function rarityPairsOf(spec) {
  const pairs = spec && spec.delimiters && spec.delimiters.rarity
  if (!Array.isArray(pairs) || !pairs.length) return RARITY_PAIRS
  const out = []
  for (const p of pairs) {
    if (Array.isArray(p) && p.length >= 2 && p[0] && p[1]) out.push([String(p[0]), String(p[1])])
  }
  return out.length ? out : RARITY_PAIRS
}

/**
 * 解析行内标注 → token 序列。
 *
 * 支持（都由 spec 词表驱动，词表外的原样保留）：
 *   · 稀有度：`（传说）` / `【传说】` / `[传说]`
 *   · 颜色  ：`[g]金色文字[/g]`、`[血红]文字[/血红]`、`[#rrggbb]…[/#rrggbb]`；
 *             内外可嵌套稀有度标注
 *
 * 判据纪律：颜色标签**名字必须命中词表且必须有闭合**，否则原样保留 ——
 * 所以 `[传说]`（稀有度定界符）、Markdown 链接 `[文字](url)` 都不会被误吃。
 *
 * @param {string} text
 * @param {object} spec 生效规范
 * @returns {{kind:string}[]} token 序列
 */
export function parseInline(text, spec) {
  const s = String(text || '')
  if (!s) return []
  return parseColorSegments(s, spec)
}

/** 第一层：切颜色标签（有闭合才成立）。名字可以是 ASCII 短码，也可以是中文色名。 */
function parseColorSegments(text, spec) {
  const tokens = []
  const openRe = /\[([A-Za-z\u4e00-\u9fa5][A-Za-z0-9_\u4e00-\u9fa5]{0,9}|#[0-9a-fA-F]{3,8})\]/g
  let cursor = 0
  let m
  while ((m = openRe.exec(text)) !== null) {
    const code = m[1]
    const color = colorOf(spec, code)
    if (!color) continue
    // 闭合标签大小写不敏感（colorOf 查表就不敏感：`[g]x[/G]` 应当成立）
    const closeRe = new RegExp('\\[\\/' + code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\]', 'gi')
    closeRe.lastIndex = m.index + m[0].length
    const cm = closeRe.exec(text)
    if (!cm) continue                               // 没有闭合 → 不成立，当普通文本
    const closeAt = cm.index
    if (m.index > cursor) tokens.push(...parseRaritySegments(text.slice(cursor, m.index), spec))
    const inner = text.slice(m.index + m[0].length, closeAt)
    tokens.push({ kind: 'color', code, color, tokens: parseRaritySegments(inner, spec) })
    cursor = closeAt + cm[0].length
    openRe.lastIndex = cursor
  }
  if (cursor < text.length) tokens.push(...parseRaritySegments(text.slice(cursor), spec))
  return tokens
}

/** 第二层：切稀有度标注（只在词表命中时成立）。 */
function parseRaritySegments(text, spec) {
  const tokens = []
  const pairs = rarityPairsOf(spec)
  let cursor = 0
  let guard = 0
  while (cursor < text.length && guard++ < 5000) {
    let best = null
    for (const [open, close] of pairs) {
      let at = text.indexOf(open, cursor)
      while (at >= 0) {
        const end = text.indexOf(close, at + open.length)
        if (end < 0) break
        const inner = text.slice(at + open.length, end)
        // 词表命中才成立；内层不允许再有定界符（避免嵌套歧义）。
        // 长度帽只防误配，不跟词表较劲：词表允许任意长的稀有度词，这里给 32 宽限。
        const color = inner.length <= 32 && !/[[\]（）【】]/.test(inner) ? rarityColor(spec, inner) : null
        if (color) {
          if (!best || at < best.at) best = { at, end, open, close, word: inner.trim(), color }
          break
        }
        at = text.indexOf(open, at + open.length)
      }
    }
    if (!best) break
    if (best.at > cursor) tokens.push({ kind: 'text', text: text.slice(cursor, best.at) })
    tokens.push({ kind: 'rarity', word: best.word, color: best.color, open: best.open, close: best.close })
    cursor = best.end + best.close.length
  }
  if (cursor < text.length) tokens.push({ kind: 'text', text: text.slice(cursor) })
  return tokens
}

/* 词表查询直接 import 自 spec.js（见文件头），此处无需再注入。 */
