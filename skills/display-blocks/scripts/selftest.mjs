// 自检：证明 check-blocks.mjs 真的能抓错（而不是永远说 OK）。
//
//   node selftest.mjs
//
// 5 个用例：1 个合格必须过，4 个坏样本必须被拦。**任一条不符就非零退出**。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const CHECKER = path.join(HERE, 'check-blocks.mjs')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsp-selftest-'))

const GOOD = '正文（传说）级的东西。\n\n' +
  '[[人物]]{"名":"测试","类型":"人物","稀有度":"传说","节":[{"名":"外貌","值":"白发"},' +
  '{"名":"服装","值":["长袍","杖"]},{"名":"状态","色":"橙","值":{"生命":"良好"}}],"备注":"ok"}\n'

const CASES = [
  { name: '合格样本', text: GOOD, expectFail: false },
  {
    name: 'JSON 跨多行（本插件能解析，只提示）',
    text: '[[人物]]{"名":"测试",\n"类型":"人物",\n"节":{"外貌":"白发","服装":["长袍"]}}',
    expectFail: false,
  },
  {
    name: 'JSON 尾逗号',
    text: '[[人物]]{"名":"测试","类型":"人物",}',
    expectFail: true,
  },
  {
    name: '单引号',
    text: "[[人物]]{'名':'测试','类型':'人物'}",
    expectFail: true,
  },
  {
    name: '中文引号',
    text: '[[人物]]{“名”:“测试”,“类型”:“人物”}',
    expectFail: true,
  },
  {
    name: '颜色解析不出来',
    text: '[[人物]]{"名":"测试","类型":"人物","色":"这个不是颜色","字段":{"a":"b"}}',
    expectFail: true,
  },
  {
    name: '全是空节的空卡',
    text: '[[人物]]{"名":"测试","类型":"人物","节":[{"名":"外貌","值":""}]}',
    expectFail: true,
  },
]

let bad = 0
for (const [i, c] of CASES.entries()) {
  const file = path.join(tmp, `case${i}.md`)
  fs.writeFileSync(file, c.text, 'utf8')
  const r = spawnSync(process.execPath, [CHECKER, file], { encoding: 'utf8' })
  const failed = r.status !== 0
  const ok = failed === c.expectFail
  if (!ok) bad++
  console.log(`${ok ? '✔' : '✖'} ${c.name}：期望${c.expectFail ? '拦截' : '通过'}，实际退出码 ${r.status}`)
  if (!ok) console.log((r.stdout || '') + (r.stderr || ''))
}

const blocked = CASES.filter((c) => c.expectFail).length
console.log(bad
  ? `\n${bad} 条不符合预期`
  : `\n✔ 校验器自检通过（合格样本放行，${blocked} 类坏样本全部拦下）`)
process.exit(bad ? 1 : 0)
