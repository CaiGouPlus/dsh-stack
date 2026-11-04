/* eslint-disable */
/**
 * ⚠️ 本文件是构建产物 —— 不要直接编辑。
 * 源文件：lib/host-entry.mjs + lib/core/*.mjs
 * 重新生成：node D:/DSH/tavern-style/build/bundle-host.mjs
 * 为什么单文件：DSH 的插件加载器对入口的相对子模块导入支持存疑（行会卡在 fiber loading）。
 */
import { createHash } from 'node:crypto';
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';

const __m = {};

/* ── module: contracts (core/contracts.mjs) ───────────────────────────── */
__m.contracts = (() => {
/**
 * 文风实验室 · 安全写入核心（contracts）
 *
 * 所有对酒馆用户数据文件的写入都必须走这里，规则只有四条：
 *   1. **写前备份**：原文先进插件自己的备份目录（附 JSON 边车：路径/时间/hash/大小）；
 *   2. **mtime 守卫**：调用方带上读到的 mtime；文件被别处改过就拒绝写（酒馆面板可能同时在写）；
 *   3. **原子替换**：写临时文件再 rename，避免半截文件；
 *   4. **回读校验**：写完立刻重读并按 JSON 解析，不合法就回滚到备份。
 *
 * 只依赖 node 内建模块；不 import 任何酒馆代码。
 */




/** 契约层错误：code 供上层区分处理。 */
class ContractError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ContractError'
    this.code = code
  }
}

function statOf(file) {
  try {
    const st = statSync(file)
    return { exists: true, mtimeMs: st.mtimeMs, size: st.size }
  } catch {
    return { exists: false, mtimeMs: null, size: null }
  }
}

function readText(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
}

function readJson(file, fallback) {
  const text = readText(file)
  if (text === undefined) return fallback
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16)
}

/** JSON 文本校验：返回 {ok, error}，不抛。 */
function validateJson(text) {
  try {
    JSON.parse(text)
    return { ok: true, error: null }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) }
  }
}

/**
 * 酒馆落盘时会清洗 SillyTavern 模板变量（`{{...}}`）。这里只**检测**并报告，
 * 由界面决定是"按酒馆规则清洗"还是"保留原文"。
 */
function detectTemplateVars(text) {
  const matches = String(text ?? '').match(/\{\{[^}]{0,80}\}\}/gu)
  return { found: matches !== null, samples: matches === null ? [] : matches.slice(0, 5), count: matches === null ? 0 : matches.length }
}

/**
 * 按酒馆规则清洗模板变量（`cleanSillyTavernVars` 的等价实现）：剔除 `{{...}}`。
 * 仅在调用方**显式选择**"按酒馆规则清洗"后才使用；默认保留原文。
 */
function cleanTemplateVars(text) {
  return String(text ?? '').replace(/\{\{[^}]{0,80}\}\}/gu, '')
}

/** 备份目录（插件自己的 data/backups，不会被 DSH 的预设扫描干扰）。 */
function backupRoot(labRoot) {
  return join(labRoot, 'data', 'backups')
}

function stamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return (
    String(date.getFullYear()) +
    p(date.getMonth() + 1) +
    p(date.getDate()) +
    '-' +
    p(date.getHours()) +
    p(date.getMinutes()) +
    p(date.getSeconds()) +
    '-' +
    String(date.getMilliseconds()).padStart(3, '0')
  )
}

/**
 * 写前备份：原文复制到备份目录，并在同目录落一份 `.meta.json` 边车。
 * @returns {{id: string, file: string, meta: string, original: string, at: number, size: number, hash: string}}
 */
function backupFile(file, labRoot, label = '') {
  const text = readText(file)
  if (text === undefined) throw new ContractError('NOT_FOUND', `备份失败：读不到 ${file}`)
  const root = backupRoot(labRoot)
  mkdirSync(root, { recursive: true })
  const id = `${stamp()}-${basename(file)}${label === '' ? '' : '-' + label}`
  const dest = join(root, id)
  writeFileSync(dest, text, 'utf8')
  const meta = {
    id,
    original: file,
    label,
    at: Date.now(),
    size: Buffer.byteLength(text, 'utf8'),
    hash: sha256(text),
  }
  writeFileSync(dest + '.meta.json', JSON.stringify(meta, null, 1), 'utf8')
  return { id, file: dest, meta: dest + '.meta.json', original: file, at: meta.at, size: meta.size, hash: meta.hash }
}

/** 列出某个原始文件的全部备份（新的在前）。 */
function listBackups(labRoot, originalFile) {
  const root = backupRoot(labRoot)
  let names = []
  try {
    names = readdirSync(root)
  } catch {
    return []
  }
  const out = []
  for (const name of names) {
    if (name.endsWith('.meta.json')) continue
    const metaPath = join(root, name + '.meta.json')
    const meta = readJson(metaPath, undefined)
    if (meta === undefined) continue
    if (originalFile !== undefined && meta.original !== originalFile) continue
    // 边车里没有备份文件路径，这里补上（回滚需要它）
    out.push({ ...meta, file: join(root, name), meta: metaPath })
  }
  return out.sort((a, b) => b.at - a.at)
}

/** 原子写：临时文件 + rename；保留原文件权限（若存在）。 */
function atomicWrite(file, text) {
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.style-lab-tmp-${process.pid.toString(36)}-${Date.now().toString(36)}`
  writeFileSync(temp, text, 'utf8')
  try {
    renameSync(temp, file)
  } catch (error) {
    try {
      rmSync(temp, { force: true })
    } catch {
      /* ignore */
    }
    throw new ContractError('WRITE_FAILED', `原子替换失败：${String(error?.message ?? error)}`)
  }
}

/**
 * 带守卫的写入：mtime 校验 → 备份 → 原子写 → 回读校验（失败自动回滚）。
 *
 * @param {object} options
 * @param {string} options.file 目标文件
 * @param {string} options.text 新内容
 * @param {string} options.labRoot 插件根目录（备份落这里）
 * @param {number|null} [options.expectedMtimeMs] 调用方读到的 mtime；传 null 表示跳过守卫（仅在文件不存在时）
 * @param {boolean} [options.json] 是否按 JSON 校验与格式化（true 时 text 必须是合法 JSON）
 * @param {string} [options.label] 备份标签
 * @returns {{backup: object, mtimeMs: number, size: number, hash: string}}
 */
function writeGuarded(options) {
  const { file, text, labRoot, label = '' } = options
  const expected = options.expectedMtimeMs === undefined ? null : options.expectedMtimeMs
  const json = options.json === true

  if (json) {
    const check = validateJson(text)
    if (!check.ok) throw new ContractError('INVALID', `拒绝写入：不是合法 JSON（${check.error}）`)
  }

  const before = statOf(file)
  if (before.exists && expected !== null && Math.abs(before.mtimeMs - expected) > 3) {
    throw new ContractError(
      'CONFLICT',
      `拒绝写入：文件已被其它程序修改（期望 mtime=${Math.round(expected)}，实际=${Math.round(before.mtimeMs)}）。` +
        ' 若你刚在酒馆面板里改过设置，请先关闭面板再重试。',
    )
  }

  const backup = before.exists ? backupFile(file, labRoot, label) : null
  atomicWrite(file, text)

  const after = statOf(file)
  const written = readText(file)
  if (json) {
    const check = validateJson(written ?? '')
    if (!check.ok) {
      if (backup !== null) restoreBackup(backup)
      throw new ContractError('VERIFY_FAILED', `写入后校验失败，已回滚：${check.error}`)
    }
  }
  if (written !== text) {
    if (backup !== null) restoreBackup(backup)
    throw new ContractError('VERIFY_FAILED', '写入后内容与预期不一致，已回滚')
  }

  return { backup, mtimeMs: after.mtimeMs, size: after.size, hash: sha256(text) }
}

/** 回滚：把备份内容原子写回原路径。 */
function restoreBackup(backup) {
  const text = readText(backup.file)
  if (text === undefined) throw new ContractError('NOT_FOUND', `备份文件读不到：${backup.file}`)
  atomicWrite(backup.original, text)
  return { file: backup.original, size: Buffer.byteLength(text, 'utf8'), hash: sha256(text) }
}

/** 便捷：读 → 改 → 带守卫写（JSON 对象形态）。调用方可用 expectedMtimeMs 覆盖内部读到的 mtime（守卫不因此失效）。 */
function updateJsonFile(options) {
  const { file, labRoot, mutate, label = '' } = options
  const before = statOf(file)
  const current = readJson(file, undefined)
  if (current === undefined) throw new ContractError('NOT_FOUND', `读不到或不是 JSON：${file}`)
  const next = mutate(structuredClone(current))
  if (next === undefined) throw new ContractError('INVALID', 'mutate 没有返回新对象')
  const text = JSON.stringify(next, null, 1) + '\n'
  const expected = Object.hasOwn(options, 'expectedMtimeMs') ? options.expectedMtimeMs : before.mtimeMs
  return writeGuarded({ file, text, labRoot, label, json: true, expectedMtimeMs: expected })
}

/** 目录是否存在且可写探测（不实际写文件）。 */
function canWriteDir(dir) {
  try {
    mkdirSync(dir, { recursive: true })
    const probe = join(dir, `.style-lab-write-probe-${process.pid.toString(36)}`)
    const fd = openSync(probe, 'w')
    closeSync(fd)
    rmSync(probe, { force: true })
    return true
  } catch {
    return false
  }
}

/** 复制一份文件到目标（仅用于导出成果这类只增操作）。 */
function copyOut(from, to) {
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(from, to)
  return to
}
  return { statOf, readText, readJson, sha256, validateJson, detectTemplateVars, cleanTemplateVars, backupRoot, backupFile, listBackups, atomicWrite, writeGuarded, restoreBackup, updateJsonFile, canWriteDir, copyOut, ContractError, stamp };
})();

/* ── module: tavern (core/tavern.mjs) ───────────────────────────── */
__m.tavern = (() => {
  const { ContractError, cleanTemplateVars, detectTemplateVars, readJson, readText, statOf, updateJsonFile, writeGuarded } = __m.contracts;
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




const HOME_DIR = process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? '.', '.dsh')
const PRESET_ROOT = join(HOME_DIR, '.agent-presets')

/** 实验室预设 id（独立隔离：不写进酒馆注册表）。 */
const LAB_PRESET_ID = 'style-lab'

/** 与酒馆 lib/utils.js 的 isEnhanceProtectedName 等价。 */
function isProtectedName(name) {
  return /变量|Variable|era|格式|format/iu.test(String(name ?? ''))
}

/** 粗估 token（中文为主：约 1.5 字/token）。仅用于预算提示，不做精确计费。 */
function estimateTokens(chars) {
  return Math.ceil(Number(chars ?? 0) / 1.5)
}

/** 规整模块结构：丢弃缺 name / content 的条目，与酒馆 normalizeEnhancePack 同口径。 */
function normalizeModules(groups) {
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
function moduleStats(groups) {
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
function presetModulesFile(dir) {
  return join(PRESET_ROOT, dir, 'presets.json')
}

/**
 * 读一个预设的增强层。
 * @returns {{dir: string, file: string, exists: boolean, mtimeMs: number|null, groups: Array, stats: object}}
 */
function readPreset(dir) {
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
function writePreset(dir, groups, options) {
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
function readAnti() {
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
function writeAnti(payload, options) {
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
function readRegistry() {
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
function publishTargets() {
  return readRegistry().presets.filter((p) => !p.isLab && p.dir !== '')
}

/** 实验室预设的信息。 */
function labPresetInfo() {
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
function readEditedMessages() {
  const file = join(PRESET_ROOT, 'edited-messages.json')
  const st = statOf(file)
  const doc = readJson(file, undefined)
  return { file, exists: doc !== undefined, mtimeMs: st.mtimeMs, map: doc ?? {} }
}

/**
 * 把一个改进写进 edited-messages.json（可选功能，界面默认关闭）。
 * 结构与酒馆一致：{ [sessionId]: { [turnIndex]: { text, editedAt } } }
 */
function writeEditedMessage(sessionId, turnIndex, text, options) {
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
function findTavernPackageFile() {
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
function tavernLibDir() {
  const found = findTavernPackageFile()
  return found.file === undefined ? null : join(dirname(found.file), 'lib')
}

/** 酒馆版本 / 内置模块包（只读；给面板 doctor 用）。 */
function tavernInfo() {
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
function readEnhancePack() {
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
function tavernSourceText(name) {
  const lib = tavernLibDir()
  if (lib === null) return undefined
  return readText(join(lib, name))
}

/* ────────────────────────── 内部 ────────────────────────── */

/** 插件根目录（备份落点）。可用环境变量覆盖，便于测试沙箱。 */
function labRoot() {
  return process.env.DSH_TAVERN_STYLE_LAB ?? 'D:/DSH/tavern-style'
}
  return { isProtectedName, estimateTokens, normalizeModules, moduleStats, presetModulesFile, readPreset, writePreset, readAnti, writeAnti, readRegistry, publishTargets, labPresetInfo, readEditedMessages, writeEditedMessage, findTavernPackageFile, tavernLibDir, tavernInfo, readEnhancePack, tavernSourceText, labRoot, HOME_DIR, PRESET_ROOT, LAB_PRESET_ID };
})();

/* ── module: anti (core/anti.mjs) ───────────────────────────── */
__m.anti = (() => {
  const { readText } = __m.contracts;
  const { readAnti, tavernSourceText } = __m.tavern;
/**
 * 文风实验室 · 反 AI 八股（anti）
 *
 * 反八股的**正文**不在任何用户数据文件里：`tavern-state.json` 只有开关 `antiCliche`
 * 与词表 `bannedWords`；真正注入的 15 条结构禁令是酒馆源码里的字面量
 * （`dsh-tavern/lib/index.js` 的 `state.antiCliche !== false` 分支）。
 * 于是"反八股页看不到具体内容"——只有一个开关加一个空词表。
 *
 * 本模块做三件事（**全部只读，绝不 import / 执行酒馆代码**）：
 *   ① 镜像那 15 条结构禁令 + 注入模板，拼出**与酒馆逐字一致**的注入预览；
 *   ② 漂移检测：去酒馆 index.js / utils.js 里核对关键句是否还在，对不上就如实报"镜像可能已过期"；
 *   ③ 读本地 deslop 语料（`D:/DSH/skills/deslop/references/banned-phrases.md`），
 *      把"12 条硬禁令"与词表条目解析出来，供你逐条挑进 bannedWords（当前词表是空的 → 词汇禁令段是空的）。
 */




/** 注入段标题（与酒馆 index.js 逐字一致）。 */
const ANTI_HEADER = '【写作风格铁律·严格执行 — 最高优先级】'
const ANTI_STRUCTURE_TITLE = '## 结构禁令（以下句式结构绝对禁止，换词也不行）'
const ANTI_VOCAB_TITLE = '## 词汇禁令（以下词汇绝对禁止出现）'
const ANTI_TAIL = '请用具体、独特、有画面感的语言替代以上所有八股句式。'

/** 15 条结构禁令（镜像 dsh-tavern 2.5.0 `lib/index.js`；顺序即编号）。 */
const ANTI_STRUCTURE_RULES = [
  '禁止「心中/心底/心头 + 涌起/升起/泛起/掠过 + 一股/一阵/一种 + 情绪词」',
  '禁止「像是/仿佛/似乎 + 被什么（东西） + 动词（击中/攫住/扼住/抽走/牵引）」',
  '禁止「张了张嘴 + 却/又/还是/最终/想说/欲言又止」',
  '禁止「他/她 + 不知道 + 该怎么/该如何/为什么会 + 动词」',
  '禁止「沉默/许久的沉默/片刻的沉默 + 后/之后，」',
  '禁止「「...」他/她 + 轻声/低声/淡淡/柔声/哑声/沉声/冷声 + 说/道」',
  '禁止「空气中/空气里 + 弥漫着/飘散着/回荡着」',
  '禁止「像是要把...揉进/吞进/看穿/看透」',
  '禁止「让人/令人 + 无法忽视/难以忽视/移不开眼/窒息/屏息」',
  '禁止「一种 + 说不清/说不出的/难以言说的/莫名的 + 感觉/情绪/冲动」',
  '禁止「像 + 被烫到/触电/雷劈/施了魔法/钉在 + 一般/一样」',
  '禁止「仿佛/好像 + 有什么东西 + 在/正在/悄然/悄悄 + 改变/碎了/崩塌」',
  '禁止「心底/内心/灵魂 + 深处/某个角落/最柔软的地方」',
  '禁止「夜幕/夜色/天色 + 降临/渐深/渐暗/已晚」',
  '禁止「月光/月色/阳光/夕阳 + 透过/如水/皎洁/清冷」',
]

/**
 * 拼出与酒馆**逐字一致**的注入块（酒馆在 `state.antiCliche !== false` 时把它追加到角色卡文本尾部）。
 * 逐字对齐很重要：这个预览要能当"实际注入内容"看，任何润色都会让它变成假的。
 */
function buildAntiBlock(bannedWords) {
  const words = (Array.isArray(bannedWords) ? bannedWords : []).map((w) => String(w).trim()).filter((w) => w !== '')
  const rules = ANTI_STRUCTURE_RULES.map((rule, index) => `${index + 1}. ${rule}\n`).join('')
  return (
    '\n\n' +
    ANTI_HEADER +
    '\n\n' +
    ANTI_STRUCTURE_TITLE +
    '\n\n' +
    rules +
    '\n' +
    ANTI_VOCAB_TITLE +
    '\n\n' +
    (words.length > 0 ? words.join('、') + '\n' : '') +
    '\n' +
    ANTI_TAIL
  )
}

/** 反八股条款视图：镜像正文 + 漂移检测 + 注入预览。 */
function antiRulesView() {
  const anti = readAnti()
  const source = tavernSourceText('index.js')
  const checked = source !== undefined
  const missing = checked ? ANTI_STRUCTURE_RULES.filter((rule) => !source.includes(rule)) : []
  const headerFound = checked ? source.includes(ANTI_HEADER) : false
  const tailFound = checked ? source.includes(ANTI_TAIL) : false
  const ok = checked && missing.length === 0 && headerFound && tailFound
  return {
    enabled: anti.enabled,
    bannedWords: anti.bannedWords,
    wordCount: anti.bannedWords.length,
    file: anti.file,
    mtimeMs: anti.mtimeMs,
    structureRules: ANTI_STRUCTURE_RULES.slice(),
    header: ANTI_HEADER,
    structureTitle: ANTI_STRUCTURE_TITLE,
    vocabTitle: ANTI_VOCAB_TITLE,
    tail: ANTI_TAIL,
    preview: buildAntiBlock(anti.bannedWords),
    previewChars: buildAntiBlock(anti.bannedWords).length,
    mirror: {
      checked,
      ok,
      found: ANTI_STRUCTURE_RULES.length - missing.length,
      total: ANTI_STRUCTURE_RULES.length,
      missing,
      headerFound,
      tailFound,
      note: !checked
        ? '读不到酒馆 index.js，无法核对镜像（条款仍按 dsh-tavern 2.5.0 显示）'
        : ok
          ? '镜像与酒馆 index.js 一致（15/15 条 + 首尾句）'
          : '镜像可能已过期：酒馆改过这段，请对照 index.js 复核',
    },
  }
}

/* ────────────────────── 本地反八股语料（deslop，只读） ────────────────────── */

/** deslop 技能目录（可用 DSH_DESLOP_DIR 覆盖）。 */
function deslopDir() {
  return process.env.DSH_DESLOP_DIR ?? 'D:/DSH/skills/deslop'
}

/**
 * 把一个表格单元展开成候选条目（把「（a / b / c）」「甲 / 乙」这类并列写法摊平）。
 *
 * 三条判定，都是从这份词表的实际写法里总结出来的：
 *   ① 含 `/` 的括号 = 并列选项（`（明白 / 懂得 / 看清）`）；
 *   ② 单元末尾、且不含 `/` 的括号 = 说明文字，丢掉（`缓缓地 / 轻轻地（三连出现时）` → 不要"三连出现时"）；
 *   ③ 其余位置、不含 `/` 的括号 = 字面文本（`被什么（东西）` → 保留"东西"）。
 * 展开上限 8 个组合，避免组合爆炸。
 */
function expandVariants(cell) {
  const clean = String(cell ?? '').replace(/[`*]/gu, '').trim()
  if (clean === '') return []
  const parts = []
  let rest = clean
  // ⚠️ 这里**不能**带 g 标志：循环里每次都拿新的 rest 重新 exec，g 的 lastIndex 会指向旧串的偏移，
  //    导致第二次匹配静默失败（第一版就是这么把「（一切 / 所有 / 真相）」漏成字面文本的）。
  const re = /[（(]([^（）()]*)[）)]/u
  let hit = re.exec(rest)
  while (hit !== null) {
    if (hit.index > 0) parts.push({ text: rest.slice(0, hit.index) })
    const isLast = hit.index + hit[0].length === rest.length
    const options = hit[1].split(/[／/、]|或/gu).map((s) => s.trim()).filter((s) => s !== '')
    if (options.length > 1) parts.push({ options })
    else if (!isLast) parts.push({ text: options[0] ?? '' })
    rest = rest.slice(hit.index + hit[0].length)
    hit = re.exec(rest)
  }
  if (rest !== '') parts.push({ text: rest })

  let out = ['']
  for (const part of parts) {
    const options = part.text !== undefined
      ? part.text.split(/\s*[／/]\s*/u).map((s) => s.trim()).filter((s) => s !== '')
      : part.options
    const list = options.length > 0 ? options : ['']
    const next = []
    for (const prefix of out) for (const option of list) next.push(prefix + option)
    out = next.slice(0, 8)
  }
  const items = out.map((s) => s.trim()).filter((s) => s !== '' && s.length <= 30)
  return items.length > 0 ? items : [clean]
}

/** 取某个二级标题到下一个二级标题之间的正文。 */
function sectionBody(text, heading) {
  const start = text.indexOf(heading)
  if (start < 0) return ''
  const after = text.slice(start + heading.length)
  const next = /\n##\s/u.exec(after)
  return next === null ? after : after.slice(0, next.index)
}

/** 解析 `## 六、…` 下的编号清单。 */
function parseNumbered(body) {
  const out = []
  for (const line of body.split('\n')) {
    const m = /^\s*(\d+)[.、)]\s*(.+?)\s*$/u.exec(line)
    if (m !== null) out.push(m[2])
  }
  return out
}

/** 解析 markdown 表格的第一列（跳过表头与分隔行），并把并列写法展开成候选条目。 */
function parseFirstColumn(body) {
  const out = []
  for (const line of body.split('\n')) {
    const m = /^\|\s*(.+?)\s*\|/u.exec(line.trim())
    if (m === null) continue
    const cell = m[1]
    if (cell === '' || /^-+$/u.test(cell) || cell === '形式' || cell === '标点' || cell === '用途' || cell === '原文结构') continue
    for (const item of expandVariants(cell)) if (!out.includes(item)) out.push(item)
  }
  return out
}

/**
 * 读本地 deslop 语料：12 条生成期硬禁令 + 三类词表（句尾补语 / 网文套语 / 议论文腔）。
 * 词表是**线索**不是违禁词（deslop 原文就这么写的），所以这里的条目只做"候选"，
 * 由你在界面上逐条挑进 bannedWords —— 绝不自动写入。
 */
function deslopCorpus() {
  const file = join(deslopDir(), 'references', 'banned-phrases.md')
  const text = readText(file)
  if (text === undefined) return { file, exists: false, hardRules: [], sections: [], note: '读不到 deslop 词表（可用环境变量 DSH_DESLOP_DIR 指定技能目录）' }
  const sections = [
    { title: '一、句尾补语（一律可删）', heading: '## 一、', items: parseFirstColumn(sectionBody(text, '## 一、')) },
    { title: '二、网文套语（密度高就删）', heading: '## 二、', items: parseFirstColumn(sectionBody(text, '## 二、')) },
    { title: '三、议论文腔与空洞连接词', heading: '## 三、', items: parseFirstColumn(sectionBody(text, '## 三、')) },
  ]
  return {
    file,
    exists: true,
    hardRules: parseNumbered(sectionBody(text, '## 六、')),
    sections: sections.map((s) => ({ title: s.title, count: s.items.length, items: s.items })),
    note: '词表是线索不是违禁词：挑真正反复出现的，别整表塞进去（整表会进每一轮 prompt）。',
  }
}
  return { buildAntiBlock, antiRulesView, deslopDir, deslopCorpus, ANTI_HEADER, ANTI_STRUCTURE_TITLE, ANTI_VOCAB_TITLE, ANTI_TAIL, ANTI_STRUCTURE_RULES };
})();

/* ── module: enhance (core/enhance.mjs) ───────────────────────────── */
__m.enhance = (() => {
  const { ContractError } = __m.contracts;
  const { isProtectedName, readEnhancePack, readPreset, tavernSourceText, writePreset } = __m.tavern;
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



/** 输出契约标签（与酒馆 `ENHANCE_CONTRACT_TAGS` 同值；漂移时会在界面上标出）。 */
const ENHANCE_CONTRACT_TAGS = [
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
const RUNTIME_BLOCK = [
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
function runtimeBlockLive() {
  const live = tavernSourceText('enhance-runtime-layer.txt')
  return live !== undefined && live.trim() !== '' ? live.trimEnd() : RUNTIME_BLOCK
}

/** 核对该镜像是否还与酒馆 utils.js 一致。 */
function runtimeMirror() {
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
function mergeEnhanceModules(existing, pack, options) {
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
function enhancePackView() {
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
function applyEnhancePack(dir, options) {
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
  return { runtimeBlockLive, runtimeMirror, mergeEnhanceModules, enhancePackView, applyEnhancePack, ENHANCE_CONTRACT_TAGS, RUNTIME_BLOCK };
})();

/* ── module: sessions (core/sessions.mjs) ───────────────────────────── */
__m.sessions = (() => {
  const { HOME_DIR } = __m.tavern;
/**
 * 文风实验室 · 会话层（sessions）
 *
 * 职责：读会话（只读）、按预设分桶、抽出**模型输出（assistant 正文）**供工作台改进。
 *
 * 格式要点（实测）：
 *   - 会话文件是**多帧 zstd**（每次追加一帧），`zstdDecompressSync` 只解第一帧；
 *     这里按 magic 扫帧、逐帧解码再拼接（拒绝坏帧），60KB→118KB 实测 79/79 帧成功。
 *   - 关键事件：`session`(头，含 agentPreset) / `user/message` / `assistant/message`
 *     / `turn/start` / `session/title`；正文在 `data.message.content[].text`（type=text）。
 *   - v0 与 v4 格式事件形状一致（v4 多 reasoning / stream）。
 *
 * 安全：**只读**。绝不写会话文件。
 */





const SESSIONS_ROOT = join(HOME_DIR, 'sessions')

/** 分桶策略（用户决定）：只吃用户自建 roleplay 预设；排除 liangshen 与系统自带预设。 */
const SESSION_WHITELIST_PREFIX = 'preset-'
const SESSION_EXCLUDE = ['liangshen', 'standard', 'code', 'cordis', 'minimal', 'ptc']

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/** 会话是否参与学习（白名单 + 黑名单）。 */
function bucketOf(preset) {
  const name = String(preset ?? '(none)')
  const allowed = name.startsWith(SESSION_WHITELIST_PREFIX) && !SESSION_EXCLUDE.includes(name)
  const key = allowed ? name : name + (SESSION_EXCLUDE.includes(name) ? ' [排除]' : ' [非预设]')
  return { allowed, key }
}

/** 多帧解码：扫 magic → 逐帧解码 → 拼接（坏帧跳过并计数）。 */
function decodeSessionFile(file) {
  let buf
  try {
    buf = readFileSync(file)
  } catch {
    return { text: '', frames: 0, bad: 0, size: 0, error: 'READ_FAILED' }
  }
  const offsets = []
  let at = buf.indexOf(MAGIC, 0)
  while (at !== -1) {
    offsets.push(at)
    at = buf.indexOf(MAGIC, at + 4)
  }
  if (offsets.length === 0 || offsets[0] !== 0) offsets.unshift(0)
  const parts = []
  let frames = 0
  let bad = 0
  for (const offset of offsets) {
    try {
      parts.push(zstdDecompressSync(buf.subarray(offset)).toString('utf8'))
      frames += 1
    } catch {
      bad += 1
    }
  }
  return { text: parts.join(''), frames, bad, size: buf.length }
}

/** 只解第一帧取会话头（列表用，极快）。 */
function readSessionHeader(file) {
  let buf
  try {
    buf = readFileSync(file)
  } catch {
    return undefined
  }
  const end = Math.min(buf.length, 8192)
  try {
    const text = zstdDecompressSync(buf.subarray(0, end)).toString('utf8')
    const line = text.split('\n').find((l) => l.trim() !== '')
    return line === undefined ? undefined : JSON.parse(line)
  } catch {
    return undefined
  }
}

function textOfContent(content) {
  if (!Array.isArray(content)) return ''
  let out = ''
  for (const part of content) {
    if (part !== null && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string') out += part.text
  }
  return out
}

/**
 * 解析会话事件流，抽出「轮次」。
 * @returns {{header: object|null, title: string|null, events: number, badLines: number,
 *            turns: Array<{turn: number, user: string, assistants: Array<{seq: number, step: number, text: string, chars: number, reasoningChars: number, toolCalls: number}>}>}}
 */
function parseSession(text) {
  const lines = String(text ?? '').split('\n')
  let header = null
  let title = null
  let events = 0
  let badLines = 0
  const turns = []
  const byTurn = new Map()

  const ensureTurn = (turn) => {
    const key = Number.isFinite(turn) ? turn : turns.length + 1
    if (!byTurn.has(key)) {
      const record = { turn: key, user: '', assistants: [] }
      byTurn.set(key, record)
      turns.push(record)
    }
    return byTurn.get(key)
  }

  let lastTurn = 0
  for (const line of lines) {
    if (line.trim() === '') continue
    let ev
    try {
      ev = JSON.parse(line)
    } catch {
      badLines += 1
      continue
    }
    events += 1
    const type = ev.type
    const data = ev.data ?? {}

    if (type === 'session' && header === null) {
      header = ev
      continue
    }
    if (type === 'session/title') {
      if (typeof data.title === 'string' && data.title.trim() !== '') title = data.title.trim()
      continue
    }
    if (type === 'turn/start') {
      const t = Number(data.turn)
      if (Number.isFinite(t)) {
        lastTurn = t
        ensureTurn(t)
      }
      continue
    }
    if (type === 'user/message') {
      const record = ensureTurn(lastTurn)
      const piece = textOfContent(data.content)
      record.user = record.user === '' ? piece : record.user + '\n' + piece
      continue
    }
    if (type === 'assistant/message') {
      const turn = Number.isFinite(Number(data.turn)) ? Number(data.turn) : lastTurn
      const record = ensureTurn(turn)
      const content = data.message?.content
      const body = textOfContent(content)
      const reasoningChars = Array.isArray(content)
        ? content.reduce((n, part) => n + (part?.type === 'reasoning' && typeof part.text === 'string' ? part.text.length : 0), 0)
        : 0
      const toolCalls = Array.isArray(content) ? content.filter((part) => part?.type === 'tool-call').length : 0
      record.assistants.push({
        seq: Number(ev.seq ?? -1),
        step: Number.isFinite(Number(data.step)) ? Number(data.step) : 1,
        text: body,
        chars: body.length,
        reasoningChars,
        toolCalls,
        at: Number(ev.time ?? 0),
      })
      continue
    }
  }

  // 只保留"有模型正文"的助手消息（工具轮、纯推理轮不算可改进内容）
  for (const record of turns) {
    record.assistants = record.assistants.filter((a) => a.chars > 0)
  }
  return { header, title, events, badLines, turns }
}

/** 列出会话（只读头，不解析正文；按 mtime 倒序）。 */
function listSessions(options = {}) {
  const limit = Number.isFinite(options.limit) ? Number(options.limit) : 200
  const onlyAllowed = options.onlyAllowed !== false
  const out = []
  let workspaces = []
  try {
    workspaces = readdirSync(SESSIONS_ROOT)
  } catch {
    return { root: SESSIONS_ROOT, sessions: [], scanned: 0, failed: 0 }
  }
  let scanned = 0
  let failed = 0
  for (const workspace of workspaces) {
    const wsDir = join(SESSIONS_ROOT, workspace)
    let names = []
    try {
      if (!statSync(wsDir).isDirectory()) continue
      names = readdirSync(wsDir)
    } catch {
      continue
    }
    for (const name of names) {
      const dir = join(wsDir, name)
      let files = []
      let st
      try {
        if (!statSync(dir).isDirectory()) continue
        files = readdirSync(dir).filter((f) => f.endsWith('.zstd'))
        if (files.length === 0) continue
        st = statSync(join(dir, files[0]))
      } catch {
        continue
      }
      scanned += 1
      const file = join(dir, files[0])
      const header = readSessionHeader(file)
      if (header === undefined) {
        failed += 1
        continue
      }
      const preset = String(header.agentPreset ?? '(none)')
      const bucket = bucketOf(preset)
      if (onlyAllowed && !bucket.allowed) continue
      out.push({
        sessionId: String(header.id ?? name),
        dir,
        file,
        fileSize: st.size,
        mtimeMs: st.mtimeMs,
        workspace,
        preset,
        bucket: bucket.key,
        allowed: bucket.allowed,
        cwd: header.cwd ?? null,
        createdAt: Number(header.createdAt ?? 0),
        formatVersion: Number(header.version ?? -1),
      })
    }
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return { root: SESSIONS_ROOT, scanned, failed, total: out.length, sessions: out.slice(0, limit), policy: policyView() }
}

/** 按预设分桶统计（overview 用）。 */
function bucketStats() {
  const counts = new Map()
  const byWorkspace = new Map()
  let scanned = 0
  let failed = 0
  let workspaces = []
  try {
    workspaces = readdirSync(SESSIONS_ROOT)
  } catch {
    return { scanned: 0, failed: 0, buckets: [], byWorkspace: [], policy: policyView() }
  }
  for (const workspace of workspaces) {
    const wsDir = join(SESSIONS_ROOT, workspace)
    let names = []
    try {
      if (!statSync(wsDir).isDirectory()) continue
      names = readdirSync(wsDir)
    } catch {
      continue
    }
    for (const name of names) {
      const dir = join(wsDir, name)
      let files = []
      try {
        if (!statSync(dir).isDirectory()) continue
        files = readdirSync(dir).filter((f) => f.endsWith('.zstd'))
      } catch {
        continue
      }
      if (files.length === 0) continue
      scanned += 1
      const header = readSessionHeader(join(dir, files[0]))
      if (header === undefined) {
        failed += 1
        continue
      }
      const bucket = bucketOf(header.agentPreset)
      counts.set(bucket.key, (counts.get(bucket.key) ?? 0) + 1)
      byWorkspace.set(workspace, (byWorkspace.get(workspace) ?? 0) + 1)
    }
  }
  const sortDesc = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }))
  return { scanned, failed, buckets: sortDesc(counts), byWorkspace: sortDesc(byWorkspace), policy: policyView() }
}

function policyView() {
  return { whitelistPrefix: SESSION_WHITELIST_PREFIX, exclude: SESSION_EXCLUDE, learnOnly: 'assistant' }
}

/* ────────────────────────── 解码缓存（按 mtime 失效，最多 8 个） ────────────────────────── */

const cache = new Map()

/** 读一个会话的完整轮次（带缓存；只读）。 */
function readSession(dir, file) {
  const st = statSync(file)
  const key = file
  const hit = cache.get(key)
  if (hit !== undefined && hit.mtimeMs === st.mtimeMs) return hit.value

  const decoded = decodeSessionFile(file)
  const parsed = parseSession(decoded.text)
  const value = {
    dir,
    file,
    fileSize: st.size,
    mtimeMs: st.mtimeMs,
    frames: decoded.frames,
    badFrames: decoded.bad,
    header: parsed.header,
    title: parsed.title,
    events: parsed.events,
    badLines: parsed.badLines,
    turns: parsed.turns,
    assistantTotal: parsed.turns.reduce((n, t) => n + t.assistants.length, 0),
  }
  cache.set(key, { mtimeMs: st.mtimeMs, value })
  if (cache.size > 8) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].mtimeMs - b[1].mtimeMs)[0]
    if (oldest !== undefined) cache.delete(oldest[0])
  }
  return value
}

/** 丢掉解码缓存（写改进后强制刷新时用）。 */
function clearSessionCache() {
  cache.clear()
}
  return { bucketOf, decodeSessionFile, readSessionHeader, parseSession, listSessions, bucketStats, policyView, readSession, clearSessionCache, SESSIONS_ROOT, SESSION_WHITELIST_PREFIX, SESSION_EXCLUDE };
})();

/* ── module: score (core/score.mjs) ───────────────────────────── */
__m.score = (() => {
/**
 * 文风实验室 · 指标层（score）
 *
 * 确定性、零依赖、毫秒级：给任意一段正文算出**可比较的数字**与**八股命中**。
 * 用途：
 *   - 工作台保存改进时给「改进前后对比」（命中 X→Y）；
 *   - 比对页做分布拟合与版本对照；
 *   - 全部可解释（每条命中都有名字与证据片段），不是黑箱分数。
 *
 * 说明：这里是**轻量内置**规则（面板要快）；深度分析仍由「文风实验室」预设调用
 * `D:\DSH\skills\deslop\scripts\deslop-lint.mjs` 完成（那边规则库 60KB）。
 */

/** 八股 / AI 味模式表：name 用于展示，re 用于命中，weight 用于打分。
 *  ⚠️ 这些正则带 g 标志且是模块级共享实例：只配 String.match 使用（它会重置 lastIndex）；
 *  别改成 exec/test 循环 —— lastIndex 复用会静默漏匹配（deslop-lint 已按 source+按需编译处理同类问题）。
 *  内容口径与 deslop-lint 的 BANNED/EXT_PATTERNS 对齐（二分壳、像类比喻、章节标记等 2026-10 补齐）。 */
const PATTERNS = [
  { name: '套话总起', re: /(?:^|[。！？\n])\s*(?:首先|其次|再次|最后|第一|第二|第三)[，,、]/gu, weight: 3 },
  { name: '总结升华', re: /(?:总而言之|总的来说|总之|说到底|归根结底|换句话说|也就是说)/gu, weight: 4 },
  { name: '抒情定论', re: /(?:在这一刻|那一刻|此时此刻|仿佛整个世界|像是全世界|也许[，,]?这就是)/gu, weight: 4 },
  { name: '不禁不由得', re: /(?:不由得|不禁|忍不住地)/gu, weight: 3 },
  { name: '程度套词', re: /(?:某种程度上|某种意义上|在某种意义上|从某种意义上说|不得不说|值得一提的是|需要注意的是)/gu, weight: 3 },
  { name: '面对受众', re: /(?:让我们一起|让我们|你会发现|你会发现到|你会发现这)/gu, weight: 3 },
  /* 二分壳：与 deslop-lint 的 BUSHI_SHELL_SRC 同口径（两半都不含逗号、必须隔逗号） */
  { name: '二分壳句式', re: /不是[^。！？!?，,\n]{1,16}[，,]\s*(?:而|却)?是[^。！？!?，,\n]{1,20}/gu, weight: 3 },
  { name: '抽象名词堆', re: /(?:命运|宿命|轮回|永恒|虚无|意义本身|存在的意义)/gu, weight: 2 },
  { name: '元叙述', re: /(?:读者|本章|前文提到|如上所述|回顾一下|伏笔|上文|下文)/gu, weight: 4 },
  /* 小说正文里冒「第X章」＝把章节结构写进叙述（元话语） */
  { name: '章节标记', re: /第[零一二三四五六七八九十百千万\d]+[章回节卷]/gu, weight: 2 },
  { name: '比喻滥用', re: /(?:仿佛|宛如|宛若|犹如|恍如|好似|好比|恰似)/gu, weight: 2 },
  { name: '口语比喻', re: /(?:就像|如同)/gu, weight: 1 },
  /* 「像…一样/似的/般」结构判定：不靠前置字排除（那会误杀「身影像雾」），
     只认比喻句式本身 —— 「图像/像话/不像」天然进不来。 */
  { name: '比喻（像…一样）', re: /像[^。！？!？\n，,]{1,12}?(?:一样|似的|般地?)/gu, weight: 1 },
  /* 夹注式破折号：插入语里出现「；：」就不算典型夹注（降低误报） */
  { name: '破折号插入', re: /——[^——\n。！？；：]{2,60}——/gu, weight: 2 },
  { name: '心理直陈', re: /(?:心里想|心想|暗自|默默地想|心中暗道|盘算着)/gu, weight: 3 },
  { name: '微表情套件', re: /(?:一丝|一抹|一缕|一阵|一种)(?:不易察觉的|淡淡的|复杂的|难以言喻的)?(?:情绪|感觉|笑意|悲哀|暖意)/gu, weight: 3 },
  { name: '感叹堆砌', re: /(?:多么|何等|何其)(?:的)?/gu, weight: 2 },
  { name: '转折连词密集', re: /(?:然而|但是|不过|却)[，,]/gu, weight: 1 },
  /* 空转搭配：说了等于没说的「万能动词」 */
  { name: '空转搭配', re: /(?:起到了?.{0,6}作用|奠定了?.{0,6}基础|使得[^。！？\n]{0,20}得以|给予了?.{0,6}支持|有着[^。！？\n]{0,10}意义)/gu, weight: 2 },
  { name: '总结式收尾', re: /(?:就这样|从此|而这[，,]?一切|一切(?:都)?(?:归于|恢复)平静|故事(?:才)?刚刚开始)[。！？]?\s*$/gu, weight: 4 },
]

/* ── 口径工具（与 deslop-lint 对齐） ─────────────────────────
 *   字数 = 去空白字符数；句长 = 句子去空白长度；段落 = 非空行（每行一段）；
 *   对白比 = 引号内去空白字数 / 总字数；短句 <15 字、长句 >40 字。 */
const CJK_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u
const QUOTE_PAIRS = { '「': '」', '『': '』', '“': '”', '‘': '’' }
const nw = (s) => String(s).replace(/\s+/gu, '')
const hasCjk = (s) => CJK_RE.test(s)

/** 引号状态机：算出对白字数与引号段数（引号不跨行；字数含引号本身，与 deslop-lint 的 nw(dialogue) 同口径）。 */
function quoteStats(text) {
  let inQuote = false
  let closeCh = null
  let dlgChars = 0
  let spans = 0
  for (const ch of String(text)) {
    if (!inQuote) {
      if (QUOTE_PAIRS[ch] !== undefined) { inQuote = true; closeCh = QUOTE_PAIRS[ch]; spans += 1; dlgChars += 1 }
      else if (ch === '"') { inQuote = true; closeCh = '"'; spans += 1; dlgChars += 1 }
      continue
    }
    if (ch === closeCh) { inQuote = false; closeCh = null; dlgChars += 1; continue }
    if (ch === '\n') { inQuote = false; closeCh = null; continue }
    if (!/\s/u.test(ch)) dlgChars += 1
  }
  return { dlgChars, spans }
}

function round(value, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/** 一段正文的全部指标。 */
function metrics(text) {
  const body = String(text ?? '')
  const chars = nw(body).length
  const sentences = body.split(/(?<=[。！？!?…])|\n+/u).map((s) => s.trim()).filter(hasCjk)
  const lengths = sentences.map((s) => nw(s).length)
  const sum = lengths.reduce((a, b) => a + b, 0)
  const avg = lengths.length === 0 ? 0 : sum / lengths.length
  const variance = lengths.length === 0 ? 0 : lengths.reduce((acc, n) => acc + (n - avg) ** 2, 0) / lengths.length
  const paragraphs = body.split(/\n+/u).map((p) => p.trim()).filter(hasCjk)
  const { dlgChars, spans } = quoteStats(body)
  const dialogueCount = spans

  const hits = []
  const byPattern = {}
  let weighted = 0
  for (const pattern of PATTERNS) {
    const found = body.match(pattern.re) ?? []
    if (found.length === 0) continue
    byPattern[pattern.name] = found.length
    weighted += found.length * pattern.weight
    hits.push({ name: pattern.name, count: found.length, samples: found.slice(0, 3) })
  }
  hits.sort((a, b) => b.count - a.count)

  const shortRatio = lengths.length === 0 ? 0 : lengths.filter((n) => n < 15).length / lengths.length
  const longRatio = lengths.length === 0 ? 0 : lengths.filter((n) => n > 40).length / lengths.length
  const dialogueRatio = chars === 0 ? 0 : Math.min(1, dlgChars / chars)

  // 结构分：长短交替 + 有对白 + 段落粒度合理（各占一部分），最多 20 分
  const structureBonus =
    (shortRatio > 0.15 && longRatio > 0.05 ? 8 : 3) +
    (dialogueRatio > 0.1 ? 7 : 2) +
    (paragraphs.length > 0 && chars / paragraphs.length < 220 ? 5 : 2)

  // 空文本直接 0 分（否则只剩结构分 → 曾经的 bug：metrics('').score = 97）；
  // 八股惩罚上限从 60 放宽到 90：命中足够多时扣得穿，能区分「轻度八股」和「通篇八股」。
  const score = chars === 0
    ? 0
    : Math.max(0, Math.min(100, Math.round(100 - Math.min(90, weighted) + structureBonus - 10)))

  return {
    chars,
    sentences: sentences.length,
    paragraphs: paragraphs.length,
    avgSentence: round(avg),
    sentenceStd: round(Math.sqrt(variance)),
    shortRatio: round(shortRatio, 3),
    longRatio: round(longRatio, 3),
    dialogueCount,
    dialogueRatio: round(dialogueRatio, 3),
    avgParagraphChars: paragraphs.length === 0 ? 0 : Math.round(paragraphs.reduce((n, p) => n + nw(p).length, 0) / paragraphs.length),
    aiHits: { total: hits.reduce((n, h) => n + h.count, 0), weighted: round(weighted), byPattern },
    aiHitList: hits,
    score,
  }
}

/** 改进前后对比：给工作台的即时反馈。 */
function compare(before, after) {
  const a = metrics(before)
  const b = metrics(after)
  return {
    before: a,
    after: b,
    delta: {
      score: b.score - a.score,
      aiHits: b.aiHits.total - a.aiHits.total,
      weighted: round(b.aiHits.weighted - a.aiHits.weighted),
      chars: b.chars - a.chars,
      avgSentence: round(b.avgSentence - a.avgSentence),
      dialogueRatio: round(b.dialogueRatio - a.dialogueRatio, 3),
    },
    removed: Object.keys(a.aiHits.byPattern).filter((k) => (b.aiHits.byPattern[k] ?? 0) < a.aiHits.byPattern[k]),
    added: Object.keys(b.aiHits.byPattern).filter((k) => (a.aiHits.byPattern[k] ?? 0) < b.aiHits.byPattern[k]),
  }
}

/**
 * 分布拟合：把"目标文本集合"的特征分布当基准，量出"待测文本集合"与它的距离。
 * 只用可解释的 5 个维度，数值越小越接近。
 * 口径与 deslop-lint 对齐（2026-10 起）：字数去空白、句长按去空白长度、短句 <15 / 长句 >40、
 * 段落按非空行、对白比 = 引号内字数占比。
 * gap 的归一化尺度 = 目标集标准差（目标自身波动越小，同样的偏差算得越重），
 * 无波动时退化为 |目标均值|×0.5，再兜底 0.1 —— 避免 base=0 时某个维度一家独大或除零。
 */
function distributionDistance(targets, samples) {
  const dims = ['avgSentence', 'sentenceStd', 'dialogueRatio', 'shortRatio', 'avgParagraphChars']
  const mean = (list, key) => (list.length === 0 ? 0 : list.reduce((n, m) => n + Number(m[key] ?? 0), 0) / list.length)
  const std = (list, key) => {
    if (list.length === 0) return 0
    const m = mean(list, key)
    return Math.sqrt(list.reduce((acc, x) => acc + (Number(x[key] ?? 0) - m) ** 2, 0) / list.length)
  }
  const targetMetrics = targets.map((t) => metrics(t))
  const sampleMetrics = samples.map((s) => metrics(s))
  const rows = dims.map((key) => {
    const base = mean(targetMetrics, key)
    const now = mean(sampleMetrics, key)
    const scale = Math.max(std(targetMetrics, key), Math.abs(base) * 0.5, 0.1)
    return { key, target: round(base), sample: round(now), gap: round((now - base) / scale, 3) }
  })
  const distance = round(
    rows.reduce((sum, row) => sum + Math.abs(row.gap), 0) / Math.max(1, rows.length),
    3,
  )
  return { distance, rows, targets: targetMetrics.length, samples: sampleMetrics.length }
}
  return { metrics, compare, distributionDistance, PATTERNS };
})();

/* ── module: rules (core/rules.mjs) ───────────────────────────── */
__m.rules = (() => {
  const { ContractError, readJson, statOf, updateJsonFile, writeGuarded } = __m.contracts;
/**
 * 文风实验室 · 候选规则库（rules）
 *
 * 规则来自两条路：①「文风实验室」预设对语料做自我总结（LLM 产出 JSON）；
 * ② 工作台改进稿的差异归纳。这里负责**存 / 版本化 / 采纳与否决 / 转成酒馆增强模块**。
 *
 * 落点：`<labRoot>/data/rules/<bucket>.json`
 *   { bucket, updatedAt, versions: [ { at, source, note, rules: [ … ] } ] }
 * 每条规则：{ id, name, rule, bad, good, check, evidence[], confidence, status, enabled }
 *   status: candidate | accepted | rejected    enabled: 是否进增强模块
 */





const RULE_PREFIX = '✨增强丨文风·'

function root(labRoot) {
  return join(labRoot, 'data', 'rules')
}

function fileOf(labRoot, bucket) {
  const safe = String(bucket).replace(/[^A-Za-z0-9._\u4e00-\u9fff-]/gu, '_')
  return join(root(labRoot), `${safe}.json`)
}

/** 规则 id：名字 + 正文的短 hash（稳定、可复现）。 */
function ruleId(rule) {
  return createHash('sha1').update(`${rule?.name ?? ''}|${rule?.rule ?? ''}`, 'utf8').digest('hex').slice(0, 12)
}

/** 把一条规则渲染成酒馆增强模块的正文（三件套 + 证据）。 */
function ruleToContent(rule) {
  const lines = []
  lines.push(String(rule.rule ?? '').trim())
  if (rule.bad) lines.push('', `违反示例 → 正确示例`, `- 违反：${String(rule.bad).trim()}`, `- 正确：${String(rule.good ?? '').trim()}`)
  else if (rule.good) lines.push('', `正确示例：${String(rule.good).trim()}`)
  if (rule.check) lines.push('', `判定：${String(rule.check).trim()}`)
  if (Array.isArray(rule.evidence) && rule.evidence.length > 0) {
    lines.push('', `证据：${rule.evidence.slice(0, 3).map((e) => `「${String(e).slice(0, 20)}」`).join(' ')}`)
  }
  return lines.join('\n')
}

/** 采纳且启用的规则 → 酒馆模块数组。 */
function rulesToModules(rules) {
  return (rules ?? [])
    .filter((r) => r.status === 'accepted' && r.enabled !== false)
    .map((r) => ({ name: r.name?.startsWith(RULE_PREFIX) ? r.name : RULE_PREFIX + String(r.name ?? '未命名'), content: ruleToContent(r), enabled: true }))
}

function normalizeRule(input) {
  const rule = {
    name: String(input?.name ?? '').trim(),
    rule: String(input?.rule ?? '').trim(),
    bad: String(input?.bad ?? '').trim(),
    good: String(input?.good ?? '').trim(),
    check: String(input?.check ?? '').trim(),
    evidence: Array.isArray(input?.evidence) ? input.evidence.map(String).slice(0, 5) : [],
    confidence: Number.isFinite(Number(input?.confidence)) ? Number(input.confidence) : 0.5,
    status: ['candidate', 'accepted', 'rejected'].includes(input?.status) ? input.status : 'candidate',
    enabled: input?.enabled !== false,
  }
  if (rule.name === '') rule.name = RULE_PREFIX + '未命名'
  if (!rule.name.startsWith(RULE_PREFIX)) rule.name = RULE_PREFIX + rule.name
  rule.id = ruleId(rule)
  return rule
}

/** 读一个桶（不存在返回空骨架）。 */
function readBucket(labRoot, bucket) {
  const file = fileOf(labRoot, bucket)
  const doc = readJson(file, undefined)
  if (doc === undefined) {
    return { bucket, file, exists: false, mtimeMs: null, versions: [], current: [], counts: { candidate: 0, accepted: 0, rejected: 0 } }
  }
  const versions = Array.isArray(doc.versions) ? doc.versions : []
  const current = versions.length === 0 ? [] : versions[versions.length - 1].rules ?? []
  const counts = { candidate: 0, accepted: 0, rejected: 0 }
  for (const r of current) counts[r.status] = (counts[r.status] ?? 0) + 1
  return { bucket, file, exists: true, mtimeMs: statOf(file).mtimeMs, versions, current, counts }
}

/** 列所有桶（摘要）。 */
function listBuckets(labRoot) {
  let names = []
  try {
    names = readdirSync(root(labRoot)).filter((n) => n.endsWith('.json'))
  } catch {
    return []
  }
  return names.map((n) => readBucket(labRoot, n.replace(/\.json$/u, ''))).map((b) => ({
    bucket: b.bucket,
    versions: b.versions.length,
    counts: b.counts,
    latest: b.versions.length === 0 ? 0 : b.versions[b.versions.length - 1].at ?? 0,
    rules: b.current.map((r) => ({ id: r.id, name: r.name, status: r.status, enabled: r.enabled, confidence: r.confidence })),
  }))
}

function ensureDoc(labRoot, bucket) {
  const file = fileOf(labRoot, bucket)
  mkdirSync(root(labRoot), { recursive: true })
  const existing = readJson(file, undefined)
  if (existing !== undefined) return { file, doc: existing }
  const doc = { bucket, updatedAt: Date.now(), versions: [] }
  // 文件首次创建：没有原文件可备份，用 writeGuarded 的空守卫路径（expectedMtimeMs=null）
  writeGuarded({ file, text: JSON.stringify(doc, null, 1) + '\n', labRoot, label: `rules-${bucket}-init`, json: true, expectedMtimeMs: null })
  return { file, doc }
}

/** 追加一个版本（新规则合并进"当前"视图；同名保留已有 status/enabled）。 */
function addCandidates(labRoot, bucket, incoming, meta = {}) {
  const { file } = ensureDoc(labRoot, bucket)
  const before = readBucket(labRoot, bucket)
  const byName = new Map(before.current.map((r) => [r.name, r]))
  const added = []
  const kept = []
  for (const raw of incoming ?? []) {
    const rule = normalizeRule(raw)
    const existing = byName.get(rule.name)
    if (existing !== undefined) {
      kept.push(rule.name)
      continue
    }
    byName.set(rule.name, rule)
    added.push(rule.name)
  }
  const rules = [...byName.values()]
  const result = updateJsonFile({
    file,
    labRoot,
    label: `rules-${bucket}`,
    mutate: (doc) => {
      const versions = Array.isArray(doc.versions) ? doc.versions : []
      versions.push({ at: Date.now(), source: String(meta.source ?? 'manual'), note: String(meta.note ?? ''), rules })
      doc.versions = versions
      doc.updatedAt = Date.now()
      return doc
    },
  })
  return { file, added, kept, rules, backup: result.backup }
}

/** 改一条规则（状态/启用/正文/名字）。 */
function updateRule(labRoot, bucket, id, patch) {
  const { file } = ensureDoc(labRoot, bucket)
  let found = null
  const result = updateJsonFile({
    file,
    labRoot,
    label: `rules-${bucket}-update`,
    mutate: (doc) => {
      const versions = Array.isArray(doc.versions) ? doc.versions : []
      const latest = versions[versions.length - 1]
      if (latest === undefined) throw new ContractError('NOT_FOUND', '该桶还没有任何版本')
      latest.rules = (latest.rules ?? []).map((r) => {
        if (r.id !== id) return r
        const next = { ...r }
        if (['candidate', 'accepted', 'rejected'].includes(patch?.status)) next.status = patch.status
        if (typeof patch?.enabled === 'boolean') next.enabled = patch.enabled
        if (typeof patch?.rule === 'string') next.rule = patch.rule
        if (typeof patch?.bad === 'string') next.bad = patch.bad
        if (typeof patch?.good === 'string') next.good = patch.good
        if (typeof patch?.check === 'string') next.check = patch.check
        if (typeof patch?.name === 'string' && patch.name.trim() !== '') {
          next.name = patch.name.startsWith(RULE_PREFIX) ? patch.name : RULE_PREFIX + patch.name
        }
        found = next
        return next
      })
      doc.updatedAt = Date.now()
      return doc
    },
  })
  if (found === null) throw new ContractError('NOT_FOUND', `找不到规则 ${id}`)
  return { rule: found, backup: result.backup }
}

/** 删除一条规则（从"当前"版本移除；旧版本仍在，可回滚）。 */
function removeRule(labRoot, bucket, id) {
  const { file } = ensureDoc(labRoot, bucket)
  let removed = null
  const result = updateJsonFile({
    file,
    labRoot,
    label: `rules-${bucket}-remove`,
    mutate: (doc) => {
      const versions = Array.isArray(doc.versions) ? doc.versions : []
      const latest = versions[versions.length - 1]
      if (latest === undefined) throw new ContractError('NOT_FOUND', '该桶还没有任何版本')
      const before = latest.rules ?? []
      latest.rules = before.filter((r) => {
        if (r.id === id) {
          removed = r
          return false
        }
        return true
      })
      doc.updatedAt = Date.now()
      return doc
    },
  })
  if (removed === null) throw new ContractError('NOT_FOUND', `找不到规则 ${id}`)
  return { removed, backup: result.backup }
}

/** 版本对照：两个版本之间新增/删除/改动的规则。 */
function compareVersions(labRoot, bucket, indexA, indexB) {
  const view = readBucket(labRoot, bucket)
  const a = view.versions[indexA]
  const b = view.versions[indexB]
  if (a === undefined || b === undefined) throw new ContractError('NOT_FOUND', '版本序号越界')
  const mapA = new Map((a.rules ?? []).map((r) => [r.name, r]))
  const mapB = new Map((b.rules ?? []).map((r) => [r.name, r]))
  const addedNames = [...mapB.keys()].filter((n) => !mapA.has(n))
  const removedNames = [...mapA.keys()].filter((n) => !mapB.has(n))
  const changed = [...mapB.keys()].filter((n) => mapA.has(n) && dataOf(mapB.get(n)) !== dataOf(mapA.get(n)))
  return {
    from: { index: indexA, at: a.at, source: a.source, count: (a.rules ?? []).length },
    to: { index: indexB, at: b.at, source: b.source, count: (b.rules ?? []).length },
    added: addedNames.map((n) => mapB.get(n).name),
    removed: removedNames.map((n) => mapA.get(n).name),
    changed: changed.map((n) => ({ name: n, from: mapA.get(n), to: mapB.get(n) })),
  }
}

function dataOf(rule) {
  return JSON.stringify({ rule: rule.rule, bad: rule.bad, good: rule.good, check: rule.check, status: rule.status, enabled: rule.enabled })
}

/** 导出"已采纳+启用"的模块（发布通道 / 增强层写入用）。 */
function acceptedModules(labRoot, bucket) {
  return rulesToModules(readBucket(labRoot, bucket).current)
}
  return { ruleId, ruleToContent, rulesToModules, readBucket, listBuckets, addCandidates, updateRule, removeRule, compareVersions, acceptedModules, RULE_PREFIX, existsSync };
})();

/* ── module: improvements (core/improvements.mjs) ───────────────────────────── */
__m.improvements = (() => {
  const { ContractError, readJson, statOf, atomicWrite, backupFile } = __m.contracts;
  const { compare } = __m.score;
/**
 * 文风实验室 · 改进工作台存储（improvements）
 *
 * 存"你在插件里改出来的版本"——教学信号最强的一类语料。
 * 落点：`<labRoot>/data/improvements/<sessionId>/<seq>.json`
 *   { sessionId, seq, turn, step, original, improved, tags[], note, at,
 *     beforeScore, afterScore, pushedToTavern }
 *
 * 注意：**绝不回写会话日志**（append-only 多帧 zstd，回写会毁档）。
 * 只有"推送到酒馆显示层"是可选动作，且写的是酒馆自己的 edited-messages.json（带备份）。
 */





const TAGS = ['八股', 'AI味', '出戏', '抢话', '视角越界', '太长', '重复', '结尾升华', '节奏', '用词']

function root(labRoot) {
  return join(labRoot, 'data', 'improvements')
}

function sessionDir(labRoot, sessionId) {
  return join(root(labRoot), String(sessionId).replace(/[^A-Za-z0-9._-]/gu, '_'))
}

function fileOf(labRoot, sessionId, seq) {
  return join(sessionDir(labRoot, sessionId), `${String(seq)}.json`)
}

/** 保存（或覆盖）一条改进。同 seq 覆盖前先备份。 */
function save(labRoot, payload) {
  const sessionId = String(payload?.sessionId ?? '').trim()
  const seq = Number(payload?.seq)
  const improved = String(payload?.improved ?? '')
  if (sessionId === '') throw new ContractError('INVALID', '缺少 sessionId')
  if (!Number.isFinite(seq)) throw new ContractError('INVALID', '缺少 seq（模型消息序号）')
  if (improved.trim() === '') throw new ContractError('INVALID', '改进正文为空')

  const original = String(payload?.original ?? '')
  const diff = compare(original, improved)
  const tags = Array.isArray(payload?.tags) ? payload.tags.map(String).filter((t) => TAGS.includes(t)) : []

  const dir = sessionDir(labRoot, sessionId)
  mkdirSync(dir, { recursive: true })
  const file = fileOf(labRoot, sessionId, seq)
  const before = statOf(file)
  if (before.exists) backupFile(file, labRoot, 'improvement')

  const record = {
    sessionId,
    seq,
    turn: Number.isFinite(Number(payload?.turn)) ? Number(payload.turn) : null,
    step: Number.isFinite(Number(payload?.step)) ? Number(payload.step) : null,
    original,
    improved,
    tags,
    note: String(payload?.note ?? ''),
    at: Date.now(),
    beforeScore: diff.before.score,
    afterScore: diff.after.score,
    delta: diff.delta,
    pushedToTavern: payload?.pushedToTavern === true,
  }
  atomicWrite(file, JSON.stringify(record, null, 1) + '\n')
  return { record, file, diff }
}

/** 读一条。 */
function get(labRoot, sessionId, seq) {
  return readJson(fileOf(labRoot, sessionId, seq), undefined)
}

/** 删除一条（可回滚：删前备份）。 */
function remove(labRoot, sessionId, seq) {
  const file = fileOf(labRoot, sessionId, seq)
  if (!existsSync(file)) throw new ContractError('NOT_FOUND', '该改进不存在')
  const backup = backupFile(file, labRoot, 'improvement-remove')
  rmSync(file, { force: true })
  return { removed: file, backup }
}

/** 列一条会话的改进。 */
function listForSession(labRoot, sessionId) {
  const dir = sessionDir(labRoot, sessionId)
  let names = []
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  const out = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    const record = readJson(join(dir, name), undefined)
    if (record !== undefined) out.push(record)
  }
  return out.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
}

/** 全量列举（列表页用，只给摘要以免过大）。 */
function listAll(labRoot, options = {}) {
  const withText = options.withText === true
  const base = root(labRoot)
  let sessions = []
  try {
    sessions = readdirSync(base)
  } catch {
    return { sessions: [], total: 0 }
  }
  const out = []
  let total = 0
  for (const session of sessions) {
    const records = listForSession(labRoot, session)
    if (records.length === 0) continue
    total += records.length
    out.push({
      sessionId: session,
      count: records.length,
      avgDelta: Math.round(records.reduce((n, r) => n + (r.delta?.score ?? 0), 0) / records.length),
      tags: [...new Set(records.flatMap((r) => r.tags ?? []))],
      latest: Math.max(...records.map((r) => r.at ?? 0)),
      items: withText
        ? records
        : records.map((r) => ({
            seq: r.seq,
            turn: r.turn,
            step: r.step,
            tags: r.tags,
            note: r.note,
            at: r.at,
            beforeScore: r.beforeScore,
            afterScore: r.afterScore,
            delta: r.delta,
            chars: { original: (r.original ?? '').length, improved: (r.improved ?? '').length },
          })),
    })
  }
  out.sort((a, b) => b.latest - a.latest)
  return { sessions: out, total }
}

/** 汇总：最常被消灭的八股类型、平均提升、标签分布（比对页用）。 */
function aggregate(labRoot) {
  const all = listAll(labRoot, { withText: true }).sessions.flatMap((s) => s.items)
  const removed = new Map()
  const added = new Map()
  const byTag = new Map()
  let scoreDelta = 0
  for (const record of all) {
    const diff = compare(record.original, record.improved)
    for (const name of diff.removed) {
      const deltaCount = (diff.before.aiHits.byPattern[name] ?? 0) - (diff.after.aiHits.byPattern[name] ?? 0)
      removed.set(name, (removed.get(name) ?? 0) + deltaCount)
    }
    for (const name of diff.added) added.set(name, (added.get(name) ?? 0) + 1)
    for (const tag of record.tags ?? []) byTag.set(tag, (byTag.get(tag) ?? 0) + 1)
    scoreDelta += diff.delta.score
  }
  const sortDesc = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }))
  return {
    improvements: all.length,
    scoreDeltaAvg: all.length === 0 ? 0 : Math.round(scoreDelta / all.length),
    removedPatterns: sortDesc(removed).slice(0, 12),
    addedPatterns: sortDesc(added).slice(0, 8),
    byTag: sortDesc(byTag),
  }
}

/** 把一条改进导出成 Markdown（放进 lab 的 out/ 作为成果）。 */
function exportMarkdown(labRoot, record) {
  const diff = compare(record.original ?? '', record.improved ?? '')
  const lines = [
    `# 改进记录 · seq ${record.seq}（turn ${record.turn ?? '?'} / step ${record.step ?? '?'}）`,
    '',
    `- 标签：${(record.tags ?? []).join('、') || '（无）'}`,
    `- 批注：${record.note || '（无）'}`,
    `- 分数：${diff.before.score} → ${diff.after.score}（Δ${diff.delta.score}）`,
    `- 八股命中：${diff.before.aiHits.total} → ${diff.after.aiHits.total}（Δ${diff.delta.aiHits}）`,
    `- 消灭的类型：${diff.removed.join('、') || '（无）'}`,
    '',
    '## 模型原文',
    '',
    '```text',
    record.original ?? '',
    '```',
    '',
    '## 你的改进',
    '',
    '```text',
    record.improved ?? '',
    '```',
    '',
  ]
  const dir = join(labRoot, 'lab-workspace', 'out', 'reports')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `improvement-${record.sessionId}-${record.seq}.md`)
  writeFileSync(file, lines.join('\n'), 'utf8')
  return file
}
  return { save, get, remove, listForSession, listAll, aggregate, exportMarkdown, TAGS };
})();

/* ── module: publish (core/publish.mjs) ───────────────────────────── */
__m.publish = (() => {
  const { ContractError } = __m.contracts;
  const { LAB_PRESET_ID, isProtectedName, moduleStats, readPreset, writePreset } = __m.tavern;
/**
 * 文风实验室 · 发布通道（publish）
 *
 * 方向只有一个：**实验室预设（staging） → 目标预设（production）**，永不反向。
 * 目标预设只接收「实验室里已存在的、非受保护的」模块；实验室草稿不自动同步，
 * 必须由你在面板点"发布"，且发布前能看到预演差异（新增/覆盖/跳过/不变）。
 *
 * 所有写入都走 tavern.writePreset（备份 + mtime 守卫 + 原子 + 回读校验 + 受保护加锁）。
 */



/** 我们自己的模块前缀（默认只发布这类，避免把内置模块搬来搬去）。 */
const PUBLISH_PREFIX = '✨增强丨'

/** 收集实验室预设里可发布的模块（默认只收 ✨增强丨 前缀）。 */
function publishableModules(labRoot, options = {}) {
  const lab = readPreset(LAB_PRESET_ID)
  const all = options.all === true
  const out = []
  for (const group of lab.groups) {
    for (const module of group.modules) {
      if (!all && !String(module.name).startsWith(PUBLISH_PREFIX)) continue
      if (isProtectedName(module.name)) continue
      out.push({ group: group.name, name: module.name, content: module.content, enabled: module.enabled !== false })
    }
  }
  return { modules: out, stats: lab.stats, labDir: lab.dir }
}

/**
 * 预演：把实验室模块发布到目标预设会发生什么（**不写任何文件**）。
 */
function preview(labRoot, targetDirs, options = {}) {
  const source = publishableModules(labRoot, options)
  const overwrite = options.overwrite === true
  const plan = []
  for (const dir of targetDirs) {
    const target = readPreset(dir)
    const byName = new Map()
    for (const group of target.groups) for (const module of group.modules) byName.set(module.name, module)
    const rows = source.modules.map((module) => {
      const existing = byName.get(module.name)
      let action = 'add'
      if (existing !== undefined) {
        if (isProtectedName(existing.name)) action = 'skip-protected'
        else if (existing.content === module.content) action = 'unchanged'
        else action = overwrite ? 'overwrite' : 'skip-exists'
      }
      return {
        name: module.name,
        action,
        chars: module.content.length,
        existingChars: existing === undefined ? null : String(existing.content ?? '').length,
      }
    })
    const addChars = rows.filter((r) => r.action === 'add').reduce((n, r) => n + r.chars, 0)
    const overwriteChars = rows.filter((r) => r.action === 'overwrite').reduce((n, r) => n + r.chars, 0)
    plan.push({
      dir,
      target: { id: target.dir, file: target.file, exists: target.exists, stats: target.stats, mtimeMs: target.mtimeMs },
      rows,
      summary: {
        add: rows.filter((r) => r.action === 'add').length,
        overwrite: rows.filter((r) => r.action === 'overwrite').length,
        unchanged: rows.filter((r) => r.action === 'unchanged').length,
        skipped: rows.filter((r) => r.action.startsWith('skip')).length,
        charsDelta: addChars + overwriteChars,
      },
    })
  }
  return { source: { modules: source.modules.length, stats: source.stats }, overwrite, plan }
}

/**
 * 执行发布：把实验室模块并入每个目标预设（按名字合并；同名按 overwrite 决定覆盖与否）。
 * @returns {{results: Array, backups: Array}}
 */
function apply(labRoot, targetDirs, options = {}) {
  const overwrite = options.overwrite === true
  const expected = options.expectedMtime ?? {}
  const source = publishableModules(labRoot, options)
  if (source.modules.length === 0) throw new ContractError('INVALID', '实验室预设里没有可发布的模块（默认只发布 ✨增强丨 前缀）')

  const results = []
  for (const dir of targetDirs) {
    const target = readPreset(dir)
    const groups = target.groups.map((group) => ({ name: group.name, collapsed: group.collapsed, modules: group.modules.map((m) => ({ name: m.name, content: m.content, enabled: m.enabled })) }))
    if (groups.length === 0) groups.push({ name: '通用增强', modules: [] })
    const primary = groups[0]
    const indexByName = new Map()
    for (const group of groups) for (const module of group.modules) if (!indexByName.has(module.name)) indexByName.set(module.name, module)

    let added = 0
    let overwritten = 0
    let skipped = 0
    for (const module of source.modules) {
      const existing = indexByName.get(module.name)
      if (existing === undefined) {
        primary.modules.push({ name: module.name, content: module.content, enabled: module.enabled })
        added += 1
        continue
      }
      if (isProtectedName(existing.name)) {
        skipped += 1
        continue
      }
      if (existing.content === module.content) continue
      if (!overwrite) {
        skipped += 1
        continue
      }
      existing.content = module.content
      overwritten += 1
    }

    const mtime = expected[dir] === undefined ? target.mtimeMs : expected[dir]
    const written = writePreset(dir, groups, { expectedMtimeMs: mtime })
    results.push({
      dir,
      file: target.file,
      added,
      overwritten,
      skipped,
      stats: written.stats,
      backup: written.backup,
      templateVars: written.templateVars,
    })
  }
  return { results, source: { modules: source.modules.length, stats: source.stats } }
}

/** 实验室自身增强层的模块统计（面板展示 token 预算用）。 */
function labStats() {
  const lab = readPreset(LAB_PRESET_ID)
  return { dir: lab.dir, exists: lab.exists, stats: moduleStats(lab.groups), groups: lab.groups.length }
}
  return { publishableModules, preview, apply, labStats, PUBLISH_PREFIX };
})();

/* ── module: replay (core/replay.mjs) ───────────────────────────── */
__m.replay = (() => {
  const { ContractError, atomicWrite, backupFile, readJson, statOf, writeGuarded } = __m.contracts;
  const { estimateTokens, isProtectedName, readPreset } = __m.tavern;
  const { metrics, distributionDistance } = __m.score;
  const { listSessions, readSession } = __m.sessions;
/**
 * 文风实验室 · A/B 回放（replay）
 *
 * 目的：用**固定夹具场景**对同一模型跑两臂（A = 不带增强块 / B = 带增强块），
 * 用同一个评分器对比，直接量出"增强模块是否让输出更像你要的样子"。
 *
 * 审核决策（2026-09-26 锁定 #4）：**允许真实 API，但限量**——
 *   默认每次 ≤10 次调用（两臂各 ≤5），跑前给成本预估，额度可在页面调（硬上限 20 次）。
 *
 * 安全边界：
 *   - 只有用户在界面点「执行」且带 confirm:true 才会真调模型；
 *   - 夹具 / 结果都落在插件自己的 data/ 下（带备份的原子写）；
 *   - 会话只读（夹具"从会话抓场景"只抽 user 消息当场景 prompt，不抽正文做学习）。
 *
 * 模型调用面（DSH 平台服务，不直连任何厂商 SDK）：
 *   services.callModel?: 自定义调用（测试注入）；
 *   否则用 services.llm.stream()（`ctx.get('llm')`）+ services.defaultModel（默认模型选择）。
 */







const DEFAULT_MAX_CALLS = 10
const HARD_MAX_CALLS = 20
const DEFAULT_MAX_TOKENS = 600
const DEFAULT_TEMPERATURE = 0.9
const CALL_TIMEOUT_MS = 90_000
const MODULE_BLOCK_CHAR_CAP = 2000
const SCENE_CHARS_CAP = 2000

/* ────────────────────────── 夹具（fixtures） ────────────────────────── */

function fixturesDir(labRoot) {
  return join(labRoot, 'data', 'fixtures')
}

function replaysDir(labRoot) {
  return join(labRoot, 'data', 'replays')
}

function safeName(text) {
  return String(text ?? '').replace(/[^A-Za-z0-9._\u4e00-\u9fff-]/gu, '_').slice(0, 60) || 'untitled'
}

/** 场景规整：{id, title, system, prompt}。prompt 为空的场景丢弃。 */
function normalizeScene(input, index = 0) {
  const prompt = String(input?.prompt ?? '').trim()
  return {
    id: String(input?.id ?? `scene-${index + 1}`),
    title: String(input?.title ?? `场景 ${index + 1}`).trim() || `场景 ${index + 1}`,
    system: String(input?.system ?? '').trim(),
    prompt: prompt.slice(0, SCENE_CHARS_CAP),
  }
}

function readFixtures(labRoot, target) {
  const key = safeName(target)
  const file = join(fixturesDir(labRoot), `${key}.json`)
  const doc = readJson(file, undefined)
  const scenes = Array.isArray(doc?.scenes) ? doc.scenes.map(normalizeScene).filter((s) => s.prompt !== '') : []
  return { target: key, file, exists: doc !== undefined, mtimeMs: statOf(file).mtimeMs, scenes, updatedAt: doc?.updatedAt ?? null }
}

function writeFixtures(labRoot, target, scenes, options = {}) {
  const key = safeName(target)
  const file = join(fixturesDir(labRoot), `${key}.json`)
  mkdirSync(fixturesDir(labRoot), { recursive: true })
  const normalized = (Array.isArray(scenes) ? scenes : []).map(normalizeScene).filter((s) => s.prompt !== '')
  if (normalized.length === 0) throw new ContractError('INVALID', '夹具至少要有一个带 prompt 的场景')
  if (normalized.length > 20) throw new ContractError('INVALID', '夹具最多 20 个场景')
  const text = JSON.stringify({ target: key, updatedAt: Date.now(), scenes: normalized }, null, 1) + '\n'
  const result = writeGuarded({ file, text, labRoot, label: `fixtures-${key}`, json: true, expectedMtimeMs: options.expectedMtimeMs ?? statOf(file).mtimeMs })
  return { ...result, target: key, scenes: normalized }
}

/**
 * 从最近会话"抓场景"（只抽 **user 消息**当场景 prompt；不抽 assistant 正文）。
 * 用途：给夹具提供"真实场景原点"，省得手写；抓完仍可在页面逐条改。
 */
function extractScenesFromSessions(labRoot, options = {}) {
  const bucket = String(options.bucket ?? '').trim()
  const limit = Math.min(10, Math.max(1, Number(options.limit ?? 5) || 5))
  if (bucket === '') throw new ContractError('INVALID', '缺少 bucket（预设 id）')
  const list = listSessions({ limit: 200, onlyAllowed: true })
  const picked = []
  const seen = new Set()
  for (const session of list.sessions) {
    if (session.preset !== bucket) continue
    let full
    try {
      full = readSession(session.dir, session.file)
    } catch {
      continue
    }
    for (const turn of full.turns) {
      const text = String(turn.user ?? '').trim()
      if (text.length < 20) continue
      const prompt = text.slice(0, SCENE_CHARS_CAP)
      const stamp = prompt.slice(0, 24)
      if (seen.has(stamp)) continue
      seen.add(stamp)
      picked.push(normalizeScene({ id: `scene-${picked.length + 1}`, title: `场景${picked.length + 1}·${session.sessionId.slice(8, 16)}`, prompt }, picked.length))
      if (picked.length >= limit) break
    }
    if (picked.length >= limit) break
  }
  return { bucket, scenes: picked, scanned: list.sessions.filter((s) => s.preset === bucket).length }
}

/* ────────────────────────── 增强块与两臂 ────────────────────────── */

/** 从一个预设的增强层取"启用且非受保护"模块拼成注入块（超出上限截断）。 */
function buildModuleBlock(labRoot, presetDir) {
  const preset = readPreset(presetDir)
  const parts = []
  let chars = 0
  for (const group of preset.groups) {
    for (const m of group.modules) {
      if (m.enabled === false) continue
      if (isProtectedName(m.name)) continue
      const piece = `【${m.name}】\n${m.content}`
      if (chars + piece.length > MODULE_BLOCK_CHAR_CAP) {
        parts.push(piece.slice(0, Math.max(0, MODULE_BLOCK_CHAR_CAP - chars)))
        chars = MODULE_BLOCK_CHAR_CAP
        break
      }
      parts.push(piece)
      chars += piece.length
    }
    if (chars >= MODULE_BLOCK_CHAR_CAP) break
  }
  return { dir: presetDir, exists: preset.exists, block: parts.join('\n\n'), chars, truncated: chars >= MODULE_BLOCK_CHAR_CAP }
}

/** 两臂 prompt 组装：A 不带增强块，B 把增强块拼进 system（位置稳定、可审计）。 */
function buildArms(scene, moduleBlock) {
  const base = scene.system
  return {
    a: { system: base, prompt: scene.prompt },
    b: {
      system: base === '' ? `【增强模块】\n${moduleBlock}` : `${base}\n\n【增强模块】\n${moduleBlock}`,
      prompt: scene.prompt,
    },
  }
}

/** 调用计划：两臂配对、限量（默认 10 次 / 硬上限 20 次）。 */
function planReplay(options = {}) {
  const requested = Number(options.maxCalls ?? DEFAULT_MAX_CALLS)
  const maxCalls = Math.min(HARD_MAX_CALLS, Math.max(2, Number.isFinite(requested) ? Math.floor(requested) : DEFAULT_MAX_CALLS))
  const perArm = Math.floor(maxCalls / 2)
  const scenes = (Array.isArray(options.scenes) ? options.scenes : []).map(normalizeScene).filter((s) => s.prompt !== '')
  const chosen = scenes.slice(0, perArm)
  return {
    maxCalls,
    perArm,
    scenes: chosen,
    calls: chosen.length * 2,
    skipped: Math.max(0, scenes.length - chosen.length),
    hardCap: HARD_MAX_CALLS,
  }
}

/** 成本预估：token 用粗估（中文 ~1.5 字/token），价格由调用方填（0 = 只报 token）。 */
function estimateReplay(options = {}) {
  const plan = planReplay(options)
  const moduleBlock = typeof options.moduleBlock === 'string' ? options.moduleBlock : ''
  const maxTokens = Math.max(64, Number(options.maxTokens ?? DEFAULT_MAX_TOKENS) || DEFAULT_MAX_TOKENS)
  const rows = []
  let estInputTokens = 0
  for (const scene of plan.scenes) {
    const arms = buildArms(scene, moduleBlock)
    const inputA = estimateTokens(arms.a.system.length + arms.a.prompt.length) + 24
    const inputB = estimateTokens(arms.b.system.length + arms.b.prompt.length) + 24
    estInputTokens += inputA + inputB
    rows.push({ id: scene.id, title: scene.title, inputA, inputB })
  }
  const estOutputTokens = plan.calls * maxTokens
  const priceInput = Number(options.priceInput ?? 0) || 0
  const priceOutput = Number(options.priceOutput ?? 0) || 0
  const cost = priceInput > 0 || priceOutput > 0
    ? {
        currency: '（按你填的单价）',
        input: round2((estInputTokens / 1e6) * priceInput),
        output: round2((estOutputTokens / 1e6) * priceOutput),
        total: round2((estInputTokens / 1e6) * priceInput + (estOutputTokens / 1e6) * priceOutput),
        pricePerMillion: { input: priceInput, output: priceOutput },
      }
    : null
  return {
    plan,
    rows,
    estInputTokens,
    estOutputTokens,
    estTotalTokens: estInputTokens + estOutputTokens,
    maxTokensPerCall: maxTokens,
    cost,
  }
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100
}

/* ────────────────────────── 执行 ────────────────────────── */

/** 默认调用实现：DSH 平台 llm 服务（流式），拿满文本 + 真实用量。 */
function makeLlmCallModel(services) {
  const llm = services?.llm
  if (!llm || typeof llm.stream !== 'function') return null
  return async function callModel(req) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS)
    try {
      const textParts = []
      let usage = null
      let finish = null
      const stream = llm.stream({
        provider: req.provider,
        model: req.model,
        system: req.system,
        messages: [{ role: 'user', content: [{ type: 'text', text: req.prompt }] }],
        temperature: req.temperature,
        maxTokens: req.maxTokens,
        signal: controller.signal,
      })
      for await (const chunk of stream) {
        if (chunk == null) continue
        if (chunk.type === 'text-delta') textParts.push(String(chunk.text ?? ''))
        else if (chunk.type === 'usage') usage = chunk.usage
        else if (chunk.type === 'finish') finish = chunk.reason
      }
      if (finish && typeof finish === 'object' && (finish.kind === 'error' || finish.kind === 'aborted')) {
        const message = finish.failure?.message ?? finish.kind
        throw new Error(`模型调用未完成（${finish.kind}）：${message}`)
      }
      return { text: textParts.join(''), usage }
    } finally {
      clearTimeout(timer)
    }
  }
}

/** 解析本轮用的模型：请求显式值优先，否则取 DSH 默认模型选择。 */
function resolveModel(options, services) {
  let selection = null
  try {
    selection = services?.defaultModel?.currentSelection?.() ?? null
  } catch {
    selection = null
  }
  return {
    provider: String(options?.provider ?? selection?.provider ?? '') || null,
    model: String(options?.model ?? selection?.model ?? '') || null,
  }
}

/**
 * 跑一轮 A/B 回放。只有传入 `options.confirm === true` 才执行（路由层也再挡一道）。
 * @param services {callModel?|llm?+defaultModel?}
 */
async function runReplay(labRoot, options = {}, services = {}) {
  if (options?.confirm !== true) throw new ContractError('INVALID', '未确认执行（需要 confirm: true）')
  const callModel = typeof services?.callModel === 'function' ? services.callModel : makeLlmCallModel(services)
  if (callModel === null) throw new ContractError('UNAVAILABLE', 'llm 服务不可用（宿主没有 ctx.get("llm")，或未在插件上下文）')

  const target = safeName(options.target)
  const moduleSource = buildModuleBlock(labRoot, options.modulesPreset ?? 'style-lab')
  const plan = planReplay({ scenes: options.scenes, maxCalls: options.maxCalls })
  if (plan.scenes.length === 0) throw new ContractError('INVALID', '没有可跑的场景（先保存夹具或抓取场景）')

  const model = resolveModel(options, services)
  if (model.provider === null || model.model === null) throw new ContractError('INVALID', '未能确定模型（请在请求里显式给 provider / model）')

  const temperature = Number.isFinite(Number(options.temperature)) ? Number(options.temperature) : DEFAULT_TEMPERATURE
  const maxTokens = Math.max(64, Number(options.maxTokens ?? DEFAULT_MAX_TOKENS) || DEFAULT_MAX_TOKENS)

  const startedAt = Date.now()
  const rows = []
  for (const scene of plan.scenes) {
    const arms = buildArms(scene, moduleSource.block)
    const row = { id: scene.id, title: scene.title, a: await callArm(callModel, arms.a, { model, temperature, maxTokens }), b: await callArm(callModel, arms.b, { model, temperature, maxTokens }) }
    row.delta = {
      score: row.b.score - row.a.score,
      aiHits: row.b.aiHits - row.a.aiHits,
      weighted: round2(row.b.weighted - row.a.weighted),
    }
    rows.push(row)
  }

  const armStats = (key) => {
    const list = rows.map((r) => r[key])
    const avg = (fn) => (list.length === 0 ? 0 : round2(list.reduce((n, r) => n + fn(r), 0) / list.length))
    const usageTokens = (r) => {
      const u = r.usage
      if (u === null || u === undefined) return 0
      return Number(u.totalTokens ?? 0) || (Number(u.inputTokens ?? 0) + Number(u.outputTokens ?? 0))
    }
    return {
      avgScore: avg((r) => r.score),
      avgAiHits: avg((r) => r.aiHits),
      avgWeighted: avg((r) => r.weighted),
      avgChars: avg((r) => r.chars),
      avgSentence: avg((r) => r.avgSentence),
      avgDialogueRatio: avg((r) => r.dialogueRatio),
      tokens: list.reduce((n, r) => n + usageTokens(r), 0),
    }
  }
  const a = armStats('a')
  const b = armStats('b')

  // 可选：两臂输出 vs 目标分布（目标 = 你的改进稿，由路由层提供）
  let distance = null
  const targetTexts = (Array.isArray(options.targetTexts) ? options.targetTexts : []).filter((t) => typeof t === 'string' && t.trim() !== '')
  if (targetTexts.length > 0) {
    distance = {
      a: distributionDistance(targetTexts, rows.map((r) => r.a.text).filter(Boolean)),
      b: distributionDistance(targetTexts, rows.map((r) => r.b.text).filter(Boolean)),
    }
  }

  const record = {
    id: `${stamp()}-${target}`,
    at: startedAt,
    finishedAt: Date.now(),
    target,
    modulesPreset: moduleSource.dir,
    moduleBlockChars: moduleSource.chars,
    model,
    temperature,
    maxTokens,
    plan: { maxCalls: plan.maxCalls, perArm: plan.perArm, calls: plan.calls, skipped: plan.skipped },
    arms: { a: a, b: b, delta: { score: round2(b.avgScore - a.avgScore), aiHits: round2(b.avgAiHits - a.avgAiHits) } },
    distance,
    rows,
  }

  mkdirSync(replaysDir(labRoot), { recursive: true })
  const file = join(replaysDir(labRoot), `${safeName(record.id)}.json`)
  atomicWrite(file, JSON.stringify(record, null, 1) + '\n')
  return { record, file }
}

async function callArm(callModel, arm, params) {
  const startedAt = Date.now()
  try {
    const result = await callModel({
      provider: params.model.provider,
      model: params.model.model,
      system: arm.system,
      prompt: arm.prompt,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
    })
    const text = String(result?.text ?? '')
    const m = metrics(text)
    return {
      ok: true,
      text,
      chars: m.chars,
      score: m.score,
      aiHits: m.aiHits.total,
      weighted: m.aiHits.weighted,
      avgSentence: m.avgSentence,
      dialogueRatio: m.dialogueRatio,
      usage: result?.usage ?? null,
      ms: Date.now() - startedAt,
    }
  } catch (error) {
    return { ok: false, text: '', chars: 0, score: 0, aiHits: 0, weighted: 0, avgSentence: 0, dialogueRatio: 0, usage: null, ms: Date.now() - startedAt, error: String(error?.message ?? error) }
  }
}

function stamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return String(date.getFullYear()) + p(date.getMonth() + 1) + p(date.getDate()) + '-' + p(date.getHours()) + p(date.getMinutes()) + p(date.getSeconds())
}

/* ────────────────────────── 历史 ────────────────────────── */

function listReplays(labRoot) {
  let names = []
  try {
    names = readdirSync(replaysDir(labRoot)).filter((n) => n.endsWith('.json'))
  } catch {
    return []
  }
  const out = []
  for (const name of names) {
    const doc = readJson(join(replaysDir(labRoot), name), undefined)
    if (doc === undefined) continue
    out.push({
      id: doc.id ?? name.replace(/\.json$/u, ''),
      at: doc.at ?? 0,
      target: doc.target ?? '',
      model: doc.model ?? null,
      calls: doc.plan?.calls ?? 0,
      deltaScore: doc.arms?.delta?.score ?? 0,
      aScore: doc.arms?.a?.avgScore ?? 0,
      bScore: doc.arms?.b?.avgScore ?? 0,
    })
  }
  return out.sort((x, y) => y.at - x.at)
}

function readReplay(labRoot, id) {
  const key = safeName(id)
  const file = join(replaysDir(labRoot), `${key}.json`)
  const doc = readJson(file, undefined)
  if (doc === undefined) throw new ContractError('NOT_FOUND', `找不到回放记录 ${id}`)
  return { file, record: doc }
}

function removeReplay(labRoot, id) {
  const key = safeName(id)
  const file = join(replaysDir(labRoot), `${key}.json`)
  const doc = readJson(file, undefined)
  if (doc === undefined) throw new ContractError('NOT_FOUND', `找不到回放记录 ${id}`)
  const backup = backupFile(file, labRoot, 'replay-remove')
  rmSync(file, { force: true })
  return { removed: file, backup }
}
  return { normalizeScene, readFixtures, writeFixtures, extractScenesFromSessions, buildModuleBlock, buildArms, planReplay, estimateReplay, resolveModel, runReplay, listReplays, readReplay, removeReplay, DEFAULT_MAX_CALLS, HARD_MAX_CALLS, DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE, CALL_TIMEOUT_MS, MODULE_BLOCK_CHAR_CAP, SCENE_CHARS_CAP };
})();

/* ── plugin entry (host-entry.mjs) ─────────────────────────────── */
const { ContractError, backupRoot, listBackups, readText, restoreBackup, statOf } = __m.contracts;
const { LAB_PRESET_ID, PRESET_ROOT, labPresetInfo, labRoot, publishTargets, readAnti, readEditedMessages, readPreset, readRegistry, tavernInfo, writeAnti, writeEditedMessage, writePreset } = __m.tavern;
const { antiRulesView, deslopCorpus } = __m.anti;
const { applyEnhancePack, enhancePackView } = __m.enhance;
const { bucketStats, listSessions, policyView, readSession } = __m.sessions;
const { compare, distributionDistance, metrics } = __m.score;
const { aggregate, exportMarkdown, get: getImprovement, listAll, listForSession, remove: removeImprovement, save: saveImprovement } = __m.improvements;
const { addCandidates, acceptedModules, compareVersions, listBuckets, readBucket, removeRule, rulesToModules, updateRule } = __m.rules;
const { apply: publishApply, labStats, preview: publishPreview } = __m.publish;
const { DEFAULT_MAX_CALLS, DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE, buildModuleBlock, estimateReplay, extractScenesFromSessions, listReplays, readFixtures, readReplay, removeReplay, resolveModel, runReplay, writeFixtures } = __m.replay;
/**
 * @local/dsh-tavern-style —— 宿主（Node）半边 · P1–P5 完整版
 *
 * 设计原则（《tavern 文风学习模块 v2.4 方案》）：
 *   1. 只依赖两类稳定契约：酒馆的**用户数据文件** + DSH 平台扩展点（webServer 路由）；
 *   2. **不 import、不 patch 任何酒馆运行时代码**；
 *   3. 所有写入经 core/contracts.mjs：写前备份 → mtime 守卫 → 原子替换 → 回读校验（失败自动回滚）；
 *   4. 会话文件**只读**（append-only 多帧 zstd，回写会毁档）。
 *
 * 路由一律用「精确路径 + 查询串/JSON body」，避免路径参数解析带来的不确定性。
 */













export const name = 'tavern-style'
export const inject = ['webServer']

const CACHE_MS = 10_000
let overviewCache = { at: 0, data: undefined }

/* ────────────────────────── 读文件 / 工具 ────────────────────────── */

function readJsonFile(file, fallback) {
  const text = readText(file)
  if (text === undefined) return fallback
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

function listFiles(root, prefix) {
  const out = []
  const walk = (dir, rel) => {
    let entries = []
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      const next = rel === '' ? entry.name : rel + '/' + entry.name
      if (entry.isDirectory()) walk(full, next)
      else {
        const st = statOf(full)
        if (st.exists) out.push({ path: prefix + next, bytes: st.size, at: st.mtimeMs })
      }
    }
  }
  walk(root, '')
  return out
}

function labView() {
  const workspace = join(labRoot(), 'lab-workspace')
  const outputs = listFiles(join(workspace, 'out'), 'out/')
  return {
    root: labRoot(),
    workspace,
    inbox: listFiles(join(workspace, 'inbox'), 'inbox/'),
    features: listFiles(join(workspace, 'features'), 'features/'),
    outputs: outputs.sort((a, b) => b.at - a.at),
  }
}

/**
 * 定位装着 dsh-tavern 的 profile 目录（已移入 core/tavern.mjs，这里保留薄封装给 doctor 用）。
 * 见 core/tavern.mjs 的 findTavernPackageFile()：`DSH_PROFILE_DIR` 在 Electron 宿主进程里可能不存在，
 * 所以那里会退化为扫描 `<DSH_HOME>/profiles/<profile>/`。
 */

/* ────────────────────────── 总览 ────────────────────────── */

function buildOverview() {
  const tavern = tavernInfo()
  const registry = readRegistry()
  const lab = labPresetInfo()
  return {
    at: Date.now(),
    doctor: {
      stage: 'P5 完整版',
      writable: true,
      note: '写入均带备份 / mtime 守卫 / 原子替换 / 回读校验；会话文件只读；A/B 回放默认限量 ≤10 次调用。',
      tavernPresent: tavern.present,
      tavernVersion: tavern.version,
      profileDir: tavern.profileDir,
      presetRoot: PRESET_ROOT,
      backupRoot: backupRoot(labRoot()),
      labRoot: labRoot(),
    },
    tavern,
    presets: {
      registryFile: registry.file,
      presets: registry.presets.map((p) => {
        const preset = readPreset(p.dir)
        return { ...p, modules: { file: preset.file, exists: preset.exists, total: preset.stats.total, stats: preset.stats, mtimeMs: preset.mtimeMs } }
      }),
      lab: { ...lab, stats: labStats().stats },
    },
    antiCliche: readAnti(),
    sessions: bucketStats(),
    lab: labView(),
    rules: { buckets: listBuckets(labRoot()).map((b) => ({ bucket: b.bucket, versions: b.versions, counts: b.counts, latest: b.latest })) },
    improvements: (() => {
      const all = listAll(labRoot())
      return { sessions: all.sessions.length, total: all.total }
    })(),
    replays: (() => {
      const all = listReplays(labRoot())
      return { total: all.length, latest: all.length === 0 ? null : all[0] }
    })(),
  }
}

/* ────────────────────────── HTTP 工具 ────────────────────────── */

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }

function send(res, status, body) {
  res.writeHead(status, JSON_HEADERS)
  res.end(JSON.stringify(body))
}

function ok(res, data) {
  send(res, 200, { ok: true, data })
}

function fail(res, error) {
  const code = error instanceof ContractError ? error.code : 'ERROR'
  const status = code === 'NOT_FOUND' ? 404 : code === 'CONFLICT' ? 409 : code === 'PROTECTED' ? 403 : code === 'UNAVAILABLE' ? 503 : 400
  send(res, status, { ok: false, code, error: String(error?.message ?? error) })
}

async function readBody(req, limit = 4 * 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new ContractError('INVALID', '请求体过大')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new ContractError('INVALID', `请求体不是合法 JSON：${String(error?.message ?? error)}`)
  }
}

function query(req) {
  const url = new URL(req.url ?? '/', 'http://dsh.invalid')
  return Object.fromEntries(url.searchParams.entries())
}

function readParam(value, name) {
  const text = String(value ?? '').trim()
  if (text === '') throw new ContractError('INVALID', `缺少参数 ${name}`)
  return text
}

/* ────────────────────────── 各路由实现 ────────────────────────── */

/** GET /overview */
function routeOverview(req, res) {
  const now = Date.now()
  if (overviewCache.data !== undefined && now - overviewCache.at < CACHE_MS) return ok(res, overviewCache.data)
  const data = buildOverview()
  overviewCache = { at: now, data }
  return ok(res, data)
}

/** GET /preset?dir= —— 读增强层全文（编辑用，含每条 content） */
function routeReadPreset(req, res) {
  const dir = readParam(query(req).dir, 'dir')
  const preset = readPreset(dir)
  return ok(res, {
    dir,
    file: preset.file,
    exists: preset.exists,
    mtimeMs: preset.mtimeMs,
    stats: preset.stats,
    groups: preset.groups.map((g) => ({
      name: g.name,
      collapsed: g.collapsed,
      modules: g.modules.map((m) => ({ name: m.name, content: m.content, enabled: m.enabled, chars: m.chars, protected: m.protected })),
    })),
  })
}

/** POST /preset —— 写增强层 {dir, groups, expectedMtimeMs, templateVarPolicy?} */
async function routeWritePreset(req, res) {
  const body = await readBody(req)
  const dir = readParam(body.dir, 'dir')
  if (!Array.isArray(body.groups)) throw new ContractError('INVALID', 'groups 必须是数组')
  const policy = body.templateVarPolicy === 'clean' ? 'clean' : 'keep'
  const result = writePreset(dir, body.groups, { expectedMtimeMs: body.expectedMtimeMs ?? null, templateVarPolicy: policy })
  overviewCache = { at: 0, data: undefined }
  return ok(res, result)
}

/** GET /anti */
function routeReadAnti(req, res) {
  return ok(res, readAnti())
}

/** POST /anti —— 写反八股 {enabled, bannedWords, expectedMtimeMs} */
async function routeWriteAnti(req, res) {
  const body = await readBody(req)
  const result = writeAnti({ enabled: body.enabled, bannedWords: body.bannedWords }, { expectedMtimeMs: body.expectedMtimeMs ?? null })
  overviewCache = { at: 0, data: undefined }
  return ok(res, result)
}

/**
 * GET /anti/rules —— 反八股**正文**（只读）。
 * 15 条结构禁令 + 首尾句 + 与酒馆 index.js 的镜像核对 + **逐字一致**的注入预览。
 */
function routeAntiRules(req, res) {
  return ok(res, antiRulesView())
}

/** GET /anti/corpus —— 本地 deslop 语料（只读候选：12 条硬禁令 + 三类词表条目）。 */
function routeAntiCorpus(req, res) {
  return ok(res, deslopCorpus())
}

/**
 * GET /enhance/pack —— 内置增强层模块包**全文**（只读）。
 * 酒馆自己的面板只给 `{name, enabled, chars}`，正文在那边看不到；这里是唯一能看见正文的入口。
 * 同时给出运行时注入块（`enhanceRuntime=true` 时追加到最后一段）的只读镜像 + 漂移核对。
 */
function routeEnhancePack(req, res) {
  return ok(res, enhancePackView())
}

/**
 * POST /enhance/apply —— 把内置包套用进某个预设 {dir, names?, overwrite?, groupIndex?, expectedMtimeMs?}
 * 语义与酒馆 `applyEnhancePack()` 一致：同名默认跳过，受保护模块（变量/格式/era）永远保留用户版本。
 */
async function routeEnhanceApply(req, res) {
  const body = await readBody(req)
  const dir = readParam(body.dir, 'dir')
  const result = applyEnhancePack(dir, {
    names: Array.isArray(body.names) ? body.names : undefined,
    overwrite: body.overwrite === true,
    groupIndex: Number.isInteger(body.groupIndex) ? body.groupIndex : 0,
    expectedMtimeMs: body.expectedMtimeMs ?? null,
    templateVarPolicy: body.templateVarPolicy,
  })
  overviewCache = { at: 0, data: undefined }
  return ok(res, result)
}

/** GET /sessions?limit=&onlyAllowed= */
function routeSessions(req, res) {
  const params = query(req)
  const limit = Number.parseInt(params.limit ?? '200', 10)
  const list = listSessions({ limit: Number.isFinite(limit) ? limit : 200, onlyAllowed: params.onlyAllowed !== 'false' })
  return ok(res, list)
}

/** GET /session?dir=&file= —— 轮次 + 模型输出 + 已有改进 + 指标 */
function routeSession(req, res) {
  const params = query(req)
  const dir = readParam(params.dir, 'dir')
  const file = readParam(params.file, 'file')
  const full = readSession(dir, file)
  const saved = listForSession(labRoot(), full.header?.id ?? '')
  const bySeq = new Map(saved.map((r) => [r.seq, r]))
  const turns = full.turns.map((turn) => ({
    turn: turn.turn,
    user: turn.user.slice(0, 4000),
    userChars: turn.user.length,
    assistants: turn.assistants.map((a) => {
      const record = bySeq.get(a.seq)
      return {
        seq: a.seq,
        step: a.step,
        chars: a.chars,
        reasoningChars: a.reasoningChars,
        toolCalls: a.toolCalls,
        at: a.at,
        text: a.text,
        metrics: metrics(a.text),
        improved: record === undefined ? null : { improved: record.improved, tags: record.tags, note: record.note, at: record.at, delta: record.delta },
      }
    }),
  }))
  return ok(res, {
    sessionId: full.header?.id ?? null,
    dir,
    file,
    title: full.title,
    preset: full.header?.agentPreset ?? null,
    cwd: full.header?.cwd ?? null,
    frames: full.frames,
    badFrames: full.badFrames,
    events: full.events,
    assistantTotal: full.assistantTotal,
    improvements: saved.length,
    turns,
  })
}

/** POST /improvement —— 保存改进 */
async function routeSaveImprovement(req, res) {
  const body = await readBody(req)
  const result = saveImprovement(labRoot(), body)
  overviewCache = { at: 0, data: undefined }
  return ok(res, { record: result.record, file: result.file, delta: result.diff.delta, before: result.diff.before, after: result.diff.after })
}

/** POST /improvement/remove */
async function routeRemoveImprovement(req, res) {
  const body = await readBody(req)
  const result = removeImprovement(labRoot(), readParam(body.sessionId, 'sessionId'), Number(body.seq))
  overviewCache = { at: 0, data: undefined }
  return ok(res, result)
}

/** POST /improvement/push —— 推到酒馆显示层（可选，界面默认关闭） */
async function routePushImprovement(req, res) {
  const body = await readBody(req)
  const result = writeEditedMessage(readParam(body.sessionId, 'sessionId'), Number(body.turnIndex ?? 0), String(body.text ?? ''), {})
  return ok(res, { ...result, edited: readEditedMessages().file })
}

/** GET /improvements */
function routeImprovements(req, res) {
  const params = query(req)
  const all = listAll(labRoot(), { withText: params.withText === 'true' })
  return ok(res, { ...all, aggregate: aggregate(labRoot()) })
}

/** GET /rules */
function routeRules(req, res) {
  return ok(res, { buckets: listBuckets(labRoot()) })
}

/** GET /rules/bucket?bucket= */
function routeRuleBucket(req, res) {
  const bucket = readParam(query(req).bucket, 'bucket')
  const view = readBucket(labRoot(), bucket)
  return ok(res, {
    bucket: view.bucket,
    file: view.file,
    exists: view.exists,
    mtimeMs: view.mtimeMs,
    counts: view.counts,
    versions: view.versions.map((v, index) => ({ index, at: v.at, source: v.source, note: v.note, count: (v.rules ?? []).length })),
    rules: view.current,
    acceptedModules: acceptedModules(labRoot(), bucket),
  })
}

/** POST /rules/bucket —— 新增候选（也接受"自我总结"产出的 JSON） */
async function routeAddRules(req, res) {
  const body = await readBody(req)
  const bucket = readParam(body.bucket, 'bucket')
  const incoming = Array.isArray(body.rules) ? body.rules : []
  const result = addCandidates(labRoot(), bucket, incoming, { source: body.source ?? 'manual', note: body.note ?? '' })
  overviewCache = { at: 0, data: undefined }
  return ok(res, { added: result.added, kept: result.kept, count: result.rules.length, backup: result.backup })
}

/** POST /rules/update */
async function routeUpdateRule(req, res) {
  const body = await readBody(req)
  const bucket = readParam(body.bucket, 'bucket')
  const result = updateRule(labRoot(), bucket, readParam(body.id, 'id'), body.patch ?? body)
  overviewCache = { at: 0, data: undefined }
  return ok(res, result)
}

/** POST /rules/remove */
async function routeRemoveRule(req, res) {
  const body = await readBody(req)
  const result = removeRule(labRoot(), readParam(body.bucket, 'bucket'), readParam(body.id, 'id'))
  overviewCache = { at: 0, data: undefined }
  return ok(res, result)
}

/** POST /rules/to-preset —— 把已采纳规则写进「文风实验室」预设的增强层 */
async function routeRulesToPreset(req, res) {
  const body = await readBody(req)
  const bucket = readParam(body.bucket, 'bucket')
  const modules = acceptedModules(labRoot(), bucket)
  if (modules.length === 0) throw new ContractError('INVALID', '该桶没有"已采纳且启用"的规则')
  const lab = readPreset(LAB_PRESET_ID)
  const groups = lab.groups.map((g) => ({ name: g.name, collapsed: g.collapsed, modules: g.modules.map((m) => ({ name: m.name, content: m.content, enabled: m.enabled })) }))
  if (groups.length === 0) groups.push({ name: '通用增强', modules: [] })
  const byName = new Map()
  for (const g of groups) for (const m of g.modules) if (!byName.has(m.name)) byName.set(m.name, m)
  let added = 0
  let updated = 0
  for (const module of modules) {
    const existing = byName.get(module.name)
    if (existing === undefined) {
      groups[0].modules.push(module)
      added += 1
    } else if (existing.content !== module.content) {
      existing.content = module.content
      updated += 1
    }
  }
  const written = writePreset(LAB_PRESET_ID, groups, { expectedMtimeMs: body.expectedMtimeMs ?? lab.mtimeMs })
  overviewCache = { at: 0, data: undefined }
  return ok(res, { added, updated, stats: written.stats, backup: written.backup, labDir: lab.dir })
}

/** POST /publish/preview */
async function routePublishPreview(req, res) {
  const body = await readBody(req)
  const targets = Array.isArray(body.targets) && body.targets.length > 0 ? body.targets.map(String) : publishTargets().map((p) => p.dir)
  return ok(res, publishPreview(labRoot(), targets, { overwrite: body.overwrite === true, all: body.all === true }))
}

/** POST /publish/apply */
async function routePublishApply(req, res) {
  const body = await readBody(req)
  const targets = Array.isArray(body.targets) && body.targets.length > 0 ? body.targets.map(String) : []
  if (targets.length === 0) throw new ContractError('INVALID', '必须显式给出 targets（避免误发布）')
  const result = publishApply(labRoot(), targets, { overwrite: body.overwrite === true, all: body.all === true, expectedMtime: body.expectedMtime ?? {} })
  overviewCache = { at: 0, data: undefined }
  return ok(res, result)
}

/** GET /backups?original= */
function routeBackups(req, res) {
  const params = query(req)
  const all = listBackups(labRoot(), params.original === undefined ? undefined : params.original)
  return ok(res, { root: backupRoot(labRoot()), backups: all.slice(0, 200).map((b) => ({ id: b.id, original: b.original, label: b.label, at: b.at, size: b.size, hash: b.hash })) })
}

/** POST /rollback {id} */
async function routeRollback(req, res) {
  const body = await readBody(req)
  const id = readParam(body.id, 'id')
  const hit = listBackups(labRoot()).find((b) => b.id === id)
  if (hit === undefined) throw new ContractError('NOT_FOUND', `找不到备份 ${id}`)
  const result = restoreBackup(hit)
  overviewCache = { at: 0, data: undefined }
  return ok(res, { ...result, from: hit.id, original: hit.original })
}

/** GET /compare —— 分布拟合 + 改进聚合 + 桶版本
 *  桶选择器：`bucket` = 规则桶（沿用），`sampleBucket` = 分布抽样的会话桶（默认同 bucket），
 *  `sampleSessions` = 抽样会话条数（1–10，默认 3）。 */
function routeCompare(req, res) {
  const params = query(req)
  const aggregateData = aggregate(labRoot())
  const lab = labStats()

  // 目标分布 = 改进稿（你的目标）；待测 = 选定桶里最近的模型输出
  const improvedTexts = listAll(labRoot(), { withText: true }).sessions.flatMap((s) => s.items.map((r) => r.improved)).filter((t) => typeof t === 'string' && t.trim() !== '')
  const bucket = params.bucket
  const sampleBucket = typeof params.sampleBucket === 'string' && params.sampleBucket !== '' ? params.sampleBucket : bucket
  const wantSessions = Number.parseInt(params.sampleSessions ?? '3', 10)
  const sampleSessions = Math.min(10, Math.max(1, Number.isFinite(wantSessions) ? wantSessions : 3))
  let modelTexts = []
  const usedSessions = []
  if (typeof sampleBucket === 'string' && sampleBucket !== '') {
    const list = listSessions({ limit: 300, onlyAllowed: true })
    for (const session of list.sessions.filter((s) => s.preset === sampleBucket)) {
      if (usedSessions.length >= sampleSessions) break
      try {
        const full = readSession(session.dir, session.file)
        let taken = 0
        for (const turn of full.turns) {
          for (const a of turn.assistants) {
            if (a.chars > 200) {
              modelTexts.push(a.text)
              taken += 1
            }
          }
        }
        if (taken > 0) usedSessions.push({ sessionId: session.sessionId, texts: taken, mtimeMs: session.mtimeMs })
      } catch {
        /* 跳过读不了的会话 */
      }
    }
  }
  modelTexts = modelTexts.slice(0, 20)

  const stats = bucketStats()
  return ok(res, {
    improvements: aggregateData,
    lab,
    rules: listBuckets(labRoot()),
    distance: improvedTexts.length > 0 && modelTexts.length > 0 ? distributionDistance(improvedTexts, modelTexts) : null,
    sampleCounts: { targets: improvedTexts.length, samples: modelTexts.length, sessions: usedSessions.length },
    bucket: bucket ?? null,
    sampleBucket: sampleBucket ?? null,
    sampleSessions,
    usedSessions,
    sampleBuckets: stats.buckets.filter((b) => !b.key.includes('[')),
  })
}

/** POST /rules/import —— 从实验室工作区 out/rules/*.json 导入候选规则（闭环最后一步） */
async function routeImportRules(req, res) {
  const body = await readBody(req)
  const dir = join(labRoot(), 'lab-workspace', 'out', 'rules')
  let names = []
  try {
    names = readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.json') && !n.startsWith('_'))
  } catch {
    throw new ContractError('NOT_FOUND', `还读不到规则目录：${dir}`)
  }
  if (Array.isArray(body.files) && body.files.length > 0) names = names.filter((n) => body.files.includes(n))
  const report = []
  for (const name of names) {
    const file = join(dir, name)
    const doc = readJsonFile(file, undefined)
    if (doc === undefined) {
      report.push({ file: name, ok: false, error: '不是合法 JSON' })
      continue
    }
    const rules = Array.isArray(doc) ? doc : Array.isArray(doc.rules) ? doc.rules : []
    if (rules.length === 0) {
      report.push({ file: name, ok: false, error: '里没有 rules 数组' })
      continue
    }
    const bucket = String(body.bucket ?? doc.bucket ?? name.replace(/\.rules\.json$/u, '').replace(/\.json$/u, ''))
    const result = addCandidates(labRoot(), bucket, rules, { source: 'lab-preset:' + name, note: doc.notes ?? doc.note ?? '' })
    report.push({ file: name, ok: true, bucket, added: result.added.length, kept: result.kept.length })
  }
  overviewCache = { at: 0, data: undefined }
  return ok(res, { dir, files: names.length, report })
}

/** GET /rules/compare?bucket=&a=&b= */
function routeCompareVersions(req, res) {
  const params = query(req)
  const bucket = readParam(params.bucket, 'bucket')
  const a = Number.parseInt(params.a ?? '0', 10)
  const b = Number.parseInt(params.b ?? '1', 10)
  return ok(res, compareVersions(labRoot(), bucket, a, b))
}

/** POST /export/improvement {sessionId, seq} */
async function routeExportImprovement(req, res) {
  const body = await readBody(req)
  const record = getImprovement(labRoot(), readParam(body.sessionId, 'sessionId'), Number(body.seq))
  if (record === undefined) throw new ContractError('NOT_FOUND', '该改进不存在')
  const file = exportMarkdown(labRoot(), record)
  return ok(res, { file })
}

/** POST /snapshot —— 手动落一份总览快照 */
async function routeSnapshot(req, res) {
  const dir = join(labRoot(), 'data')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'overview.json')
  const data = buildOverview()
  writeFileSync(file, JSON.stringify(data, null, 1), 'utf8')
  overviewCache = { at: Date.now(), data }
  return ok(res, { file, at: data.at })
}

/* ────────────────────────── A/B 回放 ────────────────────────── */

/** 插件运行时服务（apply() 时捕获）。测试里为空 → 回放只报 UNAVAILABLE，其余功能不受影响。 */
const runtime = { llm: null, defaultModel: null }

/** GET /replay/fixtures?target= */
function routeReadFixtures(req, res) {
  const target = readParam(query(req).target, 'target')
  return ok(res, readFixtures(labRoot(), target))
}

/** POST /replay/fixtures {target, scenes, expectedMtimeMs} */
async function routeWriteFixtures(req, res) {
  const body = await readBody(req)
  const target = readParam(body.target, 'target')
  const result = writeFixtures(labRoot(), target, body.scenes, { expectedMtimeMs: body.expectedMtimeMs ?? null })
  return ok(res, result)
}

/** POST /replay/fixtures/extract {bucket, limit} —— 从最近会话抓场景（只抽 user 消息） */
async function routeExtractScenes(req, res) {
  const body = await readBody(req)
  return ok(res, extractScenesFromSessions(labRoot(), { bucket: body.bucket, limit: body.limit }))
}

function replayScenes(body) {
  if (Array.isArray(body.scenes) && body.scenes.length > 0) return body.scenes
  const target = String(body.target ?? '')
  if (target === '') throw new ContractError('INVALID', '需要 scenes 或 target（已保存的夹具）')
  return readFixtures(labRoot(), target).scenes
}

/** POST /replay/estimate —— 跑前成本预估（不调模型） */
async function routeReplayEstimate(req, res) {
  const body = await readBody(req)
  const moduleSource = buildModuleBlock(labRoot(), body.modulesPreset ?? 'style-lab')
  const estimate = estimateReplay({
    scenes: replayScenes(body),
    moduleBlock: moduleSource.block,
    maxCalls: body.maxCalls ?? DEFAULT_MAX_CALLS,
    maxTokens: body.maxTokens ?? DEFAULT_MAX_TOKENS,
    priceInput: body.priceInput ?? 0,
    priceOutput: body.priceOutput ?? 0,
  })
  return ok(res, {
    ...estimate,
    modulesPreset: moduleSource.dir,
    moduleBlockChars: moduleSource.chars,
    moduleBlockTruncated: moduleSource.truncated,
    model: resolveModel(body, runtime),
    defaults: { maxCalls: DEFAULT_MAX_CALLS, maxTokens: DEFAULT_MAX_TOKENS, temperature: DEFAULT_TEMPERATURE },
  })
}

/** HTTP 响应里把生成文本截到 1500 字（全文留在 data/replays 的记录文件里）。 */
function summarizeReplay(record) {
  return {
    ...record,
    rows: record.rows.map((row) => ({
      ...row,
      a: { ...row.a, text: String(row.a.text ?? '').slice(0, 1500) },
      b: { ...row.b, text: String(row.b.text ?? '').slice(0, 1500) },
    })),
  }
}

/** POST /replay/run —— 真实调用（限量；必须 confirm:true，且调用前应先看 /replay/estimate） */
async function routeReplayRun(req, res) {
  const body = await readBody(req)
  if (body.confirm !== true) throw new ContractError('INVALID', '未确认执行（先点「预估」，确认后才带 confirm:true 执行）')
  const targetTexts = listAll(labRoot(), { withText: true }).sessions.flatMap((s) => s.items.map((r) => r.improved)).filter((t) => typeof t === 'string' && t.trim() !== '')
  const result = await runReplay(
    labRoot(),
    {
      confirm: true,
      target: body.target,
      scenes: replayScenes(body),
      modulesPreset: body.modulesPreset ?? 'style-lab',
      maxCalls: body.maxCalls ?? DEFAULT_MAX_CALLS,
      maxTokens: body.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: body.temperature ?? DEFAULT_TEMPERATURE,
      provider: body.provider,
      model: body.model,
      targetTexts,
    },
    runtime,
  )
  overviewCache = { at: 0, data: undefined }
  return ok(res, { file: result.file, record: summarizeReplay(result.record) })
}

/** GET /replay/history */
function routeReplayHistory(req, res) {
  return ok(res, { root: join(labRoot(), 'data', 'replays'), replays: listReplays(labRoot()) })
}

/** GET /replay/record?id= */
function routeReplayRecord(req, res) {
  const id = readParam(query(req).id, 'id')
  return ok(res, readReplay(labRoot(), id))
}

/** POST /replay/remove {id} */
async function routeReplayRemove(req, res) {
  const body = await readBody(req)
  return ok(res, removeReplay(labRoot(), readParam(body.id, 'id')))
}

/* ────────────────────────── 文本体检 / 成果浏览 ────────────────────────── */

/**
 * POST /analyze {text} —— 对任意文本跑一遍指标（纯计算：不调模型、不写盘、免费）。
 * 复用 core/score.mjs 的 metrics()，与「改进工作台」的打分口径完全一致。
 */
async function routeAnalyze(req, res) {
  const body = await readBody(req)
  const text = String(body.text ?? '')
  if (text.trim() === '') throw new ContractError('INVALID', 'text 不能为空：粘一段正文再体检')
  if (text.length > 200_000) throw new ContractError('INVALID', 'text 太长（上限 20 万字符），请切分后再体检')
  const m = metrics(text)
  return ok(res, { ...m, avgParagraph: m.avgParagraphChars })
}

/** GET /lab/outputs —— lab-workspace/out/ 下的成果清单（报告 / 风格卡 / 候选规则 / 已发布）。 */
function routeLabOutputs(req, res) {
  const view = labView()
  const kindOf = (path) => {
    if (path.startsWith('out/reports/')) return '报告'
    if (path.startsWith('out/cards/')) return '风格卡'
    if (path.startsWith('out/rules/')) return '候选规则'
    if (path.startsWith('out/published/')) return '已发布'
    return '其他'
  }
  const entries = view.outputs.map((f) => ({ file: f.path, kind: kindOf(f.path), at: f.at, bytes: f.bytes }))
  return ok(res, { root: view.workspace, entries })
}

/** GET /lab/output?file= —— 读一份成果正文（只允许 lab-workspace/out/ 之内）。 */
function routeLabOutput(req, res) {
  const file = readParam(query(req).file, 'file')
  const rel = String(file).replace(/\\/gu, '/')
  if (rel.includes('..')) throw new ContractError('INVALID', 'file 只能是 out/ 下的相对路径')
  const normalized = rel.startsWith('out/') ? rel : 'out/' + rel
  const root = join(labRoot(), 'lab-workspace', 'out')
  const full = join(labRoot(), 'lab-workspace', ...normalized.split('/'))
  if (!full.startsWith(root)) throw new ContractError('INVALID', 'file 越界：只能读 out/ 下的成果')
  const text = readText(full)
  if (text === undefined) throw new ContractError('NOT_FOUND', '成果文件不存在：' + normalized)
  return ok(res, { file: normalized, content: text })
}

/* ────────────────────────── 路由表 ────────────────────────── */

const ROUTES = [
  { path: '/api/tavern-style/overview', method: 'GET', handler: routeOverview },
  { path: '/api/tavern-style/preset', method: 'GET', handler: routeReadPreset },
  { path: '/api/tavern-style/preset', method: 'POST', handler: routeWritePreset },
  { path: '/api/tavern-style/anti', method: 'GET', handler: routeReadAnti },
  { path: '/api/tavern-style/anti', method: 'POST', handler: routeWriteAnti },
  { path: '/api/tavern-style/anti/rules', method: 'GET', handler: routeAntiRules },
  { path: '/api/tavern-style/anti/corpus', method: 'GET', handler: routeAntiCorpus },
  { path: '/api/tavern-style/enhance/pack', method: 'GET', handler: routeEnhancePack },
  { path: '/api/tavern-style/enhance/apply', method: 'POST', handler: routeEnhanceApply },
  { path: '/api/tavern-style/sessions', method: 'GET', handler: routeSessions },
  { path: '/api/tavern-style/session', method: 'GET', handler: routeSession },
  { path: '/api/tavern-style/improvement', method: 'POST', handler: routeSaveImprovement },
  { path: '/api/tavern-style/improvement/remove', method: 'POST', handler: routeRemoveImprovement },
  { path: '/api/tavern-style/improvement/push', method: 'POST', handler: routePushImprovement },
  { path: '/api/tavern-style/improvement/export', method: 'POST', handler: routeExportImprovement },
  { path: '/api/tavern-style/improvements', method: 'GET', handler: routeImprovements },
  { path: '/api/tavern-style/rules', method: 'GET', handler: routeRules },
  { path: '/api/tavern-style/rules/bucket', method: 'GET', handler: routeRuleBucket },
  { path: '/api/tavern-style/rules/bucket', method: 'POST', handler: routeAddRules },
  { path: '/api/tavern-style/rules/update', method: 'POST', handler: routeUpdateRule },
  { path: '/api/tavern-style/rules/remove', method: 'POST', handler: routeRemoveRule },
  { path: '/api/tavern-style/rules/to-preset', method: 'POST', handler: routeRulesToPreset },
  { path: '/api/tavern-style/rules/import', method: 'POST', handler: routeImportRules },
  { path: '/api/tavern-style/rules/compare', method: 'GET', handler: routeCompareVersions },
  { path: '/api/tavern-style/publish/preview', method: 'POST', handler: routePublishPreview },
  { path: '/api/tavern-style/publish/apply', method: 'POST', handler: routePublishApply },
  { path: '/api/tavern-style/backups', method: 'GET', handler: routeBackups },
  { path: '/api/tavern-style/rollback', method: 'POST', handler: routeRollback },
  { path: '/api/tavern-style/compare', method: 'GET', handler: routeCompare },
  { path: '/api/tavern-style/replay/fixtures', method: 'GET', handler: routeReadFixtures },
  { path: '/api/tavern-style/replay/fixtures', method: 'POST', handler: routeWriteFixtures },
  { path: '/api/tavern-style/replay/fixtures/extract', method: 'POST', handler: routeExtractScenes },
  { path: '/api/tavern-style/replay/estimate', method: 'POST', handler: routeReplayEstimate },
  { path: '/api/tavern-style/replay/run', method: 'POST', handler: routeReplayRun },
  { path: '/api/tavern-style/replay/history', method: 'GET', handler: routeReplayHistory },
  { path: '/api/tavern-style/replay/record', method: 'GET', handler: routeReplayRecord },
  { path: '/api/tavern-style/replay/remove', method: 'POST', handler: routeReplayRemove },
  { path: '/api/tavern-style/analyze', method: 'POST', handler: routeAnalyze },
  { path: '/api/tavern-style/lab/outputs', method: 'GET', handler: routeLabOutputs },
  { path: '/api/tavern-style/lab/output', method: 'GET', handler: routeLabOutput },
  { path: '/api/tavern-style/snapshot', method: 'POST', handler: routeSnapshot },
]

/* ────────────────────────── 插件入口 ────────────────────────── */

/**
 * ⚠️ 硬约束（2026-09-28 代码级证据定位到的启动失败根因）：
 *   dsh-host-webserver 的 `register(route)` 里有
 *     `if (table.has(route.path)) throw new Error('webserver: duplicate ... route "${path}"')`
 *   —— **同一个 path 只能注册一次**。按 GET/POST 各注册一条会在第二次抛出，
 *   而异常发生在 `ctx.effect` 回调里会被吞掉 → 该插件行永远停在 fiber `loading`
 *   （web boot 报 `1 entry did not activate`，渲染器控制台没有任何报错）。
 *   正确做法：**一个 path 只注册一条**，方法在 handler 内分派（不支持的方法回 405）。
 */
const ROUTE_GROUPS = (() => {
  const groups = new Map()
  for (const route of ROUTES) {
    if (!groups.has(route.path)) groups.set(route.path, new Map())
    groups.get(route.path).set(route.method, route.handler)
  }
  return groups
})()

/** 按注册顺序的路由元数据（path + 允许的方法），供自检脚本按 path 匹配并挑方法。 */
export const routesMetadata = [...ROUTE_GROUPS.entries()].map(([path, methods]) => ({ path, methods: [...methods.keys()] }))

export function apply(ctx) {
  // 捕获 A/B 回放要用的平台服务（可选依赖：拿不到就只是回放不可用，不影响其它功能）
  try {
    if (typeof ctx.get === 'function') {
      runtime.llm = ctx.get('llm') ?? null
      runtime.defaultModel = ctx.get('agentDefaultModel') ?? null
    }
  } catch {
    /* 服务不存在 / 上下文不允许 → 保持 null */
  }

  const routeObjects = [...ROUTE_GROUPS.entries()].map(([path, methods]) => ({
    kind: 'exact',
    path,
    handler: async (req, res) => {
      const method = String(req.method ?? 'GET').toUpperCase()
      const handler = methods.get(method)
      if (handler === undefined) {
        return send(res, 405, { ok: false, code: 'METHOD', error: `${path} 只接受 ${[...methods.keys()].join(' / ')}` })
      }
      try {
        await handler(req, res)
      } catch (error) {
        fail(res, error)
      }
    },
  }))

  ctx.effect(() => {
    const disposers = routeObjects.map((route) => ctx.webServer.register(route))
    return () => {
      for (const dispose of disposers) {
        try {
          if (typeof dispose === 'function') dispose()
        } catch {
          /* ignore */
        }
      }
    }
  }, 'tavern-style: api routes')

  /** 启动 5 秒后落一份快照（不阻塞启动、失败静默）。 */
  ctx.effect(() => {
    const timer = setTimeout(() => {
      try {
        const dir = join(labRoot(), 'data')
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, 'overview.json'), JSON.stringify(buildOverview(), null, 1), 'utf8')
      } catch {
        /* ignore */
      }
    }, 5000)
    return () => clearTimeout(timer)
  }, 'tavern-style: snapshot')

  // 确保插件自有目录存在（成果落点）
  try {
    for (const sub of ['data', 'data/improvements', 'data/rules', 'lab-workspace/inbox', 'lab-workspace/features', 'lab-workspace/out/reports', 'lab-workspace/out/rules', 'lab-workspace/out/cards', 'lab-workspace/out/published']) {
      const dir = join(labRoot(), sub)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    }
  } catch {
    /* ignore */
  }
}
