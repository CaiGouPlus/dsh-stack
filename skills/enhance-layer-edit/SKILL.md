---
name: enhance-layer-edit
description: 安全编辑酒馆预设的「通用增强层」（~/.dsh/.agent-presets/<预设>/presets.json 的预设模块）——文件格式铁律、备份与原子写入、逐字节保护校验、模块内容纪律、事故实录与验收。当用户说「改增强层」「加/删/改预设模块」「调整✨增强丨模块」「给预设加规则」「改 presets.json」时使用。
whenToUse: 需要给某个酒馆预设的通用增强层新增/改写/删除模块，或排查「模块改了但没生效」「增强层不注入」「模块被截断」类问题
---

# 通用增强层编辑指南

## 一、这是什么

「通用增强层」= 预设目录下 `presets.json` 里的**预设模块组**（面板上的「⚙️ 预设模块」，模块名多以 `✨增强丨` 开头）。dsh-tavern 插件的 `cardTextFor()` **每轮把启用模块拼进系统提示**，每个模块**截断到 3000 字**。

```
~/.dsh/.agent-presets/<presetDir>/presets.json     ← 编辑对象
dsh-tavern/lib/preset-enhance-pack.json            ← 内置增强包（数组），「套用内置包」按 name merge
```

## 二、格式铁律（违反 = 静默失效）

**1. 顶层必须是「组数组」：**

```json
[
  {
    "name": "通用增强",
    "_collapsed": true,
    "modules": [
      { "name": "模块名", "enabled": true, "content": "……" }
    ]
  }
]
```

**绝不能**写成单组对象 `{"name":"通用增强","modules":[...]}`。注入代码 `index.js` 只认 `Array.isArray(presets)`——对象格式**不报错、不注入、没人知道**。（事故实录：tavern-lite 与「创作」预设的增强层长期静默失效，改了半天规则从没进过系统提示。）

**2. 模块 content ≤ 3000 字**，超了被静默截断（面板 `truncated` 字段可查）。

**3. 受保护模块**：`✨增强丨情欲叙事覆写与身体词汇` / `✨增强丨身体与性感·日常层`（用户明令不动，该层可能被用户更名——**按 `情欲|身体与性感` 家族匹配**），以及用户自建模块（如「性格词表」）。每次写入前后**逐字节比对**其 content。

## 三、标准作业流程（七步，一步不许省）

1. **定位预设**：确认 presetId / 目录名（`tavern_preset` 不带参数可列预设；同名歧义就问用户）。
2. **读现状**：`tavern_preset`（带 presetId）列出模块名/enabled/chars；或直接读文件。记录基线。
3. **备份**：`Copy-Item presets.json "presets.json.bak-<yyyyMMdd-HHmmss>-<原因>"`。没有备份不许写。
4. **改内容**：遵守第四节内容纪律。
5. **原子写回**（用脚本整文件重写，见第六节模板）：
   - PowerShell 坑：`@($group) | ConvertTo-Json` 会把单元素数组拆成裸对象——**必须** `ConvertTo-Json -InputObject @($group)`
   - UTF-8 **无 BOM**
   - 写前快照受保护模块 content，写后 `-cne` 逐字节比对，变了就 abort
6. **验证**：Node/PowerShell `JSON.parse` + `Array.isArray === true` + 模块数 + 每模块 ≤3000 字 + `tavern_preset` 面板能读出模块列表（列表为空 = 格式又错了）。
7. **记录**：向用户报告改了哪些模块、备份路径、验证结果。

## 四、内容纪律（写模块正文的规矩）

写的是「下一轮模型的行为分布」，不是普通文档：

1. **唯一权威**：句式/词频/节奏类阈值只在一个模块定义（如《反八股总则》），其他模块只写「见 XX」——同一指标散在多处且数值不一 = 模型取平均。
2. **区间 + 让步位，禁死数**：「每句不低于 20 字」「每 200 字至多 1 个」这类全局固定点会制造**可测的新均匀**。写成区间（约每 4-7 句一处）、声明情绪派生（紧张段取密端）、声明让步位（与红线/字数冲突时先让步）。
3. **禁令写「修辞动作」，不写词面**：只禁「不是A而是B」会被换成「你以为A其实B」。每条禁令列变形外衣 + 拆法（「找到原判断，从正面说出来」）。
4. **例句会泄漏**：模块里带人名/细节/比喻的「正确示例」会被模型**当素材抄进正文**（事故实录：娜塔莎示例的护腕/小臂/蜜色被整段复用）。例句必须配「**示例禁抄**」条款（人名、细节、比喻、句式一律禁入正文，发现照搬整段换写），或改用脱敏例。
5. **白名单配用量**：被保护的表达（如「愣了一下/V 了V」）会被滥用成模板（事故实录：「按了按」×3）。白名单必须带「同一轮 ≤1 处」用量约束，并写明「白名单不是模板」。
6. **反过度矫正**：清创/禁令生效后，修掉的表达不得整段换成同款替代品（「停了一拍/停了停/停住了」三连即违规）。
7. **生成与清创分离**：写作模块不堆负面清单（边写边对照清单本身是机器味来源）；负面清单放自查/清创模块，且清创必须有「接受无改动、只做减法」条款。
8. **冲突速裁顺序**：输出契约 > 玩家代理权（不替玩家拍板/不出题）> 世界事实 > 文风倾向。文风规则永远给契约让路。
9. **预算**：新增模块先问是否必要；单模块 2000 字内为宜；启用总量心里有数（常驻越多，规则堆叠效应越强——场景专用规则优先做条件触发而不是常驻）。

## 五、常见坑清单（全部实证过）

| 坑 | 症状 | 解法 |
|---|---|---|
| 单组对象格式 | 面板读出 0 模块 / 模块从不生效 | 包成数组 `[{name,modules,_collapsed}]` |
| `ConvertTo-Json` 管道拆数组 | 写出裸对象 | `-InputObject @($group)` |
| 模块 >3000 字 | 正文被静默截断 | 压缩或拆模块 |
| 例句泄漏 | 正文复读示例细节 | 示例禁抄条款 |
| 硬配额 | 产出另一种均匀体 | 区间+情绪派生 |
| 白名单滥用 | 同款句式连环撞 | 用量约束 |
| 改完不验证 | 生效与否无人知 | 七步流程第 6 步 |

## 六、原子写入脚本模板

```powershell
$ErrorActionPreference = 'Stop'
$path = "$env:USERPROFILE\.dsh\.agent-presets\<presetDir>\presets.json"
# 1) 备份
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'; Copy-Item $path "$path.bak-$ts-<原因>" -Force
# 2) 读 + 快照受保护模块
$j = [IO.File]::ReadAllText($path) | ConvertFrom-Json
if ($j -isnot [System.Array]) { throw '非数组格式——先按 [{name,modules,_collapsed}] 归一化' }
$mods = [System.Collections.ArrayList]@($j[0].modules)
$guard = (@($mods | Where-Object { $_.name -like '*情欲*' })[0].content)
# 3) 改（新增模块用 Insert；改写用 .content = …；删除用 RemoveAt）
#    新模块插到哪：文风类插在「反八股总则」之后
# 4) 逐字节校验受保护模块
$guard2 = (@($mods | Where-Object { $_.name -like '*情欲*' })[0].content)
if ($guard -cne $guard2) { throw '受保护模块发生变动——中止' }
# 5) 原子写回（注意 -InputObject！）
$j[0].modules = @($mods)
[IO.File]::WriteAllText($path, (ConvertTo-Json -InputObject @($j[0]) -Depth 10), (New-Object System.Text.UTF8Encoding($false)))
```

改单模块 content 的另一条路：`tavern_preset` 读出 revision → `tavern_preset_update` 带 expectedRevision 写入（适合改字段）；**新增模块**仍需走文件（工具只支持改现有模块）。

## 七、验收清单（改完逐项打勾）

- [ ] 备份文件存在且可回滚
- [ ] JSON 可 parse，顶层是数组
- [ ] `tavern_preset` 面板读出完整模块列表（数量对、chars 对）
- [ ] 每模块 ≤3000 字，无截断
- [ ] 受保护模块逐字节一致
- [ ] 新内容无「不低于/最多 N 次」式全局死数（或已带让步位）
- [ ] 新内容含示例的，带「示例禁抄」提示
- [ ] 白名单表达带用量约束
- [ ] 已向用户报告：改了什么、备份在哪、怎么验证的
