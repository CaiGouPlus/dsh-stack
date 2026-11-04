// 自检：用 mock ctx 跑一遍 apply()，确认
//   ① 段落注册了、名字对、text() 返回非空且含标记；
//   ② 契约包优先 / 缺失时回落内嵌；
//   ③ enabled:false 不注册；
//   ④ text() 抛异常时返回 ''（不把异常抛回 host）；
//   ⑤ cleanup 能跑。
//
//   node lib/selftest.mjs
//
// 为什么必须先跑它：插件是挂进**预设的插件组合**里的，挂错了会让该预设挂载失败
// （2026-09-30 就因为一个插件的 inject 等不到服务，桌面端整机打不开）。所以任何插件
// 都要能在 Node 里离线验一遍再上机。

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.dirname(HERE)
const MARK = '【展示块输出契约】'

let bad = 0
const ok = (cond, good, why) => {
  console.log('  ' + (cond ? '✔' : '✖') + ' ' + good)
  if (!cond) { bad++; if (why) console.log('      ↳ ' + why) }
}

function makeCtx() {
  const state = { sections: [], effects: [], disposed: 0 }
  const ctx = {
    systemPrompt: {
      section: (opts) => { state.sections.push(opts); return () => { state.disposed++ } },
    },
    effect: (fn, label) => { state.effects.push({ label, cleanup: fn() }) },
  }
  return { ctx, state }
}

const mod = await import(pathToFileURL(path.join(HERE, 'index.js')).href)

console.log('模组导出检查')
ok(mod.name === 'dsh-block-contract', 'name = dsh-block-contract', 'name=' + mod.name)
ok(Array.isArray(mod.inject) && mod.inject.length === 1 && mod.inject[0] === 'systemPrompt',
  'inject 只有 systemPrompt', JSON.stringify(mod.inject))

console.log('\n默认挂载（用 mode:always 绕开作用域门，专测内容通路）')
{
  const { ctx, state } = makeCtx()
  mod.apply(ctx, { packPath: 'D:/__no_such_pack__.json', mode: 'always' }) // 不存在的包 → 走内嵌回落
  ok(state.sections.length === 1, '注册了 1 个段落')
  const s = state.sections[0] || {}
  ok(s.name === 'block-contract', '段落名 = block-contract', s.name)
  ok(typeof s.text === 'function', 'text 是函数')
  ok(s.order >= 3, 'order 靠后（本机 ' + s.order + '）')
  const t = String(s.text({ agent: { session: { id: 'session-x' } } }) || '')
  ok(t.includes(MARK), 'text() 含『' + MARK + '』')
  ok(t.length > 500, 'text() 非空且成规模（' + t.length + ' 字）')
  ok(state.effects.length === 1, '注册了清理 effect')
  state.effects[0].cleanup()
  ok(state.disposed === 1, 'cleanup 释放了段落')
}

console.log('\nenabled:false')
{
  const { ctx, state } = makeCtx()
  mod.apply(ctx, { enabled: false })
  ok(state.sections.length === 0, '不注册任何段落')
}

console.log('\n契约包优先')
{
  const pack = process.env.DSH_BLOCK_CONTRACT_PACK ?? 'D:/DSH/dnd-plugin/contract/display-blocks-pack.json'
  if (!fs.existsSync(pack)) {
    console.log('  （跳过：没有 ' + pack + '）')
  } else {
    const { ctx, state } = makeCtx()
    mod.apply(ctx, { packPath: pack, variant: 'dnd', mode: 'always' })
    const t = String((state.sections[0] || {}).text() || '')
    ok(t.includes(MARK), 'dnd 变体也含标记（' + t.length + ' 字）')
  }
}

console.log('\n异常不外泄')
{
  const ctx = {
    systemPrompt: { section: () => { throw new Error('boom') } },
    effect: () => {},
  }
  let threw = false
  try { mod.apply(ctx, {}) } catch { threw = true }
  ok(!threw, 'register 失败时 apply 不抛（只 warn）')
}

// ── 作用域判据（对真实数据）──────────────────────────────
//
// ⚠️ 真实预设的期望值**由数据现算**，不写死机器快照（2026-10-05 修数据漂移：
// 旧版把「实缴有卡 / tavern-lite 无卡」写死，预设数据一变就假失败）。期望值算法
// 与被测函数**独立**：直接读预设目录（preset.yml + agent.cordis.yml + characters.json
// 里有无启用卡）—— 只有 isCardPreset 的逻辑与数据行为不一致才会红。
const liveCardExpect = (id) => {
  const dir = path.join(mod.PRESETS_ROOT, id)
  const hasYml = fs.existsSync(path.join(dir, 'preset.yml')) && fs.existsSync(path.join(dir, 'agent.cordis.yml'))
  const cj = path.join(dir, 'characters.json')
  if (!fs.existsSync(cj)) {
    return {
      want: false,
      note: hasYml ? '无 characters.json（不满足「有卡」前提）' : '缺 preset.yml/agent.cordis.yml（不满足注入前提）',
    }
  }
  let list = []
  try {
    const raw = JSON.parse(fs.readFileSync(cj, 'utf8'))
    list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.characters) ? raw.characters : [])
  } catch {
    return { want: null, note: 'characters.json 解析失败，跳过（isCardPreset 也会 fail-closed 为 false）' }
  }
  const hasCard = list.some((c) => c && c.enabled !== false && (c.name || c.desc))
  return { want: hasYml && hasCard, note: '数据现算：' + (hasCard ? '有启用卡' : '无启用卡') + (hasYml ? '' : '，且缺 yml 前提') }
}

console.log('\n作用域：isCardPreset（有角色卡的预设才算角色扮演）')
console.log('  —— 真实预设：期望由数据现算（数据变化不产生假失败）')
for (const [id, label] of [
  ['preset-mtzu16fw-mu5jbq', 'DND·无尽冒险'],
  ['preset-mt1o6uc2-iwnao6', '实缴'],
  ['tavern-lite', '酒馆默认'],
]) {
  const { want, note } = liveCardExpect(id)
  if (want === null) { console.log('  （跳过 ' + id + '：' + note + '）'); continue }
  const got = mod.isCardPreset(id)
  ok(got === want, id + ' → ' + got + '（' + label + '；期望 ' + want + '：' + note + '）', '期望 ' + want)
}
// 这四条保持**静态**断言，语义是作用域保证而不是数据快照：
// 编程/实验/内置预设一旦被判成角色扮演，就是"契约漏进编程会话"的真回归，必须红。
console.log('  —— 结构性断言（作用域保证：无卡预设绝不注入）')
for (const [id, want, label] of [
  ['liangshen', false, '编程预设（无卡）'],
  ['style-lab', false, '文风实验室（无卡）'],
  ['standard', false, '宿主内置'],
  ['不存在的预设', false, '不存在'],
]) {
  const got = mod.isCardPreset(id)
  ok(got === want, id + ' → ' + got + '（' + label + '）', '期望 ' + want)
}

console.log('\n作用域：会话 → 预设决议')
{
  // 已核对过面板权威值的真实会话：面板说 liangshen（编程）→ 不该注入
  const sid = 'session-2a962405-815c-4137-99ff-91a12a913d2a'
  if (!mod.findSessionFile(sid)) {
    console.log('  （跳过：找不到会话文件 ' + sid + '）')
  } else {
    const p = mod.sessionPresetId(sid, {})
    ok(p === 'liangshen', '决议出 liangshen（与面板权威值一致）', '得到 ' + JSON.stringify(p))
    ok(mod.isTavernSession(sid, { agent: { session: { header: {} } } }) === false,
      '编程会话不注入（isTavernSession=false）')
  }
  const dnd = 'preset-mtzu16fw-mu5jbq'
  const dndExpect = liveCardExpect(dnd)
  if (dndExpect.want === null) console.log('  （跳过 DND 预设断言：' + dndExpect.note + '）')
  else ok(mod.isCardPreset(dnd) === dndExpect.want,
    'DND 预设判定与数据一致（' + dndExpect.want + '：' + dndExpect.note + '）', '期望 ' + dndExpect.want)
  ok(mod.sessionPresetId('', {}) === '', '空会话 id → 空（不注入）')
  ok(mod.sessionPresetId('session-不存在', {}) === '', '不存在的会话 → 空（不注入）')
}

console.log('\n注入门（gate）：非角色扮演会话返回空串')
{
  const { ctx, state } = makeCtx()
  mod.apply(ctx, { packPath: 'D:/__no_such_pack__.json' })
  const text = state.sections[0].text
  const nonRp = String(text({ agent: { session: { id: 'session-不存在', header: {} } } }) || '')
  ok(nonRp === '', '判不出角色扮演预设 → 返回空串（不注入）', JSON.stringify(nonRp.slice(0, 40)))
  const noCtx = String(text() || '')
  ok(noCtx === '', '没有 context → 返回空串')
}

console.log(bad ? '\n' + bad + ' 项不通过' : '\n✔ 全部通过')
process.exit(bad ? 1 : 0)
