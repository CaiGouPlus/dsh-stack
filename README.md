# dsh-stack

DeepSeek Harness（DSH）桌面端的**自建插件 + Skill + desktop profile 配置**快照。
换电脑后按本文档恢复，目标是最多 5 分钟回到原工作状态。

> 私有仓库。只放代码与配置，**不放** API Key、会话、凭据、酒馆运行数据。

## 内容清单

| 类型 | 数量 | 位置 |
| --- | --- | --- |
| DSH 插件 | 13 | `plugins/` |
| Skill | 14 | `skills/` |
| desktop profile 配置 | 2 | `config/profile-desktop/` |
| 安装/同步脚本 | 2 | `install.ps1` / `sync.ps1` |
| 清单 | 1 | `stack.json`（插件包名、版本、是否需要进 bundles） |

### 插件

| 目录 | 包名 | 作用 |
| --- | --- | --- |
| `cae-bridge` | `@local/dsh-cae-bridge` | CAE/CAD 工具桥（AutoCAD / COMSOL / Abaqus / MATLAB） |
| `dnd-plugin` | `@local/dsh-dnd-ui` | DND·无尽冒险客户端 UI 与展示块契约 |
| `new-chat` | `@local/dsh-new-chat` | 让模型自己开新会话、选预设、自问自答 |
| `tavern-style` | `@local/dsh-tavern-style` | 酒馆文风实验室：蒸馏结果落成增强模块 |
| `tavern-tools` | `@local/dsh-tavern-tools` | 酒馆工具层：模型读写角色卡 / 世界书 / 预设 |
| `keepalive` | `@local/dsh-webserver-keepalive` | 宿主 HTTP 网关 keepAlive 补丁 |
| `agent-presets-host` | `dsh-agent-presets-host` | 把酒馆预设注册进新建会话的预设选择器 |
| `block-contract` | `dsh-block-contract` | 每轮注入展示块输出契约 |
| `display-blocks` | `dsh-display-blocks` | 展示块渲染层 |
| `dsh-remote-plugin` | `dsh-remote-plugin` | 手机/远程连接、内置网关、管理台 |
| `tavern` | `dsh-tavern` | 酒馆主体（本机 2.7.17 定制版） |
| `tavernweave-workbench` | `tavernweave-workbench` | TavernWeave 制卡工作台 DSH 适配 |
| `crosspet` | `@local/dsh-plugin-crosspet` | CrossPet 桌宠状态同步 |

> `tavern` 与 `tavernweave-workbench` 含上游非商用许可（PolyForm Noncommercial），
> 仅作个人迁移备份，不要公开分发。

### Skill

`deslop`、`display-blocks`、`enhance-layer-edit`、`file-convert`、`local-llm`、
`new-chat`、`novel-teardown`、`style-distill`、`tavern-test-loop`、
`worldbook-injection-audit`、`wx-remote`，以及 3 个 `tavern-preset-*`。

## 换电脑恢复

### 前置

1. 新电脑安装 **DeepSeek Harness Desktop**，启动一次，然后从托盘**完全退出**。
   这一步会生成 `%USERPROFILE%\.dsh\profiles\desktop`。
2. 安装 Git，并配置 GitHub SSH（能 `ssh -T git@github.com` 即可）。
3. 确认 `D:` 盘可用（脚本默认把插件恢复到 `D:\DSH`；没有 D 盘见下文“没有 D 盘”）。

### 三步恢复

```powershell
git clone git@github.com:CaiGouPlus/dsh-stack.git D:\DSH\dsh-stack
cd D:\DSH\dsh-stack
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

然后启动 DSH。首次启动会加载新插件，稍等几秒。

### 装完还要手动做的

- **填模型 Key**：设置 → 模型 / Provider，填 `ZHIPU_API_KEY`、`XIAOMI_API_KEY`、
  `LOCAL_LLM_KEY`（本地 llama.cpp），或登录 DeepSeek 账号。
  凭据在本机 `.dsh\.credentials.yaml`，**不随仓库走**。
- 打开插件页确认 13 个插件都在。若某个报红，先看脚本最后的 pnpm 输出；
  也可以手动在 profile 目录跑一次 `pnpm install`。

### install.ps1 做了什么

1. **重建插件原路径**：在 `D:\DSH\<插件名>` 建 junction，指向 `plugins\<插件名>`。
   这样插件里写死的 `D:/DSH/...` 默认路径、以及 profile 里的 `link:` 依赖都原样成立，
   不需要改任何插件代码。
2. 建 `D:\DSH\skills` → `skills\`（供 `tavern-style` 读取 deslop 语料）。
3. 合并 `%USERPROFILE%\.dsh\profiles\desktop\package.json`：
   补 `link:` 依赖、按快照顺序补 `dsh.profile.bundles`（已有的 extra 保留）。
4. 合并 `cordis.patch.yml`：按 `id` 去重，**已有条目优先，只补缺失条目**；
   `-PatchMode replace` 可整份替换。
5. 复制 `skills/*` 到 `%USERPROFILE%\.dsh\skills\`；旧目录先备份。
6. 用 PATH 里的 pnpm，或 DSH 自带的 pnpm 执行 `pnpm install`。
7. 若 `-DshRoot` 不是 `D:\DSH`，写入用户环境变量覆盖写死的默认路径。

所有被覆盖的内容备份在 `%USERPROFILE%\.dsh\.stack-backups\<时间>\`。

### 参数

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `-DshRoot` | `D:\DSH`（无 D 盘则 `%USERPROFILE%\DSH`） | 插件原路径根目录 |
| `-ProfileName` | `desktop` | DSH profile |
| `-PatchMode` | `merge` | `merge` / `replace` / `skip` |
| `-SkipDeps` | 关 | 跳过 `pnpm install` |
| `-SkipSkills` | 关 | 跳过 Skill 复制 |
| `-DryRun` | 关 | 只打印计划，不改文件 |
| `-Force` | 关 | 允许在 DSH 运行时执行、替换已有目录 |

### 没有 D 盘

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -DshRoot C:\DSH
```

脚本会自动写入：

- `DSH_TAVERN_STYLE_LAB`
- `DSH_DESLOP_DIR`
- `DSH_BLOCK_CONTRACT_PACK`

这三个变量覆盖了插件里少数写死 `D:/DSH/...` 的默认路径。
`cae-bridge` 的 CAD 探针已改为写 `%TEMP%\dsh-cad-probe.dwg`，不受盘符影响。

## 日常维护

改完插件 / Skill 后，把本机状态同步回仓库：

```powershell
cd D:\DSH\dsh-stack
powershell -ExecutionPolicy Bypass -File .\sync.ps1
git add -A
git commit -m "sync: update plugins/skills/config"
git push
```

`sync.ps1` 会：

- 从 `D:\DSH\<插件>` 镜像回 `plugins/`（排除 `node_modules`、`tavern-style/data`、
  `tavern-style/lab-workspace`、日志、`.bak`、APK 构建产物）；
- 从 `~/.dsh/skills` 与 `D:\DSH\skills` 取较新的一份，同步到 `skills/`；
- 刷新 `config/profile-desktop/package.json` 与 `cordis.patch.yml`；
- 更新 `stack.json` 里的版本号，并登记新发现的插件目录。

换电脑那边只需 `git pull` 后再跑一次 `install.ps1`（幂等）。

## 未纳入仓库

- `tavern-style/data/`、`tavern-style/lab-workspace/`：运行时数据与实验工作区。
- `plugins/dsh-remote-plugin/public/*.apk`、`*.zip`：手机端构建产物（体积大）；
  `plugins/dsh-remote-plugin/apk/dsh-remote.apk` 保留了一份可用安装包。
- `node_modules/`、日志、`.bak-*` 备份。
- `%USERPROFILE%\.dsh\.credentials.yaml`（API Key）、`sessions/`、
  `.agent-presets/`（酒馆角色卡 / 世界书 / 预设）、`tiddlywiki/`、`skins/`。
- `D:\DSH` 下的 DND 世界书、资料库、游玩记录、构建脚本等大体积内容。

这些需要另行备份；换机器后模型 Key 与酒馆预设要重新配置或单独迁移。

## 目录结构

```
dsh-stack/
├─ install.ps1              # 仓库 -> 本机
├─ sync.ps1                 # 本机 -> 仓库
├─ stack.json               # 插件/Skill 清单
├─ plugins/                 # 13 个插件源码
├─ skills/                  # 14 个 Skill
└─ config/profile-desktop/  # package.json + cordis.patch.yml 快照
```

## 排错

- **install.ps1 报“检测到 DSH 正在运行”**：从托盘完全退出 DSH 再跑；或 `-Force`。
- **插件页有红色错误**：多半是依赖没装。`cd %USERPROFILE%\.dsh\profiles\desktop`，
  跑 `pnpm install`，再重启 DSH。
- **`D:\DSH\skills` 已存在真实目录**：脚本会保留它并提示；Skill 仍会复制到
  `~/.dsh/skills`，不影响使用。
- **cordis.patch.yml 合并后某条没生效**：用 `-PatchMode replace` 整份替换
  （会先备份），适合确认想完全恢复本仓库配置时。
- **端口 / 隧道配置**：`dsh-remote-plugin` 的 `autoTunnel`、`lanBind` 在 patch 里，
  新机器网络环境不同可手动改。
