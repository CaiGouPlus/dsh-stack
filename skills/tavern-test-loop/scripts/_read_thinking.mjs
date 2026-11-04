// 提取酒馆会话原始日志里的思维链（reasoning 块）——只读不改
// 用法：node _read_thinking.mjs [--session <id>] [--tail 3] [--out <path>]
const BASE = process.env.DSH_TAVERN_BASE || 'http://127.0.0.1:19387'
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d }
const TAIL = Number(arg('tail', 3))
const OUT = arg('out', 'C:/Users/m0408/AppData/Local/Temp/tavern-thinking.md')

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { zstdDecompressSync } from 'node:zlib'

const LOG_RE = /^session(?:\.v(\d+))?\.jsonl(?:\.zstd)?$/

// 1) 定位会话（不指定 --session 时按日志 mtime 取最新，不信 API 列表顺序）
//    --workspace <关键字> 只在目录名含该关键字的工作区里找（如 sillytavern），
//    防止抓到维护会话自己（它的日志永远是 mtime 最新的）。
const WS_KEY = String(arg('workspace', '') || '').toLowerCase()
const ss = (await (await fetch(BASE + '/api/tavern/sessions')).json()).sessions || []
const root0 = path.join(os.homedir(), '.dsh', 'sessions')
const logMtime = (sid) => {
  let best = 0
  for (const d of fs.readdirSync(root0, { withFileTypes: true })) {
    if (!d.isDirectory()) continue
    if (WS_KEY && !d.name.toLowerCase().includes(WS_KEY)) continue
    for (const cand of ['session-' + String(sid).replace(/^session-/, ''), String(sid)]) {
      const dir = path.join(root0, d.name, cand)
      if (!fs.existsSync(dir)) continue
      for (const name of fs.readdirSync(dir)) {
        if (!LOG_RE.test(name)) continue
        const t = fs.statSync(path.join(dir, name)).mtimeMs
        if (t > best) best = t
      }
    }
  }
  return best
}
const want = arg('session', '')
const target = want
  ? ss.find((s) => String(s.id) === want)
  : ss.map((s) => ({ s, t: logMtime(s.id) })).sort((a, b) => b.t - a.t)[0]?.s
if (!target) { console.log('无会话'); process.exit(0) }
console.log('会话:', target.id, '| 标题:', target.title || '', '| 日志时间:', new Date(logMtime(target.id)).toLocaleString('zh-CN'))

// 2) 找日志文件（~/.dsh/sessions/<工作区>/<会话>/session*.jsonl*，取代数最大）
const root = path.join(os.homedir(), '.dsh', 'sessions')
let logFile = null, bestGen = -1
for (const d of fs.readdirSync(root, { withFileTypes: true })) {
  if (!d.isDirectory()) continue
  if (WS_KEY && !d.name.toLowerCase().includes(WS_KEY)) continue
  for (const cand of ['session-' + String(target.id).replace(/^session-/, ''), String(target.id)]) {
    const dir = path.join(root, d.name, cand)
    if (!fs.existsSync(dir)) continue
    for (const name of fs.readdirSync(dir)) {
      const m = LOG_RE.exec(name); if (!m) continue
      const gen = m[1] ? Number(m[1]) : 0
      if (gen > bestGen) { bestGen = gen; logFile = path.join(dir, name) }
    }
  }
}
if (!logFile) { console.log('没找到会话日志'); process.exit(0) }
console.log('日志:', logFile)

// 3) zstd 多帧解压 → JSONL 事件
const buf = fs.readFileSync(logFile)
const magic = Buffer.from([0x28, 0xB5, 0x2F, 0xFD])
const frames = []
for (let pos = 0; ;) {
  const i = buf.indexOf(magic, pos); if (i === -1) break
  frames.push(i); pos = i + 4
}
const events = []
for (let i = 0; i < frames.length; i++) {
  const seg = buf.subarray(frames[i], i + 1 < frames.length ? frames[i + 1] : buf.length)
  let text; try { text = zstdDecompressSync(seg).toString('utf8') } catch { continue }
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try { events.push(JSON.parse(line)) } catch {}
  }
}
console.log('事件:', events.length)

// 4) 收集 reasoning 块
const hits = []
for (const ev of events) {
  if (ev.type !== 'assistant/message') continue
  const content = ev.data?.message?.content
  if (!Array.isArray(content)) continue
  const blocks = content.filter((b) => b && b.type === 'reasoning')
  if (!blocks.length) continue
  const texts = []
  for (const b of blocks) {
    // 兼容多种存法：text / content[].text / summary[].text / reasoning_content
    const grab = (x) => {
      if (typeof x === 'string') return x
      if (Array.isArray(x)) return x.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('\n')
      return ''
    }
    const t = grab(b.text) || grab(b.content) || grab(b.summary) || grab(b.reasoning_content) || grab(b.reasoning) || ''
    texts.push(t)
    if (!t) texts.push('[空块 keys=' + Object.keys(b).join(',') + ']')
  }
  hits.push({ ts: ev.ts || ev.data?.ts || '', text: texts.join('\n') })
}
console.log('含思维链的助手消息:', hits.length, '| 块结构样例:', hits.length ? '' : '(无)')
if (hits.length) {
  const sample = hits[hits.length - 1].text
  console.log('最新一条思维链长度:', sample.length, '字')
}

// 5) 输出尾部 N 条
const tail = hits.slice(-TAIL)
const md = [
  '# 思维链提取（' + (target.title || target.id) + '）',
  '',
  '共 ' + hits.length + ' 条带思维链的助手消息，以下为最后 ' + tail.length + ' 条。',
  '',
  ...tail.map((h, i) => `## 思维链 ${hits.length - tail.length + i + 1}\n\n${h.text}\n`),
].join('\n')
fs.writeFileSync(OUT, md)
console.log('写出:', OUT, fs.statSync(OUT).size, 'bytes')
