// 展示块校验器 —— 用**插件自己的词表**检查一段文本里的机器块是否合法。
//
//   node check-blocks.mjs <文件...>       # 校验文件
//   node check-blocks.mjs -              # 从 stdin 读
//   node check-blocks.mjs --dump         # 打印当前生效的词表（默认值）
//
// 为什么直接 import 插件源码：词表只有一份，避免「文档说的和代码做的不一样」。
// 插件目录按 DISPLAY_BLOCKS_DIR 环境变量 → D:/DSH/display-blocks 顺序找。
//
// 纪律（照 skill 编写规范）：
//   · **绝不静默通过**：文本里出现 `[[…]]{` 却解析不出块 → 硬报错 + 非零退出。
//   · 空产出也有哨兵：没找到任何块时明确说明「0 块」，不假装成功。

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const PLUGIN_DIR = process.env.DISPLAY_BLOCKS_DIR || 'D:/DSH/display-blocks'

async function loadPlugin() {
  const specUrl = pathToFileURL(path.join(PLUGIN_DIR, 'lib', 'spec.js')).href
  const parseUrl = pathToFileURL(path.join(PLUGIN_DIR, 'lib', 'parse.js')).href
  const renderUrl = pathToFileURL(path.join(PLUGIN_DIR, 'lib', 'render.js')).href
  try {
    const spec = await import(specUrl)
    const parse = await import(parseUrl)
    const render = await import(renderUrl)
    return { spec, parse, render }
  } catch (error) {
    console.error(`✖ 无法加载插件（${PLUGIN_DIR}）：${error.message}`)
    console.error('  用 DISPLAY_BLOCKS_DIR=<display-blocks 目录> 指定路径。')
    process.exit(2)
  }
}

const { spec, parse, render } = await loadPlugin()

// ── --dump：打印现行词表（写文档时以它为准） ──────────────
if (process.argv[2] === '--dump') {
  const s = spec.defaultSpec()
  console.log('稀有度（词 → 色）：')
  for (const r of s.rarities) console.log(`  ${r.word} = ${r.color}${r.aliases.length ? '  （别名：' + r.aliases.join('/') + '）' : ''}`)
  console.log('\n色码 / 色名：')
  const cols = Object.keys(s.colors)
  console.log('  ' + cols.join(' '))
  console.log('\n块类型（图标 · 默认色）：')
  for (const [k, v] of Object.entries(s.blocks)) console.log(`  ${v.icon} ${k}  ${v.color || '(无)'}  标题=${v.title}`)
  console.log('\n节（图标 · 默认色）：')
  for (const [k, v] of Object.entries(s.sections)) console.log(`  ${v.icon || '·'} ${k}  ${v.color || '(继承卡片)'}`)
  console.log('\n版式：' + spec.LAYOUTS.join(' / '))
  const d = spec.defaultSpec()
  console.log('兜底块：' + JSON.stringify(spec.FALLBACK_BLOCK) + '  兜底节：' + JSON.stringify(spec.FALLBACK_SECTION))
  process.exit(0)
}

const args = process.argv.slice(2)
if (!args.length) {
  console.error('用法：node check-blocks.mjs <文件...> | -  （或 --dump）')
  process.exit(2)
}

let text = ''
const sources = []
for (const a of args) {
  if (a === '-') { text += fs.readFileSync(0, 'utf8') + '\n'; sources.push('(stdin)'); continue }
  if (!fs.existsSync(a)) { console.error(`✖ 文件不存在：${a}`); process.exit(2) }
  text += fs.readFileSync(a, 'utf8') + '\n'
  sources.push(a)
}

const problems = []
const notes = []
const err = (msg) => problems.push(msg)

const baseSpec = spec.defaultSpec()
// 卡侧声明若在文本里（【展示规范】），把它算进去 —— 校验就该按「实际生效的词表」来
const spec$ = spec.specFromCardText(text, null)

// ── 先看有没有「像块但解析不出」的东西（最关键的一条） ──
const looksLikeBlock = /\[\[[^[\]\n]{1,16}\]\]\s*\{/g
const rawMarkers = [...text.matchAll(looksLikeBlock)].map((m) => m[1])
const segments = parse.extractBlocks(text)
const blocks = segments.filter((s) => s.kind === 'block')
if (rawMarkers.length > blocks.length) {
  err(`文本里有 ${rawMarkers.length} 处形如 [[标记]]{ 的地方，但只解析出 ${blocks.length} 个块 —— ` +
    `其余大概率是 JSON 里有换行 / 中文引号 / 尾逗号。**不要把这个结果当成合格输入。**`)
}

console.log(`来源：${sources.join('、')}`)
console.log(`机器块：${blocks.length} 个${blocks.length ? '（标记：' + blocks.map((b) => b.marker).join('、') + '）' : ''}`)
if (!blocks.length) {
  console.log('（0 块 —— 若你本意是输出卡片，说明契约没写对）')
}

const BLOCK_KEYS = ['名', '名称', 'title', 'name', '类型', 'type', '类别', '稀有度', 'rarity', '品质',
  '色', '颜色', '强调色', 'accent', 'color', '节', 'sections', '分节', '区块',
  '字段', 'fields', '属性', '条目', 'items', 'entries', '列表', '备注', 'note', 'notes', '说明']
const SEC_KEYS = ['名', '名称', 'name', 'title', '标题', '值', '内容', 'value', 'body', 'text',
  '图标', 'icon', '布局', 'layout', '样式', '色', '颜色', '强调色', 'accent', 'color',
  '稀有度', 'rarity', '品质', '节', 'sections', '分节', '区块']

function checkSections(raw, where, depth) {
  if (raw === null || raw === undefined) return
  const secs = render.normalizeSections(raw)
  if (!secs.length) { err(`${where}：节 是空的（空节不画，等于白写）`); return }
  if (secs.length > 8) notes.push(`${where}：有 ${secs.length} 节（建议 3~8 节，多了考虑拆卡）`)
  if (secs.length < 3) notes.push(`${where}：只有 ${secs.length} 节（少于 3 节不如直接用 字段）`)
  for (const sec of secs) {
    const label = `${where} · 节「${sec.name || '(无题)'}」`
    if (!sec.name && !(typeof sec.value === 'string')) err(`${label}：无题节只适合放整段文本`)
    if (sec.layout && spec.LAYOUTS.indexOf(sec.layout) < 0) {
      err(`${label}：布局「${sec.layout}」不是可用版式（${spec.LAYOUTS.join('/')}）`)
    }
    if (sec.color && !spec.resolveColor(spec$, sec.color)) err(`${label}：颜色「${sec.color}」解析不出来`)
    if (sec.rarity && !spec.rarityColor(spec$, sec.rarity)) {
      err(`${label}：稀有度「${sec.rarity}」不在词表里（不会上色）`)
    }
    const v = sec.value
    const empty = v === undefined || v === null || v === '' ||
      (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)
    if (empty) err(`${label}：值是空的（空节会被丢掉）`)
    if (typeof v === 'string' && v.trim().length > 150) {
      notes.push(`${label}：正文 ${v.trim().length} 字（建议 ≤150 字，超了考虑拆节或改用 列表）`)
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const nested = render.SECTION_KEYS.some((k) => v[k] !== undefined)
      if (nested) {
        if (depth >= 4) err(`${label}：嵌套超过 4 层，会被退化成 JSON 原文`)
        else checkSections(v, label, depth + 1)
      }
    }
  }
}

blocks.forEach((b, i) => {
  const n = `块 ${i + 1}（[[${b.marker}]]）`
  const d = b.json || {}
  // 皮肤自己管的标记：本插件只透传，键位归另一份契约（machine-blocks-pack.json），
  // 拿本契约的键位表去挑它的错只会产生假警报。
  if (render.DEFAULT_SKIP_MARKERS.indexOf(b.marker) >= 0) {
    notes.push(`${n}：这个标记由 DND 皮肤渲染（本插件透传），**不适用本契约的键位检查** —— ` +
      '它的形状见 D:\\DSH\\dnd-plugin\\contract\\machine-blocks-pack.json')
    return
  }
  if (/\n/.test(b.raw)) {
    notes.push(`${n}：块的 JSON 跨了多行 —— 本插件能解析（JSON.parse 允许空白），` +
      '但 DND 皮肤按行首分流、流式输出被截断时也更脆，**建议压成一行**。')
  }
  const unknown = Object.keys(d).filter((k) => BLOCK_KEYS.indexOf(k) < 0)
  if (unknown.length) notes.push(`${n}：顶层键 ${unknown.join('、')} 不在契约里（会被忽略，确认是否写错）`)

  const rarity = d['稀有度'] ?? d.rarity ?? d['品质']
  if (rarity && !spec.rarityColor(spec$, String(rarity))) {
    notes.push(`${n}：稀有度「${rarity}」不在词表 → 中性显示（要上色得在【展示规范】里声明）`)
  }
  const color = d['色'] ?? d['颜色'] ?? d['强调色'] ?? d.accent ?? d.color
  if (color !== undefined && !spec.resolveColor(spec$, String(color))) {
    err(`${n}：色「${color}」既不是 #hex 也不是词表里的色名`)
  }
  const hasType = d['类型'] !== undefined || d.type !== undefined || d['类别'] !== undefined
  if (!hasType && !spec.defaultSpec().blocks[b.marker]) {
    notes.push(`${n}：没写「类型」，标记 ${b.marker} 也不在词表 → 用兜底图标 📋`)
  }

  const sections = d['节'] ?? d.sections ?? d['分节'] ?? d['区块']
  if (sections !== undefined) checkSections(sections, n, 0)

  const fields = d['字段'] ?? d.fields ?? d['属性']
  if (fields !== undefined && (typeof fields !== 'object' || Array.isArray(fields))) {
    err(`${n}：字段 必须是对象（键值对）`)
  }
  const items = d['条目'] ?? d.items ?? d.entries ?? d['列表']
  if (items !== undefined && !Array.isArray(items)) err(`${n}：条目 必须是数组`)

  if (sections === undefined && fields === undefined && items === undefined) {
    notes.push(`${n}：只有标题，没有任何 节/字段/条目 —— 空卡`)
  }
})

// ── 行内标注统计 ──
const inlineRarity = []
for (const m of text.matchAll(/[（【]([^）】\n]{1,12})[）】]/g)) if (spec.rarityColor(spec$, m[1])) inlineRarity.push(m[1])
console.log(`行内稀有度标注：${inlineRarity.length} 处${inlineRarity.length ? '（' + [...new Set(inlineRarity)].join('、') + '）' : ''}`)

// ── 汇报 ──
if (notes.length) {
  console.log('\n提示（不阻断）：')
  for (const n of notes) console.log('  · ' + n)
}
if (problems.length) {
  console.log('\n错误：')
  for (const p of problems) console.log('  ✖ ' + p)
  console.log(`\n${problems.length} 项不通过 —— 修完再交。`)
  process.exit(1)
}
console.log('\n✔ 全部通过。')
