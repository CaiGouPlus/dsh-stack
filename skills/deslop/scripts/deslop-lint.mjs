#!/usr/bin/env node
/**
 * deslop-lint — 中文小说 AI 味量化检测（零依赖）
 *
 * 用法:
 *   node deslop-lint.mjs <文件|目录> [...] [选项]
 *
 * 选项:
 *   --profile=normal|strict|loose   阈值档位（默认 normal）
 *   --json                          输出 JSON（隐含 --no-color）
 *   --no-color                      关闭 ANSI 颜色
 *   --quiet                         只出汇总与超标项，不列逐条命中
 *   --no-strip-html                 不剥离 HTML 标签
 *   --min-chars=N                   跳过正文小于 N 字的文件（默认 100；N 为非负整数）
 *   --cross[=N]                     跨文件复读检测（连载/多轮专用；N=shingle 长度，默认 8，≥2 的整数）
 *   --exclude=RE[,RE...]            额外排除的文件名正则（默认已排除 .stats.* / .lint.* / .bak）
 *   -h, --help                      帮助
 *
 * 退出码: 0 = 通过 / 1 = 存在 fail 级问题 / 2 = 用法或读取错误
 *
 * 阈值与规则来源: references/banned-phrases.md、references/banned-patterns.md
 * 注意: 本脚本只做「读感」的确定性检测，不承诺也不追求通过任何 AI 检测器。
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, extname, join } from 'node:path';
import { EXT_PATTERNS } from './patterns-ext.mjs';

/* ------------------------------------------------------------------ 参数 */

const opts = {
  profile: 'normal',
  json: false,
  color: process.stdout.isTTY === true,
  quiet: false,
  stripHtml: 'auto',
  minChars: 100,
  failOn: 'blocking',
  ignoreIds: new Set(),
  cross: 0,          // >0 时开启跨文件复读检测，值为 shingle 长度（默认 8 字）
  exclude: [],       // 额外排除的文件名正则（作用在 basename 上）
};

// 旁挂/工具文件：不是正文，别当稿子扫。
// .stats.txt 是 extract-prose.mjs 写的统计边车；.lint.txt / .bak 同理。
const DEFAULT_EXCLUDE = [/\.stats\.[a-z]+$/i, /\.lint\.[a-z]+$/i, /\.bak$/i];
const inputs = [];

/** 参数里的非负整数解析：非法值直接报错退出，不再像以前那样静默当成默认值。 */
function parseNat(raw, name, min) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) {
    console.error(`${name} 需要一个 ≥${min} 的整数，收到: "${raw}"`);
    process.exit(2);
  }
  return n;
}

for (const a of process.argv.slice(2)) {
  if (a.startsWith('--profile=')) opts.profile = a.slice('--profile='.length).trim();
  else if (a.startsWith('--fail-on=')) opts.failOn = a.slice('--fail-on='.length).trim();
  else if (a === '--json') { opts.json = true; opts.color = false; }
  else if (a === '--no-color') opts.color = false;
  else if (a === '--quiet') opts.quiet = true;
  else if (a === '--no-strip-html') opts.stripHtml = 'off';
  else if (a.startsWith('--min-chars=')) opts.minChars = parseNat(a.slice('--min-chars='.length), '--min-chars', 0);
  else if (a === '--cross') opts.cross = 8;
  else if (a.startsWith('--cross=')) opts.cross = parseNat(a.slice('--cross='.length), '--cross', 2);
  else if (a.startsWith('--exclude=')) {
    for (const re of a.slice('--exclude='.length).split(',')) {
      const t = re.trim();
      if (!t) continue;
      try { opts.exclude.push(new RegExp(t, 'i')); }
      catch (err) { console.error(`--exclude 正则无效: ${t} — ${err.message}`); process.exit(2); }
    }
  }
  else if (a === '-h' || a === '--help') { usage(); process.exit(0); }
  else if (a.startsWith('-')) { console.error(`未知选项: ${a}`); usage(); process.exit(2); }
  else inputs.push(a);
}

if (!['normal', 'strict', 'loose'].includes(opts.profile)) {
  console.error(`--profile 只接受 normal / strict / loose，收到: ${opts.profile}`);
  process.exit(2);
}
if (!['blocking', 'all'].includes(opts.failOn)) {
  console.error(`--fail-on 只接受 blocking / all，收到: ${opts.failOn}`);
  process.exit(2);
}
if (inputs.length === 0) { usage(); process.exit(2); }

/**
 * .deslop-ignore —— 作者白名单。
 * 有意选择的写法可以在这里按 id 豁免（每行一个 id，# 开头为注释）。
 * 查找顺序：文件同级目录 → 当前工作目录。
 */
function loadIgnore(filePath) {
  const candidates = [join(resolve(filePath, '..'), '.deslop-ignore'), join(process.cwd(), '.deslop-ignore')];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const ids = new Set();
    for (const raw of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const line = raw.split('#')[0].trim();
      if (line) ids.add(line);
    }
    return { ids, path: p };
  }
  return { ids: new Set(), path: null };
}

function usage() {
  console.log(`
deslop-lint — 中文小说 AI 味量化检测（零依赖）

  node deslop-lint.mjs <文件|目录> [...] [选项]

  以你本机的 skill 为例:
  node "D:/DSH/skills/deslop/scripts/deslop-lint.mjs" 第三章.md
  node "D:/DSH/skills/deslop/scripts/deslop-lint.mjs" 正文/ --profile=strict
  node "D:/DSH/skills/deslop/scripts/deslop-lint.mjs" 正文/ --json > report.json

选项:
  --profile=normal|strict|loose   阈值档位（默认 normal）
  --fail-on=blocking|all          退出码依据（默认 blocking：只有高精度判据影响退出码）
  --json                          输出 JSON（隐含 --no-color）
  --no-color                      关闭 ANSI 颜色
  --quiet                         只出汇总与超标项，不列逐条命中
  --no-strip-html                 不剥离 HTML 标签
  --min-chars=N                   跳过正文小于 N 字的文件（默认 100；N 为非负整数）
  --cross[=N]                     跨文件复读检测（连载/多轮专用；N=shingle 长度，默认 8，≥2 的整数）
  --exclude=RE[,RE...]            额外排除的文件名正则（默认已排除 .stats.* / .lint.* / .bak）

退出码: 0 通过 / 1 有失败级问题 / 2 用法或读取错误（extract-prose.mjs 另用 3 表示抽取占比异常）

白名单: 在被检查文件同级目录或当前工作目录放 .deslop-ignore，
        每行一个要豁免的判据 id（# 开头为注释）。
`);
}

/* --------------------------------------------------------------- 文本工具 */

const CJK_G = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g;
// 「像」假阳性**整词**排除（旧版是单字后行断言，两头都错：「像话」漏排除、「身影像雾」被「影」误杀）：
//   ① X像 复合词里的「像」是语素、不是比喻 —— 前字命中排除集就整词排除
//     （好像/图像/想像/偶像/形像/录像/摄像/肖像/画像/影像/声像/实像/假像/相像/雕像/…）。
//     注意「人/头/真/对/景/迹/印/事/现」**不进**排除集：「人像蚂蚁」「头像拨浪鼓」是真比喻，
//     而 对象/景象/迹象/印象/事项/现象/真相 里根本没有「像」（是 象/相/项），排了反而误伤。
//   ② 「影」双向处理：影像要排除，但 身影像雾/人影像/倒影像… 是真比喻 ——
//      「影」前面是 身/人/背/树/… 这类词头（影属于前词）时放行，否则排除。
//   ③ 后字排除：像话/像样/像素/像差/像元 —— 「像」后跟 话/样/素/差/元 时不是比喻（「他太不像话了」不计）。
const SIMILE_SRC = '仿佛|宛如|宛若|犹如|恍如|好似|好比|恰似|像是|就像|如同|似的'
  + '|(?<=[身人背树山月光水火灯门窗帘倒斜残孤]影)像'
  + '|(?<![好图想偶形录摄肖画声实假相影雕蜡神遗绣群佛圣石铜坐立塑铸造虚成显拟])像(?![话样素差元])';
const DASH_G = /[\u2014\u2015\u2500]/g;
const ELLIPSIS_G = /…/g;
const BANG_G = /！/g;

// 机器头外显：世界书/模板标题泄漏到正文（真泄漏）
const MACHINE_SRC = '【(?:事件背景|故事梗概|当前区域概览|区域概览|战役进度|故事摘要|剧情梗概|场景梗概|本轮摘要|输出契约|输出格式)】|<(?:故事梗概|事件背景|梗概|摘要|剧情梗概|场景梗概)>';
// 输出契约标签：这类标签是否合法取决于调用方的输出契约，默认只提示、不计入超限
const CONTRACT_SRC = '<(?:status|Status|状况|状态更新|state|STATE)>|\\[\\[状态更新\\]\\]';
// 元信息穿透
const META_SRC = '第[一二三四五六七八九十百零\\d]+章|本章|读者|伏笔|前文提到|如上所述|如前文|回顾一下';

// 禁用句式（结构层）
// 副词堆叠判据用的「X 地/的」副词族（缓缓地/轻轻地/淡淡地…）
const ADVERB_SRC = '(?:缓缓|轻轻|淡淡|默默|静静|悄悄|微微|徐徐|慢慢|渐渐)';
const BANNED = [
  { src: '不是[^。！？\\n]{0,24}?而是', label: '二分壳（不是X而是Y）' },
  { src: '(?:不仅|不只|非但)[^。！？\\n]{0,20}?(?:更|而且|还)|不仅仅[^。！？\\n]{0,20}', label: '递进排比（不仅X更Y）' },
  { src: '这一刻[，,、]', label: '句尾补语（这一刻…）' },
  { src: '(?:时间|空气|世界|一切)[^。！？\\n]{0,4}(?:仿佛|似乎|好像)[^。！？\\n]{0,4}(?:静止|凝固|停住|安静)', label: '句尾补语（时间仿佛静止）' },
  { src: '(?:终于|这才|方才|这才算)(?:明白|懂得|意识到|看清|读懂了?)了?(?:一切|所有|什么|真相)', label: '句尾补语（终于明白了一切）' },
  // 词表 §一「一切都已不同/一切都变了」「这意味着什么，或许只有他自己知道」——以前词表有、脚本没有
  { src: '一切都已不同|一切都变了|一切都不一样了', label: '句尾补语（一切都变了）' },
  { src: '这意味着什么[^。！？\\n]{0,24}(?:知道|明白|清楚)', label: '句尾补语（这意味着什么…）' },
  { src: '而这一切[，,]?\\s*(?:或许|也许|大概)?[，,]?\\s*(?:才|正)刚?刚?开始', label: '模板化悬念（才刚刚开始）' },
  { src: '命运的齿轮|冥冥之中|早已注定|注定的|宿命般地', label: '宿命腔' },
  { src: '(?:不由|不由自主|下意识|鬼使神差)地?', label: 'AI 高频副词（不由/下意识/鬼使神差）' },
  { src: '(?:眼中|眼里|眼底)[^。！？\\n]{0,5}(?:闪过|掠过|划过|闪过一丝)', label: '网文套语（眼中闪过）' },
  { src: '嘴角[^。！？\\n]{0,6}(?:勾起|扬起|上扬|翘起|泛起)', label: '网文套语（嘴角勾起）' },
  { src: '(?:瞳孔|眼眸|眸色)[^。！？\\n]{0,4}(?:一缩|收缩|骤缩|微缩)', label: '网文套语（瞳孔一缩）' },
  { src: '深吸(?:了)?一口气', label: '网文套语（深吸一口气）' },
  { src: '(?:一阵|一股|一丝)[^。！？\\n]{0,10}(?:涌上|袭上|涌起|泛上)(?:心头|全身|心间)', label: '情绪直给（涌上心头）' },
  { src: '(?:心中|心头|心里)(?:一紧|一沉|一凛|一颤)', label: '情绪直给（心中一沉）' },
  { src: '(?:他|她|你|我)(?:感到|觉得|感受到|感觉到了)[^。！？\\n]{0,6}(?:无比|十分|非常|万分|无比地|格外)', label: '情绪直给（他感到无比…）' },
  { src: '(?:值得一提的?是|不可否认|毫无疑问|众所周知|不言而喻|毋庸置疑)', label: '议论文腔' },
  { src: '(?:此外|然而|因此|与此同时|综上所述|总而言之)[，,]', label: '连接词滥用' },
  { src: '在(?:这个|如今这个|当下这个|这样一个)[^。！？\\n]{0,12}(?:的时代|的社会|的世界|的背景下)', label: '空洞时代背景' },
  { src: '(?:内心|心底|心灵)(?:深处|一阵|涌起)', label: '心理直给' },
  { src: '(?:脸色|神情)[^。！？\\n]{0,3}(?:一变|大变|骤变|微变)', label: '偷懒写法（脸色一变）' },
  // 词表 §二「眼神中（透出/流露出）」「缓缓地/轻轻地/淡淡地（三连出现时）」——以前词表有、脚本没有
  { src: '(?:眼神|目光|眼波|眼底|眸光|眸子)[^。！？\\n]{0,4}(?:透出|流露出|流露着|透着)', label: '情绪直给（眼神透出）' },
  {
    src: ADVERB_SRC + '[的地][^。！？\\n]{0,12}' + ADVERB_SRC + '[的地][^。！？\\n]{0,12}' + ADVERB_SRC + '[的地]',
    label: '副词堆叠（缓缓地/轻轻地/淡淡地 三连）',
  },
  // 词表 §三「从某种意义上说/在某种程度上」「使得…得以/奠定基础/起到作用」——以前词表有、脚本没有
  { src: '从某种意义上(?:说|来讲|来看)?|在某种程度上|在某种意义上', label: '空转限定（从某种意义上说）' },
  { src: '使得[^。！？\\n]{0,12}得以|为[^。！？\\n]{0,20}奠定(?:了)?基础|起到了?[^。！？\\n]{0,12}的作用', label: '公文腔（奠定基础/起到作用）' },
];

// 章末金句的抽象词
const ABSTRACT_SRC = '命运|意义|一切|未来|永恒|世界|孤独|宿命|真相|终点|开端|轮回|时间';
// 正文里的 markdown 加粗：小说正文不该有强调标记，是纯 AI 特征
const BOLD_SRC = '\\*\\*[^*\\n]{1,40}\\*\\*';
// 夹注式破折号：成对「——插入语——」
// 高精度判据：真插入语是短成分，内部不会含句末/分句标点。不加这条会大量误报
//（两个独立的单侧破折号会被窗口配对成"成对"）。
const DASH_PAIR_SRC = '——[^——\\n。！？；：]{2,60}——';

/* ---- 加法层指标（治「贫瘠型」AI 味：扁平、无张力、无个性）----
 * 注意：这几个阈值是语言学估计，未用真人语料校准，定位是「补加法的提示」
 * 而非硬红线，所以 fail 线设得较远。 */
// 对话语气词：真实口语约每 15-25 字一个
// v3.21 · 卡规 S8：「不是A（，）是B」否定-纠正二分壳（先否定再纠正，模型最爱的翻案句式）
const BUSHI_SHELL_SRC = '不是[^。！？!?，,\\n]{1,16}[，,]\\s*(?:而)?是[^。！？!?，,\\n]{1,20}';
const MODAL_SRC = '[吧呢啊嘛呀哦噢唔嗯呃唉欸啧哼嘿咦嘞咯啦哟呗哇唷切]';
// 意图 / 欲望驱动：叙述是「我要做什么」还是「我看到了什么」
// 注：除抽象意图词外，也收「有意图的具体动作」（摸出/拎起/塞回…）——那同样是欲望驱动，
//     只收"想/打算"会漏掉动作型叙述（实测漏计率可达 3 倍）。
const INTENT_SRC = '想|打算|试图|决定|必须|得先|不敢|忍住|防备|准备|留心|留意|盘算|琢磨|试着|伸手|摸向|盯住|转向|凑近|退开|要拿|要问|要看|得找|找找|摸出|拔出|掏出|抓起|拎起|塞回|揣进|先把|得把|只能|不得不|我做了|我决定|我宁愿|我只好';
// 叙述者态度 / 判断：叙述者有没有在评判世界
// 注：除纯情绪形容词外，也收「第一人称表态」与「评价性副/短语」——中文小说里判断常写成
//     "我承认这不太礼貌""多半是""恐怕"这类句子，而不是"我觉得荒唐"。
const ATTITUDE_SRC = '奇怪|古怪|麻烦|该死|见鬼|可怕|可笑|荒唐|不该|居然|竟然|偏偏|果然|显然|难怪|不对劲|不安|厌恶|恶心|难看|好笑|丢人|没必要|没道理|我承认|我学会|我原以为|我宁愿|我后悔|我庆幸|多半|恐怕|也算|算是|所谓|不划算|还不如|宁可|还好|幸好|顶多|撑死|犯不着|划不来';
// 句间驱动：因果 / 转折（把并列关系变成挤压关系）
// 注：`可` 必须排除「可以」——它不表转折，实测在 6 次「可」里占 4 次误报。
const CAUSAL_SRC = '于是|所以|因此|可(?!以)|但|却|偏偏|结果|没想到|反倒|反而|这才|原来|怪不得';
// 过度解释：叙述者替读者把动机/含义推断完，不给留白
// （注意：只收「推断式插入」这种高精度形态，不收「原来/难怪」——它们更多是揭示而非解释）
const OVEREXPLAIN_SRC = '(?:他|她|你|我|它)(?:大概|显然|多半|想必|一定|肯定)(?:不|是|会|在|已经)|也就是说|换句话说|这意味着|这说明|之所以[^。！？\\n]{0,12}是因为';
// 景物起笔的景物词与人物动作词
const SCENERY_SRC = '雾|雨|雪|风|月光|阳光|晨光|朝阳|夕阳|黄昏|暮色|夜色|天色|空气|云|星光|晨曦|寒意|霜|晨雾|细雨|天光';
const AGENT_SRC = '他|她|你|我|它|们|说|问|走|跑|看|听|笑|喊|叫|推|拉|拿|放|坐|站|转身|抬头|低头|伸手|开口|回答|道：|应道';

/* 正则编译缓存。
 * 同一条判据会在「全文 / 每段 / 每句」上反复匹配，此前每次 matchAll 都 new RegExp 重新编译。
 * 缓存只给 matchAll 用（String.matchAll 内部克隆正则、不碰 lastIndex）；
 * .test 一律走 hasMatch（无 g 标志、无 lastIndex 状态），从根上避免 g 标志的 lastIndex 复用坑。 */
const RE_G = new Map();
const RE_PLAIN = new Map();
const srcOf = (src) => (typeof src === 'string' ? src : src.source);
const re = (src) => {
  const k = srcOf(src);
  let r = RE_G.get(k);
  if (!r) { r = new RegExp(k, 'g'); RE_G.set(k, r); }
  return r;
};
const matchAll = (text, src) => [...text.matchAll(re(src))];
const hasMatch = (text, src) => {
  const k = srcOf(src);
  let r = RE_PLAIN.get(k);
  if (!r) { r = new RegExp(k); RE_PLAIN.set(k, r); }
  return r.test(text);
};

function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return (idx) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= idx) lo = mid; else hi = mid - 1; }
    return lo + 1;
  };
}

function stripHtmlIfNeeded(text) {
  if (opts.stripHtml === 'off') return text;
  const looksHtml = (text.match(/<[a-zA-Z][^>]{0,200}>/g) || []).length;
  if (opts.stripHtml === 'auto' && looksHtml < 20) return text;
  return text
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"');
}

const nw = (s) => s.replace(/\s+/g, '');
const cjkCount = (s) => (s.match(CJK_G) || []).length;

function splitParagraphs(text) {
  return text.split(/\n+/).map((s) => s.trim()).filter((s) => cjkCount(s) > 0);
}
function splitSentences(text) {
  return text
    .split(/(?<=[。！？!?…])|\n+/)
    .map((s) => s.trim())
    .filter((s) => cjkCount(s) > 0);
}
function countSentences(text) {
  return text
    .split(/(?<=[。！？!?…])/)
    .map((s) => s.trim())
    .filter((s) => cjkCount(s) > 0).length;
}
function stats(arr) {
  if (arr.length === 0) return { n: 0, mean: 0, std: 0, min: 0, max: 0 };
  const n = arr.length;
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const varc = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  // 不用 Math.min(...arr)：超长文（十几万句）展开实参会撑爆调用栈（RangeError）
  let min = arr[0], max = arr[0];
  for (let i = 1; i < n; i++) { const v = arr[i]; if (v < min) min = v; if (v > max) max = v; }
  return { n, mean, std: Math.sqrt(varc), min, max };
}

/**
 * 定位一批片段在原文中的起始下标（片段顺序单调，游标前移，整体 O(n)）。
 * 用途：给「段落/句子」类命中带真实行号 —— 此前用 text.indexOf(片段前缀) 反查，
 * 一旦同样的前缀在更早处出现（AI 稿最常见的重复句），行号就会指到错误的位置。
 */
function locatePieces(text, pieces) {
  const pos = new Array(pieces.length);
  let cursor = 0;
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    const at = text.indexOf(p, cursor);
    const start = at < 0 ? cursor : at;
    pos[i] = start;
    cursor = start + Math.max(1, p.length);
  }
  return pos;
}

/** 引号配对样式（「」/『』/“”/‘’/"同号引对）。两处引号状态机共用一份定义，避免口径漂移。 */
const QUOTE_STYLES = [['「', '」'], ['『', '』'], ['“', '”'], ['‘', '’'], ['"', '"']];

/**
 * 统计引号内部的破折号字符数（用于区分「引号内打断/拖音」与「叙述中的陈述—补充」）。
 * 用状态机按引号样式分别配对，避免「把上一句的右引号和下一句的左引号配成一对」的经典 bug。
 * 换行强制闭合（本场景下引号不跨行）。
 */
function countDashesInQuotes(text) {
  const marked = new Set();
  for (const [open, close] of QUOTE_STYLES) {
    let depth = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '\n') { depth = 0; continue; }
      if (open === close) {
        if (ch === open) { depth = depth ? 0 : 1; continue; }
      } else {
        if (ch === open) { depth++; continue; }
        if (ch === close) { depth = Math.max(0, depth - 1); continue; }
      }
      if (depth > 0 && (ch === '\u2014' || ch === '\u2015' || ch === '\u2500')) marked.add(i);
    }
  }
  return marked.size;
}

/**
 * 把文本切成「引号内」（对话）与「引号外」（叙述）两部分。
 * 顺带记录 narration 每个字符在原文里的下标（narIndex），
 * 这样叙述层命中（二分壳、过度解释、破折号…）也能带真实行号，而不是 line: 0。
 */
function splitDialogue(text) {
  const isQuote = new Uint8Array(text.length);
  for (const [open, close] of QUOTE_STYLES) {
    let depth = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '\n') { depth = 0; continue; }
      if (open === close) {
        if (ch === open) { depth = depth ? 0 : 1; isQuote[i] = 1; continue; }
      } else {
        if (ch === open) { depth++; isQuote[i] = 1; continue; }
        if (ch === close) { isQuote[i] = 1; depth = Math.max(0, depth - 1); continue; }
      }
      if (depth > 0) isQuote[i] = 1;
    }
  }
  const dlgParts = [], narParts = [];
  const narIndex = new Int32Array(text.length);
  let n = 0, runStart = 0, runQuote = text.length ? isQuote[0] : 0;
  // 按「连续同侧」成段切片再 join —— 逐字符 += 拼接在大文件上会造出大量临时串
  for (let i = 1; i <= text.length; i++) {
    const cur = i < text.length ? isQuote[i] : -1;
    if (cur === runQuote) continue;
    if (runQuote) dlgParts.push(text.slice(runStart, i));
    else {
      narParts.push(text.slice(runStart, i));
      for (let j = runStart; j < i; j++) narIndex[n++] = j;
    }
    runStart = i; runQuote = cur;
  }
  return { dialogue: dlgParts.join(''), narration: narParts.join(''), narIndex };
}

/* --------------------------------------------------- 扩展判据（patterns-ext） */

const pct = (n, base) => (base > 0 ? (n / base) * 1000 : 0);

/** 文末窗口：剥空白后取最后 N 个可见字符 */
function tailWindow(text, n = 600) {
  let acc = 0, i = text.length;
  while (i > 0 && acc < n) { i--; if (!/\s/.test(text[i])) acc++; }
  return text.slice(i);
}

function runExtPatterns(text, narration, narIndex, at) {
  const result = [];
  const narChars = nw(narration).length;
  const allChars = nw(text).length;
  const sentencesOf = (s) => s.split(/(?<=[。！？!?…])|\n+/).map((x) => x.trim()).filter((x) => cjkCount(x) > 0);

  for (const p of EXT_PATTERNS) {
    if (opts.ignoreIds.has(p.id)) continue;
    const base = p.scope === 'narration' ? narration : p.scope === 'tail' ? tailWindow(text, p.tailChars || 600) : text;
    const baseChars = p.scope === 'narration' ? narChars : allChars;
    // 命中位置 → 原文行号：叙述串的位置要经 narIndex 映射回原文，尾窗要加窗口起点
    const locOf = p.scope === 'narration'
      ? (i) => at(narIndex[i] || 0)
      : p.scope === 'tail'
        ? (i) => at(text.length - base.length + i)
        : (i) => at(i);
    const hits = [];
    let count = 0;

    if (p.kind === 'quoteSpan') {
      for (const m of base.matchAll(/[「『“‘"][\u3400-\u4DBF\u4E00-\u9FFF]{1,4}[」』”’"][^：，。、；！？\n]?/g)) {
        count++; if (hits.length < 8) hits.push({ text: m[0], line: locOf(m.index) });
      }
    } else if (p.kind === 'stutterRun') {
      const ss = sentencesOf(base);
      let run = 0;
      for (let i = 0; i < ss.length; i++) {
        if (nw(ss[i]).length <= p.maxSentenceChars) {
          run++;
          if (run === p.minRun) { count++; if (hits.length < 8) hits.push({ text: `第 ${i - run + 2}–${i + 1} 句连续 ${run} 个短句` }); }
        } else run = 0;
      }
    } else if (p.kind === 'paraActionList') {
      for (const para of base.split(/\n+/).map((x) => x.trim()).filter(Boolean)) {
        const v = matchAll(para, p.src).length;
        const s = (para.match(/[，,、；;]/g) || []).length;
        if (v >= p.minVerbs && s >= p.minSeparators) { count++; if (hits.length < 8) hits.push({ text: para.slice(0, 56) }); }
      }
    } else if (p.kind === 'buckets') {
      let total = 0; const used = [];
      for (const b of p.buckets) {
        const n = matchAll(base, b.src).length;
        total += n;
        if (n > 0) used.push(`${b.id}×${n}`);
      }
      if (total >= p.minHits && total >= p.coreMinHits && used.length >= p.minBuckets) {
        count = total; hits.push({ text: `${total} 处，跨 ${used.length} 类：${used.join(' / ')}` });
      }
    } else if (p.kind === 'perSentence') {
      for (const s of sentencesOf(base)) {
        const n = matchAll(s, p.src).length;
        if (n >= p.minPerSentence) { count++; if (hits.length < 8) hits.push({ text: s.slice(0, 56) }); }
      }
    } else if (p.kind === 'crossNegation') {
      const ps = base.split(/\n+/).map((x) => x.trim()).filter(Boolean);
      for (let i = 0; i + 2 < ps.length; i++) {
        if (/^不是[^。！？\n]{1,24}[。！？]?$/.test(ps[i])
          && /^(?:也|还)不是[^。！？\n]{1,24}[。！？]?$/.test(ps[i + 1])
          && /^只是[^。！？\n]{1,32}[。！？]?$/.test(ps[i + 2])) {
          count++; if (hits.length < 8) hits.push({ text: `${ps[i]} ／ ${ps[i + 1]} ／ ${ps[i + 2]}`.slice(0, 70) });
        }
      }
    } else if (p.kind === 'noticeFormal') {
      let lines = 0, formal = 0;
      for (const ln of base.split(/\n+/)) {
        if (!/[【\[].*[】\]]/.test(ln)) continue;
        const n = (ln.match(/不得|必须|不可|禁止|严禁|应当|须|需|务必|被视为|同样计入|计入/g) || []).length;
        if (n > 0) { lines++; formal += n; }
      }
      if (lines >= p.minLines && formal >= p.minHits) { count = formal; hits.push({ text: `${lines} 行面板/方括号文本里 ${formal} 个硬规则词` }); }
    } else {
      for (const m of base.matchAll(re(p.src))) {
        if (p.prevExclude && m.index > 0 && p.prevExclude.includes(base[m.index - 1])) continue;
        count++;
        if (hits.length < 8) hits.push({ text: base.slice(Math.max(0, m.index - 10), m.index + m[0].length + 12).replace(/\s+/g, ' '), line: locOf(m.index) });
      }
    }

    if (count < (p.minHits || 1)) continue;
    if (p.perKilo && pct(count, baseChars) < p.perKilo) continue;
    if (!hits.length) continue;

    result.push({
      key: p.id,
      label: p.label,
      tier: p.level,
      level: p.level === 'blocking' ? 'fail' : 'warn',
      hits,
      advice: p.advice,
    });
  }
  return result;
}

/* ------------------------------------------------------------------ 阈值 */

function thresholds() {
  // dir: 'max' 越小越好 | 'min' 越大越好 | 'band' 落在区间内才好（节奏类指标）
  const base = [
    { key: 'simile',   label: '比喻词密度',        unit: '‰',    dir: 'max',  warn: 5,    fail: 8 },
    { key: 'dash',     label: '破折号密度(按字符)',  unit: '‰',    dir: 'max',  warn: 5,    fail: 9 },
    { key: 'dashPerInst', label: '破折号密度(按处)',  unit: '‰',    dir: 'max',  warn: 5,    fail: 8 },
    { key: 'ellipsis', label: '省略号密度',        unit: '‰',    dir: 'max',  warn: 4,    fail: 8 },
    { key: 'avgSent',  label: '平均句长',          unit: '字',   dir: 'band', ok: [22, 38],  warn: [16, 46] },
    { key: 'sentStd',  label: '句长标准差',        unit: '字',   dir: 'min',  warn: 14,   fail: 9 },
    { key: 'shortPct', label: '短句占比(<15字)',   unit: '%',    dir: 'band', ok: [14, 36],  warn: [6, 48] },
    { key: 'longPct',  label: '长句占比(>40字)',   unit: '%',    dir: 'band', ok: [8, 30],   warn: [2, 42] },
    { key: 'paraCv',   label: '段长离散度(σ/μ)',   unit: '',     dir: 'min',  warn: 0.35, fail: 0.25 },
    { key: 'oneSentPct', label: '单句成段占比',    unit: '%',    dir: 'max',  warn: 34,   fail: 46 },
    { key: 'sentPerParaStd', label: '段句数标准差', unit: '',    dir: 'min',  warn: 0.9,  fail: 0.6 },
    // 加法层：治「贫瘠型」AI 味（扁平、无张力、无个性）。
    // 这几条是语言学估计线，未用真人语料校准，定位是「该补加法了」的提示，不是硬红线。
    { key: 'modalPer100',      label: '对话语气词密度',   unit: '/100字', dir: 'min', warn: 2.0, fail: 1.0 },
    { key: 'intentPer100',     label: '叙述意图词密度',   unit: '/100字', dir: 'min', warn: 0.6, fail: 0.3 },
    { key: 'attitudePer100',   label: '叙述者态度词密度', unit: '/100字', dir: 'min', warn: 0.8, fail: 0.4 },
    { key: 'causalPer100Sent', label: '句间因果/转折',    unit: '/100句', dir: 'min', warn: 10,  fail: 5 },
    // v3.21 段落结构层（卡规 R 组）与否定-纠正句式（卡规 S8）。
    // 卡规目标：R1 每 10 段≤1 段判断句收尾 / R2 段首代词 ≤15% / R4 含比喻的段 ≤1/3 / S8「不是」≤8 次每万字。
    { key: 'tailJudgePct',  label: '段尾判断句占比',      unit: '%', dir: 'max', warn: 12, fail: 20 },
    { key: 'headPronPct',   label: '段首代词段占比',      unit: '%', dir: 'max', warn: 18, fail: 26 },
    { key: 'simileParaPct', label: '含比喻的段占比',      unit: '%', dir: 'max', warn: 25, fail: 33 },
    { key: 'bushiPerKilo',  label: '「不是」密度(每万字)', unit: '',  dir: 'max', warn: 10, fail: 16 },
  ];
  const k = opts.profile === 'strict' ? 0 : opts.profile === 'loose' ? 1 : 2;
  if (k === 2) return base;
  const band = (arr, f) => {
    const mid = (arr[0] + arr[1]) / 2;
    const half = ((arr[1] - arr[0]) / 2) * f;
    return [mid - half, mid + half];
  };
  return base.map((t) => {
    if (t.dir === 'band') {
      const f = k === 0 ? 0.8 : 1.3;
      return { ...t, ok: band(t.ok, f), warn: band(t.warn, f) };
    }
    const f = k === 0
      ? (t.dir === 'max' ? [0.85, 0.9] : [1.2, 1.3])
      : (t.dir === 'max' ? [1.4, 1.5] : [0.75, 0.7]);
    return { ...t, warn: t.warn * f[0], fail: t.fail * f[1] };
  });
}

const round = (v, d = 1) => Number(v.toFixed(d));

// 加法层指标键（用于报告分组与改稿建议）
const ADD_KEYS = ['modalPer100', 'intentPer100', 'attitudePer100', 'causalPer100Sent'];

function grade(t, value) {
  if (t.dir === 'band') {
    const [aLo, aHi] = t.ok, [wLo, wHi] = t.warn;
    if (value >= aLo && value <= aHi) return 'ok';
    if (value >= wLo && value <= wHi) return 'warn';
    return 'fail';
  }
  if (t.dir === 'max') return value > t.fail ? 'fail' : value > t.warn ? 'warn' : 'ok';
  return value < t.fail ? 'fail' : value < t.warn ? 'warn' : 'ok';
}

/* ------------------------------------------------------------------ 分析 */

const HEADING_RE = /^#{1,3}\s+\S/;

function analyze(rawText, name) {
  const text = stripHtmlIfNeeded(rawText);
  const at = lineIndex(text);

  const paras = splitParagraphs(text);
  const sents = splitSentences(text);
  // 段落/句子在原文里的起始下标：命中行号直接用它，不再用 indexOf(片段前缀) 反查
  const paraPos = locatePieces(text, paras);
  const sentPos = locatePieces(text, sents);
  const chars = nw(text).length;
  const perThousand = (n) => (chars > 0 ? (n / chars) * 1000 : 0);

  const sentLens = sents.map((s) => nw(s).length);
  const paraLens = paras.map((p) => nw(p).length);
  const sStat = stats(sentLens);
  const pStat = stats(paraLens);
  // 段落节奏：每段含几句。单句成段过多 = 打点式机械节拍（staccato fragmentation）
  const sentPerPara = paras.map((p) => countSentences(p));
  const sppStat = stats(sentPerPara);

  const simileN = matchAll(text, SIMILE_SRC).length;
  const dashN = matchAll(text, DASH_G).length;
  const ellipsisN = matchAll(text, ELLIPSIS_G).length;
  // 省略号「按处」补充口径：……（U+2026 连写）、⋯⋯（U+22EF）、...（ASCII）连写各算 1 处。
  // 旧字段 ellipsis/ellipsisRaw 保持 U+2026 字符计数（历史口径不动），这里只做新增补充，
  // 因为「她看着他……」按字符算 2 个、按处是 1 处，而 ⋯⋯ 与 ... 在旧口径里完全漏掉。
  const ellipsisRuns = matchAll(text, /[⋯…]+|\.{3,}/).length;
  const ellipsisOtherRaw = matchAll(text, /⋯+|\.{3,}/).length;
  const bangN = matchAll(text, BANG_G).length;

  // 破折号功能分析。注意：只用可确定性判定的口径，不做「打断 vs 补充」的模糊自动分类
  //（那需要语义理解，误报率高）。inQuote 只表示「出现在引号内」，不代表用法合法。
  const dashInst = matchAll(text, '——').length;
  const dashPairN = matchAll(text, DASH_PAIR_SRC).length;
  const dashInQuote = countDashesInQuotes(text) / 2;
  const dashOutside = Math.max(0, dashInst - dashInQuote);
  // 破折号段落上限：卡规 S2 = 单段 ≤3 处（DASH_PER_PARA_MAX）。>3 才算违规。
  // 同时记一个「≥2 处」的段数，作为分布参考（不再作为违规判据——每段 1~3 处是允许的）。
  const DASH_PER_PARA_MAX = 3;
  // 一次遍历同时算「超限段」与「≥2 处聚簇段」，并带上段落位置（旧行为是每段扫两遍）
  const paraDashOverList = [];   // {text, pos, n}
  let paraDashCluster = 0;
  for (let i = 0; i < paras.length; i++) {
    const n = matchAll(paras[i], '——').length;
    if (n >= 2) paraDashCluster++;
    if (n > DASH_PER_PARA_MAX) paraDashOverList.push({ text: paras[i], pos: paraPos[i], n });
  }

  // 加法层：对话 vs 叙述分离后各自的「人味」指标
  const { dialogue, narration, narIndex } = splitDialogue(text);
  const dlgChars = nw(dialogue).length;
  const narChars = nw(narration).length;
  const modalN = matchAll(dialogue, MODAL_SRC).length;
  const intentN = matchAll(narration, INTENT_SRC).length;
  const attitudeN = matchAll(narration, ATTITUDE_SRC).length;
  const causalN = matchAll(text, CAUSAL_SRC).length;
  const overExplainN = matchAll(narration, OVEREXPLAIN_SRC).length;
  const sentTotal = sents.length;

  // 纯叙述段口径：对白独段（「…」自成一段）会系统性拉低平均句长、抬高短句占比与单句成段占比。
  // 这里额外给一套**只在「不含引号段落」上统计**的对照口径，避免把对话节奏误判成叙述病灶。
  const pureNarParas = paras.filter((p) => !/[「『“‘"]/.test(p));
  const pureNarSents = pureNarParas.flatMap((p) => splitSentences(p)).map((s) => nw(s).length);
  const pnShort = pureNarSents.length ? round((pureNarSents.filter((v) => v < 15).length / pureNarSents.length) * 100) : 0;
  const pnLong = pureNarSents.length ? round((pureNarSents.filter((v) => v > 40).length / pureNarSents.length) * 100) : 0;

  // ---- v3.21 新增：否定-纠正句式（卡规 S8） ----
  // 卡规：全篇「不是」每万字 ≤8 次；严禁「不是A（，）是B」二分壳。（实测这类稿子 26–34 次/万字）
  const bushiRaw = matchAll(text, '不是').length;
  const bushiPerKilo = chars > 0 ? round((bushiRaw / chars) * 10000, 1) : 0;
  const bushiShellHits = matchAll(narration, BUSHI_SHELL_SRC);

  // ---- v3.21 新增：段落结构层（卡规 R 组）----
  // R1 段尾判断句：段落最后一句是 ≤20 字的定性/结论句（"咸鱼不会动。""不是货，是人。"）
  const tailJudgeList = [];   // {text, pos}
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    const ss = splitSentences(p).map((s) => s.trim()).filter(Boolean);
    if (!ss.length) continue;
    const lastRaw = ss[ss.length - 1];
    if (!/。$/.test(lastRaw)) continue;            // 只收陈述句收尾（问句/叹句不算）
    if (/^[「『“‘"]/.test(lastRaw)) continue;       // 对白收尾不算（那是台词，不是叙述者的总结）
    if (nw(lastRaw).length <= 20 && /(不是|而是|就是|才是|不过是|是)/.test(lastRaw)) {
      tailJudgeList.push({ text: p, pos: paraPos[i] });
    }
  }
  const tailJudgePct = paras.length ? round((tailJudgeList.length / paras.length) * 100, 1) : 0;
  // R2 段首代词：段首为「我/他/她/它」的段占比（卡规 ≤15%）
  const headPronList = [];   // {text, pos}
  for (let i = 0; i < paras.length; i++) {
    if (/^(我|他|她|它)/.test(paras[i])) headPronList.push({ text: paras[i], pos: paraPos[i] });
  }
  const headPronPct = paras.length ? round((headPronList.length / paras.length) * 100, 1) : 0;
  // R4 段段比喻：含真比喻的段占比（卡规 ≤1/3）
  const simileParaList = paras.filter((p) => matchAll(p, SIMILE_SRC).length > 0);
  const simileParaPct = paras.length ? round((simileParaList.length / paras.length) * 100, 1) : 0;

  const metrics = {
    chars,
    sentences: sents.length,
    paragraphs: paras.length,
    narParas: pureNarParas.length,
    narAvgSent: round(stats(pureNarSents).mean),
    narShortPct: pnShort,
    narLongPct: pnLong,
    simile: round(perThousand(simileN)),
    simileRaw: simileN,
    dash: round(perThousand(dashN)),
    dashRaw: dashN,
    ellipsis: round(perThousand(ellipsisN)),
    ellipsisRaw: ellipsisN,
    ellipsisRuns,
    ellipsisOtherRaw,
    bang: round(perThousand(bangN)),
    avgSent: round(sStat.mean),
    sentStd: round(sStat.std),
    sentMin: sStat.min,
    sentMax: sStat.max,
    shortPct: round(sentLens.length ? (sentLens.filter((v) => v < 15).length / sentLens.length) * 100 : 0),
    longPct: round(sentLens.length ? (sentLens.filter((v) => v > 40).length / sentLens.length) * 100 : 0),
    avgPara: round(pStat.mean),
    paraStd: round(pStat.std),
    paraCv: round(pStat.mean > 0 ? pStat.std / pStat.mean : 0, 2),
    oneSentPct: round(sentPerPara.length ? (sentPerPara.filter((v) => v === 1).length / sentPerPara.length) * 100 : 0),
    sentPerParaStd: round(sppStat.std, 2),
    multiSentPct: round(sentPerPara.length ? (sentPerPara.filter((v) => v >= 4).length / sentPerPara.length) * 100 : 0),
    dashInst,
    dashPerInst: round(perThousand(dashInst), 2),
    dashParaMax: DASH_PER_PARA_MAX,
    dashParaOver: paraDashOverList.length,
    dashPairN,
    dashInQuote,
    dashOutside,
    paraDashCluster,
    bushiRaw,
    bushiPerKilo,
    bushiShellN: bushiShellHits.length,
    tailJudgePct,
    headPronPct,
    simileParaPct,
    modalPer100: dlgChars > 0 ? round((modalN / dlgChars) * 100, 2) : 0,
    intentPer100: narChars > 0 ? round((intentN / narChars) * 100, 2) : 0,
    attitudePer100: narChars > 0 ? round((attitudeN / narChars) * 100, 2) : 0,
    causalPer100Sent: sentTotal > 0 ? round((causalN / sentTotal) * 100, 1) : 0,
    dialoguePct: chars > 0 ? round((dlgChars / chars) * 100, 1) : 0,
  };

  const checks = thresholds().map((t) => {
    const c = {
      key: t.key,
      label: t.label,
      unit: t.unit,
      dir: t.dir,
      value: metrics[t.key],
      level: grade(t, metrics[t.key]),
    };
    if (t.dir === 'band') {
      c.ok = t.ok.map((v) => round(v, 2));
      c.warnBand = t.warn.map((v) => round(v, 2));
    } else {
      c.warn = round(t.warn, 2);
      c.fail = round(t.fail, 2);
    }
    return c;
  });

  // 逐条命中（带行号）
  const findings = [];
  const bannedHits = [];
  for (const b of BANNED) {
    for (const m of matchAll(text, b.src)) {
      bannedHits.push({ label: b.label, text: m[0], line: at(m.index) });
    }
  }
  bannedHits.sort((a, b) => a.line - b.line);
  if (bannedHits.length) {
    findings.push({
      key: 'banned',
      label: '禁用句式命中',
      level: bannedHits.length > 4 ? 'fail' : 'warn',
      hits: bannedHits,
    });
  }

  const machineHits = matchAll(text, MACHINE_SRC).map((m) => ({ text: m[0], line: at(m.index) }));
  if (machineHits.length) {
    findings.push({
      key: 'machine',
      label: '机器头外显（模板/世界书标题泄漏进正文）',
      level: 'fail',
      hits: machineHits,
    });
  }

  const contractHits = matchAll(text, CONTRACT_SRC).map((m) => ({ text: m[0], line: at(m.index) }));
  if (contractHits.length) {
    findings.push({
      key: 'contract',
      label: '输出契约标签（你的输出契约本就允许，则属正常）',
      level: 'info',
      hits: contractHits,
    });
  }

  const boldHits = matchAll(text, BOLD_SRC).map((m) => ({ text: m[0], line: at(m.index) }));
  if (boldHits.length) {
    findings.push({
      key: 'bold',
      label: '正文里的 markdown 加粗（小说正文不该有强调标记）',
      level: boldHits.length >= 3 ? 'fail' : 'warn',
      hits: boldHits,
    });
  }

  // 破折号：成对夹注式「——插入语——」
  // ⚠️ 2026-09-15 改判：中文规范里成对夹注确属英文 em dash 习惯的移植，但**承载读者必需信息的
  //    插入语是正当用法**（人名本名、地名别称、身份说明——删掉读者就不认识了）。
  //    因此本条不再作 blocking，只作提示；真正该改的是「纯修辞性补充」——删掉不影响理解的那种。
  if (dashPairN > 0) {
    const hits = matchAll(text, DASH_PAIR_SRC).map((m) => ({
      text: m[0].replace(/\s+/g, ' ').slice(0, 56),
      line: at(m.index),
    }));
    findings.push({
      key: 'dashpair',
      label: '夹注式破折号（成对「——插入语——」）',
      level: dashPairN >= 3 ? 'warn' : 'info',
      hits,
      advice: '逐条判断插入语是不是「读者不读就读不懂」：是（人名本名/地名别称/身份说明）→ 保留，属正当用法；不是（纯修辞性补充、删掉也不影响理解）→ 改逗号或拆句。',
    });
  }

  // 破折号：单段超限（卡规 S2 = 每段 ≤3 处）
  if (paraDashOverList.length > 0) {
    const hits = paraDashOverList.slice(0, 12).map((p) => ({
      text: `${p.n} 处：${p.text.slice(0, 52).replace(/\s+/g, ' ')}`,
      line: at(p.pos),
    }));
    findings.push({
      key: 'dashpara',
      label: `破折号单段超限（一段里 >${DASH_PER_PARA_MAX} 处）`,
      level: paraDashOverList.length >= 3 ? 'fail' : 'warn',
      hits,
      advice: '一段里堆 4 个以上破折号，说明这段在用破折号代替逗号。把其中大部分换成逗号、冒号，或拆成两句。',
    });
  }

  // 破折号：功能单一 —— 叙述里几乎每处都在做同一件事（「陈述——补充说明」）
  // 中文破折号的合法功能有四种：①话被打断 ②拖音 ③突然的语义突转 ④读者不读就读不懂的必要解释。
  // 密度不高也可能是病：AI 文本里破折号常退化成一个固定动作——主句后面挂一段可删的解释。
  // 判据：只看引号外的**单侧**破折号（成对夹注式另由 dashpair 单列）。
  //       右邻**同一行内**紧跟 ≥2 个汉字内容者，视为「补充型」；
  //       若补充型占引号外破折号的 ≥90%、且单侧破折号总数 ≥10，判定功能单一。
  //       破折号后本行无内容（拖音/戛然而止）不计入 —— 注意必须**按行截断**，
  //       否则会滑到下一行，把「一句话——\n下一段」这种合法收尾误判成补充说明。
  // ⚠️ 本判据无法区分「必需的④」与「纯修辞的补充」——那需要语义理解。所以它是弱提示：
  //    命中后必须人工逐条看，④ 类（人名本名/地名别称/身份说明）应当保留。
  const narDashIdx = [...narration.matchAll(/——/g)].map((m) => m.index);
  const pairRanges = [...narration.matchAll(DASH_PAIR_SRC)].map((m) => [m.index, m.index + m[0].length]);
  const inPair = (i) => pairRanges.some(([a, b]) => i >= a && i < b);
  let dashSingle = 0, dashSupplement = 0;
  for (const i of narDashIdx) {
    if (inPair(i)) continue;
    dashSingle++;
    const restLine = nw(narration.slice(i + 2).split('\n')[0]);
    if (restLine.length >= 2 && /[\u3400-\u4DBF\u4E00-\u9FFF]/.test(restLine)) dashSupplement++;
  }
  if (dashSingle >= 10 && dashSupplement / dashSingle >= 0.9) {
    findings.push({
      key: 'dashsingle',
      label: '破折号功能单一（叙述里几乎每处都在做「陈述——补充说明」）',
      level: 'warn',
      hits: [{
        text: `引号外 ${dashSingle} 处破折号，其中 ${dashSupplement} 处是「陈述——补充说明」（${Math.round((dashSupplement / dashSingle) * 100)}%）`,
        line: 0,
      }],
      advice: '逐条过一遍：承载「读者必需信息」的解释保留（属正当用法）；删掉不影响理解的纯修辞补充，换逗号/冒号或拆句。目标不是把破折号删光，而是让合法用途（打断/拖音/突转）的占比升上去。',
    });
  }

  // ---- v3.21 · S8 否定-纠正句式「不是A，是B」----
  if (bushiShellHits.length > 0) {
    findings.push({
      key: 'bushishell',
      label: '否定-纠正句式（「不是A，是B」先否定再纠正）',
      level: bushiShellHits.length >= 3 ? 'fail' : 'warn',
      hits: bushiShellHits.slice(0, 12).map((m) => ({
        text: narration.slice(Math.max(0, m.index - 6), m.index + m[0].length + 6).replace(/\s+/g, ' ').slice(0, 70),
        line: at(narIndex[m.index] || 0),
      })),
      advice: '删掉否定、直接说正面，或改用关联词带出落差（于是/却/偏偏/到头来）。「不是拒绝，是绕」→「她绕开了，因为不想答」。引用、对白里的正常澄清可以留。',
    });
  }

  // ---- v3.21 · R1 段尾判断句收口 ----
  if (tailJudgeList.length >= 3) {
    findings.push({
      key: 'tailjudge',
      label: '段尾判断句收口（段末总是一句定性/顿悟短句）',
      level: tailJudgePct >= 20 ? 'fail' : 'warn',
      hits: tailJudgeList.slice(0, 10).map((p) => {
        const ss = splitSentences(p.text).map((s) => s.trim()).filter(Boolean);
        const last = ss[ss.length - 1];
        return { text: last.slice(0, 60), line: at(p.pos + Math.max(0, p.text.lastIndexOf(last))) };
      }),
      advice: '段尾改为：一个动作、一句对白、一个感官细节、或一个还没解答的疑问。想要评判（A2）就放段中，别放段尾收口——留白被收干，读者就没有余地。',
    });
  }

  // ---- v3.21 · R2 段首代词化 ----
  if (headPronList.length >= 5) {
    findings.push({
      key: 'headpron',
      label: '段首代词化（段落一律从「我/他/她」开头）',
      level: headPronPct >= 26 ? 'fail' : 'warn',
      hits: headPronList.slice(0, 10).map((p) => ({ text: p.text.slice(0, 60).replace(/\s+/g, ' '), line: at(p.pos) })),
      advice: '从环境、物件、对白或一个具体动作切入，把主语往后挪一句：「雾里有钟声在敲，两下。」胜过「我听见钟声在敲两下。」',
    });
  }

  // ---- v3.21 · R4 段段有比喻 ----
  if (simileParaPct > 20) {
    findings.push({
      key: 'similepara',
      label: '比喻均匀铺开（含比喻的段占比过高）',
      level: simileParaPct >= 33 ? 'fail' : 'warn',
      hits: [{ text: `${simileParaList.length}/${paras.length} 段含真比喻（${simileParaPct}%）`, line: 0 }],
      advice: '比喻铺得越均匀越像机器撒的。相邻两段不要都有比喻；含真比喻的段压到 1/3 以内，配额留给关键转折与危险瞬间。',
    });
  }

  // 过度解释：叙述者替读者推断动机/含义 —— 反「留白」
  if (overExplainN > 0) {
    const hits = matchAll(narration, OVEREXPLAIN_SRC).map((m) => ({
      text: narration.slice(Math.max(0, m.index - 8), m.index + m[0].length + 14).replace(/\s+/g, ' '),
      line: at(narIndex[m.index] || 0),
    }));
    findings.push({
      key: 'overexplain',
      label: '叙述者替读者解释（推断式插入，抢走了留白）',
      level: overExplainN >= 4 ? 'warn' : 'info',
      hits,
    });
  }

  const metaHits = matchAll(text, META_SRC).map((m) => ({ text: m[0], line: at(m.index) }));
  if (metaHits.length) {
    findings.push({
      key: 'meta',
      label: '疑似元信息穿透（第X章/读者/伏笔）',
      level: metaHits.length >= 3 ? 'fail' : 'warn',
      hits: metaHits,
    });
  }

  // 连续三句同长（极差 ≤ 3 字）
  const flatRuns = [];
  for (let i = 0; i + 2 < sentLens.length; i++) {
    const w = sentLens.slice(i, i + 3);
    if (Math.max(...w) - Math.min(...w) <= 3 && Math.min(...w) >= 12) {
      const dup = flatRuns.some((r) => i <= r.end);
      if (!dup) flatRuns.push({ start: i, end: i + 2, line: at(sentPos[i]) });
      else flatRuns[flatRuns.length - 1].end = i + 2;
    }
  }
  if (flatRuns.length) {
    findings.push({
      key: 'flat',
      label: '连续三句同长（句式同构）',
      level: flatRuns.length >= 6 ? 'fail' : flatRuns.length >= 3 ? 'warn' : null,
      hits: flatRuns.map((r) => ({ text: `第 ${r.start + 1}–${r.end + 1} 句等长`, line: r.line })),
    });
  }

  // 三连比喻
  const simSentenceFlags = sents.map((s) => matchAll(s, SIMILE_SRC).length > 0);
  const tripleSim = [];
  for (let i = 0; i + 2 < simSentenceFlags.length; i++) {
    if (simSentenceFlags[i] && simSentenceFlags[i + 1] && simSentenceFlags[i + 2]) {
      if (!tripleSim.some((t) => i <= t.end)) tripleSim.push({ start: i, end: i + 2 });
      else tripleSim[tripleSim.length - 1].end = i + 2;
    }
  }
  if (tripleSim.length) {
    findings.push({
      key: 'triplesim',
      label: '连续三句都带比喻',
      level: tripleSim.length >= 4 ? 'fail' : 'warn',
      hits: tripleSim.map((t) => ({ text: `第 ${t.start + 1}–${t.end + 1} 句`, line: at(sentPos[t.start] ?? 0) })),
    });
  }

  // ---- 三段式堆砌（硬禁令第 4 条）----
  // 连续 ≥3 段「同构」：句数相同、对应分句字数（去空白）两两相差 ≤2 —— 模板化排比的确定性指纹。
  // 单句段也参与（「他走了。她哭了。灯灭了。」式三连段），因此常与「连续三句同长」重叠：
  // 那是句级、这是段级，两处都报是有意的。
  const paraSentLens = paras.map((p) => splitSentences(p).map((s) => nw(s).length));
  const tripleParas = [];
  for (let i = 0; i + 2 < paraSentLens.length; i++) {
    const a = paraSentLens[i], b = paraSentLens[i + 1], c = paraSentLens[i + 2];
    if (!a.length || a.length !== b.length || a.length !== c.length) continue;
    if (a.some((v, k) => Math.max(v, b[k], c[k]) - Math.min(v, b[k], c[k]) > 2)) continue;
    const prev = tripleParas[tripleParas.length - 1];
    if (prev && i <= prev.end) prev.end = i + 2;   // 重叠窗口并成一整段运行（40 段同构报 1 处）
    else tripleParas.push({ start: i, end: i + 2, pos: paraPos[i] });
  }
  if (tripleParas.length) {
    findings.push({
      key: 'triplepara',
      label: '三段式堆砌（连续多段同构排比）',
      level: tripleParas.length >= 3 ? 'fail' : 'warn',
      hits: tripleParas.slice(0, 10).map((t) => ({
        text: `第 ${t.start + 1}–${t.end + 1} 段同构（${t.end - t.start + 1} 段，句数与分句字数一一对应）`,
        line: at(t.pos),
      })),
      advice: '三段同构（同样的句数、同样的分句长度）是模板化排比的确定性指纹。留信息量最大的一段，其余改写成不同长度、不同节奏的散句，或直接删掉。',
    });
  }

  // 首句景物起笔：文首 + 每个标题后的首句
  const openChecks = [];
  const firstSent = (idx) => {
    const tail = text.slice(idx);
    const m = tail.match(/[^\n]{0,400}?[。！？!?…]/);
    return m ? { s: m[0].trim(), at: idx } : null;
  };
  const origin = firstSent(0);
  if (origin) openChecks.push(origin);
  const lines = text.split('\n');
  let cursor = 0;
  for (const ln of lines) {
    if (HEADING_RE.test(ln)) {
      const after = cursor + ln.length + 1;
      const s = firstSent(after);
      if (s) openChecks.push(s);
    }
    cursor += ln.length + 1;
  }
  const sceneryHits = [];
  for (const o of openChecks) {
    const hasScene = hasMatch(o.s, SCENERY_SRC);
    const hasAgent = hasMatch(o.s, AGENT_SRC);
    const len = nw(o.s).length;
    if (hasScene && !hasAgent && len <= 60) {
      sceneryHits.push({ text: o.s.slice(0, 42), line: at(o.at) });
    }
  }
  if (sceneryHits.length) {
    findings.push({
      key: 'scenery',
      label: '疑似景物起笔（无人物或动作）',
      level: sceneryHits.length >= 3 ? 'fail' : 'warn',
      hits: sceneryHits,
    });
  }

  // 章末金句：末句为抽象短句
  const lastSent = sents[sents.length - 1] || '';
  if (nw(lastSent).length > 0 && nw(lastSent).length <= 30 && hasMatch(lastSent, ABSTRACT_SRC)) {
    findings.push({
      key: 'closing',
      label: '疑似章末金句（抽象短句收尾）',
      level: 'warn',
      hits: [{ text: lastSent.slice(0, 42), line: at(sentPos[sents.length - 1] ?? 0) }],
    });
  }

  // 扩展判据（patterns-ext）：blocking / advisory 分级
  findings.push(...runExtPatterns(text, narration, narIndex, at));

  // 白名单：按 id 豁免（.deslop-ignore）。作者有意选择的写法不该被机械改写。
  const allFindings = findings.filter((f) => !opts.ignoreIds.has(f.key));
  const allChecks = checks.filter((c) => !opts.ignoreIds.has(c.key));

  // tier 默认 advisory —— 只有高精度、真人语料近零误报的才标 blocking
  // ⚠️ 2026-09-15：dashpair 从 blocking 移出 —— 承载必需信息的夹注式插入语是正当用法，
  //    不再让「成对破折号」本身影响退出码（改为由 dashpara 判「一段 >3 处」）。
  const TIER_BLOCKING = new Set(['bold', 'machine']);
  for (const f of allFindings) {
    if (!f.tier) f.tier = f.level === 'info' ? 'info' : TIER_BLOCKING.has(f.key) ? 'blocking' : 'advisory';
  }

  const real = allFindings.filter((f) => f.level);
  // 硬指标里，加法层四项是语言学估计、未经语料校准 → 降为 advisory
  const hardFails = allChecks.filter((c) => c.level === 'fail' && !ADD_KEYS.includes(c.key)).length;
  const addFails = allChecks.filter((c) => c.level === 'fail' && ADD_KEYS.includes(c.key)).length;
  const blockingFindFails = real.filter((f) => f.level === 'fail' && f.tier === 'blocking').length;
  const advisoryFindFails = real.filter((f) => f.level === 'warn').length + addFails;

  const failCount = hardFails + blockingFindFails;          // 影响退出码（--fail-on=blocking）
  const advisoryCount = advisoryFindFails;
  const warnCount = allChecks.filter((c) => c.level === 'warn').length + real.filter((f) => f.level === 'warn').length;

  return { name, metrics, checks: allChecks, findings: real, failCount, advisoryCount, warnCount };
}

/* ------------------------------------------------------------------ 输出 */

const C = opts.color
  ? { r: '\x1b[31m', y: '\x1b[33m', g: '\x1b[32m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' }
  : { r: '', y: '', g: '', d: '', b: '', x: '' };

const WIDE = /[\u1100-\u115F\u2E80-\uA4CF\uA960-\uA97F\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/;
function dw(s) { let w = 0; for (const ch of String(s)) w += WIDE.test(ch) ? 2 : 1; return w; }
function pad(s, n) { s = String(s); return s + ' '.repeat(Math.max(0, n - dw(s))); }
function padL(s, n) { s = String(s); return ' '.repeat(Math.max(0, n - dw(s))) + s; }
const lvlTag = (l) => (l === 'fail' ? `${C.r}超出${C.x}` : l === 'warn' ? `${C.y}警示${C.x}` : `${C.g}正常${C.x}`);

function renderReport(r) {
  const out = [];
  const hr = '─'.repeat(66);
  out.push('');
  out.push(`${C.b}deslop-lint${C.x}  ${C.d}中文小说 AI 味量化检测 · 档位 ${opts.profile}${C.x}`);
  out.push(`${C.d}文件: ${r.name}${C.x}`);
  out.push(hr);

  const m = r.metrics;
  out.push(`规模    正文 ${m.chars.toLocaleString()} 字 · ${m.sentences} 句 · ${m.paragraphs} 段`);
  out.push(`句长    平均 ${m.avgSent} 字 · 标准差 ${m.sentStd} · 最短 ${m.sentMin} · 最长 ${m.sentMax}`);
  out.push(`节拍    短句(<15字) ${m.shortPct}% · 长句(>40字) ${m.longPct}%`);
  if (m.narParas > 0) {
    out.push(`叙述口径 纯叙述段 ${m.narParas} 个 · 平均 ${m.narAvgSent} 字 · 短句 ${m.narShortPct}% · 长句 ${m.narLongPct}%   ${C.d}（对白独段已剔除：对话本就短，混算会把对话节奏当成叙述病灶）${C.x}`);
  }
  out.push(`段落    平均 ${m.avgPara} 字 · 标准差 ${m.paraStd} · 离散度 σ/μ ${m.paraCv}`);
  out.push(`节奏    单句成段 ${m.oneSentPct}% · 段句数 σ ${m.sentPerParaStd} · 4句以上段 ${m.multiSentPct}%`);
  // 破折号密度有两种口径：一个中文破折号写作「——」= 2 个 U+2014 字符。
  // 阈值表按**字符**计（历史口径），但很多写作规范按**处**计，两者相差一倍。
  // 这里两个都给出，避免拿 5‰ 配额自查时算错单位。
  const dashPerInst = m.dashPerInst;   // 与 metrics.dashPerInst 同一口径（每千字按处计）
  const ellipsisExtra = m.ellipsisOtherRaw > 0 ? `，另有 ⋯/... 变体 ${m.ellipsisOtherRaw} 处（旧口径漏计）` : '';
  out.push(`标记    比喻 ${m.simileRaw} 次 (${m.simile}‰) · 破折号 ${m.dashInst} 处/${m.dashRaw} 字符 (按字符 ${m.dash}‰ · 按处 ${dashPerInst}‰) · 省略号 ${m.ellipsisRaw} 个 (${m.ellipsis}‰ · 按处 ${m.ellipsisRuns} 处${ellipsisExtra})`);
  if (m.dashInst > 0) {
    out.push(`破折号  ${m.dashInst} 处 · 引号内 ${m.dashInQuote} 处 · 叙述中 ${m.dashOutside} 处 · 夹注式 ${m.dashPairN} 处 · 单段 >${m.dashParaMax} 处的段 ${m.dashParaOver} 个 ${C.d}（卡规 S2：每段 ≤${m.dashParaMax} 处）${C.x}`);
  }
  // v3.21 段落结构层（R 组）+ 否定-纠正句式（S8）
  out.push(`段落结构  段尾判断句 ${m.tailJudgePct}% ${C.d}（R1 ≤10%）${C.x} · 段首代词段 ${m.headPronPct}% ${C.d}（R2 ≤15%）${C.x} · 含比喻的段 ${m.simileParaPct}% ${C.d}（R4 ≤33%）${C.x}`);
  out.push(`否定句式  「不是」${m.bushiRaw} 次 = ${m.bushiPerKilo}/万字 ${C.d}（S8 ≤8）${C.x} · 「不是A，是B」二分壳 ${m.bushiShellN} 处`);
  out.push(hr);

  out.push(`${C.b}硬指标${C.x}`);
  out.push(`  ${pad('指标', 24)}${padL('实测', 10)}${padL('合理', 12)}${padL('警戒带', 14)}  判定`);
  const addKeys = ADD_KEYS;
  let printedHeader2 = false;
  for (const c of r.checks) {
    if (addKeys.includes(c.key) && !printedHeader2) {
      printedHeader2 = true;
      out.push(`  ${C.d}— 加法层（扁平的AI味：读起来干、没张力、没个性）${C.x}`);
    }
    let a, b;
    if (c.dir === 'band') {
      a = `${c.ok[0]}–${c.ok[1]}${c.unit}`;
      b = `${c.warnBand[0]}–${c.warnBand[1]}${c.unit}`;
    } else {
      const arrow = c.dir === 'min' ? '≥' : '≤';
      a = `${arrow}${c.warn}${c.unit}`;
      b = `${arrow}${c.fail}${c.unit}`;
    }
    out.push(`  ${pad(c.label, 24)}${padL(c.value + c.unit, 10)}${padL(a, 12)}${padL(b, 14)}  ${lvlTag(c.level)}`);
  }

  if (r.findings.length) {
    out.push(hr);
    out.push(`${C.b}模式命中${C.x}  ${C.d}（硬=高精度判据，影响退出码；议=启发式，只提示）${C.x}`);
    for (const f of r.findings) {
      const tier = f.tier === 'blocking' ? `${C.d}硬${C.x}` : f.tier === 'info' ? `${C.d}息${C.x}` : `${C.d}议${C.x}`;
      const tag = f.level === 'fail' ? `${C.r}[超限]${C.x}`
        : f.level === 'warn' ? `${C.y}[警示]${C.x}`
          : `${C.d}[提示]${C.x}`;
      out.push(`  ${tag}${tier} ${f.label} — ${f.hits.length} 处`);
      if (!opts.quiet) {
        for (const h of f.hits.slice(0, 12)) {
          const loc = h.line ? `L${String(h.line).padStart(4)}  ` : '        ';
          out.push(`         ${C.d}${loc}${String(h.text).replace(/\s+/g, ' ')}${C.x}`);
        }
        if (f.hits.length > 12) out.push(`         ${C.d}…另有 ${f.hits.length - 12} 处${C.x}`);
        if (f.advice) out.push(`         ${C.d}→ ${f.advice}${C.x}`);
      }
    }
  }

  out.push(hr);
  const advisoryTail = r.advisoryCount > 0 ? `、${r.advisoryCount} 项待议` : '';
  const verdict = r.failCount > 0
    ? `${C.r}${C.b}需改稿${C.x} — ${r.failCount} 项硬性超限${advisoryTail}`
    : (r.warnCount > 0 || r.advisoryCount > 0)
      ? `${C.y}${C.b}基本可用${C.x} — 0 项硬性超限、${r.warnCount} 项警示${advisoryTail}`
      : `${C.g}${C.b}通过${C.x} — 无超限项`;
  out.push(verdict);

  if (r.failCount > 0) {
    out.push('');
    out.push(`${C.d}建议改稿顺序（上层不改，下层白改）:${C.x}`);
    out.push(`${C.d}  1. 正文加粗 / 机器头外显 → 2. 节奏带（句长区间、长句配额、厚段落）${C.x}`);
    out.push(`${C.d}  3. 结构层（二分壳、三段式、同长句、章末金句） → 4. 密度层（比喻/破折号） → 5. 词汇层${C.x}`);
  }
  const addBad = r.checks.filter((c) => ADD_KEYS.includes(c.key) && c.level !== 'ok');
  if (addBad.length) {
    out.push('');
    out.push(`${C.y}加法层有 ${addBad.length} 项偏低 —— 这不是「没删干净」，是「没加东西」。${C.x}`);
    out.push(`${C.d}  减法只治冗余型 AI 味。全做减法会让文字变薄，落进贫瘠型 AI 味：读起来干、没张力、没个性。${C.x}`);
    out.push(`${C.d}  补法见 references/positive-craft.md —— 对话加语气词、叙述加意图与态度、把并列句改成挤压句。${C.x}`);
  }
  out.push('');
  return out.join('\n');
}

/* -------------------------------------------------------------------- 主流程 */

/**
 * 跨文件复读检测（连载/多轮专用）
 *
 * 为什么单独做：单文件 lint 看不见「第 3 轮和第 4 轮的收尾用了同一个动作链」这类问题
 * —— 每一轮单独看都干净，连起来读才露馅。这里用 n 字 shingle 求交集，
 * 只报告**出现在 ≥2 个文件里**的片段，并把相邻 shingle 合并成完整短语。
 */
function crossRepetition(entries, n) {
  const cleanOf = new Map();
  const gramFiles = new Map();
  const gramCount = new Map();
  const order = [];
  for (const [file, text] of entries) {
    const clean = text.replace(/\s+/g, '');
    cleanOf.set(file, clean);
    order.push(file);
  }

  // 聚合文件剔除：某文件的文本**完整包含**另一个文件，
  // 说明它是「合并稿」（如 全部合并.txt）。留着它，跨文件检测会把
  // 每一段都报成「复读」—— 那不是作者复读，是文件结构复读。
  const skipped = [];
  const keep = [];
  for (const f of order) {
    const a = cleanOf.get(f);
    if (a.length < n) continue;
    let aggregate = false;
    for (const g of order) {
      if (g === f) continue;
      const b = cleanOf.get(g);
      if (b.length >= 200 && a.includes(b)) { aggregate = true; break; }
    }
    if (aggregate) skipped.push(f); else keep.push(f);
  }
  if (keep.length < 2) return { merged: [], skipped };
  for (const f of skipped) cleanOf.delete(f);

  for (const file of keep) {
    const clean = cleanOf.get(file);
    const seen = new Set();
    for (let i = 0; i + n <= clean.length; i++) {
      const g = clean.slice(i, i + n);
      gramCount.set(g, (gramCount.get(g) || 0) + 1);
      if (!seen.has(g)) {
        seen.add(g);
        if (!gramFiles.has(g)) gramFiles.set(g, new Set());
        gramFiles.get(g).add(file);
      }
    }
  }

  const cjk = (s) => (s.match(/[\u3400-\u4dbf\u4e00-\u9fff]/g) || []).length;
  const hits = [];
  for (const [g, files] of gramFiles) {
    if (files.size < 2) continue;
    if (cjk(g) < n * 0.6) continue;           // 标点碎片不算
    if (/(.{3,})\1/.test(g)) continue;        // 自身含重复片段
    if (/^(?:的|了|是|在|我|他|她|你|不|和|就|都|也|这|那|有|一){2,}$/.test(g)) continue;
    hits.push({ gram: g, files: [...files].sort(), count: gramCount.get(g) || 0 });
  }
  hits.sort((a, b) => b.files.length - a.files.length || b.count - a.count);

  const extend = (gram, files) => {
    let g = gram;
    for (let guard = 0; guard < 200; guard++) {
      let next = null;
      for (const f of files) {
        const clean = cleanOf.get(f);
        const idx = clean.indexOf(g);
        if (idx < 0) return g;
        const cand = clean.slice(idx, idx + g.length + 1);
        if (cand.length !== g.length + 1) return g;
        const tail = cand.slice(1);
        const fs = gramFiles.get(tail);
        if (!fs || !files.every((x) => fs.has(x))) return g;
        if (next === null) next = tail;
        else if (next !== tail) return g;
      }
      if (!next) return g;
      g = next;
    }
    return g;
  };

  const used = new Set();
  const merged = [];
  const seenPhrase = new Set();
  for (const h of hits) {
    if (used.has(h.gram)) continue;
    const phrase = extend(h.gram, h.files);
    for (let i = 0; i + n <= phrase.length; i++) used.add(phrase.slice(i, i + n));
    // 两个不同的起点可能 extend 出同一个短语；子串层面的重复只报最长的那个。
    if (seenPhrase.has(phrase)) continue;
    if (merged.some((m) => m.phrase.includes(phrase))) continue;
    seenPhrase.add(phrase);
    merged.push({ phrase, files: h.files, count: h.count });
    if (merged.length >= 25) break;
  }
  return { merged, skipped };
}

function renderCross({ merged, skipped = [] }) {
  const out = [];
  out.push('');
  out.push(`${C.b}跨文件复读${C.x}  ${C.d}（同一片段出现在 ≥2 个文件里 —— 连载最容易被读者记住的破绽）${C.x}`);
  if (skipped.length) {
    const names = skipped.map((f) => f.split(/[\\/]/).pop()).join('、');
    out.push(`  ${C.d}已跳过聚合文件（文本是别的文件的子集，留着会全篇假阳性）: ${names}${C.x}`);
  }
  if (!merged.length) { out.push(`  ${C.g}无${C.x}`); return out.join('\n'); }
  for (const m of merged) {
    const names = m.files.map((f) => f.split(/[\\/]/).pop().replace(/\.[^.]+$/, '')).join(' / ');
    out.push(`  ${C.y}${m.files.length} 个文件${C.x}  ${m.phrase}`);
    out.push(`         ${C.d}${names}${C.x}`);
  }
  return out.join('\n');
}

function excluded(name) {
  return DEFAULT_EXCLUDE.some((re) => re.test(name)) || opts.exclude.some((re) => re.test(name));
}

function collect(path) {
  const st = statSync(path);
  if (st.isDirectory()) {
    const out = [];
    for (const e of readdirSync(path, { withFileTypes: true })) {
      const p = join(path, e.name);
      if (e.isDirectory()) { if (!e.name.startsWith('.')) out.push(...collect(p)); }
      else if (/\.(md|markdown|txt)$/i.test(e.name) && !excluded(e.name)) out.push(p);
    }
    return out;
  }
  // 显式点名的单个文件：只挡旁挂边车，不挡用户明确要扫的文件名
  if (DEFAULT_EXCLUDE.some((re) => re.test(path))) return [];
  return /\.(md|markdown|txt|html?)$/i.test(path) ? [path] : [];
}

/**
 * 读文本文件：按 BOM 识别 UTF-16 LE/BE（Windows 记事本/PowerShell 另存常见），
 * 其余按 UTF-8。UTF-8 解码出大量 U+FFFD 说明文件很可能根本不是 UTF-8，
 * 标记为 utf8-suspect 并提醒 —— 静默按乱码统计出来的指标全是假的。
 */
function readText(path) {
  const buf = readFileSync(path);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return { text: buf.toString('utf16le', 2).replace(/^\uFEFF/, ''), encoding: 'utf16le' };
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    let body = Buffer.from(buf.subarray(2));
    if (body.length % 2 === 1) body = body.subarray(0, body.length - 1);
    body.swap16();
    return { text: body.toString('utf16le').replace(/^\uFEFF/, ''), encoding: 'utf16be' };
  }
  const text = buf.toString('utf8').replace(/^\uFEFF/, '');
  const fffd = (text.match(/\uFFFD/g) || []).length;
  return { text, encoding: fffd >= 5 ? 'utf8-suspect' : 'utf8' };
}

let files = [];
for (const raw of inputs) {
  const p = resolve(raw);
  try { files.push(...collect(p)); } catch (err) { console.error(`读取失败: ${raw} — ${err.message}`); process.exit(2); }
}
files = [...new Set(files)];
if (files.length === 0) { console.error('没有找到可分析的 .md / .txt / .html 文件'); process.exit(2); }

const results = [];
const proseTexts = [];
let ignoreLoaded = null;
for (const f of files) {
  let text, encoding;
  try { ({ text, encoding } = readText(f)); }
  catch (err) { console.error(`读取失败: ${f} — ${err.message}`); process.exit(2); }
  if (encoding === 'utf8-suspect') {
    console.error(`注意: ${f} 解码后含大量替换字符（U+FFFD），很可能不是 UTF-8 文本，统计结果不可信 —— 请另存为 UTF-8 后重跑。`);
  }
  // 先做廉价的字数闸门再进 analyze（以前是全量分析完才按 minChars 丢弃）
  const quickChars = nw(text).length;
  if (quickChars === 0) { console.error(`跳过空正文: ${f}`); continue; }
  if (quickChars < opts.minChars) continue;
  const ig = loadIgnore(f);
  if (ig.path && ig.path !== ignoreLoaded) {
    ignoreLoaded = ig.path;
    if (!opts.json) console.error(`白名单: ${ig.path}（豁免 ${ig.ids.size} 项）`);
  }
  opts.ignoreIds = ig.ids;
  const a = analyze(text, f);
  a.encoding = encoding;
  results.push(a);
  proseTexts.push([f, text]);
}

if (results.length === 0) { console.error(`没有可分析的正文（文件为空，或正文均小于 --min-chars=${opts.minChars}），跳过`); process.exit(0); }

// 跨文件复读只算一次，人读与 --json 两种输出共用同一份结果（此前 --json 模式下完全不算）
const crossResult = (opts.cross && proseTexts.length > 1) ? crossRepetition(proseTexts, opts.cross) : null;

if (opts.json) {
  console.log(JSON.stringify({
    schemaVersion: 2,
    profile: opts.profile,
    generatedAt: new Date().toISOString(),
    files: results.map((r) => ({
      file: r.name,
      encoding: r.encoding,
      metrics: r.metrics,
      checks: r.checks,
      findings: r.findings,
      failCount: r.failCount,
      advisoryCount: r.advisoryCount,
      warnCount: r.warnCount,
    })),
    summary: {
      files: results.length,
      failCount: results.reduce((a, r) => a + r.failCount, 0),
      advisoryCount: results.reduce((a, r) => a + r.advisoryCount, 0),
      warnCount: results.reduce((a, r) => a + r.warnCount, 0),
      failOn: opts.failOn,
    },
    cross: crossResult ? { shingle: opts.cross, skipped: crossResult.skipped, phrases: crossResult.merged } : null,
  }, null, 2));
} else {
  for (const r of results) console.log(renderReport(r));
  if (results.length > 1) {
    const tf = results.reduce((a, r) => a + r.failCount, 0);
    const tw = results.reduce((a, r) => a + r.warnCount, 0);
    console.log(`${C.b}合计${C.x}  ${results.length} 个文件 · ${tf} 项超限 · ${tw} 项警示`);
    console.log('');
    const worst = [...results].sort((a, b) => b.failCount - a.failCount).slice(0, 5);
    if (tf > 0) {
      console.log(`${C.d}超限最多的文件:${C.x}`);
      for (const r of worst) if (r.failCount > 0) console.log(`${C.d}  ${r.failCount} 项  ${r.name}${C.x}`);
      console.log('');
    }
  }
  if (crossResult) {
    console.log(renderCross(crossResult));
  }
}

process.exit((() => {
  const failed = results.some((r) => (opts.failOn === 'all' ? (r.failCount > 0 || r.advisoryCount > 0) : r.failCount > 0));
  return failed ? 1 : 0;
})());
