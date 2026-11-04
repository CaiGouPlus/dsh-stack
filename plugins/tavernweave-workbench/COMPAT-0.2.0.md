# 本地适配记录：tavernweave-workbench 1.0.0 → DSH 0.2.0-rc.2

> 本目录是 `C:\Users\m0408\.dsh\profiles\desktop\node_modules\tavernweave-workbench`
> 的**工作副本**（原包未改动，已于 2026-09-30 核对还原）。原版只做了最小改动：
> `lib/index.js` +131/-20、`lib/client.js` +93/-15、`package.json` +5/-0，
> 新增 `cordis.patch.yml`。所有改动都在下面逐条给出「原位置 → 新位置 + 依据」。

宿主版本事实（本文件所有结论的基准，均为直接读源码，不依赖组合探针）：

| 事实 | 证据 |
| --- | --- |
| 真实宿主是 0.2.0-rc.2 | `app.asar → dsh/node_modules/@deepseek-ai/dsh-session/package.json` = `0.2.0-rc.2`；`resources/runtime/primary-runtime/runtime.json` = `desktopVersion 0.2.0-rc.2` |
| profile 共享根里的 `@deepseek-ai/*` 写着 `0.1.7-rc.2`，**版本号不可信** | `dsh-tools/lib/index.js` 在 asar(0.2.0) 与共享根(0.1.7-rc.2) 下 SHA256 **完全一致**；`dsh-session` 则确实不同（内容更旧） |
| `dsh-app-boot` 自报 0.1.7-rc.2 | 因此 `_probe-compat.mjs` 这类组合探针的结论不可用于 0.2.0，必须显式传版本或直接读代码 |

---

## 1. 诊断：不兼容点清单

### 1.1 致命且唯一与 Session API 相关的点（README.md:42 自述的那条）

原 `lib/index.js:547`：

```js
for (const session of rows || []) for (const event of session.events || []) rememberSkillEvent(session, event)
```

* `session.events` 在 0.2.0 上**不存在**（不是抛错，是 `undefined`）。
  * 0.2.0：`dsh-session/lib/index.js:1376` 定义
    `snapshotEvents(fromSeq = SessionLogOffset(0), toSeqExclusive = this.seq)`；
    同文件 1354–1399 行的 `Session` 类成员表里**没有任何 `events` 访问器**。
  * 共享根的 0.1.7-rc.2 副本在同一位置（1336 行）**同样只有 `snapshotEvents`**。
    也就是说 0.1.7 与 0.2.0 都不是 `session.events` —— 原版自 0.1.2-alpha.4 起就没工作过。
* 因为写了 `|| []`，这里**不会抛异常**，失败形态是「静默空数据」：
  重开会话后，工作台「技能状态」里的「本会话已加载」永远是空的，直到产生新的 skill 调用。

### 1.2 第二个真实不兼容点：客户端「当前会话」来源变了（原版没意识到）

原 `lib/client.js:103-105`（`currentSessionId`）与 `:69-92`（`currentWorkspacePath`）
都读 `sessions.list.getSnapshot().current`。0.2.0 的快照里没有这个字段：

* `dsh-api-session-controller/lib/client.js:3570-3575`：`this.list.set({ ids, byId, phase, projectionsBySession })`
  —— 就这四个字段；1.1 里提到的 0.1.7-rc.2 副本同样是这四个（已实测比对）。
* 服务对象本身也没有 `current` / `selection`（`ClientSessions` 类 3141-3160 行）。

后果：`currentSessionId()` 恒为 `""` → `currentWorkspacePath()` 恒为 `""` →
`isWorkspaceAllowed()` 在**白名单非空时永远为 false** → 侧栏「✦ 酒馆」入口永远不出现。
即：光修 `session.events`，插件虽然能加载，但**界面上什么都看不到**。

0.2.0 的权威来源：

* 「当前会话」= `uiSession.current`（`dsh-client-ui-session/lib/client.js:167` 建源；
  `:390-391` `materialize()` 返回 `{ key: binding.sessionId, ... }`；`:420` `getSnapshot: () => source.value`）。
  官方 UI 也是这么用的：`dsh-api-session-controller/lib/client.js:282` 读 `this.current.value.key`。
* 「会话 → 工作区」= `WorkspaceView.sessionIds` 反查
  （`dsh-client-ui-workspace/lib/client.js:257` 与 `:850`）。

### 1.3 导致「装了却从不加载」的第三个问题：没有 bundle patch

* 原 `package.json` 只有 `dsh.client`，**没有** `dsh.bundle`；包内**没有** `cordis.patch.yml`。
* `dsh-app-boot/lib/index.js:927-929`：profile 的每个 bundle 必须声明 `dsh.bundle`，
  否则 `throw ... declares no dsh.bundle`，该 bundle 进 `skippedBundles`（`:939-944`）。
* 所以**只往 `dsh.profile.bundles` 加一行是不会加载的**。
  对照：`dsh-tavern`、`dsh-muv-engine`、`dsh-image-gen`、`dsh-tavern-style` 都带
  `cordis.patch.yml` + `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`。

### 1.4 核对过、**没有**问题的宿主契约（避免误改）

| 用到的 API | 0.2.0 结论 | 证据 |
| --- | --- | --- |
| `inject = ['tools','webServer','sessions']` | 三个服务都在 | `dsh-tools:2704` `super(ctx,"tools")`、`dsh-host-webserver:158` `super(ctx,"webServer")`、`dsh-session:1581` `super(ctx,"sessions")` |
| `ctx.on('session/event', fn, { global: true })` | 仍支持 | 宿主内 40+ 处同样用法；`cordis:371` `on(name, listener, options)`、`:263` 认 `global` |
| `webServer.register({kind:'prefix',path,handler})` | 未变，重复注册仍抛错、`prefixes` 仍是 Map | `dsh-host-webserver:177-184`、`:149` |
| `ctx.tools.register(defineTool({...output:{schema,render}}))` | 未变 | `dsh-tools:838` / `:2878-2886` |
| `dsh.client.inject` 里的 7 个包名 | 0.2.0 全部存在且都声明了 `dsh.client` | 逐包比对 asar 内 `package.json` |
| 4 个槽位名 | 全部存在且都是 `kind:'list'`（需要 id，原版都给了） | `sidebar.footer.action`（sidebar:403/515）、`conversation.input.dock`（conversation:16309/18167）、`conversation.session.header.utilities`（conversation:16506/18272）、`settings.section`（settings-general:1171） |
| `session.projections.faceOf("goal").getSnapshot()?.goal` | 未变 | `dsh-client-ui-conversation:14226` + `:14235` `goal?.goal.phase` |
| `sessions.binding(id)?.session` | 未变 | `dsh-api-session-controller:3407-3408`、`:3400` |

---

## 2. 改了什么、为什么

### 2.1 `lib/index.js`（宿主半边）

| # | 位置（改后行号） | 改动 |
| --- | --- | --- |
| A | 新增 `L258-311` | Session API 兼容层：`sessionEventsOf()`（`L272-297`）按 `snapshotEvents()` → `ownEvents()` → `events` 顺序取；都取不到返回 `null` 表示「宿主不支持」，结果记进 `SESSION_EVENTS_API{mode,supported,reason}`（`L271`）。另加 `warnDegraded()`（`L301-311`，优先 cordis logger，同 key 只报一次） |
| B | `L539-548` | `apply()` 包一层 try/catch → `applyUnsafe()`（`L550`）：宿主 API 变更时只降级告警，不让本 bundle 的 fiber 激活失败 |
| C | `L553-557` | `webServer` 改从 `ctx.get('webServer')` 取，并探测 `register` 是否为函数 |
| D | **原 `L547` → 新 `L625-631`** | `session.events` 改 `sessionEventsOf(session)`；读不到时 `L630` 明说「历史技能活动无法回填」，不再静默空数据 |
| E | `L638-647` | `session/event` 订阅包 try/catch（观察者抛错虽被宿主按监听器隔离，也不该带进会话追加路径）；订阅失败则明说「技能活动跟踪已停用」 |
| F | `L650-678` | `tavernweave_status` 工具注册包 try/catch；输出加 `hostApi` 自述（`L668`） |
| G | `L370` | `/tavernweave/skills` 响应加 `hostApi`，让界面能如实显示降级 |

### 2.2 `lib/client.js`（客户端半边）

| # | 位置（改后行号） | 改动 |
| --- | --- | --- |
| H | `L18-35` | 新增 `clientCtx`（`L21`）/ `clientService(name)`（`L28`）/ `warnDegraded()`；`uiSession`、`uiWorkspace` **故意不放进 `inject`**（必需服务会让 fiber 停在 pending），只在运行时用 `ctx.get` 惰性取 |
| I | **原 `L103-105` → 新 `L124-129`** | `currentSessionId()` 先读 `uiSession.current.getSnapshot()?.key`（`L126`），读不到再退回旧路径 |
| J | 原 `L94-101` → 新 `L133-141` | `currentAgentPreset()` 改用 `currentSessionId()`（原 `sessionState.current` 已不存在） |
| K | `L87-119` | `currentWorkspacePath()` 改用 `currentSessionId()`；解析不到路径时 `warnDegraded("workspace-path", ...)` 打出诊断（服务在不在、sessionId、工作区条目数），不再静默返回空串 |
| L | `L1241-1252` | `apply()` 包 try/catch（**客户端 bundle 抛错会让整行卡在 loading、web boot 报 entries did not activate**） |
| M | `L1253-1259` | 先探测 `ctx.slots.inject/register`（`L1255`），缺失就告警并禁用本插件 UI |
| N | `L1347-1352` | `conversation.input.dock` 补上 `ctx.effect(...)` 托管（原版这一处漏了 effect，热重载/卸载时不会清理） |
| O | `L1377-1393` | 只读诊断钩子 `exports.__twDiagnostics`（无运行时副作用），用于 Node 侧探针断言解析结果 |

### 2.3 `package.json` / `cordis.patch.yml`

* 新增 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`（见 1.3）。
* `dsh.client.inject` 增加 `@deepseek-ai/dsh-client-ui-session`、`@deepseek-ai/dsh-client-ui-workspace`
  （让这两个包进入客户端模块图；缺失也只是降级，不会报错——注入名在图里找不到会被跳过）。
* 新增 `cordis.patch.yml`：`insert: [{ id: tavernweave-workbench, name: 'tavernweave-workbench' }]`。
* `peerDependencies` 里 `"@deepseek-ai/dsh-tools": ">=0.1.1-rc.2 <0.2.0"` **保持原样**：
  `evaluatePluginCompatibility` 用 semver 的 `includePrerelease` 判定，`0.2.0-rc.2 < 0.2.0` 成立 →
  在 0.2.0-rc.2 上判为**兼容**；但到 `0.2.0` 正式版就会被判不兼容（见「剩余风险」）。

---

## 3. 没有改的部分（诚实交代）

* `/tavernweave/*` 全部 HTTP 路由逻辑、资料库检索、卡结构盘点、变量抽取、项目持久化：未动。
* 更新检查（`git fetch` + `--ff-only`）：未动。注意本副本目录**不是 git 仓库**，
  所以「更新中心」会如实报 `unavailable`；若要保留该功能，需要把副本改成 git clone 或从上游同步。
* `presets/tavernweave-native`、`scripts/`、`docs/`：未动（与 `dsh.profile.bundles` 无关，
  原生 preset 仍需按 README 用 `scripts/install-native-adapter.ps1` 单独安装）。

---

## 4. 验证命令与结果

全部探针在 `D:\DSH\_probe\`，可重复执行。

```powershell
# 1) 语法
cd D:\DSH\tavernweave-workbench
node --check lib/index.js ; node --check lib/client.js ; node --check lib/usage-guide.js
#   → 三个都 OK

# 2) 客户端半边：真加载 bundle + mock 0.2.0 宿主，18 条断言
node D:\DSH\_probe\tw-client-probe.mjs
#   → ALL PASS（含两条反证：0.2.0 的 list 快照确无 current；摘掉 uiSession 后解析为空）

# 3) 宿主半边：真 import + mock ctx + 真调 HTTP 路由
node D:\DSH\_probe\tw-host-probe.mjs
#   → ALL PASS（snapshotEvents / events / 两者皆无 三种宿主形状）

# 4) bundle 组合：用 dsh-app-boot 自己的 loadProfileDirectory + composeEntries
node D:\DSH\_probe\tw-boot-probe.mjs
#   → ALL PASS：未被跳过、恰好一行、无重复客户端模块 id、对 0.2.0-rc.2 判为兼容

# 5) 原版目录还原核对（事故恢复）
node D:\DSH\_probe\tw-restore-check.mjs
#   → RESTORE VERIFIED
```

关于第 4 项的两点诚实说明：

* 探针里 `dsh-app-boot` 自报运行时版本是 **0.1.7-rc.2**（共享根副本），所以
  `loadProfileDirectory()` 内部那次兼容判定并不可信；探针另外**显式**用 `0.2.0-rc.2`
  调了一次 `evaluatePluginCompatibility` 才算数。这正是「组合探针不可信」的实证。
* 探针把「asar 内置 bundle」和「共享根 0.1.7 副本」混在一起，会看到
  `time-context` / `schedule` / `ui-schedule` 三个**重复行 id**，
  来源是 `@deepseek-ai/dsh-web-app(0.1.7 副本)` + `@deepseek-ai/dsh-experimental-schedule-bundle(asar 0.2.0)`。
  真实宿主只有一套 asar，不会出现；**与本插件无关**（本插件的行只出现一次）。

## 5. 无法在此环境验证的部分（必须由人重启 DSH 才能确认）

1. 真实 Electron 宿主中 bundle 行的实际挂载与客户端 bundle 的物化。
2. 侧栏「✦ 酒馆」入口在真实白名单工作区下是否出现（依赖 `uiSession.current` 在真机的时序）。
3. 会话头部「工坊进度胶囊」是否随 skill 调用更新。
4. 设置页是否出现「TavernWeave」分区。
5. 真实 `session/event` 流下的技能活动跟踪。

接口层的判断均已在 0.2.0 源码里逐条核对（见第 1.4 节表格），但「接口面正确」不等于「真机通过」。

