/**
 * 文风实验室 · 发布通道（publish）
 *
 * 方向只有一个：**实验室预设（staging） → 目标预设（production）**，永不反向。
 * 目标预设只接收「实验室里已存在的、非受保护的」模块；实验室草稿不自动同步，
 * 必须由你在面板点"发布"，且发布前能看到预演差异（新增/覆盖/跳过/不变）。
 *
 * 所有写入都走 tavern.writePreset（备份 + mtime 守卫 + 原子 + 回读校验 + 受保护加锁）。
 */

import { ContractError } from './contracts.mjs'
import { LAB_PRESET_ID, isProtectedName, moduleStats, readPreset, writePreset } from './tavern.mjs'

/** 我们自己的模块前缀（默认只发布这类，避免把内置模块搬来搬去）。 */
export const PUBLISH_PREFIX = '✨增强丨'

/** 收集实验室预设里可发布的模块（默认只收 ✨增强丨 前缀）。 */
export function publishableModules(labRoot, options = {}) {
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
export function preview(labRoot, targetDirs, options = {}) {
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
export function apply(labRoot, targetDirs, options = {}) {
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
export function labStats() {
  const lab = readPreset(LAB_PRESET_ID)
  return { dir: lab.dir, exists: lab.exists, stats: moduleStats(lab.groups), groups: lab.groups.length }
}
