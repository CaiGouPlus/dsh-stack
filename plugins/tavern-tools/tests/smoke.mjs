// 酒馆工具层 —— 端到端冒烟（**只读真数据**，另做一次临时目录的写往返）
//
// 必须在 profile 里跑，否则 @deepseek-ai/dsh-tools 解析不到：
//   cd C:\Users\m0408\.dsh\profiles\desktop
//   node node_modules\@local\dsh-tavern-tools\tests\smoke.mjs
//
// 它做的事：
//   1. 用假 ctx 调 apply()，把注册到的工具抓出来（等价于宿主加载插件）；
//   2. 对真实数据根跑只读工具的 execute，检查返回的是 JSON 而不是报错；
//   3. 在临时目录里造一个预设，跑完整往返：
//      读→改卡→读回、修订号守卫、世界书写入、desc 幂等追加、ST 卡导入、后台推演降级。
//
// ⚠️ 本文件曾被 PowerShell 的 (Get-Content -Raw) | Set-Content 重编码写坏过
//    （GBK 无法映射的汉字被截成 `?`，214 处不可逆丢失；损坏件留档为
//    smoke.mjs.corrupt-20260930）。改这个文件请用 UTF-8 编辑器写入，
//    **不要**用 Set-Content / Out-File 走管道。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

import * as plugin from '../lib/index.js'

const REAL_ROOT = path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), '.agent-presets')

// ── 1. 加载与注册 ───────────────────────────────────────────
const registered = []
const logs = []
const fakeCtx = {
  tools: { register: (definition) => { registered.push(definition); return () => {} } },
  effect: (fn) => { fn(); return () => {} },
  get: (service) => (service === 'tools' ? fakeCtx.tools : undefined),
  logger: { info: (m) => logs.push(['info', m]), warn: (m) => logs.push(['warn', m]) }
}

plugin.apply(fakeCtx)
assert.equal(registered.length, 12, `应注册 12 个工具，实际 ${registered.length}`)
const byName = new Map(registered.map((t) => [t.name, t]))
for (const name of [
  'tavern_card', 'tavern_card_update', 'tavern_card_copy', 'tavern_card_validate',
  'tavern_card_import', 'tavern_card_append',
  'tavern_worldbook', 'tavern_worldbook_update',
  'tavern_preset', 'tavern_preset_update', 'tavern_memory', 'tavern_background_run'
]) {
  assert.ok(byName.has(name), `缺少工具 ${name}`)
  const tool = byName.get(name)
  assert.equal(typeof tool.execute, 'function', `${name} 缺 execute`)
  assert.equal(typeof tool.output?.render, 'function', `${name} 缺 output.render`)
  assert.equal(typeof tool.output?.schema, 'object', `${name} 缺 output.schema`)
}
console.log(`✔ 注册 ${registered.length} 个工具：${registered.map((t) => t.name).join(', ')}`)

const card = byName.get('tavern_card')
const worldbook = byName.get('tavern_worldbook')
const preset = byName.get('tavern_preset')
const memory = byName.get('tavern_memory')

function call(tool, args, sessionId = '') {
  const exec = sessionId ? { agent: { session: { id: sessionId } } } : undefined
  return tool.execute(args, exec)
}

function parse(report, label) {
  assert.equal(typeof report, 'string', `${label} 应返回字符串`)
  try {
    return JSON.parse(report)
  } catch {
    return { __plain: report }
  }
}

// ── 2. 真数据只读冒烟 ───────────────────────────────────────
const presets = fs.readdirSync(REAL_ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(REAL_ROOT, e.name, 'preset.yml')))
  .map((e) => e.name)
console.log(`✔ 真实数据根发现 ${presets.length} 个预设：${presets.join(', ')}`)

let target = presets[0]
let bestSize = -1
for (const p of presets) {
  const file = path.join(REAL_ROOT, p, 'worldbooks.json')
  if (!fs.existsSync(file)) continue
  const size = fs.statSync(file).size
  if (size > bestSize) { bestSize = size; target = p }
}
console.log(`✔ 只读目标预设：${target}（worldbooks.json ${bestSize} 字节）`)

const listed = parse(await call(card, { presetId: target }), 'tavern_card 列表')
assert.ok(Array.isArray(listed.cards), 'tavern_card 应返回 cards 数组')
assert.equal(typeof listed.revision, 'string')
console.log(`  tavern_card 列表：${listed.count} 张卡，revision=${listed.revision}`)

if (listed.cards.length) {
  const one = parse(await call(card, { presetId: target, name: listed.cards[0].name }), 'tavern_card 读单卡')
  assert.ok(one.fields && typeof one.fields === 'object', 'tavern_card 读单卡应返回 fields')
  assert.equal(one.injectedFields.length, 4)
  console.log(`  读单卡「${one.name}」：${Object.keys(one.fields).length} 个字段，注入 ${one.injectedChars} 字`)
}

const wb = parse(await call(worldbook, { presetId: target, limit: 5 }), 'tavern_worldbook 列表')
assert.ok(Array.isArray(wb.groups), 'tavern_worldbook 应返回 groups')
console.log(`  tavern_worldbook：${wb.totalEntries} 条，${wb.groups.length} 组，injectMode=${wb.injectMode}，format=${wb.format}`)

const searched = parse(await call(worldbook, { presetId: target, query: '检定', limit: 3 }), 'tavern_worldbook 检索')
assert.ok(searched.total > 0, '检索「检定」应有命中')
console.log(`  检索「检定」：${searched.total} 条命中，首条 ${searched.entries[0].ref} → ${searched.entries[0].title}`)

const refs = searched.entries.slice(0, 2).map((e) => e.ref)
const read = parse(await call(worldbook, { presetId: target, refs }), 'tavern_worldbook 读条文')
assert.equal(read.entries.length, refs.length)
console.log(`  按 ref 读 ${refs.length} 条全文：${read.entries.map((e) => e.ref).join('、')}`)

const mods = parse(await call(preset, { presetId: target }), 'tavern_preset 列表')
assert.ok(Array.isArray(mods.modules), 'tavern_preset 应返回 modules')
console.log(`  tavern_preset：${mods.groups} 组 / ${mods.modules.length} 个模块`)

const mem = parse(await call(memory, {}, 'session-9e6fabfc-4b59-49a1-9eb9-f2194995277a'), 'tavern_memory')
assert.equal(mem.sessionId, 'session-9e6fabfc-4b59-49a1-9eb9-f2194995277a')
console.log(`  tavern_memory：hasMemory=${mem.hasMemory}，${mem.memoryChars} 字，relations=${mem.relations ? '有' : '无'}`)

const guard = parse(await call(card, {}, 'session-does-not-exist'), '解析守卫')
assert.ok(guard.__plain, '无绑定时应返回纯文本指引')
assert.ok(guard.__plain.includes('presetId'), '指引里必须要求显式传 presetId')
assert.ok(!guard.__plain.includes('"count"'), '不允许返回预设内容')
console.log('  ✔ 解析守卫：无绑定会话被正确拒绝，要求显式 presetId')

// ── 3. 临时目录里的写往返 ───────────────────────────────────
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'tavern-tools-smoke-'))
const sandboxData = path.join(sandbox, '.agent-presets')
const sdir = path.join(sandboxData, 'sandbox-preset')
fs.mkdirSync(sdir, { recursive: true })
fs.writeFileSync(path.join(sdir, 'preset.yml'), 'name: 冒烟预设\n', 'utf8')
fs.writeFileSync(path.join(sdir, 'characters.json'), JSON.stringify([{ name: '测试卡', desc: '原设定', enabled: true }]), 'utf8')
fs.writeFileSync(path.join(sdir, 'worldbooks.json'), JSON.stringify({ version: 2, injectMode: 'keyword', groups: [] }), 'utf8')
fs.writeFileSync(path.join(sdir, 'presets.json'), JSON.stringify([{ name: '组', modules: [{ name: '词条', content: '原文', enabled: true }] }]), 'utf8')
const realHome = process.env.DSH_HOME
process.env.DSH_HOME = sandbox
const reloaded = await import(`../lib/index.js?ts=${Date.now()}`)
const sandboxTools = new Map()
reloaded.apply({
  tools: { register: (d) => { sandboxTools.set(d.name, d); return () => {} } },
  effect: (fn) => fn(),
  get: () => undefined,
  logger: { info: () => {}, warn: () => {} }
})
const sbCard = sandboxTools.get('tavern_card')
const sbUpdate = sandboxTools.get('tavern_card_update')

const sbRead = JSON.parse(await sbCard.execute({ presetId: 'sandbox-preset' }, undefined))
assert.equal(sbRead.count, 1)
const rev = sbRead.revision

const updated = JSON.parse(await sbUpdate.execute({
  presetId: 'sandbox-preset',
  name: '测试卡',
  fields: { desc: '改后的设定' },
  expectedRevision: rev
}, undefined))
assert.deepEqual(updated.changed, [{ field: 'desc', beforeChars: 3, afterChars: '改后的设定'.length }])
const after = JSON.parse(await sbCard.execute({ presetId: 'sandbox-preset', name: '测试卡' }, undefined))
assert.equal(after.fields.desc, '改后的设定')
console.log('  ✔ 写往返：改卡后读回一致')

const stale = await sbUpdate.execute({
  presetId: 'sandbox-preset', name: '测试卡', fields: { desc: 'x' }, expectedRevision: rev
}, undefined)
assert.ok(String(stale).includes('修订号不匹配'), '陈旧修订号必须被拒绝')
console.log('  ✔ 修订号守卫：陈旧 revision 被拒绝')

const sbWb = sandboxTools.get('tavern_worldbook')
const sbWbUpdate = sandboxTools.get('tavern_worldbook_update')
const before = JSON.parse(await sbWb.execute({ presetId: 'sandbox-preset' }, undefined))
const added = JSON.parse(await sbWbUpdate.execute({
  presetId: 'sandbox-preset', action: 'add', group: '新组', title: '新条目',
  keys: ['测试'], content: '新正文', expectedRevision: before.revision
}, undefined))
assert.equal(added.ref, '新组#1')
const wbAfter = JSON.parse(await sbWb.execute({ presetId: 'sandbox-preset', refs: ['新组#1'] }, undefined))
assert.equal(wbAfter.entries[0].content, '新正文')
assert.deepEqual(wbAfter.entries[0].keys, ['测试'])
console.log('  ✔ 世界书写入：add 后按 ref 读回一致（keys 已写入）')

// ── 4. desc 幂等追加（tavern_card_append）───────────────────
// 「把输出契约补到另一张卡上」的机制：整体替换 desc 会截断 16K 设定，必须能只追加。
const sbAppend = sandboxTools.get('tavern_card_append')
const CONTRACT = '【商店输出契约】\n当玩家能看见商品时，独占一行输出 [[商店]]{json}。'

const dry = JSON.parse(await sbAppend.execute({
  presetId: 'sandbox-preset', name: '测试卡', text: CONTRACT, dryRun: true
}, undefined))
assert.equal(dry.action, 'dry-run')
assert.equal(dry.descCharsBefore, '改后的设定'.length)
assert.ok(dry.descCharsAfter > dry.descCharsBefore, 'dryRun 应报告追加后的长度')
const stillRaw = JSON.parse(await sbCard.execute({ presetId: 'sandbox-preset', name: '测试卡' }, undefined))
assert.equal(stillRaw.fields.desc, '改后的设定', 'dryRun 绝不能写入')
console.log('  ✔ 追加：dryRun 只报告不写入')

const appended = JSON.parse(await sbAppend.execute({
  presetId: 'sandbox-preset', name: '测试卡', text: CONTRACT
}, undefined))
assert.equal(appended.action, 'appended')
assert.equal(appended.marker, '【商店输出契约】', '默认 marker 取追加文本首行')
const afterAppend = JSON.parse(await sbCard.execute({ presetId: 'sandbox-preset', name: '测试卡' }, undefined))
assert.ok(afterAppend.fields.desc.startsWith('改后的设定'), '原有设定必须完整保留（只追加不替换）')
assert.ok(afterAppend.fields.desc.includes('[[商店]]'), '契约已追加')

const again2 = JSON.parse(await sbAppend.execute({
  presetId: 'sandbox-preset', name: '测试卡', text: CONTRACT
}, undefined))
assert.equal(again2.action, 'already-present', '重复追加必须幂等')
const afterAgain = JSON.parse(await sbCard.execute({ presetId: 'sandbox-preset', name: '测试卡' }, undefined))
assert.equal(afterAgain.fields.desc, afterAppend.fields.desc, '幂等：第二次不得改变 desc')
console.log('  ✔ 追加：原有设定保留 + 重复追加幂等（already-present）')

// ── 5. ST 卡导入往返 ────────────────────────────────────────
const sbImport = sandboxTools.get('tavern_card_import')
const sbWb2 = sandboxTools.get('tavern_worldbook')

const stCard = {
  spec: 'chara_card_v2',
  data: {
    name: '冒烟ST卡',
    description: '【设定】你是冒烟测试角色。',
    personality: '话少。',
    scenario: '深夜的机房。',
    mes_example: '<START>\n{{user}}: 在吗\n{{char}}: 在。',
    system_prompt: '只用短句。',
    post_history_instructions: '不要替玩家行动。',
    first_mes: '「日志还在滚。」',
    alternate_greetings: ['「又崩了？」'],
    extensions: { regex_scripts: [{ scriptName: '去括号', findRegex: '/\\(.*?\\)/g' }] },
    character_book: {
      name: '冒烟世界书',
      entries: [
        { keys: ['机房'], content: '机房常年 18 度。', enabled: true },
        { content: '常驻：世界是低魔的。', constant: true, enabled: true }
      ]
    }
  }
}
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  return Buffer.concat([len, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)])
}
const cardPng = path.join(sandbox, 'smoke-card.png')
fs.writeFileSync(cardPng, Buffer.concat([
  SIG,
  pngChunk('IHDR', Buffer.alloc(13)),
  pngChunk('tEXt', Buffer.concat([
    Buffer.from('chara', 'latin1'), Buffer.from([0]),
    Buffer.from(Buffer.from(JSON.stringify(stCard), 'utf8').toString('base64'), 'latin1')
  ])),
  pngChunk('IEND', Buffer.alloc(0))
]))

const imported = JSON.parse(await sbImport.execute({
  presetId: 'sandbox-preset', source: cardPng, globalRegex: 'report'
}, undefined))
assert.equal(imported.card, '冒烟ST卡')
assert.equal(imported.action, 'added')
assert.deepEqual(imported.foldedIntoDesc.map((s) => s.key),
  ['description', 'personality', 'scenario', 'mes_example', 'system_prompt', 'post_history_instructions'])
assert.equal(imported.alternateGreetings.count, 1)
assert.deepEqual(imported.alternateGreetings.companions, ['冒烟ST卡·开场白2'])
assert.equal(imported.worldbook.added, 2)
assert.equal(imported.worldbook.keyless, 1, 'constant 条目没有 keys，必须被点名')
assert.equal(imported.regexScripts.found, 1)
assert.equal(imported.regexScripts.imported, false, 'report 模式下不得写全局正则库')
assert.ok(fs.existsSync(imported.archived), `归档文件必须存在：${imported.archived}`)

const cardsAfter = JSON.parse(await sbCard.execute({ presetId: 'sandbox-preset' }, undefined))
assert.equal(cardsAfter.count, 3, '主卡 + 1 张备选开场白伴生卡（外加原有测试卡）')
const companion = cardsAfter.cards.find((c) => c.name === '冒烟ST卡·开场白2')
assert.ok(companion, '备选开场白伴生卡应存在')
assert.equal(companion.enabled, false, '伴生卡默认禁用，不会污染当前注入')
const mainCard = JSON.parse(await sbCard.execute({ presetId: 'sandbox-preset', name: '冒烟ST卡' }, undefined))
assert.ok(mainCard.fields.desc.includes('【对话示例】'), 'mes_example 必须折进 desc')
assert.equal(mainCard.fields.first, '「日志还在滚。」')

const wbAfter2 = JSON.parse(await sbWb2.execute({ presetId: 'sandbox-preset', group: '冒烟世界书' }, undefined))
assert.equal(wbAfter2.groups.length, 1)
assert.equal(wbAfter2.groups[0].entries.length, 2)
assert.deepEqual(wbAfter2.groups[0].entries[0].keys, ['机房'])
console.log('  ✔ ST 卡导入：分区折叠 / 备选开场白伴生卡 / 内嵌世界书 / 原始卡归档 全部就位')

const again = JSON.parse(await sbImport.execute({ presetId: 'sandbox-preset', source: cardPng }, undefined))
assert.equal(again.action, 'replaced')
assert.equal(again.worldbook.added, 0)
assert.equal(again.worldbook.alreadyPresent, 2, '同内容条目不得重复写入世界书')
const cardsFinal = JSON.parse(await sbCard.execute({ presetId: 'sandbox-preset' }, undefined))
assert.equal(cardsFinal.count, 3, '重复导入不得增加卡数')
console.log('  ✔ ST 卡重复导入：替换而非新增，世界书按内容去重')

// ── 6. 后台推演：服务缺失时必须给出可读诊断，而不是抛异常 ──
const sbBg = sandboxTools.get('tavern_background_run')
const bgNoService = String(await sbBg.execute({ presetId: 'sandbox-preset', task: '推演幕后' }, undefined))
assert.ok(bgNoService.includes('后台推演没有完成'), '服务缺失时应返回诊断而不是抛异常')
assert.ok(bgNoService.includes('agents'), '诊断里必须点明缺失的是 agents 服务')
const bgNoTask = await sbBg.execute({ presetId: 'sandbox-preset' }, undefined).then(
  () => { throw new Error('缺 task 时必须被宿主拒绝') },
  (error) => error
)
assert.ok(String(bgNoTask.message || bgNoTask).includes('task'),
  `缺 task 必须由宿主按 required:true 拒绝，实际：${bgNoTask.message || bgNoTask}`)
console.log('  ✔ 后台推演：无 agents 服务时降级为可读诊断，不抛异常')

if (realHome === undefined) delete process.env.DSH_HOME
else process.env.DSH_HOME = realHome
fs.rmSync(sandbox, { recursive: true, force: true })

console.log('\n全部冒烟通过。')
