// tavern-tools 测试 —— 后台推演（lib/background.js）
//
// 只测纯函数与**降级路径**：真起一个后台会话要模型额度，不放在单元测试里跑。
// 起会话那段由 tests/smoke.mjs 验证「服务缺失时给出可读诊断、不抛异常」。

import assert from 'node:assert/strict'
import test from 'node:test'

import { buildBackgroundPrompt, lastAssistantText, runBackgroundTurn, userMessage } from '../lib/background.js'

// ── 正文提取 ───────────────────────────────────────────────

test('lastAssistantText 取最后一条 assistant 正文', () => {
  const events = [
    { type: 'user/message', data: { message: { content: [{ type: 'text', text: '问题' }] } } },
    { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '第一次' }] } } },
    { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '最终答复' }] } } }
  ]
  assert.equal(lastAssistantText(events), '最终答复')
})

test('lastAssistantText 支持 fromIndex 只看新增事件', () => {
  const events = [
    { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '旧的' }] } } },
    { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '新的' }] } } }
  ]
  assert.equal(lastAssistantText(events, 1), '新的')
  assert.equal(lastAssistantText(events, 2), '', '越界的起点应返回空串而不是旧内容')
})

test('lastAssistantText 拼接多个文本分片', () => {
  const events = [{
    type: 'assistant/message',
    data: { message: { content: [{ type: 'text', text: '前半' }, { type: 'tool_use' }, { type: 'text', text: '后半' }] } }
  }]
  assert.equal(lastAssistantText(events), '前半后半')
})

test('lastAssistantText 认 data 直接就是 message 的形态', () => {
  const events = [{ type: 'assistant/message', data: { content: [{ type: 'text', text: '扁平' }] } }]
  assert.equal(lastAssistantText(events), '扁平')
})

test('lastAssistantText 对空/无正文输入返回空串', () => {
  assert.equal(lastAssistantText([]), '')
  assert.equal(lastAssistantText(null), '')
  assert.equal(lastAssistantText([{ type: 'assistant/message', data: {} }]), '')
  assert.equal(lastAssistantText([{ type: 'assistant/message', data: { message: { content: [] } } }]), '')
})

// ── user 消息形状 ──────────────────────────────────────────

test('userMessage 造出 followup 需要的形状', () => {
  const message = userMessage('推演一下')
  assert.equal(message.role, 'user')
  assert.equal(typeof message.id, 'string')
  assert.ok(message.id.length > 0)
  assert.deepEqual(message.content, [{ type: 'text', text: '推演一下' }])
  assert.deepEqual(message.source, { kind: 'user' })
  assert.notEqual(userMessage('x').id, userMessage('x').id, '每条消息要有独立 id')
})

// ── 系统提示组装 ───────────────────────────────────────────

test('buildBackgroundPrompt 带上纪律、卡与世界书', () => {
  const prompt = buildBackgroundPrompt({
    cardName: '测试卡',
    cardText: '角色设定正文',
    worldbookText: '世界书正文'
  })
  assert.ok(prompt.includes('后台推演会话'))
  assert.ok(prompt.includes('不替玩家角色行动'))
  assert.ok(prompt.includes('测试卡'))
  assert.ok(prompt.includes('角色设定正文'))
  assert.ok(prompt.includes('世界书正文'))
})

test('buildBackgroundPrompt 遵守 maxChars 上限', () => {
  const big = 'x'.repeat(50000)
  const prompt = buildBackgroundPrompt({ cardName: 'c', cardText: big, worldbookText: big, maxChars: 4000 })
  // 卡取一半额度，世界书吃掉剩下的；总设定资料不该超过 maxChars（另有提示骨架的开销）
  assert.ok(prompt.length < 4600, `设定资料应受 maxChars 约束，实际 ${prompt.length}`)
})

test('buildBackgroundPrompt 接受空输入', () => {
  const prompt = buildBackgroundPrompt({})
  assert.ok(prompt.includes('后台推演会话'))
  assert.ok(!prompt.includes('## 设定资料'), '没有资料时不该出现空的资料段')
})

test('buildBackgroundPrompt 对过小的 maxChars 仍保底', () => {
  const prompt = buildBackgroundPrompt({ cardName: 'c', cardText: 'y'.repeat(5000), maxChars: 1 })
  assert.ok(prompt.includes('yy'), 'maxChars 有下限保护，不该把资料清零')
})

// ── 降级路径 ───────────────────────────────────────────────

test('runBackgroundTurn 在缺少 agents 服务时返回可读错误', async () => {
  const result = await runBackgroundTurn({}, { prompt: 'x', systemText: 'y' })
  assert.equal(result.ok, false)
  assert.ok(result.error.includes('ctx.agents'))
})

test('runBackgroundTurn 在 agents.create 抛错时返回错误而不是异常', async () => {
  const result = await runBackgroundTurn(
    { agents: { create: async () => { throw new Error('模型不可用') } } },
    { prompt: 'x', systemText: 'y' }
  )
  assert.equal(result.ok, false)
  assert.ok(result.error.includes('模型不可用'))
})

test('runBackgroundTurn 成功路径：组装提示段、取正文、销毁会话', async () => {
  const calls = []
  let events = []
  const agents = {
    async create(options) {
      calls.push(['create', options.sessionId])
      // 模拟宿主在 setup 里给的两个能力
      options.setup({
        systemPrompt: {
          section: (s) => calls.push(['section', s.name, s.complete, s.text.length]),
          suppressRuntimeContext: () => calls.push(['suppress'])
        },
        tools: { restrict: (r) => calls.push(['restrict', JSON.stringify(r)]) }
      })
      return {
        agent: {
          session: { snapshotEvents: () => events },
          followup: (message) => {
            calls.push(['followup', message.role, message.content[0].text])
            events = [
              { type: 'user/message', data: {} },
              { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '幕后结果' }] } } }
            ]
          },
          whenIdle: async () => {}
        },
        dispose: async () => calls.push(['dispose'])
      }
    }
  }

  const result = await runBackgroundTurn({ agents }, { prompt: '推演', systemText: '系统提示', cwd: 'C:\\x' })
  assert.equal(result.ok, true)
  assert.equal(result.text, '幕后结果')
  assert.ok(result.sessionId.startsWith('tavern-bg-'))

  const kinds = calls.map((c) => c[0])
  assert.ok(kinds.includes('section'), '必须设置独立提示段')
  assert.ok(kinds.includes('suppress'), '必须抑制运行时上下文')
  assert.ok(kinds.includes('restrict'), '必须把工具限制为空')
  assert.ok(kinds.includes('followup'))
  assert.equal(kinds[kinds.length - 1], 'dispose', '无论成败都必须销毁会话')

  const section = calls.find((c) => c[0] === 'section')
  assert.equal(section[1], 'tavern:background')
  assert.equal(section[2], true, 'complete:true —— 后台会话只该看到我们给的提示')
  assert.equal(section[3], '系统提示'.length)
})

test('runBackgroundTurn 在 dispose 抛错时仍然返回正文', async () => {
  let events = []
  const agents = {
    async create(options) {
      options.setup({ systemPrompt: { section: () => {}, suppressRuntimeContext: () => {} } })
      return {
        agent: {
          session: { snapshotEvents: () => events },
          followup: () => {
            events = [{ type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '有正文' }] } } }]
          },
          whenIdle: async () => {}
        },
        dispose: async () => { throw new Error('销毁失败') }
      }
    }
  }
  const result = await runBackgroundTurn({ agents }, { prompt: 'x', systemText: 'y' })
  assert.equal(result.ok, true)
  assert.equal(result.text, '有正文')
})

test('runBackgroundTurn 跑完但没有正文时给出可读原因', async () => {
  const agents = {
    async create(options) {
      options.setup({ systemPrompt: { section: () => {}, suppressRuntimeContext: () => {} } })
      return {
        agent: { session: { snapshotEvents: () => [] }, followup: () => {}, whenIdle: async () => {} },
        dispose: async () => {}
      }
    }
  }
  const result = await runBackgroundTurn({ agents }, { prompt: 'x', systemText: 'y' })
  assert.equal(result.ok, false)
  assert.ok(result.error.includes('没有取到 assistant 正文'))
})

test('runBackgroundTurn setup 抛错时不连累整轮（降级为有运行时上下文）', async () => {
  const warnings = []
  let events = []
  const agents = {
    async create(options) {
      options.setup({
        systemPrompt: { section: () => { throw new Error('提示段冲突') }, suppressRuntimeContext: () => {} }
      })
      return {
        agent: {
          session: { snapshotEvents: () => events },
          followup: () => {
            events = [{ type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '仍然有产出' }] } } }]
          },
          whenIdle: async () => {}
        },
        dispose: async () => {}
      }
    }
  }
  const result = await runBackgroundTurn(
    { agents, log: (level, message) => warnings.push([level, message]) },
    { prompt: 'x', systemText: 'y' }
  )
  assert.equal(result.ok, true)
  assert.equal(result.text, '仍然有产出')
  assert.ok(warnings.some(([level]) => level === 'warn'), '提示段设置失败必须有 warn，不能静默')
})
