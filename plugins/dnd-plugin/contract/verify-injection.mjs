// 验证「展示块契约真的会进 prompt」——**只读**，走两条独立证据。
//
//   node verify-injection.mjs [预设目录名或 presetId]
//
// 证据①（活的）：`GET /api/tavern/preset?presetId=…` —— 面板自己返回的 presets/agentYml。
// 证据②（复现）：按 dsh-tavern `cardTextFor()`（lib/index.js:1530-1599）的三源顺序读文件并拼装，
//               报告各部分体积 + 契约文本是否在其中。
//
// 为什么要两条：证据①证明「面板看得到」，证据②证明「拼进 prompt 的顺序与体积」。
// ②是复现而非调用原函数（cardTextFor 未导出），所以脚本里标了源码行号，改动时好对照。

import fs from 'node:fs'
import path from 'node:path'

const PRESET = process.argv[2] || 'preset-mtzu16fw-mu5jbq'
const MODULE_NAME = process.argv[3] || '✨增强丨展示块·输出契约'
const BASE = process.env.DSH_TAVERN_BASE || 'http://127.0.0.1:19387'
const home = process.env.USERPROFILE || 'C:\\Users\\m0408'
const dir = path.isAbsolute(PRESET) ? PRESET : path.join(home, '.dsh', '.agent-presets', PRESET)
const MARK = '【展示块输出契约】'

console.log('预设目录：' + dir)
console.log('面板：' + BASE)
console.log('')

// ── 证据①：问活着的面板 ──────────────────────────────
// ⚠️ 参数名是 `id`（lib/index.js:4824）。传 `presetId` 它**不会报错**，而是静默回退到
//    `getSessionPresetId(lastSessionId)`（当前会话的预设）→ 你会拿到另一个预设的模块列表。
//    所以这里必须回读 presetId 比对，不一致就判定为"没验到"，绝不当作通过。
try {
  const want = path.basename(dir)
  const r = await fetch(BASE + '/api/tavern/preset?id=' + encodeURIComponent(want))
  if (!r.ok) throw new Error('HTTP ' + r.status + (r.status === 401 ? '（鉴权围栏：需带 token）' : ''))
  const j = await r.json()
  console.log('证据① 面板视图（GET /api/tavern/preset?id=…）')
  if (j.presetId !== want) {
    console.log('  ⚠️ 面板返回的 presetId=' + j.presetId + '，与请求的 ' + want + ' 不一致 → 本次**没有验到**目标预设（可能参数名写错或该 id 不存在）')
    throw new Error('presetId 不匹配')
  }
  const mods = []
  for (const group of (j.presets || [])) {
    for (const m of (group.modules || [])) mods.push({ group: group.name || '', name: m.name, len: String(m.content || '').length, enabled: m.enabled !== false })
  }
  console.log('  预设名=' + j.name + '  卡字数=' + (j.cardChars ?? '?') + '  模块数=' + mods.length);
  const hit = mods.find((m) => m.name === MODULE_NAME)
  console.log('  ' + (hit ? '✅ 契约模块在面板视图里' : '❌ 面板视图里没有契约模块') +
    (hit ? '（组「' + hit.group + '」，' + hit.len + ' 字，' + (hit.enabled ? '启用' : '停用') + '）' : ''));
  if (!hit && mods.length) mods.forEach((m) => console.log('    · ' + m.name + ' ' + m.len + ' 字'))
} catch (e) {
  console.log('  （' + e.message + '）')
}

// ── 证据②：复现 cardTextFor 的组装 ─────────────────────
console.log('')
console.log('证据② 复现 cardTextFor() 的拼装（lib/index.js:1530-1599）')
const parts = []

// ① agent.cordis.yml 的 persona prefix（util.extractCardText 同口径）
const yml = path.join(dir, 'agent.cordis.yml')
if (fs.existsSync(yml)) {
  const t = fs.readFileSync(yml, 'utf8')
  const lines = t.split(/\r?\n/)
  let start = -1, indent = 0
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)(?:text|prefix):\s*\|-/)
    if (m) { start = i + 1; indent = m[1].length; break }
  }
  const out = []
  for (let i = start; start >= 0 && i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '') { out.push(''); continue }
    const im = line.match(/^(\s*)\S/)
    if (im && im[1].length <= indent) break
    const sp = line.match(/^( {2,})/)
    out.push(sp ? line.slice(sp[1].length) : line)
  }
  const text = out.join('\n').trim()
  if (text) parts.push({ src: '① agent.cordis.yml（卡文本/persona）', len: text.length, has: text.includes(MARK) })
}

// ② characters.json 的所有启用卡
const cj = path.join(dir, 'characters.json')
if (fs.existsSync(cj)) {
  try {
    const chars = JSON.parse(fs.readFileSync(cj, 'utf8'))
    if (Array.isArray(chars)) {
      const blocks = []
      for (const c of chars) {
        if (c.enabled === false) continue
        let s = ''
        for (const k of ['desc', 'first', 'text', 'content']) if (c[k]) s += c[k] + '\n'
        if (s.trim()) blocks.push('# 角色卡：' + (c.name || '未命名') + '\n' + s.trim())
      }
      if (blocks.length) { const t = blocks.join('\n\n---\n\n'); parts.push({ src: '② characters.json（' + blocks.length + ' 张卡）', len: t.length, has: t.includes(MARK) }) }
    }
  } catch (e) { console.log('  ⚠️ characters.json 解析失败：' + e.message) }
}

// ③ presets.json 的 modules
const pj = path.join(dir, 'presets.json')
if (fs.existsSync(pj)) {
  try {
    const presets = JSON.parse(fs.readFileSync(pj, 'utf8'))
    if (Array.isArray(presets)) {
      const all = []
      for (const p of presets) {
        if (!p || !Array.isArray(p.modules)) continue
        for (const m of p.modules) {
          if (!m || m.enabled === false) continue
          const c = String(m.content || '').trim()
          if (c) all.push({ name: m.name || '未命名', content: c })
        }
      }
      if (all.length) {
        const t = '# 预设词条（破限优先）\n' + all.map((m) => '# 预设模块：' + m.name + '\n' + m.content).join('\n\n---\n\n')
        parts.push({ src: '③ presets.json（' + all.length + ' 个模块）', len: t.length, has: t.includes(MARK) })
        console.log('  模块明细：')
        all.forEach((m) => console.log('    · ' + m.name + '  ' + m.content.length + ' 字' + (m.content.includes(MARK) ? '   ← 含契约' : '')))
      }
    }
  } catch (e) { console.log('  ⚠️ presets.json 解析失败：' + e.message) }
}

console.log('  拼装顺序与体积（并入 system prompt）：')
let total = 0
for (const p of parts) { total += p.len; console.log('    ' + p.src + '  ' + p.len + ' 字' + (p.has ? '   ← 含契约' : '')) }
console.log('    合计（不含世界书）  ' + total + ' 字')

const hasMark = parts.some((p) => p.has)

// ── 证据③：插件载体（dsh-block-contract）────────────────
// 插件挂在 profile 的 bundles 里，自己判断「本会话挂的是不是有角色卡的预设」。
// 这里检查：① 哪些 profile 挂了它 ② junction 能否解析 ③ 它对该预设的判定
console.log('')
console.log('证据③ 插件载体 dsh-block-contract')
const profilesRoot = path.join(home, '.dsh', 'profiles')
const wired = []
try {
  for (const name of fs.readdirSync(profilesRoot)) {
    if (name.startsWith('_') || name === 'node_modules') continue
    const dir = path.join(profilesRoot, name)
    try {
      if (!fs.statSync(dir).isDirectory()) continue
      const pj = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
      const b = (pj.dsh && pj.dsh.profile && pj.dsh.profile.bundles) || []
      if (b.includes('dsh-block-contract')) wired.push(name)
    } catch { /* 跳过 */ }
  }
} catch { /* profiles 不可读 */ }
console.log('  挂在 bundles 里的 profile：' + (wired.length ? wired.join('、') : '（无）'))
let pluginOk = false
if (wired.length) {
  const link = path.join(profilesRoot, wired[0], 'node_modules', 'dsh-block-contract')
  try {
    const real = fs.realpathSync(link)
    const mod = await import(new URL('file:///' + link.replace(/\\/g, '/') + '/lib/index.js').href)
    const verdict = mod.isCardPreset(path.basename(dir))
    pluginOk = true
    console.log('  ✅ junction 解析 → ' + real)
    console.log('     inject=' + JSON.stringify(mod.inject) + '  isCardPreset(' + path.basename(dir) + ')=' + verdict)
  } catch (e) {
    console.log('  ❌ junction / 加载失败：' + e.message)
  }
} else {
  console.log('  （未挂载插件 → 只能靠预设模块，见上面证据①②）')
}

// ── 结论 ────────────────────────────────────────────────
console.log('')
console.log('=== 契约载体判定 ===')
if (pluginOk) {
  console.log('✅ 主载体 = 插件 dsh-block-contract（profile: ' + wired.join('、') + '）')
  console.log('   · 每轮无条件注入（不需要模型主动加载，不是 skill 那种"自愿"）')
  console.log('   · 不随角色卡变化：换卡 / 重导卡 / 改 presets.json 都不影响')
  console.log('   · 只对有角色卡的预设注入（编程预设不会多这 635 字）')
  if (!hasMark && !parts.some((p) => p.has)) console.log('   （预设模块已按预期移除：两条载体不重复注入 —— 但**改动要重启 profile 才生效**）')
} else if (hasMark) {
  console.log('⚠️ 主载体 = 预设模块（预设层数据）。建议改挂插件：见 D:\\DSH\\block-contract\\README.md')
} else {
  console.log('❌ 两条载体都没有 → 契约不会注入。先修载体，再谈其它。')
}
console.log('')
console.log('⚠️ 无论哪条载体：**必须有会话绑定到该预设**（或该预设是该会话的 preset）才会生效。')
console.log('   查这个用：node check-last-turn.mjs')
