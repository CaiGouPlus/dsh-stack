---
name: wx-remote
description: 微信远程通道（腾讯 ClawBot）。把手机当这台电脑的遥控器：电脑可主动把文本/文件/截图推到用户微信，用户在微信里发命令可查看状态、列目录、读文件、取文件、跑 PowerShell、截屏。当用户说「发到我微信」「推到手机」「把结果/文件/截图发我」「手机上看看」「微信里发一条」时使用。
whenToUse: 需要把本机产物（文本、文件、截图）送到用户手机；需要用户在手机上远程查看或操作这台电脑；排查微信桥接不响应
---

# 微信远程通道（wx-remote）

**一句话**：这台 Windows 上跑着一个 ClawBot 桥接进程，它连着用户的微信。电脑 → 手机用 `wxctl` 推送，手机 → 电脑用微信里的斜杠命令。

## 组成

| 文件 | 作用 |
|---|---|
| `D:\DSH\_wxbot\bridge.mjs` | 常驻进程：长轮询 `getupdates`，收消息、跑命令、回消息 |
| `D:\DSH\_wxbot\media.mjs` | CDN 上传/下载（AES-128-ECB）。⚠️ `media.aes_key` 必须是 **base64(32 位 hex 字符串)**，不是 16 字节原始密钥的 base64——踩过坑，见排障 |
| `D:\DSH\_wxbot\wxctl.mjs` | **主动推送 CLI**（本 skill 的主入口） |
| `D:\DSH\_wxbot\supervise.ps1` | 守护进程：桥接挂了 5 秒后自动重启（单实例） |
| `…\Startup\WxBotBridge.vbs` | 开机自启入口（登录时静默拉起守护） |
| `D:\DSH\_openclaw\weixin-login.json` | bot_token（扫码登录产物，别提交） |
| `D:\DSH\_wxbot\last-context.json` | 最近一条入站消息的 `context_token`（推送要用） |
| `D:\DSH\_wxbot\bridge.log` / `supervisor.log` | 排障先看这两个 |
| `D:\DSH\_wxbot\inbox\` | 手机发来的文件落盘目录 |

Node 用 `D:\DSH\_openclaw\node-v24.22.1-win-x64\node.exe`（系统 Node 24.1.0 太旧，ClawBot 要 ≥24.16）。

## 主动推送（电脑 → 手机）

```powershell
$node = 'D:\DSH\_openclaw\node-v24.22.1-win-x64\node.exe'
& $node D:\DSH\_wxbot\wxctl.mjs text  "构建完成，耗时 42s"
& $node D:\DSH\_wxbot\wxctl.mjs file  "D:\out\report.pdf"
& $node D:\DSH\_wxbot\wxctl.mjs image "D:\out\chart.png"   # 图片走 image_item，微信里直接显示
& $node D:\DSH\_wxbot\wxctl.mjs status                     # bot / owner / 上下文年龄
```

成功输出 `{"message_id":...}`，退出码 0；失败非 0，stderr 有原因。

**前提**：`last-context.json` 存在且新鲜（用户最近 20 分钟内给机器人发过消息）。过期就先让用户随便发一句。

## 手机侧命令（用户 → 电脑）

`/help` `/status` `/ls [路径]` `/cat <文件>` `/get <文件>` `/run <命令>` `/dsh <任务>` `/dsh! <任务>` `/shot` `/reset`，其余文本走 DeepSeek 聊天。

- `/run`：破坏性命令（删除/停服务/改注册表/netsh/shutdown/taskkill…）会先要求回 `Y` 确认，2 分钟有效；格式化/分区/引导级操作直接硬拦
- `/dsh <任务>`：**只读模式**（`DSH_PERMISSION_MODE=read-only`），能查能读不能改，5 分钟超时，结果按 2800 字截断
- `/dsh! <任务>`：完全权限。提示词里下了硬约束：既有文件一律不许删/覆盖/移动，只能清理本轮自己新建的产物；确实要删时必须输出 `[需要删除] 路径…` 然后停下，桥接把清单发到手机，回 `D` 才授权重跑去删（3 分钟有效），其他回复一律取消
- 只认 owner 的 `ilink_user_id`，其他人发的消息直接丢弃
- 手机发来的图片/语音/文件自动落到 `inbox\`，并回一条含路径的消息

## 排障

| 现象 | 处理 |
|---|---|
| `wxctl` 报「没有会话上下文」 | 让用户在微信里发一条任意消息，再重试 |
| 微信里发命令没反应 | 看 `bridge.log` 最后几行；进程没了就重启（见下） |
| `/dsh` 报「被 Windows 文件权限拦住」/ `SetNamedSecurityInfoW failed (Win32 5)` | 是 DSH 的 workspace-write 沙箱在给工作目录设 ACL 时被拒。桥接启动 DSH 时已固定 `DSH_PERMISSION_MODE=danger-full-access` 绕开；若仍出现，换工作目录再试 |
| 日志出现 `session timeout` / `-14` | 服务端把会话挂起了，等 60s 自动重试；持续超过 2 分钟就重新扫码 |
| 发文件失败 | 检查大小（<30MB）、路径、`bridge.log` 里的 `cdn` 报错 |
| 文件已进微信，但手机点开「下载失败」/转圈/无反应 | 九成是 `media.aes_key` 编码错。正确写法：`aes_key: Buffer.from(aeskey.toString('hex')).toString('base64')`（hex 字符串的 base64）；错误写法是 `aeskey.toString('base64')`（16 字节原始密钥的 base64）。服务端照样回 `message_id`，只有客户端解密才失败，所以查日志看不出来。改 `media.mjs` 的 `const media = {...}` 那行后，`wxctl` 下一次调用自动生效；常驻桥接（`/get`）要重启进程。 |

> **别拿 CDN 自检当判据**：`GET https://novac2c.cdn.weixin.qq.com/c2c/download?encrypted_query_param=...` 无论文件还是图片都返回 400（客户端下载还带别的签名），本地验证恒失败，只能以手机端实际点开为准。怀疑推送坏了，就发一个几 KB 的 `test.txt` 让用户点开，一次就能二分出是协议问题还是文件本身问题。

重启桥接：

**正常情况下不用手动重启**——`supervise.ps1` 会在桥接退出 5 秒后自动拉起（单实例，重复启动会自己退出）。要重启就杀掉 node 进程，等 5 秒：

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'bridge\.mjs' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

守护进程整个没了才需要手动拉：

```powershell
Start-Process powershell.exe -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File','D:\DSH\_wxbot\supervise.ps1' -WindowStyle Hidden
```

## 常驻与自启

- 登录自启：`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\WxBotBridge.vbs`（静默拉起守护，无窗口）
- 守护写 `supervisor.log`，桥接写 `bridge.log`
- 注意：`schtasks` 建计划任务需要管理员，所以用了启动文件夹方案
- 登录后如果没起来，先看 `supervisor.log` 有没有 `another supervisor already running`

## 边界

- ClawBot 是**一对一私聊**，不能进群，其他微信用户看不到这个机器人
- 文本按 900 字切分发送，中间 400ms 间隔
- 这是个人通道，不要拿来群发或对外服务
- 密钥/令牌只在本机，别贴到聊天或提交到仓库
