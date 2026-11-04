// 酒馆工具层 —— Cordis 插件入口
//
// 定位：**只补面板缺的那一层**。面板已经把「自动注入 / 世界书关键词与阶段选择 /
// 记忆总结 / 关系网 / 剧情选项 / 反八股」都做了，本插件不重复这些，只做面板
// **没有**的一件事 —— 让模型在对话里直接读写自己的资料：
//   读卡 / 改卡 / 复制卡 / 体检卡、主动查阅世界书（含未被注入的条目）、
//   改世界书、读改预设模块、读会话记忆与关系网。
//
// 注册方式对齐本 profile 里已在跑的 tavernweave-workbench（本项目当前 DSH 上
// 唯一一个已注册 Agent 工具的插件）：import { defineTool } from
// '@deepseek-ai/dsh-tools' + export const inject = ['tools'] + ctx.effect(() =>
// ctx.tools.register(defineTool(state)))，这样热重载/卸载会自动回收。
//
// 有意不做（见 README 的差距表）：历史正文检索（DSH 原生 session_query 全文检索
// 已覆盖，面板记忆总结也覆盖「回忆剧情」）、世界书自动注入、注入段本身、
// Skill 体系、生图/小手机/侧栏/卡工作台（前端或整包范畴）。

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { defineTool } from '@deepseek-ai/dsh-tools'

import {
  CARD_INJECTED_FIELDS,
  cardInjectedText,
  cardIndex,
  entryKeys,
  entryRef,
  getPresetDir,
  listPresets,
  readCharacters,
  readPresetModules,
  readSessionMemory,
  readSessionRelations,
  readWorldbookEntries,
  readWorldbookRaw,
  resolveDshHome,
  resolvePreset,
  resolveRoot,
  searchEntries,
  writeCharacters,
  writeJsonAtomic,
  writePresetModules,
  writeWorldbookRaw
} from './data.js'
import {
  CARD_SECTIONS,
  alternateGreetingsOf,
  cardBody,
  decodeCardPayload,
  depthPromptOf,
  extractCardFromPng,
  isPng,
  normalizeStCard,
  regexScriptsOf
} from './st-card.js'
import { locateGlobalRegexFile, upsertScripts } from './global-regex.js'
import { buildBackgroundPrompt, runBackgroundTurn } from './background.js'

export const name = 'tavern-tools'
export const inject = ['tools']

// ── 参数规格 DSL ────────────────────────────────────────────
//
// ⚠️ 宿主的 `parameters` **不是** JSON Schema，而是「属性名 → 值规格」的映射：
//   每个值规格只允许 type/enum/const/description/title/default/examples 与
//   `required: true`；宿主自己补 type:'object' 与 additionalProperties 行为
//   （见 dsh-tools 的 parameterSchemaSpecToJsonSchema / compilePropertyMap）。
// 传整个 JSON Schema 会在加载期抛
//   JsonSchemaError: unsupported JSON schema: parameters.type must be a value schema object
// 也就是插件根本起不来 —— 这条是实测踩出来的。
const P = {
  str: (description, required = false) => ({ type: 'string', description, ...(required ? { required: true } : {}) }),
  int: (description, required = false) => ({ type: 'integer', description, ...(required ? { required: true } : {}) }),
  bool: (description, required = false) => ({ type: 'boolean', description, ...(required ? { required: true } : {}) }),
  strList: (description, required = false) => ({ type: 'array', items: { type: 'string' }, description, ...(required ? { required: true } : {}) }),
  // 自由形态的对象参数（用于 fields 这种「键未知、值必须是字符串」的补丁包）
  freeObject: (description) => ({ type: 'json', description }),
  enum: (description, values, required = false) => ({ type: 'string', enum: values, description, ...(required ? { required: true } : {}) }),
  /** 目标预设：本会话没有非 legacy 绑定时必填（工具会明确要求，不静默兜底）。 */
  presetId: () => ({ type: 'string', description: '目标预设 id；本会话无有效绑定记录时必填（工具会明确提示可用预设）。' })
}

// ── 小工具 ──────────────────────────────────────────────────
function str(value) {
  return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value)
}

function clampInteger(value, fallback, minimum, maximum) {
  const number = Number(value)
  if (!Number.isInteger(number)) return fallback
  return Math.max(minimum, Math.min(maximum, number))
}

function json(value) {
  return JSON.stringify(value, null, 2)
}

/** 内容修订号（内容哈希前缀）：用于「先读后写」的乐观并发控制。 */
function revisionOf(file) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 12)
  } catch {
    return ''
  }
}

/** 统一的输出契约：宿主校验 schema，render 把字符串原样交给模型。 */
function textTool(options) {
  return defineTool({
    name: options.name,
    description: options.description,
    parameters: options.parameters,
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: typeof value === 'string' ? value : json(value) }]
    },
    timeoutMs: options.timeoutMs,
    isConcurrencySafe: options.isConcurrencySafe || (() => false),
    execute: options.execute
  })
}

// ── 宿主上下文 ──────────────────────────────────────────────
function createHost(ctx) {
  const dshHome = resolveDshHome()
  const root = resolveRoot(dshHome)

  function sessionIdOf(exec) {
    const session = exec && exec.agent && exec.agent.session
    return session && typeof session.id === 'string' ? session.id : ''
  }

  /**
   * 解析预设。解析不出就返回「怎么才能解析出」的可执行指引，
   * 而不是悄悄用一个默认预设 —— 写工具写错预设是数据事故。
   */
  function needPreset(args, exec) {
    const resolved = resolvePreset(root, sessionIdOf(exec), str(args.presetId).trim() || undefined)
    if (resolved.ok) {
      const dir = getPresetDir(root, resolved.presetId)
      if (!dir) {
        return { error: `预设 ${resolved.presetId} 在注册表里存在但目录不可用；数据根：${root}` }
      }
      const meta = listPresets(root).find((p) => p.id === resolved.presetId)
      return { presetId: resolved.presetId, dir, name: meta ? meta.name : resolved.presetId, source: resolved.source }
    }
    const list = (resolved.available || []).map((id) => {
      const m = listPresets(root).find((p) => p.id === id)
      return `${id}${m && m.name ? `（${m.name}）` : ''}`
    })
    const why = {
      'no-session': '本次工具调用拿不到会话 id',
      unbound: '本会话还没有酒馆预设绑定记录',
      'legacy-binding': '本会话只有 legacy 记账（面板视为未绑定）',
      'binding-invalid': `绑定指向的预设已不存在${resolved.tried ? `：${resolved.tried}` : ''}`,
      'explicit-unknown': `presetId 不存在：${resolved.tried}`
    }[resolved.reason] || resolved.reason
    return {
      error: `无法确定要操作哪个预设（${why}）。` +
        `请让用户告知目标预设，然后在参数里显式传 presetId。当前可用预设：${list.join('、') || '（无）'}`
    }
  }

  function presetLabel(host_) {
    return `${host_.name}（presetId=${host_.presetId}${host_.source ? `, 来源=${host_.source}` : ''}）`
  }

  return { ctx, dshHome, root, sessionIdOf, needPreset, presetLabel }
}

// ── 工具实现 ────────────────────────────────────────────────

/**
 * 后台推演工具。
 *
 * 用 ctx.get('agents') 惰性取服务（不写进 inject）——理由见 lib/background.js 头注释：
 * inject 是硬依赖，缺服务会连带 10 个酒馆工具一起起不来。
 */
function backgroundTools(host) {
  return {
    /**
     * 起一个后台会话跑一轮推演，把产出文本拿回来。
     * 上下文（卡 + 世界书）由本工具现读组装，跑完即销毁会话。
     */
    bgRun: async (args, exec) => {
      const p = host.needPreset(args, exec)
      if (p.error) return p.error
      const task = str(args.task).trim()
      if (!task) return '需要 task：告诉后台推演要产出什么，例如「推演今夜城内三个势力各自的行动与留下的痕迹」。'

      const enabled = readCharacters(p.dir).filter((c) => c.enabled !== false)
      const wanted = str(args.cardName).trim()
      let card = null
      if (wanted) {
        card = enabled.find((c) => str(c.name).trim() === wanted)
        if (!card) {
          return `没有启用中的角色卡「${wanted}」。现有启用：${enabled.map((c) => str(c.name)).join('、') || '（无）'}`
        }
      } else {
        card = enabled[0] || null
      }
      const cardText = card ? cardInjectedText(card) : ''

      // 世界书：默认按 task 关键词检索（省 token，也贴合「幕后只该知道相关内容」）。
      const wb = readWorldbookEntries(p.dir)
      let picked = []
      let wbMode = 'skip'
      if (args.worldbook !== 'skip' && wb.entries.length) {
        if (args.worldbook === 'all') {
          picked = wb.entries.filter((item) => item.enabled)
          wbMode = `all（${picked.length} 条）`
        } else {
          const found = searchEntries(wb.entries, task, { limit: clampInteger(args.worldbookLimit, 12, 1, 40) })
          picked = found.entries.map((hit) => hit.item)
          wbMode = `keyword（命中 ${found.total} 条，取前 ${picked.length}）`
        }
      }
      const worldbookText = picked
        .map((item) => `### ${str(item.entry.name || item.entry.comment) || entryRef(item)}\n${item.content}`)
        .join('\n\n')

      const systemText = buildBackgroundPrompt({
        cardName: card ? str(card.name) : '',
        cardText,
        worldbookText,
        maxChars: clampInteger(args.maxContextChars, 12000, 2000, 60000)
      })

      const model = str(args.model).trim()
      // ctx.get 也可能在没有该服务时抛（取决于宿主版本），一律降级成可读诊断。
      let agents
      try {
        agents = host.ctx.get('agents')
      } catch (error) {
        agents = undefined
        host.ctx.logger?.warn?.(`[tavern-tools] 取 agents 服务失败：${error && error.message}`)
      }
      const result = await runBackgroundTurn(
        {
          agents,
          log: (level, message) => host.ctx.logger?.[level]?.(message)
        },
        {
          prompt: task,
          systemText,
          timeoutMs: clampInteger(args.timeoutMs, 180000, 10000, 900000),
          agentOptions: model ? { model } : undefined,
          cwd: process.cwd()
        }
      )

      if (!result.ok) {
        return `后台推演没有完成：${result.error}\n` +
          `上下文来源：${p.name}（卡 ${card ? str(card.name) : '无'}，世界书 ${wbMode}，系统提示 ${systemText.length} 字）。\n` +
          '这是一次独立会话的模型调用，会消耗额度；反复失败请先确认宿主的 agents 服务与默认模型可用。'
      }
      return json({
        preset: host.presetLabel(p),
        task,
        context: { card: card ? str(card.name) : null, worldbook: wbMode, systemPromptChars: systemText.length },
        sessionId: result.sessionId,
        chars: result.text.length,
        text: result.text,
        note: '这是另一条独立会话的产出，不是本会话的正文。把它当作幕后事实素材并入叙述即可；' +
          '需要它变成可被查阅的设定，用 tavern_worldbook_update 写进世界书。'
      })
    }
  }
}

function cardTools(host) {
  const snap = (dir) => ({
    dir,
    cards: readCharacters(dir),
    revision: revisionOf(path.join(dir, 'characters.json'))
  })

  function locate(cards, args) {
    const wanted = str(args.name).trim()
    const index = Number.isInteger(args.index) ? args.index : -1
    if (wanted) {
      const at = cards.findIndex((c) => str(c.name).trim() === wanted)
      if (at < 0) throw new Error(`没有叫「${wanted}」的角色卡。现有：${cards.map((c, i) => `${i}:${str(c.name)}`).join('、') || '（无）'}`)
      return at
    }
    if (index >= 0) {
      if (index >= cards.length) throw new Error(`index ${index} 越界，共 ${cards.length} 张卡。`)
      return index
    }
    const firstEnabled = cards.findIndex((c) => c.enabled !== false)
    if (firstEnabled < 0) throw new Error('该预设没有启用的角色卡；请用 name 或 index 指定。')
    return firstEnabled
  }

  /**
   * 修订号守卫。返回**给模型看的可执行指引**而不是抛异常：
   * 「写之前先重读」是可自我纠正的错误，不该变成一次工具失败。
   */
  function revisionGuard(current, expected) {
    if (expected === undefined || expected === null || str(expected) === '') return null
    if (str(expected) === current) return null
    return `修订号不匹配（当前 ${current}，你给的是 ${expected}）。` +
      '说明这份资料在你这轮思考期间被改过（可能是面板自动保存）。请重新用 tavern_card 读取最新内容，改完再提交。'
  }

  return {
    card: (args, exec) => {
      const p = host.needPreset(args, exec)
      if (p.error) return p.error
      const s = snap(p.dir)
      // 不带定位参数 = 列出全部
      if (args.name === undefined && args.index === undefined) {
        return json({
          preset: host.presetLabel(p),
          revision: s.revision,
          count: s.cards.length,
          cards: s.cards.map((card, index) => ({ index, ...cardIndex(card) })),
          note: s.cards.length
            ? '给 name 或 index 读出某张卡的全文；改卡用 tavern_card_update。'
            : '该预设还没有角色卡：用面板导入 PNG/JSON 卡，或用 tavern_card_copy 从别的预设搬。'
        })
      }
      const at = locate(s.cards, args)
      const card = s.cards[at]
      const fields = {}
      for (const [key, value] of Object.entries(card)) {
        fields[key] = typeof value === 'string' && value.length > 20000 ? `${value.slice(0, 20000)}\n…（已截断，未读到的部分不会被改动）` : value
      }
      return json({
        preset: host.presetLabel(p),
        revision: s.revision,
        index: at,
        name: str(card.name),
        enabled: card.enabled !== false,
        injectedFields: CARD_INJECTED_FIELDS,
        injectedChars: cardInjectedText(card).length,
        fields,
        note: '注入用的是 desc/first/text/content 四个字段（面板 cardTextFor）；改卡用 tavern_card_update，务必带上这里的 revision。'
      })
    },

    cardUpdate: (args, exec) => {
      const p = host.needPreset(args, exec)
      if (p.error) return p.error
      const s = snap(p.dir)
      const stale = revisionGuard(s.revision, args.expectedRevision)
      if (stale) return stale
      const at = locate(s.cards, args)
      const patch = args.fields && typeof args.fields === 'object' ? args.fields : {}
      const keys = Object.keys(patch)
      if (!keys.length) return 'fields 为空：请给出要改的字段，例如 {"desc":"新的设定"}。'
      for (const key of keys) {
        if (typeof patch[key] !== 'string') return `字段 ${key} 必须是字符串（当前是 ${typeof patch[key]}）。`
      }
      const target = s.cards[at]
      const changed = keys.map((key) => {
        const before = typeof target[key] === 'string' ? target[key].length : 0
        target[key] = patch[key]
        return { field: key, beforeChars: before, afterChars: patch[key].length }
      })
      if (str(args.rename).trim()) target.name = str(args.rename).trim()
      writeCharacters(p.dir, s.cards)
      const noticed = keys.filter((k) => !CARD_INJECTED_FIELDS.includes(k))
      return json({
        preset: host.presetLabel(p),
        card: str(target.name),
        changed,
        revision: revisionOf(path.join(p.dir, 'characters.json')),
        note: '已写入 characters.json；面板每轮组装提示词时现读该文件，**下一轮回复即生效**，历史消息不变。' +
          (noticed.length ? `注意：${noticed.join('、')} 不是注入字段（注入只看 ${CARD_INJECTED_FIELDS.join('/')}），改了不会影响提示词。` : '') +
          ' persona 段（agent.cordis.yml）由面板「保存预设」生成，本工具不代写。'
      })
    },

    cardCopy: (args, exec) => {
      const p = host.needPreset(args, exec)
      if (p.error) return p.error
      const s = snap(p.dir)
      const staleCopy = revisionGuard(s.revision, args.expectedRevision)
      if (staleCopy) return staleCopy
      const at = locate(s.cards, args)
      const clone = JSON.parse(JSON.stringify(s.cards[at]))
      const newName = str(args.newName).trim() || `${str(s.cards[at].name)}·副本`
      if (s.cards.some((c) => str(c.name).trim() === newName)) {
        return `已存在同名卡「${newName}」：名字是定位键，不能重复。`
      }
      clone.name = newName
      s.cards.push(clone)
      writeCharacters(p.dir, s.cards)
      return json({
        preset: host.presetLabel(p),
        copiedFrom: str(s.cards[at].name),
        newName,
        count: s.cards.length,
        revision: revisionOf(path.join(p.dir, 'characters.json')),
        note: '副本继承原卡的启用状态。想让它生效、又不想同时注入原卡，请把原卡 enabled 设为 false。'
      })
    },

    cardValidate: (args, exec) => {
      const p = host.needPreset(args, exec)
      if (p.error) return p.error
      const s = snap(p.dir)
      const problems = []
      const seen = new Map()
      s.cards.forEach((card, index) => {
        const label = `#${index} ${str(card.name) || '(无名)'}`
        const cardName = str(card.name).trim()
        if (!cardName) problems.push({ level: 'error', card: label, issue: '缺少 name：面板与工具都按名字定位，无名卡改不动。' })
        else if (seen.has(cardName)) problems.push({ level: 'error', card: label, issue: `名字与 ${seen.get(cardName)} 重复。` })
        else seen.set(cardName, label)
        if (card.enabled === false) problems.push({ level: 'info', card: label, issue: '已禁用：不参与注入。' })
        if (!cardInjectedText(card).trim()) {
          problems.push({ level: 'error', card: label, issue: `注入字段全空（${CARD_INJECTED_FIELDS.join('/')}），这张卡注入了等于没注入。` })
        }
        if (/@!|@\{|\{\{[a-z_]+::/i.test(cardInjectedText(card))) {
          problems.push({ level: 'warn', card: label, issue: '含 ST 宏（{{变量::参数}} 或 @! 形态）：面板注入前会清理，写了不生效。' })
        }
      })
      return json({
        preset: host.presetLabel(p),
        revision: s.revision,
        count: s.cards.length,
        problems,
        verdict: problems.some((x) => x.level === 'error') ? 'has-errors'
          : problems.some((x) => x.level === 'warn') ? 'warnings-only' : 'clean'
      })
    },

    /**
     * 导入 SillyTavern 角色卡（PNG / JSON）。
     *
     * 为什么需要这个工具：面板的导入器只留 name/desc/first（它会把内嵌世界书
     * 一起写进 worldbooks.json，那部分本工具不重复），卡里的 scenario /
     * mes_example / system_prompt / post_history_instructions /
     * alternate_greetings / extensions.regex_scripts 全部消失。本工具把这几个
     * 分区折进 desc（面板唯一会注入的正文段），把原始卡归档，并提供把卡级
     * 正则脚本落进 muv-engine 全局正则库的选项。
     *
     * 明确不做：不执行卡里的脚本、不翻译模板、不写 agent.cordis.yml
     * （那是面板「保存预设」生成的快照，见本文件头注释第 3 条）。
     */
    cardImport: (args, exec) => {
      const p = host.needPreset(args, exec)
      if (p.error) return p.error
      const s = snap(p.dir)
      const stale = revisionGuard(s.revision, args.expectedRevision)
      if (stale) return stale

      // ── 1) 取卡：文件路径 或 内联 JSON ──
      const source = str(args.source).trim()
      const inline = str(args.cardJson).trim()
      let card = null
      let origin = ''
      let pngInfo = ''
      if (inline) {
        card = decodeCardPayload(inline)
        origin = 'cardJson 参数'
        if (!card) return 'cardJson 解析失败：既不是 JSON 文本，也不是 base64 编码的 JSON。'
      } else if (source) {
        const file = path.resolve(source)
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return `文件不存在或不是文件：${file}`
        const buffer = fs.readFileSync(file)
        if (isPng(buffer)) {
          const hit = extractCardFromPng(buffer)
          if (!hit) {
            return `${path.basename(file)} 是 PNG，但没有找到内嵌卡数据（tEXt/iTXt 的 chara / ccv3 块）。` +
              '若这张图本来就只是立绘，请改用卡的 .json 导出件。'
          }
          card = hit.card
          origin = `${path.basename(file)}（PNG ${hit.keyword} 块）`
          pngInfo = `PNG 内文本块：${hit.keywordsSeen.join(', ') || '（无）'}`
        } else {
          card = decodeCardPayload(buffer.toString('utf8'))
          origin = path.basename(file)
          if (!card) return `${path.basename(file)} 解析不出角色卡 JSON。`
        }
      } else {
        return '需要 source（PNG/JSON 文件路径）或 cardJson（卡 JSON 原文）之一。'
      }

      // ── 2) 归一化 ──
      const norm = normalizeStCard(card)
      const name = str(args.name).trim() || norm.name
      if (!name) {
        return '这张卡没有 name 字段。请在参数里用 name 指定卡名（卡名是面板与本工具定位卡的唯一键）。'
      }
      if (!norm.desc.trim() && !norm.first.trim()) {
        return `「${name}」的 description/personality/scenario/mes_example/first_mes 全为空，导入了也注入不出内容。`
      }

      // ── 3) 归档原始卡（卡里一切不丢）──
      const archiveDir = path.join(p.dir, 'st-sources')
      let archived = ''
      if (args.archive !== false) {
        const digest = crypto.createHash('sha256').update(JSON.stringify(card)).digest('hex').slice(0, 8)
        const slug = name.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40) || 'card'
        archived = path.join(archiveDir, `${slug}-${digest}.json`)
        if (!fs.existsSync(archived)) {
          fs.mkdirSync(archiveDir, { recursive: true })
          writeJsonAtomic(archived, card)
        }
      }

      // ── 4) 写 characters.json ──
      const at = s.cards.findIndex((c) => str(c.name).trim() === name)
      const replaced = at >= 0
      const entry = { name, desc: norm.desc, first: norm.first, enabled: args.enabled !== false }
      if (replaced) s.cards[at] = entry
      else s.cards.push(entry)

      // 备选开场白：默认展开成**同设定的禁用伴生卡**，启用其中一张并禁用主卡即可换开场。
      const altCards = []
      if (args.altGreetings !== 'archive' && norm.altGreetings.length) {
        norm.altGreetings.forEach((greeting, i) => {
          const altName = `${name}·开场白${i + 2}`
          const altEntry = { name: altName, desc: norm.desc, first: greeting, enabled: false }
          const altAt = s.cards.findIndex((c) => str(c.name).trim() === altName)
          if (altAt >= 0) s.cards[altAt] = altEntry
          else s.cards.push(altEntry)
          altCards.push(altName)
        })
      }
      writeCharacters(p.dir, s.cards)

      // ── 4b) 开场白库（greetings.json）───────────────────────────────
      //
      // ★ 2026-10-04 补：面板与注入链路都只认 characters.json 的一张卡一个 `first` 字段，
      //   ST 卡的备选开场白在 alternate_greetings[] 里，导入时若不显式留下来，面板里就
      //   「只能查看一种」。dsh-tavern 侧新增了开场白库读取（预设目录下的 greetings.json
      //   是第一来源），这里在导入时就把「主开场白 + 全部备选」写进去 ——
      //   归档还在时它读得到，归档被删/被覆盖后也仍然读得到。
      //   与伴生卡方案不冲突：伴生卡是「换一张卡来换开场」，本文件是「同一张卡里换开场」，
      //   两条路并存；不需要伴生卡时把 altGreetings 设为 'archive' 即可只留库。
      const greetingLib = (() => {
        if (!norm.altGreetings.length) return null
        try {
          const file = path.join(p.dir, 'greetings.json')
          let cache = { version: 1, cards: [] }
          try {
            const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
            if (parsed && typeof parsed === 'object' && Array.isArray(parsed.cards)) cache = parsed
          } catch {}
          const entry = cache.cards.find((c) => c && str(c.name).trim() === name) || { name, greetings: [] }
          const seen = new Set((Array.isArray(entry.greetings) ? entry.greetings : [])
            .map((t) => String(t).replace(/\r\n?/g, '\n').trim()).filter(Boolean))
          const before = seen.size
          for (const g of [norm.first].concat(norm.altGreetings)) {
            const t = str(g)
            const key = t.replace(/\r\n?/g, '\n').trim()
            if (!key || seen.has(key)) continue
            seen.add(key)
            entry.greetings.push(t)
          }
          entry.currentIndex = 0
          entry.updatedAt = Date.now()
          entry.source = 'tavern_card_import'
          const at = cache.cards.findIndex((c) => c && str(c.name).trim() === name)
          if (at >= 0) cache.cards[at] = entry
          else cache.cards.push(entry)
          writeJsonAtomic(file, cache)
          return { file, total: entry.greetings.length, added: entry.greetings.length - before }
        } catch (e) {
          return { error: e.message }
        }
      })()

      // ── 5) 内嵌世界书 ──
      let bookReport = null
      if (norm.book && norm.book.entries.length && args.worldbook !== 'skip') {
        const raw = readWorldbookRaw(p.dir)
        const groups = raw.kind === 'legacy-array'
          ? (raw.value)
          : raw.kind === 'v2' && Array.isArray(raw.value.groups) ? raw.value.groups : []
        const groupName = norm.book.name.trim() || `${name}的世界书`
        let group = groups.find((g) => g && str(g.name).trim() === groupName)
        let added = 0
        let merged = 0
        if (!group) {
          group = { name: groupName, entries: [], enabled: true }
          groups.push(group)
        }
        if (!Array.isArray(group.entries)) group.entries = []
        const seen = new Set(group.entries.map((e) => str(e.content)))
        for (const e of norm.book.entries) {
          if (seen.has(e.content)) { merged++; continue }
          group.entries.push(e)
          seen.add(e.content)
          added++
        }
        const container = raw.kind === 'legacy-array'
          ? { version: 2, injectMode: 'full', groups }
          : { version: 2, injectMode: str(raw.value.injectMode) || 'full', groups }
        writeWorldbookRaw(p.dir, { kind: 'v2', value: container })
        const keyless = norm.book.entries.filter((e) => !e.keys.length).length
        bookReport = {
          group: groupName,
          entriesInCard: norm.book.entries.length,
          added,
          alreadyPresent: merged,
          keyless,
          note: keyless
            ? `其中 ${keyless} 条没有 keys/keywords —— 面板 keyword 模式下不会注入（ST 的 constant 条目就是这种）。`
            : '全部条目都带触发词，keyword 模式下可正常命中。'
        }
      } else if (norm.book && norm.book.entries.length) {
        bookReport = { skipped: true, entriesInCard: norm.book.entries.length }
      }

      // ── 6) 卡级正则脚本 ──
      const scriptReport = (() => {
        const scripts = norm.regexScripts
        if (!scripts.length) return null
        const mode = str(args.globalRegex) || 'report'
        if (mode === 'skip') return { found: scripts.length, skipped: true }
        if (mode !== 'import') {
          return {
            found: scripts.length,
            names: scripts.map((x) => str(x.scriptName || x.name)).filter(Boolean).slice(0, 20),
            imported: false,
            how: '面板「🧩 全局正则」卡片可直接粘贴这张卡的 JSON 原文（它认 {data:{extensions:{regex_scripts:[…]}}} 形态）；' +
              '或把 globalRegex 参数设为 "import" 让本工具直接落进 muv-engine 全局正则库。'
          }
        }
        const located = locateGlobalRegexFile(host.dshHome)
        if (!located) {
          return {
            found: scripts.length, imported: false,
            error: '找不到 dsh-muv-engine 包（已查 $MUV_ENGINE_DATA_DIR 与 profile 下的 node_modules）。' +
              '请用面板的「🧩 全局正则」卡片导入。'
          }
        }
        const result = upsertScripts(located.file, scripts)
        return { found: scripts.length, imported: true, file: located.file, ...result }
      })()

      const unmapped = Object.keys(cardBody(card)).filter((k) => ![
        ...CARD_SECTIONS.flatMap((sec) => sec.aliases),
        'first_mes', 'first_message', 'char_greeting', 'greeting', 'name',
        'alternate_greetings', 'regex_scripts', 'extensions'
      ].includes(k))

      return json({
        preset: host.presetLabel(p),
        origin,
        png: pngInfo || undefined,
        spec: norm.spec,
        card: name,
        action: replaced ? 'replaced' : 'added',
        foldedIntoDesc: norm.sections,
        descChars: norm.desc.length,
        firstChars: norm.first.length,
        alternateGreetings: {
          count: norm.altGreetings.length,
          mode: args.altGreetings === 'archive' ? 'archive' : 'companion-cards',
          companions: altCards.length ? altCards : undefined
        },
        greetingLibrary: greetingLib
          ? (greetingLib.error
            ? { ok: false, error: greetingLib.error }
            : {
              ok: true,
              file: greetingLib.file,
              total: greetingLib.total,
              added: greetingLib.added,
              how: '写进预设目录的 greetings.json（dsh-tavern 开场白库的第一来源）。' +
                '面板「👁 查看」里会出现「💬 开场白（多条）」下拉，可逐条查看、一键设为当前开场白。',
            })
          : '这张卡没有备选开场白（alternate_greetings 为空），开场白库只有 first 一条。',
        worldbook: bookReport || (norm.book ? undefined : '这张卡没有内嵌世界书'),
        regexScripts: scriptReport || '这张卡没有卡级正则脚本',
        depthPrompt: norm.depthPrompt
          ? { chars: norm.depthPrompt.prompt.length, depth: norm.depthPrompt.depth, note: 'ST 的作者注记（depth_prompt）：面板没有对应字段，原文已随归档保留。' }
          : undefined,
        archived: archived || '（未归档：archive=false）',
        notMappedButArchived: unmapped,
        revision: revisionOf(path.join(p.dir, 'characters.json')),
        note: '已写入 characters.json（注入字段只有 desc 与 first，其余分区按 ST 组装顺序折进了 desc）；' +
          '面板每轮现读该文件，**下一轮回复即生效**。原始卡完整保留在 st-sources/ 下，字段没有真正丢失。'
      })
    },

    /**
     * 往角色卡的 `desc` **追加**一段文本（幂等）。
     *
     * 为什么需要一个单独的「追加」工具：`tavern_card_update` 是**整体替换** desc ——
     * 拿它去补一段契约，必须先把 16K 的 desc 整份读出来再拼回去，任何截断/省略都会
     * 静默吃掉设定。而这个动作（补一段输出契约到卡上）恰恰是常做的：
     * 商店/升级机器块的输出契约原先只写在【DND·无尽冒险】一张卡的 desc 里，
     * 换一张卡就要重来一遍。
     *
     * 幂等靠 `marker`：desc 里已经出现过 marker 就**不写**，直接返回 already-present。
     * 默认 marker = 追加文本的首行（前 40 字），可用参数覆盖（例如契约包里的
     * idempotencyMarker「【商店输出契约】」）。
     *
     * 也支持从契约包读：给 `packPath` + `packVariant`，本工具会把该 variant 下
     * 各段拼成待追加文本，并自动用包里的 idempotencyMarker。
     */
    cardAppend: (args, exec) => {
      const p = host.needPreset(args, exec)
      if (p.error) return p.error
      const s = snap(p.dir)
      const staleAppend = revisionGuard(s.revision, args.expectedRevision)
      if (staleAppend) return staleAppend

      const at = locate(s.cards, args)
      const card = s.cards[at]

      // ── 组装待追加文本 ──
      let text = str(args.text)
      let marker = str(args.marker).trim()
      let packInfo = null
      const packPath = str(args.packPath).trim()
      if (packPath) {
        const file = path.resolve(packPath)
        if (!fs.existsSync(file)) return `契约包不存在：${file}`
        let pack
        try {
          pack = JSON.parse(fs.readFileSync(file, 'utf8'))
        } catch (error) {
          return `契约包解析失败（${file}）：${error.message}`
        }
        const variant = str(args.packVariant).trim() || 'generic'
        const contracts = pack && pack.contracts && pack.contracts[variant]
        if (!contracts || typeof contracts !== 'object') {
          const have = pack && pack.contracts ? Object.keys(pack.contracts).join('、') : '（无 contracts）'
          return `契约包里没有 variant「${variant}」。可用：${have}`
        }
        const parts = Object.keys(contracts)
          .filter((k) => k !== 'note' && typeof contracts[k] === 'string' && contracts[k].trim())
          .map((k) => contracts[k].trim())
        if (!parts.length) return `契约包 variant「${variant}」里没有可追加的文本。`
        text = parts.join('\n\n')
        if (!marker) marker = str(pack.idempotencyMarker).trim()
        packInfo = { file, variant, sections: Object.keys(contracts).filter((k) => k !== 'note') }
      }

      if (!text.trim()) return '需要 text（要追加的文本）或 packPath（契约包路径）之一。'
      if (!marker) {
        const firstLine = text.trim().split(/\r?\n/)[0] || ''
        marker = firstLine.slice(0, 40).trim()
      }
      if (!marker) return '无法确定幂等标记（marker）：请显式给出 marker。'

      const desc = str(card.desc)
      if (desc.includes(marker)) {
        return json({
          preset: host.presetLabel(p),
          card: str(card.name),
          action: 'already-present',
          marker,
          descChars: desc.length,
          pack: packInfo || undefined,
          note: 'desc 里已经有这个标记了，**没有写入任何东西**。要强制重写请先用 tavern_card 读全文、再决定怎么改。'
        })
      }

      const separator = desc.trim() ? '\n\n' : ''
      const nextDesc = desc + separator + text.trim()
      if (args.dryRun === true) {
        return json({
          preset: host.presetLabel(p),
          card: str(card.name),
          action: 'dry-run',
          marker,
          descCharsBefore: desc.length,
          descCharsAfter: nextDesc.length,
          pack: packInfo || undefined,
          appendPreview: text.trim().slice(0, 300),
          note: 'dryRun=true：只报告会追加什么，**没有写入**。确认后去掉 dryRun 再调一次。'
        })
      }

      card.desc = nextDesc
      writeCharacters(p.dir, s.cards)
      return json({
        preset: host.presetLabel(p),
        card: str(card.name),
        action: 'appended',
        marker,
        descCharsBefore: desc.length,
        descCharsAfter: nextDesc.length,
        addedChars: nextDesc.length - desc.length,
        pack: packInfo || undefined,
        revision: revisionOf(path.join(p.dir, 'characters.json')),
        note: '只改了 desc 这一个字段，卡的其余字段一字未动。面板每轮现读 characters.json，**下一轮回复即生效**；' +
          'agent.cordis.yml 是面板「保存预设」生成的快照，本工具不代写。'
      })
    }
  }
}

function worldbookTools(host) {
  function snap(dir) {
    return {
      dir,
      read: readWorldbookEntries(dir),
      raw: readWorldbookRaw(dir),
      revision: revisionOf(path.join(dir, 'worldbooks.json'))
    }
  }

  function revisionGuard(current, expected) {
    if (expected === undefined || expected === null || str(expected) === '') return null
    if (str(expected) === current) return null
    return `修订号不匹配（当前 ${current}，你给的是 ${expected}）。请重新 tavern_worldbook 读取后再改。`
  }

  function container(raw) {
    if (raw.kind === 'legacy-array') {
      raw.value = { version: 2, injectMode: 'full', groups: raw.value }
      raw.kind = 'v2'
    }
    if (!Array.isArray(raw.value.groups)) raw.value.groups = []
    if (raw.value.version !== 2) raw.value.version = 2
    if (typeof raw.value.injectMode !== 'string') raw.value.injectMode = 'full'
    return raw.value.groups
  }

  function locate(groups, ref) {
    const [groupName, sequence] = str(ref).split('#')
    const group = groups.find((g) => g && str(g.name).trim() === str(groupName).trim())
    if (!group) throw new Error(`组「${groupName}」不存在。现有组：${groups.map((g) => str(g.name)).join('、')}`)
    const entries = Array.isArray(group.entries) ? group.entries : (group.entries = [])
    const index = Number(sequence) - 1
    if (!Number.isInteger(index) || index < 0 || index >= entries.length) {
      throw new Error(`条目 ${ref} 越界：组「${groupName}」共 ${entries.length} 条。`)
    }
    return { group, entry: entries[index], index }
  }

  return {
    worldbook: (args, exec) => {
      const p = host.needPreset(args, exec)
      if (p.error) return p.error
      const s = snap(p.dir)
      const refs = Array.isArray(args.refs) ? args.refs.map(String).map((x) => x.trim()).filter(Boolean) : []
      const groupName = str(args.group).trim()
      const query = str(args.query).trim()
      const all = s.read.entries

      if (refs.length) {
        if (refs.length > 10) return '一次最多读 10 条，请分批。'
        const picked = refs.map((ref) => {
          const found = all.find((item) => entryRef(item) === ref)
          if (!found) throw new Error(`条目 ${ref} 不存在。不带参数调用本工具可列出全部 ref。`)
          return found
        })
        return json({
          preset: host.presetLabel(p),
          revision: s.revision,
          mode: 'read',
          entries: picked.map((item) => ({
            ref: entryRef(item),
            group: item.group,
            title: str(item.entry.name || item.entry.comment),
            keys: item.keys,
            enabled: item.enabled,
            templated: /<%|\{\{/.test(item.content),
            content: item.content
          })),
          note: '这是落盘原文；注入时才按 injectMode/触发词决定进不进提示词。'
        })
      }

      if (query) {
        const found = searchEntries(all, query, {
          offset: clampInteger(args.offset, 0, 0, 100000),
          limit: clampInteger(args.limit, 5, 1, 10),
          includeDisabled: args.includeDisabled === true
        })
        return json({
          preset: host.presetLabel(p),
          revision: s.revision,
          mode: 'search',
          query,
          injectMode: s.read.injectMode,
          total: found.total,
          offset: found.offset,
          hasMore: found.hasMore,
          entries: found.entries.map((hit) => ({
            ref: entryRef(hit.item),
            group: hit.item.group,
            title: str(hit.item.entry.name || hit.item.entry.comment),
            keys: hit.item.keys,
            enabled: hit.item.enabled,
            matchedTerms: hit.matchedTerms,
            templated: hit.templated,
            snippet: hit.snippet
          })),
          note: found.total === 0
            ? '零命中不代表设定不存在：换更短的关键词，或确认是否该在别的预设里查（本工具一次只看一个预设）。'
            : '片段来自落盘原文（不含模板求值结果）；确认相关后用 refs 读完整条目，一次最多 10 条。' +
              '本工具专治「关键词没被最近几条消息命中、所以没被自动注入」的情况。'
        })
      }

      const groups = groupName
        ? s.read.entries.filter((item) => item.group === groupName)
        : s.read.entries
      if (groupName && !groups.length) {
        const names = [...new Set(s.read.entries.map((item) => item.group))]
        return `组「${groupName}」不存在或为空。现有组：${names.join('、') || '（无）'}`
      }
      const limit = clampInteger(args.limit, 40, 1, 200)
      return json({
        preset: host.presetLabel(p),
        revision: s.revision,
        format: s.read.format,
        injectMode: s.read.injectMode,
        totalEntries: s.read.entries.length,
        matched: groups.length,
        returned: groups.length > limit ? limit : groups.length,
        truncated: groups.length > limit,
        groups: [...new Set(groups.map((item) => item.group))].map((name) => ({
          group: name,
          enabled: groups.find((item) => item.group === name)?.enabled !== false,
          entries: groups.filter((item) => item.group === name).slice(0, limit).map((item) => ({
            ref: entryRef(item),
            title: str(item.entry.name || item.entry.comment),
            keys: item.keys,
            enabled: item.enabled,
            chars: item.content.length
          }))
        })),
        note: `注入模式 ${s.read.injectMode}：keyword 模式只有触发词被最近消息命中才注入，full 模式全部注入。先 refs 读全文再决定改不改。`
      })
    },

    worldbookUpdate: (args, exec) => {
      const p = host.needPreset(args, exec)
      if (p.error) return p.error
      const s = snap(p.dir)
      const staleWb = revisionGuard(s.revision, args.expectedRevision)
      if (staleWb) return staleWb
      const groups = container(s.raw)
      const action = str(args.action || 'update').trim()
      const ref = str(args.ref).trim()
      const title = str(args.title).trim()
      const content = typeof args.content === 'string' ? args.content : undefined
      const keys = Array.isArray(args.keys) ? args.keys.map((k) => str(k).trim()).filter(Boolean) : undefined

      if (action === 'delete') {
        if (!ref) return 'delete 需要 ref（形如「组名#3」）。'
        const found = locate(groups, ref)
        found.group.entries.splice(found.index, 1)
        writeWorldbookRaw(p.dir, s.raw)
        return json({
          preset: host.presetLabel(p),
          action,
          deleted: ref,
          revision: revisionOf(path.join(p.dir, 'worldbooks.json')),
          note: '条目已从 worldbooks.json 删除，下一轮注入即不含它。'
        })
      }

      if (action === 'add') {
        if (!title) return 'add 需要 title。'
        if (content === undefined) return 'add 需要 content。'
        const wanted = str(args.group).trim()
        let group = wanted ? groups.find((g) => str(g.name).trim() === wanted) : groups[0]
        let created = false
        if (!group) {
          group = { name: wanted || '新增组', enabled: true, entries: [] }
          groups.push(group)
          created = true
        }
        if (!Array.isArray(group.entries)) group.entries = []
        const entry = {
          name: title,
          comment: str(args.comment),
          keys: keys || [],
          keywords: keys || [],
          content,
          enabled: args.enabled !== false
        }
        group.entries.push(entry)
        writeWorldbookRaw(p.dir, s.raw)
        const injected = s.raw.value.injectMode === 'full' || (keys && keys.length)
        return json({
          preset: host.presetLabel(p),
          action,
          ref: `${group.name}#${group.entries.length}`,
          group: str(group.name),
          groupCreated: created,
          revision: revisionOf(path.join(p.dir, 'worldbooks.json')),
          note: (keys && keys.length)
            ? '已同时写入 keys 与 keywords（与面板的并集匹配一致）；关键词被最近消息命中时才会注入。'
            : (injected
              ? '未给 keys：当前是 full 模式，该条目会常驻注入。'
              : '未给 keys 且当前是 keyword 模式：这条永远不会被注入，等于白写 —— 建议补 keys 或把模式改成 full。')
        })
      }

      let target = ref ? locate(groups, ref) : null
      if (!target && title) {
        for (const group of groups) {
          const entries = Array.isArray(group.entries) ? group.entries : []
          const index = entries.findIndex((e) => str(e.name || e.comment).trim() === title)
          if (index >= 0) { target = { group, entry: entries[index], index }; break }
        }
      }
      if (!target) {
        return `update 需要 ref，或一个能唯一匹配的 title。先用 tavern_worldbook 确认真实 ref（形如「组名#3」）；当前给的是 ref=${ref || '空'} title=${title || '空'}。`
      }
      const entry = target.entry
      const changed = []
      if (content !== undefined) { entry.content = content; changed.push(`content(${content.length}字)`) }
      if (keys !== undefined) { entry.keys = keys; entry.keywords = keys; changed.push(`keys(${keys.length}个)`) }
      if (typeof args.comment === 'string') { entry.comment = args.comment; changed.push('comment') }
      if (typeof args.enabled === 'boolean') { entry.enabled = args.enabled; changed.push(`enabled=${args.enabled}`) }
      if (typeof args.name === 'string' && args.name.trim()) { entry.name = args.name.trim(); changed.push(`name=${args.name.trim()}`) }
      if (!changed.length) return '没有任何字段被修改：请给 content / keys / comment / enabled / name 之一。'
      writeWorldbookRaw(p.dir, s.raw)
      return json({
        preset: host.presetLabel(p),
        action: 'update',
        ref: `${target.group.name}#${target.index + 1}`,
        changed,
        revision: revisionOf(path.join(p.dir, 'worldbooks.json')),
        note: '已写入 worldbooks.json；面板每轮组装提示词时现读该文件，**下一轮即生效**。'
      })
    }
  }
}

function presetTools(host) {
  function collect(modules) {
    const out = []
    modules.forEach((group, gi) => {
      const list = Array.isArray(group.modules) ? group.modules : []
      list.forEach((mod, mi) => {
        out.push({ ref: `${gi}#${mi}`, gi, mi, group: str(group.name), mod })
      })
    })
    return out
  }

  return {
    preset: (args, exec) => {
      const p = host.needPreset(args, exec)
      if (p.error) return p.error
      const modules = readPresetModules(p.dir)
      const items = collect(modules)
      const ref = str(args.ref).trim()
      const wanted = str(args.name).trim()
      if (!ref && !wanted) {
        return json({
          preset: host.presetLabel(p),
          revision: revisionOf(path.join(p.dir, 'presets.json')),
          groups: modules.length,
          modules: items.map((item) => ({
            ref: item.ref,
            group: item.group,
            name: str(item.mod.name),
            enabled: item.mod.enabled !== false,
            chars: str(item.mod.content).length
          })),
          note: '启用中的模块与角色卡、世界书一起进系统提示（面板 cardTextFor 把每个模块截到 3000 字）。给 ref 或 name 读全文。'
        })
      }
      const hit = items.find((item) => (ref && item.ref === ref) || (wanted && str(item.mod.name).trim() === wanted))
      if (!hit) return `找不到模块（ref=${ref || '—'} name=${wanted || '—'}）。不带参数调用本工具可列出全部。`
      const content = str(hit.mod.content)
      return json({
        preset: host.presetLabel(p),
        ref: hit.ref,
        group: hit.group,
        name: str(hit.mod.name),
        enabled: hit.mod.enabled !== false,
        chars: content.length,
        truncated: content.length > 8000,
        content: content.length > 8000 ? `${content.slice(0, 8000)}\n…（已截断）` : content
      })
    },

    presetUpdate: (args, exec) => {
      const p = host.needPreset(args, exec)
      if (p.error) return p.error
      const file = path.join(p.dir, 'presets.json')
      const current = revisionOf(file)
      if (args.expectedRevision && str(args.expectedRevision) !== current) {
        return `修订号不匹配（当前 ${current}）。请重新 tavern_preset 读取后再改。`
      }
      const modules = readPresetModules(p.dir)
      const items = collect(modules)
      const ref = str(args.ref).trim()
      const wanted = str(args.name).trim()
      const hit = items.find((item) => (ref && item.ref === ref) || (wanted && str(item.mod.name).trim() === wanted))
      if (!hit) return `找不到要改的模块（ref=${ref || '—'} name=${wanted || '—'}）。`
      const changed = []
      if (typeof args.content === 'string') { hit.mod.content = args.content; changed.push(`content(${args.content.length}字)`) }
      if (typeof args.enabled === 'boolean') { hit.mod.enabled = args.enabled; changed.push(`enabled=${args.enabled}`) }
      if (str(args.newName).trim()) { hit.mod.name = str(args.newName).trim(); changed.push(`name=${str(args.newName).trim()}`) }
      if (!changed.length) return '没有字段被修改：请给 content / enabled / newName 之一。'
      writePresetModules(p.dir, modules)
      return json({
        preset: host.presetLabel(p),
        ref: hit.ref,
        changed,
        revision: revisionOf(file),
        note: '已写入 presets.json；下一轮组装提示词时即生效。不改 agent.cordis.yml（那是面板「保存预设」的产物）。'
      })
    },

    memory: (args, exec) => {
      const sessionId = host.sessionIdOf(exec)
      if (!sessionId) return '拿不到会话 id，无法定位会话记忆。'
      const memory = readSessionMemory(host.dshHome, sessionId)
      const relations = readSessionRelations(host.dshHome, sessionId)
      const dataDir = path.join(host.dshHome, 'tavern-data', 'sessions', sessionId)
      return json({
        sessionId,
        dataDir,
        hasMemory: memory.trim().length > 0,
        memoryChars: memory.length,
        memory,
        relations: relations || null,
        note: '这是**只读**视图：面板在每轮把 memory.md 里的「# 记忆总结」段落注入系统提示，' +
          '关系网由总结流程自动提取。要改记忆请用面板的「总结/编辑记忆」，不要在对话里直接改文件 —— ' +
          '本工具特意不提供写入，避免与面板的自动总结互相覆盖。'
      })
    }
  }
}

// ── 插件主体 ────────────────────────────────────────────────
export function apply(ctx) {
  const host = createHost(ctx)
  const cards = cardTools(host)
  const worldbook = worldbookTools(host)
  const preset = presetTools(host)
  const background = backgroundTools(host)

  const definitions = [
    textTool({
      name: 'tavern_card',
      description:
        '读角色卡。不带参数=列出当前预设的全部角色卡（下标/名字/是否启用/实际注入字数）；给 name 或 index=读出该卡全部字段。' +
        '改卡前必须先读一次，把返回的 revision 交给 tavern_card_update。' +
        '注入只使用 desc/first/text/content 四个字段（面板 cardTextFor 决定），其余字段（如 personality/scenario）读了可见但不参与注入。',
      parameters: {
        name: P.str('角色卡名字（定位键，精确匹配）。'),
        index: P.int('按下标定位（从 0 开始）；与 name 二选一。'),
        presetId: P.presetId()
      },
      isConcurrencySafe: () => true,
      execute: cards.card
    }),
    textTool({
      name: 'tavern_card_update',
      description:
        '修改当前预设里某张角色卡的字段（值必须是字符串）。写入 characters.json，面板下一轮组装提示词时即生效，历史消息不变。' +
        '必须带 expectedRevision（来自最近一次 tavern_card）；修订号不符说明卡片被改过，会拒绝写入，请重读后再改。' +
        '不要尝试在这里改 persona 段（agent.cordis.yml）——那是面板「保存预设」的产物。',
      parameters: {
        name: P.str('要改的卡名（与 index 二选一）。'),
        index: P.int('要改的卡下标（从 0 开始）。'),
        fields: P.freeObject('要写入的字段，例如 {"desc":"新的角色设定"}；只改给出的字段，值必须是字符串。'),
        rename: P.str('可选：同时改名（需在全预设内唯一）。'),
        expectedRevision: P.str('必填：最近一次 tavern_card 返回的 revision。'),
        presetId: P.presetId()
      },
      execute: cards.cardUpdate
    }),
    textTool({
      name: 'tavern_card_copy',
      description: '复制一张角色卡为独立副本（默认继承启用状态），用于「改写成另一个版本」而不动原卡。',
      parameters: {
        name: P.str('源卡名字。'),
        index: P.int('源卡下标；与 name 二选一。'),
        newName: P.str('新卡名字；省略时叫「原名·副本」。'),
        expectedRevision: P.str('最近一次 tavern_card 返回的 revision。'),
        presetId: P.presetId()
      },
      execute: cards.cardCopy
    }),
    textTool({
      name: 'tavern_card_validate',
      description:
        '静态体检当前预设的角色卡：缺名/重名/注入字段全空/含会被清理的 ST 宏/被禁用。只读，不改任何文件。' +
        '改完卡后跑一次，能提前发现「改了但注入不出来」这类问题。',
      parameters: { presetId: P.presetId() },
      isConcurrencySafe: () => true,
      execute: cards.cardValidate
    }),
    textTool({
      name: 'tavern_card_import',
      description:
        '导入 SillyTavern 角色卡（PNG 或 JSON 文件）：source=文件路径，或 cardJson=卡 JSON 原文。' +
        '面板导入只保留 name/desc/first，会丢掉 scenario/mes_example/system_prompt/post_history_instructions/alternate_greetings/卡级正则；' +
        '本工具把这些分区按 ST 组装顺序折进 desc（面板唯一注入的正文段），把原始卡完整归档到预设目录的 st-sources/，' +
        '内嵌世界书写进 worldbooks.json，备选开场白展开成同设定的禁用伴生卡。' +
        '不执行卡内脚本、不改 agent.cordis.yml。写 characters.json，下一轮回复即生效。',
      parameters: {
        source: P.str('角色卡文件路径（.png 或 .json）。与 cardJson 二选一。'),
        cardJson: P.str('角色卡 JSON 原文（也认 base64 编码的 JSON）。与 source 二选一。'),
        name: P.str('覆盖卡名；省略时用卡里的 name。卡名是定位键。'),
        enabled: P.bool('导入后是否启用，默认 true。'),
        altGreetings: P.enum('备选开场白处理：companion-cards=展开成禁用伴生卡（默认，可随时启用换开场）；archive=只归档不建卡。', ['companion-cards', 'archive']),
        worldbook: P.enum('内嵌世界书处理：import=写进 worldbooks.json（默认）；skip=不导入。', ['import', 'skip']),
        globalRegex: P.enum('卡级正则脚本处理：report=只报告（默认，避免全局正则悄悄影响所有会话）；import=直接写进 muv-engine 全局正则库；skip=忽略。', ['report', 'import', 'skip']),
        archive: P.bool('是否把原始卡归档到 st-sources/，默认 true（卡里没被映射的字段靠它不丢）。'),
        expectedRevision: P.str('最近一次 tavern_card 返回的 revision。'),
        presetId: P.presetId()
      },
      execute: cards.cardImport
    }),
    textTool({
      name: 'tavern_card_append',
      description:
        '往角色卡 desc **追加**一段文本（幂等，不整体替换）。' +
        '这是给「把某段输出契约/规则补到另一张卡上」用的：tavern_card_update 是整体替换 desc，' +
        '拿它去追加必须先把全文读出来再拼回，容易静默截断。' +
        '幂等靠 marker：desc 里已出现该标记就**不写**。' +
        '两种来源：text=直接给文本；或 packPath + packVariant=从契约包里取（自动用包里的 idempotencyMarker）。' +
        '先 dryRun=true 预览，确认后再写。只改 desc 一个字段，下一轮生效。',
      parameters: {
        name: P.str('目标卡名。'),
        index: P.int('目标卡下标（与 name 二选一）。'),
        text: P.str('要追加的文本。与 packPath 二选一。'),
        packPath: P.str('契约包 JSON 路径（形如 D:\\DSH\\dnd-plugin\\contract\\machine-blocks-pack.json）。'),
        packVariant: P.enum('契约包里的变体，默认 generic。', ['generic', 'dnd']),
        marker: P.str('幂等标记；省略时用追加文本的首行，或契约包里的 idempotencyMarker。'),
        dryRun: P.bool('只预览会追加什么，不写入。建议先跑一次。'),
        expectedRevision: P.str('最近一次 tavern_card 返回的 revision。'),
        presetId: P.presetId()
      },
      execute: cards.cardAppend
    }),
    textTool({
      name: 'tavern_worldbook',
      description:
        '查阅世界书（本工具专补面板缺的那一环：**主动读取未被自动注入的条目**）。' +
        '不带参数=列出全部组与条目（ref、触发词、是否启用、字数）；给 query=按关键词检索并返回片段；给 refs=按条目读完整原文（最多 10 条）；给 group=读某组。' +
        'ref 形如「组名#3」。改写条目用 tavern_worldbook_update，务必带上这里的 revision。',
      parameters: {
        query: P.str('关键词：检索全部条目（不受「最近消息命中」限制）。'),
        refs: P.strList('条目编号，最多 10 条：读完整原文。'),
        group: P.str('组名：只列该组。'),
        includeDisabled: P.bool('检索时是否包含已禁用条目，默认 false。'),
        offset: P.int('检索偏移，默认 0。'),
        limit: P.int('检索返回条数 1~10（默认 5）；列组时是每组条目上限 1~200（默认 40）。'),
        presetId: P.presetId()
      },
      isConcurrencySafe: () => true,
      execute: worldbook.worldbook
    }),
    textTool({
      name: 'tavern_worldbook_update',
      description:
        '增/改/删世界书条目：action=add（需 title+content；keys 决定是否关键词触发）、update（改 content/keys/comment/enabled/name）、delete（按 ref 删）。' +
        '用 ref 或唯一的 title 定位。写入 worldbooks.json，下一轮注入即生效。keys 与 keywords 会同时写入（与面板的并集匹配一致）。' +
        '改写前必须带 expectedRevision（来自最近一次 tavern_worldbook）。',
      parameters: {
        action: P.enum('操作类型，默认 update。', ['add', 'update', 'delete']),
        ref: P.str('目标条目编号，形如「组名#3」。'),
        group: P.str('add 时的目标组名；不存在会新建。'),
        title: P.str('add 必填：条目标题；update 时可作为定位键。'),
        name: P.str('update 时的新标题。'),
        comment: P.str('备注（面板列表显示）。'),
        keys: P.strList('触发关键词；keyword 模式下没有触发词的条目不会被注入。'),
        content: P.str('条目正文。'),
        enabled: P.bool('是否启用。'),
        expectedRevision: P.str('改写前必填：最近一次读取返回的 revision。'),
        presetId: P.presetId()
      },
      execute: worldbook.worldbookUpdate
    }),
    textTool({
      name: 'tavern_preset',
      description:
        '读预设模块（破限词条 / 风格模块）。不带参数=列出全部模块（ref、组、名字、是否启用、字数）；给 ref 或 name=读该模块正文。' +
        '启用中的模块会和角色卡、世界书一起进系统提示（每个模块截到 3000 字）。',
      parameters: {
        ref: P.str('模块编号，形如「0#3」。'),
        name: P.str('模块名字。'),
        presetId: P.presetId()
      },
      isConcurrencySafe: () => true,
      execute: preset.preset
    }),
    textTool({
      name: 'tavern_preset_update',
      description: '改预设模块：content（正文）/ enabled（启用开关）/ newName（改名）。用 ref 或唯一 name 定位。写入 presets.json，下一轮即生效。',
      parameters: {
        ref: P.str('模块编号，形如「0#3」。'),
        name: P.str('模块名字（唯一时可用）。'),
        newName: P.str('改名。'),
        content: P.str('新的模块正文。'),
        enabled: P.bool('是否启用。'),
        expectedRevision: P.str('改写前必填：来自 tavern_preset 的 revision。'),
        presetId: P.presetId()
      },
      execute: preset.presetUpdate
    }),
    textTool({
      name: 'tavern_memory',
      description:
        '只读查看本会话的记忆总结与关系网（面板生成、面板注入）。用于确认「AI 到底记住了什么」、排查记忆与剧情不一致。' +
        '不提供写入：记忆由面板的总结流程维护，模型直接改会与自动总结互相覆盖。',
      parameters: {},
      isConcurrencySafe: () => true,
      execute: preset.memory
    }),
    textTool({
      name: 'tavern_background_run',
      description:
        '后台推演：另起一条**独立会话**跑一轮模型推演，把产出拿回来（NPC 私下行动、势力幕后推进、玩家看不见的时间线）。' +
        '上下文由本工具现读组装：当前预设的启用卡 + 按 task 关键词命中的世界书条目，独立系统提示，不给工具，跑完即销毁会话。' +
        '这不是本会话的正文，而是幕后事实素材：需要留档就用 tavern_worldbook_update 写进世界书。会消耗模型额度。',
      parameters: {
        task: P.str('要推演什么（必填）。写得越具体越好，例如「推演今夜三个势力各自的行动与留下的痕迹」。', true),
        cardName: P.str('用哪张启用卡做设定来源；省略时用第一张启用卡。'),
        worldbook: P.enum('世界书注入方式：keyword=按 task 关键词检索（默认）；all=全部启用条目（可能很大）；skip=不注入。', ['keyword', 'all', 'skip']),
        worldbookLimit: P.int('keyword 模式取前几条，1~40，默认 12。'),
        maxContextChars: P.int('系统提示里的设定资料上限字数，2000~60000，默认 12000。'),
        timeoutMs: P.int('超时毫秒，10000~900000，默认 180000。'),
        model: P.str('可选：覆盖模型（如 provider/model）。省略时用宿主默认。'),
        presetId: P.presetId()
      },
      execute: (args, exec) => background.bgRun(args, exec)
    }),
    textTool({
      name: 'compact_context',
      description:
        '压缩本会话上下文：把较早历史压成一条摘要（近期对话与记忆档保留），长会话续命手段。' +
        '**申请制：先向玩家发起申请（如「记忆已归档，申请压缩上下文」），玩家同意后才调用本工具**，未获同意调用＝违规。' +
        '时机（照世界书「树根·工具·骰子·记忆」）：每 10~20 轮记忆归档写完之后申请；比赛中不申请不压缩，等终场、赛后归档写完再提。' +
        '返回「已压缩 N 条（约 M tokens）」或「已排队（本轮结束后执行，正常）」或失败原因。',
      parameters: {},
      isConcurrencySafe: () => false,
      timeoutMs: 180000,
      execute: async (_args, exec) => {
        const compaction = typeof ctx.get === 'function' ? ctx.get('compaction') : null
        if (!compaction || typeof compaction.compactNow !== 'function') {
          return '当前环境没有挂载压缩服务（compaction-basic/ctx.compaction），无法压缩；可让玩家在输入框发 /compact 手动触发。'
        }
        const signal = (exec && exec.signal) || AbortSignal.timeout(180000)
        try {
          const result = await compaction.compactNow(exec && exec.agent, signal)
          if (result == null) return '压缩服务返回空结果：当前没有可安全压缩的范围（可能已排队，本轮结束后执行；或历史太短无需压缩）。'
          const items = result.shadowedItemCount ?? result.items ?? result.replacedItemCount ?? '?'
          const tokens = result.shadowedTokenCount ?? result.tokens ?? '?'
          return `上下文压缩完成：替换 ${items} 条历史（约 ${tokens} tokens）。` +
            '按记忆档无缝继续即可，禁止向玩家复述剧情来衔接。'
        } catch (error) {
          const code = error && error.code
          if (code === 'busy') return '压缩请求被排队：当前有进行中的轮次，压缩将在本轮结束后自动执行（正常，无需重试）。'
          return `压缩失败${code ? `（${code}）` : ''}：${error && error.message ? error.message : String(error)}`
        }
      }
    })
  ]

  const registered = []
  const failed = []
  ctx.effect(() => {
    for (const definition of definitions) {
      try {
        ctx.tools.register(definition)
        registered.push(definition.name)
      } catch (error) {
        failed.push(`${definition.name}: ${error && error.message ? error.message : error}`)
        ctx.logger?.warn?.(`[tavern-tools] 注册 ${definition.name} 失败：${error && error.message}`)
      }
    }
    ctx.logger?.info?.(`[tavern-tools] 已注册 ${registered.length} 个工具：${registered.join(', ')}` +
      (failed.length ? `；失败 ${failed.length} 个：${failed.join('；')}` : ''))
  }, 'tavern-tools: agent tools')
}
