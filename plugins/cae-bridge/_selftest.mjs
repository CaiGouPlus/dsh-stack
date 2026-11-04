// 插件离线自测：把 index.js 的宿主依赖换成桩，直接跑工具函数。
// 不依赖 DSH 进程，用来在重启前确认每条命令都拼对了。
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const src = readFileSync('D:\\DSH\\cae-bridge\\index.js', 'utf8')
const patched = src.replace(
  "import { defineTool } from '@deepseek-ai/dsh-tools'",
  'const defineTool = (o) => o',
)
const tmp = 'D:\\DSH\\cae-bridge\\.selftest.mjs'
writeFileSync(tmp, patched, 'utf8')

const mod = await import(pathToFileURL(tmp).href + '?t=' + Date.now())
const tools = new Map()
mod.apply({ tools: { register: (t) => tools.set(t.name, t) } })
console.log('registered:', [...tools.keys()].join(', '))

const which = process.argv[2] || 'env'
const tool = tools.get('cae_' + which)
if (!tool) {
  console.log('no such tool')
  process.exit(1)
}
const args = process.argv[3] ? JSON.parse(process.argv[3]) : {}
const t0 = Date.now()
const out = await tool.execute(args, {})
console.log('elapsed_ms', Date.now() - t0)
console.log(JSON.stringify(out, null, 2).slice(0, 1500))
