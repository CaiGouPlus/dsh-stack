/* DSH Remote · 轻量机器块渲染器
 *
 * 把正文里的 `[[标记]]{json}` 渲染成手机上能看的折叠卡片。
 * 只读、零依赖、不执行模型代码，所有文本一律先转义再输出。
 *
 * 引入方式：在 md.js 之后、app.js 之前加一行 <script src="dnd-blocks.js"></script>
 * 它自己包装 window.mdToHtml，因此不需要改 md.js / app.js。
 *
 * 判据沿用桌面端 display-blocks/parse.js 的纪律：
 *   `[[X]]{` 且大括号能配平解析出对象才算机器块 —— 只匹配 /\[\[X\]\]/
 *   会把「来源：[[商店]] …」这类说明文字误当块。
 *
 * 与桌面端的差别：不认【展示规范】、不做稀有度配色、不跨轮累积面板。
 * 目标是「看得见、不裸奔」，不是复刻 DND 档案面板。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory()
  else {
    root.DshMachineBlocks = factory()
    root.DshMachineBlocks.install(root)
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict'

  // ── 基础 ─────────────────────────────────────────────────

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }

  function isScalar(value) {
    return value === null || value === undefined ||
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
  }

  function scalarText(value) {
    if (value === null || value === undefined) return ''
    if (typeof value === 'boolean') return value ? '是' : '否'
    return String(value)
  }

  // ── 解析（移植 display-blocks 的判据）────────────────────

  /** 机器块标记：`[[名字]]{`。名字限长限字符，避免把 [[[1]]] 之类噪音吃进来。 */
  var MARKER_RE = /\[\[([^[\]\n]{1,16})\]\]\s*\{/g

  /** 宽松 JSON：先直解，失败再清掉对象/数组尾逗号重试。 */
  function parseJson(raw) {
    try {
      var value = JSON.parse(raw)
      return value && typeof value === 'object' ? value : null
    } catch (_) {}
    try {
      var fixed = String(raw).replace(/,\s*([}\]])/g, '$1')
      var value = JSON.parse(fixed)
      return value && typeof value === 'object' ? value : null
    } catch (_) {}
    return null
  }

  /**
   * 从 text[from] 起按大括号配平切出一个对象。
   * 字符串内的 {}、转义引号都跳过；未闭合返回 null。
   */
  function balancedObject(text, from) {
    var t = String(text || '')
    var start = t.indexOf('{', from)
    if (start < 0) return null
    var depth = 0
    var inStr = false
    var escaped = false
    for (var i = start; i < t.length; i++) {
      var c = t[i]
      if (inStr) {
        if (escaped) { escaped = false; continue }
        if (c === '\\') { escaped = true; continue }
        if (c === '"') inStr = false
        continue
      }
      if (c === '"') { inStr = true; continue }
      if (c === '{') depth++
      else if (c === '}') {
        depth--
        if (depth === 0) {
          var raw = t.slice(start, i + 1)
          var json = parseJson(raw)
          return json ? { json: json, raw: raw, start: start, end: i + 1 } : null
        }
      }
    }
    return null
  }

  /**
   * 把正文切成带位置的「文本段 / 机器块段」。
   * 只返回段落，块带 start/end 便于调用方原位替换。
   */
  function extractBlocks(text) {
    var s = String(text == null ? '' : text)
    var out = []
    if (!s || s.indexOf('[[') < 0) return out
    var cursor = 0
    MARKER_RE.lastIndex = 0
    var m
    while ((m = MARKER_RE.exec(s)) !== null) {
      var marker = m[1]
      var braceAt = m.index + m[0].length - 1
      var hit = balancedObject(s, braceAt)
      if (!hit || hit.start !== braceAt) continue
      if (m.index > cursor) out.push({ kind: 'text', start: cursor, end: m.index })
      out.push({ kind: 'block', marker: marker, json: hit.json, raw: hit.raw, start: m.index, end: hit.end })
      cursor = hit.end
      MARKER_RE.lastIndex = hit.end
    }
    if (cursor < s.length) out.push({ kind: 'text', start: cursor, end: s.length })
    return out
  }

  // ── 渲染：JSON → 卡片 ────────────────────────────────────

  var MAX_DEPTH = 4
  var MAX_CHIPS = 24
  var LONG_TEXT = 140

  /** 键名归一：中文键原样，英文常见键翻一下，读起来顺手。 */
  var KEY_ALIAS = {
    hp: '生命', maxhp: '生命上限', ac: '护甲', name: '名称', desc: '描述', description: '描述',
    level: '等级', lv: '等级', exp: '经验', gold: '金币', status: '状态', items: '物品',
    inventory: '背包', skills: '技能', quests: '任务', title: '标题', type: '类型', value: '值'
  }

  function keyLabel(key) {
    var raw = String(key == null ? '' : key)
    var hit = KEY_ALIAS[raw.toLowerCase()]
    return hit || raw
  }

  /** 对象数组里挑一个能当标题的字段。 */
  function itemTitle(obj) {
    var keys = ['名', '名称', '名字', 'name', '名称（中文）', '标题', 'title', 'id']
    for (var i = 0; i < keys.length; i++) {
      var value = obj[keys[i]]
      if (isScalar(value) && scalarText(value).trim()) return scalarText(value)
    }
    return ''
  }

  /** 数组里是对象时，把非标题字段压成一行「键:值」。 */
  function itemDetail(obj, skipKey) {
    var parts = []
    for (var key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue
      if (key === skipKey) continue
      var value = obj[key]
      if (!isScalar(value)) continue
      var text = scalarText(value).trim()
      if (!text) continue
      parts.push(keyLabel(key) + ':' + text)
      if (parts.length >= 4) break
    }
    return parts.join(' · ')
  }

  function chips(values) {
    var shown = values.slice(0, MAX_CHIPS)
    var html = '<span class="mb-chips">'
    for (var i = 0; i < shown.length; i++) html += '<span class="mb-chip">' + esc(scalarText(shown[i])) + '</span>'
    if (values.length > MAX_CHIPS) html += '<span class="mb-chip mb-chip-more">+' + (values.length - MAX_CHIPS) + '</span>'
    return html + '</span>'
  }

  function rawBlock(value) {
    return '<pre class="mb-raw">' + esc(JSON.stringify(value, null, 2)) + '</pre>'
  }

  /** 单个值 → HTML（可能是 chips / 列表 / 嵌套组 / 纯文本）。 */
  function valueHtml(value, depth) {
    if (isScalar(value)) {
      var text = scalarText(value)
      if (!text) return ''
      if (text.length > LONG_TEXT) return '<span class="mb-v mb-long">' + esc(text) + '</span>'
      return '<span class="mb-v">' + esc(text) + '</span>'
    }

    if (Array.isArray(value)) {
      if (!value.length) return '<span class="mb-v mb-empty">（空）</span>'
      var allScalar = true
      for (var i = 0; i < value.length; i++) if (!isScalar(value[i])) { allScalar = false; break }
      if (allScalar) return chips(value)
      if (depth >= MAX_DEPTH) return rawBlock(value)
      var html = '<span class="mb-list">'
      var shown = value.slice(0, 30)
      for (var j = 0; j < shown.length; j++) {
        var item = shown[j]
        if (isScalar(item)) { html += '<span class="mb-li">' + esc(scalarText(item)) + '</span>'; continue }
        var title = itemTitle(item)
        var detail = itemDetail(item, title ? (item['名'] === title ? '名' : item['名称'] === title ? '名称' : item['name'] === title ? 'name' : '') : '')
        html += '<span class="mb-li mb-li-obj">' +
          (title ? '<span class="mb-li-t">' + esc(title) + '</span>' : '') +
          (detail ? '<span class="mb-li-d">' + esc(detail) + '</span>' : '') +
          '</span>'
      }
      if (value.length > shown.length) html += '<span class="mb-li mb-empty">… 还有 ' + (value.length - shown.length) + ' 项</span>'
      return html + '</span>'
    }

    // 嵌套对象
    if (depth >= MAX_DEPTH) return rawBlock(value)
    var rows = objectRows(value, depth + 1)
    return rows ? '<span class="mb-sub">' + rows + '</span>' : ''
  }

  /** 对象 → 行列表。 */
  function objectRows(obj, depth) {
    var html = ''
    for (var key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue
      var value = obj[key]
      var valuePart = valueHtml(value, depth)
      if (!valuePart) continue
      var inline = isScalar(value) || (Array.isArray(value) && value.every(isScalar))
      html += '<span class="mb-row' + (inline ? '' : ' mb-row-col') + '">' +
        '<span class="mb-k">' + esc(keyLabel(key)) + '</span>' +
        valuePart +
        '</span>'
    }
    return html
  }

  /** 收起状态下的一行摘要：取前 3 个标量字段。 */
  function summarize(json) {
    if (!json || typeof json !== 'object') return ''
    var parts = []
    var source = Array.isArray(json) ? json : json
    for (var key in source) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue
      var value = source[key]
      var text = ''
      if (isScalar(value)) text = scalarText(value)
      else if (Array.isArray(value) && value.every(isScalar)) text = value.length + ' 项'
      if (!text) continue
      parts.push(keyLabel(key) + ' ' + text)
      if (parts.length >= 3) break
    }
    return parts.join(' · ')
  }

  // ── 契约渲染（机器块专用标记）────────────────────────────
  //
  // 依据 D:\DSH\dnd-plugin\contract\machine-blocks-pack.json：
  // 「状态更新 / 状态更正 / 商店 / 升级 / 车卡」这五个标记在桌面端由皮肤专用
  // 解析器渲染（Fate 面板、商品清单、升级卡），不是通用键值卡。手机端没有皮肤，
  // 这里按契约字段做轻量版：只渲染本条消息里的块，不做跨轮累积、不做 8 面板。
  //
  // 字段判据全部来自契约的 acceptedKeyAliases —— 中文规范键优先，英文别名也认。

  /** 按候选键顺序取第一个非空值。 */
  function pick(obj, keys) {
    if (!obj || typeof obj !== 'object') return undefined
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i]
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue
      var value = obj[key]
      if (value === null || value === undefined) continue
      if (typeof value === 'string' && !value.trim()) continue
      return value
    }
    return undefined
  }

  /** 从值里抠出数字（"42/50"、"3 gp"、18 都认）。 */
  function numOf(value) {
    if (typeof value === 'number') return isFinite(value) ? value : null
    var match = String(value == null ? '' : value).match(/-?\d+(?:\.\d+)?/)
    return match ? Number(match[0]) : null
  }

  /** 生命条：比例着色（半血警告 / 濒死标红）。 */
  function hpBar(current, max) {
    var cur = numOf(current)
    var total = numOf(max)
    if (cur === null || total === null || total <= 0) return ''
    var pct = Math.max(0, Math.min(100, cur / total * 100))
    var tone = pct <= 25 ? ' is-low' : pct <= 50 ? ' is-warn' : ''
    return '<span class="mb-bar' + tone + '"><span class="mb-bar-fill" style="width:' + pct.toFixed(1) + '%"></span></span>'
  }

  /** 稀有度 → 颜色（与桌面 display-blocks 的 DEFAULT_RARITIES 同表）。 */
  var RARITY = [
    ['神器', '#ff5252', ['artifact']],
    ['传说', '#ffd700', ['传奇', 'legendary']],
    ['非常稀有', '#ff9800', ['极稀有', 'epic', 'very rare']],
    ['稀有', '#9c27b0', ['罕见', '珍稀', 'rare']],
    ['精良', '#2196f3', ['优良', 'uncommon']],
    ['非普通', '#4caf50', ['不常见', '魔法']],
    ['普通', '#9aa0a6', ['common', '寻常']]
  ]

  function rarityOf(word) {
    var key = String(word == null ? '' : word).trim().toLowerCase()
    if (!key) return null
    for (var i = 0; i < RARITY.length; i++) {
      if (RARITY[i][0].toLowerCase() === key) return { word: RARITY[i][0], color: RARITY[i][1] }
      var alias = RARITY[i][2]
      for (var j = 0; j < alias.length; j++) {
        if (alias[j].toLowerCase() === key) return { word: RARITY[i][0], color: RARITY[i][1] }
      }
    }
    return null
  }

  function statBadge(label, value) {
    if (value === undefined || value === null || String(value).trim() === '') return ''
    return '<span class="mb-stat"><i>' + esc(label) + '</i><b>' + esc(scalarText(value)) + '</b></span>'
  }

  /** 卡片外壳：标题 + 摘要 + 正文。 */
  function shell(marker, peek, body, extraClass) {
    return '<details class="mb-card' + (extraClass ? ' ' + extraClass : '') + '" open>' +
      '<summary class="mb-head">' +
      '<span class="mb-tag">' + esc(marker) + '</span>' +
      (peek ? '<span class="mb-peek">' + esc(peek) + '</span>' : '') +
      '</summary>' +
      '<div class="mb-body">' + body + '</div>' +
      '</details>'
  }

  /** 把已消费的键从副本里剔掉，剩下的交给通用行渲染（契约外的字段不丢）。 */
  function restRows(json, consumed, depth) {
    var rest = {}
    var any = false
    for (var key in json) {
      if (!Object.prototype.hasOwnProperty.call(json, key)) continue
      if (consumed.indexOf(key) >= 0) continue
      rest[key] = json[key]
      any = true
    }
    return any ? objectRows(rest, depth || 1) : ''
  }

  /** [[状态更新]] / [[状态更正]] → 生命条 + 属性徽章 + 状态/物品。 */
  function renderStatus(json, marker) {
    var used = []
    var take = function (keys) {
      var value = pick(json, keys)
      for (var i = 0; i < keys.length; i++) if (Object.prototype.hasOwnProperty.call(json, keys[i])) used.push(keys[i])
      return value
    }

    var hp = take(['生命', 'HP', 'hp', '生命值', '体力'])
    var maxHp = take(['生命上限', '最大生命', 'maxHP', 'maxHp', 'HPMax', '生命最大值'])
    var ac = take(['护甲', 'AC', 'ac', '防御', '护甲值'])
    var level = take(['等级', '级', 'Lv', 'lv', 'level'])
    var xp = take(['经验', 'XP', 'xp', 'exp'])
    var gold = take(['金币', '金', 'gold', '钱'])
    var status = take(['状态', 'status', '状态效果'])
    var items = take(['物品', '背包', 'inventory', '物品栏', '装备'])
    var loc = take(['位置', '地点', 'location'])
    var time = take(['时间', '时刻', 'time'])

    if (hp === undefined && maxHp === undefined && ac === undefined && level === undefined &&
        status === undefined && items === undefined) return null

    var html = ''

    if (hp !== undefined || maxHp !== undefined) {
      var cur = numOf(hp)
      var total = numOf(maxHp)
      html += '<span class="mb-hp">' +
        '<span class="mb-hp-line"><span>生命</span><span><b>' + esc(cur === null ? scalarText(hp) : cur) + '</b>' +
        (total !== null ? ' / ' + esc(total) : '') + '</span></span>' +
        hpBar(cur, total) +
        '</span>'
    }

    var stats = statBadge('护甲', ac) + statBadge('等级', level) + statBadge('经验', xp) + statBadge('金币', gold)
    if (stats) html += '<span class="mb-stats">' + stats + '</span>'

    if (status !== undefined) {
      var statusHtml = Array.isArray(status) ? chips(status) : '<span class="mb-v">' + esc(scalarText(status)) + '</span>'
      html += '<span class="mb-row"><span class="mb-k">状态</span>' + statusHtml + '</span>'
    }
    if (items !== undefined) {
      html += '<span class="mb-row mb-row-col"><span class="mb-k">物品</span>' + valueHtml(items, 1) + '</span>'
    }
    if (loc !== undefined) {
      var locMain
      var locSub = ''
      if (isScalar(loc)) {
        locMain = scalarText(loc)
      } else {
        // 契约里位置常写成 {区域, 坐标} —— 主文本取区域，其余压成副文本
        var areaKey = null
        var areaKeys = ['区域', '地区', '地点', '位置', '名称', 'name']
        for (var ai = 0; ai < areaKeys.length; ai++) {
          if (Object.prototype.hasOwnProperty.call(loc, areaKeys[ai])) { areaKey = areaKeys[ai]; break }
        }
        locMain = areaKey ? scalarText(loc[areaKey]) : ''
        locSub = itemDetail(loc, areaKey || '')
        if (!locMain) locMain = locSub
      }
      html += '<span class="mb-row"><span class="mb-k">位置</span><span class="mb-v">' + esc(locMain) +
        (locSub && locSub !== locMain ? ' <span class="mb-li-d">' + esc(locSub) + '</span>' : '') +
        '</span></span>'
    }
    if (time !== undefined) {
      html += '<span class="mb-row"><span class="mb-k">时间</span><span class="mb-v">' + esc(scalarText(time)) + '</span></span>'
    }

    html += restRows(json, used, 1)

    var peek = []
    if (hp !== undefined) peek.push('生命 ' + scalarText(hp) + (maxHp !== undefined ? '/' + scalarText(maxHp) : ''))
    if (ac !== undefined) peek.push('护甲 ' + scalarText(ac))
    if (level !== undefined) peek.push('等级 ' + scalarText(level))
    if (gold !== undefined) peek.push('金币 ' + scalarText(gold))
    return shell(marker, peek.join(' · '), html || rawBlock(json), 'mb-status')
  }

  /** [[商店]] → 店铺信息 + 商品清单（稀有度着色、单价带货币、存量）。 */
  function renderShop(json, marker) {
    var used = []
    var take = function (keys) {
      var value = pick(json, keys)
      for (var i = 0; i < keys.length; i++) if (Object.prototype.hasOwnProperty.call(json, keys[i])) used.push(keys[i])
      return value
    }

    var name = take(['名', '名称', '店名', '商店名', 'name', 'shopName', 'title'])
    var type = take(['类型', '类别', 'type'])
    var owner = take(['店主', '老板', '掌柜', 'owner', 'keeper'])
    var loc = take(['位置', '地点', 'location'])
    var currency = take(['货币', '币种', 'currency']) || 'gp'
    var goods = take(['商品', '货物', '货品', 'items', 'goods', 'products'])

    if (name === undefined && !Array.isArray(goods)) return null

    var html = ''
    var meta = []
    if (type !== undefined) meta.push(statBadge('类型', type))
    if (owner !== undefined) meta.push(statBadge('店主', owner))
    if (loc !== undefined) meta.push(statBadge('位置', loc))
    if (meta.length) html += '<span class="mb-stats">' + meta.join('') + '</span>'

    if (Array.isArray(goods) && goods.length) {
      html += '<span class="mb-goods">'
      var shown = goods.slice(0, 40)
      for (var i = 0; i < shown.length; i++) {
        var item = shown[i]
        if (!item || typeof item !== 'object') {
          html += '<span class="mb-good"><span class="mb-good-main"><span class="mb-good-name">' + esc(scalarText(item)) + '</span></span></span>'
          continue
        }
        var itemName = pick(item, ['名', '名称', '物品名', 'name', 'item', 'title'])
        var rarity = rarityOf(pick(item, ['稀有度', '档次', '品质', 'rarity', 'quality']))
        var price = pick(item, ['价', '售价', '实价', '价格', 'price', 'cost'])
        var stock = pick(item, ['存量', '数量', '库存', 'stock', 'qty'])
        var category = pick(item, ['类别', '类型', 'category', 'type'])

        var subBits = []
        if (category !== undefined) subBits.push(scalarText(category))
        if (stock !== undefined) subBits.push('×' + scalarText(stock))

        html += '<span class="mb-good">' +
          '<span class="mb-good-main">' +
          '<span class="mb-good-name"' + (rarity ? ' style="color:' + rarity.color + '"' : '') + '>' +
          esc(scalarText(itemName) || '（未命名）') + '</span>' +
          (rarity ? '<span class="mb-good-sub">' + esc(rarity.word) + '</span>' : '') +
          (subBits.length ? '<span class="mb-good-sub">' + esc(subBits.join(' · ')) + '</span>' : '') +
          '</span>' +
          (price !== undefined
            ? '<span class="mb-good-side"><b>' + esc(scalarText(price)) + '</b> ' + esc(scalarText(currency)) + '</span>'
            : '') +
          '</span>'
      }
      if (goods.length > shown.length) {
        html += '<span class="mb-good"><span class="mb-good-main"><span class="mb-good-sub">… 还有 ' + (goods.length - shown.length) + ' 件</span></span></span>'
      }
      html += '</span>'
    }

    html += restRows(json, used, 1)

    var peek = scalarText(name) || '商品'
    if (Array.isArray(goods)) peek += ' · ' + goods.length + ' 件'
    return shell(marker, peek, html || rawBlock(json), 'mb-shop')
  }

  /** [[升级]] → 等级跃迁 + 自动项 + 待选。 */
  function renderLevelUp(json, marker) {
    var used = []
    var take = function (keys) {
      var value = pick(json, keys)
      for (var i = 0; i < keys.length; i++) if (Object.prototype.hasOwnProperty.call(json, keys[i])) used.push(keys[i])
      return value
    }

    var from = take(['从', '起始等级', '原等级', 'from', 'fromLevel'])
    var to = take(['到', '目标等级', '新等级', 'to', 'toLevel'])
    var xp = take(['累计XP', '累计经验', '总经验', 'xp', 'totalXp'])
    var next = take(['下一门槛', '下级门槛', '下一级所需', 'nextThreshold', 'nextLevelXp'])
    var job = take(['职业', 'class', 'className'])
    var auto = take(['自动'])
    var pending = take(['待选'])

    if (from === undefined && to === undefined && auto === undefined && pending === undefined) return null

    var html = ''
    if (from !== undefined || to !== undefined) {
      html += '<span class="mb-lv">' +
        '<span>Lv ' + esc(scalarText(from === undefined ? '?' : from)) + '</span>' +
        '<span class="arrow">→</span>' +
        '<span>Lv ' + esc(scalarText(to === undefined ? '?' : to)) + '</span>' +
        (job !== undefined ? '<span class="mb-stat"><i>职业</i><b>' + esc(scalarText(job)) + '</b></span>' : '') +
        '</span>'
    }
    if (xp !== undefined || next !== undefined) {
      html += '<span class="mb-row"><span class="mb-k">经验</span><span class="mb-v">' +
        esc(scalarText(xp === undefined ? '—' : xp)) +
        (next !== undefined ? ' / 下一门槛 ' + esc(scalarText(next)) : '') +
        '</span></span>'
    }
    if (auto && typeof auto === 'object' && !Array.isArray(auto)) {
      var bits = []
      for (var key in auto) {
        if (!Object.prototype.hasOwnProperty.call(auto, key)) continue
        var value = auto[key]
        if (isScalar(value)) bits.push(key + ' ' + scalarText(value))
        else if (Array.isArray(value) && value.every(isScalar) && value.length) bits.push(key + ' ' + value.map(scalarText).join('/'))
      }
      if (bits.length) html += '<span class="mb-row mb-row-col"><span class="mb-k">自动获得</span><span class="mb-chips">' +
        bits.map(function (t) { return '<span class="mb-chip">' + esc(t) + '</span>' }).join('') + '</span></span>'
    }
    if (pending !== undefined) {
      html += '<span class="mb-row mb-row-col"><span class="mb-k">待选</span>' + valueHtml(pending, 1) + '</span>'
    }

    html += restRows(json, used, 1)
    var peek = (from !== undefined || to !== undefined) ? 'Lv ' + scalarText(from) + ' → ' + scalarText(to) : ''
    return shell(marker, peek, html || rawBlock(json), 'mb-levelup')
  }

  /** [[车卡]] → 角色摘要（名/种族/职业/等级 + 属性）。 */
  function renderCharacter(json, marker) {
    var used = []
    var take = function (keys) {
      var value = pick(json, keys)
      for (var i = 0; i < keys.length; i++) if (Object.prototype.hasOwnProperty.call(json, keys[i])) used.push(keys[i])
      return value
    }

    var name = take(['名', '名称', '姓名', 'name', '角色名'])
    var race = take(['种族', 'race'])
    var job = take(['职业', 'class', 'className'])
    var level = take(['等级', '级', 'level', 'Lv'])
    var hp = take(['生命', 'HP', 'hp'])
    var maxHp = take(['生命上限', '最大生命', 'maxHP', 'maxHp'])
    var ac = take(['护甲', 'AC', 'ac'])
    var attrs = take(['属性', '六维', '属性值', 'stats', 'attributes'])

    if (name === undefined && race === undefined && job === undefined && attrs === undefined) return null

    var html = ''
    var meta = statBadge('种族', race) + statBadge('职业', job) + statBadge('等级', level) + statBadge('护甲', ac)
    if (meta) html += '<span class="mb-stats">' + meta + '</span>'

    if (hp !== undefined || maxHp !== undefined) {
      html += '<span class="mb-hp"><span class="mb-hp-line"><span>生命</span><span><b>' +
        esc(scalarText(hp)) + '</b>' + (maxHp !== undefined ? ' / ' + esc(scalarText(maxHp)) : '') +
        '</span></span>' + hpBar(hp, maxHp) + '</span>'
    }
    if (attrs !== undefined) {
      html += '<span class="mb-row mb-row-col"><span class="mb-k">属性</span>' + valueHtml(attrs, 1) + '</span>'
    }

    html += restRows(json, used, 1)
    return shell(marker, scalarText(name) || '', html || rawBlock(json), 'mb-character')
  }

  var SPECIAL = {
    '状态更新': renderStatus,
    '状态更正': renderStatus,
    '商店': renderShop,
    '升级': renderLevelUp,
    '车卡': renderCharacter
  }

  /** 契约渲染器（dsp-core.js，从 display-blocks 打包而来）。 */
  function contractCore() {
    try {
      return (typeof globalThis !== 'undefined' && globalThis.DshBlockCore) ? globalThis.DshBlockCore : null
    } catch (_) { return null }
  }

  /**
   * 按 display-blocks 契约渲染：节 / 布局 / 三级色 / 稀有度 / 行内标注。
   * 这是主路径 —— 契约里标记由模型自己起（人物/地点/任务/物品/组织…），
   * 只有渲染规则统一，所以必须走同一套解析器，不能在这里重写规则。
   */
  function renderContract(block) {
    var core = contractCore()
    if (!core || typeof core.renderBlock !== 'function') return null
    try {
      var tree = core.renderBlock(block.marker, block.json, core.spec, { merged: true })
      if (!tree) return null
      var html = core.toHtml(tree)
      if (!html) return null
      // 契约渲染只认那几个字段（名/类型/稀有度/色/节/字段/条目/备注）。
      // 载荷里一个都没有时它会吐一张只有标题的空卡片 —— 那种情况退回通用卡片，
      // 免得模型多写的字段被静默吞掉。
      if (!/dsp-(secs|sec-body|kv|items|pair)\b/.test(html)) return null
      return '<div class="mb-dsp">' + html + '</div>'
    } catch (_) {
      return null
    }
  }

  /** 机器块 → 折叠卡片（契约标记走专用版式，其余走 display-blocks 契约渲染）。 */
  function renderBlock(block) {
    // ① DND 专用标记：契约明确说这五个不归 display-blocks，由皮肤解析器负责
    var special = SPECIAL[block.marker]
    if (special && !Array.isArray(block.json)) {
      var custom = null
      try { custom = special(block.json, block.marker) } catch (_) { custom = null }
      if (custom) return custom
    }

    // ② 其余标记：契约渲染（节/布局/色/稀有度/行内标注）
    var contract = renderContract(block)
    if (contract) return contract

    // ③ 兜底：通用键值卡（dsp-core 没加载、或载荷不是对象时才走到这里）
    var peek = summarize(block.json)
    var body = Array.isArray(block.json)
      ? valueHtml(block.json, 1)
      : objectRows(block.json, 1)
    if (!body) body = rawBlock(block.json)
    return shell(block.marker, peek, body, '')
  }

  // ── 包装 mdToHtml ────────────────────────────────────────

  /** 一段纯文本（非代码围栏）里的机器块就地替换，其余交还原渲染器。 */
  function renderSegment(segment, md, options) {
    var blocks = extractBlocks(segment)
    var hasBlock = false
    for (var i = 0; i < blocks.length; i++) if (blocks[i].kind === 'block') { hasBlock = true; break }
    if (!hasBlock) return md(segment, options)

    var html = ''
    var cursor = 0
    for (var j = 0; j < blocks.length; j++) {
      var block = blocks[j]
      if (block.kind !== 'block') continue
      if (block.start > cursor) html += md(segment.slice(cursor, block.start), options)
      html += renderBlock(block)
      cursor = block.end
    }
    if (cursor < segment.length) html += md(segment.slice(cursor), options)
    return html
  }

  /**
   * 消息全文 → HTML。
   * 代码围栏内的 `[[X]]{}` 不渲染（那是在讲协议本身，不是输出状态）。
   * options.richContent === false 时整体直通（有些调用只想拿纯 Markdown）。
   */
  function renderMessage(text, md, options) {
    var source = String(text == null ? '' : text)
    if (!source || typeof md !== 'function') return typeof md === 'function' ? md(text, options) : ''
    if (options && options.richContent === false) return md(source, options)
    if (source.indexOf('[[') < 0) return md(source, options)

    var parts = source.split('```')
    if (parts.length === 1) return renderSegment(source, md, options)

    var html = ''
    for (var i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        // 还原围栏后交回原渲染器：代码块仍按代码块处理。
        html += md('```' + parts[i] + '```', options)
        continue
      }
      html += renderSegment(parts[i], md, options)
    }
    return html
  }

  var CSS = [
    '.mb-card{margin:8px 0;border:1px solid var(--dsr-line,#3a3a3a);border-radius:12px;background:var(--dsr-panel-2,#1c1c1c);overflow:hidden}',
    '.mb-head{display:flex;gap:8px;align-items:center;padding:9px 11px;cursor:pointer;list-style:none;background:var(--dsr-accent-soft,rgba(120,160,255,.12))}',
    '.mb-head::-webkit-details-marker{display:none}',
    '.mb-head::after{content:"▾";margin-left:auto;flex:0 0 auto;font-size:11px;color:var(--dsr-muted,#9aa4b2);transition:transform .15s}',
    '.mb-card:not([open]) .mb-head::after{transform:rotate(-90deg)}',
    '.mb-tag{font-size:12px;font-weight:600;color:var(--dsr-accent,#7aa2ff);white-space:nowrap;flex:0 0 auto}',
    '.mb-peek{font-size:12px;color:var(--dsr-muted,#9aa4b2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}',
    '.mb-body{padding:9px 11px 11px;display:flex;flex-direction:column;gap:5px;font-size:13.5px;line-height:1.55}',
    '.mb-row{display:flex;gap:8px;align-items:baseline}',
    '.mb-row.mb-row-col{flex-direction:column;gap:3px}',
    '.mb-k{flex:0 0 auto;max-width:44%;color:var(--dsr-muted,#9aa4b2);font-size:12.5px;word-break:break-word}',
    '.mb-row.mb-row-col>.mb-k{max-width:100%}',
    '.mb-v{flex:1 1 auto;min-width:0;color:var(--dsr-text,#e6e8ec);overflow-wrap:anywhere;word-break:break-word}',
    '.mb-v.mb-long{display:block;white-space:pre-wrap}',
    '.mb-v.mb-empty{color:var(--dsr-muted,#9aa4b2);font-size:12.5px}',
    '.mb-chips{display:flex;flex-wrap:wrap;gap:5px;flex:1 1 auto;min-width:0}',
    '.mb-chip{padding:1px 8px;border-radius:999px;background:var(--dsr-panel,#242424);border:1px solid var(--dsr-line,#3a3a3a);font-size:12.5px;color:var(--dsr-text,#e6e8ec);overflow-wrap:anywhere}',
    '.mb-chip-more{color:var(--dsr-muted,#9aa4b2)}',
    '.mb-list{display:flex;flex-direction:column;gap:4px;flex:1 1 auto;min-width:0}',
    '.mb-li{display:flex;gap:7px;flex-wrap:wrap;font-size:13px;color:var(--dsr-text,#e6e8ec)}',
    '.mb-li::before{content:"·";color:var(--dsr-muted,#9aa4b2);flex:0 0 auto}',
    '.mb-li-obj{flex-direction:column;gap:1px;padding-left:2px}',
    '.mb-li-t{font-weight:600}',
    '.mb-li-d{color:var(--dsr-muted,#9aa4b2);font-size:12.5px}',
    '.mb-sub{display:flex;flex-direction:column;gap:3px;padding-left:9px;border-left:2px solid var(--dsr-line,#3a3a3a);flex:1 1 auto;min-width:0}',
    '.mb-raw{margin:0;padding:7px 9px;border-radius:8px;background:var(--dsr-code-bg,rgba(255,255,255,.06));font-size:11.5px;line-height:1.45;overflow-x:auto;white-space:pre-wrap;word-break:break-word;max-height:220px;overflow-y:auto}',
    // ── 契约渲染：生命条 / 属性徽章 / 商品行 / 升级 ──
    '.mb-hp{display:flex;flex-direction:column;gap:3px;margin-bottom:2px}',
    '.mb-hp-line{display:flex;justify-content:space-between;align-items:baseline;font-size:12.5px;color:var(--dsr-muted,#9aa4b2)}',
    '.mb-hp-line b{font-size:15px;color:var(--dsr-text,#e6e8ec)}',
    '.mb-bar{display:block;height:7px;border-radius:999px;background:var(--dsr-panel,#242424);border:1px solid var(--dsr-line,#3a3a3a);overflow:hidden}',
    '.mb-bar-fill{display:block;height:100%;background:var(--dsr-accent,#7aa2ff);transition:width .2s}',
    '.mb-bar.is-warn .mb-bar-fill{background:var(--dsr-warning,#ff9e64)}',
    '.mb-bar.is-low .mb-bar-fill{background:var(--dsr-error,#ff8f6b)}',
    '.mb-stats{display:flex;flex-wrap:wrap;gap:5px;margin:1px 0}',
    '.mb-stat{display:inline-flex;align-items:baseline;gap:4px;padding:1px 8px;border-radius:8px;background:var(--dsr-panel,#242424);border:1px solid var(--dsr-line,#3a3a3a);font-size:12px;color:var(--dsr-text,#e6e8ec)}',
    '.mb-stat i{font-style:normal;color:var(--dsr-muted,#9aa4b2);font-size:11.5px}',
    '.mb-stat b{font-size:13px;font-weight:600}',
    '.mb-lv{display:flex;align-items:center;flex-wrap:wrap;gap:7px;font-size:15px;font-weight:600;margin-bottom:2px}',
    '.mb-lv .arrow{color:var(--dsr-muted,#9aa4b2);font-weight:400}',
    '.mb-goods{display:flex;flex-direction:column;gap:5px;margin:2px 0}',
    '.mb-good{display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:5px 9px;border-radius:8px;background:var(--dsr-panel,#242424);border:1px solid var(--dsr-line,#3a3a3a)}',
    '.mb-good-main{display:flex;flex-direction:column;gap:1px;min-width:0}',
    '.mb-good-name{font-size:13px;font-weight:600;overflow-wrap:anywhere}',
    '.mb-good-sub{font-size:11.5px;color:var(--dsr-muted,#9aa4b2)}',
    '.mb-good-side{flex:0 0 auto;font-size:12.5px;color:var(--dsr-muted,#9aa4b2);white-space:nowrap}',
    '.mb-good-side b{font-size:13.5px;color:var(--dsr-text,#e6e8ec)}'
  ].join('')

  function injectStyle(target) {
    try {
      if (!target || !target.document) return
      var doc = target.document
      // 契约渲染器的样式（display-blocks 同源）
      var core = contractCore()
      if (core && core.CSS && !doc.getElementById('dsp-core-style')) {
        var coreStyle = doc.createElement('style')
        coreStyle.id = 'dsp-core-style'
        coreStyle.textContent = core.CSS
        ;(doc.head || doc.documentElement).appendChild(coreStyle)
      }
      if (doc.getElementById('mb-style')) return
      var style = doc.createElement('style')
      style.id = 'mb-style'
      style.textContent = CSS
      ;(doc.head || doc.documentElement).appendChild(style)
    } catch (_) {}
  }

  /** 包装宿主上的 mdToHtml；重复调用安全。 */
  function install(target) {
    try {
      if (!target || typeof target.mdToHtml !== 'function') return false
      if (target.mdToHtml.__machineBlocks) return true
      var original = target.mdToHtml
      var wrapped = function (text, options) { return renderMessage(text, original, options) }
      wrapped.__machineBlocks = true
      target.mdToHtml = wrapped
      injectStyle(target)
      return true
    } catch (_) {
      return false
    }
  }

  return {
    extractBlocks: extractBlocks,
    renderBlock: renderBlock,
    renderMessage: renderMessage,
    install: install,
    injectStyle: injectStyle,
    CSS: CSS
  }
})
