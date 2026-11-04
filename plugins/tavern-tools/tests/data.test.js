// 酒馆工具层 —— 数据层测试（纯函数 + 临时目录，不碰真实数据）
//
// 重点覆盖两件容易悄悄回归的事：
//   1. 预设解析**不允许静默兜底**（写工具写错预设 = 数据事故，这条必须有测试钉住）；
//   2. 世界书检索的关键语义（显式多词短语不被切碎、标题/keys/正文的加权顺序）。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  CARD_INJECTED_FIELDS,
  cardIndex,
  cardInjectedText,
  entryKeys,
  entryRef,
  getPresetDir,
  listPresets,
  readCharacters,
  readPresetModules,
  readWorldbookEntries,
  readWorldbookRaw,
  resolvePreset,
  searchEntries,
  writeCharacters,
  writeJsonAtomic,
  writePresetModules,
  writeWorldbookRaw
} from '../lib/data.js'

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tavern-tools-test-'))
}

function mkPreset(root, dir, { characters, worldbooks, modules } = {}) {
  const full = path.join(root, dir)
  fs.mkdirSync(full, { recursive: true })
  fs.writeFileSync(path.join(full, 'preset.yml'), `name: ${dir} 显示名\n`, 'utf8')
  fs.writeFileSync(path.join(full, 'agent.cordis.yml'), '- id: persona\n  config:\n    prefix: |-\n      占位\n', 'utf8')
  if (characters) writeCharacters(full, characters)
  if (worldbooks) writeJsonAtomic(path.join(full, 'worldbooks.json'), worldbooks)
  if (modules) writePresetModules(full, modules)
  return full
}

// ── 预设解析：禁止静默兜底 ─────────────────────────────────
test('resolvePreset：显式 presetId 命中', () => {
  const root = tmpRoot()
  mkPreset(root, 'alpha')
  const r = resolvePreset(root, '', 'alpha')
  assert.equal(r.ok, true)
  assert.equal(r.presetId, 'alpha')
  assert.equal(r.source, 'argument')
})

test('resolvePreset：显式 presetId 不存在时明确失败', () => {
  const root = tmpRoot()
  mkPreset(root, 'alpha')
  const r = resolvePreset(root, '', 'nope')
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'explicit-unknown')
  assert.deepEqual(r.available, ['alpha'])
})

test('resolvePreset：本会话无绑定记录 → 失败而不是退回默认预设', () => {
  const root = tmpRoot()
  mkPreset(root, 'tavern-lite')
  mkPreset(root, 'alpha')
  const r = resolvePreset(root, 'session-xyz')
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'unbound')
  // 关键断言：即便存在 tavern-lite，也不许自动选中它
  assert.equal(r.presetId, undefined)
})

test('resolvePreset：legacy 记账视为未绑定（与面板语义一致）', () => {
  const root = tmpRoot()
  mkPreset(root, 'alpha')
  writeJsonAtomic(path.join(root, 'session-bindings.json'), {
    'session-a': { mode: 'preset', presetId: 'alpha', source: 'legacy' }
  })
  const r = resolvePreset(root, 'session-a')
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'legacy-binding')
})

test('resolvePreset：非 legacy 绑定可用', () => {
  const root = tmpRoot()
  mkPreset(root, 'alpha')
  writeJsonAtomic(path.join(root, 'session-bindings.json'), {
    'session-a': { mode: 'preset', presetId: 'alpha', source: 'panel' }
  })
  const r = resolvePreset(root, 'session-a')
  assert.equal(r.ok, true)
  assert.equal(r.presetId, 'alpha')
  assert.equal(r.source, 'binding')
})

test('resolvePreset：绑定指向已不存在的预设 → 失败（fail closed）', () => {
  const root = tmpRoot()
  writeJsonAtomic(path.join(root, 'session-bindings.json'), {
    'session-a': { mode: 'preset', presetId: 'ghost', source: 'panel' }
  })
  const r = resolvePreset(root, 'session-a')
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'binding-invalid')
})

// ── 预设发现 ───────────────────────────────────────────────
test('listPresets：合并注册表与磁盘，注册表的 dir 可不同于 id', () => {
  const root = tmpRoot()
  mkPreset(root, 'tavern-lite')
  mkPreset(root, 'extra')
  writeJsonAtomic(path.join(root, 'presets.json'), {
    presets: [{ id: 'default', dir: 'tavern-lite', name: '默认预设' }]
  })
  const all = listPresets(root)
  const ids = all.map((p) => p.id).sort()
  assert.deepEqual(ids, ['default', 'extra', 'tavern-lite'])
  assert.equal(getPresetDir(root, 'default'), path.join(root, 'tavern-lite'))
  assert.equal(getPresetDir(root, 'ghost'), '')
})

// ── 角色卡 ─────────────────────────────────────────────────
test('角色卡：只有 desc/first/text/content 计入注入字数', () => {
  const card = { name: 'A', desc: '描述', first: '开场白', personality: '不该计入', scenario: '也不计' }
  assert.equal(cardInjectedText(card), '描述\n开场白')
  const idx = cardIndex(card)
  assert.equal(idx.name, 'A')
  assert.equal(idx.enabled, true)
  assert.equal(idx.injectedChars, '描述\n开场白'.length)
  assert.deepEqual([...CARD_INJECTED_FIELDS], ['desc', 'first', 'text', 'content'])
})

test('角色卡：enabled 缺省视为启用，显式 false 才是禁用', () => {
  assert.equal(cardIndex({ name: 'A' }).enabled, true)
  assert.equal(cardIndex({ name: 'A', enabled: false }).enabled, false)
})

test('角色卡：读写往返（含中文与非 ASCII 名）', () => {
  const root = tmpRoot()
  const dir = mkPreset(root, 'alpha', { characters: [{ name: '莉亚·风暴', desc: '设定正文' }] })
  const cards = readCharacters(dir)
  assert.equal(cards.length, 1)
  assert.equal(cards[0].name, '莉亚·风暴')
  cards[0].desc = '改过的设定'
  writeCharacters(dir, cards)
  assert.equal(readCharacters(dir)[0].desc, '改过的设定')
})

test('角色卡：characters.json 损坏时返回空数组而不是抛错', () => {
  const root = tmpRoot()
  const dir = mkPreset(root, 'alpha', { characters: [{ name: 'A' }] })
  fs.writeFileSync(path.join(dir, 'characters.json'), '{ 这不是 JSON', 'utf8')
  assert.deepEqual(readCharacters(dir), [])
})

// ── 世界书：格式归一化 ─────────────────────────────────────
test('世界书：v2 对象格式', () => {
  const root = tmpRoot()
  const dir = mkPreset(root, 'alpha', {
    worldbooks: {
      version: 2,
      injectMode: 'keyword',
      groups: [{ name: '组一', enabled: true, entries: [{ name: '条目', keys: ['a'], content: '正文' }] }]
    }
  })
  const wb = readWorldbookEntries(dir)
  assert.equal(wb.format, 'v2')
  assert.equal(wb.injectMode, 'keyword')
  assert.equal(wb.entries.length, 1)
  assert.equal(entryRef(wb.entries[0]), '组一#1')
})

test('世界书：旧数组格式被识别且 ref 一致', () => {
  const root = tmpRoot()
  const dir = mkPreset(root, 'alpha', {
    worldbooks: [{ name: '旧组', entries: [{ name: 'X', keywords: ['k'], content: 'c' }] }]
  })
  const wb = readWorldbookEntries(dir)
  assert.equal(wb.format, 'legacy-array')
  assert.equal(entryRef(wb.entries[0]), '旧组#1')
  assert.deepEqual(wb.entries[0].keys, ['k'])
})

test('世界书：组禁用会连带条目视为未启用', () => {
  const root = tmpRoot()
  const dir = mkPreset(root, 'alpha', {
    worldbooks: [{ name: 'g', enabled: false, entries: [{ name: 'e', content: 'c' }] }]
  })
  assert.equal(readWorldbookEntries(dir).entries[0].enabled, false)
})

test('世界书：文件缺失时给出空 v2 容器，不改写磁盘', () => {
  const root = tmpRoot()
  const dir = mkPreset(root, 'alpha')
  const raw = readWorldbookRaw(dir)
  assert.equal(raw.kind, 'missing')
  assert.deepEqual(raw.value.groups, [])
  assert.equal(fs.existsSync(path.join(dir, 'worldbooks.json')), false)
})

test('世界书：keys ∪ keywords 并集去重', () => {
  assert.deepEqual(entryKeys({ keys: ['a', 'b'], keywords: ['b', 'c'] }), ['a', 'b', 'c'])
  assert.deepEqual(entryKeys({ keys: ['  '], keywords: [] }), [])
  assert.deepEqual(entryKeys({}), [])
})

test('世界书：写入旧数组格式时会升级为 v2', () => {
  const root = tmpRoot()
  const dir = mkPreset(root, 'alpha', { worldbooks: [{ name: 'g', entries: [] }] })
  const raw = readWorldbookRaw(dir)
  assert.equal(raw.kind, 'legacy-array')
  // 触发容器升级（与工具实现同一路径）
  if (raw.kind === 'legacy-array') { raw.value = { version: 2, injectMode: 'full', groups: raw.value }; raw.kind = 'v2' }
  writeWorldbookRaw(dir, raw)
  assert.equal(readWorldbookRaw(dir).kind, 'v2')
  assert.equal(readWorldbookEntries(dir).format, 'v2')
})

// ── 世界书检索 ─────────────────────────────────────────────
function entriesFrom(list) {
  return list.map((e, i) => ({
    group: 'g',
    gi: 0,
    ei: i,
    entry: e,
    enabled: e.enabled !== false,
    content: e.content || '',
    keys: entryKeys(e)
  }))
}

test('检索：标题命中排在 keys 命中与正文命中之前', () => {
  const entries = entriesFrom([
    { name: '无关', content: '正文里提到 骰池' },
    { name: '其它', keys: ['骰池'], content: 'x' },
    { name: '骰池规则', content: 'y' }
  ])
  const hit = searchEntries(entries, '骰池', { limit: 3 })
  assert.equal(hit.total, 3)
  assert.equal(hit.entries[0].item.entry.name, '骰池规则')
  assert.equal(hit.entries[1].item.entry.name, '其它')
})

test('检索：显式多词短语不被分词切碎（武当 不该因为 武 而命中）', () => {
  const entries = entriesFrom([
    { name: '武侠杂谈', content: '讲讲武功与当铺' },
    { name: '门派', keys: ['武当'], content: '武当派设定' }
  ])
  const hit = searchEntries(entries, '武当', { limit: 5 })
  assert.equal(hit.total, 1)
  assert.equal(hit.entries[0].item.entry.name, '门派')
})

test('检索：空格分隔的多词按词组匹配', () => {
  const entries = entriesFrom([
    { name: 'A', content: '只有骰池' },
    { name: 'B', content: '骰池与检定都有' }
  ])
  const hit = searchEntries(entries, '骰池 检定', { limit: 5 })
  assert.equal(hit.total, 2)
  assert.equal(hit.entries[0].item.entry.name, 'B')
})

test('检索：默认跳过未启用条目，includeDisabled 可放开', () => {
  const entries = entriesFrom([{ name: '禁用的', keys: ['x'], content: 'x', enabled: false }])
  assert.equal(searchEntries(entries, 'x').total, 0)
  assert.equal(searchEntries(entries, 'x', { includeDisabled: true }).total, 1)
})

test('检索：空正文条目不参与命中', () => {
  const entries = entriesFrom([{ name: '骰池规则', content: '   ' }])
  assert.equal(searchEntries(entries, '骰池').total, 0)
})

test('检索：分页 offset/limit 与 hasMore', () => {
  const entries = entriesFrom(Array.from({ length: 5 }, (_, i) => ({ name: `骰池${i}`, content: 'c' })))
  const page = searchEntries(entries, '骰池', { offset: 2, limit: 2 })
  assert.equal(page.total, 5)
  assert.equal(page.entries.length, 2)
  assert.equal(page.hasMore, true)
})

test('检索：模板与标签不进入片段（静态检索不执行模板）', () => {
  const entries = entriesFrom([{ name: '骰池', keys: ['骰池'], content: '<% if(x){ %>滚一个{{roll::1d20}}<% } %>关键正文' }])
  const hit = searchEntries(entries, '骰池', { limit: 1 })
  assert.equal(hit.entries[0].templated, true)
  assert.equal(hit.entries[0].snippet.includes('<%'), false)
  assert.equal(hit.entries[0].snippet.includes('关键正文'), true)
})

// ── 预设模块 ───────────────────────────────────────────────
test('预设模块：非数组或损坏时返回空数组', () => {
  const root = tmpRoot()
  const dir = mkPreset(root, 'alpha')
  assert.deepEqual(readPresetModules(dir), [])
  fs.writeFileSync(path.join(dir, 'presets.json'), '{"not":"an array"}', 'utf8')
  assert.deepEqual(readPresetModules(dir), [])
})

test('预设模块：读写往返', () => {
  const root = tmpRoot()
  const dir = mkPreset(root, 'alpha', { modules: [{ name: '破限', modules: [{ name: '词条', content: 'x', enabled: true }] }] })
  const mods = readPresetModules(dir)
  assert.equal(mods[0].modules[0].name, '词条')
  mods[0].modules[0].enabled = false
  writePresetModules(dir, mods)
  assert.equal(readPresetModules(dir)[0].modules[0].enabled, false)
})
