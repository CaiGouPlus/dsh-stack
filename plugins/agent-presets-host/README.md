# dsh-agent-presets-host

把 `$DSH_HOME/.agent-presets/<id>/` 下的每个预设声明给 harness 的 agent-preset 注册表，
让酒馆面板里创建的预设出现在**新建会话顶部的预设选择器**里。

## 为什么需要它

`@deepseek-ai/dsh-agent-preset-registry` 0.1.7 起，harness **不再扫描磁盘**发现预设。
`@linxin666/dsh-client-ui-preset-center` 的注释写得最直白：

> Nothing scans it: the harness no longer discovers presets on disk, so a downloaded
> directory stays inert until this plugin declares it to `ctx.agentPresets` at runtime.

而 `dsh-tavern` 仍然把预设写进 `$DSH_HOME/.agent-presets/<id>/`，它自己的面板也是**自己扫目录**
列出来的 —— 所以会出现"酒馆面板里明明有，DSH 顶部选择器里却没有"。
`梁神模式` 能在列表里，是因为 `@linxin666/dsh-liangshen` 插件自带一份 composition 并自行 `register()`。

本插件补上这一环：**读同一个目录**并声明。单一数据源，酒馆里改完预设不需要再同步第二份配置。

## 行为

- 启动（插件行激活）时扫描库目录，逐个目录读 `preset.yml` + `agent.cordis.yml`，
  调 `ctx.agentPresets.register({ id, name, description, order, plugins })`。
- **v0.2.0 起支持热扫描**：启动扫描完成后用 `fs.watch`（recursive）监听库目录，
  任何变化触发一次去抖（800 ms）的**增量** resync ——
  - 新目录 → 声明（酒馆里插入新角色卡 / 新建预设后 **~1 秒内**出现在 DSH 选择器，无需重启）；
  - 目录消失 → 释放声明；
  - 已声明目录的 `agent.cordis.yml` / `preset.yml` mtime 变化 → 先释放再重新声明
    （酒馆里编辑预设后，**下一个新会话**就用新内容；**进行中的会话不受影响** ——
    注册表按引用计数退役旧 generation，不会抽掉正在聊天的会话脚下的预设）。
  - 声明失败的目录（id 不合法 / YAML 子集不支持 / 注册表拒绝）记录 mtime 哨兵：
    文件不再变化就不再重试与重复告警；文件一旦再被写入（如酒馆分步写盘写完最后一笔）自动重试。
- 注册表里**已被别的插件声明过**的 id 自动让位（例如 `liangshen`），启动时让位一次、
  每次 resync 都让位；不抢 id。
- 目录名必须是 harness 接受的预设 id（`^[a-z0-9][a-z0-9-]*$`），否则跳过并告警 ——
  不静默改名，改名会让指向旧 id 的会话绑定全部失效。
- 缺文件、或 composition 用了 YAML 子集之外的写法：跳过该预设并打印原因，其余照常声明。
- 监听器是尽力而为：平台/文件系统不支持 `fs.watch`、或启动时库目录不存在 →
  打一行告警并回退到旧语义（重启后生效）。
- 声明是**进程内**的：本插件不往任何 profile 文件里写东西。
- 卸载插件行/进程退出时关闭监听器并释放全部声明（可逆）。

## 安装（desktop profile 实例）

```sh
# 1) 包放进一个稳定位置后链进 profile
#    之前用目录联接（junction）即可，无需管理员权限：
#    New-Item -ItemType Junction -Path <profile>/node_modules/dsh-agent-presets-host -Target D:\DSH\agent-presets-host
# 2) 声明依赖
pnpm add "dsh-agent-presets-host@link:D:/DSH/agent-presets-host"
```

```yaml
# <profile>/cordis.patch.yml
- id: agent-presets-host
  name: 'dsh-agent-presets-host'
```

重启 DSH 后，`GET /api/preset-center/state` 的 `occupied` 应包含这些预设 id。

## 配置（可选）

```yaml
- id: agent-presets-host
  name: 'dsh-agent-presets-host'
  config:
    presetDir: 'C:\Users\me\.dsh\.agent-presets'  # 默认 $DSH_HOME/.agent-presets
    announce: true                                 # 每个声明打印一行日志
    watch: true                                    # v0.2.0：库目录热扫描（默认开）
```

## 结构

| 文件 | 作用 |
|---|---|
| `lib/index.js` | 插件本体：扫描、解析、声明、释放；顶部有完整设计说明 |
| `lib/yaml.js` | 从 `@linxin666/dsh-liangshen` 原样搬运的 fail-closed YAML 子集读取器（保证行为与注册表已接受的读取器一致；`!!js` 保持为数据 `{ __jsExpr }`，由 Loader 在挂载时求值） |
| `node_modules/@deepseek-ai/schemastery` | 目录联接，指向 profile 里已提升的那份（见坑 2） |
| `cordis.patch.yml` | 插件行的补丁片段（bundle patch） |

## 两个必须知道的坑（都踩过，各花了一轮）

### 1. `Config` 必须是真 schema，不能是普通对象

Cordis 用 `Config["~standard"].validate(config)` 校验行配置（`@deepseek-ai/cordis` 的
`resolveConfig`）。写成 `const Config = { presetDir: '', announce: true }` 会让整行**激活失败**：

```
agent-presets-host (dsh-agent-presets-host): TypeError: Cannot read properties of undefined (reading 'validate')
```

行仍在组合树里、`plugin-manager/list` 也显示 enabled，但插件从不挂载 —— 极易误判成环境问题。
所以本包用 `@deepseek-ai/schemastery` 的 `z.object({...})` 声明 Config（默认值写在 schema 上）。

### 2. 插件包自己要能解析 `@deepseek-ai/schemastery`

bundle 加载靠 profile 的 hoisted `node_modules`，但**插件内部**的 `import` 相对插件自身文件位置解析：
`D:\DSH\agent-presets-host\lib\index.js` 往上找 `node_modules`，那里没有
`@deepseek-ai/schemastery`（它在 profile 目录里）。缺了就是：

```
agent-presets-host (dsh-agent-presets-host): failed to import
```

因此包内放一个目录联接：

```
node_modules/@deepseek-ai/schemastery
  → C:\Users\m0408\.dsh\profiles\desktop\node_modules\@deepseek-ai\schemastery
```

profile 重建（pnpm 重装）后需重建该联接。`@linxin666/dsh-liangshen` 0.4.3 也
`import z from "@deepseek-ai/schemastery"`，但它被装在 profile 的 `node_modules` 下，所以天生解析得到。

## 已知边界

- 不是沙箱：声明一个预设等于让它的 composition 在宿主进程里挂载，`!!js` 表达式会在
  宿主进程求值。只声明你自己写的目录。
- 只读磁盘、不写：库目录里多出来的东西本插件不会删；停用/卸载插件行只是停止声明。
- 预设在 DSH 运行期间的改动需要重启才可见（声明是进程内的）。
