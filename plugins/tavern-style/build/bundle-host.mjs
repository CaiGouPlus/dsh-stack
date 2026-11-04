/**
 * 把 lib/host-entry.mjs + lib/core/*.mjs 打包成**单文件** lib/index.js。
 *
 * 为什么必须单文件（2026-09-27 教训）：
 *   DSH 桌面端的插件加载器对「插件入口的相对子模块导入」支持存疑——P4 把 host 半边拆成
 *   7 个相对导入的 .mjs 后，该行在启动时永远停在 fiber `loading`（web boot 报
 *   `entries did not activate`）。生态里所有插件（含官方 dsh-usage）都是**单文件 bundle**，
 *   这里同样处理：只保留 `node:*` 内置导入，跨文件引用改成命名空间解构。
 *
 * 用法：node D:\DSH\tavern-style\build\bundle-host.mjs
 * 源文件仍是 lib/core/*.mjs 与 lib/host-entry.mjs（可编辑、可单测），lib/index.js 是产物。
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'D:/DSH/tavern-style'
const CORE = [
  ['contracts', 'core/contracts.mjs'],
  ['tavern', 'core/tavern.mjs'],
  ['anti', 'core/anti.mjs'],
  ['enhance', 'core/enhance.mjs'],
  ['sessions', 'core/sessions.mjs'],
  ['score', 'core/score.mjs'],
  ['rules', 'core/rules.mjs'],
  ['improvements', 'core/improvements.mjs'],
  ['publish', 'core/publish.mjs'],
  ['replay', 'core/replay.mjs'],
]
const ENTRY = 'host-entry.mjs'

/** node:* 内置导入合并表：specifier -> Set(条目文本) */
const nodeImports = new Map()
/** 相对导入依赖：moduleName -> Set(条目文本) */
const relativeDeps = new Map()

function noteImport(specifier, items, localDeps) {
  if (specifier.startsWith('node:')) {
    if (!nodeImports.has(specifier)) nodeImports.set(specifier, new Set())
    for (const item of items) nodeImports.get(specifier).add(item)
    return true
  }
  if (specifier.startsWith('./')) {
    // './core/contracts.mjs'（入口相对路径）与 './contracts.mjs'（core 内部互引）都归一成模块名
    const key = specifier.replace(/\.mjs$/u, '').replace(/^\.\//u, '').replace(/^core\//u, '')
    if (!localDeps.has(key)) localDeps.set(key, new Set())
    for (const item of items) localDeps.get(key).add(item)
    return true
  }
  throw new Error('bundle: 不支持的导入来源 → ' + specifier)
}

function parseNamedClause(clause) {
  const inner = clause.replace(/^\{/u, '').replace(/\}$/u, '')
  return inner.split(',').map((s) => s.trim()).filter((s) => s !== '')
}

/** import 的 `a as b` 在解构里必须写成 `a: b`。 */
function toPattern(items) {
  return [...items]
    .map((item) => {
      const parts = item.split(/\s+as\s+/u)
      return parts.length > 1 ? `${parts[0].trim()}: ${parts[1].trim()}` : item
    })
    .join(', ')
}

/** 抽取一个模块的导出名，并返回剥掉 export 关键字的正文。 */
function stripExports(text) {
  const names = new Set()
  for (const m of text.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gmu)) names.add(m[1])
  for (const m of text.matchAll(/^export\s+const\s+(\w+)/gmu)) names.add(m[1])
  for (const m of text.matchAll(/^export\s+class\s+(\w+)/gmu)) names.add(m[1])
  for (const m of text.matchAll(/^export\s*\{\s*([^}]*)\}\s*;?\s*$/gmu)) {
    for (const item of m[1].split(',').map((s) => s.trim()).filter((s) => s !== '')) {
      const parts = item.split(/\s+as\s+/u)
      names.add(parts.length > 1 ? parts[1].trim() : parts[0].trim())
    }
  }
  const body = text
    .replace(/^export\s+(?=(?:async\s+)?function\s+\w+)/gmu, '')
    .replace(/^export\s+(?=const\s+\w+)/gmu, '')
    .replace(/^export\s+(?=class\s+\w+)/gmu, '')
    .replace(/^export\s*\{[^}]*\}\s*;?\s*$/gmu, '')
  return { names: [...names], body }
}

/** 处理一个源文件：拆出 node 导入与相对依赖（支持跨行 import），剥掉 import 语句后返回正文。 */
function processSource(label, text, localDeps) {
  return text.replace(
    /^import\s+([\s\S]*?)\s+from\s+'([^']+)'\s*$/gmu,
    (full, rawClause, specifier) => {
      const clause = rawClause.replace(/\s+/gu, ' ').trim()
      if (!clause.startsWith('{')) throw new Error(`bundle: ${label} 只支持命名导入，遇到 → ${clause}`)
      noteImport(specifier, parseNamedClause(clause), localDeps)
      return ''
    },
  )
}

// ── 生成 ───────────────────────────────────────────────────
const chunks = []
chunks.push('/* eslint-disable */')
chunks.push('/**')
chunks.push(' * ⚠️ 本文件是构建产物 —— 不要直接编辑。')
chunks.push(' * 源文件：lib/host-entry.mjs + lib/core/*.mjs')
chunks.push(' * 重新生成：node D:/DSH/tavern-style/build/bundle-host.mjs')
chunks.push(' * 为什么单文件：DSH 的插件加载器对入口的相对子模块导入支持存疑（行会卡在 fiber loading）。')
chunks.push(' */')

const moduleChunks = []
for (const [name, rel] of CORE) {
  const text = readFileSync(join(ROOT, 'lib', rel), 'utf8')
  const localDeps = new Map()
  const bodyWithoutImports = processSource(rel, text, localDeps)
  const { names, body } = stripExports(bodyWithoutImports)
  const deps = [...localDeps.entries()]
    .map(([mod, items]) => `  const { ${toPattern(items)} } = __m.${mod};`)
    .join('\n')
  moduleChunks.push(
    `\n/* ── module: ${name} (${rel}) ───────────────────────────── */\n` +
      `__m.${name} = (() => {\n` +
      (deps === '' ? '' : deps + '\n') +
      body.trimEnd() +
      `\n  return { ${names.join(', ')} };\n})();\n`,
  )
}

const entryText = readFileSync(join(ROOT, 'lib', ENTRY), 'utf8')
const entryLocalDeps = new Map()
const entryBody = processSource(ENTRY, entryText, entryLocalDeps)
const entryDeps = [...entryLocalDeps.entries()]
  .map(([mod, items]) => `const { ${toPattern(items)} } = __m.${mod};`)
  .join('\n')

const header = [...nodeImports.entries()]
  .map(([specifier, items]) => `import { ${[...items].sort().join(', ')} } from '${specifier}';`)
  .join('\n')

const output =
  chunks.join('\n') +
  '\n' +
  header +
  '\n\nconst __m = {};\n' +
  moduleChunks.join('') +
  '\n/* ── plugin entry (' +
  ENTRY +
  ') ─────────────────────────────── */\n' +
  entryDeps +
  '\n' +
  entryBody.trimEnd() +
  '\n'

writeFileSync(join(ROOT, 'lib', 'index.js'), output, 'utf8')

const relative = (output.match(/from '\.\//gu) ?? []).length
console.log(`bundle 完成: lib/index.js  ${output.length} 字节`)
console.log(`  node 内置导入 ${nodeImports.size} 个来源 / 核心模块 ${CORE.length} 个`)
console.log(`  残留相对导入 ${relative} 处 ${relative === 0 ? '✓' : '✗（必须为 0）'}`)
process.exit(relative === 0 ? 0 : 1)
