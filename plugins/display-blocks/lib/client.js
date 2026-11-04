// dsh-display-blocks —— 浏览器半边
//
// 职责：把 render.js 产出的**抽象渲染树**挂到 DOM 上，并提供一个设置面板
// 让用户开关与覆盖词表。
//
// 铁律（这个 profile 的教训）：
//   · **客户端 bundle 抛异常会带崩整个 GUI**。所以这里每一处外部接触
//     （DOM 遍历、树转 DOM、观察器回调、设置面板）都单独 try/catch，
//     任何一处失败只关掉它自己，绝不向上冒泡。
//   · **只改文本节点**，不重建 React 容器。已经处理过的节点打
//     `data-dsp-done="1"`，避免重复渲染成套娃。
//   · 渲染树一律走 textContent（createTextNode），**绝不拼 innerHTML** ——
//     模型输出不可信。
//
// 加载契约：客户端入口必须自注册，且 id **等于包名**，否则加载器会报
// `loaded without registering`，或重复执行同一 bundle 触发
// `duplicate factory registration`（两者都会让 Web boot 失败）。
// 注册 id 与生成 loader 的方式见 package.json 的 dsh.client 与 README。

import { defaultSpec, mergeSpec, blockStyle } from './spec.js'
import { extractBlocks, parseInline } from './parse.js'
import { renderMessage, renderBlock } from './render.js'

const PLUGIN_ID = 'dsh-display-blocks'
const STYLE_ID = 'dsh-display-blocks-style'
const DONE_ATTR = 'data-dsp-done'
const STORE_KEY = 'dsh.displayBlocks.settings'

/** 不该被改写的容器：代码块、输入框、脚本、我们自己的输出。 */
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE', 'KBD', 'SAMP'])

// ── 设置（localStorage；失败一律回落默认）──────────────────

function loadSettings() {
  try {
    const raw = window.localStorage.getItem(STORE_KEY)
    if (!raw) return { enabled: true, spec: null, ownMarkers: '', passAll: '' }
    const parsed = JSON.parse(raw)
    return {
      enabled: parsed.enabled !== false,
      spec: parsed.spec && typeof parsed.spec === 'object' ? parsed.spec : null,
      ownMarkers: typeof parsed.ownMarkers === 'string' ? parsed.ownMarkers : '',
      // 机器块归谁渲染：'' = 自动（DND 皮肤在场就交给它）/ '1' = 强制交给皮肤 / '0' = 强制自己内联渲染
      passAll: typeof parsed.passAll === 'string' ? parsed.passAll : '',
    }
  } catch {
    return { enabled: true, spec: null, ownMarkers: '', passAll: '' }
  }
}

/**
 * 机器块是否统一交给 DND 皮肤渲染（底部控制台）。
 *
 * 为什么要有它：以前是「皮肤画一套面板 + 插件在正文再画一套卡片」——两块内容、两套样式、
 * 两条代码路径。统一之后皮肤的控制台是**唯一的渲染出口**，插件只负责解析与渲染树。
 * 判据用 `<html data-dsh-skin="dnd-tavern">`（skin-center 设置的激活皮肤，跨版本稳定），
 * 且**只在 DND 皮肤在场时**才让位 —— 换皮肤/没皮肤时退回内联卡片，功能不丢。
 */
function skinOwnsBlocks(settings) {
  const mode = settings && settings.passAll
  if (mode === '1') return true
  if (mode === '0') return false
  try { return document.documentElement.getAttribute('data-dsh-skin') === 'dnd-tavern' } catch { return false }
}

/** 宽松取 JSON：允许传整段 `[[标记]]{…}`，也容忍被截断的 JSON（取到最后一个 }）。 */
function looseJson(text) {
  let s = String(text || '').trim()
  const at = s.indexOf('{')
  if (at > 0) s = s.slice(at)
  if (!s.startsWith('{')) return null
  try {
    const o = JSON.parse(s)
    return o && typeof o === 'object' ? o : null
  } catch { /* 接着试截断 */ }
  const cut = s.lastIndexOf('}')
  if (cut > 0) {
    try {
      const o = JSON.parse(s.slice(0, cut + 1))
      return o && typeof o === 'object' ? o : null
    } catch { return null }
  }
  return null
}

function saveSettings(settings) {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(settings))
  } catch {
    // 隐私模式/配额满：设置不持久化，但本次会话仍然生效。
  }
}

function currentSpec(settings) {
  try {
    return mergeSpec(settings.spec)
  } catch {
    return defaultSpec()
  }
}

// ── 样式（一次性注入）──────────────────────────────────────
//
// 设计目标：**块状、工整** —— 机器块渲染成一块自成体系的面板，而不是「文字加了条边」。
//   · 主题策略：不预设宿主是亮是暗。所有灰阶都从 currentColor / 半透明混合派生，
//     亮暗主题自动成立；accent 色由渲染树按稀有度写在 --dsp-accent 上。
//   · 徽章底色用 color-mix(in srgb, currentColor N%, transparent) 从**元素自身的
//     inline color** 派生 —— 渲染树只带 color，CSS 自己调出同色系淡底。
//   · color-mix 需要 Chromium 111+（DSH 桌面端 / 现代 Chromium 均满足；
//     不支持时徽章只是没有底色，文字色不受影响）。

const CSS = `
/* ── 卡片：块状面板（视觉 token 走 DND 皮肤：皮肤激活时自动同色，否则用兜底） ── */
.dsp-card{
  --dsp-accent:#8d6e63;
  --dsp-gold:var(--dnd-gold,#b08d3f);
  --dsp-line:var(--dnd-card-border,color-mix(in srgb,currentColor 20%,transparent));
  --dsp-line-soft:var(--dnd-panel-line,color-mix(in srgb,currentColor 12%,transparent));
  position:relative;overflow:hidden;
  border:1px solid var(--dsp-line);
  border-radius:12px;
  padding:10px 14px 10px 14px;
  margin:10px 0;
  background:var(--dnd-panel-bg,
    linear-gradient(135deg,color-mix(in srgb,var(--dsp-accent) 8%,transparent),transparent 60%),
    color-mix(in srgb,currentColor 4%,transparent));
  font-size:.95em;
  box-shadow:var(--dnd-card-shadow,0 1px 3px rgba(0,0,0,.14));
  transition:border-color .15s ease,box-shadow .15s ease;
}
.dsp-card:hover{
  border-color:color-mix(in srgb,var(--dsp-gold) 55%,transparent);
  box-shadow:0 3px 10px rgba(0,0,0,.18);
}
/* 顶部金线：与皮肤状态卡 / 档案控制台的 2px 金顶栏呼应 */
.dsp-card::before{
  content:'';position:absolute;left:0;right:0;top:0;height:2px;
  background:linear-gradient(90deg,
    color-mix(in srgb,var(--dsp-gold) 85%,transparent),
    color-mix(in srgb,var(--dsp-accent) 55%,transparent) 55%,
    transparent);
}
/* ── 卡片头 ── */
.dsp-card-head{
  display:flex;align-items:center;gap:8px;flex-wrap:wrap;
  padding-bottom:8px;margin-bottom:8px;
  border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent);
}
.dsp-card-head .dsp-icon{
  display:inline-flex;align-items:center;justify-content:center;
  width:2em;height:2em;font-size:1.12em;line-height:1;border-radius:8px;
  background:color-mix(in srgb,var(--dsp-accent) 16%,transparent);
  box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--dsp-accent) 32%,transparent);
}
.dsp-card-head .dsp-title{margin:0;font-size:1.22em;font-weight:700;letter-spacing:.02em}
.dsp-card-head .dsp-rarity{margin-left:auto}
/* ── 徽章 ── */
/* 类型徽章做成皮肤那种「眉标」：小号等宽 + 字距 + 金色描边（拉丁字母自动大写） */
.dsp-type{
  font-family:var(--dnd-mono,Consolas,'JetBrains Mono',monospace);
  font-size:.78em;font-weight:600;text-transform:uppercase;letter-spacing:.09em;
  color:color-mix(in srgb,var(--dsp-gold) 78%,currentColor);
  border:1px solid color-mix(in srgb,var(--dsp-gold) 38%,transparent);
  border-radius:999px;padding:1px 8px;
}
.dsp-rarity{
  display:inline-block;font-weight:700;font-size:.95em;line-height:1.5;
  padding:0 8px;border-radius:999px;
  background:color-mix(in srgb,currentColor 14%,transparent);
  box-shadow:inset 0 0 0 1px color-mix(in srgb,currentColor 32%,transparent);
}
/* ── 字段表：横排属性格子（与条目同款网格） ── */
.dsp-fields{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px 16px;margin:6px 0 0;font-size:1.05em}
.dsp-fields dt{
  color:color-mix(in srgb,currentColor 62%,transparent);
  font-size:1.05em;white-space:nowrap;justify-self:start;
  background:color-mix(in srgb,currentColor 7%,transparent);
  border-radius:4px;padding:1px 7px;
}
.dsp-fields dd{margin:0}
/* ── 条目（名册式）：融入面板的清单——细线分隔、无底色盒子，靠留白和字重分层 ── */
.dsp-items{margin:6px 0 0;padding:0;list-style:none;display:flex;flex-direction:column}
.dsp-items .dsp-item{
  position:relative;padding:8px 2px 9px;
}
.dsp-items .dsp-item + .dsp-item{border-top:1px solid var(--dsp-line-soft)}
.dsp-items .dsp-item::before{content:none}
.dsp-item-name{
  display:inline-block;font-weight:700;font-size:1.08em;letter-spacing:.03em;
  color:color-mix(in srgb,currentColor 92%,transparent);
}
.dsp-item-name::before{
  content:'';display:inline-block;width:4px;height:4px;border-radius:50%;
  background:var(--dsp-accent);opacity:.6;margin-right:7px;vertical-align:middle;
}
.dsp-item-fields{
  display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));
  gap:8px 16px;margin-top:6px;
}
.dsp-pair{display:flex;flex-direction:column;gap:2px;min-width:0}
.dsp-pair .dsp-kv{
  color:color-mix(in srgb,currentColor 62%,transparent);
  font-size:1.02em;letter-spacing:.05em;margin:0;
}
.dsp-pair .dsp-pair-v{
  color:color-mix(in srgb,currentColor 94%,transparent);
  font-size:1.05em;line-height:1.45;
}
/* 长文（态/天赋/粗 这类整句）：横排一行，标签在前 */
.dsp-pair-wide{
  grid-column:1 / -1;flex-direction:row;align-items:baseline;gap:8px;
  border-top:1px dashed color-mix(in srgb,currentColor 12%,transparent);padding-top:5px;
}
.dsp-pair-wide .dsp-kv{flex:none;font-size:1.02em}
.dsp-item > .dsp-kv{color:color-mix(in srgb,currentColor 62%,transparent);font-size:1.02em;margin-right:6px}
/* ── 分节：与 DND 皮肤档案控制台同一套策略（视觉隐藏控件 + label 头 + :has 显隐） ──
   为什么不用 <details>：原生折叠依赖浏览器默认动作，页面上游一拦就点不开（2026-10-03 实测）；
   而且 JS 再 toggle open 会与原生行为互相抵消。input:checked 是**幂等状态**，
   JS 只做 checked = !checked，怎么拦都不会反着来。 */
.dsp-secs{display:flex;flex-direction:column;gap:0;margin:6px 0 0}
.dsp-sec{padding:0;border-top:1px solid var(--dsp-line-soft)}
.dsp-sec:first-child{border-top:0}
/* 视觉隐藏但保留键盘可达（点 label 即切换；input 直接嵌在 label 里，不需要 id/for） */
.dsp-ctl{
  position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;
  clip:rect(0 0 0 0);clip-path:inset(50%);overflow:hidden;white-space:nowrap;
}
.dsp-sec-head{
  display:flex;align-items:center;gap:6px;
  padding:7px 9px;cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent;
  transition:background .18s ease,color .18s ease;
}
.dsp-sec-head:hover{background:color-mix(in srgb,var(--dsp-gold) 10%,transparent)}
.dsp-sec-head:hover .dsp-sec-title{color:color-mix(in srgb,var(--dsp-gold) 65%,currentColor)}
/* 键盘可达：控件被视觉隐藏，所以焦点环画在节头上 */
.dsp-sec-head:has(> .dsp-ctl:focus-visible){
  outline:2px solid color-mix(in srgb,var(--dsp-gold) 60%,transparent);
  outline-offset:-2px;border-radius:4px;
}
.dsp-sec-num{
  font-family:var(--dnd-mono,Consolas,'JetBrains Mono',monospace);
  font-size:11.5px;font-style:normal;flex:none;
  color:color-mix(in srgb,var(--dsp-gold) 75%,transparent);opacity:.9;
}
.dsp-sec-icon{font-size:12px;line-height:1;flex:none;color:color-mix(in srgb,var(--dsp-gold) 80%,transparent)}
.dsp-sec-title{font-size:13.5px;font-weight:600;letter-spacing:.02em;color:color-mix(in srgb,currentColor 70%,transparent)}
.dsp-sec-caret{
  margin-left:auto;font-size:.78em;line-height:1;opacity:.5;flex:none;
  transition:transform .16s ease;
}
/* 收起态：三角朝右。规则只看 :checked 与类名 —— 与节名无关，任何自定义节一样可折叠 */
.dsp-sec:not(:has(> .dsp-sec-head > .dsp-ctl:checked)) > .dsp-sec-head > .dsp-sec-caret{transform:rotate(-90deg)}
.dsp-sec:has(> .dsp-sec-head > .dsp-ctl:checked) > .dsp-sec-head > .dsp-sec-caret{opacity:.8}
/* 展开态：金底 + 标题提亮（与皮肤 tab 的选中态同形） */
.dsp-sec:has(> .dsp-sec-head > .dsp-ctl:checked) > .dsp-sec-head{background:color-mix(in srgb,var(--dsp-gold) 7%,transparent)}
.dsp-sec:has(> .dsp-sec-head > .dsp-ctl:checked) > .dsp-sec-head > .dsp-sec-title{color:color-mix(in srgb,currentColor 92%,transparent)}
/* 这一节自己声明了颜色（--dsp-sec-accent 由渲染树写在节点上）：左侧标记线与标题跟着走 */
.dsp-sec[data-dsp-color] > .dsp-sec-head{box-shadow:inset 2px 0 0 0 color-mix(in srgb,var(--dsp-sec-accent) 80%,transparent)}
.dsp-sec[data-dsp-color] > .dsp-sec-head > .dsp-sec-title{
  color:color-mix(in srgb,var(--dsp-sec-accent) 78%,currentColor);
}
/* 节体：默认收起，选中才显示（规则与节名无关） */
.dsp-sec-body{display:none;font-size:1.05em;padding:2px 9px 10px 12px}
.dsp-sec:has(> .dsp-sec-head > .dsp-ctl:checked) > .dsp-sec-body{display:block}
.dsp-sec-body > .dsp-fields,.dsp-sec-body > .dsp-items{margin:0}
/* 无标题的节：没有节头就无处可点 → 永远摊开，绝不藏起来出不去 */
.dsp-sec-plain{padding:6px 0;border-top:0}
.dsp-sec-plain > .dsp-sec-body{display:block;padding:0}
.dsp-sec .dsp-sec{border-top:1px solid var(--dsp-line-soft)}
/* ── 顶层选项卡模式：节名做页签（二级标题风），点哪个显示哪个，块不再又长又叠 ── */
.dsp-secs-top{display:flex;flex-direction:row;flex-wrap:wrap;overflow-x:hidden;gap:2px 2px;margin:10px 0 0;border-bottom:1px solid var(--dsp-line-soft)}
.dsp-secs-top > .dsp-sec{display:contents}
.dsp-secs-top > .dsp-sec > .dsp-sec-head{
  order:1;flex:0 0 auto;border-top:0;padding:8px 11px;margin-bottom:-1px;
  border-bottom:2px solid transparent;border-radius:6px 6px 0 0;white-space:nowrap;
}
.dsp-secs-top > .dsp-sec > .dsp-sec-head:hover{background:color-mix(in srgb,var(--dsp-gold) 8%,transparent)}
.dsp-secs-top > .dsp-sec > .dsp-sec-head > .dsp-sec-title{font-size:14.5px;font-weight:700;letter-spacing:.04em}
.dsp-secs-top > .dsp-sec > .dsp-sec-head > .dsp-sec-caret{display:none}
.dsp-secs-top > .dsp-sec > .dsp-sec-body{
  order:2;flex:1 0 100%;display:none;padding:12px 4px 14px;border-top:0;
}
.dsp-secs-top > .dsp-sec:has(> .dsp-sec-head > .dsp-ctl:checked) > .dsp-sec-head{
  background:color-mix(in srgb,var(--dsp-gold) 12%,transparent);
  border-bottom-color:var(--dsp-gold);
}
.dsp-secs-top > .dsp-sec:has(> .dsp-sec-head > .dsp-ctl:checked) > .dsp-sec-head > .dsp-sec-title{
  color:color-mix(in srgb,var(--dsp-gold) 70%,currentColor);
}
.dsp-secs-top > .dsp-sec[data-dsp-color] > .dsp-sec-head{box-shadow:none}
.dsp-secs-top > .dsp-sec[data-dsp-color]:has(> .dsp-sec-head > .dsp-ctl:checked) > .dsp-sec-head{
  border-bottom-color:var(--dsp-sec-accent);
}
/* 全部展开 / 全部收起 */
.dsp-tools{display:flex;gap:6px;justify-content:flex-end;margin:2px 0 0}
.dsp-tool{
  font:inherit;font-size:11px;line-height:1.5;padding:1px 9px;border-radius:999px;
  cursor:pointer;color:color-mix(in srgb,currentColor 65%,transparent);
  background:color-mix(in srgb,currentColor 6%,transparent);
  border:1px solid var(--dsp-line-soft);
  transition:background .15s ease,color .15s ease;
}
.dsp-tool:hover{
  background:color-mix(in srgb,var(--dsp-gold) 14%,transparent);
  color:color-mix(in srgb,currentColor 92%,transparent);
}
/* 标签版式（适合服装 / 身材 / 技能名这类短值） */
.dsp-chips{display:flex;flex-wrap:wrap;gap:4px}
.dsp-chip{
  font-size:.85em;line-height:1.6;padding:0 8px;border-radius:999px;
  background:color-mix(in srgb,currentColor 8%,transparent);
  box-shadow:inset 0 0 0 1px color-mix(in srgb,currentColor 22%,transparent);
}
/* 节里的条目小卡：底色压淡，免得和节底色叠成一片 */
/* 节内条目不再套底色盒子（名册式：靠细线分隔） */
/* ── 脚注 ── */
.dsp-note{
  display:block;margin-top:8px;padding-top:6px;
  border-top:1px dashed color-mix(in srgb,currentColor 15%,transparent);
  color:color-mix(in srgb,currentColor 62%,transparent);
  font-size:.85em;
}
/* 不归本插件的块（皮肤负责） */
.dsp-pass{display:none}
@media (prefers-reduced-motion:reduce){.dsp-card{transition:none}}

/* ── 手机端（remote-web-ui 远程访问）：窄屏不横滚、点得着、长串不撑破 ── */
.dsp-card,.dsp-sec-body,.dsp-item,.dsp-chip,.dsp-pair{box-sizing:border-box;max-width:100%}
@media (max-width:520px){
  .dsp-card{margin:8px 0;padding:9px 10px;border-radius:10px}
  .dsp-card-head{gap:6px;padding-bottom:6px;margin-bottom:6px}
  .dsp-card-head .dsp-icon{width:1.6em;height:1.6em}
  .dsp-tools{flex-wrap:wrap;gap:4px}
  /* 键值表在窄屏竖排：两列会被长值挤成横滚 */
  .dsp-fields{grid-template-columns:repeat(auto-fill,minmax(132px,1fr))}
  .dsp-fields dt{white-space:normal}
  .dsp-sec-head{padding:9px 8px}
  .dsp-sec-body{padding:2px 8px 10px 10px}
  .dsp-sec-title{font-size:12.5px}
}
/* 手指：触摸目标给够高（≥40px 是通用经验值） */
@media (pointer:coarse){
  .dsp-sec-head{padding:10px 9px;min-height:40px}
  .dsp-tool{padding:3px 10px}
}
/* 长串（ID / 连续数字 / 无空格中文长句）不撑破容器 */
.dsp-card,.dsp-sec-body,.dsp-item,.dsp-chip,.dsp-fields dd,.dsp-pair-v{overflow-wrap:anywhere;word-break:break-word}
`

function injectStyle() {
  try {
    if (document.getElementById(STYLE_ID)) return
    const el = document.createElement('style')
    el.id = STYLE_ID
    el.textContent = CSS
    document.head.appendChild(el)
  } catch {
    // 样式注入失败只是不好看，不影响渲染正确性。
  }
}

// ── 抽象树 → DOM（机械转换，唯一接触 DOM 的地方）───────────

function toDom(node) {
  if (!node) return null
  if (!node.tag) return document.createTextNode(node.text || '')
  const el = document.createElement(node.tag)
  if (node.cls) el.className = node.cls
  if (node.style) el.setAttribute('style', node.style)
  if (node.attrs) for (const [k, v] of Object.entries(node.attrs)) {
    el.setAttribute(k, String(v))
    // 复选框的选中态：属性只设「默认值」，这里再同步一次真实状态，避免首屏不选中
    if (k === 'checked' && 'checked' in el) el.checked = true
  }
  if (node.text) el.appendChild(document.createTextNode(node.text))
  for (const child of node.children || []) {
    const sub = toDom(child)
    if (sub) el.appendChild(sub)
  }
  return el
}

// ── 扫描与替换 ─────────────────────────────────────────────

/** 快筛：文本里出现任一特征才值得走完整解析。 */
function mightMatch(text, spec) {
  if (!text || text.length < 3) return false
  if (text.indexOf('[[') >= 0 && text.indexOf(']{') >= 0) return true
  if (text.indexOf('[g]') >= 0) return true
  for (const open of ['（', '【', '[']) {
    const at = text.indexOf(open)
    if (at >= 0 && at < text.length - 2) return true
  }
  return false
}

function shouldSkipNode(node) {
  let el = node.parentElement
  let depth = 0
  // 24 层：够覆盖「嵌套节 4 层 × 卡片结构」——原来只查 6 层，深嵌套里会重复处理自己的产出
  while (el && depth++ < 24) {
    if (SKIP_TAGS.has(el.tagName)) return true
    if (el.hasAttribute && (el.hasAttribute(DONE_ATTR) || el.id === STYLE_ID)) return true
    el = el.parentElement
  }
  return false
}

/**
 * 跑一遍扫描。返回处理过的节点数。
 * 任何单点失败都只跳过那个节点。
 *
 * 性能（2026-10-03，为手机端远程访问）：**默认只扫变更子树**。
 * 手机跑的是同一套网页应用，页面里光客户端插件就有 40+ 个 MutationObserver，
 * 流式输出时每个 token 批次都会让它们各扫一遍 DOM。全文档 TreeWalker 在这时候是主要开销，
 * 所以观察器回调改成「只扫新增/改动的那几棵子树」，间隔定时器才做全文档兜底。
 *
 * @param {object} spec 生效规范
 * @param {{skipMarkers?:string[], ownMarkers?:string[], foldState?:Map<string,boolean>, scope?:Element[]}} [opts]
 */
function sweep(spec, opts) {
  const o = opts || {}
  const roots = (Array.isArray(o.scope) && o.scope.length) ? o.scope : [document.body]
  let handled = 0
  for (const root of roots) {
    if (!root || !root.nodeType) continue
    try { handled += sweepRoot(root, spec, o) } catch { /* 单棵子树失败不影响其它 */ }
  }
  return handled
}

/** 扫一棵子树。 */
function sweepRoot(root, spec, opts) {
  let handled = 0
  let walker
  try {
    walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        try {
          const text = node.nodeValue || ''
          if (!mightMatch(text, spec)) return NodeFilter.FILTER_REJECT
          if (shouldSkipNode(node)) return NodeFilter.FILTER_REJECT
          return NodeFilter.FILTER_ACCEPT
        } catch {
          return NodeFilter.FILTER_REJECT
        }
      },
    })
  } catch {
    return 0
  }

  const targets = []
  try {
    let n
    while ((n = walker.nextNode())) targets.push(n)
  } catch {
    return 0
  }

  for (const node of targets) {
    try {
      const text = node.nodeValue || ''
      const tree = renderMessage(text, spec, opts)
      // 树是「一个纯文本节点」时说明什么都没变，别动 DOM。
      if (tree.length === 1 && tree[0].tag === 'span' && !tree[0].cls && !tree[0].children.length) continue
      const frag = document.createDocumentFragment()
      let produced = 0
      for (const part of tree) {
        if (part.cls === 'dsp-pass') {
          // 不归我管的块（例如皮肤负责的 [[商店]]）：原样放回文本。
          frag.appendChild(document.createTextNode(part.text || ''))
          continue
        }
        const dom = toDom(part)
        if (dom) { frag.appendChild(dom); produced++ }
      }
      if (!produced) continue
      const holder = document.createElement('span')
      holder.setAttribute(DONE_ATTR, '1')
      holder.appendChild(frag)
      node.parentNode.replaceChild(holder, node)
      handled++
    } catch {
      // 单个节点渲染失败：留着原文，继续下一个。
    }
  }
  return handled
}

/**
 * 插件本体（供 tools/build-client.mjs 打包进 lib/client.bundle.js）。
 * 这个文件**不能**直接当客户端入口用 —— 浏览器侧必须是一个自注册的
 * 单文件 bundle（见 README「为什么有构建步骤」）。
 */
export const plugin = {
  name: PLUGIN_ID,
  inject: ['slots'],
  apply(ctx) {
    let settings = loadSettings()
    let spec = currentSpec(settings)
    let timer = null
    // 开合状态记忆：宿主/皮肤重渲染会把卡片整块换掉，不记住用户的开合就等于「点了没反应」
    const foldState = new Map()

    const refreshSpec = () => { spec = currentSpec(settings) }

    const run = (scope) => {
      if (!settings.enabled) return
      try {
        // ★ 皮肤在场：机器块与行内装饰**全部归皮肤**（它自己有一整套），插件只提供 API，**完全不碰 DOM**。
        //
        // 为什么必须这样（2026-10-03 真机定位）：皮肤的 enhanceTextNode 用
        //   `seenText = new WeakMap()` **按文本节点身份**判「内容已稳定」（连续两次相同且 ≥900ms）
        // 才允许 replaceChild（那是 WB-080 防「流式冻结」的机制）。
        // 而插件哪怕只是「把块原文复制进 dsp-pass 的 holder 再替换原节点」，也会**换掉节点身份**
        // → 皮肤的 WeakMap 永远没见过这个新节点 → **永远不 settled → 永远不包装机器块**
        // → 表现为 `.dnd-machine` 恒为 0、正文里裸着 JSON、展示块页签不出现（machines=0 / u16）。
        // ⇒ 让位要彻底：皮肤在，插件就一根手指都别碰。
        if (skinOwnsBlocks(settings)) {
          publishApi()
          return
        }
        const markers = settings.ownMarkers
          .split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean)
        const opts = { foldState }
        if (markers.length) opts.ownMarkers = markers
        // scope = 本次只扫这几棵子树（观察器回调给）；不给就是全文档兜底
        if (Array.isArray(scope) && scope.length) opts.scope = scope
        sweep(spec, opts)
      } catch {
        // 整轮失败也不能影响页面。
      }
    }

    /**
     * 把渲染能力挂成全局，供 DND 皮肤的控制台调用 —— **渲染只有一份实现**。
     * 皮肤那边只管控制台骨架（tab/累积/选中），机器块长什么样由这里决定，
     * 所以不会再出现「皮肤画一套、插件画一套」的两套逻辑。
     * 任何一步失败都只是不暴露 API（皮肤会显示"渲染器未加载"），不影响插件自身。
     */
    const publishApi = () => {
      try {
        // 让皮肤的诊断徽章能看出"插件在不在、什么模式"（排查时省一轮来回）
        try {
          document.documentElement.setAttribute('data-dsp-plugin', 'v0.6.2')
          document.documentElement.setAttribute('data-dsp-mode', skinOwnsBlocks(settings) ? 'skin(不碰DOM)' : 'inline')
        } catch { /* 忽略 */ }
        window.__DSP__ = {
          version: PLUGIN_ID,
          /** 当前模式：skin = 交给皮肤（插件不碰 DOM）/ inline = 自己内联渲染 */
          mode: () => (skinOwnsBlocks(settings) ? 'skin' : 'inline'),
          spec: () => spec,
          parse: (text) => extractBlocks(String(text || '')),
          iconFor: (marker) => {
            try { return String((blockStyle(spec, String(marker || '')) || {}).icon || '') } catch { return '' }
          },
          /** 一个机器块 → DOM 节点。marker + （JSON 文本或对象）；失败返回 null，绝不抛。 */
          card: (marker, jsonOrText) => {
            try {
              const data = typeof jsonOrText === 'string' ? looseJson(jsonOrText) : jsonOrText
              if (!data || typeof data !== 'object') return null
              return toDom(renderBlock(String(marker || '展示'), data, spec, { foldState }))
            } catch { return null }
          },
        }
      } catch { /* 挂不上就退回内联渲染 */ }
    }

    // 记住用户对某一节的开合（键与渲染端一致：优先读节上的 data-dsp-fold-key，
    // 它含节路径 —— 嵌套同名节不与外层共享记忆；老渲染树回退用 卡片|节名 拼）
    const rememberFold = (cardKey, ctl, on) => {
      try {
        const sec = ctl.closest('.dsp-sec')
        if (!sec) return
        const key = sec.getAttribute('data-dsp-fold-key') ||
          String(cardKey || '') + '|' + (sec.getAttribute('data-dsp-section') || '')
        foldState.set(key, !!on)
        if (foldState.size > 500) foldState.clear()   // 长会话别让它无限长
      } catch { /* 记不住不影响本次切换 */ }
    }

    // 折叠交互 —— **不依赖浏览器默认动作**。
    // 实测：用原生 <details> 时「折叠了但点不开」；原生开合靠默认动作，被页面上游拦掉就失效，
    // 而 JS 再 toggle `open` 又会与原生行为互相抵消。所以这里在 **capture 阶段先手接管**：
    // preventDefault 掉 label 的默认激活，自己幂等切换 checked —— 无论上游怎么拦，都只有一次、方向正确。
    // 键盘路径不经过 click（空格切换 checkbox 是原生行为），保持纯 CSS 可用。
    try {
      const onFoldClick = (e) => {
        try {
          const t = e.target
          if (!t || typeof t.closest !== 'function') return
          const all = t.closest('[data-dsp-all]')
          if (all) {
            const on = all.getAttribute('data-dsp-all') === '1'
            const card = all.closest('.dsp-card')
            if (card) {
              const cardKey = card.getAttribute('data-dsp-card') || ''
              for (const c of card.querySelectorAll('.dsp-sec > .dsp-sec-head > .dsp-ctl')) {
                c.checked = on
                rememberFold(cardKey, c, on)
              }
            }
            e.preventDefault()
            return
          }
          const head = t.closest('.dsp-sec-head')
          if (!head) return
          const ctl = head.querySelector(':scope > .dsp-ctl')
          if (!ctl) return
          e.preventDefault()
          const top = head.closest('.dsp-secs-top')
          const card = head.closest('.dsp-card')
          const cardKey = card ? card.getAttribute('data-dsp-card') || '' : ''
          if (top) {
            // 真·选项卡：点谁显示谁，其余自动关——一次只显示一个节，点忘关也不会变长
            for (const c of top.querySelectorAll('.dsp-sec > .dsp-sec-head > .dsp-ctl')) {
              const on = c === ctl
              if (c.checked !== on) c.checked = on
              rememberFold(cardKey, c, on)
            }
          } else {
            ctl.checked = !ctl.checked
            rememberFold(cardKey, ctl, ctl.checked)
          }
        } catch { /* 单次点击失败不影响页面 */ }
      }
      document.addEventListener('click', onFoldClick, true)
      // 键盘切页签不走 click——change 兜底，保证选项卡任何路径都只开一个
      const onFoldChange = (e) => {
        try {
          const ctl = e.target
          if (!ctl || !ctl.classList || !ctl.classList.contains('dsp-ctl')) return
          const head = ctl.closest('.dsp-sec-head')
          const top = head && head.closest('.dsp-secs-top')
          if (!top || !ctl.checked) return
          const card = head.closest('.dsp-card')
          const cardKey = card ? card.getAttribute('data-dsp-card') || '' : ''
          for (const c of top.querySelectorAll('.dsp-sec > .dsp-sec-head > .dsp-ctl')) {
            if (c !== ctl && c.checked) { c.checked = false; rememberFold(cardKey, c, false) }
          }
        } catch { /* 忽略 */ }
      }
      document.addEventListener('change', onFoldChange, true)
      ctx?.effect?.(() => () => {
        try {
          document.removeEventListener('click', onFoldClick, true)
          document.removeEventListener('change', onFoldChange, true)
        } catch { /* 忽略 */ }
      })
    } catch { /* 装不上就退回纯 CSS（label 默认激活） */ }

    // 首屏 + 变更观察 + 低频兜底。
    // 手机端远程访问时这一页也在手机上跑：页面里客户端插件有 40+ 个 MutationObserver，
    // 流式输出每个 token 批次都会让它们各扫一遍。所以这里做了两件事把开销压下去：
    //   ① 只扫**变更子树**（观察器回调不再全文档 TreeWalker），4s 定时器才做全文档兜底；
    //   ② 连续变更**合并**（150ms 静默 / 600ms 上限），不跟着每个 mutation 跑一遍。
    try {
      injectStyle()
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => run(), { once: true })
      } else {
        run()
      }

      /** 变更点是否落在我自己的产出/样式表里（否则会「自己喂自己」，来回扫）。 */
      const isOwn = (node) => {
        try {
          let el = node && node.nodeType === 1 ? node : (node && node.parentElement)
          for (let d = 0; el && d < 24; d++) {
            if (el.hasAttribute && (el.hasAttribute(DONE_ATTR) || el.id === STYLE_ID)) return true
            el = el.parentElement
          }
        } catch { /* 判不出就当不是 */ }
        return false
      }

      let scope = new Set()      // 本批要扫的子树；空 = 全文档兜底
      let debTimer = null
      let maxTimer = null

      const fire = () => {
        if (debTimer) { window.clearTimeout(debTimer); debTimer = null }
        if (maxTimer) { window.clearTimeout(maxTimer); maxTimer = null }
        const list = scope.size ? [...scope] : null
        scope = new Set()
        try { run(list) } catch { /* 忽略 */ }
      }
      const schedule = () => {
        // 静默 150ms 后跑；但最长只等 600ms —— 流式输出时也能持续跟上
        if (debTimer) window.clearTimeout(debTimer)
        debTimer = window.setTimeout(fire, 150)
        if (!maxTimer) maxTimer = window.setTimeout(fire, 600)
      }

      const observer = new MutationObserver((records) => {
        try {
          for (const r of records) {
            if (isOwn(r.target)) continue
            const added = r.addedNodes
            if (added && added.length) {
              for (const n of added) {
                const el = n && n.nodeType === 1 ? n : (n && n.parentElement)
                if (el && !isOwn(el)) scope.add(el)
              }
            } else if (r.type === 'characterData') {
              const el = r.target && r.target.parentElement
              if (el && !isOwn(el)) scope.add(el)
            }
          }
          // 变更点太多（整表重排）时，直接退化成全文档一次，别攒成几千棵子树
          if (scope.size > 40) scope.clear()
          schedule()
        } catch { /* 观察器回调绝不能让页面出错 */ }
      })
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true })
      // 兜底全文档扫（虚拟滚动回填、异步补内容等观察器可能漏掉的场景）
      timer = window.setInterval(() => { scope.clear(); schedule() }, 4000)
      ctx?.effect?.(() => () => {
        try { observer.disconnect() } catch { /* 忽略 */ }
        if (timer) window.clearInterval(timer)
        if (debTimer) window.clearTimeout(debTimer)
        if (maxTimer) window.clearTimeout(maxTimer)
      })
    } catch {
      // 观察器装不上：至少首屏那一次已经跑了。
    }

    // 设置面板（best-effort：槽位拿不到就当没有面板，渲染照常）。
    try {
      const slots = ctx?.slots
      if (slots && typeof slots.inject === 'function') {
        slots.inject('settings.section', () => slots.register({
          name: 'settings.section',
          id: PLUGIN_ID,
          order: 160,
          label: () => '展示层',
        }, () => buildPanel({
          get: () => settings,
          set: (next) => {
            settings = { ...settings, ...next }
            saveSettings(settings)
            refreshSpec()
            run()
          },
          spec: () => spec,
        })))
      }
    } catch {
      // 设置面板注册失败不影响渲染。
    }
  },
}

/**
 * 设置面板。写成返回 DOM 节点的普通函数（不依赖具体 UI 库），
 * 拿不到宿主组件契约时也能工作。
 */
function buildPanel(api) {
  const wrap = document.createElement('div')
  wrap.className = 'dsp-settings'
  try {
    const s = api.get()

    const row1 = document.createElement('label')
    row1.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px'
    const toggle = document.createElement('input')
    toggle.type = 'checkbox'
    toggle.checked = s.enabled !== false
    toggle.addEventListener('change', () => api.set({ enabled: toggle.checked }))
    row1.appendChild(toggle)
    row1.appendChild(document.createTextNode('启用展示层渲染（稀有度配色 / 通用机器块卡片）'))
    wrap.appendChild(row1)

    // 统一渲染出口：DND 皮肤在场时，机器块交给它的底部控制台（一个面板、一套样式）
    const rowMode = document.createElement('label')
    rowMode.style.cssText = 'display:block;margin-bottom:8px'
    rowMode.appendChild(document.createTextNode('机器块在哪里渲染（统一出口）'))
    const modeSel = document.createElement('select')
    modeSel.style.cssText = 'display:block;width:100%;margin-top:4px'
    for (const [v, label] of [
      ['', '自动 —— DND 皮肤在场就交给它的底部控制台'],
      ['1', '总是交给 DND 皮肤控制台（正文不再插卡片）'],
      ['0', '总是本插件内联渲染（正文里出卡片）'],
    ]) {
      const op = document.createElement('option')
      op.value = v
      op.textContent = label
      if ((s.passAll || '') === v) op.selected = true
      modeSel.appendChild(op)
    }
    modeSel.addEventListener('change', () => api.set({ passAll: modeSel.value }))
    rowMode.appendChild(modeSel)
    wrap.appendChild(rowMode)

    const row2 = document.createElement('label')
    row2.style.cssText = 'display:block;margin-bottom:8px'
    row2.appendChild(document.createTextNode('接管哪些标记（逗号分隔；留空 = 除皮肤负责的块外全部接管）'))
    const own = document.createElement('input')
    own.type = 'text'
    own.value = s.ownMarkers || ''
    own.placeholder = '展示, 势力, 秘宝'
    own.style.cssText = 'display:block;width:100%;margin-top:4px'
    own.addEventListener('change', () => api.set({ ownMarkers: own.value }))
    row2.appendChild(own)
    wrap.appendChild(row2)

    const row3 = document.createElement('label')
    row3.style.cssText = 'display:block'
    row3.appendChild(document.createTextNode('词表覆盖（JSON，可选）：{"rarities":[{"word":"秘宝","color":"#00e5ff"}],"colors":{"warn":"#ff9800"},"blocks":{"势力":{"icon":"🏰"}}}'))
    const specBox = document.createElement('textarea')
    specBox.rows = 4
    specBox.style.cssText = 'display:block;width:100%;margin-top:4px;font-family:monospace'
    specBox.value = s.spec ? JSON.stringify(s.spec, null, 2) : ''
    specBox.addEventListener('change', () => {
      const text = specBox.value.trim()
      if (!text) return api.set({ spec: null })
      try {
        api.set({ spec: JSON.parse(text) })
      } catch {
        specBox.style.borderColor = '#e53935'
      }
    })
    row3.appendChild(specBox)
    wrap.appendChild(row3)
  } catch {
    wrap.textContent = '展示层设置面板渲染失败（渲染本身不受影响）。'
  }
  return wrap
}

/** 打包入口需要的导出面。 */
export const clientBundleExports = { PLUGIN_ID, plugin, buildPanel, sweep, loadSettings, injectStyle }
