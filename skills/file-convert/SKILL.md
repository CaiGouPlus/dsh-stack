---
name: file-convert
description: 本地离线文件格式转换（FlyingMouse Format 内核：LibreOffice + FFmpeg + Poppler + Tesseract）。docx/xlsx/pptx/pdf/图片/音频/视频互转，PDF 转 Excel、扫描件 OCR、多图合并 PDF、PDF 拆图片、批量转换、压缩 zip。当用户说「转格式」「转成 PDF」「docx 转 pdf」「PDF 转 Excel」「PDF 转图片」「图片转 PDF」「视频转 MP3」「识别这张图的文字 / OCR」「批量转换」「压缩成 zip」时使用。
whenToUse: 需要把一个文件换成另一种格式；需要从 PDF / 截图 / 扫描件里拿文字或表格；需要图片合并 PDF 或 PDF 拆页；需要一次转一整个目录；排查转换失败（缺引擎、格式不支持、中文乱码）
---

# 文件格式转换（file-convert）

**一句话**：这台机器装着 `D:\flying mouse format\FlyingMouse Format`（自带 LibreOffice / FFmpeg / Poppler / Tesseract 的离线转换器）。本 skill 把它的转换内核跑成**无界面服务**，一条命令换格式——不用开 GUI、不用联网、不烧 API。

```bash
FMF="C:/Users/m0408/.dsh/skills/file-convert/scripts/fmf.py"
python "$FMF" convert 报告.docx pdf        # 产物落在原文件旁边：报告.pdf
```

## 什么时候用 / 不用

- 用：格式互换、要 PDF、要 Excel、要图片、要音频、要文字（OCR）、多图合并、批量、压缩。
- 不用：**生成/精细排版** Word、PPT、Excel → 用 `office-*` 技能；纯代码任务不需要转换。

## 能力矩阵

| 输入类别 | 扩展名 | 能转成 |
|---|---|---|
| 图片 | jpg jpeg png webp gif avif tif tiff bmp heic heif | png jpg webp avif tiff **pdf** **txt**(OCR) |
| 文本 | txt md html json csv log xml yaml | txt md html json csv、**pdf** |
| 文档 | doc docx odt rtf wps wpt wpd | pdf docx odt rtf txt html |
| 表格 | xls xlsx xlsm ods csv tsv et ett | pdf xlsx ods csv html（+ csv→json / csv→md） |
| 幻灯片 | ppt pptx odp dps dpt | pdf pptx odp html |
| PDF | pdf | xlsx txt html png jpg |
| 音频 | mp3 wav flac m4a aac ogg opus wma | mp3 wav flac m4a ogg |
| 视频 | mp4 mov mkv webm avi m4v wmv flv | mp4 webm mkv mov mp3 wav flac m4a ogg |
| 任意 | * | zip |

不确定就问：`python "$FMF" targets 那个文件` 会列出这个文件实际能转成什么。

## 命令

```bash
python "$FMF" convert <文件...> <目标扩展名> [-o 输出文件或目录] [--all-sheets]
python "$FMF" batch   <目录或文件> <目标扩展名> [-o 输出目录] [--pattern "*.docx"] [--recursive]
python "$FMF" merge   <图片...> -o 合集.pdf
python "$FMF" ocr     <图片或PDF> [-o 输出.txt]
python "$FMF" targets <文件或扩展名>
python "$FMF" caps                      # 完整格式矩阵
python "$FMF" doctor                    # 自检安装与四个引擎（会真起一次内核）
python "$FMF" serve/status/stop         # 可选：常驻服务，省掉每次 ~2s 启动
```

- 全局 `--json`（结构化结果）、`--quiet`（只打产物路径，一行一个）。
- 退出码：`0` 成功、`2` 转换失败（含不支持该目标格式）、`4` 环境问题（安装目录/引擎缺失）。
- 输出默认**覆盖**同名产物，位置 = 输入同目录；`-o 目录/` 或 `-o 不存在的名字` 当目录，`-o x.pdf` 当文件名。
- PDF 拆图片（pdf→png/jpg）的产物是多个文件，落 `<输入名>_pages/`（或 `-o` 指定目录），zip 已自动解开。
- 上传是流式的（1MB 分块），几百 MB 的视频也不会把内存吃爆；但超过 1GB 内核直接 413。

## 常用配方

| 需求 | 命令 |
|---|---|
| 文档转 PDF（保原样） | `convert a.docx pdf` |
| 给模型读的纯文本 | `convert a.docx txt`（要标题层级/表格结构用 `html`） |
| 表格型 PDF 转 Excel | `convert a.pdf xlsx` |
| 正文型 PDF 拿文字 | `convert a.pdf txt`（别用 xlsx，会碎） |
| 扫描件 / 截图出文字 | `ocr a.pdf` 或 `ocr a.png`（中英混排，自动 200dpi + eng+chi_sim；表格页会得到 Tab 分隔的碎片，不做结构化） |
| 多图拼一份 PDF | `merge 1.png 2.jpg 3.png -o 合集.pdf` |
| 整个目录批量转 | `batch ./素材 pdf -o ./out` |
| 视频抽音轨 | `convert a.mp4 mp3` |
| 多工作表导出 csv | `convert book.xlsx csv --all-sheets` |
| 任意文件打包 | `convert x.bin zip` |

## 三条实现路径（了解即可，命令不用换）

1. **转换内核**（绝大多数）：用 App 自带的 Electron 以 `ELECTRON_RUN_AS_NODE` 加载 `resources\app.asar\server.js`——**与 GUI 点「转换」跑的是同一份代码**，所以格式矩阵、编码、OCR 参数完全一致。一条命令内多个文件复用一个进程，命令结束自动关；单次启动约 2 秒。
2. **本地直接做**：txt/md/html/json/csv 之间互转（含 GUI 没有的 `csv→json`、`csv→md`），纯 Python 标准库，毫秒级。
3. **LibreOffice 中转**：txt/md/html → pdf（GUI 的文本类到不了 pdf），渲染用 Writer/Web，**不认 CSS**。

## 实测性能（RTX 笔记本，2026-11 实测）

| 任务 | 耗时 |
|---|---|
| 50 页 docx → pdf | ~5 s |
| 50 页 pdf → png（150dpi） | ~7 s |
| 50 页 pdf → txt | ~2 s |
| 单页 OCR | ~3 s（含内核启动） |
| 10 s 720p mp4 → mp3 | ~1.6 s |
| 10 s 720p mp4 → webm（VP9） | ~9 s |

大文件（>100MB 视频、>500 页 PDF）先跟用户确认再跑。

## 已知坑（都实测过）

| 现象 | 真正原因 | 怎么办 |
|---|---|---|
| `csv→json` 报「不能转换」 | GUI 把 csv 归表格类，表格类到不了 json | 本 skill 的本地路径已补，直接 `convert a.csv json` |
| 多工作表 xlsx→csv 只出第一张 | LibreOffice 默认行为，无提示 | 加 `--all-sheets`，每表一个文件 |
| 导出的 csv 用 Excel 双击打开是乱码 | 导出为 UTF-8（LF/CRLF 标准），Excel 按本地代码页猜 | Excel 里用「数据 → 从文本/CSV」并选 UTF-8；文字本身没坏 |
| PDF→xlsx 结果七零八落 | 内核按文字坐标聚行聚列，不是还原原表 | 只适合真表格型 PDF；正文型先 `pdf→txt` |
| md→pdf 样式很素 | Writer/Web 渲染，忽略 CSS | 要好看就换 HTML→浏览器打印，或走 `office-*` |
| `.heic` 报错 | 内置 sharp/ffmpeg 无 libheif | 先转 jpg（系统相册导出）或让用户换图 |
| 首次调用慢 ~2 s | 每次起内核进程 | 批量用 `batch`；连续多次用 `serve` 常驻 |
| `docx→md` 不支持 | 内核文档类目标是 pdf/docx/odt/rtf/txt/html | 用 `docx→html`（保留标题和表格），或先 `txt` |
| 中文/空格文件名 | 内核按 mojibake 规则还原上传名 | 已处理好，**不需要**改名 |
| 转换中途 kill 了进程 | Electron 内核连同转换一起死 | 重跑即可；别拿 `taskkill` 打断 |

## 排障

先跑 `python "$FMF" doctor`：逐项检查安装目录、四个引擎、OCR 语言包，并**真起一次内核**打印 `{"libreoffice":true,"ffmpeg":true,"poppler":true,"ocr":true,...}`。全 OK 说明环境没问题，错误在输入文件或格式组合上。

- `转换内核启动即退出` / `找不到转换内核` → 安装目录变了：改 `~/.dsh/skills/file-convert/fmf.config.json`（`{"install": "D:\\新路径\\FlyingMouse Format"}`）或设 `FMF_INSTALL`。
- 想直接调二进制（不用本 skill）：见 `references/raw-commands.md`，soffice / ffmpeg / pdftoppm 的原始命令都实测过。
- 报错文本原样来自内核（中文），一般能直接看懂；报「这个源文件暂时不能转换成所选格式」就是矩阵不支持，用 `targets` 确认。

## 硬约束

- **别移动/改名 App 安装目录**，别删 `resources\` 下的东西；路径变了改 `fmf.config.json`。
- 单次文件上限 1GB（内核 multer 限制）。
- 转换产物默认覆盖同名文件——批量转之前先看一眼 `-o` 目录，别覆盖用户的原稿。
- 不要为了"清理"去 stop 别人起的常驻服务；`status` 看一眼就行。
- 这个内核只在本机跑（127.0.0.1，随机端口），不联网、不传云端。
