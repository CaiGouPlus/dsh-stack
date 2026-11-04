/**
 * 文风实验室 · 反 AI 八股（anti）
 *
 * 反八股的**正文**不在任何用户数据文件里：`tavern-state.json` 只有开关 `antiCliche`
 * 与词表 `bannedWords`；真正注入的 15 条结构禁令是酒馆源码里的字面量
 * （`dsh-tavern/lib/index.js` 的 `state.antiCliche !== false` 分支）。
 * 于是"反八股页看不到具体内容"——只有一个开关加一个空词表。
 *
 * 本模块做三件事（**全部只读，绝不 import / 执行酒馆代码**）：
 *   ① 镜像那 15 条结构禁令 + 注入模板，拼出**与酒馆逐字一致**的注入预览；
 *   ② 漂移检测：去酒馆 index.js / utils.js 里核对关键句是否还在，对不上就如实报"镜像可能已过期"；
 *   ③ 读本地 deslop 语料（`D:/DSH/skills/deslop/references/banned-phrases.md`），
 *      把"12 条硬禁令"与词表条目解析出来，供你逐条挑进 bannedWords（当前词表是空的 → 词汇禁令段是空的）。
 */

import { join } from 'node:path'
import { readText } from './contracts.mjs'
import { readAnti, tavernSourceText } from './tavern.mjs'

/** 注入段标题（与酒馆 index.js 逐字一致）。 */
export const ANTI_HEADER = '【写作风格铁律·严格执行 — 最高优先级】'
export const ANTI_STRUCTURE_TITLE = '## 结构禁令（以下句式结构绝对禁止，换词也不行）'
export const ANTI_VOCAB_TITLE = '## 词汇禁令（以下词汇绝对禁止出现）'
export const ANTI_TAIL = '请用具体、独特、有画面感的语言替代以上所有八股句式。'

/** 15 条结构禁令（镜像 dsh-tavern 2.5.0 `lib/index.js`；顺序即编号）。 */
export const ANTI_STRUCTURE_RULES = [
  '禁止「心中/心底/心头 + 涌起/升起/泛起/掠过 + 一股/一阵/一种 + 情绪词」',
  '禁止「像是/仿佛/似乎 + 被什么（东西） + 动词（击中/攫住/扼住/抽走/牵引）」',
  '禁止「张了张嘴 + 却/又/还是/最终/想说/欲言又止」',
  '禁止「他/她 + 不知道 + 该怎么/该如何/为什么会 + 动词」',
  '禁止「沉默/许久的沉默/片刻的沉默 + 后/之后，」',
  '禁止「「...」他/她 + 轻声/低声/淡淡/柔声/哑声/沉声/冷声 + 说/道」',
  '禁止「空气中/空气里 + 弥漫着/飘散着/回荡着」',
  '禁止「像是要把...揉进/吞进/看穿/看透」',
  '禁止「让人/令人 + 无法忽视/难以忽视/移不开眼/窒息/屏息」',
  '禁止「一种 + 说不清/说不出的/难以言说的/莫名的 + 感觉/情绪/冲动」',
  '禁止「像 + 被烫到/触电/雷劈/施了魔法/钉在 + 一般/一样」',
  '禁止「仿佛/好像 + 有什么东西 + 在/正在/悄然/悄悄 + 改变/碎了/崩塌」',
  '禁止「心底/内心/灵魂 + 深处/某个角落/最柔软的地方」',
  '禁止「夜幕/夜色/天色 + 降临/渐深/渐暗/已晚」',
  '禁止「月光/月色/阳光/夕阳 + 透过/如水/皎洁/清冷」',
]

/**
 * 拼出与酒馆**逐字一致**的注入块（酒馆在 `state.antiCliche !== false` 时把它追加到角色卡文本尾部）。
 * 逐字对齐很重要：这个预览要能当"实际注入内容"看，任何润色都会让它变成假的。
 */
export function buildAntiBlock(bannedWords) {
  const words = (Array.isArray(bannedWords) ? bannedWords : []).map((w) => String(w).trim()).filter((w) => w !== '')
  const rules = ANTI_STRUCTURE_RULES.map((rule, index) => `${index + 1}. ${rule}\n`).join('')
  return (
    '\n\n' +
    ANTI_HEADER +
    '\n\n' +
    ANTI_STRUCTURE_TITLE +
    '\n\n' +
    rules +
    '\n' +
    ANTI_VOCAB_TITLE +
    '\n\n' +
    (words.length > 0 ? words.join('、') + '\n' : '') +
    '\n' +
    ANTI_TAIL
  )
}

/** 反八股条款视图：镜像正文 + 漂移检测 + 注入预览。 */
export function antiRulesView() {
  const anti = readAnti()
  const source = tavernSourceText('index.js')
  const checked = source !== undefined
  const missing = checked ? ANTI_STRUCTURE_RULES.filter((rule) => !source.includes(rule)) : []
  const headerFound = checked ? source.includes(ANTI_HEADER) : false
  const tailFound = checked ? source.includes(ANTI_TAIL) : false
  const ok = checked && missing.length === 0 && headerFound && tailFound
  return {
    enabled: anti.enabled,
    bannedWords: anti.bannedWords,
    wordCount: anti.bannedWords.length,
    file: anti.file,
    mtimeMs: anti.mtimeMs,
    structureRules: ANTI_STRUCTURE_RULES.slice(),
    header: ANTI_HEADER,
    structureTitle: ANTI_STRUCTURE_TITLE,
    vocabTitle: ANTI_VOCAB_TITLE,
    tail: ANTI_TAIL,
    preview: buildAntiBlock(anti.bannedWords),
    previewChars: buildAntiBlock(anti.bannedWords).length,
    mirror: {
      checked,
      ok,
      found: ANTI_STRUCTURE_RULES.length - missing.length,
      total: ANTI_STRUCTURE_RULES.length,
      missing,
      headerFound,
      tailFound,
      note: !checked
        ? '读不到酒馆 index.js，无法核对镜像（条款仍按 dsh-tavern 2.5.0 显示）'
        : ok
          ? '镜像与酒馆 index.js 一致（15/15 条 + 首尾句）'
          : '镜像可能已过期：酒馆改过这段，请对照 index.js 复核',
    },
  }
}

/* ────────────────────── 本地反八股语料（deslop，只读） ────────────────────── */

/** deslop 技能目录（可用 DSH_DESLOP_DIR 覆盖）。 */
export function deslopDir() {
  return process.env.DSH_DESLOP_DIR ?? 'D:/DSH/skills/deslop'
}

/**
 * 把一个表格单元展开成候选条目（把「（a / b / c）」「甲 / 乙」这类并列写法摊平）。
 *
 * 三条判定，都是从这份词表的实际写法里总结出来的：
 *   ① 含 `/` 的括号 = 并列选项（`（明白 / 懂得 / 看清）`）；
 *   ② 单元末尾、且不含 `/` 的括号 = 说明文字，丢掉（`缓缓地 / 轻轻地（三连出现时）` → 不要"三连出现时"）；
 *   ③ 其余位置、不含 `/` 的括号 = 字面文本（`被什么（东西）` → 保留"东西"）。
 * 展开上限 8 个组合，避免组合爆炸。
 */
function expandVariants(cell) {
  const clean = String(cell ?? '').replace(/[`*]/gu, '').trim()
  if (clean === '') return []
  const parts = []
  let rest = clean
  // ⚠️ 这里**不能**带 g 标志：循环里每次都拿新的 rest 重新 exec，g 的 lastIndex 会指向旧串的偏移，
  //    导致第二次匹配静默失败（第一版就是这么把「（一切 / 所有 / 真相）」漏成字面文本的）。
  const re = /[（(]([^（）()]*)[）)]/u
  let hit = re.exec(rest)
  while (hit !== null) {
    if (hit.index > 0) parts.push({ text: rest.slice(0, hit.index) })
    const isLast = hit.index + hit[0].length === rest.length
    const options = hit[1].split(/[／/、]|或/gu).map((s) => s.trim()).filter((s) => s !== '')
    if (options.length > 1) parts.push({ options })
    else if (!isLast) parts.push({ text: options[0] ?? '' })
    rest = rest.slice(hit.index + hit[0].length)
    hit = re.exec(rest)
  }
  if (rest !== '') parts.push({ text: rest })

  let out = ['']
  for (const part of parts) {
    const options = part.text !== undefined
      ? part.text.split(/\s*[／/]\s*/u).map((s) => s.trim()).filter((s) => s !== '')
      : part.options
    const list = options.length > 0 ? options : ['']
    const next = []
    for (const prefix of out) for (const option of list) next.push(prefix + option)
    out = next.slice(0, 8)
  }
  const items = out.map((s) => s.trim()).filter((s) => s !== '' && s.length <= 30)
  return items.length > 0 ? items : [clean]
}

/** 取某个二级标题到下一个二级标题之间的正文。 */
function sectionBody(text, heading) {
  const start = text.indexOf(heading)
  if (start < 0) return ''
  const after = text.slice(start + heading.length)
  const next = /\n##\s/u.exec(after)
  return next === null ? after : after.slice(0, next.index)
}

/** 解析 `## 六、…` 下的编号清单。 */
function parseNumbered(body) {
  const out = []
  for (const line of body.split('\n')) {
    const m = /^\s*(\d+)[.、)]\s*(.+?)\s*$/u.exec(line)
    if (m !== null) out.push(m[2])
  }
  return out
}

/** 解析 markdown 表格的第一列（跳过表头与分隔行），并把并列写法展开成候选条目。 */
function parseFirstColumn(body) {
  const out = []
  for (const line of body.split('\n')) {
    const m = /^\|\s*(.+?)\s*\|/u.exec(line.trim())
    if (m === null) continue
    const cell = m[1]
    if (cell === '' || /^-+$/u.test(cell) || cell === '形式' || cell === '标点' || cell === '用途' || cell === '原文结构') continue
    for (const item of expandVariants(cell)) if (!out.includes(item)) out.push(item)
  }
  return out
}

/**
 * 读本地 deslop 语料：12 条生成期硬禁令 + 三类词表（句尾补语 / 网文套语 / 议论文腔）。
 * 词表是**线索**不是违禁词（deslop 原文就这么写的），所以这里的条目只做"候选"，
 * 由你在界面上逐条挑进 bannedWords —— 绝不自动写入。
 */
export function deslopCorpus() {
  const file = join(deslopDir(), 'references', 'banned-phrases.md')
  const text = readText(file)
  if (text === undefined) return { file, exists: false, hardRules: [], sections: [], note: '读不到 deslop 词表（可用环境变量 DSH_DESLOP_DIR 指定技能目录）' }
  const sections = [
    { title: '一、句尾补语（一律可删）', heading: '## 一、', items: parseFirstColumn(sectionBody(text, '## 一、')) },
    { title: '二、网文套语（密度高就删）', heading: '## 二、', items: parseFirstColumn(sectionBody(text, '## 二、')) },
    { title: '三、议论文腔与空洞连接词', heading: '## 三、', items: parseFirstColumn(sectionBody(text, '## 三、')) },
  ]
  return {
    file,
    exists: true,
    hardRules: parseNumbered(sectionBody(text, '## 六、')),
    sections: sections.map((s) => ({ title: s.title, count: s.items.length, items: s.items })),
    note: '词表是线索不是违禁词：挑真正反复出现的，别整表塞进去（整表会进每一轮 prompt）。',
  }
}
