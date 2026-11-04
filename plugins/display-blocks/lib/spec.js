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
export const DEFAULT_RARITIES = [
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
export const DEFAULT_COLORS = {
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
export const DEFAULT_BLOCKS = {
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
export const FALLBACK_BLOCK = { icon: '📋', title: '', color: '' }

/**
 * 节（section）的可用版式。**渲染器只提供这几种骨架**，用哪种由内容自己决定：
 *   · 自动（默认）—— 按值的 JSON 形状挑：字符串→文本、数组→列表、对象→键值
 *   · 文本 —— 一整段（仍走行内标注）
 *   · 键值 —— 两列键值表
 *   · 列表 —— 逐行（元素是对象就渲染成条目小卡）
 *   · 标签 —— 一行胶囊（适合「服装 / 身材 / 技能名」这类短值）
 */
export const LAYOUTS = ['自动', '文本', '键值', '列表', '标签']

/**
 * 默认节样式（节名 → 图标 / 默认版式 / 默认颜色）。
 * 只是**默认值**：节名由内容自己起，词表里没有的节名照样渲染（无图标、自动版式、
 * 颜色继承卡片的强调色）。卡可以在【展示规范】里用 `节: 外貌=👁|文本|天蓝` 覆盖或新增。
 */
export const DEFAULT_SECTIONS = {
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
export const FALLBACK_SECTION = { icon: '', layout: '', color: '' }

/**
 * 内置默认规范。任何一层（卡 / 用户设置）都在这个基础上做**增量覆盖**，
 * 不做整体替换 —— 否则卡只写了三条颜色就会把二十条默认全丢掉。
 */
export function defaultSpec() {
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
export function rarityColor(spec, word) {
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
export function safeColorValue(v) {
  const s = String(v == null ? '' : v).trim()
  if (!s) return null
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return s
  const k = s.toLowerCase()
  if (CSS_COLOR_KEYWORDS.has(k)) return k
  return null
}

/** 短码 → 颜色；也接受 `#rrggbb` 直写。出口经 safeColorValue 净化。 */
export function colorOf(spec, code) {
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
export function resolveColor(spec, value) {
  const v = String(value == null ? '' : value).trim()
  if (!v) return null
  return colorOf(spec, v) || rarityColor(spec, v) || null
}

/** 块类型 → { icon, title, color }。未声明的类型给兜底。 */
export function blockStyle(spec, type) {
  const key = String(type == null ? '' : type).trim()
  const hit = key && spec.blocks[key]
  if (hit) return { icon: hit.icon || FALLBACK_BLOCK.icon, title: hit.title || key, color: hit.color || '' }
  return { icon: FALLBACK_BLOCK.icon, title: key || FALLBACK_BLOCK.title, color: '' }
}

/** 节名 → { icon, layout, color }。未声明的节名给兜底（无图标、自动版式、继承卡片色）。 */
export function sectionStyle(spec, name) {
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
export function extractSpecDeclaration(text) {
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
export function mergeSpec(...layers) {
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
export function specFromCardText(text, userLayer) {
  return mergeSpec(extractSpecDeclaration(text), userLayer)
}
