// 单文件 Demo 页生成器
//
//   node D:\DSH\display-blocks\tools\build-demo.mjs    →    demo\index.html
//
// 为什么要有构建：ES module 在 file:// 协议下会被 CORS 拦（双击打开必报错），
// 所以把 lib 四个模块（剥 import/export 后）与 demo 引导代码**内联**进一个
// HTML —— 产物单文件、零依赖、双击即开。
//
// 做法与 build-client.mjs 同一套「笨拼装」，并且拼的是**同一份源**：
// demo 渲染走 lib/render.js + lib/client.js 原生的 toDom 与 CSS，
// 保证「预览 = 实机」——预览里看到什么，DSH GUI 里就是什么。

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.dirname(here)
const lib = path.join(root, 'lib')

/** 与 build-client.mjs 相同的依赖顺序。 */
const MODULES = ['spec.js', 'parse.js', 'render.js', 'client.js']
const MARKER = '/*__DEMO_SCRIPT__*/'

function transform(source, file) {
  const out = []
  for (const line of source.split(/\r?\n/)) {
    // 单行 import：直接丢掉（拼在一个作用域里，符号已可见）
    if (/^\s*import\s+.+from\s+['"]\.\/[^'"]+['"]\s*;?\s*$/.test(line)) continue
    if (/^\s*import\s+['"]\.\/[^'"]+['"]\s*;?\s*$/.test(line)) continue
    // 导出前缀：去掉，保留声明
    out.push(line.replace(/^(\s*)export\s+(function|const|let|var|class)\b/, '$1$2'))
  }
  const code = out.join('\n')
  if (/^\s*export\s*\{/m.test(code)) {
    throw new Error(`${file} 里出现了 export { } 块 —— 本构建器只支持 export function / export const`)
  }
  return code
}

// ── 生成前自检：顶层常量重名（与 build-client 同一个坑） ──
const declared = new Map()
for (const file of MODULES) {
  const source = fs.readFileSync(path.join(lib, file), 'utf8')
  for (const m of source.matchAll(/^\s*(?:export\s+)?const\s+([A-Z][A-Z0-9_]{2,})\s*=/gm)) {
    const name = m[1]
    if (declared.has(name)) {
      throw new Error(`顶层常量 ${name} 在 ${declared.get(name)} 与 ${file} 里重复声明；` +
        '拼成一个作用域后会 SyntaxError，请改名或合并。')
    }
    declared.set(name, file)
  }
}

// ── 拼装脚本：四个模块 + demo 引导（内层 IIFE，自带独立作用域） ──
const parts = []
for (const file of MODULES) {
  parts.push(`/* ────── ${file} ────── */\n` + transform(fs.readFileSync(path.join(lib, file), 'utf8'), file))
}
const bootstrap = fs.readFileSync(path.join(here, 'demo-bootstrap.js'), 'utf8')

const script = [
  '// GENERATED —— 由 tools/build-demo.mjs 生成，不要直接编辑本文件。',
  '// 改这里：lib/{spec,parse,render,client}.js 与 tools/demo-bootstrap.js，',
  '// 然后重跑：node tools/build-demo.mjs',
  '(function () {',
  "  'use strict';",
  '',
  parts.join('\n\n'),
  '',
  bootstrap,
  '})();',
].join('\n')

// `</script` 会提前截断 <script> 标签 —— 拼装产物里绝不允许出现
if (/<\/script/i.test(script)) {
  throw new Error('生成物里出现了 </script 序列 —— 会截断 HTML，请检查 lib/ 或 demo-bootstrap.js')
}

// ── 套壳（HTML 与页面样式在 demo-shell.html 里维护） ──
const shellPath = path.join(here, 'demo-shell.html')
const shell = fs.readFileSync(shellPath, 'utf8')
const marks = shell.split(MARKER).length - 1
if (marks !== 1) throw new Error(`demo-shell.html 里 ${MARKER} 出现 ${marks} 次（应为 1 次）`)

// 用函数替换，避免 script 内容里的 $& / $' 等模式被 replace 二次解释
const html = shell.replace(MARKER, () => script)

const outDir = path.join(root, 'demo')
fs.mkdirSync(outDir, { recursive: true })
const target = path.join(outDir, 'index.html')
fs.writeFileSync(target, html, 'utf8')
console.log(`[OK] 已生成 ${path.relative(root, target)}（${fs.statSync(target).size} bytes，${MODULES.length} 个模块 + demo 引导）`)
console.log('     主题：亮 / 暗双主题由页面按钮切换；插件 CSS 未内嵌任何主题预设')
