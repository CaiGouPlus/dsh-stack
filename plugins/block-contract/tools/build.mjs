// 生成 lib/contract-text.js —— 把契约包里的文本**内嵌**进插件。
//
//   node tools/build.mjs [variant]
//
// 为什么要构建：契约包（D:\DSH\dnd-plugin\contract\display-blocks-pack.json）是**唯一真源**，
// 但插件不该在运行时依赖一个可能被挪走的外部文件。所以构建期把文本抄一份进插件，
// 运行时优先读契约包（改了不用重装插件）、读不到才退回内嵌版。
// 改了契约包之后**必须重跑本脚本**，否则内嵌的 fallback 会落后。

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.dirname(HERE)
const PACK = process.argv[3] || 'D:/DSH/dnd-plugin/contract/display-blocks-pack.json'
const VARIANT = process.argv[2] || 'generic'

if (!fs.existsSync(PACK)) {
  console.error('✖ 契约包不存在：' + PACK)
  process.exit(1)
}
const pack = JSON.parse(fs.readFileSync(PACK, 'utf8'))
const c = pack && pack.contracts && pack.contracts[VARIANT]
if (!c || typeof c !== 'object') {
  console.error('✖ 契约包里没有 variant「' + VARIANT + '」，可用：' + Object.keys((pack && pack.contracts) || {}).join('、'))
  process.exit(1)
}
const text = Object.keys(c)
  .filter((k) => k !== 'note' && typeof c[k] === 'string' && c[k].trim())
  .map((k) => c[k].trim())
  .join('\n\n')
if (!text.trim()) {
  console.error('✖ variant「' + VARIANT + '」里没有可注入的文本')
  process.exit(1)
}
// 非静默哨兵：这段文本要能被下游识别，缺了就说明取错了段
if (!text.includes('【展示块输出契约】')) {
  console.error('✖ 取到的文本里没有标记「【展示块输出契约】」—— 很可能抽错了段，**不要**用它。')
  process.exit(1)
}

const out = `// ⚠️ 自动生成，不要手改 —— 改 D:\\DSH\\dnd-plugin\\contract\\display-blocks-pack.json 后重跑：
//     node D:\\DSH\\block-contract\\tools\\build.mjs
// 来源：${path.basename(PACK)}  variant=${VARIANT}  构建于 ${new Date().toISOString()}
export const CONTRACT_TEXT = ${JSON.stringify(text)}
export const CONTRACT_SOURCE = ${JSON.stringify(path.basename(PACK) + '#' + VARIANT)}
export const CONTRACT_CHARS = ${text.length}
`
fs.writeFileSync(path.join(ROOT, 'lib', 'contract-text.js'), out, 'utf8')
console.log('[OK] 已生成 lib/contract-text.js（' + text.length + ' 字符，variant=' + VARIANT + '）')
console.log('     来源：' + PACK)
