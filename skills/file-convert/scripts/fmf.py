#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""fmf —— FlyingMouse Format 无界面文件格式转换 CLI（只用标准库）。

主入口走 App 自带的转换内核（ELECTRON_RUN_AS_NODE 加载 app.asar/server.js），
所以格式矩阵、编码、OCR 参数与 GUI 完全一致；纯文本类转换在本地直接做（快、无依赖）。

用法见 SKILL.md，或 python fmf.py -h。
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import os
import queue
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
import uuid
import zipfile
from pathlib import Path

try:  # Windows 控制台默认代码页可能不是 UTF-8
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:  # pragma: no cover
    pass

SKILL_DIR = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = Path(__file__).resolve().parent
SERVER_JS = SCRIPTS_DIR / "fmf_server.js"
CONFIG_PATH = SKILL_DIR / "fmf.config.json"
DEFAULT_INSTALL = Path(r"D:\flying mouse format\FlyingMouse Format")
# 状态目录放在 skill 里：TEMP 在不同 shell（bash/pwsh/桌面）下不一定是同一个，
# 放那儿会导致 serve 起的常驻服务下次找不到、变成孤儿进程。
STATE_DIR = SKILL_DIR / ".state"
STATE_PATH = STATE_DIR / "server.json"
STATE_LOG = STATE_DIR / "server.log"

# ---------------------------------------------------------------- 格式矩阵（与 GUI 一致）

IMAGE_IN = {"jpg", "jpeg", "png", "webp", "gif", "avif", "tif", "tiff", "bmp", "heic", "heif"}
IMAGE_T = ["png", "jpg", "webp", "avif", "tiff", "pdf", "txt"]
TEXT_IN = {"txt", "md", "markdown", "html", "htm", "json", "csv", "log", "xml", "yaml", "yml"}
TEXT_T = ["txt", "md", "html", "json", "csv"]
DOC_IN = {"doc", "docx", "odt", "rtf", "wps", "wpt", "wpd"}
DOC_T = ["pdf", "docx", "odt", "rtf", "txt", "html"]
SHEET_IN = {"xls", "xlsx", "xlsm", "ods", "csv", "tsv", "et", "ett"}
SHEET_T = ["pdf", "xlsx", "ods", "csv", "html"]
SLIDE_IN = {"ppt", "pptx", "odp", "dps", "dpt"}
SLIDE_T = ["pdf", "pptx", "odp", "html"]
PDF_IN = {"pdf"}
PDF_T = ["xlsx", "txt", "html", "png", "jpg"]
AUDIO_IN = {"mp3", "wav", "flac", "m4a", "aac", "ogg", "opus", "wma"}
AUDIO_T = ["mp3", "wav", "flac", "m4a", "ogg"]
VIDEO_IN = {"mp4", "mov", "mkv", "webm", "avi", "m4v", "wmv", "flv"}
VIDEO_T = ["mp4", "webm", "mkv", "mov"] + AUDIO_T

NORMALIZE = {"jpeg": "jpg", "markdown": "md", "htm": "html", "tif": "tiff"}


def _norm_ext(ext: str) -> str:
    ext = (ext or "").lower().lstrip(".")
    return NORMALIZE.get(ext, ext)


def ext_of(path) -> str:
    return _norm_ext(Path(path).suffix)


def category_for(ext: str) -> str:
    """与 server.js 的 categoryForExt 同序：image → pdf → document → spreadsheet → presentation → text → audio → video。"""
    ext = (ext or "").lower()
    norm = _norm_ext(ext)
    if ext in IMAGE_IN or norm in IMAGE_IN:
        return "image"
    if ext in PDF_IN:
        return "pdf"
    if ext in DOC_IN:
        return "document"
    if ext in SHEET_IN:
        return "spreadsheet"
    if ext in SLIDE_IN:
        return "presentation"
    if ext in TEXT_IN:
        return "text"
    if ext in AUDIO_IN:
        return "audio"
    if ext in VIDEO_IN:
        return "video"
    return "unknown"


def engine_targets(ext: str) -> list:
    """转换内核能接的目标格式（不含本地快路径）。"""
    cat = category_for(ext)
    out = ["zip"]
    if cat == "image":
        out += IMAGE_T
    elif cat == "text":
        out += TEXT_T
    elif cat == "pdf":
        out += PDF_T
    elif cat == "document":
        out += DOC_T
    elif cat == "spreadsheet":
        out += SHEET_T
    elif cat == "presentation":
        out += SLIDE_T
    elif cat == "audio":
        out += AUDIO_T
    elif cat == "video":
        out += VIDEO_T
    norm = _norm_ext(ext)
    return [t for t in dict.fromkeys(out) if t != norm or t == "zip"]


LOCAL_TEXT_EXTS = {"txt", "md", "html", "json", "log", "xml", "yaml", "yml"}
TEXT2PDF_EXTS = {"txt", "md", "html"}


def local_targets(ext: str) -> list:
    """本地直接做的目标格式（其余走内核）。

    - 纯文本族：语义与 GUI 的 convertText 一致，省掉一次进程启动。
    - csv → json/md：GUI 把 csv 归到表格类，只能转 pdf/xlsx/ods/csv/html，这两个是补的缺口。
    - txt/md/html → pdf：GUI 的文本类到不了 pdf，用 LibreOffice 走 html 中转。
    """
    ext = _norm_ext(ext)
    out = []
    if ext in LOCAL_TEXT_EXTS:
        out += [t for t in TEXT_T if t != ext]
    if ext in {"csv", "tsv"}:
        out += [t for t in ("json", "md") if t != ext]
    if ext in TEXT2PDF_EXTS:
        out += ["pdf"]
    return list(dict.fromkeys(out))


def targets_for(path) -> list:
    ext = ext_of(path)
    if not ext:
        return ["zip"]
    return list(dict.fromkeys(engine_targets(ext) + local_targets(ext)))


# ---------------------------------------------------------------- 安装目录 / 路径

def _config_install():
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        return data.get("install")
    except Exception:
        return None


def install_dir() -> Path:
    candidates = [os.environ.get("FMF_INSTALL"), _config_install(), str(DEFAULT_INSTALL)]
    for cand in candidates:
        if not cand:
            continue
        p = Path(cand)
        if (p / "FlyingMouse Format.exe").is_file():
            return p
    return Path(os.environ.get("FMF_INSTALL") or _config_install() or DEFAULT_INSTALL)


class Env:
    def __init__(self, install: Path | None = None):
        self.install = Path(install) if install else install_dir()
        self.exe = self.install / "FlyingMouse Format.exe"
        self.resources = self.install / "resources"
        self.asar = self.resources / "app.asar"          # 打包文件，里面的 server.js 只有 asar 能读
        self.asar_server = self.asar / "server.js"        # 仅用于报错提示
        self.soffice = (
            self.resources / "libreoffice" / "LibreOfficePortable" / "App" / "libreoffice" / "program" / "soffice.com"
        )
        self.ffmpeg = self.resources / "ffmpeg" / "ffmpeg.exe"
        self.pdfinfo = self.resources / "poppler" / "Library" / "bin" / "pdfinfo.exe"
        self.pdftoppm = self.resources / "poppler" / "Library" / "bin" / "pdftoppm.exe"
        self.tessdata = self.resources / "tessdata"

    def check(self):
        missing = [str(p) for p in (self.exe, self.asar, self.soffice) if not p.exists()]
        if missing:
            raise EnvError(
                "安装目录里缺文件：\n  " + "\n  ".join(missing)
                + "\n如果 App 换了位置，把正确路径写进 " + str(CONFIG_PATH)
                + '  {"install": "D:\\\\新路径\\\\FlyingMouse Format"}，或设 FMF_INSTALL。'
            )


class EnvError(RuntimeError):
    pass


class ConvertError(RuntimeError):
    pass


# ---------------------------------------------------------------- 转换服务

class Server:
    """拉起/连接一个无界面转换内核（App 自己的 Electron + app.asar/server.js）。"""

    def __init__(self, env: Env, port: int = 0, idle: int = 45, timeout: float = 90):
        self.env = env
        self.port = port
        self.idle = idle
        self.timeout = timeout
        self.proc = None
        self.url = ""
        self.pid = 0
        self.lines: list[str] = []
        self._lock = threading.Lock()

    # -- 生命周期
    def start(self):
        self.env.check()
        env = os.environ.copy()
        env["ELECTRON_RUN_AS_NODE"] = "1"
        env["FMF_INSTALL"] = str(self.env.install)
        env["FMF_PORT"] = str(self.port)
        env["FMF_IDLE_EXIT"] = str(self.idle)
        flags = 0
        if os.name == "nt":
            flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        try:
            self.proc = subprocess.Popen(
                [str(self.env.exe), str(SERVER_JS)],
                env=env,
                cwd=str(SCRIPTS_DIR),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
                creationflags=flags,
            )
        except OSError as exc:
            raise EnvError(f"无法启动转换内核：{exc}") from exc

        q: "queue.Queue[str]" = queue.Queue()

        def pump():
            assert self.proc and self.proc.stdout
            for line in self.proc.stdout:
                q.put(line)
            q.put("")

        threading.Thread(target=pump, daemon=True).start()

        deadline = time.time() + self.timeout
        while time.time() < deadline:
            try:
                line = q.get(timeout=0.5)
            except queue.Empty:
                if self.proc.poll() is not None:
                    raise EnvError("转换内核启动即退出：\n" + "".join(self.lines[-8:]))
                continue
            if line == "" and self.proc.poll() is not None:
                raise EnvError("转换内核启动即退出：\n" + "".join(self.lines[-8:]))
            with self._lock:
                self.lines.append(line)
            idx = line.find('{"ready":')
            if idx >= 0:
                try:
                    payload = json.loads(line[idx:])
                except json.JSONDecodeError:
                    continue
                if not payload.get("ready"):
                    raise EnvError(payload.get("error") or "转换内核未就绪")
                self.url = payload["url"]
                self.port = int(payload["port"])
                self.pid = int(payload.get("pid") or self.proc.pid)
                return self
        self.close()
        raise EnvError("转换内核启动超时（90s）：\n" + "".join(self.lines[-8:]))

    def shutdown_gracefully(self) -> bool:
        """走 /__shutdown：内核能删掉自己的临时工作区再退。"""
        if not self.url:
            return False
        try:
            urllib.request.urlopen(self.url + "/__shutdown", timeout=5).read()
            return True
        except Exception:
            return False

    def close(self):
        if self.proc and self.proc.poll() is None:
            if self.shutdown_gracefully():
                try:
                    self.proc.wait(timeout=8)
                    return
                except Exception:
                    pass
            if os.name == "nt":
                subprocess.run(
                    ["taskkill", "/PID", str(self.pid or self.proc.pid), "/T", "/F"],
                    capture_output=True,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                )
            else:  # pragma: no cover
                self.proc.terminate()
            try:
                self.proc.wait(timeout=10)
            except Exception:
                pass

    def __enter__(self):
        return self.start()

    def __exit__(self, *exc):
        self.close()

    # -- HTTP
    def _request(self, path: str, body: bytes | None = None, headers=None, method="GET", timeout=None):
        url = self.url + path
        req = urllib.request.Request(url, data=body, headers=headers or {}, method=method)
        try:
            with urllib.request.urlopen(req, timeout=timeout or 7200) as resp:
                return resp.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")
            try:
                detail = json.loads(detail).get("error") or detail
            except Exception:
                pass
            raise ConvertError(str(detail).strip() or f"HTTP {exc.code}") from exc
        except urllib.error.URLError as exc:
            raise ConvertError(f"转换内核无响应：{exc.reason}") from exc

    def capabilities(self) -> dict:
        return json.loads(self._request("/api/capabilities", timeout=60).decode("utf-8"))

    def convert(self, src: Path, target: str) -> dict:
        fields = {"targetFormat": target}
        body, headers = _multipart(fields, "file", src)
        raw = self._request("/api/convert", body=body, headers=headers, method="POST")
        payload = json.loads(raw.decode("utf-8"))
        if not payload.get("ok"):
            raise ConvertError(payload.get("error") or "转换失败")
        return payload

    def merge_images(self, paths: list[Path]) -> dict:
        body, headers = _multipart({}, "files", paths)
        raw = self._request("/api/convert-images-to-pdf", body=body, headers=headers, method="POST")
        payload = json.loads(raw.decode("utf-8"))
        if not payload.get("ok"):
            raise ConvertError(payload.get("error") or "合并失败")
        return payload

    def download(self, payload: dict, dest: Path) -> Path:
        dest.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(self.url + payload["downloadUrl"], timeout=7200) as resp:
            with open(dest, "wb") as fh:
                shutil.copyfileobj(resp, fh, 1 << 20)
        return dest


def _multipart(fields: dict, files_key: str, files) -> tuple[object, dict]:
    """手搓 multipart，文件按 1MB 分块流式发（大视频不占内存）。

    文件名按 UTF-8 原样发，内核会按 mojibake 规则还原中文名。
    """
    if isinstance(files, (str, Path)):
        files = [files]
    paths = [Path(f) for f in files]
    boundary = "----fmf" + uuid.uuid4().hex

    preamble = bytearray()
    for key, value in fields.items():
        preamble += f"--{boundary}\r\n".encode()
        preamble += f'Content-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode("utf-8")

    parts = []
    total = len(preamble)
    for path in paths:
        head = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="{files_key}"; filename="{path.name}"\r\n'
            "Content-Type: application/octet-stream\r\n\r\n"
        ).encode("utf-8")
        size = path.stat().st_size
        parts.append((head, path, size))
        total += len(head) + size + 2
    footer = f"--{boundary}--\r\n".encode()
    total += len(footer)

    def body():
        yield bytes(preamble)
        for head, path, _size in parts:
            yield head
            with open(path, "rb") as fh:
                while True:
                    chunk = fh.read(1 << 20)
                    if not chunk:
                        break
                    yield chunk
            yield b"\r\n"
        yield footer

    headers = {
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Content-Length": str(total),
    }
    return body(), headers


# ---------------------------------------------------------------- 常驻服务（可选）

def _ping(port: int, timeout: float = 3.0) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/capabilities", timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8")).get("tools") is not None
    except Exception:
        return False


def _read_state() -> dict:
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _write_state(data: dict):
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def kept_server(env: Env) -> Server | None:
    state = _read_state()
    port = state.get("port")
    if not port:
        return None
    if state.get("install") and Path(state["install"]) != env.install:
        return None
    if not _ping(int(port)):
        return None
    srv = Server(env, port=int(port), idle=0)
    srv.url = f"http://127.0.0.1:{port}"
    srv.pid = int(state.get("pid") or 0)
    srv.proc = None  # 不是我们的子进程，close() 不会杀它
    return srv


def acquire_server(env: Env, keep: bool = False, idle: int = 45, allow_kept: bool = True) -> tuple[Server, bool]:
    """返回 (server, 是否本次新起)。"""
    if allow_kept:
        existing = kept_server(env)
        if existing:
            return existing, False
    srv = Server(env, idle=0 if keep else idle)
    srv.start()
    return srv, True


# ---------------------------------------------------------------- 本地快路径

def _escape(value: str) -> str:
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _read_text(path: Path) -> str:
    data = Path(path).read_bytes()
    for enc in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", "replace")


def _md_to_html(markdown: str) -> str:
    out, in_list = [], False
    for line in markdown.replace("\r\n", "\n").split("\n"):
        heading = re.match(r"^(#{1,6})\s+(.+)$", line)
        bullet = re.match(r"^[-*]\s+(.+)$", line)
        if heading:
            if in_list:
                out.append("</ul>")
                in_list = False
            level = len(heading.group(1))
            out.append(f"<h{level}>{_escape(heading.group(2))}</h{level}>")
            continue
        if bullet:
            if not in_list:
                out.append("<ul>")
                in_list = True
            out.append(f"<li>{_escape(bullet.group(1))}</li>")
            continue
        if in_list:
            out.append("</ul>")
            in_list = False
        out.append("" if not line.strip() else f"<p>{_escape(line)}</p>")
    if in_list:
        out.append("</ul>")
    return _html_page("Converted document", "\n".join(out))


def _html_page(title: str, body: str) -> str:
    return (
        '<!doctype html>\n<html lang="zh-CN">\n<head><meta charset="utf-8">'
        f"<title>{_escape(title)}</title>\n<style>body{{font-family:\"Microsoft YaHei\",Arial,sans-serif;"
        "margin:32px;line-height:1.7}pre{white-space:pre-wrap}"
        "table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px 8px}</style>"
        f"</head>\n<body>\n{body}\n</body>\n</html>"
    )


def _html_to_text(html: str) -> str:
    text = re.sub(r"<script[\s\S]*?</script>", "", html, flags=re.I)
    text = re.sub(r"<style[\s\S]*?</style>", "", text, flags=re.I)
    text = re.sub(r"</(p|div|h[1-6]|li|tr)>", "\n", text, flags=re.I)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    for a, b in (("&nbsp;", " "), ("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"')):
        text = text.replace(a, b)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _csv_rows(csv_text: str) -> list:
    rows = []
    for line in csv_text.replace("\r\n", "\n").split("\n"):
        if not line:
            continue
        cells, cur, quoted, i = [], "", False, 0
        while i < len(line):
            ch = line[i]
            if ch == '"' and i + 1 < len(line) and line[i + 1] == '"':
                cur += '"'
                i += 2
                continue
            if ch == '"':
                quoted = not quoted
            elif ch == "," and not quoted:
                cells.append(cur)
                cur = ""
            else:
                cur += ch
            i += 1
        cells.append(cur)
        rows.append(cells)
    return rows


def _csv_to_json(csv_text: str) -> str:
    rows = _csv_rows(csv_text)
    if not rows:
        return "[]"
    headers = rows[0]
    data = [
        {headers[i] if i < len(headers) and headers[i] else f"column_{i + 1}": (row[i] if i < len(row) else "") for i in range(len(headers))}
        for row in rows[1:]
    ]
    return json.dumps(data, ensure_ascii=False, indent=2)


def _csv_to_md(csv_text: str) -> str:
    rows = _csv_rows(csv_text)
    if not rows:
        return ""
    width = max(len(r) for r in rows)
    rows = [r + [""] * (width - len(r)) for r in rows]
    esc = lambda c: c.replace("|", "\\|").strip()
    lines = ["| " + " | ".join(esc(c) for c in rows[0]) + " |", "|" + "---|" * width]
    lines += ["| " + " | ".join(esc(c) for c in row) + " |" for row in rows[1:]]
    return "\n".join(lines) + "\n"


def _json_to_csv(text: str) -> str:
    data = json.loads(text)
    rows = data if isinstance(data, list) else [data]
    rows = [r for r in rows if isinstance(r, dict)]
    if not rows:
        raise ConvertError("JSON 顶层不是对象数组，转不了 CSV")
    headers = list(dict.fromkeys(k for row in rows for k in row))
    quote = lambda v: '"' + str("" if v is None else v).replace('"', '""') + '"'
    lines = [",".join(quote(h) for h in headers)]
    lines += [",".join(quote(row.get(h, "")) for h in headers) for row in rows]
    return "\n".join(lines)


def _pretty_json(text: str) -> str:
    return json.dumps(json.loads(text), ensure_ascii=False, indent=2)


def local_convert(src: Path, target: str, dest: Path) -> Path:
    """本地文本族转换。语义对齐 GUI 的 convertText，另外补 csv→json/md。"""
    source = ext_of(src)
    raw = _read_text(src)
    target = _norm_ext(target)

    if (source, target) in {("csv", "json"), ("tsv", "json")}:
        result = _csv_to_json(raw)
    elif (source, target) in {("csv", "md"), ("tsv", "md")}:
        result = _csv_to_md(raw.replace("\t", ",") if source == "tsv" else raw)
    elif target == "txt":
        result = _html_to_text(raw) if source in {"html"} else (_pretty_json(raw) if source == "json" else raw)
    elif target == "html":
        if source == "md":
            result = _md_to_html(raw)
        elif source == "html":
            result = raw
        else:
            result = _html_page("Converted text", f"<pre>{_escape(raw)}</pre>")
    elif target == "md":
        if source == "html":
            result = _html_to_text(raw)
        elif source == "json":
            result = "```json\n" + _pretty_json(raw) + "\n```\n"
        else:
            result = raw
    elif target == "json":
        if source == "json":
            result = _pretty_json(raw)
        else:
            result = json.dumps({"text": raw}, ensure_ascii=False, indent=2)
    elif target == "csv":
        if source == "json":
            result = _json_to_csv(raw)
        else:
            result = "\n".join('"' + line.replace('"', '""') + '"' for line in raw.splitlines())
    else:
        raise ConvertError(f"本地路径不支持 {source} → {target}")

    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(result, encoding="utf-8")
    return dest


# ---------------------------------------------------------------- 文本 → PDF（LibreOffice 中转）

def text_to_pdf(env: Env, src: Path, dest: Path, timeout: float = 300) -> Path:
    if not env.soffice.exists():
        raise EnvError("找不到 LibreOffice：" + str(env.soffice))
    source = ext_of(src)
    raw = _read_text(src)
    if source == "html":
        html = raw
    elif source == "md":
        html = _md_to_html(raw)
    else:
        html = _html_page(Path(src).stem, f"<pre>{_escape(raw)}</pre>")

    work = Path(tempfile.mkdtemp(prefix="fmf-txt2pdf-"))
    try:
        html_path = work / "doc.html"
        html_path.write_text(html, encoding="utf-8")
        out_dir = work / "out"
        out_dir.mkdir()
        profile = work / "profile"
        profile.mkdir()
        args = [
            str(env.soffice),
            "--headless",
            "--nologo",
            "--nofirststartwizard",
            "--nodefault",
            "--nolockcheck",
            f"-env:UserInstallation={profile.as_uri()}",
            "--convert-to",
            "pdf",
            "--outdir",
            str(out_dir),
            str(html_path),
        ]
        proc = subprocess.run(
            args,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0,
        )
        produced = out_dir / "doc.pdf"
        if not produced.exists():
            raise ConvertError((proc.stdout or "") + (proc.stderr or "") or "LibreOffice 没有产出 PDF")
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(produced, dest)
        return dest
    finally:
        shutil.rmtree(work, ignore_errors=True)


# ---------------------------------------------------------------- 多工作表导出

SHEET_CSV_FILTER = "csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,false,false,false,-1"


def count_sheets(path: Path):
    """xlsx/ods 有几张工作表；数不出来返回 None。"""
    try:
        with zipfile.ZipFile(path) as zf:
            if ext_of(path) in {"xlsx", "xlsm"}:
                xml = zf.read("xl/workbook.xml").decode("utf-8", "replace")
                return len(re.findall(r"<sheet\b", xml))
            if ext_of(path) == "ods":
                xml = zf.read("content.xml").decode("utf-8", "replace")
                return len(re.findall(r"<table:table\b", xml))
    except Exception:
        return None
    return None


def sheets_to_csv(env: Env, src: Path, dest_dir: Path) -> list[Path]:
    """每张工作表导一个 csv（LibreOffice 的 -1 选项，GUI 没暴露这个能力）。"""
    if not env.soffice.exists():
        raise EnvError("找不到 LibreOffice：" + str(env.soffice))
    work = Path(tempfile.mkdtemp(prefix="fmf-sheets-"))
    try:
        out_dir = work / "out"
        out_dir.mkdir()
        profile = work / "profile"
        profile.mkdir()
        proc = subprocess.run(
            [
                str(env.soffice),
                "--headless",
                "--nologo",
                "--nofirststartwizard",
                "--nodefault",
                "--nolockcheck",
                f"-env:UserInstallation={profile.as_uri()}",
                "--convert-to",
                SHEET_CSV_FILTER,
                "--outdir",
                str(out_dir),
                str(src),
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=600,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0,
        )
        produced = sorted(out_dir.glob("*.csv"))
        if not produced:
            raise ConvertError((proc.stdout or "") + (proc.stderr or "") or "没有导出任何 csv")
        dest_dir.mkdir(parents=True, exist_ok=True)
        outs = []
        for item in produced:
            dest = dest_dir / item.name
            shutil.copyfile(item, dest)
            outs.append(dest)
        return outs
    finally:
        shutil.rmtree(work, ignore_errors=True)


# ---------------------------------------------------------------- 输出路径

def resolve_output(src: Path, out_spec: str | None, produced_name: str) -> Path:
    if not out_spec:
        return Path(src).with_name(produced_name)
    spec = Path(out_spec)
    if out_spec.endswith(("/", "\\")) or spec.is_dir():
        return spec / produced_name
    if spec.suffix:
        return spec
    return spec / produced_name


def resolve_outdir(src: Path, out_spec: str | None, default_name: str) -> Path:
    """多文件产物（PDF 拆页）落哪个目录。"""
    if not out_spec:
        return Path(src).with_name(default_name)
    return Path(out_spec)


def _unzip_pages(zip_path: Path, dest_dir: Path) -> list[Path]:
    dest_dir.mkdir(parents=True, exist_ok=True)
    out = []
    with zipfile.ZipFile(zip_path) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            target = dest_dir / Path(info.filename).name
            with zf.open(info) as fsrc, open(target, "wb") as fdst:
                shutil.copyfileobj(fsrc, fdst)
            out.append(target)
    zip_path.unlink(missing_ok=True)
    return sorted(out)


# ---------------------------------------------------------------- 命令

def cmd_convert(args) -> int:
    env = Env()
    if len(args.inputs) > 1 and args.output and Path(args.output).suffix and not Path(args.output).is_dir():
        raise ConvertError("多个输入不能共用一个 -o 文件路径；-o 给目录，或分开跑。")
    results = []
    server = None
    spawned = False
    try:
        target = _norm_ext(args.target)
        for src_spec in args.inputs:
            src = Path(src_spec).expanduser()
            if not src.is_file():
                raise ConvertError(f"输入文件不存在：{src}")
            ext = ext_of(src)
            available = targets_for(src)
            if target not in available:
                raise ConvertError(
                    f"{src.suffix or '无扩展名'} 不能转 {target}。可选：" + "、".join(available)
                )
            started = time.time()

            # 工作簿 → csv：默认只有第一张表（LibreOffice 行为），多表就提示，--all-sheets 全导
            if target == "csv" and category_for(ext) == "spreadsheet" and ext in {"xlsx", "xlsm", "ods"}:
                if args.all_sheets:
                    dest_dir = resolve_outdir(src, args.output, Path(src).stem + "_sheets")
                    outputs, route = sheets_to_csv(env, src, dest_dir), "sheets"
                    results.append(_result(src, target, route, outputs, started))
                    _report(args, src, outputs)
                    continue
                sheet_count = count_sheets(src)
                if sheet_count and sheet_count > 1:
                    print(
                        f"注意：{src.name} 有 {sheet_count} 张工作表，csv 按 LibreOffice 行为只导出第一张；"
                        "要每张一个文件就加 --all-sheets。",
                        file=sys.stderr,
                    )

            outputs, route, server, spawned = _convert_one(env, src, target, args.output, server, spawned)
            results.append(_result(src, target, route, outputs, started))
            _report(args, src, outputs)
    finally:
        if server and spawned:
            server.close()

    if args.json:
        print(json.dumps(results if len(results) > 1 else results[0], ensure_ascii=False, indent=2))
    elif not args.quiet and len(results) > 1:
        print(f"\n完成 {len(results)} 个文件。")
    return 0


def _result(src, target, route, outputs, started) -> dict:
    return {
        "ok": True,
        "input": str(src),
        "target": target,
        "route": route,
        "outputs": [str(p) for p in outputs],
        "seconds": round(time.time() - started, 2),
    }


def _report(args, src, outputs):
    for p in outputs:
        if args.quiet:
            print(p)
        elif not args.json:
            print(f"OK  {src.name} -> {p}")


def _convert_one(env, src: Path, target: str, out_spec, server, spawned):
    """返回 (outputs, route, server, spawned)。纯文本/文本转 PDF 不需要服务。"""
    route = _route_for(src, target)
    if route == "local":
        produced = Path(src).with_suffix("." + target).name
        dest = resolve_output(src, out_spec, produced)
        return [local_convert(src, target, dest)], route, server, spawned
    if route == "text2pdf":
        dest = resolve_output(src, out_spec, Path(src).with_suffix(".pdf").name)
        return [text_to_pdf(env, src, dest)], route, server, spawned

    if server is None:
        server, spawned = acquire_server(env)
    payload = server.convert(src, target)
    name = payload["fileName"]
    if name.lower().endswith(".zip") and target != "zip":
        dest_dir = resolve_outdir(src, out_spec, Path(src).stem + "_pages")
        tmp_dir = Path(tempfile.mkdtemp(prefix="fmf-zip-"))
        try:
            tmp_zip = server.download(payload, tmp_dir / name)
            outputs = _unzip_pages(tmp_zip, dest_dir)
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        return outputs, route, server, spawned
    dest = resolve_output(src, out_spec, name)
    server.download(payload, dest)
    return [dest], route, server, spawned


def _route_for(src: Path, target: str) -> str:
    ext = ext_of(src)
    target = _norm_ext(target)
    if ext in LOCAL_TEXT_EXTS and target in TEXT_T and target != ext:
        return "local"
    if ext in {"csv", "tsv"} and target in {"json", "md"}:
        return "local"
    if ext in TEXT2PDF_EXTS and target == "pdf":
        return "text2pdf"
    return "service"


def cmd_batch(args) -> int:
    env = Env()
    root = Path(args.input).expanduser()
    if not root.exists():
        raise ConvertError(f"输入不存在：{root}")
    pattern = args.pattern
    files = []
    if root.is_file():
        files = [root]
        root = root.parent
    else:
        iterator = root.rglob("*") if args.recursive else root.glob("*")
        for p in sorted(iterator):
            if p.is_file() and (not pattern or fnmatch.fnmatch(p.name.lower(), pattern.lower())):
                files.append(p)
    target = _norm_ext(args.target)
    out_dir = Path(args.output).expanduser() if args.output else root / "converted"
    out_dir.mkdir(parents=True, exist_ok=True)

    done, skipped, failed = [], [], []
    server, spawned = None, False
    try:
        for src in files:
            available = targets_for(src)
            if target not in available:
                reason = f"{src.suffix or '无扩展名'} 不支持 {target}"
                skipped.append((src, reason))
                if not args.quiet and not args.json:
                    print(f"--  {src.name}: 跳过（{reason}）")
                continue
            started = time.time()
            try:
                outputs, route, server, spawned = _convert_one(env, src, target, str(out_dir), server, spawned)
                done.append((src, outputs))
                if not args.quiet and not args.json:
                    print(f"OK  {src.name} -> {', '.join(p.name for p in outputs)}  ({time.time() - started:.1f}s)")
            except (ConvertError, EnvError) as exc:
                failed.append((src, str(exc)))
                if not args.quiet and not args.json:
                    print(f"FAIL {src.name}: {exc}")
    finally:
        if server and spawned:
            server.close()

    payload = {
        "ok": not failed,
        "target": target,
        "out_dir": str(out_dir),
        "done": [{"input": str(s), "outputs": [str(p) for p in o]} for s, o in done],
        "skipped": [{"input": str(s), "reason": r} for s, r in skipped],
        "failed": [{"input": str(s), "error": r} for s, r in failed],
    }
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    elif not args.quiet:
        print(f"\n成功 {len(done)}，跳过 {len(skipped)}，失败 {len(failed)} -> {out_dir}")
    return 0 if not failed else 2


def cmd_merge(args) -> int:
    env = Env()
    images = [Path(p).expanduser() for p in args.inputs]
    for img in images:
        if not img.is_file():
            raise ConvertError(f"图片不存在：{img}")
        if category_for(ext_of(img)) != "image":
            raise ConvertError(f"不是图片：{img}")
    if not images:
        raise ConvertError("至少要一张图片")
    dest = Path(args.output).expanduser() if args.output else images[0].with_name(f"{images[0].stem}-merged.pdf")
    if dest.suffix.lower() != ".pdf":
        dest = dest / "merged.pdf"
    server, spawned = acquire_server(env)
    try:
        payload = server.merge_images(images)
        server.download(payload, dest)
    finally:
        if spawned:
            server.close()
    if args.json:
        print(json.dumps({"ok": True, "output": str(dest), "pages": len(images)}, ensure_ascii=False))
    elif args.quiet:
        print(dest)
    else:
        print(f"OK  {len(images)} 张图片 -> {dest}")
    return 0


def cmd_ocr(args) -> int:
    env = Env()
    src = Path(args.input).expanduser()
    if not src.is_file():
        raise ConvertError(f"文件不存在：{src}")
    cat = category_for(ext_of(src))
    if cat not in {"image", "pdf"}:
        raise ConvertError("OCR 只处理图片或 PDF")
    dest = Path(args.output).expanduser() if args.output else src.with_suffix(".txt")
    server, spawned = acquire_server(env, idle=120)
    try:
        payload = server.convert(src, "txt")
        server.download(payload, dest)
    finally:
        if spawned:
            server.close()
    text = dest.read_text(encoding="utf-8", errors="replace")
    if args.json:
        print(json.dumps({"ok": True, "output": str(dest), "chars": len(text)}, ensure_ascii=False))
    elif args.quiet:
        print(dest)
    else:
        print(f"OK  {src.name} -> {dest}（{len(text)} 字）")
    return 0


def cmd_targets(args) -> int:
    src = Path(args.input).expanduser()
    ext = ext_of(src) if src.suffix else _norm_ext(src.name)
    if not ext:
        raise ConvertError("给一个文件名或扩展名，比如 report.docx 或 docx")
    cat = category_for(ext)
    available = targets_for(Path("x." + ext))
    local = {t: _route_for(Path("x." + ext), t) for t in local_targets(ext)}
    if args.json:
        print(json.dumps({"ext": ext, "category": cat, "targets": available, "local": local}, ensure_ascii=False, indent=2))
    else:
        print(f".{ext}  类别={cat}")
        print("可转 -> " + ", ".join(available))
        labels = {"local": "本地直接做", "text2pdf": "LibreOffice 中转", "service": "转换内核"}
        for t, route in local.items():
            print(f"  {t:<6} {labels.get(route, route)}")
    return 0


def cmd_caps(args) -> int:
    matrix = {
        "image": {"inputs": sorted(IMAGE_IN), "targets": IMAGE_T},
        "text": {"inputs": sorted(TEXT_IN), "targets": TEXT_T},
        "document": {"inputs": sorted(DOC_IN), "targets": DOC_T},
        "spreadsheet": {"inputs": sorted(SHEET_IN), "targets": SHEET_T},
        "presentation": {"inputs": sorted(SLIDE_IN), "targets": SLIDE_T},
        "pdf": {"inputs": ["pdf"], "targets": PDF_T},
        "audio": {"inputs": sorted(AUDIO_IN), "targets": AUDIO_T},
        "video": {"inputs": sorted(VIDEO_IN), "targets": VIDEO_T},
        "any": {"inputs": ["*"], "targets": ["zip"]},
    }
    extras = {
        "csv→json": "本地补的缺口（GUI 把 csv 归表格类，到不了 json）",
        "csv→md": "本地补的缺口",
        "txt/md/html→pdf": "LibreOffice html 中转（GUI 文本类到不了 pdf）",
    }
    if args.json:
        print(json.dumps({"matrix": matrix, "extras": extras}, ensure_ascii=False, indent=2))
    else:
        for cat, spec in matrix.items():
            print(f"{cat:<13} {'/'.join(spec['inputs']):<60} -> {'/'.join(spec['targets'])}")
        print("\n说明：csv/tsv 虽在 text 行，但内核按 spreadsheet 处理（走表格分支）。")
        print("额外能力：")
        for k, v in extras.items():
            print(f"  {k:<18} {v}")
    return 0


def _disp_width(text: str) -> int:
    return sum(2 if ord(ch) > 0x2E80 else 1 for ch in text)


def cmd_doctor(args) -> int:
    env = Env()
    checks = []

    def add(name, ok, detail=""):
        checks.append({"name": name, "ok": bool(ok), "detail": str(detail)})

    add("安装目录", env.install.is_dir(), env.install)
    add("FlyingMouse Format.exe", env.exe.is_file(), env.exe)
    add("转换内核 app.asar", env.asar.is_file(), env.asar)
    add("LibreOffice soffice.com", env.soffice.is_file(), env.soffice)
    add("FFmpeg", env.ffmpeg.is_file(), env.ffmpeg)
    add("Poppler pdfinfo", env.pdfinfo.is_file(), env.pdfinfo)
    add("Tessdata 语言包", (env.tessdata / "chi_sim.traineddata.gz").is_file() and (env.tessdata / "eng.traineddata.gz").is_file(), env.tessdata)
    add("OCR 运行时 tesseract.js-core", (env.resources / "tesseract.js-core").is_dir(), env.resources / "tesseract.js-core")
    add("Python", sys.version_info >= (3, 8), sys.version.split()[0])

    tools = {}
    if env.exe.is_file() and env.asar.is_file():
        try:
            srv = Server(env, idle=20)
            srv.start()
            try:
                tools = srv.capabilities().get("tools", {})
            finally:
                srv.close()
            add("转换内核握手", True, json.dumps(tools, ensure_ascii=False))
        except (EnvError, ConvertError) as exc:
            add("转换内核握手", False, exc)
    if tools:
        for name, label in (
            ("libreoffice", "文档/表格/幻灯片/pdf"),
            ("ffmpeg", "音视频"),
            ("poppler", "pdf 拆图片"),
            ("ocr", "图片/扫描件文字"),
            ("sharp", "图片格式互转"),
        ):
            add(f"引擎 {name}", tools.get(name, False), label if tools.get(name) else "不可用")

    ok = all(c["ok"] for c in checks)
    if args.json:
        print(json.dumps({"ok": ok, "checks": checks}, ensure_ascii=False, indent=2))
    else:
        width = max((_disp_width(c["name"]) for c in checks), default=0)
        for c in checks:
            mark = "OK  " if c["ok"] else "FAIL"
            pad = " " * max(0, width - _disp_width(c["name"]))
            print(f"{mark} {c['name']}{pad}  {c['detail']}")
        print("\n全部通过。" if ok else "\n有问题，见上面 FAIL。")
    return 0 if ok else 4


def _free_port() -> int:
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def cmd_serve(args) -> int:
    env = Env()
    env.check()
    existing = kept_server(env)
    if existing:
        print(f"已经有常驻服务：{existing.url}（pid {existing.pid}）")
        return 0
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    port = args.port or _free_port()
    env_vars = os.environ.copy()
    env_vars["ELECTRON_RUN_AS_NODE"] = "1"
    env_vars["FMF_INSTALL"] = str(env.install)
    env_vars["FMF_PORT"] = str(port)
    env_vars["FMF_IDLE_EXIT"] = str(args.idle)
    flags = 0
    if os.name == "nt":
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "DETACHED_PROCESS", 0)
    with open(STATE_LOG, "ab") as log:
        proc = subprocess.Popen(
            [str(env.exe), str(SERVER_JS)],
            env=env_vars,
            cwd=str(SCRIPTS_DIR),
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=subprocess.STDOUT,
            creationflags=flags,
        )
    deadline = time.time() + 90
    while time.time() < deadline:
        if _ping(port):
            break
        if proc.poll() is not None:
            tail = STATE_LOG.read_text(encoding="utf-8", errors="replace").splitlines()[-8:]
            raise EnvError("常驻服务启动失败：\n" + "\n".join(tail))
        time.sleep(0.4)
    else:
        raise EnvError("常驻服务没在 90s 内就绪，看日志：" + str(STATE_LOG))
    _write_state({"port": port, "pid": proc.pid, "install": str(env.install), "idle": args.idle, "started": int(time.time())})
    print(f"常驻服务已启动：http://127.0.0.1:{port}（pid {proc.pid}，空闲 {args.idle}s 自退）")
    print("  convert/batch 会自动复用它；fmf.py stop 关掉。")
    return 0


def cmd_status(args) -> int:
    env = Env()
    srv = kept_server(env)
    if not srv:
        print("没有常驻服务（convert 会临时起一个，用完自动关）。")
        return 0
    caps = srv.capabilities()
    if args.json:
        print(json.dumps({"url": srv.url, "pid": srv.pid, "tools": caps.get("tools")}, ensure_ascii=False, indent=2))
    else:
        print(f"常驻服务 {srv.url}  pid={srv.pid}")
        print("引擎：" + json.dumps(caps.get("tools"), ensure_ascii=False))
    return 0


def cmd_stop(args) -> int:
    state = _read_state()
    port = state.get("port")
    if not port:
        print("没有常驻服务。")
        return 0
    pid = int(state.get("pid") or 0)
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{port}/__shutdown", timeout=5).read()
        time.sleep(0.6)
    except Exception:
        pass
    if _ping(int(port)) and pid and os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            capture_output=True,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    STATE_PATH.unlink(missing_ok=True)
    time.sleep(0.5)
    print("已停止常驻服务。" if not _ping(int(port)) else f"发送了停止信号，但 {port} 还有响应（可能不是我们起的）。")
    return 0


# ---------------------------------------------------------------- main

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="fmf.py",
        description="FlyingMouse Format 无界面转换：docx/xlsx/pptx/pdf/图片/音视频互转 + OCR。",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""例子：
  fmf.py convert 报告.docx pdf
  fmf.py convert 扫描件.pdf xlsx
  fmf.py convert 图.png png -o out/图.png
  fmf.py batch ./素材 pdf -o ./pdf
  fmf.py merge 1.png 2.png -o 合集.pdf
  fmf.py ocr 截图.png
  fmf.py targets report.docx
""",
    )
    p.add_argument("--json", action="store_true", help="输出 JSON（给程序/agent 用）")
    p.add_argument("--quiet", action="store_true", help="只输出产物路径（一行一个）")
    sub = p.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("convert", help="转一个或多个文件")
    c.add_argument("inputs", nargs="+", help="输入文件")
    c.add_argument("target", help="目标扩展名，如 pdf/xlsx/mp3")
    c.add_argument("-o", "--output", help="输出文件或目录")
    c.add_argument("--all-sheets", action="store_true", help="工作簿转 csv 时每张表导一个文件")
    c.set_defaults(func=cmd_convert)

    b = sub.add_parser("batch", help="整目录批量转")
    b.add_argument("input", help="目录或文件")
    b.add_argument("target", help="目标扩展名")
    b.add_argument("-o", "--output", help="输出目录，默认 <输入目录>/converted")
    b.add_argument("--pattern", help="文件名过滤，如 *.docx")
    b.add_argument("--recursive", action="store_true", help="递归子目录")
    b.set_defaults(func=cmd_batch)

    m = sub.add_parser("merge", help="多张图片合成一个 PDF")
    m.add_argument("inputs", nargs="+", help="图片路径，按顺序成页")
    m.add_argument("-o", "--output", help="输出 PDF")
    m.set_defaults(func=cmd_merge)

    o = sub.add_parser("ocr", help="图片或 PDF 提取文字")
    o.add_argument("input")
    o.add_argument("-o", "--output", help="输出 txt")
    o.set_defaults(func=cmd_ocr)

    t = sub.add_parser("targets", help="看这个文件能转成什么")
    t.add_argument("input", help="文件路径或扩展名")
    t.set_defaults(func=cmd_targets)

    sub.add_parser("caps", help="打印完整格式矩阵").set_defaults(func=cmd_caps)
    sub.add_parser("doctor", help="自检安装与引擎").set_defaults(func=cmd_doctor)

    s = sub.add_parser("serve", help="起常驻服务（可选，批量时省启动开销）")
    s.add_argument("--port", type=int, default=0)
    s.add_argument("--idle", type=int, default=900, help="空闲多少秒自退，0=常驻")
    s.set_defaults(func=cmd_serve)
    sub.add_parser("status", help="常驻服务状态").set_defaults(func=cmd_status)
    sub.add_parser("stop", help="停常驻服务").set_defaults(func=cmd_stop)

    # --json/--quiet 写在子命令后面也要认（用 SUPPRESS 防止子解析器把前面的值冲掉）
    for parser in sub.choices.values():
        parser.add_argument("--json", action="store_true", default=argparse.SUPPRESS, help=argparse.SUPPRESS)
        parser.add_argument("--quiet", action="store_true", default=argparse.SUPPRESS, help=argparse.SUPPRESS)
    return p


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except ConvertError as exc:
        _fail(args, str(exc), 2)
        return 2
    except EnvError as exc:
        _fail(args, str(exc), 4)
        return 4
    except KeyboardInterrupt:
        print("\n中断。", file=sys.stderr)
        return 130


def _fail(args, message: str, code: int):
    if getattr(args, "json", False):
        print(json.dumps({"ok": False, "error": message, "code": code}, ensure_ascii=False, indent=2))
    print(f"错误：{message}", file=sys.stderr)


if __name__ == "__main__":
    sys.exit(main())
