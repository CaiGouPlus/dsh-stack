// 新会话工具层 —— 让模型自己开一个新对话，并在会话「出生」时选定 agent 预设；
// 还能往任意会话里**发一条消息**（替用户把第一句说掉，或给某个会话补一句话）。
//
// 为什么需要它：DSH 的 agent 预设只能在会话第一轮开始之前绑定（`agentPresets.select`
// 带 turnBoundary 闸门，开跑之后锁死），而模型此前没有任何能建会话的工具：
//   · 任务看板本来是唯一通路，但 DSH 0.2.1 起 `typertGateway.invoke` 的 `peer`
//     是必填项（InvokeRemoteRequest.peer: PeerScope），看板 0.4.6 调用时没传，
//     一进网关就抛 "Cannot read properties of undefined (reading 'signal')"，
//     连不带预设的对照卡也建不出会话。
// 本插件改走宿主服务 `sessionController.create()` / `prompt()` —— 进程内直接调用，
// 不经网关，因此不受那个 peer 变更影响。
//
// 三个工具：
//   chat_presets()                     读预设名册（id/名字/描述/是否默认/是否坏掉）
//   new_chat({ preset?, cwd? })        建一个空白会话，绑定预设；不发第一句话
//   chat_say({ sessionId, text })      往指定会话发一条用户消息（= 在那个会话里说话）
//
// 设计约束（刻意为之）：
//   · `new_chat` 只建空白会话 —— 酒馆预设的开场、注入、总结都按「第一轮」触发，
//     默认不抢跑；要替用户开口就显式再调 `chat_say`，两步分开、不藏着掖着。
//   · 位置优先跟随调用者所在工作区（这样新会话出现在同一个侧栏分组里），
//     拿不到工作区才退回当前目录。
//   · 预设名支持「id / 显示名 / 子串」三级匹配；匹配不上或有歧义就明确报候选，
//     绝不静默换成默认预设 —— 用错预设开一局，等于整场数据作废。

import { randomUUID } from 'node:crypto'

import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'new-chat'
export const inject = ['tools']

// 宿主的 parameters 不是 JSON Schema，而是「属性名 → 值规格」的映射；
// 每个规格只认 type/enum/const/description/title/default/examples 与 required: true。
const P = {
  str: (description, required = false) => ({
    type: 'string',
    description,
    ...(required ? { required: true } : {})
  })
}

const json = (value) => JSON.stringify(value, null, 2)

/** 宿主服务读取：服务不存在时返回 undefined，绝不让插件挂掉。 */
function svc(ctx, key) {
  try {
    const value = typeof ctx.get === 'function' ? ctx.get(key) : undefined
    if (value !== undefined) return value
  } catch {}
  return undefined
}

function errorText(error) {
  if (!error) return '未知错误'
  const code = error.code ? `（${error.code}）` : ''
  const message = error.message ? error.message : String(error)
  return `${message}${code}`
}

function sessionIdOf(exec) {
  const session = exec && exec.agent && exec.agent.session
  return session && typeof session.id === 'string' ? session.id : ''
}

/** 统一的输出契约：宿主校验 schema，render 把字符串原样交给模型。 */
function textTool(options) {
  return defineTool({
    name: options.name,
    description: options.description,
    parameters: options.parameters || {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: typeof value === 'string' ? value : json(value) }]
    },
    isConcurrencySafe: options.isConcurrencySafe || (() => false),
    execute: options.execute
  })
}

/** 预设名册：remoteExportList 带 isDefault；老装配退回 list + resolve。 */
async function readRoster(ctx) {
  const presets = svc(ctx, 'agentPresets')
  if (presets === undefined) {
    return { error: '当前装配没有 agentPresets 服务，读不到预设名册。' }
  }
  try {
    if (typeof presets.remoteExportList === 'function') {
      const roster = await presets.remoteExportList()
      return { presets: Array.isArray(roster && roster.presets) ? roster.presets : [] }
    }
    const rows = await presets.list()
    let defaultId = ''
    try {
      defaultId = (await presets.resolve()).id
    } catch {}
    return {
      presets: (Array.isArray(rows) ? rows : []).map((row) => ({ ...row, isDefault: row.id === defaultId }))
    }
  } catch (error) {
    return { error: `读预设名册失败：${errorText(error)}` }
  }
}

function presetLabel(row) {
  const name = row.name ? row.name : row.id
  const marks = [row.isDefault ? '默认' : '', row.broken ? '不可用' : ''].filter(Boolean)
  return marks.length === 0 ? `${name}（${row.id}）` : `${name}（${row.id}，${marks.join('、')}）`
}

function presetLine(row) {
  const description = row.description ? `${row.description}` : ''
  return `- ${presetLabel(row)}${description ? `：${description}` : ''}`
}

/**
 * 三级匹配：id 精确 → 显示名精确 → id/显示名子串。
 * @returns {{ok:true,row:object}|{ok:false,reason:'missing'|'ambiguous',candidates:object[]}}
 */
function matchPreset(rows, wanted) {
  const raw = String(wanted || '').trim()
  const needle = raw.toLowerCase()
  if (needle === '') return { ok: false, reason: 'missing', candidates: rows }

  const byId = rows.find((row) => String(row.id).toLowerCase() === needle)
  if (byId) return { ok: true, row: byId }

  const byName = rows.find((row) => String(row.name || '').trim().toLowerCase() === needle)
  if (byName) return { ok: true, row: byName }

  const loose = rows.filter(
    (row) =>
      String(row.id).toLowerCase().includes(needle) ||
      String(row.name || '').toLowerCase().includes(needle) ||
      needle.includes(String(row.name || '').trim().toLowerCase() || '\u0000')
  )
  if (loose.length === 1) return { ok: true, row: loose[0] }
  if (loose.length === 0) return { ok: false, reason: 'missing', candidates: rows }
  return { ok: false, reason: 'ambiguous', candidates: loose }
}

/** 调用者所在的工作区：新会话挂进去才会出现在同一个侧栏分组。 */
function workspaceOf(ctx, sessionId) {
  if (!sessionId) return ''
  const registry = svc(ctx, 'workspaceRegistry')
  if (!registry || typeof registry.list !== 'function') return ''
  try {
    const workspaces = registry.list() || []
    const hit = workspaces.find(
      (workspace) => Array.isArray(workspace.sessionIds) && workspace.sessionIds.includes(sessionId)
    )
    return hit && typeof hit.id === 'string' ? hit.id : ''
  } catch {
    return ''
  }
}

/**
 * 给刚建好的会话补一条 `agent-preset/selected` 事件。
 *
 * 为什么必须有：酒馆面板的注入决议（tavern/lib/index.js `pickAuthoritativePresetFromLog`）
 * 只认「用户显式选择（agent-preset/selected）」与「面板绑定记账」两条；
 * 会话**出生时**挂的预设（header.agentPreset）被刻意排除 —— 那是防止静默注入的历史修复。
 * 于是「带预设出生」的会话在面板眼里等于「没选预设」：不注入角色卡/世界书。
 * 而 DSH 的顶部选择器对「已经用同一预设组装好」的会话不会补写这条事件
 * （select() 判定 composition 未变 ⇒ nothing logged），用户自己也没法补。
 *
 * 所以创建方补写：这正是 DSH 自己在 reuseSetup 里对空白会话做的事
 * （`agent.session.append("agent-preset/selected", { agentPreset })`），语义是
 * 「本会话运行这个预设」，不改变已经组装好的 composition。
 */
function markPresetSelected(ctx, sessionId, presetId) {
  if (!sessionId || !presetId) return false
  const agents = svc(ctx, 'agents')
  if (!agents || typeof agents.get !== 'function') return false
  try {
    const agent = agents.get(sessionId)
    const session = agent && agent.session
    if (!session || typeof session.append !== 'function') return false
    session.append('agent-preset/selected', { agentPreset: presetId })
    return true
  } catch {
    return false
  }
}

// ── 等回合/读正文（chat_run 用） ─────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 活会话的事件数组；会话不在本进程（冷会话）返回 null。 */
function liveLog(ctx, sessionId) {
  const agents = svc(ctx, 'agents')
  const agent = agents && typeof agents.get === 'function' ? agents.get(sessionId) : undefined
  const log = agent && agent.session && agent.session.log
  return Array.isArray(log) ? log : null
}

function lastSeqOf(events) {
  let max = 0
  for (const event of events || []) {
    if (event && typeof event.seq === 'number' && event.seq > max) max = event.seq
  }
  return max
}

/** 一轮里的最终正文：取窗口内最后一条有文本的 assistant/message（工具调用步骤是空的）。 */
function assistantTextOf(events) {
  let text = ''
  for (const event of events || []) {
    if (!event || event.type !== 'assistant/message') continue
    const message = event.data && event.data.message
    const content = (message && message.content) || []
    const piece = content
      .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('')
    if (piece.trim() !== '') text = piece
  }
  return text
}

/** 调用者当前目录：拿不到工作区时用它给新会话定位。 */
function currentCwd(ctx, exec) {
  const workingDirectory = svc(ctx, 'workingDirectory')
  const session = exec && exec.agent && exec.agent.session
  if (!workingDirectory || !session || typeof workingDirectory.get !== 'function') return ''
  try {
    return workingDirectory.get(session) || ''
  } catch {
    return ''
  }
}

export function apply(ctx) {
  const definitions = [
    textTool({
      name: 'chat_presets',
      description:
        '读这台机器上可选的 agent 预设名册（酒馆预设 / DND / 创作 / 文风实验室等）：' +
        '返回 id、显示名、描述、是否默认、是否不可用。' +
        '要开新对话、换预设重开、或用户问「有哪些预设」时先调它；不要凭记忆猜预设 id。',
      parameters: {},
      isConcurrencySafe: () => true,
      execute: async () => {
        const roster = await readRoster(ctx)
        if (roster.error) return roster.error
        if (roster.presets.length === 0) return '这台机器上没有声明任何 agent 预设。'
        const lines = roster.presets.map(presetLine)
        return `可选预设 ${roster.presets.length} 个：\n${lines.join('\n')}`
      }
    }),

    textTool({
      name: 'new_chat',
      description:
        '新建一个空白会话（新对话），并在它出生时就绑定指定的 agent 预设。' +
        '只建会话、不发第一句话；要不要替用户开口是单独一步（再用 chat_say 发第一句）。' +
        '默认落在当前对话所在的工作区，出现在同一个侧栏分组里。' +
        '预设只能在第一轮之前绑定：会话一旦开跑就再也换不了预设，所以「换预设重开」永远走这个工具，不要试图改已有会话。' +
        '预设名可以给 id，也可以给显示名（如「足球」「DND·无尽冒险」）；系统会三级匹配，' +
        '匹配不上或有歧义会返回候选列表，照候选再调一次即可。',
      parameters: {
        preset: P.str('预设：id（如 tavern-lite）或显示名（如「足球」）。省略 = 用部署默认预设。'),
        cwd: P.str('可选的目录：新会话的工作目录。省略时跟随当前对话所在工作区；只有用户明确要求换目录时才传。')
      },
      isConcurrencySafe: () => false,
      execute: async (args, exec) => {
        const controller = svc(ctx, 'sessionController')
        if (controller === undefined || typeof controller.create !== 'function') {
          return '当前装配没有 sessionController 服务，无法新建会话（这是部署问题，不是参数问题）。'
        }

        const roster = await readRoster(ctx)
        if (roster.error) return roster.error

        const wanted = typeof args.preset === 'string' ? args.preset.trim() : ''
        let presetRow
        if (wanted !== '') {
          const matched = matchPreset(roster.presets, wanted)
          if (!matched.ok) {
            const head =
              matched.reason === 'ambiguous'
                ? `「${wanted}」匹配到多个预设，请挑一个再调一次：`
                : `没有叫「${wanted}」的预设。现有预设：`
            return `${head}\n${matched.candidates.map(presetLine).join('\n')}`
          }
          presetRow = matched.row
          if (presetRow.broken) {
            return `预设「${presetRow.name || presetRow.id}」当前不可用：${presetRow.broken}`
          }
        } else {
          presetRow = roster.presets.find((row) => row.isDefault === true)
        }

        const callerSessionId = sessionIdOf(exec)
        const workspaceId = workspaceOf(ctx, callerSessionId)
        const cwd = workspaceId === '' ? String(args.cwd || '').trim() || currentCwd(ctx, exec) : ''

        const request = {
          ...(workspaceId !== '' ? { workspaceId } : cwd !== '' ? { cwd } : {}),
          ...(presetRow && presetRow.id ? { agentPreset: presetRow.id } : {})
        }

        try {
          const created = await controller.create(request)
          const sessionId = created && created.sessionId ? created.sessionId : ''
          const boundPreset = (created && created.agentPreset) || (presetRow && presetRow.id) || '（部署默认）'
          const presetName = presetRow && presetRow.name ? `${presetRow.name}（${boundPreset}）` : boundPreset
          // 把「显式选用该预设」写进会话事件流：否则酒馆面板会把这条会话当成「没选预设」，不注入卡/世界书。
          const marked = presetRow && presetRow.id ? markPresetSelected(ctx, sessionId, presetRow.id) : false
          return [
            '已新建空白会话。',
            `- 会话 id：${sessionId || '（宿主未返回 id）'}`,
            `- 绑定预设：${presetName}`,
            `- 位置：${workspaceId !== '' ? `工作区 ${workspaceId}` : cwd !== '' ? `目录 ${cwd}` : '部署默认目录'}`,
            `- 预设选择标记：${marked ? '已写入 agent-preset/selected（面板会据此注入）' : '未写入（宿主没给到该会话的 Agent，注入可能不生效）'}`,
            '',
            '这个会话目前是空白的。要替用户先开口，紧接着调 chat_say（sessionId 用上面这个 id）发第一句；' +
              '不调就由用户自己进去说第一句。'
          ].join('\n')
        } catch (error) {
          const hint =
            error && error.code === 'agent-preset/not-found'
              ? `\n可用预设：\n${roster.presets.map(presetLine).join('\n')}`
              : ''
          return `新建会话失败：${errorText(error)}${hint}`
        }
      }
    }),

    textTool({
      name: 'chat_say',
      description:
        '往指定会话里发一条消息（以用户身份发言，让那个会话用它自己绑定的预设回一轮）。' +
        '只投递、不等回复；要连回复一起拿（文风测试 / 开场抓取）就用 chat_run。' +
        '典型用法：给某个正在进行的会话补一句话，不需要同步读回。' +
        '只对**别的**会话使用，不要拿它对自己当前会话说话（那等于自问自答）。' +
        '按队列投递：目标会话正在跑回合时排在后面，不会打断。',
      parameters: {
        sessionId: P.str('目标会话 id（new_chat 返回的那个，形如 session-xxxxxxxx-…）。', true),
        text: P.str('要发进那个会话的正文：用户口吻的一句话。', true)
      },
      isConcurrencySafe: () => false,
      execute: async (args) => {
        const controller = svc(ctx, 'sessionController')
        if (controller === undefined || typeof controller.prompt !== 'function') {
          return '当前装配没有 sessionController.prompt，发不了消息（部署问题）。'
        }
        const sessionId = String(args.sessionId || '').trim()
        const text = String(args.text || '').trim()
        if (sessionId === '') return '缺少 sessionId：先 new_chat 拿到 id，或问用户是哪一个会话。'
        if (text === '') return '缺少 text：发什么内容？'

        const requestId = `chat-say-${randomUUID()}`
        try {
          const result = await controller.prompt(
            {
              sessionId,
              requestId,
              mode: 'queue',
              content: [{ type: 'text', text }]
            },
            new AbortController().signal
          )
          return [
            `已把消息投进 ${sessionId}。`,
            `- 内容：${text}`,
            `- 受理：${result && result.accepted === true ? '已接收' : '宿主未回执 accepted'}`,
            '',
            '那个会话会用自己绑定的预设回一轮；去它自己的窗口看进展。'
          ].join('\n')
        } catch (error) {
          return `发送失败：${errorText(error)}\n（会话 id 写错 / 会话已归档 / 宿主拒绝投递都会走这里）`
        }
      }
    }),

    textTool({
      name: 'chat_run',
      description:
        '往指定会话发一条消息，**等它这一轮跑完**，把最终正文返回给你 —— 自问自答的闭环就靠它。' +
        '典型用法：文风回归测试（发题 → 拿正文 → 判读 → 改预设 → 再发题），或替用户把第一句说掉后直接看开场。' +
        '比 chat_say 多两件事：阻塞到 turn/end，并回传本轮正文（只取文本块，丢掉推理与工具标记）。' +
        '只对**别的**会话使用；对自己当前会话调用会自锁，工具会直接拒绝。' +
        '同一会话串行跑；目标正在跑别的回合时这条会排队，等待时间计入超时。',
      parameters: {
        sessionId: P.str('目标会话 id（new_chat 返回的那个）。', true),
        text: P.str('要发进那个会话的正文：用户口吻的一句话（测试命题 / 开场指令）。', true),
        timeoutMs: P.str('最多等多久，毫秒。默认 180000（3 分钟），范围 5000~600000。长回合／长文风格样本可调大。')
      },
      isConcurrencySafe: () => false,
      timeoutMs: 660000,
      execute: async (args, exec) => {
        const controller = svc(ctx, 'sessionController')
        if (controller === undefined || typeof controller.prompt !== 'function') {
          return '当前装配没有 sessionController.prompt，发不了消息（部署问题）。'
        }
        const sessionId = String(args.sessionId || '').trim()
        const text = String(args.text || '').trim()
        if (sessionId === '') return '缺少 sessionId：先 new_chat 拿到 id。'
        if (text === '') return '缺少 text：发什么内容？'
        if (sessionId === sessionIdOf(exec)) {
          return '不要对当前会话自己调用 chat_run：它会等一个由你自己产生的回合，直接自锁。请换目标会话。'
        }

        const rawTimeout = Number(args.timeoutMs)
        const waitMs = Math.max(5000, Math.min(600000, Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 180000))

        // 基线：取「发这条之前」的最后一个事件序号，之后只看新事件，避免把历史回合当成这一轮。
        let baseSeq = 0
        const live = liveLog(ctx, sessionId)
        if (live) {
          baseSeq = lastSeqOf(live)
        } else if (typeof controller.inspect === 'function') {
          try {
            const inspection = await controller.inspect(sessionId, new AbortController().signal)
            baseSeq = lastSeqOf((inspection && inspection.events) || [])
          } catch {}
        }

        const startedAt = Date.now()
        try {
          await controller.prompt(
            {
              sessionId,
              requestId: `chat-run-${randomUUID()}`,
              mode: 'queue',
              content: [{ type: 'text', text }]
            },
            new AbortController().signal
          )
        } catch (error) {
          return `发送失败：${errorText(error)}\n（会话 id 写错 / 会话已归档 / 宿主拒绝投递都会走这里）`
        }

        let events = []
        let timedOut = false
        for (;;) {
          let current = liveLog(ctx, sessionId)
          if (!current && typeof controller.inspect === 'function') {
            try {
              const inspection = await controller.inspect(sessionId, new AbortController().signal)
              current = (inspection && inspection.events) || []
            } catch {}
          }
          if (current) {
            events = current.filter((event) => event && typeof event.seq === 'number' && event.seq > baseSeq)
            const starts = events.filter((event) => event.type === 'turn/start').length
            const ends = events.filter((event) => event.type === 'turn/end').length
            if (starts > 0 && ends >= starts) break
          }
          if (Date.now() - startedAt > waitMs) {
            timedOut = true
            break
          }
          await sleep(400)
        }

        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
        const reply = assistantTextOf(events).trim()
        const toolCalls = events.filter((event) => event.type === 'tool/call').length
        const body = reply === '' ? '（这一轮没有产出正文：可能还在跑工具、被中断，或空回复；稍后可用 chat_run 再发一条，或用 session_event_read 查日志）' : reply
        const shown = body.length > 20000 ? `${body.slice(0, 20000)}\n…（已截断到 20000 字）` : body
        return [
          timedOut ? `状态：超时（等了 ${elapsed}s 仍未结束，下面正文可能不完整）` : `状态：完成（${elapsed}s）`,
          `会话：${sessionId}`,
          `本轮工具调用：${toolCalls} 次；正文：${body.length} 字`,
          '--- 回复正文 ---',
          shown
        ].join('\n')
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
        failed.push(`${definition.name}: ${errorText(error)}`)
        ctx.logger?.warn?.(`[new-chat] 注册 ${definition.name} 失败：${errorText(error)}`)
      }
    }
    ctx.logger?.info?.(
      `[new-chat] 已注册 ${registered.length} 个工具：${registered.join(', ')}` +
        (failed.length ? `；失败 ${failed.length} 个：${failed.join('；')}` : '')
    )
  }, 'new-chat: agent tools')
}
