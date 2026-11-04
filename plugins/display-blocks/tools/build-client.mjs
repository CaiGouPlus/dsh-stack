// 客户端单文件 bundle 生成器
//
//   node D:\DSH\display-blocks\tools\build-client.mjs
//
// 为什么需要构建：DSH 的客户端插件入口必须是一个**自注册的单文件**
// （`window.__ModuleLoader__.load({ id: <包名>, factory })`），宿主不会替你
// bundle —— 参考 dsh-tavern 的 484 KB `lib/client.manager.bundle.js` 与
// dsh-muv-engine 的 554 KB `lib/client.js`，都是预先打好的。
//
// 做法有意保持"笨"：本插件的四个模块只用了**单行 import** 与
// `export function` / `export const` 两种导出，所以剥掉 import 行、把
// `export ` 前缀去掉、按依赖顺序拼起来就够了 —— 不上 bundler，
// 免得给一个 30 KB 的插件引入一整套构建依赖。
//
// 生成物头部带 "GENERATED" 标记；改逻辑请改 lib/ 下的模块再重跑本脚本。

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.dirname(here)
const lib = path.join(root, 'lib')

/** 依赖顺序：spec 无依赖 → parse 依赖 spec → render 依赖两者 → client 依赖三者。 */
const MODULES = ['spec.js', 'parse.js', 'render.js', 'client.js']

const PKG = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const PLUGIN_ID = PKG.name

function transform(source, file) {
  const out = []
  for (const line of source.split(/\r?\n/)) {
    // 单行 import：直接丢掉（拼在一个作用域里，符号已可见）
    if (/^\s*import\s+.+from\s+['"]\.\/[^'"]+['"]\s*;?\s*$/.test(line)) continue
    if (/^\s*import\s+['"]\.\/[^'"]+['"]\s*;?\s*$/.test(line)) continue
    // 导出前缀：去掉，保留声明
    out.push(line.replace(/^(\s*)export\s+(function|const|let|var|class)\b/, '$1$2'))
  }
  let code = out.join('\n')
  // 裸 `export { ... }` 块：本插件没用，出现就直接拦下，避免生成物里残留语法错误
  if (/^\s*export\s*\{/m.test(code)) {
    throw new Error(`${file} 里出现了 export { } 块 —— 本构建器只支持 export function / export const`)
  }
  return code
}

const parts = []
for (const file of MODULES) {
  const full = path.join(lib, file)
  const source = fs.readFileSync(full, 'utf8')
  parts.push(`/* ────── ${file} ────── */\n` + transform(source, file))
}

const bundle = `// GENERATED FILE —— 不要直接编辑。
// 由 tools/build-client.mjs 从 lib/{spec,parse,render,client}.js 生成。
// 改逻辑请改那些模块，然后重跑：node tools/build-client.mjs
//
// 客户端入口契约（写错会让 Web boot 失败）：
//   自注册 window.__ModuleLoader__.load({ id, factory })，id 必须等于包名
//   （${PLUGIN_ID}）—— 不等会让加载器再执行一次同一 bundle，触发
//   duplicate factory registration。
//
// ⚠ 自注册**必须放在文件最前面并用字面量 id**：宿主与启动校验器都只读入口
//   开头的一段来确认注册 id（_verify_boot.mjs 的 clientWrapperId 只看前 4000
//   字符，且要求 id 是字符串字面量）。写成变量会判定为「未注册」。
(function () {
  'use strict';
  try {
    if (typeof window !== 'undefined' && window.__ModuleLoader__ && typeof window.__ModuleLoader__.load === 'function') {
      // factory 是闭包：真正被调用时 IIFE 已执行完，下面的 plugin 已初始化。
      window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: function () { return plugin; } });
    }
  } catch (e) {
    // 注册失败 = 插件不生效；绝不能把页面带崩。
    try { console.error('[display-blocks] 注册失败:', e); } catch (_) {}
  }

${parts.join('\n\n')}
})();
`

// ── 生成前自检：顶层重复声明的常见来源 ──
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

const target = path.join(lib, 'client.bundle.js')
fs.writeFileSync(target, bundle, 'utf8')
const size = fs.statSync(target).size
console.log(`[OK] 已生成 ${path.relative(root, target)}（${size} bytes，${MODULES.length} 个模块）`)
console.log(`     注册 id = ${PLUGIN_ID}`)
console.log(`     顶层常量自检通过：${[...declared.keys()].join(', ')}`)
