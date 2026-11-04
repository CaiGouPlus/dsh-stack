# 商店 / 升级 机器块 · 输出契约包

> 配套：`machine-blocks-pack.json`（数据）＋ 皮肤侧 `panel/panels.js`（渲染）＋ 卡侧 `desc`（契约）
> 状态：**已落地并验证**（WB-079 通用化，2026-09-30）

---

## 0. 先纠正一件事

`dnd-plugin/docs/商店与升级_机器块契约_v1.md` 开头写着「**尚未落地**」—— **那句话已经过期**。
实际实现早就做完了，分三块：

| 层 | 文件 | 做了什么 |
|---|---|---|
| 皮肤分流 | `C:\Users\m0408\.dsh\skins\dnd-tavern\hooks.mjs` | `MARKER`（L96）已含 `商店\|升级\|车卡`；`data-dnd-machine` 判据（L247）同族；第 11 面板「🏪 商店」接线（L1083-1128） |
| 面板渲染 | `skins\dnd-tavern\panel\panels.js`（27 KB，553 行） | `parseShop` / `parseLevelUp` / `validateShop` / `renderShopPanel` / `renderLevelUpPanel`，含价格档位校验与传说禁售硬规则 |
| 卡的契约 | DND 卡 `characters.json` 的 `desc` | `【商店输出契约】`(353 字) ＋ `【升级输出契约】`(426 字) |

`assets\dnd-panels.js` 与 `panel\panels.js` 是**同一份文件**（已核对 sha256），hooks 通过 `<script src="…/assets/dnd-panels.js">` 加载，挂到 `window.DndPanels`。

---

## 1. 这份契约包解决什么

契约原先**只写在【DND·无尽冒险】那一张卡的 desc 里**（desc 总长 16.5K，两段契约占 779 字）。
换一张卡就要从这张卡里抄一遍 —— 这就是「只能用于那一张卡」。

本包把契约抽成**可移植数据**，并给面板加了别名层，于是：

- 别的卡加上 `contracts.generic` 的两段（745 字）就能用同一套商店/升级面板；
- 键名不必是中文规范键 —— 英文键名、别的货币、别的稀有度词表都认；
- 不是 5e 的卡不会被 5e 的价格档位规则误报。

---

## 2. 怎么用到另一张卡上

### 推荐路径：追加到卡 desc

面板每轮**无条件**注入 `desc`（`cardTextFor` 只看 `desc/first/text/content` 四个字段），
且 `desc` 不计入世界书常态字符上限 —— 所以这是最可靠的载体。

```
# 先预览（不写入）
tavern_card_append { presetId, name: "<卡名>", packPath: "D:\\DSH\\dnd-plugin\\contract\\machine-blocks-pack.json", packVariant: "generic", dryRun: true }

# 确认后写入
tavern_card_append { presetId, name: "<卡名>", packPath: "…\\machine-blocks-pack.json", packVariant: "generic" }
```

`tavern_card_append` 是**幂等**的：`desc` 里已出现 `idempotencyMarker`（`【商店输出契约】`）就返回
`already-present` 且**一个字节都不写**。它只改 `desc` 一个字段，卡的其余字段一字不动。

> ⚠️ **不要**用 `tavern_card_update` 去做这件事 —— 它是**整体替换** `desc`，
> 必须先读全 16K 再拼回，任何截断都会静默吃掉设定。

### 备选路径：预设模块

`modules.generic` 是 `{name, content, enabled}` 形状，可并进 `<预设目录>/presets.json`。
但本机所有预设都**没有** `presets.json`（DND 预设也没有），所以这条路径目前用不上。

### 不推荐：世界书条目

实测面板的 `matchWorldbookEntries`（`dsh-tavern/lib/utils.js:20`）**只按 `keys ∪ keywords` 匹配**，
ST 的 `constant`（常驻）语义没实现 —— 无关键词条目在 keyword 模式下**永远不会注入**。

---

## 3. 通用化改了什么（WB-079）

改的是 `panel/panels.js`（**不在皮肤 provenance 签名范围内**，只签 `skin.json` + `hooks.mjs`，
所以改它不需要重签；改 `hooks.mjs` 才要重跑 `make-provenance.cjs`）。

| 改动 | 原来 | 现在 |
|---|---|---|
| **键名别名** | 只认 40 个中文硬编码键 | 别名表补齐：`name→名`、`items→商品`、`price→价`、`stock→存量`、`currency→货币`、`from→从`、`hitDie→自动.生命骰`… 原键不删，只补规范键 |
| **稀有度词表** | 只认中文（普通/非普通/稀有/非常稀有/传说/神器） | 加英文 `common/uncommon/rare/very rare/legendary/artifact`；`common` 排在 `uncommon` 之后（否则 "uncommon" 会被误判） |
| **货币** | 渲染层三处写死 `gp` | 一律走 `currencyOf(shop)`；不写才默认 `gp`，写了就用写的（信用点/星币/铜币都对） |
| **5e 规则门控** | 价格档位下限、传说禁售阻断、非常稀有溢价 1.5~2 —— **无条件**执行 | 只在判定为 5e 口径时执行；非 5e 卡上传说级降级为提示、价格档位规则整体跳过 |
| **解析容错** | 机器块**必须独占开头** | 保留规范形态优先，另加锚定 marker 的兜底：块出现在正文中间/末尾也能解析；说明文字（`来源：[[商店]] …`）依旧不会误命中 |

**5e 口径怎么判**：`体系/规则体系/ruleset` 匹配 `5e|dnd|d&d|龙与地下城`，或 `货源` 取了四档之一 → 5e；
`体系` 写了 `信用点|星币|credits`，或 `货源` 缺失 → 非 5e。非 5e 时会输出一条**可见提示**
（「本店没有声明『货源』，未按 5e 档位规则校验价格」），不静默。

---

## 4. 回归夹具

```powershell
# 测源码那份
node D:\DSH\tavern-frontend\dnd-tavern\tools\test-panels-generalize.cjs

# 测已安装的皮肤那份（同一个夹具，指定路径即可）
node D:\DSH\tavern-frontend\dnd-tavern\tools\test-panels-generalize.cjs `
     C:\Users\m0408\.dsh\skins\dnd-tavern\panel\panels.js
```

**46 项**，两组纪律：

- **不回归**：DND 卡的原形态必须同输入同输出（零 issue、传说级仍 `error` 且 `__blocked`、价格档位仍校验）；
- **通用化**：英文键名、信用点货币、非 5e 传说级不阻断、块在正文中间、正文含花括号、前面有 `[[状态更新]]` 不误抓、说明文字不误命中、升级块中英文键名。

---

## 5. 四份副本必须同步

改完要同步**四处**（源码 2 份 + 已安装 2 份），否则跑的是旧代码：

```
D:\DSH\tavern-frontend\dnd-tavern\panel\panels.js          ← 改这里
D:\DSH\tavern-frontend\dnd-tavern\assets\dnd-panels.js     ← 同步
C:\Users\m0408\.dsh\skins\dnd-tavern\panel\panels.js       ← 同步（装完立即生效，刷新页面即可）
C:\Users\m0408\.dsh\skins\dnd-tavern\assets\dnd-panels.js  ← 同步
```

`panel/` 与 `assets/` 两份内容必须**逐字节相同**（hooks 加载的是 `assets/` 那份，
夹具测的是 `panel/` 那份，不同步就会出现"测过了但没生效"）。

改皮肤后如需重签：`node D:\DSH\tavern-frontend\make-provenance.cjs` 然后重跑 `install.cmd`。

---

## 6. 已知边界

- `validateLevelUp` 的门槛表（`LEVEL_THRESHOLDS`）仍是 5e 的 XP 表 —— 等级门槛是体系专有的，
  换体系要自己给表；面板只负责展示与把玩家选择写回对话，不替你判级。
- 别名层是**补键**不是**改键**：原键保留，所以别的消费方（皮肤其它模块）读原键不误伤。
- 机器块里**不能有换行**；皮肤分流按行首匹配，所以「独占一行、以 `[[商店]]{` 开头」仍是契约要求。

---

## 7. 第二份契约包：`display-blocks-pack.json`（展示块 · 2026-09-30 新增）

上一份管的是**皮肤自己的**五个标记（商店/升级/车卡/状态更新/状态更正）。
这一份管的是**其余一切通用块** —— 人物、地点、任务、物品、组织、秘宝、自创类型，
由插件 `dsh-display-blocks` 渲染成块状卡片（分节 + 声明式颜色）。

### 为什么需要

契约原先只写在插件的 README 与 agent skill 里 —— **角色扮演时的模型看不到**，
于是卡不会输出展示块，插件装了也白装。本包把契约抽成**可直接注入卡 desc 的文本**。

### 怎么用

```
# 先预览（不写入）
tavern_card_append { presetId, name: "<卡名>",
  packPath: "D:\\DSH\\dnd-plugin\\contract\\display-blocks-pack.json",
  packVariant: "generic", dryRun: true }

# 确认后写入（幂等标记：【展示块输出契约】）
tavern_card_append { presetId, name: "<卡名>",
  packPath: "D:\\DSH\\dnd-plugin\\contract\\display-blocks-pack.json",
  packVariant: "generic" }
```

| 变体 | 段数 | 追加字符数 | 用途 |
|---|---|---|---|
| `generic` | 1 | 637（+3.8%） | 任何卡；不引用世界书表 |
| `dnd` | 2 | 765（+4.6%） | DND 卡；追加段要求块内取值以世界书为准、NPC 首次登场才出完整人物块 |

`packVariant` 仍是 `generic|dnd`（工具里是固定枚举），所以**不用改工具代码**。

### 两种载体：卡 desc vs 预设模块（**换卡不丢选后者**）

按 `dsh-tavern` 的 `cardTextFor()`（`lib/index.js:1530-1599`），每轮**无条件**注入三源：

| 源 | 内容 | 换一张卡之后 |
|---|---|---|
| ① `agent.cordis.yml` | 卡文本（persona prefix） | 跟着卡变 |
| ② `characters.json` | 所有启用卡的 desc/first/text/content | **没了** |
| ③ `presets.json` → `modules[]` | 预设词条 / 模块 | ✅ **不随卡变** |

| 载体 | 换卡 | 换预设 | 怎么装 |
|---|---|---|---|
| 卡 desc（上面那条 `tavern_card_append`） | ❌ 丢 | ❌ 丢 | 卡级，适合"只给这一张卡" |
| **预设模块**（推荐） | ✅ 在 | 换预设要重装 | `apply-as-preset-module.mjs` |

```bash
node D:\DSH\dnd-plugin\contract\apply-as-preset-module.mjs --preset <presetId>          # 幂等，带备份
node D:\DSH\dnd-plugin\contract\apply-as-preset-module.mjs --preset <presetId> --remove # 撤销
```

> 「一键导入向导」v3.5 起**会在导入时自动装这个模块**（`--no-contract` 可跳过），
> 所以"换卡 → 重跑向导"这条路永远自带契约。

### 三条只读验证

```bash
node verify-injection.mjs <presetId>   # ① 面板视图  ② 复现 cardTextFor 组装 → 契约是否真在注入文本里
node check-last-turn.mjs               # ① 会话绑定检查  ② ③ 最近一轮写了几个块（复用 check-blocks.mjs）
node dry-run-append.mjs                # 卡 desc 路线的预演（marker/字符数）——只读
```

⚠️ **装对了 ≠ 生效**：世界书 / 卡 / 契约只对「绑定了该预设的会话」注入。
0 个会话绑定 = 全部不生效 —— `check-last-turn.mjs` 第一条就报这个。

### 注入前先预演（不必进 dsh）

```
node D:\DSH\dnd-plugin\contract\dry-run-append.mjs
# 参数：[契约包] [变体] [预设目录]；默认 DND 卡 + generic
```

它按 `cardAppend` 的读取逻辑复现 dryRun（marker 判定 / 分隔符 / 字符数 / 追加全文），**只读不写**。

### 两份契约包的分工（别混用）

| 标记 | 谁渲染 | 用哪份契约 |
|---|---|---|
| `商店` `升级` `车卡` `状态更新` `状态更正` | 皮肤面板（`panel/panels.js`） | `machine-blocks-pack.json` |
| **其余一切** `[[任意标记]]{…}` | 插件 `dsh-display-blocks` | **`display-blocks-pack.json`** |

插件默认**不接管**那五个标记（透传原文给皮肤），所以两套渲染器不会抢同一块 DOM。
写那五个标记时必须用第一份契约的形状，套用本契约的 `节` 会渲染不出来。

### agent 侧的对应物

同一契约还有一份 **skill**，给 dsh 里的 AI 用（它能自动发现并加载）：

```
C:\Users\m0408\.dsh\skills\display-blocks\
├── SKILL.md                    # 契约摘要 + 写作纪律（分节 3~8 节、颜色 ≤4 种…）
├── references/contract.md      # 完整词表（稀有度 / 色名 / 块类型 / 节 / 别名）
└── scripts/
    ├── check-blocks.mjs        # 用插件词表校验一段文本里的块（--dump 可打印词表）
    ├── selftest.mjs            # 证明校验器能拦下坏样本（7 例）
    └── _check-frontmatter.mjs  # skill frontmatter 契约自检
```

放在**用户级根** `~/.dsh/skills`（rank 400）→ **所有 profile 自动生效、零配置、不用重启**
（unknown root 会被轮询直到出现）。
