// 预演 `tavern_card_append` 的 dryRun —— **不需要 dsh 环境、只读不写**。
//
//   node dry-run-append.mjs [契约包路径] [变体] [预设目录]
//   默认：display-blocks-pack.json / generic / preset-mtzu16fw-mu5jbq（DND 卡）
//
// 为什么需要它：往卡的 desc 里注契约是**每轮都生效**的动作，desc 又会无条件全量注入 prompt。
// 真跑之前先看「会追加什么、加多少字、marker 在不在」，比事后发现预算爆了强。
//
// ⚠️ 本脚本复现的是工具 lib/index.js 里 cardAppend 的**读取与判定逻辑**（pack 取法、
//    marker、分隔符、字符数），不会写任何文件。真正写入仍必须用 dsh 里的工具。

import fs from 'node:fs'
import path from 'node:path'

const packPath = process.argv[2] || 'D:/DSH/dnd-plugin/contract/display-blocks-pack.json'
const variant = process.argv[3] || 'generic'
const presetDir = process.argv[4] || 'C:/Users/m0408/.dsh/.agent-presets/preset-mtzu16fw-mu5jbq'

const fail = (msg) => { console.error(`✖ ${msg}`); process.exit(1) }

// ── 读契约包（与 cardAppend 同样的取法）──────────────────
if (!fs.existsSync(packPath)) fail(`契约包不存在：${packPath}`)
let pack
try { pack = JSON.parse(fs.readFileSync(packPath, 'utf8')) } catch (e) { fail(`契约包解析失败：${e.message}`) }
const contracts = pack?.contracts?.[variant]
if (!contracts || typeof contracts !== 'object') {
  const have = pack?.contracts ? Object.keys(pack.contracts).join('、') : '（无 contracts）'
  fail(`契约包里没有 variant「${variant}」。可用：${have}`)
}
const parts = Object.keys(contracts)
  .filter((k) => k !== 'note' && typeof contracts[k] === 'string' && contracts[k].trim())
  .map((k) => contracts[k].trim())
if (!parts.length) fail(`variant「${variant}」里没有可追加的文本`)
const text = parts.join('\n\n')
const marker = String(pack.idempotencyMarker || '').trim() || text.split(/\r?\n/)[0].slice(0, 40).trim()

// ── 读卡（只读）────────────────────────────────────────
const charsFile = path.join(presetDir, 'characters.json')
if (!fs.existsSync(charsFile)) fail(`找不到 ${charsFile}`)
const raw = JSON.parse(fs.readFileSync(charsFile, 'utf8'))
const cards = Array.isArray(raw) ? raw : (raw.characters || raw.cards || [])
if (!cards.length) fail('这个预设里没有卡')

console.log(`契约包：${path.basename(packPath)}  变体：${variant}  段数：${parts.length}`)
console.log(`预设：  ${path.basename(presetDir)}  卡数：${cards.length}`)
console.log(`幂等标记：${marker}\n`)

const SEPARATOR = '\n\n'
for (const [i, card] of cards.entries()) {
  const name = String(card.name ?? `[${i}]`)
  const desc = String(card.desc || '')
  if (desc.includes(marker)) {
    console.log(JSON.stringify({
      preset: path.basename(presetDir),
      card: name,
      action: 'already-present',
      marker,
      descChars: desc.length,
      note: 'desc 里已经有这个标记了，**没有写入任何东西**。',
    }, null, 2))
    continue
  }
  const separator = desc.trim() ? SEPARATOR : ''
  const next = desc + separator + text.trim()
  console.log(JSON.stringify({
    preset: path.basename(presetDir),
    card: name,
    action: 'dry-run',
    marker,
    descCharsBefore: desc.length,
    descCharsAfter: next.length,
    delta: next.length - desc.length,
    pack: { file: packPath, variant, sections: Object.keys(contracts).filter((k) => k !== 'note') },
    appendPreview: text.trim().slice(0, 300) + (text.trim().length > 300 ? ' …' : ''),
    note: 'dryRun=true：只报告会追加什么，**没有写入**。',
  }, null, 2))
  console.log(`\n—— 会追加的全文（${text.trim().length} 字）——\n`)
  console.log(text.trim())
  console.log(`\n—— 预算 ——`)
  console.log(`desc ${desc.length} → ${next.length} 字符（+${next.length - desc.length}，+${((next.length - desc.length) / desc.length * 100).toFixed(1)}%）`)
}
