// dsh 宿主 HTTP 网关的空闲连接超时修复。
//
// 问题：dsh 的 webServer 用 `createServer(listener)` 建服务，**没有配置任何超时**，
// 于是吃 Node 默认的 keepAliveTimeout = 5s。而浏览器（renderer）的连接池留得更久，
// 空闲一会儿后再发请求，会挑中一条“服务端已关、FIN 还没被感知”的半死 socket：
//   · GET 请求浏览器会静默重试 → 用户看不见；
//   · POST 不能安全重试 → 直接冒 `Failed to fetch`，
//     被 dsh 包成 `gateway/internal: client api: <ns>/<method> failed: ...`。
// 实测（2026-10-28）：`GET /` → 401 之后空闲 6.0s 收到 EOF，正是 5s + 抖动。
// 症状也就是“改模型 / 建会话这类低频操作偶尔失败，聊天流一点事没有”。
//
// 做法：拿到 `ctx.webServer.server`（node:http Server，源码里就是公开字段 `server;`），
// 把 keepAliveTimeout 拉长（默认 10 分钟；配 0 = 永不因空闲关闭）。
//
// 为什么还要看门狗：profile 改动（装/删插件、改 patch）会让宿主重新组装，webServer
// 会新建一个 server 实例，超时随之回到默认值。实测 22:17 打上、22:2x 复测又变回 6s。
// 所以这里每 5s 复查一次：实例换了或值被冲掉了就再打一次（幂等，只在变化时写日志）。
//
// 安全性：全程 try/catch，且用 ctx.inject 的可选注入 —— webServer 不存在时回调根本不跑，
// 不会像硬 inject 那样把宿主卡在 pending 里导致打不开。
import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const name = 'webserver-keepalive'

const LOG_DIR = join(homedir(), '.dsh', 'logs')
const LOG_FILE = join(LOG_DIR, 'webserver-keepalive.log')
const DEFAULT_KEEPALIVE_MS = 600_000
const WATCHDOG_MS = 5_000

function log(text) {
  try {
    mkdirSync(LOG_DIR, { recursive: true })
    appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${text}\n`)
  } catch {
    /* 日志失败绝不影响宿主 */
  }
}

/** 只动超时，不碰路由/监听/压缩等其他行为。 */
function tune(server, keepAliveMs) {
  server.keepAliveTimeout = keepAliveMs
  // Node 要求 headersTimeout 大于 keepAliveTimeout；上游默认 60s，抬长后需要跟上。
  if (typeof server.headersTimeout === 'number' && server.headersTimeout <= server.keepAliveTimeout) {
    server.headersTimeout = server.keepAliveTimeout + 5_000
  }
  return { keepAliveTimeout: server.keepAliveTimeout, headersTimeout: server.headersTimeout }
}

export function apply(ctx, config) {
  const raw = Number(config && config.keepAliveTimeoutMs)
  const keepAliveMs = Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_KEEPALIVE_MS
  let tuned = null

  const tick = (webServer) => {
    try {
      const server = webServer && webServer.server
      if (!server || typeof server !== 'object') return
      const replaced = server !== tuned
      const drifted = !replaced && server.keepAliveTimeout !== keepAliveMs
      if (!replaced && !drifted) {
        // headersTimeout 也可能被上游再按一次，但只在需要时跟随
        if (typeof server.headersTimeout === 'number' && server.headersTimeout <= keepAliveMs) {
          server.headersTimeout = keepAliveMs + 5_000
        }
        return
      }
      const applied = tune(server, keepAliveMs)
      tuned = server
      log(
        `${replaced ? 'applied' : 're-applied'} keepAliveTimeout=${applied.keepAliveTimeout}` +
          ` headersTimeout=${applied.headersTimeout} port=${String(webServer.port ?? '?')}`
      )
    } catch (error) {
      log(`tune failed: ${error && error.message ? error.message : String(error)}`)
    }
  }

  try {
    ctx.inject(['webServer'], (webCtx) => {
      const webServer = webCtx.webServer
      tick(webServer)
      // 常驻看门狗：容器重新组装后 server 会换实例，5s 内自动补回。
      const interval = setInterval(() => tick(webCtx.webServer), WATCHDOG_MS)
      if (typeof interval.unref === 'function') interval.unref()
      if (typeof webCtx.effect === 'function') {
        webCtx.effect(() => () => clearInterval(interval))
      }
    })
  } catch (error) {
    log(`inject failed: ${error && error.message ? error.message : String(error)}`)
  }
}
