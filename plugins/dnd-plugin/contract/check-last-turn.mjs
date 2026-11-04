// 回看「最近这一轮模型到底写没写机器块」——走面板 API + 复用展示块校验器。
//
//   node check-last-turn.mjs [--preset <presetId>] [--session <sid>] [--limit 2] [--chars 400]
//
// 回答两个问题：
//   ① 契约有没有落在**真正在用的会话**上（没有会话绑定该预设 = 契约根本没被注入，导入≠生效）；
//   ② 那一轮的正文里，块写了吗、写得合法吗、有几个节/几处标注。
//
// 为什么用面板 API 而不是自己解 zstd 会话文件：dsh-tavern 已经做了这件事
// （`readRecentMessages`），复用它比复现它的解码口径可靠。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function arg(name, def) {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 ? (process.argv[i + 1] || def) : def
}
const BASE = process.env.DSH_TAVERN_BASE || 'http://127.0.0.1:19387'
const PRESET = arg('preset', 'preset-mtzu16fw-mu5jbq')
const SESSION = arg('session', '')
const LIMIT = Math.max(1, Math.min(50, Number(arg('limit', '2')) || 2))
const CHARS = Math.max(80, Number(arg('chars', '400')) || 400)
const CHECKER = process.env.DISPLAY_BLOCKS_CHECKER ||
  'C:/Users/m0408/.dsh/skills/display-blocks/scripts/check-blocks.mjs'

const get = async (p) => {
  const r = await fetch(BASE + p)
  if (!r.ok) throw new Error('HTTP ' + r.status + (r.status === 401 ? '（鉴权围栏：面板现在要 token，先确认能打开面板页面）' : ''))
  return r.json()
}

const ss = await get('/api/tavern/sessions')
const all = (ss.sessions || []).filter((s) => s.origin !== 'subagent')

console.log('面板：' + BASE)
console.log('目标预设：' + PRESET)

// ── ① 有没有会话真的绑着这个预设 ─────────────────────
const bound = all.filter((s) => s.boundPreset === PRESET)
console.log('')
console.log('① 会话绑定')
console.log('  绑定到该预设的会话：' + (bound.length ? bound.length + ' 个' : '**0 个**'))
if (!bound.length) {
  const byPreset = {}
  for (const s of all) byPreset[s.boundPreset || '(无)'] = (byPreset[s.boundPreset || '(无)'] || 0) + 1
  console.log('  实际分布：' + Object.entries(byPreset).map(([k, v]) => k + '×' + v).join('、'))
  console.log('  ⚠️ 没有会话绑定 = 这套预设的世界书/卡/契约**都不会被注入** → 表现就是"什么都没生效"。')
  console.log('     照做：面板里【新建一个空白会话】→ 用【聊天顶部】的 Agent 预设选择器选中该预设。')
}

// ── 选要看的会话 ────────────────────────────────────
let target = SESSION ? all.find((s) => s.id === SESSION) : (bound[0] || all[0])
if (!target) { console.error('✖ 找不到可看的会话'); process.exit(2) }
const caveat = (SESSION || bound.length) ? '' : '⚠️ 未绑定目标预设，以下内容可能不是该预设产生的'
console.log('')
console.log('② 最近 ' + LIMIT + ' 条消息（会话 ' + target.id.slice(0, 24) + '… ' + (target.bindingSource ? '绑定来源=' + target.bindingSource : '') + '）')
if (caveat) console.log('  ' + caveat)

let content
try { content = await get('/api/tavern/session-content?id=' + encodeURIComponent(target.id) + '&limit=' + LIMIT) }
catch (e) { console.error('✖ 读会话内容失败：' + e.message); process.exit(2) }

const text = String(content.text || '')
console.log('  取回 ' + content.count + ' 条消息 / ' + text.length + ' 字符')
console.log('  结尾片段：' + JSON.stringify(text.slice(-CHARS)).slice(0, CHARS + 40))
if (!text.trim()) { console.log('  （空内容——这个会话还没有消息）'); process.exit(0) }

// ── 交给校验器 ──────────────────────────────────────
const tmp = path.join(os.tmpdir(), 'dsp-last-turn.md')
fs.writeFileSync(tmp, text, 'utf8')
console.log('')
console.log('③ 机器块检查（复用 ' + path.basename(CHECKER) + '）')
if (!fs.existsSync(CHECKER)) {
  console.error('  ✖ 找不到校验器：' + CHECKER + '（用 DISPLAY_BLOCKS_CHECKER 指定）')
  process.exit(2)
}
const r = spawnSync(process.execPath, [CHECKER, tmp], { encoding: 'utf8' })
console.log((r.stdout || '').trim())
if (r.status !== 0) console.log('（校验器退出码 ' + r.status + '）')

const blockCount = (() => {
  const m = /机器块：(\d+) 个/.exec(r.stdout || '')
  return m ? Number(m[1]) : 0
})()
console.log('')
console.log(blockCount > 0
  ? '✅ 这一轮模型**确实在写机器块**（' + blockCount + ' 个）——契约在起作用。'
  : '⚠️ 这一轮没写机器块。可能：① 该轮本来就不需要块；② 契约没注入到本会话（看 ①）；③ 模型的块被写成普通叙述（正文没丢，但没有卡片）。')
