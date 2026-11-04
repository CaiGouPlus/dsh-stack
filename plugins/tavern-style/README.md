# @local/dsh-tavern-style · 文风实验室（酒馆附属插件）

> 把「学到的文风」变成酒馆增强模块，并给你一个可视化可编辑的管理台。
> **不改酒馆一行代码**：只读写它的用户数据文件 + 用 DSH 平台自己的扩展点。

---

## 一、耦合面清单（这就是全部）

### 只读
| 路径 | 用途 |
|---|---|
| `~/.dsh/.agent-presets/presets.json` | 预设注册表（谁叫什么、目录是谁）——**只读，绝不写** |
| `~/.dsh/sessions/<工作区>/session-*/session*.jsonl.zstd` | 会话日志：只读头（分桶）+ 只读正文（工作台取模型输出）——**绝不写** |
| `node_modules/dsh-tavern/package.json` | 宿主版本（面板显示 / doctor） |
| `node_modules/dsh-tavern/lib/preset-enhance-pack.json` | 内置增强模块清单 —— **读全文（含 content）**，面板的「内置增强层模块包」卡片就是它 |
| `node_modules/dsh-tavern/lib/index.js`、`lib/utils.js` | **只读做镜像核对**（15 条结构禁令 / 运行时注入块是否还对得上）；绝不 import、绝不执行 |
| `D:\DSH\skills\deslop\references\banned-phrases.md` | 反八股语料（候选词表）——只读；可用 `DSH_DESLOP_DIR` 改路径 |
| `<目标预设>/characters.json`、`worldbooks.json` | **不读**（体积大且无关） |

### 读写（写前一律：备份 → mtime 守卫 → 原子替换 → 回读校验，失败自动回滚）
| 路径 | 我们动的键 |
|---|---|
| `~/.dsh/.agent-presets/<dir>/presets.json` | 整组增强模块（`[{name,modules:[{name,content,enabled}]}]`）；**受保护模块不可改不可删** |
| `~/.dsh/.agent-presets/tavern-state.json` | **只动 `antiCliche` 与 `bannedWords`**，其余键原样保留 |
| `~/.dsh/.agent-presets/edited-messages.json` | 仅当你在工作台点「推到酒馆显示层」时写（默认不写） |

### 平台扩展点（DSH，不是酒馆）
- host 半边：`ctx.webServer.register()` 注册 41 条 `/api/tavern-style/*` 路由（37 个 path；读 + 带守卫的写）；A/B 回放可选依赖 `ctx.get('llm')` + `ctx.get('agentDefaultModel')`（拿不到只影响回放）
- 浏览器半边：`ctx.slots.register()` 挂 `settings.section`（分区名「文风实验室」，order 152）

### 明确不做
- ❌ 不 import / 不 patch 任何酒馆运行时代码
- ❌ 不写会话日志（append-only 多帧 zstd，回写会毁档）
- ❌ 不改酒馆注入顺序、不碰世界书/角色卡、不写酒馆安装目录
- ❌ 不自动启用规则（候选规则必须你点采纳）

---

## 二、目录结构

```
D:\DSH\tavern-style\
  package.json            插件清单（dsh.bundle.patch + dsh.client）
  cordis.patch.yml        插入 1 行：id=tavern-style ← 必须等于 client 包装里的 id
  lib\index.js            host 半边：41 条只读/读写 API（构建产物）
  lib\client.js           浏览器半边（构建产物 ← lib\client-src\*.js）
  lib\client-src\         浏览器源码（按文件名顺序拼接）：
    00-base.js            样式 / 基础组件 / api / useData / keyedChildren / DiffView / Metric
    10-focus.js           专注模式（⛶ 全屏浮层：shell.overlay 槽 + fixed 兜底）
    20-common.js          复制按钮 / 消息行 / 搜索框 / 指标行 / 折叠列表项 ItemRow
    30-tab-anti.js        标签页「反八股」
    40-tab-enhance.js     标签页「增强层 / 发布」
    50-tab-bench.js       标签页「改进工作台」
    60-tab-learn.js       标签页「学习与比对」
    70-tab-replay.js      标签页「A/B 回放」
    80-tab-home.js        标签页「总览」+「文本体检」
    90-entry.js           外壳 / TABS / apply+inject / exports
  build\bundle-host.mjs   host 打包脚本（core → lib\index.js）
  build\bundle-client.mjs client 打包脚本（client-src → lib\client.js）
  lib\core\contracts.mjs  安全写入核心（备份/守卫/原子/校验/回滚 + 模板变量检测/清洗）
  lib\core\tavern.mjs     酒馆文件契约（唯一耦合面；含内置增强包全文读取 + 宿主源码只读取样）
  lib\core\anti.mjs       反八股：15 条结构禁令镜像 + 逐字注入预览 + 漂移核对 + deslop 语料解析
  lib\core\enhance.mjs    增强层：内置包视图 + merge 语义 + 一键套用 + 运行时块镜像
  lib\core\sessions.mjs   会话层：多帧 zstd 解码 + 分桶 + 轮次抽取
  lib\core\score.mjs      指标层：八股命中 + 结构特征 + 分布距离（/analyze 文本体检同源；口径与 deslop-lint 对齐）
  lib\core\rules.mjs      候选规则库（版本化 / 采纳 / 转模块 / 正文 patch）
  lib\core\improvements.mjs 改进工作台存储
  lib\core\publish.mjs    发布通道（实验室 → 目标预设，预演/覆盖/回滚）
  lib\core\replay.mjs     A/B 回放（夹具 / 两臂 / 限量调用 / 成本预估 / 历史）
  data\                   运行时数据（备份、改进、规则、夹具、回放记录、快照）
  lab-workspace\          实验室预设的工作目录（inbox/features/out）
```

## 三、七个标签页

| 标签页 | 能做什么 | 写哪儿 |
|---|---|---|
| **总览** | 状态摘要（反八股/禁用词/预设/待审规则/教学样本/回放轮数）+「下一步」行动卡片（点按钮直达对应页） | 不写 |
| **文本体检** | 粘一段正文立刻打分：分数 / 八股命中（逐条带证据）/ 句长 / 对白比 / 段落（复用 `core/score.mjs`，纯计算不调模型） | 不写 |
| **反八股** | `antiCliche` 开关；`bannedWords` 增删改（每行一条，整表替换）；**实际注入的 15 条结构禁令正文 + 与酒馆逐字一致的完整注入预览**（默认折叠、可 ⛶ 全屏）；本地 deslop 语料逐条挑进禁用词表 | `tavern-state.json` |
| **增强层 / 发布** | **模块正文编辑器**：逐预设改正文（启停/增删/新增分组），改完「保存到酒馆」；**内置模块包 12 个模块完整正文**（「编辑正文 → 保存到当前预设」或勾选批量套用；受保护模块🔒；`{{…}}` 模板变量保存前拦截确认）；运行时注入块全文（只读镜像）；发布通道（①预演差异 → ②执行（带确认条）→ 可回滚） | `<dir>/presets.json` |
| **改进工作台** | 逐轮看**模型输出**（可搜索会话列表）→ 改写（**对照视图：diff 高亮你改了什么**）→ 打标签 + 批注 → 保存；即时指标前后对比；单条导出 / **整会话导出 Markdown**；可推送酒馆显示层 | `data/improvements/**`（可选 `edited-messages.json`） |
| **学习与比对** | 候选规则（**按状态筛选 + 搜索**、正文编辑）→ 从 `out/rules/*.json` 导入 → 采纳/否决 → 写进实验室增强层；**实验室成果浏览（out/ 的报告/风格卡/规则，可预览）**；分布拟合（抽样桶 + 会话条数）；备份与一键回滚（**带确认条**） | `data/rules/**`、备份目录 |
| **A/B 回放** | 夹具场景（手写 / 从会话抓真实开场）× 两臂（A 无增强块 / B 带增强块）× **限量真实调用**（默认 ≤10、硬上限 20）；**三步编号按钮**（①存场景 ②免费预估 ③确认执行）+ 跑前成本预估 + 结果结论卡 + **导出结论 Markdown** | `data/fixtures/**`、`data/replays/**` |

> **界面约定**：长正文一律折叠（原生 `<details>`，正文常驻 DOM，Ctrl+F 可搜）；每个大文本框有「⛶ 全屏」（整窗浮层，Esc 退出）；按钮都带悬停说明（干什么 / 会不会写盘 / 调不调模型）；危险动作（回滚 / 删分组 / 覆盖套用 / 执行发布）先出确认条。

## 四、安装（已装在桌面端 profile）

```powershell
cd C:\Users\m0408\.dsh\profiles\desktop
pnpm add "@local/dsh-tavern-style@link:D:/DSH/tavern-style" --config.minimumReleaseAge=0
# package.json 的 dsh.profile.bundles 追加 "@local/dsh-tavern-style"
```
> 安装/改动 profile 文件后，**先跑** `node D:\DSH\_verify_boot.mjs`：客户端模块 id 重复项必须为 0，否则重启会 web boot 失败。

## 五、自检脚本（都在 D:\DSH\）

| 脚本 | 作用 | 结果 |
|---|---|---|
| `_verify_boot.mjs` | 启动前查重复行 id / 客户端模块 id | 0 重复才重启 |
| `_test_contracts.mjs` | 安全写入核心单测（沙箱） | 22/22 |
| `_test_core.mjs` | 规则库 / 改进存储 / 发布通道单测（沙箱） | 30/30 |
| `_test_score.mjs` | score 判据/口径回归（空文本 0 分、比喻/章节/二分壳判据、与 deslop 对齐口径） | 27/27 |
| `_test_score_cross.mjs` | 跨工具对照：score.mjs 与 deslop-lint 同文本数字逐项一致 + deslop 新判据抽查 | 12/12 |
| `_test_api.mjs` | host 41 条路由端到端（假 req/res + 假酒馆包，沙箱） | 81/81 |
| `_test_client.mjs` | 迷你 React 渲染七个标签页（罐装数据；按真实约定传 `(props, {})`） | 26/26 |
| `_test_client_real.mjs` | **真实 react@18** 渲染外壳+七标签页 + 槽位两种渲染语义（含 shell.overlay 浮层） | 20/20 |
| `_test_replay.mjs` | A/B 回放核心单测（假 callModel，不调真实 API） | 26/26 |
| `_test_sessions.mjs` | 真实会话解码验证（只读） | 408 扫 / 87 合格 |
| `_test_client_live.mjs` | 用运行中应用的真实数据渲染七标签页（含正文端点的在线断言） | 23/23 |
| `_accept_tavern_style_content.mjs` | **端到端验收**：真实 host 路由（只读）+ 真实数据 + 真实 react@18 渲染两个标签页，断言正文级内容 | 12/12 |
| `_probe_tavern_style_content.mjs` | 打印"面板将会显示什么"：条款正文 / 语料 / 内置包 12 个模块 / 运行时块 | 只读诊断 |

## 六、抗升级

只依赖「用户数据文件结构 + DSH 平台 API」，因此酒馆升级不需要改本插件。若某天结构变了：
- 写入前校验会拒绝不合预期的结构（不会写坏）；
- 面板顶部 doctor 会显示宿主版本；`data/overview.json` 快照可用于比对；
- 最坏情况：只读展示失效，学习/比对功能仍可用（会话是独立格式）。

## 七、⚠️ 规格与坑（改完必读）

### React 调用约定：组件函数永远收到**两个参数**——第二参数是 context，不是子节点
```js
// ❌ 真实 React 下 children 形参拿到的是 {}（legacy context）→ 渲染 {} → 面板整片空白
function Badge(props, children) { return h("span", null, children === undefined ? props.children : children); }

// ✅ 优先取 props.children，把"裸对象"第二参数当 context 丢弃（见 client.js 的 kid()）
```
实测（react@18 + react-test-renderer）：`组件被调用: 参数个数=2, 第二参数={} object`。
React 组件签名是 `Component(props, legacyContext)`——帮助组件若按"直接调用 `Comp(props, child)`"
的约定把第二形参当子节点，真实渲染就会拿到 `{}` → `Objects are not valid as a React child`
→ 子树卸载 → **设置面板整片空白、控制台无插件报错**（2026-09-29 实锤的面板空白根因）。
> 迷你 React 测试只传一个参数且**不执行子组件**，抓不到这类问题——因此新增
> `_test_client_real.mjs`（真实 react@18 + react-test-renderer）做回归门禁，
> 迷你测试的调用也已改成 `Component(props, {})` 模拟真实约定。
> 同理：**不要把带 hooks 的组件直接交给 `slots.register`**——用纯渲染函数包一层
> `function (props) { return h(Comp, props); }`（与 dsh-tavern 同款），
> 防止框架按 render prop 语义直接调用时 hooks 跑到 React 渲染期之外。

### 客户端注册 id 必须写**包名**，不是行 id
```js
// lib/client.js
window.__ModuleLoader__.load({
  id: "@local/dsh-tavern-style",   // ← 包名（= cordis.patch.yml 该行的 name 字段）
  factory: (require) => { /* ... */ },
});
```
机制（读 `dsh-client-modules/lib/client.js` 的 `arrive(row)` 得出）：加载器拿**图条目 id（包名）**去 `factories` 查"这一行注册成功了吗"；查不到就判定 not-registered，回退用另一个 URL **再执行一次同一 bundle** → 同一 id 注册两次 → `duplicate factory registration` → **整个 web boot 失败、应用起不来**。
行 id 可以随便取（本插件行 id `tavern-style`），只要行的 `name` 是包名。
> 对照官方插件 `@linxin666/dsh-usage`：行 id `usage`，包装 id `@linxin666/dsh-usage` ✓
> `@local/dsh-dnd-ui` 原先写成行 id `dnd-ui`，已按同一规格改为 `@local/dsh-dnd-ui`。

### 改完 profile / 插件，重启前先跑校验
```powershell
node D:\DSH\_verify_boot.mjs
```
检查三项重复（行 id / 模块名 / 客户端模块 id）+ **"客户端注册 id == 包名"**这条规格。出现任何 `!!` 或"违规"就别重启。

### 别手工往 `cordis.patch.yml` 里塞 bundle 行
bundle 自己的 patch 已经在插那一行；重复插入 = 同一个客户端模块注册两次（同一条崩溃路径）。

### 「正文」只有三个来源，别去酒馆面板找
反八股与增强层的**正文**都不在用户数据文件里，也不在酒馆面板上：
| 想看的 | 唯一来源 | 我们怎么拿 |
|---|---|---|
| 反八股条款 | `dsh-tavern/lib/index.js` 里 `state.antiCliche !== false` 分支的字面量 | 在 `core/anti.mjs` **镜像**一份 + 每次读时回源码核对（15/15 + 首尾句），对不上就在界面标"镜像可能已过期" |
| 增强层模块 | `dsh-tavern/lib/preset-enhance-pack.json` | 直接读 JSON（**含 content**）；酒馆自己的 `/api/tavern/preset/enhance` 只回 `{name,enabled,chars}` |
| 运行时注入块 | `dsh-tavern/lib/utils.js` 的 `buildEnhanceRuntimeBlock()` | 同样镜像 + 关键句核对（`core/enhance.mjs`） |
镜像不是权威副本，**漂移必须可见**：核对失败时界面显示"镜像待复核"而不是假装同步。
`lib/core/anti.mjs` 的 `ANTI_STRUCTURE_RULES` 改了，`_test_api.mjs` 的假酒馆包会跟着变（它 import 同一份常量），所以漂移检测本身也有回归覆盖。

### 数组里的子节点必须用 `h(Comp, {key})`，不能直接调用
`Badge/Btn/Pre/...` 被**直接调用**时（`Btn({key:"x"}, "文案")`）key 会被 React 丢掉，还会在读 `props.key` 时触发
"key is not a prop" 警告。要 key 就写 `h(Btn, {key:"x", ...}, "文案")`；不需要 key 的地方（varargs 子节点）随便。
> 2026-10 起 `00-base.js` 的 `h` 是**自动补 key 的包装**（数组子节点统一走 `keyedChildren`，嵌套数组自动展平），
> 直接调用 helper 混进数组不会再炸 key 警告；但新代码仍优先 `h(Comp, {key})`。`withKey()` 在迷你 React 下
> 走重建分支（它没有 `cloneElement`，且 children 挂在 `node.children` 而非 `props.children`）。

### 折叠用原生 `<details>`，正文常驻 DOM
`Fold` / `ItemRow` 都是 `<details open={state} onToggle>`：视觉上默认收起，但**子树始终渲染**
——这样浏览器 Ctrl+F 能搜到折叠区里的文字、验收脚本也能断言正文。别改回 `open ? children : null`（正文会从 DOM 里消失）。
`ItemRow` 的摘要行里放了按钮：按钮容器上 `onClick: (e) => e.preventDefault()` 阻止"点按钮=折叠/展开"。

### 专注模式（⛶ 全屏）挂两个点
`10-focus.js` 的 `focusStore` + `FocusLayer`：注册进 **`shell.overlay` 槽**（框架级浮动层，脱离滚动容器）为主，
设置分区里再渲染一个 `fallback: true` 的 fixed 兜底 —— 谁先挂载谁生效（`focusStore.overlayMounted`），不会双层叠影。
打开方式统一是 `h(FocusBtn, { makeSpec: () => ({title, mode:'edit'|'view'|'node', value, onSave, node}) })`。

### 正则循环里别用 `g` 标志配"每次都换的字符串"
`const re = /…/gu` + 循环里 `re.exec(新串)` 会带着上一次的 `lastIndex`，第二次匹配静默失败
——deslop 词表解析第一版就是这么把「（一切 / 所有 / 真相）」漏成字面文本的。要么去掉 `g`，要么每次 `re.lastIndex = 0`。

### host 与 client **都是构建产物**：改源、再 bundle
- host 可编辑源：`lib/host-entry.mjs` + `lib/core/*.mjs` → 产物 `lib/index.js`
- client 可编辑源：`lib/client-src/*.js`（按文件名顺序拼接）→ 产物 `lib/client.js`
```powershell
node D:\DSH\tavern-style\build\bundle-host.mjs    # 重新生成 lib/index.js
node D:\DSH\tavern-style\build\bundle-client.mjs  # 重新生成 lib/client.js
```
**直接改产物会在下次 bundle 时被覆盖。** client 源码各文件共享工厂作用域：**不要写 import/export**（打包器会拒绝），`React`/`h`/`require` 由打包器注入。
（注：`dsh-tavern` / `dsh-muv-*` 也有相对导入且工作正常，所以单文件不是硬性要求；保留单文件是为了贴近生态惯例、少一个变量。）

> ⚠️ **改了 `lib/core/*.mjs` 而没重新 bundle = 测试跑的是旧代码**（2026-09-30 实际踩到：
> `_test_api.mjs` 报"顶层并列写法没摊平"，其实是 `lib/index.js` 还是上一版的反八股解析器）。
> 顺序永远是：改 core → `node build\bundle-host.mjs` → 跑测试。
> 另外：**host 半边改动必须重启 DSH**，客户端 `lib/client.js` 只需刷新页面 ——
> 只刷新不重启时，新加的接口还不存在，界面上会显示"读取失败（该接口是新增的：宿主半边要重启 DSH 后才会注册）"。
