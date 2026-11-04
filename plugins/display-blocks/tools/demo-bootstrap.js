// ── Demo 引导（浏览器侧）──────────────────────────────────────
//
// ⚠ 本文件**不能单独运行**：它被 tools/build-demo.mjs 拼进 demo/index.html
// 的外层 IIFE 里，直接使用外层作用域的这些符号——
//   specFromCardText / defaultSpec / renderMessage / treeRarities /
//   toDom / injectStyle / DEFAULT_SKIP_MARKERS
// 全部来自 lib/ 源模块，保证「预览 = 实机」。
//
// 纪律与插件一致：只用 createElement / createTextNode 组 DOM，不拼 innerHTML。

;(function () {
  'use strict'

  // ── 示例内容 ──────────────────────────────────────────────
  const SAMPLE_MSG = [
    '你在烛光里翻开那本（传说）级的《灰鹰游记》，书页间滑落一张 [g]烫金请柬[/g]。',
    '',
    '【竖琴手同盟】的线人说，黑市上最近有人兜售（神器）残片，讲价的人揣着（非常稀有）品相的魔晶——',
    '',
    '[[展示]]{"名":"竖琴手同盟","类型":"组织","稀有度":"传说","字段":{"阵营":"守序善良","据点":"银月城","首领":"风暴·银手","密语":"竖琴不语"},"条目":[{"名":"银月城分部","稀有度":"稀有","字段":{"职能":"情报归集","联络人":"凯尔本"}},{"名":"深水城联络处","稀有度":"精良","字段":{"职能":"中转与掩护"}}],"备注":"成员多为半精灵与人类，行事隐秘，厌恶无谓的暴力。"}',
    '',
    '[[人物]]{"名":"凯尔本·「黑杖」","类型":"人物","稀有度":"传说","节":[{"名":"年龄","值":"127 岁（人类外表约四十）"},{"名":"外貌","值":"白发及肩，左手常戴一枚龙鳞戒，杖头嵌黑曜石"},{"名":"身材","值":"精瘦，比看起来更有力"},{"名":"心理","值":"表面从容，实则多疑；不轻易信任非人类"},{"名":"服装","值":["玄色长袍","龙鳞胸甲","黑杖"]},{"名":"状态","色":"橙","值":{"生命":"良好","法术位":"全满","伤势":"无"}},{"名":"技能","布局":"标签","值":["焰击术","法师之手","传送术","拟像术"]}],"备注":"他不喜欢被反复打扰。"}',
    '',
    '[[秘宝]]{"名":"褪色的烫金请柬","类型":"秘宝","稀有度":"非常稀有","字段":{"材质":"羊皮纸","附魔":"微弱咒纹","落款":"模糊的竖琴纹章"},"条目":["持柬者可 [g]免检[/g] 进入银月城上层沙龙","朔月之夜字迹会 [c]泛出微光[/c]"],"备注":"「秘宝」类型与图标来自左下角的卡声明。"}',
    '',
    '[[任务]]{"名":"黑市上的神器残片","类型":"任务","稀有度":"稀有","色":"草绿","字段":{"委托人":"竖琴手同盟","报酬":"情报 + 2,500 gp","期限":"十日"},"条目":["查明残片来源","打草惊蛇即为失败"],"备注":"卡片的强调色被「色:草绿」覆盖，压过了稀有度色。"}',
    '',
    '—— 附注：黑市已经收摊，[[商店]] 这个词本身不会触发任何渲染。',
    '',
    '[[商店]]{"名":"收摊的摊位","商品":[{"名":"占位商品","价":0}]}',
    '',
  ].join('\n')

  const SAMPLE_SPEC = [
    '【展示规范】',
    '稀有度: 秘宝=#00e5ff, 凡品=#9aa0a6',
    '颜色: warn=#ff9800, dg=#1b5e20, 血红=#8b0000',
    '块: 秘宝=💎|秘宝图鉴, 势力=🏰|势力图鉴|天蓝',
    '节: 外貌=🪞|蓝, 技能=📜|标签|暗金, 口头禅=💬',
  ].join('\n')

  const TEMPLATES = [
    { label: '＋ 组织', text: '\n[[展示]]{"名":"新组织","类型":"组织","稀有度":"精良","字段":{"阵营":"中立","据点":"未知"},"条目":[{"名":"成员甲","稀有度":"普通"}],"备注":"模板：删改后即用。"}\n' },
    { label: '＋ 人物', text: '\n[[人物]]{"名":"新人物","类型":"人物","稀有度":"稀有","字段":{"身份":"？","态度":"未知"},"备注":""}\n' },
    { label: '＋ 分节的块', text: '\n[[人物]]{"名":"新角色","类型":"人物","稀有度":"精良","节":[{"名":"年龄","值":""},{"名":"外貌","值":""},{"名":"身材","值":""},{"名":"心理","值":""},{"名":"状态","值":{"生命":"","伤势":""}},{"名":"服装","布局":"标签","值":["",""]},{"名":"技能","布局":"标签","值":["",""]}]}\n' },
    { label: '＋ 带色的块', text: '\n[[地点]]{"名":"月光集市","类型":"地点","色":"紫","节":{"氛围":"灯火浮在半空，摊主不吆喝，价格写在木牌上。","常客":[{"名":"独眼铁匠","稀有度":"稀有","色":"橙"},{"名":"卖梦的姑娘","稀有度":"非常稀有"}],"规矩":{"宵禁":"午夜前离场","斗殴":"罚没全部所得"}},"备注":"「色」也可以写 #8e24aa 或 金。"}\n' },
    { label: '＋ 任务', text: '\n[[任务]]{"名":"新任务","类型":"任务","稀有度":"普通","字段":{"委托人":"？","报酬":"？"},"条目":["目标一","目标二"],"备注":""}\n' },
    { label: '＋ 物品', text: '\n[[物品]]{"名":"新物品","类型":"物品","稀有度":"非常稀有","字段":{"类型":"奇物"},"备注":""}\n' },
    { label: '＋ 自创类型', text: '\n[[预言]]{"名":"一条预言","稀有度":"传说","字段":{"来源":"占卜"},"备注":"标记不在词表 → 兜底样式；在卡声明里加「块: 预言=🔮|神谕|天际蓝」即可定制。"}\n' },
    { label: '＋ 行内标注', text: '\n混排一行：（传说）与 [g]金色[/g] 与 [#00e5ff]任意色[/#00e5ff] 与 [血红]自定义色名[/血红]；词表外的（某某）保持原样。\n' },
  ]

  // ── DOM 引用 ──────────────────────────────────────────────
  const msgBox = document.getElementById('demo-msg')
  const specBox = document.getElementById('demo-spec')
  const preview = document.getElementById('demo-preview')
  const statsEl = document.getElementById('demo-stats')
  const tblRar = document.getElementById('tbl-rar')
  const tblCol = document.getElementById('tbl-col')
  const tblBlk = document.getElementById('tbl-blk')
  const tblSec = document.getElementById('tbl-sec')
  const tblSkip = document.getElementById('tbl-skip')
  const themeBtn = document.getElementById('btn-theme')
  const resetBtn = document.getElementById('btn-reset')
  const tplRow = document.getElementById('demo-tpl')

  function el(tag, cls, text) {
    const node = document.createElement(tag)
    if (cls) node.className = cls
    if (text != null) node.textContent = text
    return node
  }

  // ── 规范（卡声明 → 生效词表） ──────────────────────────────
  function buildSpec() {
    try {
      return specFromCardText(specBox.value || '', null)
    } catch (e) {
      return defaultSpec()
    }
  }

  // ── 预览渲染（renderMessage → toDom，与插件同一条链路） ────
  function makePassNote(raw) {
    const box = el('div', 'pass-note')
    box.appendChild(el('span', 'pass-note-label', '↳ 透传（不归本插件，皮肤负责）：'))
    box.appendChild(el('code', 'pass-note-raw', raw))
    return box
  }

  function renderPreview() {
    const spec = buildSpec()
    preview.textContent = ''
    let parts = []
    try {
      parts = renderMessage(msgBox.value || '', spec, undefined)
    } catch (e) {
      preview.appendChild(el('div', 'render-error', '渲染异常：' + ((e && e.message) || e)))
      return
    }
    let blocks = 0
    let passes = 0
    for (const part of parts) {
      if (!part) continue
      if (part.cls === 'dsp-pass') {
        passes++
        preview.appendChild(makePassNote(part.text))
        continue
      }
      if (part.cls === 'dsp-card') blocks++
      const dom = toDom(part)
      if (dom) preview.appendChild(dom)
    }
    const rar = treeRarities(parts)
    let rarCount = 0
    for (const k in rar) rarCount += rar[k]
    let secCount = 0
    const countSecs = (nodes) => {
      for (const node of nodes || []) {
        if (!node) continue
        if (node.cls && node.cls.split(' ').indexOf('dsp-sec') >= 0) secCount++
        if (node.children) countSecs(node.children)
      }
    }
    countSecs(parts)
    statsEl.textContent = blocks + ' 个机器块 · ' + secCount + ' 个分节 · ' +
      rarCount + ' 处稀有度标注 · ' + passes + ' 段透传'
    renderSpecTables(spec)
  }

  // ── 生效词表 ──────────────────────────────────────────────
  function chipInto(host, muted) {
    const c = el('span', 'chip' + (muted ? ' muted' : ''))
    host.appendChild(c)
    return c
  }
  function dotInto(host, color) {
    const d = el('span', 'dot')
    d.style.background = color
    host.appendChild(d)
  }
  function renderSpecTables(spec) {
    tblRar.textContent = ''
    for (const r of spec.rarities || []) {
      const c = chipInto(tblRar)
      dotInto(c, r.color)
      c.appendChild(document.createTextNode(r.word))
    }
    tblCol.textContent = ''
    for (const code of Object.keys(spec.colors || {})) {
      const c = chipInto(tblCol)
      dotInto(c, spec.colors[code])
      c.appendChild(document.createTextNode(code))
    }
    tblBlk.textContent = ''
    for (const name of Object.keys(spec.blocks || {})) {
      const v = spec.blocks[name]
      const c = chipInto(tblBlk)
      if (v.color) dotInto(c, resolveColor(spec, v.color) || v.color)
      c.title = v.title || name
      c.appendChild(document.createTextNode((v.icon || '') + ' ' + name))
    }
    tblSec.textContent = ''
    for (const name of Object.keys(spec.sections || {})) {
      const v = spec.sections[name]
      const c = chipInto(tblSec)
      if (v.color) dotInto(c, resolveColor(spec, v.color) || v.color)
      c.appendChild(document.createTextNode((v.icon ? v.icon + ' ' : '') + name + (v.layout ? ' · ' + v.layout : '')))
    }
    tblSkip.textContent = ''
    for (const m of DEFAULT_SKIP_MARKERS) {
      chipInto(tblSkip, true).appendChild(document.createTextNode(m))
    }
  }

  // ── 主题（只切 demo 页变量；插件 CSS 从 currentColor 派生，自动跟随） ──
  function applyTheme(name, persist) {
    const light = name === 'light'
    document.body.className = light ? 'theme-light' : 'theme-dark'
    themeBtn.textContent = light ? '🌙 暗色' : '☀ 亮色'
    if (persist === false) return
    try { window.localStorage.setItem('demo-theme', light ? 'light' : 'dark') } catch (e) { /* 忽略 */ }
  }
  themeBtn.addEventListener('click', function () {
    applyTheme(document.body.classList.contains('theme-light') ? 'dark' : 'light')
  })

  // ── 插入模板 / 恢复示例 ────────────────────────────────────
  for (const t of TEMPLATES) {
    const btn = el('button', '', t.label)
    btn.type = 'button'
    btn.addEventListener('click', function () {
      msgBox.value = (msgBox.value || '') + t.text
      msgBox.scrollTop = msgBox.scrollHeight
      renderPreview()
    })
    tplRow.appendChild(btn)
  }
  resetBtn.addEventListener('click', function () {
    msgBox.value = SAMPLE_MSG
    specBox.value = SAMPLE_SPEC
    renderPreview()
  })

  msgBox.addEventListener('input', renderPreview)
  specBox.addEventListener('input', renderPreview)

  // ── 启动 ──────────────────────────────────────────────────
  // 主题优先级：URL 锚点（#light / #dark，便于直接分享或截图）> 上次选择 > 暗色
  let startTheme = ''
  try {
    const hash = String(window.location.hash || '').replace(/^#/, '').toLowerCase()
    if (hash === 'light' || hash === 'dark') startTheme = hash
  } catch (e) { /* 忽略 */ }
  if (startTheme) {
    applyTheme(startTheme, false)
  } else {
    let savedTheme = 'dark'
    try { savedTheme = window.localStorage.getItem('demo-theme') === 'light' ? 'light' : 'dark' } catch (e) { /* 忽略 */ }
    applyTheme(savedTheme)
  }
  msgBox.value = SAMPLE_MSG
  specBox.value = SAMPLE_SPEC
  injectStyle()   // 插件同款 CSS，单一来源（lib/client.js）
  renderPreview()
})()
