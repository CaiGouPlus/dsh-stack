# @local/dsh-dnd-ui

DND·无尽冒险 的 **DSH 客户端 UI 插件**（Web GUI 官方 slot API）。

## 它做什么

| 能力 | 挂载点 | 状态 |
|---|---|---|
| 🎴 车卡台（15 步信息架构 + 27 点购 / 标准数组 / 4d6 天命骰） | `conversation.view`（会话头部视图页签，`id: dnd-carmaker`） | 骨架已就位 |
| ⬆ 升级加点（AI 判定升级时自动唤起） | 同上视图 + `focus` 参数 | 骨架已就位 |
| 🏪 对话内商店面板（装备信息 / 价格 / 图片） | `conversation.input.dock` | 待实现 |

## 为什么它不在 DND 项目目录里

本项目（`D:\DSH\`）的所有产物都由 `DND无尽冒险_构建脚本.mjs` 与 `_redline_check.cjs` 守门，
并且皮肤 `dnd-tavern` 的 `hooks.mjs` 受 skin-center 的 **provenance 哈希门禁**保护
（改了不刷新哈希 → hooks 被静默拒绝、9 个面板全灭且零报错）。

本插件走的是**另一条完全独立的通道**：`~/.dsh/profiles/<profile>/package.json` 的
`dsh.profile.bundles` → DSH 客户端模块加载器。它**不经过** skin-center，
因此**不会触碰 provenance 门禁**，装/卸/升级都不会影响现有皮肤。

## 安装（每个 profile 各一次）

```powershell
# 3080 主 GUI
dsh plugin --profile web add D:\DSH\dnd-plugin
# 3081 酒馆（DND 实际游玩的那个）
dsh plugin --profile tavern add D:\DSH\dnd-plugin
```

装完**必须重启**对应服务（新增 bundle 行只在启动时读取）：

```powershell
# 3080
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\OneDrive\Desktop\DSH\scripts\Start-DSH.ps1" -Restart
```

## 卸载

```powershell
dsh plugin --profile web remove @local/dsh-dnd-ui
dsh plugin --profile tavern remove @local/dsh-dnd-ui
```

`reconcilePlugins()` 会按安装态自动把该条目从 `dsh.profile.bundles` 摘掉。

## 技术约束（写代码前必读）

1. **seed 表只有 8 个词**，shell 提供、**不要打包**：
   `react` · `react/jsx-runtime` · `react-dom` · `react-dom/client` ·
   `@deepseek-ai/cordis` · `@deepseek-ai/dsh-client-store` ·
   `@deepseek-ai/dsh-client-ui-slots` · `@deepseek-ai/dsh-client-ui-primitives`
   （另有 `@deepseek-ai/dsh-client-ui-dockkit` 在部分版本出现）。
   ⚠️ `@deepseek-ai/dsh-client-runtime` 在本机**不存在**，require 它会抛错。
2. **`lib/client.js` 是手写纯 JS**，没有 TypeScript、没有 JSX、没有打包步骤：
   用**原生 DOM API** 构造界面，槽位组件直接返回 DOM 节点（display-blocks 的 settings
   面板同款做法）；`require('react')` 只用于诊断卡读版本号。
   本机**没有** DSH monorepo，也不存在 `pnpm run dev:web`。
3. `factory` **必须同步**（不能有顶层 await），且返回值就是模块 exports。
4. `__ModuleLoader__.load({ id })` 的 `id` **必须**等于**包名**（package.json 的 `name`，
   即 `@local/dsh-dnd-ui`，也就是 `cordis.patch.yml` 该行的 `name` 字段），
   **不是**行 id `dnd-ui`。判据：display-blocks 的 `tools/check-client-entry.mjs` 断言
   「注册 id === 包名」（剥掉 `/client` 后缀），而 display-blocks 是实测能正常渲染的插件。
   写成行 id 会让加载器认为该行没注册 → 回退另一 URL 再执行一遍同一 bundle →
   `duplicate factory registration` → web boot 失败（09-26 / 09-27 两次崩溃即此因）。
5. 注册槽位**必须**用 `ctx.slots.inject('<slot>', () => ctx.slots.register(...))`，
   注册到未声明的槽位会抛错 —— 所有注册都包 try/catch。
6. `inputActions`（`setDraft` / `submit`）与 `useConversation` 是 **session 槽位的自动 props**，
   不需要 inject，也不需要 require。

---

## ⚠️ 已知阻塞：加载器重复注册（2026-09-13 实测 · 严格单变量 · 未解决）

**结论：本插件包本身完全正确；但在这套 DSH 构建上，往 profile 里加入任何本地客户端插件
都会触发 `dsh-client-modules` 的既有缺陷，导致插件 UI 无法渲染。**

### 证据链（严格单变量 A/B，全部可复现）

同一个 profile `dndrealclean`，组成 `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app`
+ `@linxin666/dsh-web-all`，**唯一变量**是"有没有加一个插件"：

| 实验 | 条目数 | 结果 |
|---|---|---|
| 对照（什么都不加） | 56 | ✅ 零异常（88 个请求） |
| 对照 **+ 一个 20 行的空插件** | 57 | ❌ `duplicate factory registration for "@deepseek-ai/dsh-api-gateway"` |
| 对照 **+ 本插件** | 57 | ❌ 完全相同的错误 |

那个"空插件"不渲染任何东西，全部内容是：

```js
window.__ModuleLoader__.load({
  id: "probe-ui",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    exports.inject = [];
    exports.apply = function () {};
    return module.exports;
  },
});
```

→ **与我们的代码无关**，是环境的加载器缺陷。

> 修正记录：上一轮我用的对照组是 `base + web-app`（54 条目，**没有 web-all**），
> 与实验组差了 3 个包，混杂了两代，那个 A/B **不成立**。上表才是严格单变量版本。

### 定位到的机制

| 项 | 值 |
|---|---|
| 启动图结构 | `batches[0]` = `phase:"application"` 前的 bootstrap（仅 `dsh-client-modules`）；`batches[1]` = `phase:"application"`，含全部客户端插件的 combo |
| 报错 | 其中的 `@deepseek-ai/dsh-api-gateway` 被 `register()` **注册两次** |
| 报错点 | `dsh-client-modules/lib/client.js` 的 `register()` 第 **231** 行 |
| 网络层 | combo URL 只被 HTTP 请求 **1 次**（CDP 抓包证实），所以不是"请求两次" |
| 已在两实例复现的共同特征 | application 批次的 `url` 里**同时包含 9/10 个 `immediately:true` 条目**（对照也如此），即重复源两边都有，差别只在"加插件后是否真的炸" |
| 后果 | 该异常打断 `dsh-cordis-client-runner` 的条目导入，本插件的 `apply()` **从未被调用** → 视图页签不出现 |

### 直接观测到的调用栈（决定它是宿主侧问题）

在页面启动前给 `window.__ModuleLoader__.load` 打桩后抓到第二次注册的完整栈：

```
at ClientModuleSystem.register                                   …/dsh-client-modules/client.js:231
at ClientModuleSystem.constructor.target.load                     …/dsh-client-modules/client.js:224
at /plugins/??@deepseek-ai/dsh-api-gateway/client.js,@deepseek-ai/dsh-client-ui-open-in-app/client.js,…  ← application combo 产物内部
```

第二次调用**来自 application combo 产物自身**，即宿主把同一批模块投递了两次。

### 宿主侧根因（`dsh-client-modules/lib/index.js` 的 `bootInjections`）

宿主按 `batch.phase` 生成注入行：

```js
for (const batch of application) rows.push({ kind: "script-preload", src: batch.url });  // ← 预载整批
for (const batch of bootstrap)   rows.push({ kind: "script-src",     placement: "head", src: batch.url });
```

而 `immediately: true` 的条目（本机 10 个，含 `@deepseek-ai/dsh-api-gateway`）
**同时**出现在：
1. 外壳（`dsh-web-frontend`）自己的"立即层"预取路径里；以及
2. `phase:"application"` 批次 URL 里（实测两个实例都是 9/10 命中）

→ 同一批被两条路径各自求值一次，第二次 `register()` 就抛
`duplicate factory registration`。**这是宿主侧的批次投递冲突，浏览器侧拦不住。**

> 判据补充：为什么"对照 56 条不炸、加一条就炸" —— 目前只能确认这是**确定性可复现**的
> （同一 profile 反复重启结果一致），精确的时序触发条件尚未定位到单行代码。
> 但"加任意一个插件即触发"已被空插件实验钉死。


### 已排除的可能

- ❌ `dsh.client.inject` 声明（`[]` 与 `['slots','locale']` 表现一致）
- ❌ `package.json` 契约（`exports["./client"]` / `dsh.bundle.patch` / `platform:"web"` 全部通过自检）
- ❌ BOM / 编码（本包 4 个文件字节头干净；另见下方「踩坑」）
- ❌ 插件代码（空插件同样触发）
- ❌ 条目数超限（对照 56 条正常，加 1 条即 57 条即炸）
- ❌ "URL 被请求两次"（抓包证实只有 1 次）

### 验证过的、本包确实正确的部分

| 层 | 证据 |
|---|---|
| 服务端投递 | application combo **200 / 14,580,174 B**，其中含本包完整源码（`dnd-carmaker` marker 命中） |
| 启动图登记 | entry 完整：`{id:"@local/dsh-dnd-ui", url:"/plugins/??@local/dsh-dnd-ui/client.js&rev=…-46", rev, inject:[]}` |
| 字段合法性 | 与现成第三方条目（`@linxin666/dsh-i18n`）字段集合完全一致（`id,inject,rev,url`） |
| 浏览器请求 | 实际请求到了本包 bundle |

### 待确认 / 下一步

1. 你正在用的 **3080** 是否也带这个缺陷 —— 它的 token 只在交互式控制台、不在日志里，我没去动运行中的实例。
2. 更实际的问题：**这套加载器缺陷下，插件路线整体不可用**。替代路径是皮肤 `hooks.mjs`（DOM 注入，
   完全绕过模块加载器）—— 本项目现有 9 个面板正是这么跑通的。


---

## 踩坑记录（写代码时会再遇到）

1. **PowerShell 写 JSON 会带 BOM** → `JSON.parse` 直接抛 `Unexpected token ''`（Dsh 的 profile 加载器会崩）。
   已踩：用 `Set-Content -Encoding UTF8` 写的探针 `package.json` 让 profile 起不来。
   本项目 `_compat\deploy-card.cjs` 里也专门警告过同一件事。**新文件一律用编辑器写，不要用 shell 重定向。**
2. **`dsh plugin --profile <p> add <path>` 不保证把包加进 `dsh.profile.bundles`**：
   它只对"声明了 `dsh.bundle` 的**依赖**"自动补行；而且**再次 add 别的包时，`reconcilePlugins()`
   可能把之前手动加的行摘掉**（实测踩到两次）。装完必须回读 `package.json` 确认 bundles 里有它。
3. **CDP 验证必须新建标签页**：复用残留页面会把上一个实例的异常算到本次头上（实测因此得出过错误结论）。
4. **新增 bundle 行或改动 bundle 字节 → 必须重启**；只改 `cordis.patch.yml` 才是热生效。

