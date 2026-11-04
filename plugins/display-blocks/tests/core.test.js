// 展示层插件 —— 核心夹具（spec / parse / render 三个纯模块）
//
//   node --test D:\DSH\display-blocks\tests\core.test.js
//
// 不需要浏览器：抽象渲染树让我们能在 Node 里把渲染规则验完，
// 客户端只剩「树 → DOM」的机械转换。

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  blockStyle, colorOf, defaultSpec, extractSpecDeclaration, mergeSpec, rarityColor, resolveColor,
  sectionStyle, specFromCardText,
} from '../lib/spec.js'
import { balancedObject, extractBlocks, parseInline } from '../lib/parse.js'
import { normalizeSections, renderBlock, renderMessage, treeRarities, treeToText } from '../lib/render.js'

const SPEC = defaultSpec()

// ── spec：词表 ─────────────────────────────────────────────

test('默认词表覆盖七档 + 英文别名', () => {
  assert.equal(rarityColor(SPEC, '神器'), '#ff5252')
  assert.equal(rarityColor(SPEC, '传说'), '#ffd700')
  assert.equal(rarityColor(SPEC, 'legendary'), '#ffd700')
  assert.equal(rarityColor(SPEC, 'very rare'), '#ff9800')
  assert.equal(rarityColor(SPEC, '普通'), '#9aa0a6')
  assert.equal(rarityColor(SPEC, '没这个词'), null)
  assert.equal(rarityColor(SPEC, ''), null)
})

test('颜色短码与 #hex 都认', () => {
  assert.equal(colorOf(SPEC, 'g'), '#ffd700')
  assert.equal(colorOf(SPEC, 'G'), '#ffd700')
  assert.equal(colorOf(SPEC, '#123456'), '#123456')
  assert.equal(colorOf(SPEC, 'zz'), null)
})

test('卡侧【展示规范】声明能解析出来', () => {
  const desc = [
    '【你是谁】你是主持人。',
    '【展示规范】',
    '稀有度: 凡品=#888888, 秘宝=#00e5ff',
    '颜色: warn=#ff9800, dg=#1b5e20',
    '块: 秘宝=💎|秘宝图鉴, 势力=🏰',
    '【每轮输出】照常。',
  ].join('\n')
  const decl = extractSpecDeclaration(desc)
  assert.ok(decl, '应解析出声明')
  assert.deepEqual(decl.rarities, [
    { word: '凡品', color: '#888888' },
    { word: '秘宝', color: '#00e5ff' },
  ])
  assert.equal(decl.colors.warn, '#ff9800')
  assert.deepEqual(decl.blocks['秘宝'], { icon: '💎', title: '秘宝图鉴', color: '' })
  // 缺段留空字符串，由 mergeSpec 回落默认/类型名 —— 声明处兜底会把默认标题洗掉
  assert.deepEqual(decl.blocks['势力'], { icon: '🏰', title: '', color: '' })
  assert.equal(blockStyle(mergeSpec(decl), '势力').title, '势力', '合并后回落类型名')
})

test('卡声明是增量覆盖，不整体替换默认', () => {
  const spec = mergeSpec({ rarities: [{ word: '秘宝', color: '#00e5ff' }], colors: { warn: '#ff9800' }, blocks: { 势力: { icon: '🏰' } } })
  assert.equal(rarityColor(spec, '秘宝'), '#00e5ff', '新词生效')
  assert.equal(rarityColor(spec, '传说'), '#ffd700', '默认词仍在')
  assert.equal(colorOf(spec, 'warn'), '#ff9800', '新色码生效')
  assert.equal(colorOf(spec, 'g'), '#ffd700', '默认色码仍在')
  assert.equal(spec.blocks['势力'].icon, '🏰')
  assert.ok(spec.blocks['组织'], '默认块类型仍在')
})

test('mergeSpec 把长词排前面（否则「稀有」会抢「非常稀有」）', () => {
  const spec = mergeSpec({ rarities: [{ word: '稀有', color: '#111111' }] })
  const words = spec.rarities.map((r) => r.word)
  assert.ok(words.indexOf('非常稀有') < words.indexOf('稀有'),
    `长词应排前，实际顺序：${words.join(' / ')}`)
})

test('specFromCardText 一步到位', () => {
  const spec = specFromCardText('【展示规范】\n稀有度: 秘宝=#00e5ff\n', null)
  assert.equal(rarityColor(spec, '秘宝'), '#00e5ff')
  assert.equal(rarityColor(spec, '传说'), '#ffd700')
  const none = specFromCardText('没有任何声明的卡', null)
  assert.equal(rarityColor(none, '传说'), '#ffd700')
})

// ── parse：机器块 ──────────────────────────────────────────

test('balancedObject 配平提取，字符串内花括号不干扰', () => {
  const hit = balancedObject('前缀 {"a":"}{","b":{"c":1}} 后缀', 0)
  assert.ok(hit)
  assert.deepEqual(hit.json, { a: '}{', b: { c: 1 } })
  assert.equal(balancedObject('{"a":1', 0), null, '未闭合返回 null')
})

test('extractBlocks 切出文本段与块段', () => {
  const text = '前面的话\n[[展示]]{"名":"竖琴手同盟"}\n后面的话'
  const segs = extractBlocks(text)
  assert.equal(segs.length, 3)
  assert.equal(segs[0].kind, 'text')
  assert.equal(segs[1].kind, 'block')
  assert.equal(segs[1].marker, '展示')
  assert.equal(segs[1].json['名'], '竖琴手同盟')
  assert.equal(segs[2].kind, 'text')
})

test('extractBlocks 任意标记都认（AI 可自行发明块类型）', () => {
  const segs = extractBlocks('[[势力]]{"名":"竖琴手"} 和 [[秘宝]]{"名":"龙珠"}')
  const markers = segs.filter((s) => s.kind === 'block').map((s) => s.marker)
  assert.deepEqual(markers, ['势力', '秘宝'])
})

test('说明文字里的 [[商店]] 不会被误当机器块', () => {
  const segs = extractBlocks('来源：[[商店]] 是前端渲染的机器块，格式见契约文档。')
  assert.equal(segs.filter((s) => s.kind === 'block').length, 0)
  assert.equal(segs.length, 1)
  assert.equal(segs[0].kind, 'text')
})

test('坏 JSON 的块退回普通文本，不影响后面的块', () => {
  const segs = extractBlocks('[[展示]]{坏掉的 然后 [[展示]]{"名":"好的"}')
  const blocks = segs.filter((s) => s.kind === 'block')
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].json['名'], '好的')
})

// ── parse：行内标注 ────────────────────────────────────────

test('稀有度标注只在词表命中时成立', () => {
  const hit = parseInline('这是一把（传说）长剑', SPEC)
  const rarity = hit.filter((t) => t.kind === 'rarity')
  assert.equal(rarity.length, 1)
  assert.equal(rarity[0].word, '传说')
  assert.equal(rarity[0].color, '#ffd700')

  const miss = parseInline('这是一句（随便什么）话', SPEC)
  assert.equal(miss.filter((t) => t.kind === 'rarity').length, 0)
  assert.equal(treeToText([{ text: '', children: [] }]) === '' ? miss.map((t) => t.text || '').join('') : '', '这是一句（随便什么）话')
})

test('三种定界符都认：（）【】[]', () => {
  for (const [open, close] of [['（', '）'], ['【', '】'], ['[', ']']]) {
    const tokens = parseInline(`前${open}神器${close}后`, SPEC)
    const r = tokens.filter((t) => t.kind === 'rarity')
    assert.equal(r.length, 1, `${open}${close} 应识别`)
    assert.equal(r[0].word, '神器')
  }
})

test('颜色标签成对才成立', () => {
  const ok = parseInline('掉落：[g]传说之刃[/g]，请收好', SPEC)
  const colored = ok.filter((t) => t.kind === 'color')
  assert.equal(colored.length, 1)
  assert.equal(colored[0].code, 'g')
  assert.equal(colored[0].color, '#ffd700')

  const unclosed = parseInline('这里 [g] 没有闭合', SPEC)
  assert.equal(unclosed.filter((t) => t.kind === 'color').length, 0)
  assert.equal(unclosed.map((t) => t.text || '').join(''), '这里 [g] 没有闭合', '不成立时原样保留')
})

test('颜色标签里可以嵌套稀有度标注', () => {
  const tokens = parseInline('[g]你获得（传说）之刃[/g]', SPEC)
  const colored = tokens.find((t) => t.kind === 'color')
  assert.ok(colored)
  const inner = colored.tokens.filter((t) => t.kind === 'rarity')
  assert.equal(inner.length, 1)
  assert.equal(inner[0].word, '传说')
})

test('#hex 直写也是合法颜色标签', () => {
  const tokens = parseInline('[#00e5ff]霓虹[/#00e5ff]', SPEC)
  assert.equal(tokens.filter((t) => t.kind === 'color').length, 1)
})

test('中文色名也能当行内标签，且不会误伤 [传说] 和 Markdown 链接', () => {
  const named = parseInline('[红]危险[/红]', SPEC)
  assert.equal(named.filter((t) => t.kind === 'color').length, 1)
  assert.equal(named.filter((t) => t.kind === 'color')[0].color, '#e53935')

  const rarityOnly = parseInline('[传说]不是颜色[/传说]', SPEC)
  assert.equal(rarityOnly.filter((t) => t.kind === 'color').length, 0, '[传说] 是稀有度词，不该当颜色标签')
  assert.equal(rarityOnly.filter((t) => t.kind === 'rarity').length, 1, '仍按稀有度上色')

  const link = parseInline('见 [文档](https://example.com) 与 [g]金色[/g]', SPEC)
  assert.equal(link.filter((t) => t.kind === 'color').length, 1, 'Markdown 链接不被吃掉')
  const linkText = link.filter((t) => t.kind === 'text').map((t) => t.text).join('')
  assert.ok(linkText.includes('[文档](https://example.com)'))

  const unknown = parseInline('[没这个词]原样[/没这个词]', SPEC)
  assert.equal(unknown.filter((t) => t.kind === 'color').length, 0, '词表外的名字原样保留')
})

test('卡自定义的词与色码立刻可用', () => {
  const spec = specFromCardText('【展示规范】\n稀有度: 秘宝=#00e5ff\n颜色: warn=#ff9800\n', null)
  assert.equal(parseInline('（秘宝）', spec).filter((t) => t.kind === 'rarity').length, 1)
  assert.equal(parseInline('[warn]小心[/warn]', spec).filter((t) => t.kind === 'color').length, 1)
})

// ── render：抽象树 ─────────────────────────────────────────

test('renderBlock 产出通用卡片结构', () => {
  const tree = renderBlock('展示', {
    类型: '组织', 名: '竖琴手同盟', 稀有度: '传说',
    字段: { 归属: '费伦', 性质: '密探网络' },
    条目: ['成员遍布各地', { 名: '伊尔明斯特', 稀有度: '神器', 字段: { 身份: '大法师' } }],
    备注: '别在他们面前撒谎',
  }, SPEC)

  assert.equal(tree.tag, 'section')
  assert.equal(tree.cls, 'dsp-card')
  assert.equal(tree.attrs['data-dsp-type'], '组织')
  assert.equal(tree.style, '--dsp-accent:#ffd700', '强调色跟稀有度走')
  const text = treeToText([tree])
  for (const needle of ['竖琴手同盟', '费伦', '密探网络', '伊尔明斯特', '大法师', '别在他们面前撒谎']) {
    assert.ok(text.includes(needle), `树里应含「${needle}」`)
  }
  assert.deepEqual(treeRarities([tree]), { 传说: 1, 神器: 1 })
})

test('renderBlock 认英文键名', () => {
  const tree = renderBlock('展示', {
    type: 'quest', title: '寻找失踪的商队', rarity: 'rare',
    fields: { 委托人: '商会' }, items: ['线索：车轮印'], note: '限时三天',
  }, SPEC)
  const text = treeToText([tree])
  assert.ok(text.includes('寻找失踪的商队'))
  assert.ok(text.includes('商会'))
  assert.ok(text.includes('线索：车轮印'))
  assert.equal(treeRarities([tree])['rare'], 1)
})

test('renderBlock 对缺字段的块不崩（AI 少写了也能渲染）', () => {
  const bare = renderBlock('展示', {}, SPEC)
  assert.equal(bare.tag, 'section')
  const onlyName = renderBlock('展示', { 名: '只有名字' }, SPEC)
  assert.ok(treeToText([onlyName]).includes('只有名字'))
})

test('字段值里的行内标注也会被渲染', () => {
  const tree = renderBlock('展示', { 名: 'X', 字段: { 品质: '（传说）级' } }, SPEC)
  assert.equal(treeRarities([tree])['传说'], 1, '字段值里的（传说）应被识别')
})

test('renderMessage 接管通用块、放过皮肤负责的块', () => {
  const text = '你走进酒馆。\n[[展示]]{"类型":"组织","名":"竖琴手"}\n[[商店]]{"名":"铁砧与皮匠","商品":[]}\n完。'
  const tree = renderMessage(text, SPEC)
  const flat = treeToText(tree)
  assert.ok(flat.includes('竖琴手'), '通用块被渲染')
  assert.ok(flat.includes('[[商店]]'), '皮肤负责的块原样放过')
  assert.ok(flat.includes('你走进酒馆'), '正文保留')
})

test('renderMessage 可显式指定接管哪些标记', () => {
  const text = '[[势力]]{"名":"竖琴手"}'
  const owned = renderMessage(text, SPEC, { ownMarkers: ['势力'] })
  assert.ok(treeToText(owned).includes('竖琴手'))
  assert.ok(!treeToText(owned).includes('[[势力]]'))

  const notOwned = renderMessage(text, SPEC, { ownMarkers: ['别的'] })
  assert.ok(treeToText(notOwned).includes('[[势力]]'), '不在接管名单里的原样放过')
})

test('渲染树里没有任何 HTML 拼接（全走 text）', () => {
  const tree = renderBlock('展示', { 名: '<img src=x onerror=alert(1)>', 字段: { a: '<script>' } }, SPEC)
  const flat = treeToText([tree])
  assert.ok(flat.includes('<img src=x onerror=alert(1)>'), '尖括号作为**文本**保留')
  const walk = (nodes) => {
    for (const node of nodes) {
      assert.equal(typeof node.text, 'string')
      assert.ok(!('html' in node), '节点不允许带 html 字段')
      if (node.children) walk(node.children)
    }
  }
  walk([tree])
})

// ── render：分节（骨架由渲染器给，节名与内容由声明者自己填） ──

/** 按类名收集节点（夹具用）。 */
function findCls(nodes, cls, acc) {
  const bag = acc || []
  for (const node of nodes || []) {
    if (!node) continue
    if (node.cls && node.cls.split(' ').indexOf(cls) >= 0) bag.push(node)
    if (node.children) findCls(node.children, cls, bag)
  }
  return bag
}

test('节：数组写法，节名 / 值 / 图标都认', () => {
  const tree = renderBlock('人物', {
    名: '凯尔本',
    节: [
      { 名: '年龄', 值: '127 岁' },
      { 名: '外貌', 图标: '👁', 值: '白发黑杖' },
    ],
  }, SPEC)
  const secs = findCls([tree], 'dsp-sec')
  assert.equal(secs.length, 2)
  assert.equal(secs[0].attrs['data-dsp-section'], '年龄')
  const text = treeToText([tree])
  assert.ok(text.includes('127 岁'))
  assert.ok(text.includes('白发黑杖'))
  assert.ok(text.includes('👁'), '显式图标生效')
})

test('节：映射写法（更省字）与次序保留', () => {
  const secs = normalizeSections({ 年龄: '27', 身材: '精瘦', 心理: '多疑' })
  assert.deepEqual(secs.map((s) => s.name), ['年龄', '身材', '心理'])
  assert.deepEqual(secs.map((s) => s.value), ['27', '精瘦', '多疑'])
})

// ── 折叠：跟 DND 皮肤控制台同一套（视觉隐藏控件 + label 头 + :has 显隐） ──
//
// 为什么不用 <details>：原生开合靠浏览器默认动作，页面上游一拦就点不开（2026-10-03 实测）；
// 而 JS 再 toggle `open` 会与原生行为互相抵消。`:checked` 是幂等状态，怎么拦都不会反着来。

/** 取节头里的隐藏控件。 */
function ctlOf(sec) {
  const head = findCls([sec], 'dsp-sec-head')[0]
  if (!head) return null
  return (head.children || []).find((c) => c && c.cls === 'dsp-ctl') || null
}

test('折叠：具名节 = 隐藏 input + label 节头，顶层选项卡默认全收起、嵌套节首节开', () => {
  const tree = renderBlock('人物', {
    节: [
      { 名: '外貌', 值: '白发' },
      { 名: '装备', 值: ['剑', '甲'] },
      { 名: '状态', 值: '良好' },
    ],
  }, SPEC)
  const secs = findCls([tree], 'dsp-sec')
  assert.equal(secs.length, 3)
  assert.equal(findCls([secs[0]], 'dsp-sec-head')[0].tag, 'label', '节头是 label（点它切换）')
  const c0 = ctlOf(secs[0])
  assert.ok(c0, '节头里有隐藏控件')
  assert.equal(c0.tag, 'input')
  assert.equal(c0.attrs.type, 'checkbox')
  for (const [i, s] of secs.entries()) {
    assert.equal(ctlOf(s).attrs.checked, undefined, `第${i + 1}节默认收起（选项卡全收起）`)
  }
  // 嵌套节保持「首节开」
  const nested = renderBlock('人物', { 节: [{ 名: '外貌', 值: { 节: [{ 名: '脸', 值: 'x' }, { 名: '发', 值: 'y' }] } }] }, SPEC)
  const inner = findCls([nested], 'dsp-sec').filter((s) => ['脸', '发'].includes(s.attrs['data-dsp-section']))
  assert.equal(ctlOf(inner[0]).attrs.checked, '', '嵌套首节默认展开')
  assert.equal(ctlOf(inner[1]).attrs.checked, undefined, '嵌套次节默认收起')
  assert.equal(secs[0].attrs['data-dsp-open'], '0', '顶层默认全收起')
  assert.equal(secs[1].attrs['data-dsp-open'], '0')
  assert.equal(secs[0].attrs['data-dsp-fold'], 'auto')
  assert.equal(findCls([secs[0]], 'dsp-sec-caret').length, 1, '折叠箭头')
  assert.equal(findCls([secs[0]], 'dsp-sec-num')[0].text, '01', '节序号（皮肤 tab 同款）')
})

test('折叠：控件嵌在 label 里、节体是兄弟节点（不需要 id/for → 不会重名）', () => {
  const tree = renderBlock('地点', { 节: [{ 名: '风土', 值: '港口' }] }, SPEC)
  const sec = findCls([tree], 'dsp-sec')[0]
  assert.equal(sec.children[0].tag, 'label')
  assert.equal(sec.children[0].cls, 'dsp-sec-head')
  assert.equal(sec.children[1].cls, 'dsp-sec-body', '节体是 label 的兄弟（CSS 用 :has 判 :checked）')
  // 全树不允许出现 id —— 每张卡都渲染一次，有 id 就会重名
  const ids = []
  const walk = (nodes) => {
    for (const nd of nodes || []) {
      if (nd && nd.attrs && nd.attrs.id !== undefined) ids.push(nd.attrs.id)
      if (nd && nd.children) walk(nd.children)
    }
  }
  walk([tree])
  assert.equal(ids.length, 0, '渲染树里不该出现 id')
})

test('折叠：节可以显式声明 折叠:true / 折叠:false 覆盖默认', () => {
  const tree = renderBlock('人物', {
    节: [
      { 名: '外貌', 折叠: true, 值: '白发' },
      { 名: '装备', 折叠: false, 值: ['剑'] },
      { 名: '状态', 值: '良好' },
    ],
  }, SPEC)
  const secs = findCls([tree], 'dsp-sec')
  assert.equal(ctlOf(secs[0]).attrs.checked, undefined, '折叠:true → 收起')
  assert.equal(secs[0].attrs['data-dsp-fold'], 'closed')
  assert.equal(ctlOf(secs[1]).attrs.checked, '', '折叠:false → 展开')
  assert.equal(secs[1].attrs['data-dsp-fold'], 'open')
  // 「折叠」是描述字段，不能漏进这一节的内容里
  assert.ok(!treeToText([secs[0]]).includes('true'), '折叠 不进正文')
})

test('折叠：无名节不套控件（没有节头就无处可点，藏起来就出不去）', () => {
  const tree = renderBlock('展示', { 节: ['裸一行内容'] }, SPEC)
  const secs = findCls([tree], 'dsp-sec')
  assert.equal(secs.length, 1)
  assert.ok(secs[0].cls.includes('dsp-sec-plain'))
  assert.equal(findCls([secs[0]], 'dsp-sec-head').length, 0, '无名节没有节头')
  assert.equal(ctlOf(secs[0]), null, '也没有控件')
  assert.ok(treeToText([tree]).includes('裸一行内容'), '内容照旧可见')
})

test('折叠：嵌套节各自可折叠', () => {
  const tree = renderBlock('人物', {
    节: [{ 名: '技能', 值: { 节: [{ 名: '战斗', 值: ['劈砍'] }, { 名: '法术', 值: ['焰击'] }] } }],
  }, SPEC)
  const secs = findCls([tree], 'dsp-sec')
  assert.equal(secs.length, 3, '外层 1 + 内层 2')
  assert.ok(secs.every((s) => s.tag === 'div'), '每一层都是 div + 控件')
  assert.ok(secs.every((s) => ctlOf(s)), '每层都有控件')
  assert.equal(ctlOf(secs[1]).attrs.checked, '', '内层第一节展开')
  assert.equal(ctlOf(secs[2]).attrs.checked, undefined, '内层第二节收起')
})

test('折叠：用户点过的开合状态优先（重画时把用户选择还回去，而不是回到默认）', () => {
  const json = { 名: '凯尔本', 节: [{ 名: '外貌', 值: '白发' }, { 名: '状态', 值: '良好' }] }
  const state = new Map([
    ['人物|凯尔本|外貌', false],   // 用户把第一节收起来了
    ['人物|凯尔本|状态', true],    // 又把第二节展开了
  ])
  const tree = renderBlock('人物', json, SPEC, { foldState: state })
  const secs = findCls([tree], 'dsp-sec')
  assert.equal(ctlOf(secs[0]).attrs.checked, undefined, '记的收起生效（不是回到默认的展开）')
  assert.equal(ctlOf(secs[1]).attrs.checked, '', '记的展开生效')
  assert.equal(secs[0].attrs['data-dsp-open'], '0')
  assert.equal(secs[1].attrs['data-dsp-open'], '1')
  // 卡片身份写在属性上，前端回写状态时用它拼同一个键
  assert.equal(findCls([tree], 'dsp-card')[0].attrs['data-dsp-card'], '人物|凯尔本')
  // 没记过的节仍按默认（顶层选项卡全收起）—— 空表不该改变行为
  const plain = renderBlock('人物', json, SPEC)
  const psecs = findCls([plain], 'dsp-sec')
  assert.equal(ctlOf(psecs[0]).attrs.checked, undefined, '无记忆时顶层默认全收起')
  assert.equal(ctlOf(psecs[1]).attrs.checked, undefined, '无记忆时顶层默认全收起')
})

test('可扩展度：自定义标记 + 自定义节名 + 未知版式，照样渲染且可折叠', () => {
  // 用户明确要求：临时需要一个新属性的机器块也得能做出来
  const tree = renderBlock('阵营声望', {
    名: '灰港商会',
    节: [
      { 名: '我方好感度', 值: '友善（+12）' },
      { 名: '敌对势力', 值: ['盐帮', '铁钩团'], 布局: '标签' },
      { 名: '自定义字段甲', 值: '自定值', 布局: '从来没见过的版式名' },
    ],
  }, SPEC)
  const secs = findCls([tree], 'dsp-sec')
  assert.equal(secs.length, 3, '词表外的节名照样成节')
  assert.ok(secs.every((s) => ctlOf(s)), '自定义节同样可折叠（CSS 规则只看 :checked，不看节名）')
  const text = treeToText([tree])
  assert.ok(text.includes('我方好感度') && text.includes('友善（+12）'))
  assert.ok(text.includes('盐帮') && text.includes('铁钩团'), '布局:标签 生效')
  assert.ok(text.includes('自定值'), '未知版式不吞内容')
  assert.equal(findCls([tree], 'dsp-card')[0].attrs['data-dsp-marker'], '阵营声望', '任意标记都收')
})

test('统一渲染出口：passAll 时机器块全部透传（正文不动），行内标注照旧', () => {
  const text = '正文一句。[g]警示[/g]\n[[人物]]{"名":"凯尔本","节":[{"名":"外貌","值":"白发"}]}\n[[秘宝]]{"名":"龙鳞戒"}'
  const held = renderMessage(text, SPEC, { passAll: true })
  const flat = JSON.stringify(held)
  assert.ok(!flat.includes('dsp-card'), 'passAll 时不渲染任何卡片')
  const passed = findCls(held, 'dsp-pass')
  assert.equal(passed.length, 2, '两个块都原样透传（交给皮肤控制台）')
  assert.ok(String(passed[0].text).startsWith('[[人物]]{'), '透传的是原文（含标记与 JSON）')
  assert.ok(flat.includes('dsp-rarity') || flat.includes('dsp-val') || flat.includes('警示'), '行内标注仍在处理')
})

test('统一渲染出口：passAll 与 ownMarkers 同时给时，passAll 优先', () => {
  const text = '[[秘宝]]{"名":"龙鳞戒"}'
  const owned = renderMessage(text, SPEC, { ownMarkers: ['秘宝'] })
  assert.equal(findCls(owned, 'dsp-card').length, 1, '只给 ownMarkers → 自己渲染')
  const passed = renderMessage(text, SPEC, { ownMarkers: ['秘宝'], passAll: true })
  assert.equal(findCls(passed, 'dsp-card').length, 0, 'passAll 优先 → 交出去')
  assert.equal(findCls(passed, 'dsp-pass').length, 1)
})

test('折叠：具名节 ≥2 时有「展开全部 / 全部收起」；只有 1 个节时不给', () => {
  const many = renderBlock('人物', {
    节: [{ 名: '甲', 值: '1' }, { 名: '乙', 值: '2' }],
  }, SPEC)
  const tools = findCls([many], 'dsp-tool')
  assert.equal(tools.length, 2)
  assert.equal(tools[0].attrs['data-dsp-all'], '1')
  assert.equal(tools[1].attrs['data-dsp-all'], '0')
  const one = renderBlock('人物', { 节: [{ 名: '甲', 值: '1' }] }, SPEC)
  assert.equal(findCls([one], 'dsp-tool').length, 0, '只有一个节不必给批量控件')
})

test('节的版式自动跟随值的形状：文本 / 列表 / 键值', () => {
  const tree = renderBlock('人物', {
    节: [
      { 名: '外貌', 值: '一句话' },
      { 名: '服装', 值: ['玄色长袍', '龙鳞胸甲'] },
      { 名: '状态', 值: { 生命: '良好', 伤势: '无' } },
    ],
  }, SPEC)
  const secs = findCls([tree], 'dsp-sec')
  assert.equal(secs.length, 3)
  assert.equal(findCls([secs[1]], 'dsp-item').length, 2, '数组 → 列表')
  assert.equal(findCls([secs[2]], 'dsp-fields').length, 1, '对象 → 键值表')
})

test('节的布局可以显式覆盖为标签', () => {
  const tree = renderBlock('人物', { 节: [{ 名: '技能', 布局: '标签', 值: ['焰击术', '法师之手'] }] }, SPEC)
  const chips = findCls([tree], 'dsp-chip')
  assert.equal(chips.length, 2)
  assert.equal(treeToText([chips[0]]), '焰击术')
})

test('节的图标默认来自词表，卡声明可覆盖', () => {
  const fromSpec = renderBlock('人物', { 节: [{ 名: '外貌', 值: 'x' }] }, SPEC)
  assert.ok(treeToText([fromSpec]).includes('👁️'), '默认词表给了「外貌」图标')
  const cardSpec = specFromCardText('【展示规范】\n节: 外貌=🔍|文本\n', null)
  assert.equal(sectionStyle(cardSpec, '外貌').layout, '文本')
  const overridden = renderBlock('人物', { 节: [{ 名: '外貌', 值: 'x' }] }, cardSpec)
  assert.ok(treeToText([overridden]).includes('🔍'))
})

test('词表外的节名照样渲染（只是没图标）', () => {
  const tree = renderBlock('人物', { 节: { 口头禅: '「值得。」' } }, SPEC)
  assert.equal(findCls([tree], 'dsp-sec').length, 1)
  assert.ok(treeToText([tree]).includes('口头禅'))
  assert.ok(treeToText([tree]).includes('「值得。」'))
})

test('节可以嵌套（对象里再写节）', () => {
  const tree = renderBlock('人物', {
    节: [{ 名: '战斗', 值: { 节: { 技能: ['焰击术'], 弱点: '怕水' } } }],
  }, SPEC)
  assert.equal(findCls([tree], 'dsp-sec').length, 3, '战斗 + 技能 + 弱点')
  assert.ok(treeToText([tree]).includes('怕水'))
})

test('空节不画；节排在扁平字段表前面', () => {
  const tree = renderBlock('人物', {
    节: [{ 名: '空', 值: '' }, { 名: '有值', 值: 'x' }],
    字段: { 归属: '费伦' },
  }, SPEC)
  assert.equal(findCls([tree], 'dsp-sec').length, 1, '空节被丢掉')
  const kinds = tree.children.map((c) => c.cls)
  assert.ok(kinds.indexOf('dsp-secs') < kinds.indexOf('dsp-fields'), '节在前，字段表在后')
})

test('节的两种简写：单键对象 / 描述字段之外的键也算内容', () => {
  const oneKey = renderBlock('人物', { 节: [{ 外貌: '白发' }] }, SPEC)
  assert.equal(findCls([oneKey], 'dsp-sec')[0].attrs['data-dsp-section'], '外貌')

  const inlineFields = renderBlock('人物', { 节: [{ 名: '外貌', 身高: '175', 发色: '银白' }] }, SPEC)
  assert.equal(findCls([inlineFields], 'dsp-fields').length, 1, '其余键变成这一节的键值表')
  const text = treeToText([inlineFields])
  assert.ok(text.includes('175') && text.includes('银白'))
})

test('分节里同样不拼 HTML（文本照旧原样保留）', () => {
  const tree = renderBlock('人物', { 节: [{ 名: '备注', 值: '<b>x</b>' }] }, SPEC)
  assert.ok(treeToText([tree]).includes('<b>x</b>'))
  assert.equal(findCls([tree], 'dsp-sec').length, 1)
})

// ── 颜色：一个统一入口 + 四级回落 ──────────────────────────

test('resolveColor 认 #hex / 色码 / 色名 / 稀有度词', () => {
  assert.equal(resolveColor(SPEC, '#f00'), '#f00')
  assert.equal(resolveColor(SPEC, '#00e5ff'), '#00e5ff')
  assert.equal(resolveColor(SPEC, 'g'), '#ffd700', '短码')
  assert.equal(resolveColor(SPEC, '红'), '#e53935', '中文色名')
  assert.equal(resolveColor(SPEC, 'Gold'), '#ffd700', '英文色名（大小写不敏感）')
  assert.equal(resolveColor(SPEC, '传说'), '#ffd700', '稀有度词也能当颜色用')
  assert.equal(resolveColor(SPEC, '没这颜色'), null)
  assert.equal(resolveColor(SPEC, ''), null)
})

test('卡片强调色回落：显式「色」> 稀有度 > 类型默认色 > 兜底', () => {
  const explicit = renderBlock('展示', { 名: 'x', 稀有度: '传说', 色: '蓝' }, SPEC)
  assert.equal(explicit.style, '--dsp-accent:#1e88e5', '显式色压过稀有度')

  const byRarity = renderBlock('展示', { 名: 'x', 稀有度: '传说' }, SPEC)
  assert.equal(byRarity.style, '--dsp-accent:#ffd700')

  const byType = renderBlock('人物', { 名: 'x' }, SPEC)
  assert.equal(byType.style, '--dsp-accent:#8e24aa', '没写稀有度 → 用「人物」的默认色')

  const unknown = renderBlock('无此类型', { 名: 'x' }, SPEC)
  assert.equal(unknown.style, '--dsp-accent:#8d6e63', '都不认识 → 兜底褐')
})

test('节的颜色：显式「色」> 本节稀有度 > 词表里该节的默认色', () => {
  const explicit = renderBlock('人物', { 节: [{ 名: '心理', 色: '青', 值: 'x' }] }, SPEC)
  const sec = findCls([explicit], 'dsp-sec')[0]
  assert.equal(sec.attrs['data-dsp-color'], '#00acc1')
  assert.equal(sec.style, '--dsp-sec-accent:#00acc1')

  const byRarity = renderBlock('人物', { 节: [{ 名: '技能', 稀有度: '传说', 值: 'x' }] }, SPEC)
  assert.equal(findCls([byRarity], 'dsp-sec')[0].attrs['data-dsp-color'], '#ffd700')

  const bySpec = renderBlock('人物', { 节: [{ 名: '外貌', 值: 'x' }] }, SPEC)
  assert.equal(findCls([bySpec], 'dsp-sec')[0].attrs['data-dsp-color'], '#1e88e5', '词表默认色')

  const none = renderBlock('人物', { 节: [{ 名: '口头禅', 值: 'x' }] }, SPEC)
  assert.equal(findCls([none], 'dsp-sec')[0].attrs['data-dsp-color'], undefined,
    '词表外的节不定色 → 继承卡片强调色')
})

test('词表第三段：块的默认色 / 节的默认色', () => {
  const spec = specFromCardText([
    '【展示规范】',
    '节: 外貌=👁|文本|天蓝, 技能=📜|标签|暗金',
    '块: 势力=🏰|势力|草绿',
    '颜色: 血红=#8b0000',
  ].join('\n'), null)

  assert.equal(sectionStyle(spec, '外貌').color, '天蓝')
  assert.equal(sectionStyle(spec, '技能').layout, '标签')
  assert.equal(blockStyle(spec, '势力').color, '草绿')
  assert.equal(resolveColor(spec, '血红'), '#8b0000', '新加的色名立刻可用')

  const tree = renderBlock('人物', { 节: [{ 名: '外貌', 值: 'x' }] }, spec)
  assert.equal(findCls([tree], 'dsp-sec')[0].attrs['data-dsp-color'], '#81d4fa', '色名解析成 hex')

  const block = renderBlock('势力', { 名: 'x' }, spec)
  assert.equal(block.style, '--dsp-accent:#7cb342')
})

test('补键不改键：卡只写图标，默认色不会被洗掉', () => {
  const spec = specFromCardText('【展示规范】\n块: 组织=🏛️|组织与势力\n节: 外貌=🔍\n', null)
  assert.equal(blockStyle(spec, '组织').color, '#1e88e5', '块的默认色保留')
  assert.equal(sectionStyle(spec, '外貌').color, '#1e88e5', '节的默认色保留')
  assert.equal(sectionStyle(spec, '外貌').icon, '🔍', '声明的图标生效')
})

test('条目也能各带各的颜色', () => {
  const tree = renderBlock('展示', { 条目: [{ 名: '铜钥匙', 色: '金' }, { 名: '铁钥匙' }] }, SPEC)
  const names = findCls([tree], 'dsp-item-name')
  assert.equal(names[0].style, 'color:#ffd700')
  assert.equal(names[1].style, '')
})

test('块的两段写法：第二段看着是颜色就按颜色算，否则按标题算', () => {
  const byColor = renderBlock('势力', { 名: 'x' }, specFromCardText('【展示规范】\n块: 势力=🏰|蓝\n', null))
  assert.equal(byColor.style, '--dsp-accent:#1e88e5')

  const byTitle = renderBlock('势力', { 名: 'x' }, specFromCardText('【展示规范】\n块: 势力=🏰|势力图鉴\n', null))
  assert.equal(byTitle.style, '--dsp-accent:#8d6e63', '标题不是颜色 → 颜色仍走兜底')
})

// ── 回归用例（2026-10-05 审计修复）────────────────────────────
//
// 每条对应一个实证复现过的 bug：旧代码会失败、新代码通过。

test('回归[1]词表颜色值净化：恶意 CSS 值不进 style', () => {
  const spec = specFromCardText([
    '【展示规范】',
    '颜色: bad=red;background:url(https://evil.example)',
    '稀有度: 恶=x;behavior:url(evil)',
  ].join('\n'), null)
  assert.equal(colorOf(spec, 'bad'), null, '词表值带 CSS 注入 → 出口拒绝')
  assert.equal(rarityColor(spec, '恶'), null, '稀有度值带 CSS 注入 → 出口拒绝')
  assert.equal(parseInline('[bad]x[/bad]', spec).filter((t) => t.kind === 'color').length, 0, '行内标签同样拿不到色')
  assert.equal(parseInline('（恶）', spec).filter((t) => t.kind === 'rarity').length, 0, '稀有度标注同样不成立')

  const tree = renderBlock('展示', { 名: 'x', 色: 'bad', 稀有度: '恶' }, spec)
  const flat = JSON.stringify([tree])
  assert.ok(!flat.includes('evil.example') && !flat.includes('background'), '渲染树任何 style 都不含注入内容')
  assert.equal(tree.style, '--dsp-accent:#607d8b', '认不出的色沿回落链接管（这里落到类型默认色）')
  const unknown = renderBlock('无此类型', { 名: 'x', 色: 'bad' }, spec)
  assert.equal(unknown.style, '--dsp-accent:#8d6e63', '回落到链尾兜底褐')

  // 合法值照常放行：#hex 与 CSS 色名关键字（词表值）
  const kw = specFromCardText('【展示规范】\n颜色: named=red\n', null)
  assert.equal(colorOf(kw, 'named'), 'red', '词表值是 CSS 色名关键字 → 放行')
  const ok = specFromCardText('【展示规范】\n颜色: warn=#ff9800\n', null)
  assert.equal(colorOf(ok, 'warn'), '#ff9800', '#hex 值照常放行')
})

test('回归[1]卡声明的稀有度色值同样净化', () => {
  const good = specFromCardText('【展示规范】\n稀有度: 秘宝=gold\n', null)
  assert.equal(rarityColor(good, '秘宝'), 'gold', '词表值是 CSS 色名 → 放行（小写）')
  const bad = specFromCardText('【展示规范】\n稀有度: 秘宝=#00e5ff;display:none\n', null)
  assert.equal(rarityColor(bad, '秘宝'), null, '值里混入分号 → 拒绝')
})

test('回归[2]嵌套节：折叠记忆透传，键含节路径（同名嵌套节不互相污染）', () => {
  const json = {
    名: '凯尔本',
    节: [
      { 名: '状态', 值: '良好' },
      { 名: '技能', 值: { 节: [{ 名: '状态', 值: '专注' }, { 名: '战斗', 值: ['劈砍'] }] } },
    ],
  }
  const state = new Map([
    ['人物|凯尔本|状态', true],         // 外层「状态」用户点开
    ['人物|凯尔本|技能/状态', false],   // 嵌套「状态」用户点收
  ])
  const tree = renderBlock('人物', json, SPEC, { foldState: state })
  const secs = findCls([tree], 'dsp-sec')
  assert.equal(secs.length, 4)
  const byKey = new Map(secs.map((s) => [s.attrs['data-dsp-fold-key'], s]))
  assert.ok(byKey.has('人物|凯尔本|状态') && byKey.has('人物|凯尔本|技能/状态'),
    '同名嵌套节各有各的折叠键（旧实现共用 卡片|节名，互相污染）')
  assert.equal(ctlOf(byKey.get('人物|凯尔本|状态')).attrs.checked, '', '外层记忆生效')
  assert.equal(ctlOf(byKey.get('人物|凯尔本|技能/状态')).attrs.checked, undefined,
    '嵌套节记忆生效（旧实现丢参数，恒按默认展开）')
  // 没记忆的嵌套节按本层默认（第一节展开）走
  assert.equal(ctlOf(byKey.get('人物|凯尔本|技能/战斗')).attrs.checked, undefined)
})

test('回归[3]空节不画：空数组 / 空对象与空字符串一样被丢弃', () => {
  const tree = renderBlock('人物', {
    节: [
      { 名: '空数组', 值: [] },
      { 名: '空对象', 值: {} },
      { 名: '空串', 值: '' },
      { 名: '有值', 值: 'x' },
    ],
  }, SPEC)
  const secs = findCls([tree], 'dsp-sec')
  assert.equal(secs.length, 1, '三个空节都被丢掉（旧实现给空数组/空对象画出空框）')
  assert.equal(secs[0].attrs['data-dsp-section'], '有值')
  assert.ok(!treeToText([tree]).includes('空数组'), '空节连标题都不留')
})

test('回归[4]块声明缺段保留默认标题/图标（补键不改键）', () => {
  const spec = specFromCardText('【展示规范】\n块: 展示=🔍\n块: 物品=|图鉴\n', null)
  assert.equal(blockStyle(spec, '展示').icon, '🔍', '只改图标')
  assert.equal(blockStyle(spec, '展示').title, '信息', '默认标题不被洗成「展示」')
  assert.equal(blockStyle(spec, '展示').color, '#607d8b', '默认色保留')
  assert.equal(blockStyle(spec, '物品').icon, '⚔️', '默认图标不被洗成兜底 📋')
  assert.equal(blockStyle(spec, '物品').title, '图鉴', '只改标题')
})

test('回归[5]展开/收起全部按钮按实际渲染的具名节数算（空节不计）', () => {
  const withEmpty = renderBlock('人物', {
    节: [{ 名: '甲', 值: '1' }, { 名: '空', 值: [] }],
  }, SPEC)
  assert.equal(findCls([withEmpty], 'dsp-tool').length, 0,
    '1 个可见节 + 1 个空节 → 不出批量按钮（旧实现把空节算上）')
  const two = renderBlock('人物', { 节: [{ 名: '甲', 值: '1' }, { 名: '乙', 值: '2' }] }, SPEC)
  assert.equal(findCls([two], 'dsp-tool').length, 2, '两个可见节照旧给')
})

test('回归[6]稀有度词不再被 12 字长度帽拦住', () => {
  const word = '传说中的超级稀有度词汇十三字'   // 14 字（旧实现 ≤12 拦掉）
  assert.ok(word.length > 12)
  const spec = specFromCardText('【展示规范】\n稀有度: ' + word + '=#ffd700\n', null)
  const hit = parseInline('（' + word + '）', spec).filter((t) => t.kind === 'rarity')
  assert.equal(hit.length, 1, '长稀有度词命中（词表认就该认）')
  assert.equal(hit[0].word, word)
})

test('回归[7]颜色标签闭合大小写不敏感', () => {
  const tokens = parseInline('[g]金色[/G]', SPEC)
  assert.equal(tokens.filter((t) => t.kind === 'color').length, 1, '[g]…[/G] 成立（查表本就大小写不敏感）')
  const spec = specFromCardText('【展示规范】\n颜色: Mycolor=#123456\n', null)
  const mixed = parseInline('[Mycolor]x[/MYCOLOR]', spec)
  assert.equal(mixed.filter((t) => t.kind === 'color').length, 1, '自定义色名同样不敏感')
})

test('回归[8]透传块保留 ]] 与 { 之间的原文空白', () => {
  const text = '[[商店]] {"名":"铁砧"}\n[[人物]]{"名":"凯尔本"}'
  const passed = findCls(renderMessage(text, SPEC, { passAll: true }), 'dsp-pass')
  assert.equal(passed[0].text, '[[商店]] {"名":"铁砧"}', '空格原样保留（旧实现吞成 [[商店]]{…}）')
  assert.equal(passed[1].text, '[[人物]]{"名":"凯尔本"}', '无空白时不变')
})

test('回归[9]spec.delimiters.rarity 可覆盖稀有度定界符（不再是死数据）', () => {
  const spec = mergeSpec({ delimiters: { rarity: [['〈', '〉']] } })
  const hit = parseInline('前〈神器〉后', spec).filter((t) => t.kind === 'rarity')
  assert.equal(hit.length, 1, '自定义定界符生效')
  assert.equal(hit[0].word, '神器')
  const plain = parseInline('（神器）', spec).filter((t) => t.kind === 'rarity')
  assert.equal(plain.length, 0, '覆盖后默认定界符让位（覆盖语义与词表一致）')
  assert.equal(parseInline('（神器）', SPEC).filter((t) => t.kind === 'rarity').length, 1, '默认规范不受影响')
})

test('回归[10]块两段判色认卡自定义色名与稀有度词（与行序无关）', () => {
  // 颜色行写在块行**后面**也得认（先扫一遍收集声明名）
  const spec = specFromCardText('【展示规范】\n块: 势力=🏰|warn\n块: 秘宝=💎|传说\n颜色: warn=#ff9800\n', null)
  assert.equal(blockStyle(spec, '势力').color, 'warn', '自定义色名被认作颜色而不是标题')
  assert.equal(blockStyle(spec, '秘宝').color, '传说', '稀有度词被认作颜色（契约：色可写稀有度词）')
  const tree = renderBlock('势力', { 名: 'x' }, spec)
  assert.equal(tree.style, '--dsp-accent:#ff9800', '渲染时解析出声明的色值')
})

test('回归[11]单键简写不把描述键当节名', () => {
  const tree = renderBlock('人物', { 节: [{ 折叠: true }, { 图标: 'x' }, { 外貌: '白发' }] }, SPEC)
  const secs = findCls([tree], 'dsp-sec')
  assert.equal(secs.length, 1, '只有「外貌」成节（旧实现长出名叫「折叠」的节）')
  assert.equal(secs[0].attrs['data-dsp-section'], '外貌')
  assert.ok(!treeToText([tree]).includes('折叠'))
})

test('回归[12]对象值不显示 [object Object]', () => {
  const tree = renderBlock('展示', { 名: { 别名: 'X' }, 备注: { a: 1 } }, SPEC)
  const flat = treeToText([tree])
  assert.ok(!flat.includes('[object Object]'))
  assert.ok(flat.includes('{"别名":"X"}'), '标题位置显示 JSON（与 inlineValue 口径一致）')
})

test('回归[13]条目级稀有度认「品质」别名（契约别名表）', () => {
  const tree = renderBlock('展示', { 条目: [{ 名: '剑', 品质: '传说' }] }, SPEC)
  assert.deepEqual(treeRarities([tree]), { 传说: 1 })
})

test('回归[14]宿主半边 name 与包名一致', async () => {
  const mod = await import('../lib/index.js')
  assert.equal(mod.name, 'dsh-display-blocks')
})

test('回归[15]条目顶层键＝内容：人名后面的字段不许被吞（与节同口径）', () => {
  const tree = renderBlock('展示', {
    节: [{
      名: '球员',
      值: [
        { 名: '雪村遥', 位: '前锋 SS级', 体: '180/180', 天赋: '绝对零度射门' },
        { 名: '金刚力也', 粗: '替补席｜体力100%｜随时可上' },
      ],
    }],
  }, SPEC)
  const flat = treeToText([tree])
  assert.ok(flat.includes('180/180'), '体 字段渲染出来')
  assert.ok(flat.includes('绝对零度射门'), '天赋 字段渲染出来')
  assert.ok(flat.includes('替补席｜体力100%｜随时可上'), '粗 字段渲染出来')
  // 描述键仍不当内容
  const desc = renderBlock('展示', { 条目: [{ 名: '甲', 布局: '键值', 折叠: true, 备注: '尾巴' }] }, SPEC)
  const df = treeToText([desc])
  assert.ok(df.includes('尾巴'), '备注照旧渲染')
  assert.ok(!df.includes('键值') && !df.includes('true'), '布局/折叠 不进正文')
})

test('回归[16]条目「字段」包与顶层铺开两种写法等价且不重复', () => {
  const wrapped = renderBlock('展示', { 条目: [{ 名: '甲', 字段: { 体: '100/100' } }] }, SPEC)
  const inline = renderBlock('展示', { 条目: [{ 名: '甲', 体: '100/100' }] }, SPEC)
  assert.equal(treeToText([wrapped]), treeToText([inline]), '两种写法渲染一致')
  const both = renderBlock('展示', { 条目: [{ 名: '甲', 字段: { 体: '100/100' }, 体: '100/100' }] }, SPEC)
  const t = treeToText([both])
  assert.equal(t.split('100/100').length - 1, 1, '字段与顶层同名键不重复渲染')
})
