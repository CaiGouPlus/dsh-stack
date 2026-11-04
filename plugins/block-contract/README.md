# dsh-block-contract

把「展示块输出契约」**每轮注入 system prompt** 的 dsh host 侧插件。

> 配套：渲染侧插件 `D:\DSH\display-blocks` ｜ 契约文本真源 `D:\DSH\dnd-plugin\contract\display-blocks-pack.json`
> 配套 skill：`~/.dsh/skills/display-blocks/`（给 agent 看的同一份契约）

## 它解决什么

契约只有贴在**对的地方**才生效。dsh-tavern 的 `cardTextFor()`（`lib/index.js:1530-1599`）
每轮无条件往 system prompt 拼三样东西：

| 源 | 内容 | 换一张角色卡之后 |
|---|---|---|
| ① `agent.cordis.yml` | 卡文本（persona prefix） | 跟着卡变 |
| ② `characters.json` | 所有启用卡的 desc / first / text / content | **丢了** |
| ③ `presets.json` → `modules[]` | 预设词条 / 模块 | 在，但会被重导 / 面板覆盖 |

本插件是**第四种载体，也是最稳的一种**：代码。

- 不随角色卡变化（换卡 / 重导卡 / 重写 presets.json 都不影响）
- 不需要模型主动加载（不像 skill 那样靠"自愿"）
- 作用域精确：**只对「挂了有角色卡的预设」的会话注入** —— 编程会话不会多这 635 字

## 怎么挂

```jsonc
// ~/.dsh/profiles/<profile>/package.json
"dependencies": { "dsh-block-contract": "link:D:/DSH/block-contract" },
"dsh": { "profile": { "bundles": [ /* … */ "dsh-block-contract" ] } }
```

并确保 `~/.dsh/profiles/<profile>/node_modules/dsh-block-contract` 是指向本目录的 junction
（`mklink /J` 或 `fs.symlinkSync(src, link, 'junction')`）。**改完要重启该 profile。**

可选配置（写在该 profile 的 `cordis.patch.yml` 里）：

```yaml
- id: block-contract
  name: 'dsh-block-contract'
  config:
    enabled: true                 # false = 不注册任何段落
    mode: 'tavern'                # tavern（默认，只对有角色卡的预设）| always（所有会话）
    variant: 'generic'            # generic | dnd（dnd 多一段"块内取值以世界书为准"）
    order: 3                      # 越大越靠后组装（tavern: card=-999999 / enhance=2）
    packPath: 'D:/DSH/dnd-plugin/contract/display-blocks-pack.json'
    presets: []                   # 额外白名单：这些预设的会话也注入
```

## 判定逻辑（与 dsh-tavern 对齐）

```
会话 → 预设 id：日志里最新一条「非创建记录」的 agentPreset
             ↓ 没有
             session-bindings.json[sid].presetId（source 非 legacy、mode 非 none）
             ↓ 没有
             判不出来 → 不注入（**不采信 header.agentPreset**：那是出生默认值）
预设 → 是否角色扮演：目录有 preset.yml + agent.cordis.yml **且 characters.json 里至少一张启用卡**
子 Agent：继承父会话（header.parentSession）
```

那条「必须有角色卡」很关键：本机的 `liangshen`（编程）、`style-lab`、`tavern-lite`
同样有 `preset.yml + agent.cordis.yml`，只看这两条会把角色扮演的输出契约塞进编程会话。

## 自检与维护

```bash
node lib/selftest.mjs            # 24 项：内容通路 / 作用域判据（对真实数据）/ 异常不外泄
node tools/build.mjs             # 改完契约包必须重跑：重新内嵌 lib/contract-text.js
```

- 契约文本：构建期内嵌 + 运行时可从契约包热读（改了契约包**不用**重装插件）。
- 两条路都取不到时返回 `''`（不注入）并 `warn` —— **不静默**。
- 往契约包加新变体后，`node tools/build.mjs <variant>` 可以换掉内嵌的那份。

## 安全纪律

2026-09-30 因为一个插件的 `inject` 等不到宿主服务，桌面端整机打不开（`web boot: 1 entry did not activate`）。
所以本插件：**零外部依赖**、只 inject `systemPrompt`（tavern 也在用同一个服务）、
所有可能抛异常的地方都 try/catch（装配期出错只放弃本次注入，绝不把异常抛回宿主）。

## 回滚

```jsonc
// 从 profile 的 bundles 里删掉 'dsh-block-contract'，重启即可
```

或临时用 `config.enabled: false` 停用（不必改 bundles）。
恢复「预设模块」旧路线：`node D:\DSH\dnd-plugin\contract\apply-as-preset-module.mjs --preset <id>`
