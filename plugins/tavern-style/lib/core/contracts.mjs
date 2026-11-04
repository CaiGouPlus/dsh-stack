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

import { createHash } from 'node:crypto'
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'

/** 契约层错误：code 供上层区分处理。 */
export class ContractError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ContractError'
    this.code = code
  }
}

export function statOf(file) {
  try {
    const st = statSync(file)
    return { exists: true, mtimeMs: st.mtimeMs, size: st.size }
  } catch {
    return { exists: false, mtimeMs: null, size: null }
  }
}

export function readText(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
}

export function readJson(file, fallback) {
  const text = readText(file)
  if (text === undefined) return fallback
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16)
}

/** JSON 文本校验：返回 {ok, error}，不抛。 */
export function validateJson(text) {
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
export function detectTemplateVars(text) {
  const matches = String(text ?? '').match(/\{\{[^}]{0,80}\}\}/gu)
  return { found: matches !== null, samples: matches === null ? [] : matches.slice(0, 5), count: matches === null ? 0 : matches.length }
}

/**
 * 按酒馆规则清洗模板变量（`cleanSillyTavernVars` 的等价实现）：剔除 `{{...}}`。
 * 仅在调用方**显式选择**"按酒馆规则清洗"后才使用；默认保留原文。
 */
export function cleanTemplateVars(text) {
  return String(text ?? '').replace(/\{\{[^}]{0,80}\}\}/gu, '')
}

/** 备份目录（插件自己的 data/backups，不会被 DSH 的预设扫描干扰）。 */
export function backupRoot(labRoot) {
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
export function backupFile(file, labRoot, label = '') {
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
export function listBackups(labRoot, originalFile) {
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
export function atomicWrite(file, text) {
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
export function writeGuarded(options) {
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
export function restoreBackup(backup) {
  const text = readText(backup.file)
  if (text === undefined) throw new ContractError('NOT_FOUND', `备份文件读不到：${backup.file}`)
  atomicWrite(backup.original, text)
  return { file: backup.original, size: Buffer.byteLength(text, 'utf8'), hash: sha256(text) }
}

/** 便捷：读 → 改 → 带守卫写（JSON 对象形态）。调用方可用 expectedMtimeMs 覆盖内部读到的 mtime（守卫不因此失效）。 */
export function updateJsonFile(options) {
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
export function canWriteDir(dir) {
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
export function copyOut(from, to) {
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(from, to)
  return to
}

export { stamp }
