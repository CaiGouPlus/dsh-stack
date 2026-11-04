---
name: local-llm
description: 本机离线大模型（llama.cpp + Qwen3.5-4B，127.0.0.1:11435，OpenAI 兼容端点）。用于不花 API 额度的批量活：摘要、结构化抽取、翻译、打标、草稿、离线闲聊。当用户说「用本地模型」「本地 AI」「离线跑」「省钱别调 API」「llama.cpp」「qwen 本地」「本机模型」时使用。
whenToUse: 需要零成本或离线的推理；需要批量处理一批文本；需要检查本地服务是否在跑；需要把本地模型接进 DSH / 第三方客户端
---

# 本地 AI（local-llm）

**一句话**：这台机器上有一个常驻的 `llama-server`（Vulkan 后端），把 Qwen3.5-4B-Q4 整个塞进 6GB 显存，对外是一个标准 OpenAI 接口，调用它就是 `POST http://127.0.0.1:11435/v1/chat/completions`，模型名 `qwen3.5-4b`，不花钱、不出网。

## 组成

| 路径 | 作用 |
|---|---|
| `D:\DSH\llama\llama-server.exe` | 运行时（llama.cpp b11836，Vulkan 构建） |
| `D:\DSH\models\Qwen3.5-4B-Q4_K_M.gguf` | 模型权重，2.55GB |
| `D:\DSH\llama\start-llama.ps1` | 启动脚本（参数已调优，**别手改**） |
| `D:\DSH\llama\启动本地模型.cmd` / `停止本地模型.cmd` | 双击启停 |
| `D:\DSH\llama\chat.ps1` | 命令行提问 |
| `D:\DSH\llama\web\index.html` | **网页界面**（单文件，无依赖，双击即用） |
| `D:\DSH\llama\打开本地模型界面.cmd` | 拉服务 + 开浏览器，一步到位 |
| `C:\Users\m0408\.dsh\skills\local-llm\scripts\ask.ps1` | **推荐入口**：自动拉起服务 + 提问，只输出正文 |
| `%TEMP%\llama-server.err.log` | 排障日志 |

## 网页界面

`web\index.html` 是一个不依赖任何库的单文件聊天页（约 570 行），直接用 `file://` 打开也能跨域调 11435（llama.cpp 对 `Origin: null` 放行）。

- 打开方式：双击 `打开本地模型界面.cmd`（服务没起会先拉起，再开默认浏览器）
- 能力：流式输出、停止生成、重答、复制、系统提示 / 温度 / 最大 token 设置、上下文用量估算、导出 .md
- 对话和设置存 `localStorage`（键 `local-llm-ui-v2`），关掉浏览器不丢
- 状态灯靠轮询 `/health`（15 秒一次）；显示「未连接」就是服务没起
- 改 UI 后自检方式：`msedge --headless=new --screenshot=... file:///D:/DSH/llama/web/index.html`，注意加 `--no-first-run --disable-sync`，否则截到的是 Edge 首启弹窗

## 启停

```powershell
pwsh -File "D:\DSH\llama\start-llama.ps1"     # 启动/重启，约 4 秒加载完
Get-Process llama-server | Stop-Process -Force # 停止，显存立刻从 4.6GB 掉回 1.2GB
curl.exe http://127.0.0.1:11435/health          # {"status":"ok"}
nvidia-smi --query-gpu=memory.used --format=csv # 正常应 ~4.6GB
```

## 调用

**1. 脚本（首选，服务没起会自动拉起）**

```powershell
pwsh -File "C:\Users\m0408\.dsh\skills\local-llm\scripts\ask.ps1" "用三句话写一段秋天的球场"
pwsh -File "C:\Users\m0408\.dsh\skills\local-llm\scripts\ask.ps1" -MaxTokens 800 -System "你是数据标注员，只输出 JSON" "从这段话里抽人名"
pwsh -File "C:\Users\m0408\.dsh\skills\local-llm\scripts\ask.ps1" -Json "你好"   # 要 token 数/耗时就看原始 JSON
```

**2. 命令行提问（人看的，带耗时统计）**

```powershell
pwsh -File "D:\DSH\llama\chat.ps1" "你的问题"
```

**3. 任何 OpenAI 客户端**

| 字段 | 值 |
|---|---|
| base_url | `http://127.0.0.1:11435/v1` |
| api_key | 随便填（不校验） |
| model | `qwen3.5-4b` |

```python
from openai import OpenAI
c = OpenAI(base_url="http://127.0.0.1:11435/v1", api_key="x")
print(c.chat.completions.create(model="qwen3.5-4b",
      messages=[{"role":"user","content":"你好"}]).choices[0].message.content)
```

## 接进 DSH

已在 `C:\Users\m0408\.dsh\profiles\desktop\cordis.patch.yml` 的 `llm-pi-ai` 块里注册：

```yaml
      local:
        displayName: 本地 llama.cpp
        api: openai-completions
        baseURL: http://127.0.0.1:11435/v1
        apiKeyEnv: LOCAL_LLM_KEY      # 用户级环境变量，随便一个假值即可
        models:
          - id: qwen3.5-4b
            name: Qwen3.5-4B (本地)
            contextWindow: 32768
            maxTokens: 4096
            input: [ text ]
```

**配置是启动时加载的，改完必须重启 DSH 桌面端**，模型列表里才会出现「Qwen3.5-4B (本地)」。字段名注意是 `input:`，不是 `inputModalities:`（那是 deepseek 插件的写法）。

## 性能基线（RTX 3060 Laptop 6GB，实测）

| 指标 | 值 | 含义 |
|---|---|---|
| prefill | 1300–1850 tok/s | 1000 token 提示约 0.6 秒 |
| decode | 63–65 tok/s | 中文约 40–50 字/秒 |
| 显存 | 4.2GB / 6.1GB（32K 上下文） | 剩 1.8GB，跑不动别的模型 |
| 冷启动 | 4 秒 | 每次都重新加载，无 keep-alive |
| 上下文 | 32768 token ≈ 4–5 万汉字 | 超出直接 400 报错，不截断 |

**长上下文会拖慢 decode**（每个新 token 都要重看全部历史）：8K 时 63 tok/s，24K 时掉到 **11 tok/s**，首字延迟 14 秒。跑长上下文先确认用户能接受这个速度。

## 能力边界（误用会翻车）

- **别拿它跑长会话**：本会话实测到 26,259 token 时直接 400 `exceed_context_size_error`。32K 也撑不了几轮，长任务留给 `deepseek-flash`；本地模型配**新会话**用。
- **纯文本**：没有视觉投影，传图片报错。
- **工具调用**：单步能出正确的 `tool_calls`（已验证），多步编排不可靠，别让它当 agent。
- **创作质量**低于 `deepseek-flash`：适合「够用」的批量活，不适合出要交付的正文。

## 排障

| 现象 | 原因与处理 |
|---|---|
| `/health` 连不上 | 服务没起 → 跑 `start-llama.ps1`；端口被占 → 换脚本里的 `$port` |
| prefill 只有 ~110 tok/s | `-ub` 退回了默认 512。必须 `-ub 1024`（15 倍差距） |
| 返回的 `content` 是空的 | 思考模式没关。必须 `-rea off`，否则 token 全烧在 `reasoning_content` |
| 显存不足 / 掉到 CPU | 上下文调太大或别的程序占了显存；关掉游戏/浏览器硬件加速，或 `-c` 降到 8192 |
| 中文乱码 | PowerShell 调用时用 `[Text.Encoding]::UTF8.GetBytes()`，别直接传字符串 |
| 长提示超时 | prefill 1500 tok/s，2 万 token 要 13 秒；调大超时或减少输入 |
| 400 `exceed_context_size_error` | 提示超过 `-c` 设定。先看 `n_prompt_tokens`：离 32768 还远就换新会话，量级超过 3 万就直接换 deepseek；单纯调大 `-c` 只会让 decode 更慢 |

## 硬约束

- **不要改 `start-llama.ps1` 里的 `-ub 1024` / `-rea off`**：这两个参数是实测调出来的，改回去性能和质量都会崩。
- **批量前先估算成本**：`token 数 / 1500` 秒 = 每条的固定开销，`输出 token / 60` 秒 = 生成开销。1000 条 × 500 token 大约 6 分钟，可以接受；1000 条 × 5000 token 要 1 小时，先跟用户确认。
- **不要用它跑需要长上下文的 agent 回合**，这类任务留在 `deepseek-flash`。
- 它只监听 `127.0.0.1`：手机/局域网访问需要改 `--host 0.0.0.0` 并加 `--api-key`，否则同网段任何人都能用你的显卡。
