// 酒馆工具层 —— 写入 dsh-muv-engine 的「全局正则脚本库」
//
// 为什么要有这一层：ST 卡自带的 `data.extensions.regex_scripts` 在**面板导入时被丢掉**
// （面板只留 name/desc/first）。面板提供了一个「🧩 全局正则」卡片手工粘贴导入
// （走 POST /api/muv-engine/global-regex），但拖一张 PNG 卡进去时它不会自动带上
// 卡级脚本。本模块让工具能在导入卡的同时把卡级脚本落进同一个库。
//
// ⚠️ 只做**格式对齐**，不 import muv-engine 的内部模块：那个包可能不在本插件的
// 解析路径上（profile 的 node_modules 布局 / 链接方式都不同），静态 import 会在
// 加载期炸掉整个插件。所以这里按它**公开且稳定**的落盘契约重写一遍：
//
//   lib/global-regex.js:52-61,103-126（dsh-muv-engine 0.3.11）
//     · 路径：$MUV_ENGINE_DATA_DIR/global-regex.json
//             ?? <引擎包根>/data/global-regex.json
//     · 格式：{ version:1, savedAt:<ISO>, scripts:[{id, scriptName, findRegex,
//              replaceString, disabled, markdownOnly, promptOnly, placement,
//              runOnEdit, substituteRegex, minDepth, maxDepth, importedAt}] }
//     · id  ：'gr_' + sha1(scriptName + '\x1f' + findRegex) 前 12 位
//     · 去重：scriptName + findRegex 逐字相等视为同一条（upsert 覆盖）
//     · 上限：整库 200 条；单条 findRegex/replaceString 各 256KB
//
// 引擎每次读取都重新读文件（loadGlobalScripts 无缓存），所以外部写入下一轮即生效。

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const MAX_SCRIPTS = 200
export const MAX_FIELD = 256 * 1024
export const FORMAT_VERSION = 1

/** 确定性脚本 id —— 与 muv-engine 的 scriptId 逐字一致。 */
export function scriptId(scriptName, findRegex) {
  const h = crypto.createHash('sha1').update(String(scriptName) + '\x1f' + String(findRegex)).digest('hex')
  return 'gr_' + h.slice(0, 12)
}

/** 编译校验（与 muv-engine canCompileFindRegex 同口径）。 */
export function canCompile(findRegex) {
  if (typeof findRegex !== 'string' || !findRegex.trim()) return false
  try {
    if (findRegex.startsWith('/')) {
      const last = findRegex.lastIndexOf('/')
      if (last > 0) {
        new RegExp(findRegex.slice(1, last), findRegex.slice(last + 1))
        return true
      }
    }
    new RegExp(findRegex)
    return true
  } catch {
    return false
  }
}

/**
 * 定位 muv-engine 的数据文件。
 *
 * 解析顺序：$MUV_ENGINE_DATA_DIR → profile 下的 node_modules/dsh-muv-engine/data。
 * 每个候选都用 package.json 的 name 复核，避免写进同名但不相干的目录。
 * @param {string} dshHome
 * @returns {{ file: string, source: string }|null}
 */
export function locateGlobalRegexFile(dshHome) {
  const envDir = process.env.MUV_ENGINE_DATA_DIR
  if (typeof envDir === 'string' && envDir.trim()) {
    return { file: path.join(path.resolve(envDir.trim()), 'global-regex.json'), source: 'MUV_ENGINE_DATA_DIR' }
  }
  const profiles = path.join(dshHome, 'profiles')
  const candidates = []
  try {
    for (const entry of fs.readdirSync(profiles, { withFileTypes: true })) {
      if (entry.isDirectory()) candidates.push(path.join(profiles, entry.name, 'node_modules', 'dsh-muv-engine'))
    }
  } catch {
    // profiles 目录不存在：下面的共享根候选仍然可能命中
  }
  candidates.push(path.join(profiles, 'node_modules', 'dsh-muv-engine'))
  for (const pkg of candidates) {
    if (!fs.existsSync(pkg)) continue
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8'))
      if (meta && meta.name === 'dsh-muv-engine') {
        return { file: path.join(pkg, 'data', 'global-regex.json'), source: pkg }
      }
    } catch {
      // 不是有效包，换下一个
    }
  }
  return null
}

export function readGlobalRegexFile(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    return Array.isArray(parsed?.scripts) ? parsed.scripts : []
  } catch {
    return []
  }
}

function writeGlobalRegexFile(file, scripts) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify({ version: FORMAT_VERSION, savedAt: new Date().toISOString(), scripts }, null, 2), 'utf8')
  fs.renameSync(tmp, file)
}

/**
 * 把一组 ST 脚本 upsert 进库。
 *
 * 与引擎同一纪律：**一条坏的只跳过自己**，不整批失败；但必须有数可查（reasons）。
 * @param {string} file
 * @param {object[]} incoming ST 原始脚本数组
 * @returns {{ok: boolean, added: number, replaced: number, skipped: number, reasons: string[], total: number}}
 */
export function upsertScripts(file, incoming) {
  const existing = readGlobalRegexFile(file)
  const byId = new Map(existing.map((s) => [s.id, s]))
  const reasons = []
  let added = 0
  let replaced = 0
  let skipped = 0
  for (const raw of Array.isArray(incoming) ? incoming : []) {
    if (!raw || typeof raw !== 'object') { skipped++; reasons.push('条目不是对象'); continue }
    const scriptName = String(raw.scriptName || raw.name || '').trim()
    const findRegex = typeof raw.findRegex === 'string' ? raw.findRegex : ''
    const replaceString = typeof raw.replaceString === 'string' ? raw.replaceString : ''
    if (!findRegex.trim()) { skipped++; reasons.push(`${scriptName || '(无名)'}: 缺 findRegex`); continue }
    if (findRegex.length > MAX_FIELD || replaceString.length > MAX_FIELD) {
      skipped++
      reasons.push(`${scriptName || '(无名)'}: 字段超过 ${MAX_FIELD} 字符上限`)
      continue
    }
    if (!canCompile(findRegex)) { skipped++; reasons.push(`${scriptName || '(无名)'}: findRegex 无法编译`); continue }
    const id = scriptId(scriptName, findRegex)
    if (!byId.has(id) && byId.size >= MAX_SCRIPTS) {
      skipped++
      reasons.push(`${scriptName || '(无名)'}: 库已满（${MAX_SCRIPTS} 条上限）`)
      continue
    }
    const record = {
      id,
      scriptName,
      findRegex,
      replaceString,
      disabled: raw.disabled === true,
      markdownOnly: raw.markdownOnly === true,
      promptOnly: raw.promptOnly === true,
      placement: Array.isArray(raw.placement) ? raw.placement : undefined,
      runOnEdit: raw.runOnEdit === true,
      substituteRegex: Number.isInteger(raw.substituteRegex) ? raw.substituteRegex : 0,
      minDepth: Number.isInteger(raw.minDepth) ? raw.minDepth : null,
      maxDepth: Number.isInteger(raw.maxDepth) ? raw.maxDepth : null,
      importedAt: new Date().toISOString()
    }
    if (byId.has(id)) replaced++
    else added++
    byId.set(id, record)
  }
  const scripts = [...byId.values()]
  writeGlobalRegexFile(file, scripts)
  return { ok: true, added, replaced, skipped, reasons: reasons.slice(0, 20), total: scripts.length }
}
