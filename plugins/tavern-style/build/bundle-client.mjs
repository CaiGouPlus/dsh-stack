/**
 * 把 lib/client-src/*.js 按文件名顺序拼接成**单文件** lib/client.js（构建产物）。
 *
 * 与 host 侧 bundle-host.mjs 同一思路：DSH 加载器只吃单文件客户端 bundle
 * （window.__ModuleLoader__.load({ id: 包名, factory })）。
 *
 * 源码约定（各 client-src 文件共享工厂作用域）：
 *   - 不要写 import / export（打包器会拒绝）；
 *   - `React`、`h`、`require`、`module`、`exports` 由本脚本在工厂头部注入；
 *   - 文件按名字典序拼接，跨文件引用只在**运行时**发生（渲染函数里），保持顺序无关。
 *
 * 用法：node D:\DSH\tavern-style\build\bundle-client.mjs
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'D:/DSH/tavern-style'
const SRC = join(ROOT, 'lib', 'client-src')
const OUT = join(ROOT, 'lib', 'client.js')
const PACKAGE_ID = '@local/dsh-tavern-style'

const files = readdirSync(SRC).filter((f) => f.endsWith('.js')).sort()
if (files.length === 0) {
  console.error('bundle: lib/client-src/ 里没有 .js 源文件')
  process.exit(1)
}

const chunks = []
for (const f of files) {
  const text = readFileSync(join(SRC, f), 'utf8')
  const badImport = text.match(/^\s*import\s/gmu)
  const badExport = text.match(/^\s*export\s/gmu)
  if (badImport || badExport) {
    console.error(`bundle: ${f} 里不允许 import/export（各源文件共享工厂作用域，跨文件直接用名字）`)
    process.exit(1)
  }
  chunks.push(`/* ── client-src/${f} ─────────────────────────────── */\n` + text.trimEnd() + '\n')
}

const header = [
  '/* eslint-disable */',
  '/**',
  ' * ⚠️ 本文件是构建产物 —— 不要直接编辑。',
  ' * 源文件：lib/client-src/*.js（按文件名顺序拼接）',
  ' * 重新生成：node D:/DSH/tavern-style/build/bundle-client.mjs',
  ' *',
  ' * 包装格式与 id 约定（实测规格）：',
  ` *   - window.__ModuleLoader__.load({ id, factory }) 里的 id 必须是「包名」${PACKAGE_ID}，`,
  ' *     不是 cordis.patch.yml 的行 id；写错会导致 duplicate factory registration、web boot 失败。',
  ' *   - 组件函数被真实 React 调用时签名是 (props, legacyContext)：子节点一律走 kid()。',
  ' *   - 数组里的子节点必须 h(Comp, {key})，不要直接调用 Comp(...)。',
  ' */',
  '',
  'window.__ModuleLoader__.load({',
  `  id: ${JSON.stringify(PACKAGE_ID)},`,
  '  factory: (require) => {',
  '    var module = { exports: {} };',
  '    var exports = module.exports;',
  '    var React = require("react");',
  '    var h = React.createElement;',
  '',
].join('\n')

const output = header + chunks.join('\n') + '\n    return module.exports;\n  },\n});\n'
writeFileSync(OUT, output, 'utf8')

const relative = (output.match(/^\s*import\s/gmu) ?? []).length
console.log(`bundle 完成: lib/client.js  ${output.length} 字节  源文件 ${files.length} 个`)
console.log(`  源文件: ${files.join(', ')}`)
console.log(`  残留 import ${relative} 处 ${relative === 0 ? '✓' : '✗（必须为 0）'}`)
process.exit(relative === 0 ? 0 : 1)
