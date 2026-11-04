// dsh-block-contract —— host 侧插件：把「展示块输出契约」每轮注入 system prompt。
//
// 为什么要有它（而不是只往卡/预设里塞契约文本）：
//   dsh-tavern 的 cardTextFor() 每轮无条件拼三样 —— ① 卡文本 ② characters.json 的卡 desc
//   ③ presets.json 的 modules。② 跟着卡走（换卡就丢），③ 是**数据**（会被面板/重导覆盖）。
//   本插件是**代码**：挂进 profile 的 bundles 后，
//     · 不随角色卡变化（换卡/换卡组都在）
//     · 不靠模型自愿加载（不是 skill 那种"模型可能不读"）
//     · 契约文本由构建期从契约包内嵌，运行时可热读契约包
//
// 作用域（关键）：**只对「挂了酒馆预设的会话」注入**，不给编程会话塞角色扮演指令。
//   判据与 dsh-tavern 的 isTavernSession() 同构：
//     · 会话的预设 id —— 扫 ~/.dsh/sessions/<cwd>/<sid>/session.v*.jsonl.zstd，
//       取最后一条 agentPreset（新建时写一条，用户切预设时追加一条）
//     · 该预设目录在 ~/.dsh/.agent-presets/<id>/ 且含 preset.yml + agent.cordis.yml
//     · 子 Agent 继承父会话的判断（与 tavern 一致）
//   config.mode = 'always' 可强制注入到所有会话（不推荐，编程会话会多 635 字）。
//
// 安全纪律（2026-09-30 刚踩过「插件挂上去整机起不来」）：
//   · 零外部依赖；只 inject 宿主服务 systemPrompt（tavern 也在用同一个）。
//   · 所有会抛异常的地方都 try/catch，装配期出错只放弃本次注入。
//   · 取不到文本 → 返回 ''（不注入）+ warn，**不静默**。
//   · 跑 `node lib/selftest.mjs` 离线验过再上机。

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { CONTRACT_TEXT, CONTRACT_SOURCE, CONTRACT_CHARS } from './contract-text.js'

/** 插件名（与 package.json 的 name 一致，便于日志辨认）。 */
export const name = 'dsh-block-contract'

/** 只依赖宿主的 systemPrompt 服务。 */
export const inject = ['systemPrompt']

const DEFAULT_PACK = 'D:/DSH/dnd-plugin/contract/display-blocks-pack.json'

function resolveHome() {
  const h = process.env.USERPROFILE || (process.env.HOMEDRIVE || '') + (process.env.HOMEPATH || '')
  return h || 'C:\\Users\\m0408'
}
export const DSH_HOME = process.env.DSH_HOME && String(process.env.DSH_HOME).trim()
  ? String(process.env.DSH_HOME).trim()
  : path.join(resolveHome(), '.dsh')
export const PRESETS_ROOT = path.join(DSH_HOME, '.agent-presets')
export const SESSIONS_ROOT = path.join(DSH_HOME, 'sessions')

/**
 * 会话日志文件：~/.dsh/sessions/<按 cwd 转义>/<sid>/session.v*.jsonl(.zstd)
 *
 * ⚠️ 一个会话目录可能有多份日志（实测 12/384：如 session.jsonl.zstd + session.v3.jsonl.zstd）。
 * readdir 顺序不可靠，取第一个会读到旧日志、漏掉最新的预设切换 —— 所以收集全部匹配文件，
 * 按「版本号（session.jsonl 视为 v0）+ mtime」取最新那份。
 */
export function findSessionFile(sid) {
  if (!sid) return ''
  try {
    let best = null
    for (const bucket of fs.readdirSync(SESSIONS_ROOT)) {
      const dir = path.join(SESSIONS_ROOT, bucket, sid)
      let st
      try { st = fs.statSync(dir) } catch { continue }
      if (!st.isDirectory()) continue
      for (const f of fs.readdirSync(dir)) {
        const m = /^session(?:\.v(\d+))?\.jsonl(\.zstd)?$/.exec(f)
        if (!m) continue
        const version = m[1] ? Number(m[1]) : 0
        let mtime = 0
        try { mtime = fs.statSync(path.join(dir, f)).mtimeMs } catch { /* 用 0 参与比较 */ }
        if (!best || version > best.version || (version === best.version && mtime > best.mtime)) {
          best = { file: path.join(dir, f), version, mtime }
        }
      }
    }
    return best ? best.file : ''
  } catch { /* sessions 目录不可读 */ }
  return ''
}

/** 读会话日志文本（zstd 用 Node 内置的 zlib.zstdDecompressSync，需 Node ≥ 22.15 / ≥ 23.8；低版本会抛，被上层捕获 → 不注入）。 */
export function readSessionText(sid) {
  const file = findSessionFile(sid)
  if (!file) return ''
  const buf = fs.readFileSync(file)
  if (!file.endsWith('.zstd')) return buf.toString('utf8')
  return zlib.zstdDecompressSync(buf).toString('utf8')
}

/**
 * 会话日志里最新一条**显式** preset（排除创建记录）。
 * 依据（与 dsh-tavern 一致）：含 agentPreset 的行只有两种 ——
 *   创建记录 `{"type":"session",…,"agentPreset":"standard"}`（写在文件首）与用户切换时追加的事件。
 * 实测很多会话的日志里**只有创建记录**（切换只落在 session-bindings.json），所以本函数常返回 ''。
 */
export function lastExplicitFromLog(sid) {
  let text = ''
  try { text = readSessionText(sid) } catch { return '' }
  if (!text) return ''
  let explicit = ''
  for (const l of text.split('\n')) {
    if (!l || l.indexOf('"agentPreset"') < 0) continue
    const m = l.match(/"agentPreset"\s*:\s*"([^"]+)"/)
    if (!m || !m[1]) continue
    if (/"type"\s*:\s*"session"/.test(l)) continue   // 创建记录：不作依据（同 tavern 的 P0-5）
    explicit = m[1]
  }
  return explicit
}

/** session-bindings.json 里的绑定；legacy / mode:none 一律不作依据（与 tavern 的 fail-closed 一致）。 */
export function bindingOf(sid) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(PRESETS_ROOT, 'session-bindings.json'), 'utf8'))
    const b = j && j[sid]
    if (!b || typeof b !== 'object') return ''
    if (b.mode === 'none') return ''
    if (b.source === 'legacy') return ''
    return String(b.presetId || '')
  } catch { return '' }
}

/**
 * 会话的预设 id。决议顺序与 dsh-tavern 的 resolveAuthoritativePreset 一致：
 *   日志显式切换 > 非 legacy 的显式绑定 > 不采信 creation（返回 '' 表示"判不出来"）。
 * 为什么不用 header.agentPreset：那是**出生默认值**，用户后来在顶部换成 DND 它不会变。
 */
export function sessionPresetId(sid, context) {
  if (!sid) return ''
  const explicit = lastExplicitFromLog(sid)
  if (explicit) return explicit
  const bound = bindingOf(sid)
  if (bound) return bound
  void context
  return ''
}

/**
 * 该预设是不是「**角色扮演/卡牌**预设」—— 必须是酒馆可管理目录（preset.yml + agent.cordis.yml）
 * **且含至少一张启用角色卡**。
 *
 * 为什么要加"有卡"这一条：本机的 `liangshen`（编程预设）、`style-lab`、`tavern-lite`
 * 也都满足前两条 —— 只看那两条会把角色扮演的输出契约塞进编程会话。
 * 实测：DND 预设 → true；liangshen → false（无 characters.json）。
 */
export function isCardPreset(presetId) {
  if (!presetId) return false
  try {
    const d = path.join(PRESETS_ROOT, presetId)
    if (!fs.existsSync(path.join(d, 'preset.yml')) || !fs.existsSync(path.join(d, 'agent.cordis.yml'))) return false
    const raw = JSON.parse(fs.readFileSync(path.join(d, 'characters.json'), 'utf8'))
    const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.characters) ? raw.characters : [])
    return list.some((c) => c && c.enabled !== false && (c.name || c.desc))
  } catch {
    return false
  }
}

/** 本会话该不该注入（含子 Agent 继承父会话的判断）。 */
export function isTavernSession(sid, context) {
  if (!sid) return false
  try {
    if (isCardPreset(sessionPresetId(sid, context))) return true
    const parent = String(context?.agent?.session?.header?.parentSession || '')
    if (parent && isCardPreset(sessionPresetId(parent, context))) return true
  } catch { /* 判不出来就不注入 */ }
  return false
}

/** 从契约包取文本；异常一律返回 ''（由调用方回落内嵌版）。 */
function readPackText(packPath, variant) {
  try {
    const pack = JSON.parse(fs.readFileSync(packPath, 'utf8'))
    const c = pack && pack.contracts && pack.contracts[variant]
    if (!c || typeof c !== 'object') return ''
    return Object.keys(c)
      .filter((k) => k !== 'note' && typeof c[k] === 'string' && c[k].trim())
      .map((k) => c[k].trim())
      .join('\n\n')
  } catch {
    return ''
  }
}

/**
 * @param {any} ctx cordis 上下文
 * @param {{enabled?: boolean, mode?: 'tavern'|'always', packPath?: string, variant?: string, order?: number,
 *          presets?: string[]}} [config]
 */
export function apply(ctx, config) {
  const cfg = config && typeof config === 'object' ? config : {}
  if (cfg.enabled === false) {
    console.log('[block-contract] config.enabled=false，不注入')
    return
  }
  const mode = cfg.mode === 'always' ? 'always' : 'tavern'
  // packPath 优先级：config > 环境变量 DSH_BLOCK_CONTRACT_PACK > 内置默认（默认值绑本机目录，环境变量便于移植）。
  const envPack = String(process.env.DSH_BLOCK_CONTRACT_PACK || '').trim()
  const packPath = typeof cfg.packPath === 'string' && cfg.packPath.trim()
    ? cfg.packPath.trim()
    : (envPack || DEFAULT_PACK)
  const variant = typeof cfg.variant === 'string' && cfg.variant.trim() ? cfg.variant.trim() : 'generic'
  // order 越大越靠后组装（tavern：card=-999999 / nsfw=1.5 / enhance=2）。
  // 放最后 = 出现在预设与卡之后，同类格式要求里最有话语权的位置。
  const order = Number.isFinite(cfg.order) ? cfg.order : 3
  const extraPresets = Array.isArray(cfg.presets) ? cfg.presets.map(String) : []

  let cached = ''
  let cachedKey = ''
  const currentText = () => {
    let key = 'missing'
    try { const st = fs.statSync(packPath); key = st.mtimeMs + ':' + st.size } catch { /* 用内嵌版 */ }
    if (key === cachedKey && cached) return cached
    const fromPack = key === 'missing' ? '' : readPackText(packPath, variant)
    cached = fromPack || CONTRACT_TEXT
    cachedKey = key
    if (fromPack) console.log('[block-contract] 契约文本来自契约包：' + fromPack.length + ' 字（' + packPath + '#' + variant + '）')
    else console.warn('[block-contract] 契约包读不到，改用构建期内嵌文本：' + CONTRACT_CHARS + ' 字（来源 ' + CONTRACT_SOURCE + '）')
    return cached
  }

  // 会话 → 是否注入 的短缓存：同一轮里 text() 可能被调多次，避免重复解压会话日志。
  // 失效判据 = 判定依据的摘要（会话日志 mtime/size + session-bindings.json mtime，含父会话）：
  // 用户切换预设会追加日志或改绑定文件，依据一变立即重判 —— 早先按 sid 永久缓存，
  // 切换预设后仍用旧判定（切进 DND 不注入、切走后继续注入）。
  const gateCache = new Map()
  const bindingFile = path.join(PRESETS_ROOT, 'session-bindings.json')
  const basisOf = (sid) => {
    let logKey = 'missing'
    try {
      const f = findSessionFile(sid)
      if (f) { const st = fs.statSync(f); logKey = st.mtimeMs + ':' + st.size }
    } catch { /* 忽略 */ }
    let bindKey = 'missing'
    try { bindKey = String(fs.statSync(bindingFile).mtimeMs) } catch { /* 忽略 */ }
    return logKey + '|' + bindKey
  }
  const shouldInject = (context) => {
    if (mode === 'always') return true
    let sid = ''
    try { sid = String(context?.agent?.session?.id || context?.agent?.session?.header?.id || '') } catch { /* 忽略 */ }
    if (!sid) return false
    let parent = ''
    try { parent = String(context?.agent?.session?.header?.parentSession || '') } catch { /* 忽略 */ }
    const basis = basisOf(sid) + (parent ? '|parent:' + basisOf(parent) : '')
    const hit = gateCache.get(sid)
    if (hit && hit.basis === basis) return hit.yes
    let yes = false
    try {
      yes = isTavernSession(sid, context)
      if (!yes && extraPresets.length) yes = extraPresets.includes(sessionPresetId(sid, context))
    } catch { yes = false }
    if (gateCache.size > 64) gateCache.clear()
    gateCache.set(sid, { basis, yes })
    return yes
  }

  let dispose = null
  try {
    dispose = ctx.systemPrompt.section({
      name: 'block-contract',
      order,
      text: (context) => {
        try {
          if (!shouldInject(context)) return ''
          const t = currentText()
          return t ? '\n\n' + t : ''
        } catch (e) {
          console.warn('[block-contract] 组装失败，本轮不注入：' + (e && e.message))
          return ''
        }
      },
    })
  } catch (e) {
    console.warn('[block-contract] 注册 systemPrompt 段失败，不注入：' + (e && e.message))
    return
  }

  try {
    ctx.effect(() => () => {
      try { if (dispose) dispose() } catch { /* 忽略 */ }
      dispose = null
      gateCache.clear()
    }, 'block-contract.section()')
  } catch { /* 没有 effect 服务也不影响注入 */ }

  console.log('[block-contract] 已挂载：order=' + order + '，mode=' + mode +
    '，内嵌 ' + CONTRACT_CHARS + ' 字，契约包 ' + packPath)
}
