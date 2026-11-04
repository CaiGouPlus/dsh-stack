/**
 * 文风实验室 · 酒馆文件契约（tavern）
 *
 * 本文件是**整个插件唯一的耦合面**，只碰酒馆的这几个用户数据文件：
 *   ~/.dsh/.agent-presets/presets.json                 全局预设注册表（**只读**）
 *   ~/.dsh/.agent-presets/<dir>/presets.json           通用增强层模块（读写）
 *   ~/.dsh/.agent-presets/tavern-state.json            反八股字段（只改 antiCliche / bannedWords）
 *   ~/.dsh/.agent-presets/edited-messages.json         工作台"推送到酒馆显示层"（可选，读写）
 * 另加两个**只读**的酒馆包内数据文件（不 import、不执行任何酒馆代码）：
 *   <profile>/node_modules/dsh-tavern/package.json          宿主版本
 *   <profile>/node_modules/dsh-tavern/lib/preset-enhance-pack.json  内置增强模块包（**含正文**）
 * 其余一切（含酒馆源码目录）都不碰。所有写入都经 contracts.mjs 的备份/守卫/原子/校验。
 */

import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  ContractError,
  cleanTemplateVars,
  detectTemplateVars,
  readJson,
  readText,
  statOf,
  updateJsonFile,
  writeGuarded,
} from './contracts.mjs'

export const HOME_DIR = process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? '.', '.dsh')
export const PRESET_ROOT = join(HOME_DIR, '.agent-presets')

/** 实验室预设 id（独立隔离：不写进酒馆注册表）。 */
export const LAB_PRESET_ID = 'style-lab'

/** 与酒馆 lib/utils.js 的 isEnhanceProtectedName 等价。 */
export function isProtectedName(name) {
  return /变量|Variable|era|格式|format/iu.test(String(name ?? ''))
}

/** 粗估 token（中文为主：约 1.5 字/token）。仅用于预算提示，不做精确计费。 */
export function estimateTokens(chars) {
  return Math.ceil(Number(chars ?? 0) / 1.5)
}

/** 规整模块结构：丢弃缺 name / content 的条目，与酒馆 normalizeEnhancePack 同口径。 */
export function normalizeModules(groups) {
  if (!Array.isArray(groups)) return []
  return groups.map((group) => {
    const modules = Array.isArray(group?.modules) ? group.modules : []
    return {
      name: String(group?.name ?? '通用增强'),
      ...(group?._collapsed === true ? { _collapsed: true } : {}),
      modules: modules
        .filter((m) => m !== null && typeof m === 'object')
        .map((m) => ({
          name: typeof m.name === 'string' ? m.name.trim() : '',
          content: typeof m.content === 'string' ? m.content : '',
          enabled: m.enabled !== false,
        }))
        .filter((m) => m.name !== '' && m.content.trim() !== ''),
    }
  })
}

/** 模块统计（给界面用）。 */
export function moduleStats(groups) {
  let total = 0
  let enabled = 0
  let chars = 0
  let protectedCount = 0
  for (const group of groups ?? []) {
    for (const m of group.modules ?? []) {
      total += 1
      if (m.enabled !== false) enabled += 1
      chars += String(m.content ?? '').length
      if (isProtectedName(m.name)) protectedCount += 1
    }
  }
  return { total, enabled, chars, tokens: estimateTokens(chars), protected: protectedCount }
}

/** 预设增强层文件路径。 */
export function presetModulesFile(dir) {
  return join(PRESET_ROOT, dir, 'presets.json')
}

/**
 * 读一个预设的增强层。
 * @returns {{dir: string, file: string, exists: boolean, mtimeMs: number|null, groups: Array, stats: object}}
 */
export function readPreset(dir) {
  const file = presetModulesFile(dir)
  const st = statOf(file)
  const doc = readJson(file, undefined)
  const groups = Array.isArray(doc) ? doc.map((g) => ({
    name: String(g?.name ?? '通用增强'),
    collapsed: g?._collapsed === true,
    modules: (Array.isArray(g?.modules) ? g.modules : []).map((m) => ({
      name: String(m?.name ?? ''),
      content: String(m?.content ?? ''),
      enabled: m?.enabled !== false,
      chars: String(m?.content ?? '').length,
      protected: isProtectedName(m?.name),
    })),
  })) : []
  return { dir, file, exists: Array.isArray(doc), mtimeMs: st.mtimeMs, groups, stats: moduleStats(groups) }
}

/**
 * 写一个预设的增强层（整组替换）。
 *
 * 受保护模块（名字含 变量/Variable/era/格式/format）的**存在性与正文不可变**：
 * 提交内容里若删掉了受保护模块、改了它的名字或正文，直接拒绝（与酒馆 merge 的保护语义一致）。
 *
 * 模板变量 `{{...}}`：酒馆落盘时会清洗。本函数默认**保留原文**并报告处数（templateVars）；
 * 只有调用方显式传 `templateVarPolicy: 'clean'`（界面上"按酒馆规则清洗"的确认结果）才剔除。
 */
export function writePreset(dir, groups, options) {
  const file = presetModulesFile(dir)
  const existing = readPreset(dir)
  const normalized = normalizeModules(groups)
  let next = normalized
  const cleaned = options?.templateVarPolicy === 'clean'
  if (cleaned) {
    next = next.map((g) => ({ ...g, modules: g.modules.map((m) => ({ ...m, content: cleanTemplateVars(m.content) })) }))
  }

  const findProtected = (list) => {
    const out = []
    for (const group of list ?? []) {
      for (const m of group.modules ?? []) {
        if (isProtectedName(m.name)) out.push({ name: String(m.name), content: String(m.content ?? ''), enabled: m.enabled !== false })
      }
    }
    return out
  }
  const before = findProtected(existing.groups)
  const after = findProtected(next)
  for (const keep of before) {
    const hit = after.find((m) => m.name === keep.name)
    if (hit === undefined) {
      throw new ContractError('PROTECTED', `拒绝写入：受保护模块「${keep.name}」不能删除或改名`)
    }
    if (hit.content !== keep.content) {
      throw new ContractError('PROTECTED', `拒绝写入：受保护模块「${keep.name}」的正文不可修改`)
    }
  }

  const text = JSON.stringify(next, null, 1) + '\n'
  const result = writeGuarded({
    file,
    text,
    labRoot: labRoot(),
    label: `modules-${dir}`,
    json: true,
    expectedMtimeMs: options?.expectedMtimeMs ?? null,
  })

  // 顺带报告模板变量（按清洗前的文本检测：即使选择"清洗"也如实报出处数与样例）
  const templateVars = normalized.map((g) => ({
    group: g.name,
    module: g.modules.map((m) => ({ name: m.name, ...detectTemplateVars(m.content) })).filter((x) => x.found),
  })).filter((x) => x.module.length > 0)

  return { ...result, stats: moduleStats(next), templateVars, templateVarPolicy: cleaned ? 'clean' : 'keep' }
}

/** 读反八股字段（tavern-state.json 的只读视图）。 */
export function readAnti() {
  const file = join(PRESET_ROOT, 'tavern-state.json')
  const st = statOf(file)
  const doc = readJson(file, undefined)
  return {
    file,
    exists: doc !== undefined,
    mtimeMs: st.mtimeMs,
    enabled: doc?.antiCliche === true,
    bannedWords: Array.isArray(doc?.bannedWords) ? doc.bannedWords.map(String) : [],
    promptWindowTokens: typeof doc?.promptWindowTokens === 'number' ? doc.promptWindowTokens : null,
  }
}

/**
 * 写反八股字段：**只动 antiCliche 与 bannedWords**，其余键原样保留。
 * bannedWords 传数组即整表替换（因此天然支持"删除"）。
 */
export function writeAnti(payload, options) {
  const file = join(PRESET_ROOT, 'tavern-state.json')
  if (!existsSync(file)) throw new ContractError('NOT_FOUND', `酒馆状态文件不存在：${file}`)
  const result = updateJsonFile({
    file,
    labRoot: labRoot(),
    label: 'tavern-state',
    // 把调用方的 mtime 守卫透传下去（否则守卫会被内部读到的 mtime 顶掉）
    expectedMtimeMs: options?.expectedMtimeMs ?? statOf(file).mtimeMs,
    mutate: (doc) => {
      if (typeof payload?.enabled === 'boolean') doc.antiCliche = payload.enabled
      if (Array.isArray(payload?.bannedWords)) {
        doc.bannedWords = payload.bannedWords
          .map((w) => String(w).trim())
          .filter((w) => w !== '')
          .filter((w, i, all) => all.indexOf(w) === i)
      }
      return doc
    },
  })
  return { ...result, anti: readAnti() }
}

/** 全局注册表（只读）。 */
export function readRegistry() {
  const file = join(PRESET_ROOT, 'presets.json')
  const doc = readJson(file, { presets: [] })
  const list = Array.isArray(doc?.presets) ? doc.presets : []
  return {
    file,
    mtimeMs: statOf(file).mtimeMs,
    presets: list.map((p) => ({
      id: String(p?.id ?? ''),
      name: String(p?.name ?? ''),
      dir: String(p?.dir ?? p?.id ?? ''),
      mode: p?.mode ?? null,
      description: p?.description ?? null,
      isLab: String(p?.dir ?? p?.id ?? '') === LAB_PRESET_ID || String(p?.id ?? '') === LAB_PRESET_ID,
    })),
  }
}

/** 可发布的目标预设（排除实验室自己）。 */
export function publishTargets() {
  return readRegistry().presets.filter((p) => !p.isLab && p.dir !== '')
}

/** 实验室预设的信息。 */
export function labPresetInfo() {
  const dir = join(PRESET_ROOT, LAB_PRESET_ID)
  const registry = readRegistry()
  return {
    id: LAB_PRESET_ID,
    dir,
    hasPresetYml: existsSync(join(dir, 'preset.yml')),
    hasComposition: existsSync(join(dir, 'agent.cordis.yml')),
    registeredInTavern: registry.presets.some((p) => p.isLab),
  }
}

/** 酒馆的 edited-messages.json（工作台"推送到显示层"用；只读视图）。 */
export function readEditedMessages() {
  const file = join(PRESET_ROOT, 'edited-messages.json')
  const st = statOf(file)
  const doc = readJson(file, undefined)
  return { file, exists: doc !== undefined, mtimeMs: st.mtimeMs, map: doc ?? {} }
}

/**
 * 把一个改进写进 edited-messages.json（可选功能，界面默认关闭）。
 * 结构与酒馆一致：{ [sessionId]: { [turnIndex]: { text, editedAt } } }
 */
export function writeEditedMessage(sessionId, turnIndex, text, options) {
  const file = join(PRESET_ROOT, 'edited-messages.json')
  if (!existsSync(file)) throw new ContractError('NOT_FOUND', `酒馆显示层文件不存在：${file}`)
  const result = updateJsonFile({
    file,
    labRoot: labRoot(),
    label: 'edited-messages',
    expectedMtimeMs: options?.expectedMtimeMs ?? statOf(file).mtimeMs,
    mutate: (doc) => {
      const key = String(sessionId)
      if (doc[key] === undefined || doc[key] === null || typeof doc[key] !== 'object') doc[key] = {}
      doc[key][String(turnIndex)] = { text: String(text), editedAt: Date.now() }
      return doc
    },
  })
  return result
}

/* ─────────────────── 酒馆包（只读：定位 + 内置增强模块包） ─────────────────── */

/**
 * 定位装着 dsh-tavern 的 profile 目录。
 * `DSH_PROFILE_DIR` 只在 profile 启动的 **shell 调用**里保证存在，Electron 宿主进程里可能没有，
 * 所以这里退化为扫描 `<DSH_HOME>/profiles/<profile>/node_modules/dsh-tavern/package.json`。
 *
 * 注：`node_modules/dsh-tavern` 在本机是 **junction**，node 的 readFileSync 会跟随，
 *     所以这里不需要 realpath；返回的 dir 只是"哪一行配置文件"，读文件用 file 的兄弟目录。
 */
export function findTavernPackageFile() {
  const candidates = []
  if (process.env.DSH_PROFILE_DIR !== undefined) candidates.push(process.env.DSH_PROFILE_DIR)
  if (process.env.DSH_PROFILE !== undefined) candidates.push(join(HOME_DIR, 'profiles', process.env.DSH_PROFILE))
  try {
    for (const entry of readdirSync(join(HOME_DIR, 'profiles'))) candidates.push(join(HOME_DIR, 'profiles', entry))
  } catch {
    /* 没有 profiles 目录就算了 */
  }
  for (const dir of candidates) {
    const file = join(dir, 'node_modules', 'dsh-tavern', 'package.json')
    if (existsSync(file)) return { dir, file }
  }
  return { dir: candidates[0] ?? null, file: undefined }
}

/** 酒馆的 lib 目录（数据文件都在这儿）。找不到返回 null。 */
export function tavernLibDir() {
  const found = findTavernPackageFile()
  return found.file === undefined ? null : join(dirname(found.file), 'lib')
}

/** 酒馆版本 / 内置模块包（只读；给面板 doctor 用）。 */
export function tavernInfo() {
  const found = findTavernPackageFile()
  const pkg = found.file === undefined ? undefined : readJson(found.file, undefined)
  const pack = readEnhancePack()
  return {
    profileDir: found.dir ?? null,
    packageFile: found.file ?? null,
    version: pkg?.version ?? null,
    present: pkg !== undefined,
    builtinModules: pack.modules.map((m) => ({ name: m.name, enabled: m.enabled, chars: m.chars, protected: m.protected })),
  }
}

/**
 * 读内置增强模块包 `lib/preset-enhance-pack.json`——**含每条正文**。
 *
 * 酒馆自己的面板（`/api/tavern/preset/enhance`、⚙️ 预设模块页）只回 `{name, enabled, chars}`，
 * 正文在 UI 上无处可见；本函数是"看得见增强层具体内容"的唯一来源（纯数据文件，不 import 酒馆代码）。
 */
export function readEnhancePack() {
  const lib = tavernLibDir()
  const file = lib === null ? null : join(lib, 'preset-enhance-pack.json')
  const doc = file === null ? undefined : readJson(file, undefined)
  const st = file === null ? { exists: false, mtimeMs: null, size: null } : statOf(file)
  const modules = (Array.isArray(doc) ? doc : [])
    .filter((m) => m !== null && typeof m === 'object')
    .map((m) => {
      const name = String(m.name ?? '').trim()
      const content = String(m.content ?? '')
      return { name, content, enabled: m.enabled !== false, chars: content.length, protected: isProtectedName(name) }
    })
    .filter((m) => m.name !== '' && m.content.trim() !== '')
  return { file, exists: Array.isArray(doc), mtimeMs: st.mtimeMs, size: st.size, modules }
}

/** 酒馆源码文件文本（只用于**漂移检测**：核对镜像条款是否还和酒馆一致；绝不 import / 执行）。 */
export function tavernSourceText(name) {
  const lib = tavernLibDir()
  if (lib === null) return undefined
  return readText(join(lib, name))
}

/* ────────────────────────── 内部 ────────────────────────── */

/** 插件根目录（备份落点）。可用环境变量覆盖，便于测试沙箱。 */
export function labRoot() {
  return process.env.DSH_TAVERN_STYLE_LAB ?? 'D:/DSH/tavern-style'
}
