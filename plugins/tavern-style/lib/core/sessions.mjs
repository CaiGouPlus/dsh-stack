/**
 * 文风实验室 · 会话层（sessions）
 *
 * 职责：读会话（只读）、按预设分桶、抽出**模型输出（assistant 正文）**供工作台改进。
 *
 * 格式要点（实测）：
 *   - 会话文件是**多帧 zstd**（每次追加一帧），`zstdDecompressSync` 只解第一帧；
 *     这里按 magic 扫帧、逐帧解码再拼接（拒绝坏帧），60KB→118KB 实测 79/79 帧成功。
 *   - 关键事件：`session`(头，含 agentPreset) / `user/message` / `assistant/message`
 *     / `turn/start` / `session/title`；正文在 `data.message.content[].text`（type=text）。
 *   - v0 与 v4 格式事件形状一致（v4 多 reasoning / stream）。
 *
 * 安全：**只读**。绝不写会话文件。
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { HOME_DIR } from './tavern.mjs'

export const SESSIONS_ROOT = join(HOME_DIR, 'sessions')

/** 分桶策略（用户决定）：只吃用户自建 roleplay 预设；排除 liangshen 与系统自带预设。 */
export const SESSION_WHITELIST_PREFIX = 'preset-'
export const SESSION_EXCLUDE = ['liangshen', 'standard', 'code', 'cordis', 'minimal', 'ptc']

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/** 会话是否参与学习（白名单 + 黑名单）。 */
export function bucketOf(preset) {
  const name = String(preset ?? '(none)')
  const allowed = name.startsWith(SESSION_WHITELIST_PREFIX) && !SESSION_EXCLUDE.includes(name)
  const key = allowed ? name : name + (SESSION_EXCLUDE.includes(name) ? ' [排除]' : ' [非预设]')
  return { allowed, key }
}

/** 多帧解码：扫 magic → 逐帧解码 → 拼接（坏帧跳过并计数）。 */
export function decodeSessionFile(file) {
  let buf
  try {
    buf = readFileSync(file)
  } catch {
    return { text: '', frames: 0, bad: 0, size: 0, error: 'READ_FAILED' }
  }
  const offsets = []
  let at = buf.indexOf(MAGIC, 0)
  while (at !== -1) {
    offsets.push(at)
    at = buf.indexOf(MAGIC, at + 4)
  }
  if (offsets.length === 0 || offsets[0] !== 0) offsets.unshift(0)
  const parts = []
  let frames = 0
  let bad = 0
  for (const offset of offsets) {
    try {
      parts.push(zstdDecompressSync(buf.subarray(offset)).toString('utf8'))
      frames += 1
    } catch {
      bad += 1
    }
  }
  return { text: parts.join(''), frames, bad, size: buf.length }
}

/** 只解第一帧取会话头（列表用，极快）。 */
export function readSessionHeader(file) {
  let buf
  try {
    buf = readFileSync(file)
  } catch {
    return undefined
  }
  const end = Math.min(buf.length, 8192)
  try {
    const text = zstdDecompressSync(buf.subarray(0, end)).toString('utf8')
    const line = text.split('\n').find((l) => l.trim() !== '')
    return line === undefined ? undefined : JSON.parse(line)
  } catch {
    return undefined
  }
}

function textOfContent(content) {
  if (!Array.isArray(content)) return ''
  let out = ''
  for (const part of content) {
    if (part !== null && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string') out += part.text
  }
  return out
}

/**
 * 解析会话事件流，抽出「轮次」。
 * @returns {{header: object|null, title: string|null, events: number, badLines: number,
 *            turns: Array<{turn: number, user: string, assistants: Array<{seq: number, step: number, text: string, chars: number, reasoningChars: number, toolCalls: number}>}>}}
 */
export function parseSession(text) {
  const lines = String(text ?? '').split('\n')
  let header = null
  let title = null
  let events = 0
  let badLines = 0
  const turns = []
  const byTurn = new Map()

  const ensureTurn = (turn) => {
    const key = Number.isFinite(turn) ? turn : turns.length + 1
    if (!byTurn.has(key)) {
      const record = { turn: key, user: '', assistants: [] }
      byTurn.set(key, record)
      turns.push(record)
    }
    return byTurn.get(key)
  }

  let lastTurn = 0
  for (const line of lines) {
    if (line.trim() === '') continue
    let ev
    try {
      ev = JSON.parse(line)
    } catch {
      badLines += 1
      continue
    }
    events += 1
    const type = ev.type
    const data = ev.data ?? {}

    if (type === 'session' && header === null) {
      header = ev
      continue
    }
    if (type === 'session/title') {
      if (typeof data.title === 'string' && data.title.trim() !== '') title = data.title.trim()
      continue
    }
    if (type === 'turn/start') {
      const t = Number(data.turn)
      if (Number.isFinite(t)) {
        lastTurn = t
        ensureTurn(t)
      }
      continue
    }
    if (type === 'user/message') {
      const record = ensureTurn(lastTurn)
      const piece = textOfContent(data.content)
      record.user = record.user === '' ? piece : record.user + '\n' + piece
      continue
    }
    if (type === 'assistant/message') {
      const turn = Number.isFinite(Number(data.turn)) ? Number(data.turn) : lastTurn
      const record = ensureTurn(turn)
      const content = data.message?.content
      const body = textOfContent(content)
      const reasoningChars = Array.isArray(content)
        ? content.reduce((n, part) => n + (part?.type === 'reasoning' && typeof part.text === 'string' ? part.text.length : 0), 0)
        : 0
      const toolCalls = Array.isArray(content) ? content.filter((part) => part?.type === 'tool-call').length : 0
      record.assistants.push({
        seq: Number(ev.seq ?? -1),
        step: Number.isFinite(Number(data.step)) ? Number(data.step) : 1,
        text: body,
        chars: body.length,
        reasoningChars,
        toolCalls,
        at: Number(ev.time ?? 0),
      })
      continue
    }
  }

  // 只保留"有模型正文"的助手消息（工具轮、纯推理轮不算可改进内容）
  for (const record of turns) {
    record.assistants = record.assistants.filter((a) => a.chars > 0)
  }
  return { header, title, events, badLines, turns }
}

/** 列出会话（只读头，不解析正文；按 mtime 倒序）。 */
export function listSessions(options = {}) {
  const limit = Number.isFinite(options.limit) ? Number(options.limit) : 200
  const onlyAllowed = options.onlyAllowed !== false
  const out = []
  let workspaces = []
  try {
    workspaces = readdirSync(SESSIONS_ROOT)
  } catch {
    return { root: SESSIONS_ROOT, sessions: [], scanned: 0, failed: 0 }
  }
  let scanned = 0
  let failed = 0
  for (const workspace of workspaces) {
    const wsDir = join(SESSIONS_ROOT, workspace)
    let names = []
    try {
      if (!statSync(wsDir).isDirectory()) continue
      names = readdirSync(wsDir)
    } catch {
      continue
    }
    for (const name of names) {
      const dir = join(wsDir, name)
      let files = []
      let st
      try {
        if (!statSync(dir).isDirectory()) continue
        files = readdirSync(dir).filter((f) => f.endsWith('.zstd'))
        if (files.length === 0) continue
        st = statSync(join(dir, files[0]))
      } catch {
        continue
      }
      scanned += 1
      const file = join(dir, files[0])
      const header = readSessionHeader(file)
      if (header === undefined) {
        failed += 1
        continue
      }
      const preset = String(header.agentPreset ?? '(none)')
      const bucket = bucketOf(preset)
      if (onlyAllowed && !bucket.allowed) continue
      out.push({
        sessionId: String(header.id ?? name),
        dir,
        file,
        fileSize: st.size,
        mtimeMs: st.mtimeMs,
        workspace,
        preset,
        bucket: bucket.key,
        allowed: bucket.allowed,
        cwd: header.cwd ?? null,
        createdAt: Number(header.createdAt ?? 0),
        formatVersion: Number(header.version ?? -1),
      })
    }
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return { root: SESSIONS_ROOT, scanned, failed, total: out.length, sessions: out.slice(0, limit), policy: policyView() }
}

/** 按预设分桶统计（overview 用）。 */
export function bucketStats() {
  const counts = new Map()
  const byWorkspace = new Map()
  let scanned = 0
  let failed = 0
  let workspaces = []
  try {
    workspaces = readdirSync(SESSIONS_ROOT)
  } catch {
    return { scanned: 0, failed: 0, buckets: [], byWorkspace: [], policy: policyView() }
  }
  for (const workspace of workspaces) {
    const wsDir = join(SESSIONS_ROOT, workspace)
    let names = []
    try {
      if (!statSync(wsDir).isDirectory()) continue
      names = readdirSync(wsDir)
    } catch {
      continue
    }
    for (const name of names) {
      const dir = join(wsDir, name)
      let files = []
      try {
        if (!statSync(dir).isDirectory()) continue
        files = readdirSync(dir).filter((f) => f.endsWith('.zstd'))
      } catch {
        continue
      }
      if (files.length === 0) continue
      scanned += 1
      const header = readSessionHeader(join(dir, files[0]))
      if (header === undefined) {
        failed += 1
        continue
      }
      const bucket = bucketOf(header.agentPreset)
      counts.set(bucket.key, (counts.get(bucket.key) ?? 0) + 1)
      byWorkspace.set(workspace, (byWorkspace.get(workspace) ?? 0) + 1)
    }
  }
  const sortDesc = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }))
  return { scanned, failed, buckets: sortDesc(counts), byWorkspace: sortDesc(byWorkspace), policy: policyView() }
}

export function policyView() {
  return { whitelistPrefix: SESSION_WHITELIST_PREFIX, exclude: SESSION_EXCLUDE, learnOnly: 'assistant' }
}

/* ────────────────────────── 解码缓存（按 mtime 失效，最多 8 个） ────────────────────────── */

const cache = new Map()

/** 读一个会话的完整轮次（带缓存；只读）。 */
export function readSession(dir, file) {
  const st = statSync(file)
  const key = file
  const hit = cache.get(key)
  if (hit !== undefined && hit.mtimeMs === st.mtimeMs) return hit.value

  const decoded = decodeSessionFile(file)
  const parsed = parseSession(decoded.text)
  const value = {
    dir,
    file,
    fileSize: st.size,
    mtimeMs: st.mtimeMs,
    frames: decoded.frames,
    badFrames: decoded.bad,
    header: parsed.header,
    title: parsed.title,
    events: parsed.events,
    badLines: parsed.badLines,
    turns: parsed.turns,
    assistantTotal: parsed.turns.reduce((n, t) => n + t.assistants.length, 0),
  }
  cache.set(key, { mtimeMs: st.mtimeMs, value })
  if (cache.size > 8) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].mtimeMs - b[1].mtimeMs)[0]
    if (oldest !== undefined) cache.delete(oldest[0])
  }
  return value
}

/** 丢掉解码缓存（写改进后强制刷新时用）。 */
export function clearSessionCache() {
  cache.clear()
}
