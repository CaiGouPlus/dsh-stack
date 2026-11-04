// 客户端入口契约自检（与 D:\DSH\_verify_boot.mjs 的 clientWrapperId 同一判据）
//
//   node D:\DSH\display-blocks\tools\check-client-entry.mjs
//
// 两条硬要求：
//   ① 客户端入口开头（前 4000 字符）里能找到 __ModuleLoader__.load({ id: "…" })
//      且 id 是**字符串字面量**（写成变量会被判定为「未注册」）；
//   ② 该 id 必须等于包名，否则加载器会重复执行同一 bundle，
//      触发 duplicate factory registration，Web boot 直接失败。

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const entry = pkg.exports?.['./client']
const rel = typeof entry === 'string' ? entry : entry?.default
const file = path.join(root, rel ?? 'lib/client.bundle.js')

let failed = 0
const ok = (cond, good, bad) => {
  console.log((cond ? '  ✔ ' : '  ✖ ') + (cond ? good : bad))
  if (!cond) failed++
}

console.log(`客户端入口：${path.relative(root, file)}`)
if (!fs.existsSync(file)) {
  console.log('  ✖ 文件不存在 —— 先跑 node tools/build-client.mjs')
  process.exit(1)
}

const text = fs.readFileSync(file, 'utf8')
const head = text.slice(0, 4000)

const m = /__ModuleLoader__\.load\(\s*\{\s*(?:\/\/[^\n]*\n\s*)*id\s*:\s*["']([^"']+)["']/u.exec(head)
ok(!!m, '前 4000 字符内找到字面量 id', '前 4000 字符内找不到 __ModuleLoader__.load({ id: "…" })（判据要求字符串字面量）')
const id = m ? m[1] : ''
const stripped = id.endsWith('/client') ? id.slice(0, -7) : id
ok(stripped === pkg.name, `注册 id 等于包名（${id}）`, `注册 id 是 "${id}"，必须等于包名 "${pkg.name}"`)
ok(!/^\s*(import|export)\s/m.test(text), '生成物里没有 ESM import/export 残留', '生成物里残留了 import/export —— 浏览器按普通 script 加载会语法错误')

// 最强的检查：把 bundle 真的跑一遍（假装是浏览器），并调用 factory。
// 语法错误 / 顶层重名 / 自注册写错，这里全都会当场炸出来 ——
// 比拿正则数 `const` 可靠得多（正则会把函数内部的缩进声明也数进去，误报）。
try {
  const calls = []
  globalThis.window = {
    __ModuleLoader__: { load: (spec) => calls.push(spec) },
    localStorage: { getItem: () => null, setItem: () => {} },
    setInterval: () => 0,
    clearInterval: () => {},
  }
  globalThis.document = {
    readyState: 'complete',
    getElementById: () => null,
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} }),
    addEventListener: () => {},
    head: { appendChild: () => {} },
    body: { nodeType: 1 },
    createTreeWalker: () => ({ nextNode: () => null }),
    createTextNode: (t) => ({ text: t }),
    createDocumentFragment: () => ({ appendChild() {} }),
  }
  globalThis.NodeFilter = { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 }
  globalThis.MutationObserver = class { observe() {} disconnect() {} }

  await import(new URL(`file://${file.replace(/\\/g, '/')}`).href + `?t=${Date.now()}`)

  ok(calls.length === 1, 'bundle 执行后正好自注册 1 次', `自注册了 ${calls.length} 次（应为 1）`)
  const spec = calls[0]
  const plugin = spec && typeof spec.factory === 'function' ? spec.factory() : null
  ok(!!plugin && typeof plugin.apply === 'function', 'factory() 返回带 apply 的插件对象', 'factory() 没有返回可用的插件对象')
  ok(!!plugin && typeof plugin.name === 'string' && plugin.name.length > 0, `插件名 = ${plugin && plugin.name}`, '插件缺 name')
} catch (error) {
  ok(false, '', `bundle 无法执行：${error && error.message}`)
}

console.log(failed ? `\n${failed} 项不通过` : '\n客户端入口契约全部通过。')
process.exit(failed ? 1 : 0)
