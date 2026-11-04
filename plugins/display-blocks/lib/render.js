// 展示层 · 渲染树
//
// 产出的是**抽象树**（{tag, cls, style, text, children}），不是真实 DOM。
// 好处：整套渲染逻辑能在 Node 里跑夹具（jsdom 都不需要），客户端只做一次
// 「抽象树 → DOM」的机械转换。渲染规则改错会被夹具当场抓住，而不是等到
// 浏览器里把整个 GUI 带崩。
//
// 渲染纪律：
//   · 一律走 textContent（树的 text 字段），**绝不拼 HTML 字符串** —— 模型输出
//     的内容不可信；拼 innerHTML 等于把注入面交给模型。
//   · 词表外的词不特殊处理，原样渲染成文本（不吞字、不报错）。

import { extractBlocks, parseInline } from './parse.js'
import { blockStyle, colorOf, rarityColor, resolveColor, sectionStyle } from './spec.js'

/** 默认不接管的标记 —— 这些由酒馆皮肤自己的渲染器负责，插件不重复画。 */
export const DEFAULT_SKIP_MARKERS = ['商店', '升级', '车卡', '状态更新', '状态更正']

function n(tag, cls, extra) {
  return { tag, cls: cls || '', text: '', style: '', children: [], ...(extra || {}) }
}

// ── 分节（section）──────────────────────────────────────────
//
// 设计：**渲染器只给骨架，结构由声明者自己长**。
// 一个块里想开几节、节叫什么、每节放什么形状的内容，全由 JSON 决定：
//
//   "节": [
//     {"名":"年龄","值":"127 岁"},
//     {"名":"外貌","图标":"👁","值":"白发黑杖，左手一枚龙鳞戒"},
//     {"名":"服装","值":["玄色长袍","龙鳞胸甲"]},
//     {"名":"状态","值":{"生命":"良好","伤势":"无"}},
//     {"名":"技能","布局":"标签","值":["焰击术","法师之手"]}
//   ]
//
// 也认更省字的映射写法："节": {"年龄":"127 岁","外貌":"…"}
// 版式默认「自动」—— 字符串→文本、数组→列表、对象→键值；可用 `布局` 显式覆盖。
// **节名不在词表里照样渲染**（只是没有图标）；要默认图标/默认版式才动【展示规范】。

/** 认得的「节」键名（容器层）。 */
export const SECTION_KEYS = ['节', 'sections', '分节', '区块']
const SEC_NAME_KEYS = ['名', '名称', 'name', 'title', '标题']
const SEC_VALUE_KEYS = ['值', '内容', 'value', 'body', 'text']
const SEC_ICON_KEYS = ['图标', 'icon']
const SEC_LAYOUT_KEYS = ['布局', 'layout', '样式']
const SEC_COLOR_KEYS = ['色', '颜色', '强调色', 'accent', 'color']
const SEC_RARITY_KEYS = ['稀有度', 'rarity', '品质']
/** 节是否默认折叠：true=收起、false=展开、缺省=按位置（第一节展开，其余收起）。 */
const SEC_FOLD_KEYS = ['折叠', '收起', 'fold', 'collapsed']
/** 描述键集合：它们是"这一节的元信息"，不进内容、也不能当节名。 */
const SEC_DESC_KEYS = new Set([
  ...SEC_NAME_KEYS, ...SEC_VALUE_KEYS, ...SEC_ICON_KEYS, ...SEC_LAYOUT_KEYS,
  ...SEC_COLOR_KEYS, ...SEC_RARITY_KEYS, ...SEC_FOLD_KEYS, ...SECTION_KEYS,
])
const MAX_SECTION_DEPTH = 4

function pickKey(obj, keys) {
  for (const k of keys) {
    const v = obj[k]
    if (v !== undefined && v !== null && v !== '') return v
  }
  return undefined
}

/**
 * 把「节」声明规整成 `[{name, value, icon, layout}]`。
 * 容忍四种写法：描述对象数组 / `{节名: 值}` 映射 / 单键对象 / 裸字符串。
 */
export function normalizeSections(raw) {
  const out = []
  const add = (name, value, extra) => {
    out.push({
      name: str(name).trim(),
      value,
      icon: str((extra && extra.icon) || '').trim(),
      layout: str((extra && extra.layout) || '').trim(),
      color: str((extra && extra.color) || '').trim(),
      rarity: str((extra && extra.rarity) || '').trim(),
      // 三态：true=收起 / false=展开 / undefined=按位置默认（由 renderSectionNode 决定）
      fold: (extra && extra.fold === true) ? true : (extra && extra.fold === false ? false : undefined),
    })
  }
  if (raw === null || raw === undefined) return out
  if (typeof raw !== 'object') { add('', raw); return out }
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item === null || item === undefined) continue
      if (typeof item !== 'object' || Array.isArray(item)) { add('', item); continue }
      const keys = Object.keys(item)
      const name = pickKey(item, SEC_NAME_KEYS)
      const hasValue = SEC_VALUE_KEYS.some((k) => item[k] !== undefined && item[k] !== null)
      const icon = pickKey(item, SEC_ICON_KEYS)
      const layout = pickKey(item, SEC_LAYOUT_KEYS)
      const color = pickKey(item, SEC_COLOR_KEYS)
      const rarity = pickKey(item, SEC_RARITY_KEYS)
      const fold = pickKey(item, SEC_FOLD_KEYS)
      if (name !== undefined || hasValue) {
        // 描述字段以外的键 = 这一节的键值内容（`{"名":"外貌","身高":"175"}` 也认）
        const rest = {}
        for (const k of keys) {
          if (SEC_NAME_KEYS.indexOf(k) >= 0 || SEC_ICON_KEYS.indexOf(k) >= 0) continue
          if (SEC_LAYOUT_KEYS.indexOf(k) >= 0 || SEC_VALUE_KEYS.indexOf(k) >= 0) continue
          if (SEC_COLOR_KEYS.indexOf(k) >= 0 || SEC_RARITY_KEYS.indexOf(k) >= 0) continue
          if (SEC_FOLD_KEYS.indexOf(k) >= 0) continue
          if (SECTION_KEYS.indexOf(k) >= 0) continue
          rest[k] = item[k]
        }
        const value = hasValue
          ? pickKey(item, SEC_VALUE_KEYS)
          : (Object.keys(rest).length ? rest : undefined)
        add(name === undefined ? '' : name, value, { icon, layout, color, rarity, fold })
        continue
      }
      if (keys.length === 1) {
        // 单键简写 = `{"外貌":"…"}`；描述键（折叠/图标/名…）不是内容，别当成节名
        //（`{"折叠":true}` 不该长出一个名叫「折叠」、正文写着 true 的节）
        if (SEC_DESC_KEYS.has(keys[0])) continue
        add(keys[0], item[keys[0]])
        continue
      }
      add('', item)
    }
    return out
  }
  for (const [k, v] of Object.entries(raw)) add(k, v)   // 映射写法
  return out
}

/** 一整组节 → {nodes, named}（块顶层与嵌套共用）。
 *  `named` = **实际渲染**的具名节数（空节被丢弃后不计；批量开合按钮按它出，别把空节算上）。
 *  [WB-109] `mergedCard` 一路透传：合并卡的各节默认全展开（见 renderSectionNode）。 */
function renderSections(raw, spec, depth, foldState, cardKey, mergedCard, parentPath) {
  const box = n('div', depth === 0 ? 'dsp-secs dsp-secs-top' : 'dsp-secs')   // 顶层走选项卡（点哪个看哪个），嵌套节仍走折叠
  let named = 0   // 只有具名节能折叠；「默认展开第一节」按具名节的序号算
  for (const sec of normalizeSections(raw)) {
    const node = renderSectionNode(sec, spec, depth, named, foldState, cardKey, mergedCard, parentPath)
    if (!node) continue
    if (sec.name) named++
    box.children.push(node)
  }
  return { nodes: box.children.length ? [box] : [], named }
}

/** 开合状态表的键：卡片身份 + 节路径（卡片被重画时用它把用户的开合还回去）。
 *  节路径 = 「父节名/子节名」，顶层就只有节名 —— 嵌套的同名节不与外层共享记忆键。 */
function foldKeyOf(cardKey, path) {
  return String(cardKey || '') + '|' + String(path || '')
}

/**
 * 一节 → 节点。空节不画（避免一堆空框）。
 *
 * 折叠策略（2026-10-03 改为**跟 DND 皮肤控制台同一套**）：
 *   视觉隐藏的原生控件（`input.dsp-ctl`）直接放在 `label.dsp-sec-head` **里面** ——
 *   点节头任意位置即切换；不用 id/for，**不需要 uid、不会重名**。
 *   显示交给 CSS：`.dsp-sec:has(> .dsp-sec-head > .dsp-ctl:checked) > .dsp-sec-body`
 *   —— 规则与节名无关，**任意自定义节都一样可折叠**（不牺牲可扩展度）。
 *
 * ⚠️ 为什么不用 `<details>`：实测「折叠了但点不开」——原生 details 依赖浏览器默认动作，
 *   页面上游（宿主/皮肤）一旦拦掉就失效；而 JS 再 toggle `open` 还会与原生行为互相抵消。
 *   改用 `:checked` 状态后，JS 只做**幂等**的 `input.checked = !input.checked`，怎么拦都不会反着来。
 *
 * **无名节不套控件**：没有节头就无处可点，硬套只会把内容藏起来出不去。
 * 默认开合：顶层选项卡「全部收起」、嵌套节「第一节展开」，可用节上的 `折叠: true|false` 覆盖。
 */
function renderSectionNode(sec, spec, depth, index, foldState, cardKey, mergedCard, parentPath) {
  if (!sec) return null
  const style = sectionStyle(spec, sec.name)
  const icon = sec.icon || style.icon
  const layout = sec.layout || style.layout
  // 节的颜色回落：显式「色」→ 本节「稀有度」→ 词表里这个节的默认色 → 不设（继承卡片强调色）
  const color = resolveColor(spec, sec.color) ||
    resolveColor(spec, sec.rarity) ||
    resolveColor(spec, style.color) || ''
  const named = !!sec.name
  // 节路径：顶层 = 节名（与历史键完全一致），嵌套 = 父路径/节名（同名嵌套节不与外层共享折叠记忆）
  const path = sec.name ? (parentPath ? parentPath + '/' + sec.name : sec.name) : (parentPath || '')
  // 开合优先级：**用户这次任务里点过的** > 节上的 `折叠` 声明 > 按位置（第一节开）
  // 记住用户选择是必要的：宿主/皮肤重渲染会把卡片整块换掉，不记就等于「点了没反应」。
  const remembered = (named && foldState && typeof foldState.get === 'function')
    ? foldState.get(foldKeyOf(cardKey, path))
    : undefined
  // [WB-109] **合并卡默认全展开**：一张由多个块合并来的卡（skin 侧打 data-dnd-merged），
  // 本身就是"这一轮的新数据快照"——默认只开第一节会把别的块的节全折起来，
  // 用户看到的就是「合并了但什么都没显示」（真机：13 节的合并卡只露出第 1 节 9% 内容）。
  // 只影响"没被显式声明、也没被用户点过"的节：`折叠:true` 仍然能强制收起。
  const isMergedCard = !!mergedCard
  // 顶层选项卡：**默认全部收起**（点哪个显示哪个）；嵌套节仍「首节开」；合并卡保持全开快照
  const tabMode = depth === 0 && !isMergedCard
  const defaultOpen = isMergedCard ? true : tabMode ? false : (index || 0) === 0
  const open = typeof remembered === 'boolean'
    ? remembered
    : (sec.fold === true ? false : (sec.fold === false ? true : defaultOpen))
  const node = n('div', named ? 'dsp-sec' : 'dsp-sec dsp-sec-plain')
  node.attrs = { 'data-dsp-section': sec.name || '' }
  if (named) {
    // 折叠记忆键直接写在属性上：前端回写时用它，不必自己拼（与渲染端严格一致）
    node.attrs['data-dsp-fold-key'] = foldKeyOf(cardKey, path)
    node.attrs['data-dsp-fold'] = sec.fold === true ? 'closed' : (sec.fold === false ? 'open' : 'auto')
    // 真实开合由 :checked 决定；这个属性只给夹具/调试一个确定的初值
    node.attrs['data-dsp-open'] = open ? '1' : '0'
  }
  if (color) {
    node.attrs['data-dsp-color'] = color
    node.style = `--dsp-sec-accent:${color}`
  }
  if (named) {
    const head = n('label', 'dsp-sec-head')
    head.children.push({
      tag: 'input', cls: 'dsp-ctl', text: '', style: '', children: [],
      attrs: { type: 'checkbox', ...(open ? { checked: '' } : {}) },
    })
    head.children.push({ tag: 'i', cls: 'dsp-sec-num', text: String((index || 0) + 1).padStart(2, '0'), style: '', children: [] })
    if (icon) head.children.push({ tag: 'span', cls: 'dsp-sec-icon', text: icon, style: '', children: [] })
    head.children.push({ tag: 'b', cls: 'dsp-sec-title', text: sec.name, style: '', children: [] })
    head.children.push({ tag: 'span', cls: 'dsp-sec-caret', text: '▾', style: '', children: [] })
    node.children.push(head)
  }
  const body = n('div', 'dsp-sec-body')
  body.children.push(...renderValueNodes(sec.value, layout, spec, depth + 1, foldState, cardKey, mergedCard, path))
  if (!body.children.length) return null
  node.children.push(body)
  return node
}

/** 一节的内容 → 节点。版式「自动」时按值的 JSON 形状挑（内容自己决定长什么样）。
 *  foldState / cardKey / mergedCard / parentPath 一路向嵌套节透传（丢了嵌套节就记不住用户开合）。 */
function renderValueNodes(value, layout, spec, depth, foldState, cardKey, mergedCard, parentPath) {
  if (value === null || value === undefined) return []
  // 空容器不画（README「空节不画」：空字符串、空数组、空对象都不出框）
  if (Array.isArray(value) && !value.length) return []
  if (value && typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length) return []
  if (depth > MAX_SECTION_DEPTH) {
    return [{ tag: 'span', cls: '', text: JSON.stringify(value), style: '', children: [] }]
  }
  const hasNested = (v) => v && typeof v === 'object' && !Array.isArray(v) &&
    SECTION_KEYS.some((k) => v[k] !== undefined)
  /** 取对象里真正的「节」声明（写成 `{节:{…}}` 时要拆包，否则会被当成一个名叫「节」的节）。 */
  const sectionPayload = (v) => {
    for (const k of SECTION_KEYS) if (v[k] !== undefined) return v[k]
    return v
  }

  let want = layout
  if (!want || want === '自动') {
    if (Array.isArray(value)) want = '列表'
    else if (value && typeof value === 'object') want = '键值'
    else want = '文本'
  }
  // 对象里又写了「节」→ 继续往下分（任意层嵌套）
  if (hasNested(value)) {
    return renderSections(sectionPayload(value), spec, depth, foldState, cardKey, mergedCard, parentPath).nodes
  }

  if (want === '文本') return inlineValue(value, spec)
  if (want === '键值') {
    if (value && typeof value === 'object' && !Array.isArray(value)) return [fieldsNode(value, spec)]
    return inlineValue(value, spec)
  }
  if (want === '标签') {
    const chips = n('div', 'dsp-chips')
    const list = Array.isArray(value) ? value
      : (typeof value === 'string' ? value.split(/[、,，;；/]+/) : [value])
    for (const v of list) {
      if (v === null || v === undefined || v === '') continue
      const chip = n('span', 'dsp-chip')
      chip.children.push(...inlineValue(v, spec))
      chips.children.push(chip)
    }
    return chips.children.length ? [chips] : []
  }
  // 列表（未知版式名也退化成列表）
  if (Array.isArray(value)) return [itemsNode(value, spec)]
  if (typeof value === 'object') return [fieldsNode(value, spec)]
  const ul = n('ul', 'dsp-items')
  const li = n('li', 'dsp-item')
  li.children.push(...inlineValue(value, spec))
  ul.children.push(li)
  return [ul]
}

/**
 * 一条完整消息 → 渲染树。
 * @param {string} text 消息正文
 * @param {object} spec 生效规范
 * @param {{skipMarkers?:string[], ownMarkers?:string[]}} [opts]
 * @returns {object[]} 节点数组
 */
export function renderMessage(text, spec, opts) {
  const o = opts || {}
  const skip = new Set(o.skipMarkers || DEFAULT_SKIP_MARKERS)
  const own = Array.isArray(o.ownMarkers) && o.ownMarkers.length ? new Set(o.ownMarkers) : null
  const segments = extractBlocks(text)
  const out = []
  for (const seg of segments) {
    if (seg.kind === 'text') {
      out.push(...renderInline(parseInline(seg.text, spec), spec))
      continue
    }
    // passAll：机器块全交给别人渲染（DND 皮肤的控制台）→ 这里只把原文放回，不动 DOM
    const owned = o.passAll ? false : (own ? own.has(seg.marker) : !skip.has(seg.marker))
    if (!owned) {
      // 不归我管的块：保留原文（含 `]]` 与 `{` 之间的空白），交给别的渲染器（皮肤）处理。
      out.push({ tag: 'span', cls: 'dsp-pass', text: `[[${seg.marker}]]${seg.gap || ''}${seg.raw}`, style: '', children: [] })
      continue
    }
    out.push(renderBlock(seg.marker, seg.json, spec, o))
  }
  return out
}

/** 行内 token → 渲染树。 */
export function renderInline(tokens, spec) {
  const out = []
  for (const t of tokens || []) {
    if (!t) continue
    if (t.kind === 'text') {
      if (t.text) out.push({ tag: 'span', cls: '', text: String(t.text), style: '', children: [] })
      continue
    }
    if (t.kind === 'rarity') {
      out.push({
        tag: 'span',
        cls: 'dsp-rarity',
        text: String(t.word),
        style: `color:${t.color}`,
        attrs: { 'data-rarity': String(t.word) },
        children: [],
      })
      continue
    }
    if (t.kind === 'color') {
      out.push({
        tag: 'span',
        cls: 'dsp-color',
        text: '',
        style: `color:${t.color}`,
        attrs: { 'data-color': String(t.code) },
        children: renderInline(t.tokens, spec),
      })
    }
  }
  return out
}

/**
 * 一个机器块 → 渲染树。
 *
 * 通用结构（AI 自己决定放什么，渲染器不预设字段语义）：
 *   {
 *     "名":   "标题"，
 *     "稀有度": "传说",           ← 查词表上色，词表外则中性
 *     "类型": "组织",             ← 决定图标与面板标题（卡可声明）
 *     "节":   [ {名, 值, 图标?, 布局?} ],  ← **分节**：想开几节、节叫什么，自己定
 *     "字段": { 任意键: 任意值 },  ← 不分节时的扁平键值表
 *     "条目": [ 字符串 | {名,稀有度,字段,…} ],
 *     "备注": "脚注"
 *   }
 * 别名：title/name → 名；rarity → 稀有度；type → 类型；fields → 字段；items/entries → 条目；note → 备注；
 *      sections/分节 → 节。
 */
export function renderBlock(marker, json, spec, opts) {
  const o = opts || {}
  /** [WB-109] 合并卡标记：skin 侧合并多个块时传 `{ merged: true }`，
   *  ⇒ 各节默认全展开（合并卡=这一轮的新数据快照，折起来等于没显示）。
   *  用**浅拷贝**传给下层，避免污染调用方传进来的 foldState（那是个长生命周期 Map）。 */
  const secOpts = o.merged ? { foldState: o.foldState, merged: true } : o
  const data = json && typeof json === 'object' ? json : {}
  const pick = (...keys) => {
    for (const k of keys) {
      const v = data[k]
      if (v !== undefined && v !== null && v !== '') return v
    }
    return undefined
  }
  const title = str(pick('名', '名称', 'title', 'name'))
  const rarityWord = str(pick('稀有度', 'rarity', '品质'))
  const type = str(pick('类型', 'type', '类别')) || (marker !== '展示' ? marker : '')
  const style = blockStyle(spec, type || marker)
  const rarityC = rarityColor(spec, rarityWord)
  // 卡片强调色的回落链：显式「色」→「稀有度」→ 该类型在词表里的默认色 → 兜底褐
  const accent = resolveColor(spec, pick('色', '强调色', '颜色', 'accent', 'color')) ||
    rarityC ||
    resolveColor(spec, style.color) ||
    colorOf(spec, 'm')

  const card = n('section', 'dsp-card')
  card.attrs = { 'data-dsp-marker': String(marker), 'data-dsp-type': type || '' }
  card.style = `--dsp-accent:${accent}`
  // 卡片身份：开合状态表的键用它拼（重画时把用户的开合还回去）；前端也用它回写状态
  const cardKey = String(marker) + '|' + String(title || '')
  card.attrs['data-dsp-card'] = cardKey

  const head = n('header', 'dsp-card-head')
  head.children.push({ tag: 'span', cls: 'dsp-icon', text: style.icon, style: '', children: [] })
  head.children.push({ tag: 'h4', cls: 'dsp-title', text: title || style.title || marker, style: '', children: [] })
  if (type) head.children.push({ tag: 'span', cls: 'dsp-type', text: type, style: '', children: [] })
  if (rarityWord) {
    head.children.push({
      tag: 'span', cls: 'dsp-rarity', text: rarityWord, style: `color:${rarityC || accent}`,
      attrs: { 'data-rarity': rarityWord }, children: [],
    })
  }
  card.children.push(head)

  // ① 分节：骨架由渲染器给，节名与内容由声明者自己填 —— 有就优先渲染
  const sectionsRaw = pick('节', 'sections', '分节', '区块')
  let secNodes = []
  let namedRendered = 0
  if (sectionsRaw !== undefined && sectionsRaw !== null) {
    const rendered = renderSections(sectionsRaw, spec, 0, secOpts.foldState, cardKey, !!o.merged)
    secNodes = rendered.nodes
    namedRendered = rendered.named
  }
  // 具名节 ≥2 才给「全部展开 / 全部收起」——按**实际渲染**的具名节数算
  //（空节被丢弃后不算：1 个可见节 + 1 个空节没什么可批量操作的）
  if (namedRendered >= 2) {
    const tools = n('div', 'dsp-tools')
    tools.children.push({
      tag: 'button', cls: 'dsp-tool', text: '展开全部', style: '', children: [],
      attrs: { type: 'button', 'data-dsp-all': '1' },
    })
    tools.children.push({
      tag: 'button', cls: 'dsp-tool', text: '收起全部', style: '', children: [],
      attrs: { type: 'button', 'data-dsp-all': '0' },
    })
    card.children.push(tools)
  }
  card.children.push(...secNodes)

  // ② 扁平字段表（不分节时的快捷写法）
  const fields = pick('字段', 'fields', '属性')
  if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
    const dl = fieldsNode(fields, spec)
    if (dl.children.length) card.children.push(dl)
  }

  // ③ 条目列表
  const items = pick('条目', 'items', 'entries', '列表')
  if (Array.isArray(items) && items.length) card.children.push(itemsNode(items, spec))

  const note = str(pick('备注', 'note', 'notes', '说明'))
  if (note) {
    const f = n('footer', 'dsp-note')
    f.children.push(...inlineValue(note, spec))
    card.children.push(f)
  }
  return card
}

/** 键值表节点：横排属性格子（与条目同款网格，自动多列铺开，不再一列竖排）。 */
function fieldsNode(fields, spec) {
  const wrap = n('div', 'dsp-fields')
  for (const [k, v] of Object.entries(fields)) {
    const val = (v === '?' || v === '？') ? '未知' : v
    const wide = str(val).length > 24
    const pair = n('span', wide ? 'dsp-pair dsp-pair-wide' : 'dsp-pair')
    pair.children.push({ tag: 'span', cls: 'dsp-kv', text: String(k), style: '', children: [] })
    const vv = n('span', 'dsp-pair-v')
    vv.children.push(...inlineValue(val, spec))
    pair.children.push(vv)
    wrap.children.push(pair)
  }
  return wrap
}

/** 条目列表节点（元素是对象时渲染成条目小卡）。 */
function itemsNode(items, spec) {
  const ul = n('ul', 'dsp-items')
  for (const item of items) ul.children.push(renderItem(item, spec))
  return ul
}

/** 条目上的描述键：元信息，不当内容渲染。与节的口径一致——「描述字段外全是内容」。 */
const ITEM_DESC_KEYS = new Set([
  ...SEC_NAME_KEYS, ...SEC_RARITY_KEYS, ...SEC_COLOR_KEYS,
  ...SEC_ICON_KEYS, ...SEC_LAYOUT_KEYS, ...SEC_FOLD_KEYS,
  '字段', 'fields', '备注', 'note',
])

/** 条目：字符串直接渲染（走行内标注），对象渲染成一行/一张小结。 */
function renderItem(item, spec) {
  const li = n('li', 'dsp-item')
  if (item === null || item === undefined) return li
  if (typeof item !== 'object') {
    li.children.push(...inlineValue(item, spec))
    return li
  }
  if (Array.isArray(item)) {
    li.children.push(...inlineValue(item.join(' / '), spec))
    return li
  }
  const name = str(item['名'] ?? item.name ?? item.title ?? '')
  const rarityWord = str(item['稀有度'] ?? item.rarity ?? item['品质'] ?? '')
  // 条目上的「色」直接染条目名（比稀有度更显式）
  const ownColor = resolveColor(spec, item['色'] ?? item['颜色'] ?? item.color ?? item.accent ?? '')
  if (name) {
    li.children.push({
      tag: 'span', cls: 'dsp-item-name', text: name,
      style: ownColor ? `color:${ownColor}` : '', children: [],
    })
  }
  if (rarityWord) {
    const c = rarityColor(spec, rarityWord) || colorOf(spec, 'm')
    li.children.push({
      tag: 'span', cls: 'dsp-rarity', text: rarityWord, style: `color:${c}`,
      attrs: { 'data-rarity': rarityWord }, children: [],
    })
  }
  const fields = item['字段'] ?? item.fields
  // 「描述字段外全是内容」：`{"名":"雪村遥","体":"180/180","心":"145/150",…}` 里
  // 直接铺在条目顶层的键（位/体/心/CA/粗…）同样是内容，必须渲染——只渲染「名」会把人名后面的字段静默吞掉。
  const pairs = []
  if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
    for (const [k, v] of Object.entries(fields)) pairs.push([k, v])
  }
  for (const [k, v] of Object.entries(item)) {
    if (ITEM_DESC_KEYS.has(k)) continue
    if (fields && typeof fields === 'object' && !Array.isArray(fields) && k in fields) continue   // 「字段」包里已渲染过的键不重复
    pairs.push([k, v])
  }
  if (pairs.length) {
    const wrap = n('div', 'dsp-item-fields')
    for (const [k, v] of pairs) {
      // 裸「？」占位符统一显示为「未知」（禁止问号孤悬）
      const val = (v === '?' || v === '？') ? '未知' : v
      // 短值＝属性格子（一排排格子）；长值独占一行（态/天赋/粗 这类整句）
      const wide = str(val).length > 24
      const pair = n('span', wide ? 'dsp-pair dsp-pair-wide' : 'dsp-pair')
      pair.children.push({ tag: 'span', cls: 'dsp-kv', text: String(k), style: '', children: [] })
      const vv = n('span', 'dsp-pair-v')
      vv.children.push(...inlineValue(val, spec))
      pair.children.push(vv)
      wrap.children.push(pair)
    }
    li.children.push(wrap)
  }
  const rest = str(item['备注'] ?? item.note ?? '')
  if (rest) li.children.push(...inlineValue(rest, spec))
  return li
}

/** 任意值 → 行内节点（字符串会走一遍标注解析）。 */
function inlineValue(value, spec) {
  if (value === null || value === undefined) return []
  if (Array.isArray(value)) return value.flatMap((v) => inlineValue(v, spec))
  if (typeof value === 'object') {
    return [{ tag: 'span', cls: '', text: JSON.stringify(value), style: '', children: [] }]
  }
  return renderInline(parseInline(String(value), spec), spec)
}

function str(v) {
  if (v === null || v === undefined) return ''
  // 对象值不显示 [object Object]（与 inlineValue 的 JSON.stringify 口径一致）
  if (typeof v === 'object') {
    try { return JSON.stringify(v) } catch { return String(v) }
  }
  return String(v)
}

/** 把渲染树摊平成纯文本（夹具与「复制为文本」用）。 */
export function treeToText(nodes) {
  let out = ''
  for (const node of nodes || []) {
    if (!node) continue
    if (node.text) out += node.text
    if (node.children && node.children.length) out += treeToText(node.children)
  }
  return out
}

/** 统计渲染树里出现的稀有度词（夹具用：验证配色有没有被识别）。 */
export function treeRarities(nodes, acc) {
  const bag = acc || {}
  for (const node of nodes || []) {
    if (!node) continue
    if (node.attrs && node.attrs['data-rarity']) {
      const k = node.attrs['data-rarity']
      bag[k] = (bag[k] || 0) + 1
    }
    if (node.children && node.children.length) treeRarities(node.children, bag)
  }
  return bag
}
