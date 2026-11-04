'use strict';
/**
 * FlyingMouse Format 无界面转换服务启动器。
 *
 * 用 App 自带的 Electron 以 ELECTRON_RUN_AS_NODE 模式运行，直接加载
 * <install>\resources\app.asar\server.js —— 也就是 GUI 里点「转换」时跑的同一份代码，
 * 所以格式矩阵、编码细节、OCR 参数与 GUI 完全一致，不需要重新实现。
 *
 * 环境变量：
 *   FMF_INSTALL    安装目录（默认 D:\flying mouse format\FlyingMouse Format）
 *   FMF_PORT       监听端口，0 = 随机
 *   FMF_IDLE_EXIT  空闲多少秒后自杀，0 = 不自杀
 *
 * 就绪后在 stdout 打一行 JSON：{"ready":true,"url":...,"port":...,"pid":...}
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const INSTALL = process.env.FMF_INSTALL || 'D:\\flying mouse format\\FlyingMouse Format';
const RES = path.join(INSTALL, 'resources');
const ASAR_MAIN = path.join(RES, 'app.asar', 'server.js');
const PORT = Number(process.env.FMF_PORT || 0);
const IDLE = Number(process.env.FMF_IDLE_EXIT || 0);

// 每次运行的临时工作区单独一个目录，退出时删掉：内核的 uploads/converted 也就不留垃圾
// （GUI 自己那个 %TEMP%\flyingmouse-format-runtime 会由常驻的 GUI 自己清）。
const RUNTIME_DIR = path.join(os.tmpdir(), 'fmf-skill', `runtime-${process.pid}`);
process.env.FLYINGMOUSE_RUNTIME_DIR = RUNTIME_DIR;

function sweepStaleRuntimes(maxAgeMs = 6 * 60 * 60 * 1000) {
  const root = path.join(os.tmpdir(), 'fmf-skill');
  let names = [];
  try {
    names = fs.readdirSync(root);
  } catch {
    return;
  }
  const now = Date.now();
  for (const name of names) {
    if (!name.startsWith('runtime-')) continue;
    const full = path.join(root, name);
    if (Number(name.slice('runtime-'.length)) === process.pid) continue;
    try {
      if (now - fs.statSync(full).mtimeMs > maxAgeMs) fs.rmSync(full, { recursive: true, force: true });
    } catch { /* ignore */ }
  }
}

function removeRuntimeDir() {
  try {
    fs.rmSync(RUNTIME_DIR, { recursive: true, force: true });
  } catch { /* ignore */ }
}

sweepStaleRuntimes();
removeRuntimeDir(); // 上万个残留时先清一次自己的（pid 复用的情况）
process.on('exit', removeRuntimeDir);

function die(message) {
  process.stdout.write(JSON.stringify({ ready: false, error: message }) + '\n');
  process.stderr.write(message + '\n');
  process.exit(1);
}

if (!fs.existsSync(ASAR_MAIN)) die('找不到转换内核：' + ASAR_MAIN + '（安装目录变了？设置 FMF_INSTALL）');

// server.js 用 process.resourcesPath 定位 tessdata / tesseract.js-core。
// ELECTRON_RUN_AS_NODE 模式下它是空的，这里补上；补不上就走显式路径环境变量。
try {
  process.resourcesPath = RES;
} catch (error) {
  process.stderr.write('warn: 无法设置 process.resourcesPath: ' + error.message + '\n');
}

const env = process.env;
const setOnce = (key, value) => {
  if (!env[key] && fs.existsSync(value)) env[key] = value;
};
setOnce('FLYINGMOUSE_FFMPEG_PATH', path.join(RES, 'ffmpeg', 'ffmpeg.exe'));
setOnce('FLYINGMOUSE_LIBREOFFICE_PATH', path.join(RES, 'libreoffice', 'LibreOfficePortable', 'App', 'libreoffice', 'program', 'soffice.com'));
setOnce('FLYINGMOUSE_PDFTOPPM_PATH', path.join(RES, 'poppler', 'Library', 'bin', 'pdftoppm.exe'));
setOnce('FLYINGMOUSE_TESSDATA_PATH', path.join(RES, 'tessdata'));

let serverModule;
try {
  serverModule = require(ASAR_MAIN);
} catch (error) {
  die('加载转换内核失败：' + (error && error.message ? error.message : String(error)));
}

const idleSeconds = Number.isFinite(IDLE) && IDLE > 0 ? IDLE : 0;

serverModule.startServer(PORT).then(({ server, url, port }) => {
  let timer = null;
  let inflight = 0;
  const shutdown = (reason) => {
    if (reason) process.stderr.write('idle exit: ' + reason + '\n');
    try {
      server.close();
    } catch { /* ignore */ }
    process.exit(0);
  };
  const arm = () => {
    if (!idleSeconds || inflight > 0) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (inflight > 0) return; // 长任务（转视频可能几十分钟）期间绝不能退
      shutdown(`${idleSeconds}s 无请求`);
    }, idleSeconds * 1000);
    if (timer.unref) timer.unref();
  };

  // 挂在 http.Server 上而不是 express 路由上：路由命中后不会调 next()，中间件拿不到结束信号。
  server.on('request', (req, res) => {
    inflight += 1;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    res.on('close', () => {
      inflight = Math.max(0, inflight - 1);
      arm();
    });
  });
  arm();

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (error) => {
    try { process.stderr.write('uncaught: ' + (error && error.stack ? error.stack : String(error)) + '\n'); } catch { /* ignore */ }
    shutdown('uncaughtException');
  });

  // 优雅退出：CLI 走这个端点，退出前能把自己的临时工作区删干净（taskkill 不给机会）
  try {
    serverModule.app.get('/__shutdown', (_req, res) => {
      res.json({ ok: true });
      setTimeout(() => shutdown('shutdown 端点'), 60);
    });
  } catch (error) {
    process.stderr.write('warn: 挂 shutdown 端点失败: ' + error.message + '\n');
  }

  process.stdout.write(JSON.stringify({ ready: true, url, port, pid: process.pid }) + '\n');
}).catch((error) => {
  die('启动转换服务失败：' + (error && error.message ? error.message : String(error)));
});
