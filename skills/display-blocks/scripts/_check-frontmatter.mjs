// frontmatter 契约自检（dsh 只认顶层，写错会被**静默丢弃**，所以要能自查）
//
//   node _check-frontmatter.mjs [SKILL.md ...]
//
// 校验：name 是否 kebab-case、description 是否存在且够长、布尔值是否严格合法、
// 以及「目录名 vs name」是否一致。

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [path.join(path.dirname(HERE), 'SKILL.md')]

let bad = 0
const ok = (cond, good, why) => {
  console.log(`  ${cond ? '✔' : '✖'} ${good}`)
  if (!cond) bad++
}

for (const file of targets) {
  console.log(`\n${file}`)
  if (!fs.existsSync(file)) { ok(false, '文件存在', '找不到文件'); continue }
  const text = fs.readFileSync(file, 'utf8')
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) { ok(false, '有 frontmatter 块', '缺少开头的 --- 块，整个 skill 会被静默丢弃'); continue }
  const fm = m[1]

  const name = (fm.match(/^name:[ \t]*(.+)$/m) || [])[1]
  const cleanName = (name || '').trim()
  ok(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(cleanName), `name 是 kebab-case（${cleanName || '空'}）`,
    'name 必须匹配 ^[a-z0-9]+(-[a-z0-9]+)*$，否则 skill 被丢弃')

  const dir = path.basename(path.dirname(file))
  ok(cleanName === dir, `目录名与 name 一致（${dir}）`, `目录名 ${dir} 与 name ${cleanName} 不一致`)

  const desc = (fm.match(/^description:[ \t]*(.+)$/m) || [])[1]
  ok(!!desc && desc.trim().length >= 40, `description 存在且够长（${desc ? desc.trim().length : 0} 字）`,
    'description 太短：模型靠它决定是否调用，要把触发词写全')
  if (desc) {
    // 通用判据：本项目约定把触发词用「」列在 description 里，至少 3 个。
    // （早先这里硬编码了 display-blocks 专用词「机器块/展示块/…」，导致别的 skill 一律假失败。）
    const quoted = (desc.match(/「[^」]{1,40}」/g) || [])
    ok(quoted.length >= 3, `description 列了 ${quoted.length} 个「」触发词`,
      '触发词偏少：把用户会怎么问的词写进「」里，模型靠它决定是否调用')
  }

  for (const line of fm.split(/\r?\n/)) {
    const b = /^(user-invocable|disable-model-invocation|whenToUse)\s*:\s*(.*)$/.exec(line)
    if (!b) continue
    const k = b[1]
    const v = b[2].trim()
    if (k === 'whenToUse') {
      ok(v.length > 0, 'whenToUse 非空', 'whenToUse 不能为空')
      continue
    }
    ok(/^(true|false|yes|no|on|off|1|0)$/i.test(v), `${k} 是合法布尔（${v}）`,
      `${k} 的值「${v}」不是合法布尔 → 整个 skill 会被丢弃（不会退化成默认）`)
  }

  const refs = ['references', 'scripts', 'assets']
  const missing = refs.filter((r) => new RegExp(`${r}/`).test(text) && !fs.existsSync(path.join(path.dirname(file), r)))
  ok(!missing.length, '正文引用的目录都存在', `正文提到但目录不存在：${missing.join('、')}`)
}

console.log(bad ? `\n${bad} 项不通过` : '\n✔ frontmatter 契约全部通过')
process.exit(bad ? 1 : 0)
