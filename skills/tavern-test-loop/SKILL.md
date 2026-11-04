---
name: tavern-test-loop
description: 酒馆预设/游戏系统的「实机测试自动环」：新开会话发固定触发词→跑真实游戏回合→从会话日志扒思维链→按诊断清单找问题→修规则/脚本→卡片同步→下一轮。含任务看板驱动、预设绑定、思维链提取、十项诊断清单、缺陷模式库与全套脚本。一轮上限硬性 10 轮。适用于任何「改了规则想实测效果」的迭代：比赛判定、状态栏、文风契约、工具自动化等。
whenToUse: 实机测试 / 自动测试 / 跑测试轮 / 扒思维链验证 / 验证规则改动 / 测试迭代预设；或用户说「测一轮」「自己测」「跑个测试环」「验证一下改完的效果」
---

# tavern-test-loop — 实机测试自动环

**核心思想**：规则改没改好，不能靠读文本判断——开一个真实会话跑一轮，把模型的**思维链**扒出来对照清单，违规处就是下一处要修的。思维链是不会撒谎的诊断书。

**硬性回合上限：一次测试环最多 10 轮。** 达到 10 轮或连续 2 轮全绿或用户喊停，立即收尾出报告。不许无限跑。

## 环路总览

```
建测试卡（子任务）→ 直接跑真轮（预设随会话创建自动解析）→ 等落定
   → 扒思维链 → 十项诊断 → 修规则/脚本 → 卡片同步 → 下一轮
```

## 一、前置条件（第一次跑之前全查一遍）

| 项 | 检查方法 |
|---|---|
| 任务看板可用 | `task_board_list` 返回 board.summary |
| 权限闸门已确认 | 测试卡继承**已确认的父卡**权限（见「坑 1」）；新根卡会重新触发人工确认 |
| 目标预设已知 | `tavern_card`（tavern 工具）或直接给 presetId |
| 会话工作区 ID | 读 `~/.dsh/storages/workspace.json` 的 `tables.workspaces`（UUID，**不是路径**） |
| 提取脚本就位 | `scripts/_read_thinking.mjs`（思维链提取）、`scripts/_inject_dump.mjs`（注入清单复原） |
| 《禁区》约定 | 任何标记为禁读的内容（本项目为《合集》世界书组）**永远不读不展开**，机械处理其 enabled 标记除外 |

## 二、每轮的标准步骤（7 步）

### 1. 建测试卡（用子任务，不用根卡）

```js
task_board_create({
  title: "实机测试 R{n}·「{触发词}」",
  parentId: "<已确认权限的父卡>",   // ★ 子任务继承父卡的人工确认，不再触发闸门
  prompt: "{触发词}",               // 如「开始」；测其他内容就换触发词
  workspaceId: "<目标工作区 UUID>",
  reuseSession: true,               // 需要补轮时留口子（但补轮会触发「重复指令」误读，见坑 5）
  goalRun: false                    // 单轮测试，不要 /goal 续轮
})
```

### 2. 直接跑真轮（单轮直达）

```js
task_board_run({ taskId })
```
**预设随会话创建自动解析**（注入日志 `resolvedFrom:"creation"`，cwdPresets 兜底在宿主生效后即是如此）——第一轮就带满注入，不需要废轮垫场。跑完 `task_board_get` 等 status=done（2~10 分钟）。

### 3. 绑定校验（只读日志，通常不需要手动绑）

看注入日志确认预设真进去了：
```powershell
Select-String -Path "$env:USERPROFILE\.dsh\.agent-presets\inject-debug.log" -Pattern '<sessionId>' | Select-Object -Last 3
```
`bindingSource:"creation"` / `"binding"` 都算正常。仅当 `bindingMode:"absent"`（预设没解析）才手动补绑：
```powershell
$body = '{"sessionId":"<sessionId>","presetId":"<目标预设ID>"}'
Invoke-RestMethod -Uri 'http://127.0.0.1:19387/api/tavern/bind-preset' -Method Post -ContentType 'application/json' -Body $body
```
绑定是运行时读取的，不需要重启宿主。`started:true` 正常。

### 4. 扒思维链

```powershell
node <skill>/scripts/_read_thinking.mjs --session <sessionId> --tail 30
```
输出 `%TEMP%\tavern-thinking.md`。再跑一段量长分布：
```powershell
node -e "const fs=require('fs');const t=fs.readFileSync(process.env.TEMP+'/tavern-thinking.md','utf8');const ps=t.split(/^## 思维链 /m).slice(1);let s=0;ps.forEach((p,i)=>{const b=p.split('\n').slice(1).join('\n');s+=b.length;console.log('思维链'+(i+1),b.length,'字')});console.log('合计',s,'字')"
```

### 5. 十项诊断（逐项打分）

| # | 检查项 | 违规特征（真实案例） |
|---|---|---|
| 1 | **思维链手算** | "75+85=160,+88=248…"逐项加总属性均值/数组求和 |
| 2 | **预演脚本输出** | 先估 k_c/位置值/delta/时段数再对答案；"我算一下大概…" |
| 3 | **倒推调参** | 对着 delta 调对手纸面值、"为了故事性把 X 调高些" |
| 4 | **参数盲猜** | 猜 CLI 参数格式、试错 3 次以上、被迫读脚本源码（＝字典缺口） |
| 5 | **规则横跳** | 同一冲突纠结 >20 行、两头对比论证、复述规则原文 |
| 6 | **块契约违规** | 小信息块 >1、问号占位、日期锚缺失、名单不全、「？」 |
| 7 | **字段误读** | 字段含义猜错（如"透"当信任度）＋数值抄错 |
| 8 | **幻觉依据** | "我记得之前…"（前文没有）、无据编数值/设定 |
| 9 | **预算超支** | 日常轮 >1 万字 / 比赛判定轮 >2 万字；"好，跑吧/执行！"式自我动员 |
| 10 | **技能零使用** | 整场 rewrite/charge/复核一次都没发动（改写权是资源不是收藏品）；该换人/该调声浪时没用 swap/sound 新接口、反而重掷或编数 |

### 6. 修复 → 同步

- 世界书/预设：`tavern_worldbook_update` / `tavern_preset_update`（带 expectedRevision）；
- 脚本缺陷（如 CLI 误覆盖）：直接改脚本＋`node --check`；
- **改完必做**：`node <同步脚本>` 把世界书刷进角色卡（本项目 `_card_sync.mjs`），备份自动带时间戳。
- 修法写进规则时配三样：**口径一句话＋违反示例＋速裁措辞**（"照办，不许长考"）。

### 7. 下一轮 or 收尾

新建测试卡（新卡＝新会话），回到第 1 步。**第 10 轮强制收尾。**

## 三、终止条件（满足任一即停）

1. **连续 2 轮十项全绿** → 提前收；
2. **累计 10 轮** → 强制收；
3. **用户喊停**（任何时候）→ 立即停，出当前结论；
4. 同一缺陷修 3 轮仍复现 → 停下升级方案（改架构/换规则层级），别再原地打补丁。

收尾报告必含：每轮字数趋势表、十项得分变化、修复清单、残留问题、模型口径声明。

## 四、坑位备忘（全部真实踩过）

1. **权限闸门**：看板默认 read-only；高于默认的权限要**人工在看板 UI 确认一次**，工具确认不了。**新根卡每次都重新触发闸门**；**子任务继承父卡的确认**——所以把测试卡全挂在一张已确认的父卡下。
2. **prompt 冻结**：卡跑过一次后 prompt 不可再改（执行目标可改）。要换触发词就新建卡。
3. **workspaceId 是 UUID**：读 `~/.dsh/storages/workspace.json`；裸路径会报 `workspace not found`。
4. **服务端插件无热加载**：改 `index.js` 之类宿主代码不重启不生效；但**绑定/世界书/预设都是运行时读**，改这些立即生效。测试环用「绑定制」绕开重启。
5. **rerun 会触发「重复指令」误读**：预设随会话创建自动解析（`resolvedFrom:"creation"`），单轮直达就是完整真轮；rerun 补轮时模型会把重发的触发词当成「玩家重复了指令」，输出补写轮而非重赛（R4/R5 实测两次）。要重测就**新建卡开新会话**，别 rerun。
6. **模型口径**：看板默认模型（如 deepseek-flash）不一定等于用户实际游玩的模型——报告里必须声明测试模型，必要时在卡上 pin 模型。
7. **注入日志是最好的验证**：`~/.dsh/.agent-presets/inject-debug.log` 每轮记「常驻X条/触发Y条/总Z字符＋条目清单」。跑完真轮先看它，确认 presetId/bindingSource 对了再分析，否则分析的是废轮。
8. **思维链在原始会话日志里**：`~/.dsh/sessions/<工作区slug>/<sessionId>/session.v*.jsonl.zstd`，`reasoning` 块完整落盘；聊天 API 会丢弃它（`contentToText` 跳过 reasoning），别走 API。
9. **测试数据不污染真实档**：测试会话的记忆档/比赛状态档用完清理；真实名册别让测试轮改写。

## 五、脚本

| 脚本 | 用途 |
|---|---|
| `scripts/_read_thinking.mjs --session <id> [--tail N]` | 从会话日志提取思维链全文到 `%TEMP%\tavern-thinking.md`；不带 `--session` 自动取**日志 mtime 最新**的会话 |
| `scripts/_read_thinking.mjs --workspace <slug关键字>` | 只在指定工作区（如 sillytavern）里取最新会话——多工作区时必用，防抓到维护会话自己 |
| `scripts/_inject_dump.mjs` | 按 inject-debug.log 最后一轮清单复原「实际注入了什么」全文（日志本身按铁律不记正文） |

## 六、一次测试环的预期成本（供决策参考）

- 每轮 = 1 真轮（2~10 分钟、30~100 万 token 口径，85%+ 为缓存命中）；
- 10 轮上限 ≈ 用户手动玩 10 回合的量级。跑之前跟用户确认一次预算；测试环内不再逐轮问。

## 七、备用实测通道（new-chat，执行器故障时的标准替代）

看板执行器（task_board_run）故障时，**测试环改走 new-chat skill 的工具链**，其余流程（命题设计、诊断、修复、同题重跑）不变：

`
chat_presets 看名册 → new_chat(preset) 建会话（自动写 agent-preset/selected 注入标记）
→ chat_run(sessionId, 命题) 发一条等一轮拿正文 → 判读 → 改预设
→ 同题重跑验证（新会话，别换题）/ 同会话续发下一条（每会话 ≤10 条对话）
`

与看板通道的差异：
- **不需要卡片/权限闸门/工作区 UUID**，也绕开执行器的 provider/waterfall 故障；
- 每个 
ew_chat = 一个独立新会话（干净样本）；同一会话连续 chat_run = 多轮对话测试（上下文累积，可测跨轮复用）；
- 拿回的是本轮最终正文（推理/工具标记已剔除），状态、耗时、工具次数随返回报告；
- **多场景发散原则**：同一类场景连测会掩盖问题——命题覆盖夺冠/惨败/点球/绝杀/受伤/告别/日常/对峙等情绪极性差异大的场次，感染力与措辞一起看。
