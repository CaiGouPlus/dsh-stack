// 按 inject-debug.log 最后一轮的清单，把注入条目正文从 worldbooks.json 拼成一份可读文件
import fs from 'node:fs'

const LOG = 'C:/Users/m0408/.dsh/.agent-presets/inject-debug.log'
const WB = 'C:/Users/m0408/.dsh/.agent-presets/preset-muvji8fi-bo68f0/worldbooks.json'
const OUT = process.argv[2] || 'D:/DSH/DSH/上轮注入全文.md'

const lines = fs.readFileSync(LOG, 'utf8').trim().split('\n')
// 最后一条「世界书注入(ST)」行
let inj = ''
for (let i = lines.length - 1; i >= 0; i--) { if (lines[i].includes('世界书注入(ST)')) { inj = lines[i]; break } }
const ts = (inj.match(/^\[([^\]]+)\]/) || [])[1] || ''
const head = (inj.match(/世界书注入\(ST\): ([^,]+, [^,]+, [^,]+, [^,]+, 总[^,]+, [^,]+字符[^,]*, isFull=[^,]+, 模式=[^,\]]+)/) || [])[1] || ''
const mList = (inj.match(/条目=\[(.*)\]$/) || [])[1] || ''
const items = mList.split('], ').map((s) => {
  const m = s.match(/^(.*)\[(const|matched|full|stage):(\d+)字$/) || s.match(/^(.*)\[(const|matched|full|stage):(\d+)字\]$/)
  return m ? { name: m[1], reason: m[2], chars: Number(m[3]) } : null
}).filter(Boolean)

const wb = JSON.parse(fs.readFileSync(WB, 'utf8'))
const all = []
for (const g of wb.groups || []) for (const e of g.entries || []) all.push(e)
const label = (e) => String(e.comment || e.name || '')
const used = new Set()
const out = [
  '# 上一轮真实注入全文（复原自 inject-debug.log＋worldbooks.json）',
  '',
  `- 时间：${ts}`,
  `- 概况：${head}`,
  `- 注入 ${items.length} 条；下方按注入顺序展开全文。`,
  '',
]
let total = 0
for (const it of items) {
  // 按 标签名+字数 精确匹配；同名多条按字数区分
  let hit = all.find((e) => !used.has(e) && label(e) === it.name && String(e.content || '').length === it.chars)
  if (!hit) hit = all.find((e) => !used.has(e) && String(e.content || '').length === it.chars)
  total += it.chars
  out.push(`---`, '', `## ${it.name}（${it.reason}｜${it.chars} 字）`, '')
  if (hit) { used.add(hit); out.push(hit.content || '', '') }
  else out.push(`［未在 worldbooks.json 中定位到该条目］`, '')
}
out.unshift(`- 正文合计：${total} 字`, '')
fs.writeFileSync(OUT, out.join('\n'))
console.log('条目:', items.length, '| 正文合计:', total, '字 | 写出:', OUT, fs.statSync(OUT).size, 'bytes')
