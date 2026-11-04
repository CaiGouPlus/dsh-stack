// 酒馆工具层 —— 后台推演 Agent
//
// 这是什么：从当前对话里**另起一个独立会话**跑一轮模型推演（NPC 私下行动、势力
// 在幕后推进、时间线在玩家看不见的地方流逝），把产出文本拿回来给主对话用。
// 在完全体里这是「后台 Agent 常驻池」；这里换一种形式实现 —— **按需起、跑完即销毁**，
// 不常驻、不占会话位、不需要它们的 agent preset。
//
// 为什么能用：这是宿主**公开的能力**，不是私有模块。DSH 自己的进程内子 agent 驱动
// 就用这条链路（见 @deepseek-ai/dsh-subagent-in-process-driver/lib/index.js:180-217：
// agents.create → child.followup(createUserMessage(...)) → await child.whenIdle() →
// finalAssistantOutput(child.session.snapshotEvents(boundary))）。
//
// ── 为什么不写进 inject ────────────────────────────────────────────────────
// `ctx.agents` 随 @deepseek-ai/dsh-agent 注册（AgentRegistry，lib/index.js:332
// `super(ctx, "agents")`）。但 inject 是**硬依赖**：一旦把 'agents' 写进 inject，
// 服务不存在时整个插件（连带 10 个酒馆工具）都起不来。所以这里用 ctx.get('agents')
// **运行时惰性取**，取不到就返回一句能读懂的话，绝不连累其它工具。
// 同一个 profile 里的 tavern-style 也是这么用 ctx.get 的（lib/host-entry.mjs:781）。
//
// ── 已验证的 API 形状（对照 .d.ts / 实现，不是猜的）────────────────────────
//   ctx.agents.create({ sessionId, parentAgent?, meta?, agentOptions?, signal?, setup? })
//     → Promise<{ agent, dispose() }>            dsh-agent/lib/types/index.d.ts
//   setup(agentCtx) 里：
//     agentCtx.systemPrompt.section({ name, order, complete, text })
//       · complete:true ⇒ 成为**唯一**的提示段（同名多段会抛错，见
//         dsh-system-prompt/lib/index.js:336）；这正是「给后台会话一张干净的卡」要的
//     agentCtx.systemPrompt.suppressRuntimeContext()
//   agent.followup(message) / agent.whenIdle() / agent.session.snapshotEvents()
//   assistant 正文：事件 type === 'assistant/message'，取 event.data.message.content[].text
//     （dsh-session/lib/index.js:221,242 —— 非 user/message 时正文在 data.message 上）

import crypto from 'node:crypto'

/**
 * 从一份会话里读事件快照。
 *
 * `session.snapshotEvents()` 在 0.2.0-rc.2 里被标了 @deprecated（但仍在用，
 * dsh-tavern 2.x 也跑在它上面）；`session.events` 是接班者。两个都试，
 * 都不在就返回空数组（调用方会给出「没有取到正文」的可读结论）。
 */
function snapshotOf(session) {
  if (!session) return []
  if (typeof session.snapshotEvents === 'function') return session.snapshotEvents()
  if (Array.isArray(session.events)) return session.events
  return []
}

/** 从一份快照事件里取最后一条 assistant 正文。 */
export function lastAssistantText(events, fromIndex = 0) {
  const slice = Array.isArray(events) ? events.slice(fromIndex) : []
  for (let i = slice.length - 1; i >= 0; i--) {
    const event = slice[i]
    if (!event || event.type !== 'assistant/message') continue
    const message = event.data && event.data.message ? event.data.message : event.data
    const parts = message && Array.isArray(message.content) ? message.content : []
    const text = parts
      .filter((p) => p && p.type === 'text' && typeof p.text === 'string')
      .map((p) => p.text)
      .join('')
    if (text.trim()) return text.trim()
  }
  return ''
}

/** 组装后台会话的系统提示：一张卡 + 一段世界书 + 任务纪律。 */
export function buildBackgroundPrompt({ cardName, cardText, worldbookText, maxChars = 12000 }) {
  const parts = [
    '【后台推演会话】',
    '你不是主对话的叙述者。你在为主对话**推演幕后**：在玩家看不到的地方，世界与 NPC 正在做什么。',
    '',
    '## 纪律',
    '- 只写幕后发生了什么：谁的什么行动、导致了什么、留下了什么可被察觉的痕迹。',
    '- 不替玩家角色行动、不写玩家角色的心理。',
    '- 不与已知设定矛盾；没有依据的细节宁可不写。',
    '- 输出**可直接并入正文的素材**：事实、动作、结果、可被发现的线索。不写「总结」「分析」「建议」。',
    '- 不要输出 markdown 标题、加粗、列表符；不要复述本提示。'
  ]
  if (cardName) {
    parts.push('', `## 当前角色卡：${cardName}`, '（用于确认人设与世界观，不要复述它）')
  }
  const budget = Math.max(1000, maxChars)
  let used = 0
  const body = []
  if (cardText && cardText.trim()) {
    const slice = cardText.trim().slice(0, Math.floor(budget * 0.5))
    body.push(slice)
    used += slice.length
  }
  if (worldbookText && worldbookText.trim()) {
    const slice = worldbookText.trim().slice(0, Math.max(0, budget - used))
    if (slice) body.push(slice)
  }
  if (body.length) parts.push('', '## 设定资料', body.join('\n\n'))
  return parts.join('\n')
}

/**
 * 造一条 user 消息。形状对齐 @deepseek-ai/dsh-llm 的 createUserMessage
 * （{...input, role:'user'} → createMessage）—— 参考驱动只传 content + source。
 * 不 import 那个包是为了不让本插件在它缺失时加载失败。
 */
export function userMessage(text) {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    content: [{ type: 'text', text: String(text) }],
    source: { kind: 'user' }
  }
}

/**
 * 跑一轮后台推演。
 *
 * @param {object} deps { agents, log }
 * @param {object} input { prompt, systemText, timeoutMs, agentOptions, cwd }
 * @returns {Promise<{ok: boolean, text?: string, error?: string, sessionId?: string}>}
 */
export async function runBackgroundTurn(deps, input) {
  const agents = deps && deps.agents
  if (!agents || typeof agents.create !== 'function') {
    return {
      ok: false,
      error: '宿主没有提供 ctx.agents 服务（@deepseek-ai/dsh-agent 未加载）。后台推演需要它。'
    }
  }
  const sessionId = `tavern-bg-${crypto.randomUUID()}`
  let handle = null
  const timer = { id: null }
  try {
    handle = await agents.create({
      sessionId,
      meta: input.cwd ? { cwd: input.cwd } : undefined,
      agentOptions: input.agentOptions,
      setup(agentCtx) {
        // 独占提示段：后台会话只该看到我们给它的卡与世界书，不该带上主会话的
        // persona / 运行时上下文（否则推演会被主对话的设定带跑）。
        try {
          agentCtx.systemPrompt.section({
            name: 'tavern:background',
            order: 0,
            complete: true,
            text: input.systemText
          })
          agentCtx.systemPrompt.suppressRuntimeContext()
        } catch (error) {
          // 拿不到提示段就退化成「有运行时上下文的后台会话」，仍然可用 —— 但不静默。
          deps.log?.('warn', `[background] 提示段设置失败，将带上运行时上下文：${error && error.message}`)
        }
        // 后台推演不需要工具：给了工具它会去查文件、搜历史，反而偏离任务。
        try {
          agentCtx.tools?.restrict?.({ allow: [] })
        } catch (error) {
          deps.log?.('warn', `[background] tools.restrict 失败（会话将持有默认工具）：${error && error.message}`)
        }
      }
    })
    const agent = handle && handle.agent
    if (!agent) return { ok: false, error: 'agents.create 没有返回 agent。' }

    const before = snapshotOf(agent.session).length
    agent.followup(userMessage(input.prompt))

    const timeoutMs = Number.isFinite(input.timeoutMs) ? input.timeoutMs : 180000
    const timeout = new Promise((_, reject) => {
      timer.id = setTimeout(() => reject(new Error(`后台推演超过 ${Math.round(timeoutMs / 1000)} 秒未结束`)), timeoutMs)
    })
    await Promise.race([agent.whenIdle(), timeout])

    const events = snapshotOf(agent.session)
    const text = lastAssistantText(events, before)
    return text
      ? { ok: true, text, sessionId, events: events.length - before }
      : { ok: false, error: '后台会话跑完了，但没有取到 assistant 正文（可能是空回复或被中断）。', sessionId }
  } catch (error) {
    return { ok: false, error: `后台推演失败：${error && error.message ? error.message : error}`, sessionId }
  } finally {
    if (timer.id) clearTimeout(timer.id)
    // 跑完即销毁：不常驻、不占会话位。dispose 失败不该盖掉上面的结果。
    try {
      if (handle && typeof handle.dispose === 'function') await handle.dispose()
    } catch (error) {
      deps.log?.('warn', `[background] 后台会话销毁失败（可能残留一个会话）：${error && error.message}`)
    }
  }
}
