# @local/dsh-tavern-tools

酒馆工具层：让**模型**在对话里直接读写角色卡 / 世界书 / 预设，并能主动查阅
「因为关键词没被最近消息命中、所以没被自动注入」的世界书条目。

它是 `dsh-tavern@2.5.0`（chen731215）的**补层**，不是替代品：
面板负责注入与界面，本插件只补面板没有的那一件事 —— 把资料交给模型的手上。

---

## 1. 它为什么存在（与面板的边界）

| 能力 | 面板（dsh-tavern 2.5.0） | 本插件 |
|---|---|---|
| 世界书自动注入（关键词 / 常驻 / 阶段选择 / 扫描深度） | ✅ 已做，不重复 | — |
| 注入四段 `tavern:card` / `nsfw` / `edits` / `enhance` | ✅ 已做，不碰 | — |
| 记忆总结（按 `autoEvery` 自动 + 手动） | ✅ 已做，不重复 | 只提供**只读**查看 |
| 关系网提取与展示 | ✅ 已做 | 只提供**只读**查看 |
| 剧情选项 / 反八股 / 成人模式 | ✅ 已做 | — |
| 会话历史正文检索 | ✅ 由 DSH 原生 `session_query` 全文检索提供 | — |
| 角色卡**导入**（PNG/JSON） | ✅ 面板拖拽 | — |
| **模型读/改/复制/体检角色卡** | ❌ 无（这才是缺口） | ✅ `tavern_card*` |
| **模型主动检索/读全文/改世界书** | ❌ 无（面板只有导入导出） | ✅ `tavern_worldbook*` |
| **模型读/改预设模块（破限词条/风格）** | ❌ 无 | ✅ `tavern_preset*` |

一句话：**面板能做的，这里不做；模型能做的，面板不做。**

---

## 2. 十一个工具

| 工具 | 作用 | 是否可写 |
|---|---|---|
| `tavern_card` | 列卡 / 读单卡（含 `revision`） | 只读 |
| `tavern_card_update` | 改卡字段（`desc`/`first`/`text`/`content`…），带 `expectedRevision` | 写 `characters.json` |
| `tavern_card_copy` | 复制成独立副本（改写成另一版本而不动原卡） | 写 |
| `tavern_card_validate` | 体检：缺名/重名/注入字段全空/含会被清理的 ST 宏/被禁用 | 只读 |
| `tavern_card_import` | **导入 ST 卡（PNG/JSON）全字段保真**：分区折进 `desc`、内嵌世界书入库、备选开场白展开成禁用伴生卡、原始卡归档 `st-sources/`、卡级正则可选落进 muv-engine 全局正则库 | 写 `characters.json`＋`worldbooks.json`（＋归档） |
| `tavern_worldbook` | 列组与条目 / 关键词检索 / 按 `ref` 读全文（最多 10 条）/ 读某组 | 只读 |
| `tavern_worldbook_update` | `add` / `update` / `delete` 条目，写 `keys`＋`keywords` | 写 `worldbooks.json` |
| `tavern_preset` | 列模块 / 读模块正文 | 只读 |
| `tavern_preset_update` | 改模块 `content` / `enabled` / `name` | 写 `presets.json` |
| `tavern_memory` | 只读查看本会话记忆总结与关系网 | 只读（有意不提供写入） |
| `tavern_background_run` | **后台推演**：起一条独立会话跑一轮（NPC 幕后行动 / 势力推进），独立系统提示＝当前卡＋关键词命中的世界书，不给工具，跑完即销毁 | 写一条新会话后销毁；读卡与世界书 |

### 为什么 `tavern_card_import` 不是重复劳动

面板的 `handleCharFile`（`dsh-tavern/lib/client.manager.bundle.js:1189`）只留
`{name, desc: description||personality, first: first_mes, enabled}`，卡里的
`scenario` / `mes_example` / `system_prompt` / `post_history_instructions` /
`alternate_greetings` / `creator_notes` / `extensions.regex_scripts` **全部消失**
（内嵌世界书面板会自己抽出来入库，那部分本工具不重复）。
提示词注入只看 `desc`/`first` 两个字段，所以"不丢字段"的唯一办法是把其余分区按
ST 自己的组装顺序折进 `desc`，同时把原始卡整份归档到
`<预设目录>/st-sources/<卡名>-<内容哈希>.json` —— 字段没有真正丢失，将来要改
映射规则还能重新推导。

### 为什么 `tavern_background_run` 走 `ctx.get('agents')` 而不是 `inject`

`inject` 是**硬依赖**：一旦把 `agents` 写进 `inject`，该服务缺失时整个插件
（连带另外 10 个工具）都起不来。所以运行时惰性取，取不到就返回一句能读懂的
诊断。宿主侧链路是公开能力（DSH 自己的进程内子 agent 驱动走的就是同一条：
`dsh-subagent-in-process-driver/lib/index.js:180-217`），本实现不 import 任何
`@deepseek-ai/*`（避开共享根 0.1.7-rc.2 与实际 0.2.0-rc.2 的版本错位）。

### 三条硬约束（都是实测踩出来的）

1. **不静默兜底预设**。会话没有非 legacy 绑定时，工具**拒绝执行**并返回
   「请显式传 `presetId`」+ 可用预设清单。写工具写错预设 = 数据事故。
   解析顺序：显式 `presetId` → `session-bindings.json` 里的非 legacy 记账 → 拒绝。
   （面板的权威来源是 DSH 事件流里的 `agent-preset/selected`，本插件读不到，
   所以宁可要求显式指定，也不猜。）
2. **`agent.cordis.yml` 不代写**。那是面板「保存预设」时由前端生成的 persona 快照；
   服务端每轮真正注入的是 `cardTextFor()` 现读的 `characters.json` +
   `worldbooks.json` + `presets.json`。本插件只写后三者 → **下一轮回复即生效**。
3. **`expectedRevision` 乐观并发控制**。读取返回内容哈希前缀，写入必须带上；
   不符就拒绝并要求重读（面板自动保存会改文件，这是真会发生的竞态）。
   校验失败返回**可执行指引**而不是抛异常 —— 这是模型能自我纠正的错误。

---

## 3. 数据面：与面板共用同一套文件，无第二份真相

```
$DSH_HOME/.agent-presets/
  presets.json                预设注册表（id / dir / name）
  session-bindings.json       会话→预设绑定（legacy 条目视为未绑定）
  <预设目录>/
    preset.yml                显示名
    agent.cordis.yml          面板生成的人设快照（本插件不读不写）
    characters.json           角色卡数组        ← tavern_card*
    worldbooks.json           世界书 v2 对象     ← tavern_worldbook*
                              （旧数组格式会自动升级为 v2）
    presets.json              预设模块数组      ← tavern_preset*
$DSH_HOME/tavern-data/sessions/<sessionId>/
  memory.md  relations.json                     ← tavern_memory（只读）
```

世界书条目字段与面板**完全一致**：`keys ∪ keywords` 并集匹配、
`enabled` 视为启用、组禁用连带条目、`injectMode` 决定 keyword/full。

---

## 4. 安装 / 卸载 / 回滚

安装（桌面 profile）：

```powershell
# 1) 建 junction（不要用 pnpm link，Node 的 ESM 按 realpath 解析）
cmd /c mklink /J "C:\Users\m0408\.dsh\profiles\desktop\node_modules\@local\dsh-tavern-tools" "D:\DSH\tavern-tools"

# 2) 本包自己也需要解析 @deepseek-ai/dsh-tools（宿主注入的服务）
cmd /c mklink /J "D:\DSH\tavern-tools\node_modules\@deepseek-ai" "C:\Users\m0408\.dsh\profiles\node_modules\@deepseek-ai"

# 3) profile package.json：dependencies 加 "link:D:/DSH/tavern-tools"，bundles 追加 "@local/dsh-tavern-tools"

# 4) 门禁
node D:\DSH\_verify_boot.mjs     # 行 id / 模块名 / 客户端模块 id 重复必须为 0

# 5) 重启桌面端（新 bundle 只有重启才加载）
```

回滚：把备份的 `package.json` 拷回 `profiles\desktop\`，重启。
junction 留着无害（不在 bundles 里就不会被组合）。
本插件没有客户端半区、不改宿主文件、不写第二份数据，回滚无残留。

---

## 5. 测试

```powershell
cd D:\DSH\tavern-tools
node --test tests\data.test.js   # 26 项纯函数测试（临时目录，不碰真数据）
node tests\smoke.mjs             # 端到端：注册 9 工具 + 真数据只读 + 临时目录写往返
```

`smoke.mjs` 覆盖的验收点：解析守卫生效、改卡后读回一致、陈旧 revision 被拒、
世界书 `add` 后按 `ref` 读回一致（含 `keys` 写入）。

---

## 6. 与 flizzywine/dsh-tavern 的关系（移植了什么、没移植什么）

原计划是移植对方 23 个 Agent 工具。审计后发现两边**数据模型没有任何映射**
（对方是「资源库 + 生成/原始双份 + 变更日志」，本机是「面板直读直写 JSON」），
所以只搬了**契约与算法**，实现体全部重写。

### 已移植
- `worldbook_search` 的检索算法（→ `tavern_worldbook` 的 `query` 模式）：
  静态检索不执行模板、`Intl.Segmenter` 中文分词但显式多词短语优先、
  标题 > keys > 正文的加权顺序、先片段后按 ref 读全文。
- 工具命名与参数语义（`expectedRevision`、`refs` 上限、片段/全文两级读取）。

### 已判定为重复、**故意不做**
- **历史正文召回**（对方的 `tavern_recall_history`）：DSH 原生 `session_query`
  已提供全文检索，面板的记忆总结已覆盖「回忆剧情」；再做一套是重复建设。
  已在开发中删除对应模块（含其 6 次预算 / 10 轮冷却护栏）。
- **世界书自动注入与阶段选择**：面板做得比对方细（`scanDepth`、阶段跳过、
  `wbInject` 逃生阀、EJS 跳过）。
- **注入段本身**（人设/破限/事实修正/增强层）：面板已有。
- **`tavern_read_card_raw` 这类"读原始文件"**：本面板的卡本来就以 JSON 存字段，
  直接读字段即可，不需要单独的 raw 通道。
- **MVU 变量表编辑 / `[initvar]` 声明**：`dsh-muv-table` 已实现（读卡 + 编辑变量表 +
  生成 `<UpdateVariable>` 块，`node dsh-muv-table/diag.mjs` 可诊断），而写一条
  `[initvar]` 世界书条目用现有的 `tavern_worldbook_update` 就能做，不需要新工具。
- **前台角色卡 UI**：面板已有导入 + 启停 + 删除 + 内嵌世界书自动入库。

### 移不过来（需要对方的整套运行时或前端，属"没实现"）
| 功能 | 为什么没有 |
|---|---|
| 卡工作台 UI（对话式改卡界面） | 前端 1.1MB bundle + 资源工作区投影，属另一个产品。**但已完成等价能力**：`tavern_card_import`（全字段保真导入 + 归档）+ 面板自带的世界书内联编辑器 + 模型侧 `tavern_card_update` |
| 后台 Agent 常驻池 | 常驻池本身依赖它们的 agent preset；**但底层能力已实现**：`tavern_background_run` 走宿主公开的 `ctx.agents` 起独立会话跑一轮推演（按需起、跑完销毁），见 `lib/background.js` |
| EJS 模板求值（`<% %>`） | 全线未实现（面板只解析 `getwi()` 阈值后跳过）。模板执行 = 在无沙箱处 eval 卡内代码，不做 |
| ST 变量作用域（global/character/chat/message） | 现存两套宏引擎都把作用域压平了；跨轮持久化只存在于 MUV（`{[…]}` + `<UpdateVariable>`）那条链路 |
| `TavernHelper` 的若干成员 | `dsh-muv-engine` 已提供约 33 个成员，但 `formatAsTavernRegexedString` 是 no-op、`triggerSlash` 白名单只剩 4 条命令、`tavern_events` 多数不响（见其 `client.js:3015-3050`）——这些是引擎的已知差异，不在本插件职责内 |
| ST 正则的 `placement[]` / `runOnEdit` / `substituteRegex` / `trimStrings` | `dsh-muv-engine` 只存不读（`global-regex.js:205-210`）；要修在引擎侧 |
| 应用内自更新 / 安装器 / 服务生命周期 | 属整套 profile 交付形态 |
| `[[商店]]` / `[[升级]]` 机器块 | 契约文档已写（`dnd-plugin/docs/商店与升级_机器块契约_v1.md`）但标注"尚未落地"；`dnd-plugin` 宿主半边 `apply(){}` 是空的 |

### 未在本插件实现、但可独立安装（都是公开发布包）
`dsh-image-gen`（生图）、`dsh-web-mobile`（小屏）、`dsh-better-sidebar`（侧栏）。

---

## 7. 已知限制

- **改预设后需要下一轮才生效**（提示词组装时现读文件）；历史消息不会被改写。
- **`tavern_preset` 对没有 `presets.json` 的预设返回 0 个模块**，这是面板的正常形态
  （有的预设只用角色卡＋世界书）。
- 插件用 `@local/dsh-tavern-tools` 名字挂在桌面 profile 上；宿主实际打包的是
  `@deepseek-ai/dsh-tools@0.1.5-rc.2`，开发时解析到共享根的同名包（0.1.7-rc.2）。
  两版 `defineTool` / `parameters` 规格一致（已对照核实），故测试结论对运行期成立。

Copyright (c) 2026 chen731215-dev・PolyForm-Noncommercial-Copyleft-1.0.0
