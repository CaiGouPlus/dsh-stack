// tavern-tools 测试 —— ST 卡解析（lib/st-card.js）与全局正则库写入（lib/global-regex.js）
//
// 用 node --test 跑：node --test tests/st-card.test.js
// 纯函数模块，不依赖 cordis 上下文，也不碰真实 ~/.dsh 数据。

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import zlib from 'node:zlib'

import {
  CARD_SECTIONS,
  alternateGreetingsOf,
  cardBody,
  decodeCardPayload,
  depthPromptOf,
  extractCardFromPng,
  findEmbeddedBook,
  firstMessageOf,
  foldCardToDesc,
  isPng,
  normalizeBookEntries,
  normalizeStCard,
  parsePngTextChunks,
  regexScriptsOf,
  specVersion,
  unmappedFields
} from '../lib/st-card.js'
import { canCompile, locateGlobalRegexFile, readGlobalRegexFile, scriptId, upsertScripts } from '../lib/global-regex.js'

// ── 测试用 PNG 构造 ────────────────────────────────────────
// 解析器不校验 CRC（真实的卡也不会因为它坏掉），所以这里写占位 CRC 即可。
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4) // 占位
  return Buffer.concat([len, Buffer.from(type, 'ascii'), data, crc])
}

function makePng(textChunks) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(1, 0)
  ihdr.writeUInt32BE(1, 4)
  const parts = [PNG_SIG, chunk('IHDR', ihdr)]
  for (const [keyword, text] of textChunks) {
    parts.push(chunk('tEXt', Buffer.concat([Buffer.from(keyword, 'latin1'), Buffer.from([0]), Buffer.from(text, 'latin1')])))
  }
  parts.push(chunk('IEND', Buffer.alloc(0)))
  return Buffer.concat(parts)
}

function makeITXt(keyword, text) {
  const data = Buffer.concat([
    Buffer.from(keyword, 'latin1'), Buffer.from([0, 0, 0]), // keyword\0 compFlag=0 compMethod=0
    Buffer.from('en', 'latin1'), Buffer.from([0]),           // langTag\0
    Buffer.from([0]),                                        // translatedKeyword\0（空）
    Buffer.from(text, 'utf8')
  ])
  return chunk('iTXt', data)
}

function makeZTxt(keyword, text) {
  const data = Buffer.concat([
    Buffer.from(keyword, 'latin1'), Buffer.from([0, 0]), // keyword\0 compMethod=0
    zlib.deflateSync(Buffer.from(text, 'utf8'))
  ])
  return chunk('zTXt', data)
}

// 一张最小 v2 卡
const V2_CARD = {
  spec: 'chara_card_v2',
  spec_version: '2.0',
  data: {
    name: '测试角色',
    description: '【你是谁】你是测试角色。',
    personality: '冷淡、话少。',
    scenario: '雨夜的酒馆。',
    first_mes: '「你来了。」',
    mes_example: '<START>\n{{user}}: 你好\n{{char}}: 嗯。',
    system_prompt: '始终用短句。',
    post_history_instructions: '不要替玩家做决定。',
    alternate_greetings: ['「又来一个。」', '「坐吧。」'],
    creator: 'tester',
    creator_notes: '测试用卡',
    tags: ['测试'],
    character_version: '1.0',
    extensions: {
      depth_prompt: { prompt: '记住雨还在下。', depth: 4, role: 'system' },
      regex_scripts: [
        { scriptName: '去括号', findRegex: '/\\(.*?\\)/g', replaceString: '', markdownOnly: true }
      ]
    },
    character_book: {
      name: '测试世界书',
      entries: [
        { keys: ['酒馆'], content: '酒馆里有个老酒保。', enabled: true, insertion_order: 100 },
        { keys: ['雨'], secondary_keys: ['夜'], content: '雨夜路滑。', selective: true, case_sensitive: true },
        { content: '常驻设定：世界是低魔的。', constant: true, enabled: true },
        { keys: ['关掉'], content: '不该出现。', enabled: false }
      ]
    }
  }
}

// ── PNG 解析 ───────────────────────────────────────────────

test('isPng 只认 PNG 签名', () => {
  assert.equal(isPng(makePng([])), true)
  assert.equal(isPng(Buffer.from('{"name":"x"}')), false)
  assert.equal(isPng(Buffer.alloc(4)), false)
})

test('parsePngTextChunks 读出 tEXt / iTXt / zTXt 三种块', () => {
  const buffer = Buffer.concat([
    PNG_SIG,
    chunk('IHDR', Buffer.alloc(13)),
    chunk('tEXt', Buffer.concat([Buffer.from('chara', 'latin1'), Buffer.from([0]), Buffer.from('hello', 'latin1')])),
    makeITXt('note', '世界'),
    makeZTxt('packed', '压缩文本'),
    chunk('IEND', Buffer.alloc(0))
  ])
  const chunks = parsePngTextChunks(buffer)
  assert.deepEqual(chunks.map((c) => [c.keyword, c.text, c.kind]), [
    ['chara', 'hello', 'tEXt'],
    ['note', '世界', 'iTXt'],
    ['packed', '压缩文本', 'zTXt']
  ])
})

test('extractCardFromPng 优先 ccv3，其次 chara', () => {
  const v2 = Buffer.from(JSON.stringify(V2_CARD), 'utf8').toString('base64')
  const v3card = { spec: 'chara_card_v3', data: { name: 'V3 卡', description: 'x' } }
  const v3 = Buffer.from(JSON.stringify(v3card), 'utf8').toString('base64')
  const both = makePng([['chara', v2], ['ccv3', v3]])
  const hit = extractCardFromPng(both)
  assert.equal(hit.keyword, 'ccv3')
  assert.equal(cardBody(hit.card).name, 'V3 卡')

  const onlyV2 = extractCardFromPng(makePng([['chara', v2]]))
  assert.equal(onlyV2.keyword, 'chara')
  assert.equal(cardBody(onlyV2.card).name, '测试角色')
})

test('extractCardFromPng 关键字不认识时按内容兜底', () => {
  const payload = Buffer.from(JSON.stringify({ name: '怪卡', description: 'd' }), 'utf8').toString('base64')
  const hit = extractCardFromPng(makePng([['weird_key', payload]]))
  assert.ok(hit)
  assert.equal(cardBody(hit.card).name, '怪卡')
})

test('extractCardFromPng 无卡数据返回 null', () => {
  assert.equal(extractCardFromPng(makePng([['comment', '只是一段说明']])), null)
})

// ── 载荷解码 ───────────────────────────────────────────────

test('decodeCardPayload 认 JSON / base64 / URL-safe base64', () => {
  const obj = { name: '卡', description: 'd' }
  const json = JSON.stringify(obj)
  assert.deepEqual(decodeCardPayload(json), obj)
  assert.deepEqual(decodeCardPayload(Buffer.from(json, 'utf8').toString('base64')), obj)
  assert.deepEqual(decodeCardPayload(Buffer.from(json, 'utf8').toString('base64url')), obj)
  assert.equal(decodeCardPayload('既不是 JSON 也不是 base64'), null)
  assert.equal(decodeCardPayload(''), null)
})

// ── 内嵌世界书 ─────────────────────────────────────────────

test('findEmbeddedBook 从 data.character_book 取出条目', () => {
  const book = findEmbeddedBook(V2_CARD)
  assert.ok(book)
  assert.equal(book.entries.length, 4)
})

test('findEmbeddedBook 支持裸数组与 uid 字典两种形态', () => {
  const asArray = findEmbeddedBook({ character_book: [{ keys: ['a'], content: 'A' }] })
  assert.equal(asArray.entries.length, 1)
  const asMap = findEmbeddedBook({ character_book: { entries: { 0: { keys: ['a'], content: 'A' }, 1: { keys: ['b'], content: 'B' } } } })
  assert.equal(asMap.entries.length, 2)
})

test('normalizeBookEntries 合并 keys∪keywords，保留 ST 语义字段', () => {
  const entries = normalizeBookEntries(findEmbeddedBook(V2_CARD).entries)
  assert.equal(entries.length, 4)

  const first = entries[0]
  assert.deepEqual(first.keys, ['酒馆'])
  assert.deepEqual(first.keywords, ['酒馆'])
  assert.equal(first.name, '酒馆里有个老酒保。'.slice(0, 30)) // 无 name/comment → 从正文首行提取标题
  assert.equal(first.enabled, true)
  assert.equal(first.insertion_order, 100)

  const selective = entries[1]
  assert.deepEqual(selective.secondary_keys, ['夜'])
  assert.equal(selective.selective, true)
  assert.equal(selective.case_sensitive, true)

  const constant = entries[2]
  assert.equal(constant.constant, true)
  assert.deepEqual(constant.keys, [])
  assert.equal(entries[3].enabled, false)
})

test('normalizeBookEntries 的 text 与 content 同步（面板两字段都可能被读）', () => {
  const [entry] = normalizeBookEntries([{ keys: ['k'], content: '正文' }])
  assert.equal(entry.content, '正文')
  assert.equal(entry.text, '正文')
})

// ── 字段折叠 ───────────────────────────────────────────────

test('foldCardToDesc 按 ST 组装顺序折叠，跳过空分区', () => {
  const { desc, sections } = foldCardToDesc(V2_CARD)
  assert.deepEqual(sections.map((s) => s.key), [
    'description', 'personality', 'scenario', 'mes_example', 'system_prompt', 'post_history_instructions'
  ])
  const order = sections.map((s) => desc.indexOf(`【${s.title}】`))
  assert.deepEqual(order, [...order].sort((a, b) => a - b), '分区标题必须按声明顺序出现')
  assert.ok(desc.includes('你是测试角色'))
  assert.ok(desc.includes('雨夜的酒馆'))
  assert.ok(desc.includes('始终用短句'))
})

test('foldCardToDesc 不折叠不存在的分区', () => {
  const { desc, sections } = foldCardToDesc({ data: { name: 'x', description: '只有设定' } })
  assert.deepEqual(sections.map((s) => s.key), ['description'])
  assert.equal(desc, '【角色设定】\n只有设定')
})

test('foldCardToDesc 不改写正文里的模板', () => {
  const { desc } = foldCardToDesc({ data: { name: 'x', description: 'A {{char}} B <% if (x) { %> C' } })
  assert.ok(desc.includes('{{char}}'))
  assert.ok(desc.includes('<% if (x) { %>'))
})

test('v1 卡（无 data 信封）同样能折', () => {
  const { desc, sections } = foldCardToDesc({ name: 'v1', char_persona: '设定', world_scenario: '场景' })
  assert.deepEqual(sections.map((s) => s.key), ['description', 'scenario'])
  assert.ok(desc.includes('设定') && desc.includes('场景'))
})

test('firstMessageOf 认三种开场白字段名', () => {
  assert.equal(firstMessageOf({ first_mes: 'a' }), 'a')
  assert.equal(firstMessageOf({ data: { first_message: 'b' } }), 'b')
  assert.equal(firstMessageOf({ data: { char_greeting: 'c' } }), 'c')
})

test('alternateGreetingsOf 过滤空项', () => {
  assert.deepEqual(alternateGreetingsOf({ data: { alternate_greetings: ['a', '', '  ', 'b'] } }), ['a', 'b'])
  assert.deepEqual(alternateGreetingsOf({}), [])
})

// ── 正则脚本 ───────────────────────────────────────────────

test('regexScriptsOf 认三种存放形态', () => {
  assert.equal(regexScriptsOf({ data: { extensions: { regex_scripts: [1] } } }).length, 1)
  assert.equal(regexScriptsOf({ regexScripts: [1, 2] }).length, 2)
  assert.equal(regexScriptsOf({ data: { regex_scripts: [1] } }).length, 1)
  assert.equal(regexScriptsOf({}).length, 0)
})

test('depthPromptOf 取出作者注记', () => {
  const dp = depthPromptOf(V2_CARD)
  assert.equal(dp.prompt, '记住雨还在下。')
  assert.equal(dp.depth, 4)
  assert.equal(depthPromptOf({ data: { extensions: {} } }), null)
})

// ── 顶层归一化 ─────────────────────────────────────────────

test('normalizeStCard 汇总一张卡的全部信息', () => {
  const n = normalizeStCard(V2_CARD)
  assert.equal(n.name, '测试角色')
  assert.equal(n.spec, 'chara_card_v2')
  assert.equal(n.first, '「你来了。」')
  assert.equal(n.altGreetings.length, 2)
  assert.equal(n.book.entries.length, 4)
  assert.equal(n.book.name, '测试世界书')
  assert.equal(n.regexScripts.length, 1)
  assert.equal(n.creator, 'tester')
  assert.deepEqual(n.tags, ['测试'])
  assert.ok(n.desc.length > 0)
})

test('specVersion 兜底成 chara_card_v1?', () => {
  assert.equal(specVersion(V2_CARD), 'chara_card_v2')
  assert.equal(specVersion({ name: 'x' }), 'chara_card_v1?')
})

test('unmappedFields 列出没被映射的字段（归档报告用）', () => {
  const rest = unmappedFields(V2_CARD)
  assert.ok(rest.includes('creator'))
  assert.ok(rest.includes('tags'))
  assert.ok(!rest.includes('description'), 'description 是映射字段，不该出现在未映射清单里')
})

test('CARD_SECTIONS 的分区键唯一', () => {
  const keys = CARD_SECTIONS.map((s) => s.key)
  assert.equal(new Set(keys).size, keys.length)
})

// ── 全局正则库 ─────────────────────────────────────────────

test('canCompile 认裸模式与 /…/flags 字面量，拒绝坏模式', () => {
  assert.equal(canCompile('abc'), true)
  assert.equal(canCompile('/abc/gi'), true)
  assert.equal(canCompile('/(/'), false)
  assert.equal(canCompile(''), false)
  assert.equal(canCompile(undefined), false)
})

test('scriptId 是确定性的 gr_ + 12 位十六进制', () => {
  const a = scriptId('名字', '/(/g')
  assert.match(a, /^gr_[0-9a-f]{12}$/)
  assert.equal(a, scriptId('名字', '/(/g'))
  assert.notEqual(a, scriptId('名字2', '/(/g'))
})

test('upsertScripts 新增 / 覆盖 / 跳过坏条目', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tavern-tools-regex-'))
  const file = path.join(dir, 'global-regex.json')
  try {
    const good = { scriptName: '去括号', findRegex: '/\\(.*?\\)/g', replaceString: '', markdownOnly: true }
    const first = upsertScripts(file, [good, { scriptName: '坏的', findRegex: '/(/' }, { scriptName: '空的' }])
    assert.equal(first.added, 1)
    assert.equal(first.replaced, 0)
    assert.equal(first.skipped, 2)
    assert.equal(first.total, 1)

    // 同名同式再导入 → 覆盖，不新增
    const second = upsertScripts(file, [good, { scriptName: '新脚本', findRegex: 'x', replaceString: 'y' }])
    assert.equal(second.added, 1)
    assert.equal(second.replaced, 1)
    assert.equal(second.total, 2)

    const stored = readGlobalRegexFile(file)
    assert.equal(stored.length, 2)
    assert.equal(stored[0].id, scriptId('去括号', '/\\(.*?\\)/g'))
    assert.equal(stored[0].markdownOnly, true)
    assert.equal(stored[0].disabled, false)
    assert.equal(stored[1].replaceString, 'y')
    assert.equal(stored[0].maxDepth, null, '未给的深度字段落成 null，与引擎口径一致')
    assert.ok(stored[0].importedAt)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('upsertScripts 超过 200 条上限时拒绝超出部分且不整批失败', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tavern-tools-regex-cap-'))
  const file = path.join(dir, 'global-regex.json')
  try {
    const batch = Array.from({ length: 205 }, (_, i) => ({ scriptName: `s${i}`, findRegex: `p${i}` }))
    const result = upsertScripts(file, batch)
    assert.equal(result.added, 200)
    assert.equal(result.skipped, 5)
    assert.equal(result.total, 200)
    assert.ok(result.reasons.some((r) => r.includes('库已满')))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('locateGlobalRegexFile 优先 $MUV_ENGINE_DATA_DIR', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tavern-tools-env-'))
  const prev = process.env.MUV_ENGINE_DATA_DIR
  try {
    process.env.MUV_ENGINE_DATA_DIR = dir
    const located = locateGlobalRegexFile(path.join(dir, 'no-such-dsh-home'))
    assert.ok(located)
    assert.equal(located.source, 'MUV_ENGINE_DATA_DIR')
    assert.equal(located.file, path.join(dir, 'global-regex.json'))
  } finally {
    if (prev === undefined) delete process.env.MUV_ENGINE_DATA_DIR
    else process.env.MUV_ENGINE_DATA_DIR = prev
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('locateGlobalRegexFile 找不到引擎时返回 null', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tavern-tools-none-'))
  const prev = process.env.MUV_ENGINE_DATA_DIR
  try {
    delete process.env.MUV_ENGINE_DATA_DIR
    assert.equal(locateGlobalRegexFile(dir), null)
  } finally {
    if (prev !== undefined) process.env.MUV_ENGINE_DATA_DIR = prev
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
