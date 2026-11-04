// 把契约包里的契约**装成预设模块**（写进 <预设目录>/presets.json），而不是只贴在角色卡 desc 上。
//
//   node apply-as-preset-module.mjs [--preset <目录名>] [--variant generic|dnd]
//                                   [--pack <契约包路径>] [--name <模块名>]
//                                   [--group 0] [--dry-run] [--remove]
//
// 为什么需要它（换卡不丢的关键）：
//   dsh-tavern 的 cardTextFor()（lib/index.js:1530-1599）每轮**无条件**把三样东西拼进 system prompt：
//     ① agent.cordis.yml 的卡文本（persona prefix）
//     ② characters.json 里所有启用卡的 desc/first/text/content   ← 换卡就换内容
//     ③ presets.json 的 modules[]（每项 {name, content, enabled}）← **不随卡变**
//   所以契约贴在 ② 上「换一张卡就没了」，装成 ③ 才「换卡还在」。
//
// 与面板「套用增强包」的关系：那条路会把插件自带的 12 个 ✨增强 模块**整包**写进去；
// 本脚本只写你指定的这一条，token 成本可控。两者写的是同一个 presets.json，互不冲突。
//
// 诚实声明：写入前会备份 presets.json；写入后**建议用面板「预设词条」区或
// /api/tavern/preset 复核一眼**（本脚本只保证文件结构与 cardTextFor 的读取约定一致）。

import fs from 'node:fs'
import path from 'node:path'

function argv(name, def) {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 ? (process.argv[i + 1] || '') : def
}
const has = (name) => process.argv.includes('--' + name)

const PRESET_DIR = argv('preset', 'preset-mtzu16fw-mu5jbq')
const VARIANT = argv('variant', 'generic')
const PACK = argv('pack', 'D:/DSH/dnd-plugin/contract/display-blocks-pack.json')
const MODULE_NAME = argv('name', '✨增强丨展示块·输出契约')
const GROUP_INDEX = Number(argv('group', '0'))
const DRY = has('dry-run')
const REMOVE = has('remove')

const home = process.env.USERPROFILE || process.env.HOMEDRIVE + process.env.HOMEPATH || 'C:\\Users\\m0408'
const dir = path.isAbsolute(PRESET_DIR)
  ? PRESET_DIR
  : path.join(home, '.dsh', '.agent-presets', PRESET_DIR)
const presetsPath = path.join(dir, 'presets.json')

const fail = (m) => { console.error('✖ ' + m); process.exit(1) }

if (!fs.existsSync(dir)) fail('预设目录不存在：' + dir)
if (!fs.existsSync(path.join(dir, 'characters.json')) && !fs.existsSync(path.join(dir, 'preset.yml'))) {
  fail('这个目录不像预设（既无 characters.json 也无 preset.yml）：' + dir)
}

// —— 取契约文本（契约包是唯一真源）——
let text = ''
if (!REMOVE) {
  if (!fs.existsSync(PACK)) fail('契约包不存在：' + PACK)
  const pack = JSON.parse(fs.readFileSync(PACK, 'utf8'))
  const contracts = pack?.contracts?.[VARIANT]
  if (!contracts || typeof contracts !== 'object') {
    fail(`契约包里没有 variant「${VARIANT}」。可用：` + (pack?.contracts ? Object.keys(pack.contracts).join('、') : '（无）'))
  }
  text = Object.keys(contracts)
    .filter((k) => k !== 'note' && typeof contracts[k] === 'string' && contracts[k].trim())
    .map((k) => contracts[k].trim())
    .join('\n\n')
  if (!text) fail(`variant「${VARIANT}」里没有可注入的文本`)
}

// —— 读/造 presets.json（结构对齐面板 applyEnhancePack 写出的形状）——
let presets = []
let existed = false
if (fs.existsSync(presetsPath)) {
  existed = true
  try {
    const raw = JSON.parse(fs.readFileSync(presetsPath, 'utf8'))
    presets = Array.isArray(raw) ? raw : []
  } catch (e) { fail('presets.json 解析失败（不覆盖，先修它）：' + e.message) }
}
const createdShape = presets.length === 0
if (createdShape) presets = [{ name: '通用增强', modules: [], _collapsed: true }]

let gi = Number.isInteger(GROUP_INDEX) && GROUP_INDEX >= 0 && GROUP_INDEX < presets.length ? GROUP_INDEX : 0
const group = presets[gi]
if (!group || typeof group !== 'object') fail('第 ' + gi + ' 组不可写')
if (!Array.isArray(group.modules)) group.modules = []

const at = group.modules.findIndex((m) => m && m.name === MODULE_NAME)
const countBefore = group.modules.length
console.log('预设目录：' + dir)
console.log('presets.json：' + (existed ? '已存在' : '不存在（将新建）') + '  组[' + gi + ']=' + (group.name || '(无名)'))
console.log('目标模块：' + MODULE_NAME + '（' + (at >= 0 ? '已存在，将更新' : '不存在，将新增') + '）')
console.log('契约文本：' + text.length + ' 字符（variant=' + VARIANT + '）')

if (REMOVE) {
  if (at < 0) { console.log('未找到该模块，无需删除。'); process.exit(0) }
  if (DRY) { console.log('【dry-run】会删除该模块，未写入。'); process.exit(0) }
  group.modules.splice(at, 1)
} else {
  const mod = { name: MODULE_NAME, content: text, enabled: true }
  if (at >= 0) group.modules[at] = mod
  else group.modules.push(mod)
}

console.log('该组模块数：' + countBefore + ' → ' + group.modules.length)
console.log('模块清单：')
for (const m of group.modules) {
  console.log('  · ' + m.name + '  ' + String(m.content || '').length + ' 字' + (m.enabled === false ? '（停用）' : ''))
}

if (DRY) {
  console.log('\n【dry-run】只报告将要写入什么，**没有写任何文件**。')
  process.exit(0)
}

// —— 备份后写入 ——
let backup = ''
try {
  if (existed) {
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)
    backup = presetsPath + '.bak-' + stamp
    fs.copyFileSync(presetsPath, backup)
  }
} catch (e) { console.warn('⚠️ 备份失败（继续写入）：' + e.message) }

fs.writeFileSync(presetsPath, JSON.stringify(presets, null, 2) + '\n', 'utf8')
console.log('\n✅ 已写入 ' + presetsPath + (backup ? '（备份：' + path.basename(backup) + '）' : '（原先没有该文件）'))
console.log('   下一轮对话即生效：cardTextFor() 每轮都会读这个文件，不需要重启。')
console.log('   复核入口：面板「预设词条 / 增强」区，或 GET /api/tavern/preset?presetId=' + path.basename(dir))
console.log('   撤销：' + (backup ? '把备份复制回去' : '删掉 presets.json（或加 --remove 重跑）'))
