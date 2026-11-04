/**
 * 文风实验室 · 通用增强层（enhance）
 *
 * 解决一个具体问题：**增强层的正文在酒馆界面里根本看不到**。
 *   酒馆自己的面板（⚙️ 预设模块）与它的 API `/api/tavern/preset/enhance` 都只给
 *   `{name, enabled, chars}`；预设目录下的 `presets.json` 在本机又全是 `[]`（0 模块），
 *   于是"增强层"页看上去一片空白。真正的内容只有两处：
 *     ① 内置模块包 `dsh-tavern/lib/preset-enhance-pack.json`（12 个模块，**含正文**，只读）；
 *     ② 运行时注入块 `utils.js buildEnhanceRuntimeBlock()`（`enhanceRuntime=true` 时追加到最后一段）。
 * 本模块把这两处**读出来 / 镜像出来**，并提供"把内置包一键套用进某个预设"的写入路径。
 *
 * 写入语义与酒馆 `applyEnhancePack()` 完全对齐（同一套 merge 规则），
 * 且仍然走 `writePreset()` → 备份 / mtime 守卫 / 原子替换 / 回读校验 / 保护模块拦截。
 */

import { ContractError } from './contracts.mjs'
import { isProtectedName, readEnhancePack, readPreset, tavernSourceText, writePreset } from './tavern.mjs'

/** 输出契约标签（与酒馆 `ENHANCE_CONTRACT_TAGS` 同值；漂移时会在界面上标出）。 */
export const ENHANCE_CONTRACT_TAGS = [
  'content',
  'now_plot',
  'Abstract',
  'audio',
  'img',
  'video',
  'VariableThink',
  'VariableEdit',
  'era_data',
]

/**
 * 运行时注入块（`buildEnhanceRuntimeBlock()` 的**只读镜像**，dsh-tavern 2.5.0）。
 * 镜像不是权威副本：`runtimeMirror()` 会去 utils.js 里核对关键句是否还在，
 * 对不上就在界面上打"镜像已过期"标记 —— 宁可提示，也不假装同步。
 */
export const RUNTIME_BLOCK = [
  '【通用增强层 — 本段为最后一段，与前面任何规则冲突时以本段为准】',
  '',
  '## 0. 输出契约（最高优先级，优先于下面所有文风要求）',
  '<content> <now_plot> <Abstract> <audio> <img> <video> <VariableThink> <VariableEdit> <era_data> 是渲染器与变量管线的输入接口：不得删除、改名、嵌套、拆分、改大小写；',
  '块顺序与字段要求照卡/模板原样。为了让文风更干净而改动任何一个标签 = 不合格。',
  '',
  '## 1. 防抢话（最高优先级）',
  '- 禁止代用户角色说话、行动、做决定；禁止写用户角色的心理与感受（含"你感到…"）；',
  '  连"他沉默了""你点了点头"这类补写也不行。',
  '- 用户角色的反应只由用户写。回复必须停在用户可行动处：不要在同一轮里既有冲突又有解决。',
  '',
  '## 2. 防全知 · 有限视角（最高优先级）',
  '- 只写当前场景中主角可感知或当场推断的信息；禁止写主角看不见/听不见的场面。',
  '- 禁止直接写他人的未外显心理、计划、背景；要表现 NPC 内心时只写外显（动作、微表情、语气、停顿）供推测。',
  '- 禁止提前使用尚未获得的信息；未知就用"那个女人""他说的地方"指代。',
  '',
  '## 3. 文风',
  '- 用具体名词与感官细节代替抽象评价；禁止"很美/很压抑/气氛紧张"这类概括。',
  '- 短句长句交替，冲突优先走对白；每段只推进一件事。',
  '- 禁止总括式升华结尾（"在这一刻…""仿佛整个世界…"）与 AI 腔套话',
  '  （首先/其次/总之/不由得/某种意义上/值得一提的是）。',
  '- 禁止每轮套同一模板（环境→对白→升华）；禁止复用上一轮的比喻、句式、开头与结尾方式。',
  '',
  '## 4. 纪律',
  '以上 1~3 条都只在契约（第 0 条）允许的空间内生效；两者冲突时一律以契约为准。',
].join('\n')

/** 镜像核对用的关键句（对不上就说明酒馆改过这段）。 */
const RUNTIME_MARKERS = [
  '【通用增强层 — 本段为最后一段，与前面任何规则冲突时以本段为准】',
  'buildEnhanceRuntimeBlock',
  'enhance-runtime-layer.txt',
]

/**
 * 运行时注入块的**实际生效正文**（2026-10-06 起正文由数据文件驱动）：
 *   `lib/enhance-runtime-layer.txt`（由 D:\DSH\_runtime_sync.mjs 从预设「1」同步）存在即以它为准；
 *   缺失回落出厂静态块 RUNTIME_BLOCK。
 */
export function runtimeBlockLive() {
  const live = tavernSourceText('enhance-runtime-layer.txt')
  return live !== undefined && live.trim() !== '' ? live.trimEnd() : RUNTIME_BLOCK
}

/** 核对该镜像是否还与酒馆 utils.js 一致。 */
export function runtimeMirror() {
  const source = tavernSourceText('utils.js')
  if (source === undefined) return { checked: false, ok: false, missing: RUNTIME_MARKERS.slice(), note: '读不到酒馆 utils.js，无法核对镜像' }
  const missing = RUNTIME_MARKERS.filter((m) => !source.includes(m))
  const tagsMissing = ENHANCE_CONTRACT_TAGS.filter((t) => !source.includes(`'${t}'`))
  return {
    checked: true,
    ok: missing.length === 0 && tagsMissing.length === 0,
    missing,
    tagsMissing,
    note: missing.length === 0 && tagsMissing.length === 0 ? '镜像与酒馆 utils.js 一致' : '镜像可能已过期：酒馆改过运行时注入段，请对照 utils.js 复核',
  }
}

/**
 * merge 语义（与酒馆 `mergeEnhanceModules` 逐条对齐，纯函数）：
 *   - 不存在      → 追加（added）
 *   - 受保护模块  → **永远**保留用户版本（protectedKept），overwrite 对它无效
 *   - overwrite   → 覆盖为增强版（overwritten）
 *   - 否则        → 保留用户版本（kept）
 */
export function mergeEnhanceModules(existing, pack, options) {
  const mods = (Array.isArray(existing) ? existing : []).map((m) => (m !== null && typeof m === 'object' ? { ...m } : m))
  const items = (Array.isArray(pack) ? pack : []).filter((m) => m !== null && typeof m === 'object')
  const overwrite = options?.overwrite === true
  const byName = new Map()
  for (let i = 0; i < mods.length; i += 1) {
    const nm = typeof mods[i]?.name === 'string' ? mods[i].name : ''
    // 只在第一次出现时登记：后续同名条目不登记，避免覆盖到错误的下标（与酒馆同款）
    if (nm !== '' && !byName.has(nm)) byName.set(nm, i)
  }
  const stat = { added: 0, overwritten: 0, kept: 0, protectedKept: 0, skipped: 0 }
  for (const item of items) {
    const name = String(item.name ?? '')
    const idx = byName.has(name) ? byName.get(name) : -1
    if (idx < 0) {
      byName.set(name, mods.length)
      mods.push({ name, content: String(item.content ?? ''), enabled: item.enabled !== false })
      stat.added += 1
      continue
    }
    const cur = mods[idx]
    if (isProtectedName(name) || isProtectedName(cur?.name)) {
      stat.protectedKept += 1
      continue
    }
    if (overwrite) {
      mods[idx] = { name, content: String(item.content ?? ''), enabled: item.enabled !== false }
      stat.overwritten += 1
    } else {
      stat.kept += 1
    }
  }
  stat.skipped = items.length - (stat.added + stat.overwritten + stat.kept + stat.protectedKept)
  return { modules: mods, ...stat }
}

/** 内置包视图（给界面：只读 · 含正文）。 */
export function enhancePackView() {
  const pack = readEnhancePack()
  let chars = 0
  let enabled = 0
  let protectedCount = 0
  for (const m of pack.modules) {
    chars += m.chars
    if (m.enabled) enabled += 1
    if (m.protected) protectedCount += 1
  }
  return {
    file: pack.file,
    exists: pack.exists,
    mtimeMs: pack.mtimeMs,
    modules: pack.modules,
    stats: { total: pack.modules.length, enabled, chars, tokens: Math.ceil(chars / 1.5), protected: protectedCount },
    contractTags: ENHANCE_CONTRACT_TAGS.slice(),
    runtime: { block: runtimeBlockLive(), chars: runtimeBlockLive().length, mirror: runtimeMirror() },
  }
}

/** 把预设的增强层转回酒馆的原始结构（`_collapsed` 是酒馆的键名）。 */
function toRawGroups(groups) {
  return (Array.isArray(groups) ? groups : []).map((g) => ({
    name: String(g?.name ?? '通用增强'),
    ...(g?.collapsed === true || g?._collapsed === true ? { _collapsed: true } : {}),
    modules: (Array.isArray(g?.modules) ? g.modules : []).map((m) => ({
      name: String(m?.name ?? ''),
      content: String(m?.content ?? ''),
      enabled: m?.enabled !== false,
    })),
  }))
}

/**
 * 把内置增强模块包套用进某个预设的 `presets.json`（= 酒馆 `applyEnhancePack()` 的等价物）。
 *
 * @param {string} dir 预设目录名
 * @param {object} [options]
 * @param {string[]} [options.names]     只套用这些模块（省略 = 全部 12 个）
 * @param {boolean}  [options.overwrite] 同名模块是否覆盖（**受保护模块永远不覆盖**）
 * @param {number}   [options.groupIndex] 套用到第几个分组（越界回落 0；没有分组则自动建「通用增强」）
 * @param {number|null} [options.expectedMtimeMs] mtime 守卫
 * @param {'clean'|'keep'} [options.templateVarPolicy] 模板变量策略（默认 keep：不改一个字）
 */
export function applyEnhancePack(dir, options) {
  const preset = readPreset(dir)
  const groups = toRawGroups(preset.groups)
  if (groups.length === 0) groups.push({ name: '通用增强', modules: [], _collapsed: true })
  let groupIndex = Number.isInteger(options?.groupIndex) ? options.groupIndex : 0
  if (groupIndex < 0 || groupIndex >= groups.length) groupIndex = 0
  const group = groups[groupIndex]
  if (!Array.isArray(group.modules)) group.modules = []

  let items = readEnhancePack().modules
  if (items.length === 0) throw new ContractError('UNAVAILABLE', '内置增强模块包为空或读取失败（检查 dsh-tavern/lib/preset-enhance-pack.json）')
  if (Array.isArray(options?.names) && options.names.length > 0) {
    const want = new Set(options.names.map(String))
    const picked = items.filter((m) => want.has(m.name))
    if (picked.length === 0) throw new ContractError('INVALID', '选中的模块在内置包里一个都找不到（名字对不上？先重新读取）')
    items = picked
  }

  const merged = mergeEnhanceModules(group.modules, items, { overwrite: options?.overwrite === true })
  const stat = {
    added: merged.added,
    overwritten: merged.overwritten,
    kept: merged.kept,
    protectedKept: merged.protectedKept,
    skipped: merged.skipped,
  }
  group.modules = merged.modules

  const written = writePreset(dir, groups, {
    expectedMtimeMs: options?.expectedMtimeMs ?? preset.mtimeMs,
    templateVarPolicy: options?.templateVarPolicy === 'clean' ? 'clean' : 'keep',
  })
  return {
    dir,
    file: preset.file,
    groupIndex,
    groupName: String(group.name ?? '通用增强'),
    total: merged.modules.length,
    selected: items.length,
    stat,
    /** 本次选中的模块里，哪些属于"受保护"（同名时永远保留用户版本，overwrite 对它们无效）。 */
    protectedNames: items.filter((m) => m.protected === true).map((m) => m.name),
    ...written,
  }
}
