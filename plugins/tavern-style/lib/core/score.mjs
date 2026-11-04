/**
 * 文风实验室 · 指标层（score）
 *
 * 确定性、零依赖、毫秒级：给任意一段正文算出**可比较的数字**与**八股命中**。
 * 用途：
 *   - 工作台保存改进时给「改进前后对比」（命中 X→Y）；
 *   - 比对页做分布拟合与版本对照；
 *   - 全部可解释（每条命中都有名字与证据片段），不是黑箱分数。
 *
 * 说明：这里是**轻量内置**规则（面板要快）；深度分析仍由「文风实验室」预设调用
 * `D:\DSH\skills\deslop\scripts\deslop-lint.mjs` 完成（那边规则库 60KB）。
 */

/** 八股 / AI 味模式表：name 用于展示，re 用于命中，weight 用于打分。
 *  ⚠️ 这些正则带 g 标志且是模块级共享实例：只配 String.match 使用（它会重置 lastIndex）；
 *  别改成 exec/test 循环 —— lastIndex 复用会静默漏匹配（deslop-lint 已按 source+按需编译处理同类问题）。
 *  内容口径与 deslop-lint 的 BANNED/EXT_PATTERNS 对齐（二分壳、像类比喻、章节标记等 2026-10 补齐）。 */
export const PATTERNS = [
  { name: '套话总起', re: /(?:^|[。！？\n])\s*(?:首先|其次|再次|最后|第一|第二|第三)[，,、]/gu, weight: 3 },
  { name: '总结升华', re: /(?:总而言之|总的来说|总之|说到底|归根结底|换句话说|也就是说)/gu, weight: 4 },
  { name: '抒情定论', re: /(?:在这一刻|那一刻|此时此刻|仿佛整个世界|像是全世界|也许[，,]?这就是)/gu, weight: 4 },
  { name: '不禁不由得', re: /(?:不由得|不禁|忍不住地)/gu, weight: 3 },
  { name: '程度套词', re: /(?:某种程度上|某种意义上|在某种意义上|从某种意义上说|不得不说|值得一提的是|需要注意的是)/gu, weight: 3 },
  { name: '面对受众', re: /(?:让我们一起|让我们|你会发现|你会发现到|你会发现这)/gu, weight: 3 },
  /* 二分壳：与 deslop-lint 的 BUSHI_SHELL_SRC 同口径（两半都不含逗号、必须隔逗号） */
  { name: '二分壳句式', re: /不是[^。！？!?，,\n]{1,16}[，,]\s*(?:而|却)?是[^。！？!?，,\n]{1,20}/gu, weight: 3 },
  { name: '抽象名词堆', re: /(?:命运|宿命|轮回|永恒|虚无|意义本身|存在的意义)/gu, weight: 2 },
  { name: '元叙述', re: /(?:读者|本章|前文提到|如上所述|回顾一下|伏笔|上文|下文)/gu, weight: 4 },
  /* 小说正文里冒「第X章」＝把章节结构写进叙述（元话语） */
  { name: '章节标记', re: /第[零一二三四五六七八九十百千万\d]+[章回节卷]/gu, weight: 2 },
  { name: '比喻滥用', re: /(?:仿佛|宛如|宛若|犹如|恍如|好似|好比|恰似)/gu, weight: 2 },
  { name: '口语比喻', re: /(?:就像|如同)/gu, weight: 1 },
  /* 「像…一样/似的/般」结构判定：不靠前置字排除（那会误杀「身影像雾」），
     只认比喻句式本身 —— 「图像/像话/不像」天然进不来。 */
  { name: '比喻（像…一样）', re: /像[^。！？!？\n，,]{1,12}?(?:一样|似的|般地?)/gu, weight: 1 },
  /* 夹注式破折号：插入语里出现「；：」就不算典型夹注（降低误报） */
  { name: '破折号插入', re: /——[^——\n。！？；：]{2,60}——/gu, weight: 2 },
  { name: '心理直陈', re: /(?:心里想|心想|暗自|默默地想|心中暗道|盘算着)/gu, weight: 3 },
  { name: '微表情套件', re: /(?:一丝|一抹|一缕|一阵|一种)(?:不易察觉的|淡淡的|复杂的|难以言喻的)?(?:情绪|感觉|笑意|悲哀|暖意)/gu, weight: 3 },
  { name: '感叹堆砌', re: /(?:多么|何等|何其)(?:的)?/gu, weight: 2 },
  { name: '转折连词密集', re: /(?:然而|但是|不过|却)[，,]/gu, weight: 1 },
  /* 空转搭配：说了等于没说的「万能动词」 */
  { name: '空转搭配', re: /(?:起到了?.{0,6}作用|奠定了?.{0,6}基础|使得[^。！？\n]{0,20}得以|给予了?.{0,6}支持|有着[^。！？\n]{0,10}意义)/gu, weight: 2 },
  { name: '总结式收尾', re: /(?:就这样|从此|而这[，,]?一切|一切(?:都)?(?:归于|恢复)平静|故事(?:才)?刚刚开始)[。！？]?\s*$/gu, weight: 4 },
]

/* ── 口径工具（与 deslop-lint 对齐） ─────────────────────────
 *   字数 = 去空白字符数；句长 = 句子去空白长度；段落 = 非空行（每行一段）；
 *   对白比 = 引号内去空白字数 / 总字数；短句 <15 字、长句 >40 字。 */
const CJK_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u
const QUOTE_PAIRS = { '「': '」', '『': '』', '“': '”', '‘': '’' }
const nw = (s) => String(s).replace(/\s+/gu, '')
const hasCjk = (s) => CJK_RE.test(s)

/** 引号状态机：算出对白字数与引号段数（引号不跨行；字数含引号本身，与 deslop-lint 的 nw(dialogue) 同口径）。 */
function quoteStats(text) {
  let inQuote = false
  let closeCh = null
  let dlgChars = 0
  let spans = 0
  for (const ch of String(text)) {
    if (!inQuote) {
      if (QUOTE_PAIRS[ch] !== undefined) { inQuote = true; closeCh = QUOTE_PAIRS[ch]; spans += 1; dlgChars += 1 }
      else if (ch === '"') { inQuote = true; closeCh = '"'; spans += 1; dlgChars += 1 }
      continue
    }
    if (ch === closeCh) { inQuote = false; closeCh = null; dlgChars += 1; continue }
    if (ch === '\n') { inQuote = false; closeCh = null; continue }
    if (!/\s/u.test(ch)) dlgChars += 1
  }
  return { dlgChars, spans }
}

function round(value, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/** 一段正文的全部指标。 */
export function metrics(text) {
  const body = String(text ?? '')
  const chars = nw(body).length
  const sentences = body.split(/(?<=[。！？!?…])|\n+/u).map((s) => s.trim()).filter(hasCjk)
  const lengths = sentences.map((s) => nw(s).length)
  const sum = lengths.reduce((a, b) => a + b, 0)
  const avg = lengths.length === 0 ? 0 : sum / lengths.length
  const variance = lengths.length === 0 ? 0 : lengths.reduce((acc, n) => acc + (n - avg) ** 2, 0) / lengths.length
  const paragraphs = body.split(/\n+/u).map((p) => p.trim()).filter(hasCjk)
  const { dlgChars, spans } = quoteStats(body)
  const dialogueCount = spans

  const hits = []
  const byPattern = {}
  let weighted = 0
  for (const pattern of PATTERNS) {
    const found = body.match(pattern.re) ?? []
    if (found.length === 0) continue
    byPattern[pattern.name] = found.length
    weighted += found.length * pattern.weight
    hits.push({ name: pattern.name, count: found.length, samples: found.slice(0, 3) })
  }
  hits.sort((a, b) => b.count - a.count)

  const shortRatio = lengths.length === 0 ? 0 : lengths.filter((n) => n < 15).length / lengths.length
  const longRatio = lengths.length === 0 ? 0 : lengths.filter((n) => n > 40).length / lengths.length
  const dialogueRatio = chars === 0 ? 0 : Math.min(1, dlgChars / chars)

  // 结构分：长短交替 + 有对白 + 段落粒度合理（各占一部分），最多 20 分
  const structureBonus =
    (shortRatio > 0.15 && longRatio > 0.05 ? 8 : 3) +
    (dialogueRatio > 0.1 ? 7 : 2) +
    (paragraphs.length > 0 && chars / paragraphs.length < 220 ? 5 : 2)

  // 空文本直接 0 分（否则只剩结构分 → 曾经的 bug：metrics('').score = 97）；
  // 八股惩罚上限从 60 放宽到 90：命中足够多时扣得穿，能区分「轻度八股」和「通篇八股」。
  const score = chars === 0
    ? 0
    : Math.max(0, Math.min(100, Math.round(100 - Math.min(90, weighted) + structureBonus - 10)))

  return {
    chars,
    sentences: sentences.length,
    paragraphs: paragraphs.length,
    avgSentence: round(avg),
    sentenceStd: round(Math.sqrt(variance)),
    shortRatio: round(shortRatio, 3),
    longRatio: round(longRatio, 3),
    dialogueCount,
    dialogueRatio: round(dialogueRatio, 3),
    avgParagraphChars: paragraphs.length === 0 ? 0 : Math.round(paragraphs.reduce((n, p) => n + nw(p).length, 0) / paragraphs.length),
    aiHits: { total: hits.reduce((n, h) => n + h.count, 0), weighted: round(weighted), byPattern },
    aiHitList: hits,
    score,
  }
}

/** 改进前后对比：给工作台的即时反馈。 */
export function compare(before, after) {
  const a = metrics(before)
  const b = metrics(after)
  return {
    before: a,
    after: b,
    delta: {
      score: b.score - a.score,
      aiHits: b.aiHits.total - a.aiHits.total,
      weighted: round(b.aiHits.weighted - a.aiHits.weighted),
      chars: b.chars - a.chars,
      avgSentence: round(b.avgSentence - a.avgSentence),
      dialogueRatio: round(b.dialogueRatio - a.dialogueRatio, 3),
    },
    removed: Object.keys(a.aiHits.byPattern).filter((k) => (b.aiHits.byPattern[k] ?? 0) < a.aiHits.byPattern[k]),
    added: Object.keys(b.aiHits.byPattern).filter((k) => (a.aiHits.byPattern[k] ?? 0) < b.aiHits.byPattern[k]),
  }
}

/**
 * 分布拟合：把"目标文本集合"的特征分布当基准，量出"待测文本集合"与它的距离。
 * 只用可解释的 5 个维度，数值越小越接近。
 * 口径与 deslop-lint 对齐（2026-10 起）：字数去空白、句长按去空白长度、短句 <15 / 长句 >40、
 * 段落按非空行、对白比 = 引号内字数占比。
 * gap 的归一化尺度 = 目标集标准差（目标自身波动越小，同样的偏差算得越重），
 * 无波动时退化为 |目标均值|×0.5，再兜底 0.1 —— 避免 base=0 时某个维度一家独大或除零。
 */
export function distributionDistance(targets, samples) {
  const dims = ['avgSentence', 'sentenceStd', 'dialogueRatio', 'shortRatio', 'avgParagraphChars']
  const mean = (list, key) => (list.length === 0 ? 0 : list.reduce((n, m) => n + Number(m[key] ?? 0), 0) / list.length)
  const std = (list, key) => {
    if (list.length === 0) return 0
    const m = mean(list, key)
    return Math.sqrt(list.reduce((acc, x) => acc + (Number(x[key] ?? 0) - m) ** 2, 0) / list.length)
  }
  const targetMetrics = targets.map((t) => metrics(t))
  const sampleMetrics = samples.map((s) => metrics(s))
  const rows = dims.map((key) => {
    const base = mean(targetMetrics, key)
    const now = mean(sampleMetrics, key)
    const scale = Math.max(std(targetMetrics, key), Math.abs(base) * 0.5, 0.1)
    return { key, target: round(base), sample: round(now), gap: round((now - base) / scale, 3) }
  })
  const distance = round(
    rows.reduce((sum, row) => sum + Math.abs(row.gap), 0) / Math.max(1, rows.length),
    3,
  )
  return { distance, rows, targets: targetMetrics.length, samples: sampleMetrics.length }
}
