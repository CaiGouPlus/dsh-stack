/* dsp-core.js —— 由 build_dsp_core.mjs 从 display-blocks 自动生成，不要手改。
 * 源：D:/DSH/display-blocks/lib/{spec,parse,render}.js + client.js 的 CSS
 * 生成时间：2026-10-28T16:32:08.618Z
 *
 * 契约渲染（节 / 布局 / 色 / 稀有度 / 行内标注）与桌面完全同源；这里只把
 * 「抽象树 → DOM」换成「抽象树 → HTML 字符串」，其余一行未改。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory()
  else root.DshBlockCore = factory()
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict'

  // ══ 以下是 display-blocks 的三个纯函数模块（去掉 import/export 后拼接）══
  var DSP = (function () {
    'use strict'
    /* ---- spec.js ---- */
// 展示层 · 词汇表（spec）
//
// 设计要点：**渲染什么不写在代码里**。稀有度词、配色、块类型的图标全部是数据，
// 内置一套默认（覆盖 D&D 七档 + 常见英文别名），角色卡可以用一段【展示规范】
// 声明去覆盖/扩充它 —— 这就是「让 AI 或角色卡自行判断」的落点：
//   · 卡声明词表 → 模型按词表选词 → 渲染器按词表上色。三方共用同一份数据。
//   · 词表里没有的词不会消失，只是退化成中性样式（不报错、不吞字）。
//
// 纯模块，无任何 DOM / cordis 依赖，可 node --test。

/** 默认稀有度档（词 → 颜色）。顺序即优先级：长的/更具体的排前面。 */
const DEFAULT_RARITIES = [
  { word: '神器', color: '#ff5252', aliases: ['artifact'] },
  { word: '传说', color: '#ffd700', aliases: ['传奇', 'legendary'] },
  { word: '非常稀有', color: '#ff9800', aliases: ['极稀有', 'very rare', 'veryrare', 'epic'] },
  { word: '稀有', color: '#9c27b0', aliases: ['罕见', '珍稀', 'rare'] },
  { word: '精良', color: '#2196f3', aliases: ['优良', 'uncommon'] },
  { word: '非普通', color: '#4caf50', aliases: ['不常见', '魔法'] },
  { word: '普通', color: '#9aa0a6', aliases: ['common', '寻常'] },
]

/**
 * 默认颜色表（名字 → 颜色）。两类名字都放这里，查表逻辑一样：
 *   · 短码：`g` `y` `o` …            —— 行内 `[g]…[/g]` 用（行内只认 ASCII 名）
 *   · 色名：`红` `金` `red` `gold` …  —— 声明位用（块/节的 `色`、`字段` 值等）
 * 卡可以在【展示规范】里用 `颜色: 血红=#8b0000` 扩充，两处立刻都能用。
 */
const DEFAULT_COLORS = {
  // ── 短码（行内标签用） ──
  g: '#ffd700',   // gold
  y: '#fdd835',   // yellow
  o: '#fb8c00',   // orange
  r: '#e53935',   // red
  p: '#8e24aa',   // purple
  b: '#1e88e5',   // blue
  c: '#00acc1',   // cyan
  gr: '#43a047',  // green
  m: '#8d6e63',   // muted brown
  w: '#ffffff',
  k: '#111111',
  // ── 中文色名（声明位用） ──
  红: '#e53935', 橙: '#fb8c00', 黄: '#fdd835', 绿: '#43a047', 青: '#00acc1',
  蓝: '#1e88e5', 紫: '#8e24aa', 粉: '#ec407a', 金: '#ffd700', 银: '#b0bec5',
  白: '#ffffff', 黑: '#111111', 灰: '#9aa0a6', 褐: '#8d6e63', 棕: '#795548',
  深红: '#b71c1c', 血红: '#8b0000', 深蓝: '#1565c0', 天蓝: '#81d4fa',
  翠绿: '#2e7d32', 草绿: '#7cb342', 暗金: '#b8860b', 铜: '#cd7f32',
  墨: '#212121', 米: '#f5f0e1', 银蓝: '#78909c', 玫瑰: '#f06292',
  // ── 英文色名（声明位用；也方便模型少打 #hex） ──
  red: '#e53935', orange: '#fb8c00', yellow: '#fdd835', green: '#43a047',
  cyan: '#00acc1', blue: '#1e88e5', purple: '#8e24aa', pink: '#ec407a',
  gold: '#ffd700', silver: '#b0bec5', white: '#ffffff', black: '#111111',
  gray: '#9aa0a6', grey: '#9aa0a6', brown: '#795548', crimson: '#b71c1c',
  teal: '#00897b', navy: '#1a237e', lime: '#c0ca33', amber: '#ffb300',
  violet: '#7e57c2', magenta: '#d81b60', steel: '#78909c', ink: '#212121',
}

/** 默认块类型（图标 + 面板标题 + 默认强调色）。未声明的类型用兜底样式。 */
const DEFAULT_BLOCKS = {
  商店: { icon: '🏪', title: '商店', color: '#ffb300' },
  升级: { icon: '⬆️', title: '升级', color: '#66bb6a' },
  组织: { icon: '🏛️', title: '组织', color: '#1e88e5' },
  人物: { icon: '👤', title: '人物', color: '#8e24aa' },
  地点: { icon: '📍', title: '地点', color: '#43a047' },
  任务: { icon: '📜', title: '任务', color: '#fb8c00' },
  典籍: { icon: '📖', title: '典籍', color: '#8d6e63' },
  物品: { icon: '⚔️', title: '物品', color: '#78909c' },
  展示: { icon: '📋', title: '信息', color: '#607d8b' },
}

/** 兜底块样式（未在 blocks 里声明的类型）。 */
const FALLBACK_BLOCK = { icon: '📋', title: '', color: '' }

/**
 * 节（section）的可用版式。**渲染器只提供这几种骨架**，用哪种由内容自己决定：
 *   · 自动（默认）—— 按值的 JSON 形状挑：字符串→文本、数组→列表、对象→键值
 *   · 文本 —— 一整段（仍走行内标注）
 *   · 键值 —— 两列键值表
 *   · 列表 —— 逐行（元素是对象就渲染成条目小卡）
 *   · 标签 —— 一行胶囊（适合「服装 / 身材 / 技能名」这类短值）
 */
const LAYOUTS = ['自动', '文本', '键值', '列表', '标签']

/**
 * 默认节样式（节名 → 图标 / 默认版式 / 默认颜色）。
 * 只是**默认值**：节名由内容自己起，词表里没有的节名照样渲染（无图标、自动版式、
 * 颜色继承卡片的强调色）。卡可以在【展示规范】里用 `节: 外貌=👁|文本|天蓝` 覆盖或新增。
 */
const DEFAULT_SECTIONS = {
  年龄: { icon: '🎂', color: '#9aa0a6' },
  外貌: { icon: '👁️', color: '#1e88e5' },
  身材: { icon: '📏', color: '#43a047' },
  心理: { icon: '🧠', color: '#8e24aa' },
  性格: { icon: '💭', color: '#ab47bc' },
  状态: { icon: '🩹', color: '#ff7043' },
  服装: { icon: '👘', color: '#ec407a' },
  装备: { icon: '🎒', color: '#795548' },
  技能: { icon: '⚔️', color: '#ffb300' },
  背景: { icon: '📜', color: '#8d6e63' },
  关系: { icon: '🤝', color: '#26a69a' },
  目标: { icon: '🎯', color: '#e53935' },
}

/** 兜底节样式：无图标、自动版式、颜色继承卡片。 */
const FALLBACK_SECTION = { icon: '', layout: '', color: '' }

/**
 * 内置默认规范。任何一层（卡 / 用户设置）都在这个基础上做**增量覆盖**，
 * 不做整体替换 —— 否则卡只写了三条颜色就会把二十条默认全丢掉。
 */
function defaultSpec() {
  return {
    version: 1,
    rarities: DEFAULT_RARITIES.map((r) => ({ word: r.word, color: r.color, aliases: [...r.aliases] })),
    colors: { ...DEFAULT_COLORS },
    blocks: Object.fromEntries(Object.entries(DEFAULT_BLOCKS).map(([k, v]) => [k, { ...v }])),
    sections: Object.fromEntries(Object.entries(DEFAULT_SECTIONS).map(([k, v]) => [k, { ...v }])),
    /** 标注定界符：[] 与（）与【】都认。稀有度定界符由 parse.js 实际消费（可被覆盖层改写）。 */
    delimiters: { rarity: [['（', '）'], ['【', '】'], ['[', ']']], color: ['[', ']'] },
  }
}

/** 词 → 颜色。大小写与首尾空白都容忍；返回值经 safeColorValue 净化。 */
function rarityColor(spec, word) {
  const key = String(word == null ? '' : word).trim().toLowerCase()
  if (!key) return null
  for (const r of spec.rarities) {
    if (r.word.toLowerCase() === key) return safeColorValue(r.color)
    if (Array.isArray(r.aliases) && r.aliases.some((a) => String(a).toLowerCase() === key)) return safeColorValue(r.color)
  }
  return null
}

// ── 颜色出口净化（模型/卡的输出不可信）────────────────────────
//
// 【展示规范】的词表值是**数据**，可能被写成任意字符串；渲染端会把它拼进 style
// 属性 —— 不净化等于把任意 CSS 交给卡/模型（`颜色: g=red;background:url(…)`）。
// 纪律：出口只放行 ① #hex（3/6/8 位）② CSS 标准色名关键字；其余一律 null，
// 由调用方的回落链接管，绝不把可疑值送进 style。

/** CSS 标准色名关键字（Color Module Level 4 named colors + transparent/currentcolor）。 */
const CSS_COLOR_KEYWORDS = new Set([
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black',
  'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse',
  'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan',
  'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta',
  'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen',
  'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink',
  'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen',
  'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow',
  'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender',
  'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan',
  'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon',
  'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue',
  'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine',
  'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue',
  'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream',
  'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange',
  'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred',
  'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple',
  'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell',
  'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen',
  'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white',
  'whitesmoke', 'yellow', 'yellowgreen', 'transparent', 'currentcolor',
])

/**
 * 出口净化：只放行 #hex 与 CSS 色名关键字（色名统一小写输出）。
 * 词表值本身也要过这一关 —— 词表是数据，值可能带 `;`、`url()` 之类的东西。
 * 认不出返回 null，调用方继续回落，不吞内容。
 */
function safeColorValue(v) {
  const s = String(v == null ? '' : v).trim()
  if (!s) return null
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return s
  const k = s.toLowerCase()
  if (CSS_COLOR_KEYWORDS.has(k)) return k
  return null
}

/** 短码 → 颜色；也接受 `#rrggbb` 直写。出口经 safeColorValue 净化。 */
function colorOf(spec, code) {
  const key = String(code == null ? '' : code).trim()
  if (!key) return null
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(key)) return key
  return safeColorValue(spec.colors[key.toLowerCase()])
}

/**
 * 一个「颜色值」→ 具体颜色（统一入口，声明位都用它）。
 * 认：`#hex`（3/6/8 位）、色码 / 色名（词表 colors，如 `g` / `红` / `gold`）、
 * 稀有度词（如 `传说` → 词表里的金色）。
 * 认不出来返回 null —— 调用方继续往下一级回落，不会吞掉内容。
 */
function resolveColor(spec, value) {
  const v = String(value == null ? '' : value).trim()
  if (!v) return null
  return colorOf(spec, v) || rarityColor(spec, v) || null
}

/** 块类型 → { icon, title, color }。未声明的类型给兜底。 */
function blockStyle(spec, type) {
  const key = String(type == null ? '' : type).trim()
  const hit = key && spec.blocks[key]
  if (hit) return { icon: hit.icon || FALLBACK_BLOCK.icon, title: hit.title || key, color: hit.color || '' }
  return { icon: FALLBACK_BLOCK.icon, title: key || FALLBACK_BLOCK.title, color: '' }
}

/** 节名 → { icon, layout, color }。未声明的节名给兜底（无图标、自动版式、继承卡片色）。 */
function sectionStyle(spec, name) {
  const key = String(name == null ? '' : name).trim()
  const hit = key && spec.sections && spec.sections[key]
  if (!hit) return { ...FALLBACK_SECTION }
  return { icon: hit.icon || '', layout: hit.layout || '', color: hit.color || '' }
}

// ── 卡侧声明【展示规范】的解析 ──────────────────────────────
//
// 语法有意做成「人能读、AI 也好写」的纯文本，不引入嵌套结构：
//
//   【展示规范】
//   稀有度: 普通=#9aa0a6, 非普通=#4caf50, 稀有=#9c27b0, 传说=#ffd700
//   颜色: g=#ffd700, r=#e53935, warn=#ff9800, 血红=#8b0000   ← 色码 / 色名都能加
//   块: 商店=🏪, 组织=🏛️|组织与势力, 秘宝=💎|秘宝图鉴|天蓝   ← 图标|标题|默认色
//   节: 外貌=👁|文本, 技能=⚔️|列表|暗金                  ← 图标|版式|默认色
//
// 规则：
//   · `词=值` 一行多条，逗号分隔；
//   · 块的 `图标|标题|颜色`，后两段可省（省标题则用类型名）；
//   · 节的 `图标|版式|颜色`；段位缺失时按「是不是版式名」判定，不瞎猜；
//   · 不认识的键整体忽略（不抛错），保证卡写坏了也不会崩渲染。

const SPEC_HEAD_RE = /【展示规范】/

/** 这个词是版式名吗（`文本` / `键值` / `列表` / `标签` / `自动`）。 */
function isLayout(token) {
  return LAYOUTS.indexOf(String(token == null ? '' : token).trim()) >= 0
}

/**
 * 这个词看着像颜色吗（`#hex` / 词表色名 / 本段声明过的色名与稀有度词）。
 * 用于词表行的段位判定（`块: 势力=🏰|warn` 的第二段是色还是标题）。
 * 判据与 resolveColor 口径一致：色值认 #hex、色码、色名、稀有度词。
 * `extraNames` 是本段【展示规范】里声明的色名/稀有度词（先扫一遍收集，不受行序影响）。
 */
function looksLikeColor(token, extraNames) {
  const t = String(token == null ? '' : token).trim()
  if (!t) return false
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(t)) return true
  const k = t.toLowerCase()
  if (Object.prototype.hasOwnProperty.call(DEFAULT_COLORS, k)) return true
  if (extraNames && extraNames.has(k)) return true
  return DEFAULT_RARITIES.some((r) =>
    r.word.toLowerCase() === k || (Array.isArray(r.aliases) && r.aliases.some((a) => String(a).toLowerCase() === k)))
}

/**
 * 从任意文本（通常是卡 desc）里抽出【展示规范】声明。
 * @returns {object|null} 原始声明（未合并默认），没有声明时返回 null
 */
function extractSpecDeclaration(text) {
  const s = String(text || '')
  const head = s.search(SPEC_HEAD_RE)
  if (head < 0) return null
  const rest = s.slice(head).replace(SPEC_HEAD_RE, '')
  // 到下一个【…】小节标题为止（与项目里 desc 分区的写法一致）
  const stop = rest.search(/\n\s*(?=【)/)
  const body = stop >= 0 ? rest.slice(0, stop) : rest
  const out = { rarities: [], colors: {}, blocks: {}, sections: {} }
  // 先扫一遍收集本段声明的色名/稀有度词 —— 块两段判色（图标|标题 vs 图标|颜色）
  // 需要它们，且判据不能受行序影响（`块:` 写在 `颜色:` 前面也得认）。
  const declaredNames = new Set()
  for (const rawLine of body.split(/\r?\n/)) {
    const lm = /^(稀有度|颜色|色)\s*[:：]\s*(.+)$/.exec(rawLine.trim())
    if (!lm) continue
    for (const pair of lm[2].split(/[,，]/)) {
      const eq = pair.indexOf('=')
      if (eq > 0) {
        const nm = pair.slice(0, eq).trim()
        if (nm) declaredNames.add(nm.toLowerCase())
      }
    }
  }
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const m = /^(稀有度|颜色|色|块|块类型|节|分节)\s*[:：]\s*(.+)$/.exec(line)
    if (!m) continue
    const kind = m[1]
    for (const pair of m[2].split(/[,，]/)) {
      const item = pair.trim()
      if (!item) continue
      const eq = item.indexOf('=')
      if (eq < 0) continue
      const key = item.slice(0, eq).trim()
      const value = item.slice(eq + 1).trim()
      if (!key || !value) continue
      if (kind === '稀有度') out.rarities.push({ word: key, color: value })
      else if (kind === '颜色' || kind === '色') out.colors[key.toLowerCase()] = value
      else if (kind === '节' || kind === '分节') {
        // `节: 外貌=👁|文本|天蓝`（三段：图标|版式|颜色）
        // 段位缺失时按顺序判定，不瞎猜：
        //   1 段 → 是版式名就当版式，否则当图标
        //   2 段 → 第 2 段是版式名 = 图标|版式；第 1 段是版式名 = 版式|颜色；否则 = 图标|颜色
        const parts = value.split('|').map((x) => x.trim())
        let icon = ''
        let layout = ''
        let color = ''
        if (parts.length >= 3) {
          icon = parts[0]; layout = parts[1]; color = parts[2]
        } else if (parts.length === 2) {
          if (isLayout(parts[1])) { icon = parts[0]; layout = parts[1] }
          else if (isLayout(parts[0])) { layout = parts[0]; color = parts[1] }
          else { icon = parts[0]; color = parts[1] }
        } else if (isLayout(parts[0])) {
          layout = parts[0]
        } else {
          icon = parts[0]
        }
        out.sections[key] = { icon, layout, color }
      } else {
        // `块: 组织=🏛️|组织与势力|蓝`；两段且第 2 段看着是颜色 → 图标|颜色。
        // 缺段**留空字符串**，由 mergeSpec 回落默认 —— 在这里兜底成 key/兜底图标
        // 会把默认标题/图标洗掉（`块: 展示=🔍` 不该把标题「信息」改成「展示」）。
        const parts = value.split('|').map((x) => x.trim())
        let icon = parts[0] || ''
        let title = ''
        let color = ''
        if (parts.length >= 3) { title = parts[1]; color = parts[2] }
        else if (parts.length === 2) {
          if (looksLikeColor(parts[1], declaredNames)) color = parts[1]
          else title = parts[1]
        }
        out.blocks[key] = { icon, title, color }
      }
    }
  }
  return out
}

/**
 * 把若干层覆盖合并到默认规范上。
 * 合并顺序：默认 → 卡声明 → 用户设置（后者覆盖前者；稀有度是**按词去重**，不是整体替换）。
 * @param {...(object|null)} layers
 * @returns {object} 合并后的规范（新对象，不改进参）
 */
function mergeSpec(...layers) {
  const base = defaultSpec()
  for (const layer of layers) {
    if (!layer || typeof layer !== 'object') continue
    if (Array.isArray(layer.rarities)) {
      for (const r of layer.rarities) {
        if (!r || !r.word) continue
        const color = String(r.color || '').trim()
        if (!color) continue
        const at = base.rarities.findIndex((x) => x.word === r.word)
        if (at >= 0) base.rarities[at] = { ...base.rarities[at], ...r, color }
        else base.rarities.push({ word: r.word, color, aliases: Array.isArray(r.aliases) ? r.aliases : [] })
      }
      // 具体词优先：长词排前面，避免「稀有」抢在「非常稀有」前面匹配。
      base.rarities.sort((a, b) => b.word.length - a.word.length)
    }
    if (layer.colors && typeof layer.colors === 'object') {
      for (const [k, v] of Object.entries(layer.colors)) {
        if (typeof v === 'string' && v.trim()) base.colors[String(k).toLowerCase()] = v.trim()
      }
    }
    if (layer.blocks && typeof layer.blocks === 'object') {
      for (const [k, v] of Object.entries(layer.blocks)) {
        if (!v || typeof v !== 'object') continue
        // 补键不改键：没声明的那一段保留默认，别把默认标题/图标/色洗掉
        const prev = base.blocks[k] || {}
        base.blocks[k] = {
          icon: v.icon || prev.icon || FALLBACK_BLOCK.icon,
          title: v.title || prev.title || k,
          color: v.color || prev.color || '',
        }
      }
    }
    if (layer.sections && typeof layer.sections === 'object') {
      for (const [k, v] of Object.entries(layer.sections)) {
        if (!v || typeof v !== 'object') continue
        const prev = base.sections[k] || {}
        base.sections[k] = {
          icon: v.icon || prev.icon || '',
          layout: v.layout || prev.layout || '',
          color: v.color || prev.color || '',
        }
      }
    }
    // 定界符也能被覆盖（parse.js 的稀有度定界符读这里；颜色标签固定 []）
    if (layer.delimiters && typeof layer.delimiters === 'object') {
      if (Array.isArray(layer.delimiters.rarity)) {
        const pairs = layer.delimiters.rarity
          .filter((p) => Array.isArray(p) && p.length >= 2 && p[0] && p[1])
          .map((p) => [String(p[0]), String(p[1])])
        if (pairs.length) base.delimiters.rarity = pairs
      }
    }
  }
  return base
}

/** 一步到位：卡文本 + 用户设置 → 生效规范。 */
function specFromCardText(text, userLayer) {
  return mergeSpec(extractSpecDeclaration(text), userLayer)
}

    /* ---- parse.js ---- */
// 展示层 · 解析（机器块 + 行内标注）
//
// 两件事，都不碰 DOM：
//   ① extractBlocks —— 把「[[任意标记]]{json}」从正文里切出来；
//   ② parseInline   —— 把行内标注（稀有度 / 颜色标签）切成 token。
//
// 判据纪律（沿用项目里踩过的真实 bug 教训）：
//   · 机器块判据必须是 `[[X]]{` **且大括号能配平解析出对象** —— 只测 /\[\[X\]\]/
//     会把皮肤自己写的「来源：[[商店]] …」这类说明文字误当机器块。
//   · 块可以被正文包着（不要求独占开头），因为别的卡不一定守那条契约。
//   · 稀有度标注**只在词表命中时才成立** —— 词表外的「（某某）」原样保留，
//     所以不会把普通括号内容染上颜色。

/* 词表查询直接 import —— spec.js 不反向依赖本模块，没有循环。 */

/** 机器块标记：`[[名字]]{`。名字限制长度与字符，避免把 [[[1]]] 之类的噪音吃进来。 */
const MARKER_RE = /\[\[([^[\]\n]{1,16})\]\]\s*\{/g

/**
 * 从 `text[from]` 起，按大括号配平切出一个 JSON 对象。
 * 字符串内的 `{}`、转义引号都跳过；未闭合返回 null。
 */
function balancedObject(text, from) {
  const t = String(text || '')
  const start = t.indexOf('{', from)
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < t.length; i++) {
    const c = t[i]
    if (inStr) {
      if (esc) { esc = false; continue }
      if (c === '\\') { esc = true; continue }
      if (c === '"') inStr = false
      continue
    }
    if (c === '"') { inStr = true; continue }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        const raw = t.slice(start, i + 1)
        try {
          const json = JSON.parse(raw)
          return json && typeof json === 'object' ? { json, raw, start, end: i + 1 } : null
        } catch {
          return null
        }
      }
    }
  }
  return null
}

/**
 * 把正文切成「文本段 / 机器块段」。
 * @param {string} text
 * @returns {{kind:'text',text:string}|{kind:'block',marker:string,json:object,raw:string,gap:string}[]}
 *   block.gap = `]]` 与 `{` 之间的原文（通常为空白；透传给别人渲染时要原样保留）
 */
function extractBlocks(text) {
  const s = String(text || '')
  if (!s) return []
  const out = []
  let cursor = 0
  MARKER_RE.lastIndex = 0
  let m
  while ((m = MARKER_RE.exec(s)) !== null) {
    const marker = m[1]
    const braceAt = m.index + m[0].length - 1   // `{` 的位置
    const hit = balancedObject(s, braceAt)
    if (!hit) continue                              // 解析不出对象 → 当普通文本，继续找下一个
    if (hit.start !== braceAt) continue
    if (m.index > cursor) out.push({ kind: 'text', text: s.slice(cursor, m.index) })
    // gap：`[[标记]]` 的收尾 `]]` 之后、`{` 之前的原文切片（MARKER_RE 的 \s* 吞掉的空白）
    const headEnd = m.index + marker.length + 4     // `[[` + 名字 + `]]`
    out.push({ kind: 'block', marker, json: hit.json, raw: hit.raw, gap: s.slice(headEnd, braceAt) })
    cursor = hit.end
    MARKER_RE.lastIndex = hit.end
  }
  if (cursor < s.length) out.push({ kind: 'text', text: s.slice(cursor) })
  return out
}

// ── 行内标注 ───────────────────────────────────────────────

/** 稀有度标注的定界符对。`[]` 放最后，因为颜色标签也用 `[]`，先处理带闭合的那种。 */
const RARITY_PAIRS = [['（', '）'], ['【', '】'], ['[', ']']]

/** 生效的稀有度定界符对：spec.delimiters.rarity 可覆盖（见 mergeSpec），缺省用内置三种。 */
function rarityPairsOf(spec) {
  const pairs = spec && spec.delimiters && spec.delimiters.rarity
  if (!Array.isArray(pairs) || !pairs.length) return RARITY_PAIRS
  const out = []
  for (const p of pairs) {
    if (Array.isArray(p) && p.length >= 2 && p[0] && p[1]) out.push([String(p[0]), String(p[1])])
  }
  return out.length ? out : RARITY_PAIRS
}

/**
 * 解析行内标注 → token 序列。
 *
 * 支持（都由 spec 词表驱动，词表外的原样保留）：
 *   · 稀有度：`（传说）` / `【传说】` / `[传说]`
 *   · 颜色  ：`[g]金色文字[/g]`、`[血红]文字[/血红]`、`[#rrggbb]…[/#rrggbb]`；
 *             内外可嵌套稀有度标注
 *
 * 判据纪律：颜色标签**名字必须命中词表且必须有闭合**，否则原样保留 ——
 * 所以 `[传说]`（稀有度定界符）、Markdown 链接 `[文字](url)` 都不会被误吃。
 *
 * @param {string} text
 * @param {object} spec 生效规范
 * @returns {{kind:string}[]} token 序列
 */
function parseInline(text, spec) {
  const s = String(text || '')
  if (!s) return []
  return parseColorSegments(s, spec)
}

/** 第一层：切颜色标签（有闭合才成立）。名字可以是 ASCII 短码，也可以是中文色名。 */
function parseColorSegments(text, spec) {
  const tokens = []
  const openRe = /\[([A-Za-z\u4e00-\u9fa5][A-Za-z0-9_\u4e00-\u9fa5]{0,9}|#[0-9a-fA-F]{3,8})\]/g
  let cursor = 0
  let m
  while ((m = openRe.exec(text)) !== null) {
    const code = m[1]
    const color = colorOf(spec, code)
    if (!color) continue
    // 闭合标签大小写不敏感（colorOf 查表就不敏感：`[g]x[/G]` 应当成立）
    const closeRe = new RegExp('\\[\\/' + code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\]', 'gi')
    closeRe.lastIndex = m.index + m[0].length
    const cm = closeRe.exec(text)
    if (!cm) continue                               // 没有闭合 → 不成立，当普通文本
    const closeAt = cm.index
    if (m.index > cursor) tokens.push(...parseRaritySegments(text.slice(cursor, m.index), spec))
    const inner = text.slice(m.index + m[0].length, closeAt)
    tokens.push({ kind: 'color', code, color, tokens: parseRaritySegments(inner, spec) })
    cursor = closeAt + cm[0].length
    openRe.lastIndex = cursor
  }
  if (cursor < text.length) tokens.push(...parseRaritySegments(text.slice(cursor), spec))
  return tokens
}

/** 第二层：切稀有度标注（只在词表命中时成立）。 */
function parseRaritySegments(text, spec) {
  const tokens = []
  const pairs = rarityPairsOf(spec)
  let cursor = 0
  let guard = 0
  while (cursor < text.length && guard++ < 5000) {
    let best = null
    for (const [open, close] of pairs) {
      let at = text.indexOf(open, cursor)
      while (at >= 0) {
        const end = text.indexOf(close, at + open.length)
        if (end < 0) break
        const inner = text.slice(at + open.length, end)
        // 词表命中才成立；内层不允许再有定界符（避免嵌套歧义）。
        // 长度帽只防误配，不跟词表较劲：词表允许任意长的稀有度词，这里给 32 宽限。
        const color = inner.length <= 32 && !/[[\]（）【】]/.test(inner) ? rarityColor(spec, inner) : null
        if (color) {
          if (!best || at < best.at) best = { at, end, open, close, word: inner.trim(), color }
          break
        }
        at = text.indexOf(open, at + open.length)
      }
    }
    if (!best) break
    if (best.at > cursor) tokens.push({ kind: 'text', text: text.slice(cursor, best.at) })
    tokens.push({ kind: 'rarity', word: best.word, color: best.color, open: best.open, close: best.close })
    cursor = best.end + best.close.length
  }
  if (cursor < text.length) tokens.push({ kind: 'text', text: text.slice(cursor) })
  return tokens
}

/* 词表查询直接 import 自 spec.js（见文件头），此处无需再注入。 */

    /* ---- render.js ---- */
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



/** 默认不接管的标记 —— 这些由酒馆皮肤自己的渲染器负责，插件不重复画。 */
const DEFAULT_SKIP_MARKERS = ['商店', '升级', '车卡', '状态更新', '状态更正']

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
const SECTION_KEYS = ['节', 'sections', '分节', '区块']
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
function normalizeSections(raw) {
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
function renderMessage(text, spec, opts) {
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
function renderInline(tokens, spec) {
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
function renderBlock(marker, json, spec, opts) {
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
function treeToText(nodes) {
  let out = ''
  for (const node of nodes || []) {
    if (!node) continue
    if (node.text) out += node.text
    if (node.children && node.children.length) out += treeToText(node.children)
  }
  return out
}

/** 统计渲染树里出现的稀有度词（夹具用：验证配色有没有被识别）。 */
function treeRarities(nodes, acc) {
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

    return {
      renderBlock: renderBlock,
      renderMessage: renderMessage,
      renderInline: renderInline,
      extractBlocks: extractBlocks,
      parseInline: parseInline,
      normalizeSections: normalizeSections,
      defaultSpec: defaultSpec,
      mergeSpec: mergeSpec,
      specFromCardText: specFromCardText,
      rarityColor: rarityColor,
      colorOf: colorOf,
      blockStyle: blockStyle,
      sectionStyle: sectionStyle,
      DEFAULT_SKIP_MARKERS: DEFAULT_SKIP_MARKERS
    }
  })()

  // ══ 抽象树 → HTML 字符串（替代 client.js 里那 17 行 toDom）══
  var VOID_TAGS = { br: 1, hr: 1, img: 1, input: 1, source: 1, col: 1, wbr: 1 }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }

  function toHtml(node) {
    if (!node) return ''
    if (!node.tag) return esc(node.text)
    var attrs = ''
    if (node.cls) attrs += ' class="' + esc(node.cls) + '"'
    if (node.style) attrs += ' style="' + esc(node.style) + '"'
    if (node.attrs) {
      for (var key in node.attrs) {
        if (!Object.prototype.hasOwnProperty.call(node.attrs, key)) continue
        if (/^on/i.test(key)) continue          // 绝不输出事件属性
        attrs += ' ' + key + '="' + esc(node.attrs[key]) + '"'
      }
    }
    if (VOID_TAGS[node.tag]) return '<' + node.tag + attrs + '>'
    var inner = node.text ? esc(node.text) : ''
    var children = node.children || []
    for (var i = 0; i < children.length; i++) inner += toHtml(children[i])
    return '<' + node.tag + attrs + '>' + inner + '</' + node.tag + '>'
  }

  var CSS = "\n/* ── 卡片：块状面板（视觉 token 走 DND 皮肤：皮肤激活时自动同色，否则用兜底） ── */\n.dsp-card{\n  --dsp-accent:#8d6e63;\n  --dsp-gold:var(--dnd-gold,#b08d3f);\n  --dsp-line:var(--dnd-card-border,color-mix(in srgb,currentColor 20%,transparent));\n  --dsp-line-soft:var(--dnd-panel-line,color-mix(in srgb,currentColor 12%,transparent));\n  position:relative;overflow:hidden;\n  border:1px solid var(--dsp-line);\n  border-radius:12px;\n  padding:10px 14px 10px 14px;\n  margin:10px 0;\n  background:var(--dnd-panel-bg,\n    linear-gradient(135deg,color-mix(in srgb,var(--dsp-accent) 8%,transparent),transparent 60%),\n    color-mix(in srgb,currentColor 4%,transparent));\n  font-size:.95em;\n  box-shadow:var(--dnd-card-shadow,0 1px 3px rgba(0,0,0,.14));\n  transition:border-color .15s ease,box-shadow .15s ease;\n}\n.dsp-card:hover{\n  border-color:color-mix(in srgb,var(--dsp-gold) 55%,transparent);\n  box-shadow:0 3px 10px rgba(0,0,0,.18);\n}\n/* 顶部金线：与皮肤状态卡 / 档案控制台的 2px 金顶栏呼应 */\n.dsp-card::before{\n  content:'';position:absolute;left:0;right:0;top:0;height:2px;\n  background:linear-gradient(90deg,\n    color-mix(in srgb,var(--dsp-gold) 85%,transparent),\n    color-mix(in srgb,var(--dsp-accent) 55%,transparent) 55%,\n    transparent);\n}\n/* ── 卡片头 ── */\n.dsp-card-head{\n  display:flex;align-items:center;gap:8px;flex-wrap:wrap;\n  padding-bottom:8px;margin-bottom:8px;\n  border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent);\n}\n.dsp-card-head .dsp-icon{\n  display:inline-flex;align-items:center;justify-content:center;\n  width:2em;height:2em;font-size:1.12em;line-height:1;border-radius:8px;\n  background:color-mix(in srgb,var(--dsp-accent) 16%,transparent);\n  box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--dsp-accent) 32%,transparent);\n}\n.dsp-card-head .dsp-title{margin:0;font-size:1.22em;font-weight:700;letter-spacing:.02em}\n.dsp-card-head .dsp-rarity{margin-left:auto}\n/* ── 徽章 ── */\n/* 类型徽章做成皮肤那种「眉标」：小号等宽 + 字距 + 金色描边（拉丁字母自动大写） */\n.dsp-type{\n  font-family:var(--dnd-mono,Consolas,'JetBrains Mono',monospace);\n  font-size:.78em;font-weight:600;text-transform:uppercase;letter-spacing:.09em;\n  color:color-mix(in srgb,var(--dsp-gold) 78%,currentColor);\n  border:1px solid color-mix(in srgb,var(--dsp-gold) 38%,transparent);\n  border-radius:999px;padding:1px 8px;\n}\n.dsp-rarity{\n  display:inline-block;font-weight:700;font-size:.95em;line-height:1.5;\n  padding:0 8px;border-radius:999px;\n  background:color-mix(in srgb,currentColor 14%,transparent);\n  box-shadow:inset 0 0 0 1px color-mix(in srgb,currentColor 32%,transparent);\n}\n/* ── 字段表：横排属性格子（与条目同款网格） ── */\n.dsp-fields{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px 16px;margin:6px 0 0;font-size:1.05em}\n.dsp-fields dt{\n  color:color-mix(in srgb,currentColor 62%,transparent);\n  font-size:1.05em;white-space:nowrap;justify-self:start;\n  background:color-mix(in srgb,currentColor 7%,transparent);\n  border-radius:4px;padding:1px 7px;\n}\n.dsp-fields dd{margin:0}\n/* ── 条目（名册式）：融入面板的清单——细线分隔、无底色盒子，靠留白和字重分层 ── */\n.dsp-items{margin:6px 0 0;padding:0;list-style:none;display:flex;flex-direction:column}\n.dsp-items .dsp-item{\n  position:relative;padding:8px 2px 9px;\n}\n.dsp-items .dsp-item + .dsp-item{border-top:1px solid var(--dsp-line-soft)}\n.dsp-items .dsp-item::before{content:none}\n.dsp-item-name{\n  display:inline-block;font-weight:700;font-size:1.08em;letter-spacing:.03em;\n  color:color-mix(in srgb,currentColor 92%,transparent);\n}\n.dsp-item-name::before{\n  content:'';display:inline-block;width:4px;height:4px;border-radius:50%;\n  background:var(--dsp-accent);opacity:.6;margin-right:7px;vertical-align:middle;\n}\n.dsp-item-fields{\n  display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));\n  gap:8px 16px;margin-top:6px;\n}\n.dsp-pair{display:flex;flex-direction:column;gap:2px;min-width:0}\n.dsp-pair .dsp-kv{\n  color:color-mix(in srgb,currentColor 62%,transparent);\n  font-size:1.02em;letter-spacing:.05em;margin:0;\n}\n.dsp-pair .dsp-pair-v{\n  color:color-mix(in srgb,currentColor 94%,transparent);\n  font-size:1.05em;line-height:1.45;\n}\n/* 长文（态/天赋/粗 这类整句）：横排一行，标签在前 */\n.dsp-pair-wide{\n  grid-column:1 / -1;flex-direction:row;align-items:baseline;gap:8px;\n  border-top:1px dashed color-mix(in srgb,currentColor 12%,transparent);padding-top:5px;\n}\n.dsp-pair-wide .dsp-kv{flex:none;font-size:1.02em}\n.dsp-item > .dsp-kv{color:color-mix(in srgb,currentColor 62%,transparent);font-size:1.02em;margin-right:6px}\n/* ── 分节：与 DND 皮肤档案控制台同一套策略（视觉隐藏控件 + label 头 + :has 显隐） ──\n   为什么不用 <details>：原生折叠依赖浏览器默认动作，页面上游一拦就点不开（2026-10-03 实测）；\n   而且 JS 再 toggle open 会与原生行为互相抵消。input:checked 是**幂等状态**，\n   JS 只做 checked = !checked，怎么拦都不会反着来。 */\n.dsp-secs{display:flex;flex-direction:column;gap:0;margin:6px 0 0}\n.dsp-sec{padding:0;border-top:1px solid var(--dsp-line-soft)}\n.dsp-sec:first-child{border-top:0}\n/* 视觉隐藏但保留键盘可达（点 label 即切换；input 直接嵌在 label 里，不需要 id/for） */\n.dsp-ctl{\n  position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;\n  clip:rect(0 0 0 0);clip-path:inset(50%);overflow:hidden;white-space:nowrap;\n}\n.dsp-sec-head{\n  display:flex;align-items:center;gap:6px;\n  padding:7px 9px;cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent;\n  transition:background .18s ease,color .18s ease;\n}\n.dsp-sec-head:hover{background:color-mix(in srgb,var(--dsp-gold) 10%,transparent)}\n.dsp-sec-head:hover .dsp-sec-title{color:color-mix(in srgb,var(--dsp-gold) 65%,currentColor)}\n/* 键盘可达：控件被视觉隐藏，所以焦点环画在节头上 */\n.dsp-sec-head:has(> .dsp-ctl:focus-visible){\n  outline:2px solid color-mix(in srgb,var(--dsp-gold) 60%,transparent);\n  outline-offset:-2px;border-radius:4px;\n}\n.dsp-sec-num{\n  font-family:var(--dnd-mono,Consolas,'JetBrains Mono',monospace);\n  font-size:11.5px;font-style:normal;flex:none;\n  color:color-mix(in srgb,var(--dsp-gold) 75%,transparent);opacity:.9;\n}\n.dsp-sec-icon{font-size:12px;line-height:1;flex:none;color:color-mix(in srgb,var(--dsp-gold) 80%,transparent)}\n.dsp-sec-title{font-size:13.5px;font-weight:600;letter-spacing:.02em;color:color-mix(in srgb,currentColor 70%,transparent)}\n.dsp-sec-caret{\n  margin-left:auto;font-size:.78em;line-height:1;opacity:.5;flex:none;\n  transition:transform .16s ease;\n}\n/* 收起态：三角朝右。规则只看 :checked 与类名 —— 与节名无关，任何自定义节一样可折叠 */\n.dsp-sec:not(:has(> .dsp-sec-head > .dsp-ctl:checked)) > .dsp-sec-head > .dsp-sec-caret{transform:rotate(-90deg)}\n.dsp-sec:has(> .dsp-sec-head > .dsp-ctl:checked) > .dsp-sec-head > .dsp-sec-caret{opacity:.8}\n/* 展开态：金底 + 标题提亮（与皮肤 tab 的选中态同形） */\n.dsp-sec:has(> .dsp-sec-head > .dsp-ctl:checked) > .dsp-sec-head{background:color-mix(in srgb,var(--dsp-gold) 7%,transparent)}\n.dsp-sec:has(> .dsp-sec-head > .dsp-ctl:checked) > .dsp-sec-head > .dsp-sec-title{color:color-mix(in srgb,currentColor 92%,transparent)}\n/* 这一节自己声明了颜色（--dsp-sec-accent 由渲染树写在节点上）：左侧标记线与标题跟着走 */\n.dsp-sec[data-dsp-color] > .dsp-sec-head{box-shadow:inset 2px 0 0 0 color-mix(in srgb,var(--dsp-sec-accent) 80%,transparent)}\n.dsp-sec[data-dsp-color] > .dsp-sec-head > .dsp-sec-title{\n  color:color-mix(in srgb,var(--dsp-sec-accent) 78%,currentColor);\n}\n/* 节体：默认收起，选中才显示（规则与节名无关） */\n.dsp-sec-body{display:none;font-size:1.05em;padding:2px 9px 10px 12px}\n.dsp-sec:has(> .dsp-sec-head > .dsp-ctl:checked) > .dsp-sec-body{display:block}\n.dsp-sec-body > .dsp-fields,.dsp-sec-body > .dsp-items{margin:0}\n/* 无标题的节：没有节头就无处可点 → 永远摊开，绝不藏起来出不去 */\n.dsp-sec-plain{padding:6px 0;border-top:0}\n.dsp-sec-plain > .dsp-sec-body{display:block;padding:0}\n.dsp-sec .dsp-sec{border-top:1px solid var(--dsp-line-soft)}\n/* ── 顶层选项卡模式：节名做页签（二级标题风），点哪个显示哪个，块不再又长又叠 ── */\n.dsp-secs-top{display:flex;flex-direction:row;flex-wrap:wrap;overflow-x:hidden;gap:2px 2px;margin:10px 0 0;border-bottom:1px solid var(--dsp-line-soft)}\n.dsp-secs-top > .dsp-sec{display:contents}\n.dsp-secs-top > .dsp-sec > .dsp-sec-head{\n  order:1;flex:0 0 auto;border-top:0;padding:8px 11px;margin-bottom:-1px;\n  border-bottom:2px solid transparent;border-radius:6px 6px 0 0;white-space:nowrap;\n}\n.dsp-secs-top > .dsp-sec > .dsp-sec-head:hover{background:color-mix(in srgb,var(--dsp-gold) 8%,transparent)}\n.dsp-secs-top > .dsp-sec > .dsp-sec-head > .dsp-sec-title{font-size:14.5px;font-weight:700;letter-spacing:.04em}\n.dsp-secs-top > .dsp-sec > .dsp-sec-head > .dsp-sec-caret{display:none}\n.dsp-secs-top > .dsp-sec > .dsp-sec-body{\n  order:2;flex:1 0 100%;display:none;padding:12px 4px 14px;border-top:0;\n}\n.dsp-secs-top > .dsp-sec:has(> .dsp-sec-head > .dsp-ctl:checked) > .dsp-sec-head{\n  background:color-mix(in srgb,var(--dsp-gold) 12%,transparent);\n  border-bottom-color:var(--dsp-gold);\n}\n.dsp-secs-top > .dsp-sec:has(> .dsp-sec-head > .dsp-ctl:checked) > .dsp-sec-head > .dsp-sec-title{\n  color:color-mix(in srgb,var(--dsp-gold) 70%,currentColor);\n}\n.dsp-secs-top > .dsp-sec[data-dsp-color] > .dsp-sec-head{box-shadow:none}\n.dsp-secs-top > .dsp-sec[data-dsp-color]:has(> .dsp-sec-head > .dsp-ctl:checked) > .dsp-sec-head{\n  border-bottom-color:var(--dsp-sec-accent);\n}\n/* 全部展开 / 全部收起 */\n.dsp-tools{display:flex;gap:6px;justify-content:flex-end;margin:2px 0 0}\n.dsp-tool{\n  font:inherit;font-size:11px;line-height:1.5;padding:1px 9px;border-radius:999px;\n  cursor:pointer;color:color-mix(in srgb,currentColor 65%,transparent);\n  background:color-mix(in srgb,currentColor 6%,transparent);\n  border:1px solid var(--dsp-line-soft);\n  transition:background .15s ease,color .15s ease;\n}\n.dsp-tool:hover{\n  background:color-mix(in srgb,var(--dsp-gold) 14%,transparent);\n  color:color-mix(in srgb,currentColor 92%,transparent);\n}\n/* 标签版式（适合服装 / 身材 / 技能名这类短值） */\n.dsp-chips{display:flex;flex-wrap:wrap;gap:4px}\n.dsp-chip{\n  font-size:.85em;line-height:1.6;padding:0 8px;border-radius:999px;\n  background:color-mix(in srgb,currentColor 8%,transparent);\n  box-shadow:inset 0 0 0 1px color-mix(in srgb,currentColor 22%,transparent);\n}\n/* 节里的条目小卡：底色压淡，免得和节底色叠成一片 */\n/* 节内条目不再套底色盒子（名册式：靠细线分隔） */\n/* ── 脚注 ── */\n.dsp-note{\n  display:block;margin-top:8px;padding-top:6px;\n  border-top:1px dashed color-mix(in srgb,currentColor 15%,transparent);\n  color:color-mix(in srgb,currentColor 62%,transparent);\n  font-size:.85em;\n}\n/* 不归本插件的块（皮肤负责） */\n.dsp-pass{display:none}\n@media (prefers-reduced-motion:reduce){.dsp-card{transition:none}}\n\n/* ── 手机端（remote-web-ui 远程访问）：窄屏不横滚、点得着、长串不撑破 ── */\n.dsp-card,.dsp-sec-body,.dsp-item,.dsp-chip,.dsp-pair{box-sizing:border-box;max-width:100%}\n@media (max-width:520px){\n  .dsp-card{margin:8px 0;padding:9px 10px;border-radius:10px}\n  .dsp-card-head{gap:6px;padding-bottom:6px;margin-bottom:6px}\n  .dsp-card-head .dsp-icon{width:1.6em;height:1.6em}\n  .dsp-tools{flex-wrap:wrap;gap:4px}\n  /* 键值表在窄屏竖排：两列会被长值挤成横滚 */\n  .dsp-fields{grid-template-columns:repeat(auto-fill,minmax(132px,1fr))}\n  .dsp-fields dt{white-space:normal}\n  .dsp-sec-head{padding:9px 8px}\n  .dsp-sec-body{padding:2px 8px 10px 10px}\n  .dsp-sec-title{font-size:12.5px}\n}\n/* 手指：触摸目标给够高（≥40px 是通用经验值） */\n@media (pointer:coarse){\n  .dsp-sec-head{padding:10px 9px;min-height:40px}\n  .dsp-tool{padding:3px 10px}\n}\n/* 长串（ID / 连续数字 / 无空格中文长句）不撑破容器 */\n.dsp-card,.dsp-sec-body,.dsp-item,.dsp-chip,.dsp-fields dd,.dsp-pair-v{overflow-wrap:anywhere;word-break:break-word}\n\n.mb-dsp .dsp-card{--dsp-bg:var(--dsr-panel-2,#1c1c1c);--dsp-fg:var(--dsr-text,#e6e8ec);--dsp-muted:var(--dsr-muted,#9aa4b2);--dsp-line:var(--dsr-line,#3a3a3a);margin:8px 0;max-width:100%}\n.mb-dsp .dsp-card-head h4{font-size:14px}\n.mb-dsp .dsp-section-body{font-size:13.5px;line-height:1.6}\n.mb-dsp .dsp-tools{display:none}\n.mb-dsp *{max-width:100%;overflow-wrap:anywhere}\n"

  return {
    renderBlock: DSP.renderBlock,
    renderMessage: DSP.renderMessage,
    extractBlocks: DSP.extractBlocks,
    defaultSpec: DSP.defaultSpec,
    mergeSpec: DSP.mergeSpec,
    rarityColor: DSP.rarityColor,
    DEFAULT_SKIP_MARKERS: DSP.DEFAULT_SKIP_MARKERS,
    spec: DSP.defaultSpec(),
    toHtml: toHtml,
    esc: esc,
    CSS: CSS
  }
})
