# 底层细节与兜底命令

`fmf.py` 出问题时，这里的东西能让你绕过它直接干活。全部命令都在本机实测过（2026-11，LibreOffice 26.2.1 / FFmpeg 8.1.1 / Poppler 26.05）。

## 目录与组件

```
D:\flying mouse format\FlyingMouse Format\
├─ FlyingMouse Format.exe                    Electron 壳（GUI 入口，也可当 node 用）
├─ resources\
│  ├─ app.asar                               转换内核（server.js + sharp + pdfjs + exceljs + tesseract.js）
│  ├─ app.asar.unpacked\node_modules\        原生模块（sharp、canvas、tesseract.js）
│  ├─ libreoffice\LibreOfficePortable\App\libreoffice\program\soffice.com
│  ├─ ffmpeg\ffmpeg.exe
│  ├─ poppler\Library\bin\{pdfinfo.exe,pdftoppm.exe}
│  ├─ tessdata\{chi_sim,eng}.traineddata.gz
│  └─ tesseract.js-core\                     OCR 的 WASM 运行时
└─ locales\, *.dll, *.pak                     壳的其余部分
```

关键点：**没有 `tesseract.exe`**。OCR 是 tesseract.js（WASM）跑在 Electron 里，所以只能通过内核调用；其他转换都有独立二进制。

## 内核启动（fmf_server.js 干的事）

```bash
ELECTRON_RUN_AS_NODE=1 \
FMF_INSTALL="D:\\flying mouse format\\FlyingMouse Format" FMF_PORT=0 FMF_IDLE_EXIT=60 \
"D:/flying mouse format/FlyingMouse Format/FlyingMouse Format.exe" \
"C:/Users/m0408/.dsh/skills/file-convert/scripts/fmf_server.js"
```

就绪后 stdout 打一行 JSON：`{"ready":true,"url":"http://127.0.0.1:PORT","port":PORT,"pid":...}`。

- `ELECTRON_RUN_AS_NODE=1` 让 Electron 以 node 模式跑（本机 43.1.0 / node 24.18），这样能直接 `require` asar 里的 server.js 和全部依赖。
- `process.resourcesPath` 是只读属性，但因为它由 exe 所在目录推导，**exe 在安装目录里就自动正确**，tessdata / tesseract.js-core 都能找到。启动器设置失败的那条 warn 是无害的。
- `FMF_IDLE_EXIT` 的空闲自退在 http 层按「无在途请求」计时，转视频几十分钟也不会被杀；但 `taskkill` 会连转换一起打断。

## HTTP API（想自己写客户端时）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/capabilities` | 引擎状态 + 格式矩阵 |
| POST | `/api/targets` | body `{"extension":"docx"}` → 可用目标 |
| POST | `/api/convert` | multipart：`file=<文件>`，`targetFormat=pdf` → `{ok,fileName,mimeType,downloadUrl}` |
| POST | `/api/convert-images-to-pdf` | multipart：多个 `files=` → 合并 PDF |
| GET | `/downloads/<id>` | 取产物（内存里存 1 小时） |

```bash
curl -s -X POST http://127.0.0.1:PORT/api/convert -F "file=@报告.docx" -F "targetFormat=pdf"
```

上传名按 UTF-8 原样发即可，内核会把 multer 解出的 mojibake 还原回中文；下载目录会自动清理（1 小时）。

## 直接调二进制

**LibreOffice**（必须给独立 profile，否则和 GUI/其他实例抢锁）：

```bash
SOFFICE="D:/flying mouse format/FlyingMouse Format/resources/libreoffice/LibreOfficePortable/App/libreoffice/program/soffice.com"
"$SOFFICE" --headless --nologo --nofirststartwizard --nodefault --nolockcheck \
  "-env:UserInstallation=file:///D:/tmp/fmf-profile" \
  --convert-to pdf --outdir "D:/out" "D:/in/报告.docx"
```

- 目标写 `pdf` / `docx` / `odt` / `rtf` / `txt` / `html` / `xlsx` / `ods` / `csv` / `pptx` / `odp`。
- 文本类要指定过滤器时才写冒号：`--convert-to "txt:Text"`、`--convert-to "csv:Text - txt - csv (StarCalc)"`。
- **每张表导一个 csv**（GUI 没暴露的能力）：过滤器选项最后一位 `-1` 表示所有工作表
  `--convert-to "csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,false,false,false,-1"`，产物名形如 `工作簿-表名.csv`。
- HTML 按 Writer/Web 打开，能导 pdf，**不能**导 docx（会报 `no export filter`）。
- 失败信息在 stdout/stderr，`Error: source file could not be loaded` 基本都是路径写错（MSYS 的 `/tmp` 不是 Windows 路径）。

**FFmpeg**（与内核参数一致）：

```bash
FF="D:/flying mouse format/FlyingMouse Format/resources/ffmpeg/ffmpeg.exe"
"$FF" -hide_banner -y -i in.mp4 -vn -codec:a libmp3lame -q:a 2 out.mp3          # mp3
"$FF" -hide_banner -y -i in.mp4 -vn -codec:a aac -b:a 192k out.m4a             # m4a
"$FF" -hide_banner -y -i in.mp4 -vn -codec:a libopus -b:a 160k out.ogg         # ogg
"$FF" -hide_banner -y -i in.mov -codec:v libx264 -preset medium -crf 23 \
      -codec:a aac -movflags +faststart out.mp4                                # mp4 / mov / mkv
"$FF" -hide_banner -y -i in.mp4 -codec:v libvpx-vp9 -crf 32 -b:v 0 -codec:a libopus out.webm
```

webm 用 VP9，慢（10 s 720p 约 9 s）；要快就 `-c copy`（但只有同容器可 copy）。
音频文件不能转视频容器（内核会直接拒绝）。

**Poppler**：

```bash
PD="D:/flying mouse format/FlyingMouse Format/resources/poppler/Library/bin"
"$PD/pdfinfo.exe" a.pdf | grep Pages
"$PD/pdftoppm.exe" -png -r 150 a.pdf page        # → page-1.png, page-2.png…
"$PD/pdftoppm.exe" -jpeg -r 200 a.pdf page       # OCR 用的分辨率
```

## 产物细节（预期管理）

| 转换 | 实现 | 后果 |
|---|---|---|
| 图片 → PDF | 内核手写 PDF，页面尺寸 = 图片像素数（1px = 1pt），Flate 压缩 RGB | 640×480 的图 → 8.9×6.7 英寸页面；不缩放、不加白边 |
| PDF → PNG/JPG | pdftoppm，固定 150dpi | 一页一个文件，打包 zip 后由 fmf.py 解开 |
| 扫描 PDF → txt | pdftoppm 200dpi + tesseract（eng+chi_sim，preserve_interword_spaces） | 每页一个 `## Page N` 段 |
| PDF → xlsx | pdfjs 取文字坐标：y 差 ≤3 归一行、x 差 ≤10 归一列 | 只对真表格有效；正文/多栏会串列 |
| xlsx → csv | LibreOffice，UTF-8、逗号、CRLF，**无 BOM** | Excel 双击可能乱码，用「数据→从文本/CSV」导入 |
| 图片互转 | sharp，自动按 EXIF 旋转；jpg 质量 90 | 动图（gif）取全部帧转 png 只留首帧 |
| 任意 → zip | deflate 单文件 | 就是打包，不重命名 |
| 文本互转 | fmf.py 本地实现，语义同 GUI | html→txt 会去标签、压空行；json→csv 只认对象数组 |

## 安装目录变了怎么办

```bash
python fmf.py doctor      # 先看哪一项 FAIL
```

1. 写 `C:\Users\m0408\.dsh\skills\file-convert\fmf.config.json`：`{"install": "D:\\新路径\\FlyingMouse Format"}`；
2. 或临时 `set FMF_INSTALL=D:\新路径\FlyingMouse Format`。

移动安装目录后 `resources\` 结构必须原样保留（app.asar、四个引擎目录一个不能少）。
