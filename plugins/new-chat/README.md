# @local/dsh-new-chat

让模型自己**发起一个新对话**、在会话出生时**选定 agent 预设**、**替用户说话**，并能**自问自答地拿回正文**（发题 → 等回合结束 → 回传文本）。四个模型工具：

| 工具 | 作用 |
|---|---|
| `chat_presets` | 读预设名册（id / 显示名 / 描述 / 是否默认 / 是否不可用）。不要凭记忆猜 id。 |
| `new_chat({ preset?, cwd? })` | 建一个**空白**会话、绑定预设，并补写预设选择标记；本身不发消息。 |
| `chat_say({ sessionId, text })` | 只投递、立刻返回（不等回复）。 |
| `chat_run({ sessionId, text, timeoutMs? })` | **发一条 + 等这一轮跑完 + 回传正文**（自问自答 / 文风回归用）。 |

## 为什么需要它（2026-10-17 的实测结论）

- DSH 的 agent 预设**只能在会话第一轮开始之前绑定**：`agentPresets.select` 带 turnBoundary 闸门，
  会话一开跑就锁死。所以「换预设重开」必须新建会话，不能改旧会话。
- 模型此前唯一的建会话通路是**任务看板**（`task_board_run` 的 `mode` = 预设 id，底层走
  `session/create`）。但 DSH 0.2.1 把 `typertGateway.invoke(request)` 的 `peer: PeerScope`
  改成必填（`InvokeRemoteRequest`），`@linxin666/dsh-client-ui-task-board@0.4.6` 调用时没传，
  于是整个看板建会话都炸：
  `Cannot read properties of undefined (reading 'signal')`
  （不带 `mode` 的对照卡同样炸 ⇒ 不是预设参数的问题，是网关契约变了。）
- 本插件改走宿主服务 **`sessionController.create()` / `prompt()`**：进程内直接调用，不经 typert 网关，
  因此不受那个变更影响。这也是 Host 里「新建对话」的唯一正规入口。

## ★ 为什么 new_chat 要补写 `agent-preset/selected`

酒馆面板的注入决议（`tavern/lib/index.js` 的 `pickAuthoritativePresetFromLog`，P0-5）**只认两条**：

1. 会话事件流里的 `agent-preset/selected`（用户显式选择，含顶部预设选择器）；
2. 面板的绑定记账（`session-bindings.json`，`mode:'preset'` 且来源非 legacy）。

会话**出生时**写在 header 里的 `agentPreset`（= `creation`）被**刻意排除**——那是当年
「没选预设也静默注入」事故的修复。于是「带着预设出生」的会话在面板眼里等于「没选预设」：
**角色卡、世界书、破限段全都不注入**，模型只会按预设自带的 persona 演一段没有设定的戏。
更糟的是用户补不了：DSH 顶部选择器对「已经用同一预设组装好」的会话判定 composition 未变，
`select()` 直接 no-op，**不会补写这条事件**。

所以由创建方补写 —— 这正是 DSH 自己在 `reuseSetup` 里对空白会话做的事
（`agent.session.append("agent-preset/selected", { agentPreset })`），语义是「本会话运行这个预设」，
不改变已经组装好的 composition。补写后实测：系统提示从 4.5 KB 涨到 69 KB，
`inject-debug.log` 里 `bindingSource:"explicit"`、`textLen:62014`。

## ★ chat_run 怎么判「这一轮跑完了」

1. 发 prompt **之前**记下最后一个事件序号（`baseSeq`）；活会话取 `agent.session.log`，冷会话退
   `sessionController.inspect`。
2. `sessionController.prompt(..., mode:'queue')` 投递（正跑着会排队，不打断）。
3. 每 400 ms 轮询 `seq > baseSeq` 的事件：出现 `turn/start` 且 `turn/end` 数量 ≥ `turn/start` ⇒ 本轮结束。
   （多步工具调用的回合会多次 `step/*`，只有 `turn/end` 才算完。）
4. 从窗口里取**最后一条有文本的 `assistant/message`**：工具调用步骤的 assistant 消息通常是空的，
   所以拿到的是最终正文。返回「状态 / 耗时 / 工具调用次数 / 正文字数 / 正文」。
5. 超时不丢数据：返回已产出的部分正文并标注「超时」。

对当前会话自己调用会自锁（等一个由自己产生的回合），工具直接拒绝。

## 行为约定

- **`new_chat` 只建空白会话**：要开口就显式再调 `chat_say` / `chat_run`，两步分开、不藏着掖着。
- **位置跟随调用者**：优先挂进当前对话所在工作区（`workspaceRegistry` 里 `sessionIds` 命中的那个），
  这样新会话出现在同一个侧栏分组；拿不到工作区才退回当前目录，再退回部署默认目录。
- **预设名三级匹配**：id 精确 → 显示名精确 → 子串。匹配不上/有歧义就返回候选列表，
  **绝不静默换成默认预设** —— 用错预设开一局等于整场数据作废。
- **标记写失败就明说**：返回里 `预设选择标记：未写入` 表示没拿到该会话的 Agent，
  此时面板不会注入；不要把「建出来了」当成「能玩了」。

## 安装

```text
plugin_manager install_bundle(target: <本目录绝对路径>)
```

bundle patch 在 `cordis.patch.yml`（一条 insert）。安装后确认：

```text
cordis_inspect_query(platform: host, provider: Tool, method: listTools)
```

应能看到 `chat_presets` / `new_chat` / `chat_say` / `chat_run`。

## 验证

1. `chat_presets` → 名册与 `~/.dsh/.agent-presets/*/preset.yml` 一致。
2. `new_chat({preset:'足球'})` → 返回会话 id + `预设选择标记：已写入`；落盘头 `agentPreset` 正确、事件流里有 `agent-preset/selected`。
3. `chat_run({sessionId, text:'开始'})` → 回合结束、返回正文；系统提示里出现「【预设来源声明】」「# 角色卡：…」即注入生效。
4. 连发两轮 → 第二轮返回的只是第二轮正文（不串上一轮）。

## 已知边界

- 空白会话的标题由 DSH 按首条消息自动生成，本插件不预先命名。
- 不能把会话「打开」到浏览器（Host 没有这个 remote）；工具只返回 id 与位置，由用户点开。
- 补写的 `agent-preset/selected` 属于「把创建动作记成显式选择」。若面板日后把 creation 重新纳入注入依据，
  这段补写可以去掉。
- `chat_run` 一次只等一轮；批量（N 条命题一次跑完）尚未提供，需要时按轮串行调用即可。
