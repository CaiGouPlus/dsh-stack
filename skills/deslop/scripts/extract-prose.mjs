#!/usr/bin/env node
/**
 * extract-prose — 从对话归档 / 游玩记录 / dsh 会话原始输出中抽出纯叙事正文（零依赖）
 *
 * 为什么需要：deslop-lint 需要干净的散文。记录里混着
 * <status> / <状况> / [[状态更新]] / 【判定：…】 / 装备卡 / 战斗网格 / 结算行，
 * 直接喂给 lint 会把机器行当正文，指标全错。
 *
 * 用法:
 *   node extract-prose.mjs <文件> [--out 输出.txt] [--rounds] [--stats] [--json] [--lenient]
 *
 * 选项:
 *   --out <file>   写入文件（默认打印到 stdout）
 *   --rounds       每轮之间插入 @@ROUND n@@ 标记
 *   --stats        打印每轮规模与被剔除的各类机器行统计
 *   --json         统计报告以 JSON 输出到 stderr（stdout 仍是正文）；给了 --out 时另写 <输出>.stats.json
 *   --lenient      正文占比过低时不报错（默认占比 <15% 会警告并以退出码 3 结束）
 *   -h, --help     帮助
 *
 * 退出码: 0 = 正常 / 2 = 用法或读取/写入错误 / 3 = 抽出正文占比 <15%（疑似解析失败）
 *
 * 支持的记录格式（自动识别，可混用）:
 *   A. 对话归档:   "## 第 N 轮" + "### 玩家" / "### 世界引擎 / AI"
 *   B. 原始对话:   "## 第 N 轮 · 玩家" / "## 第 N 轮 · 世界引擎/AI"
 *   C. 会话原始输出: 单条 assistant 输出，无轮次标题，正文 + 机器块混排
 *   都识别不到时，整篇按正文处理。
 */

import { readFileSync, writeFileSync } from 'node:fs';

const USAGE = '用法: node extract-prose.mjs <文件> [--out 输出.txt] [--rounds] [--stats] [--json] [--lenient]';
const argv = process.argv.slice(2);
let input = null, outFile = null, rounds = false, stats = false, lenient = false, jsonReport = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--out') {
    outFile = argv[++i];
    // 以前 --out 后面漏写路径会被静默忽略（正文直接打到 stdout），想要的输出文件根本没生成
    if (!outFile || outFile.startsWith('-')) { console.error('--out 需要一个输出文件路径，例如 --out 正文.txt'); process.exit(2); }
  }
  else if (a === '--rounds') rounds = true;
  else if (a === '--stats') stats = true;
  else if (a === '--json') jsonReport = true;
  else if (a === '--lenient') lenient = true;
  else if (a === '-h' || a === '--help') {
    console.log(USAGE);
    console.log('  --json    统计报告以 JSON 输出到 stderr（stdout 仍是正文）；给了 --out 时另写 <输出>.stats.json');
    process.exit(0);
  } else if (a.startsWith('-')) { console.error('未知选项: ' + a); console.error(USAGE); process.exit(2); }
  else if (input) { console.error(`注意: 只处理一个输入文件，忽略多余的参数 "${a}"（使用 ${input}）`); }
  else input = a;
}
if (!input) {
  console.error(USAGE);
  process.exit(2);
}

/**
 * 读文本：按 BOM 识别 UTF-16 LE/BE（PowerShell Out-File -Encoding unicode 就是这种），
 * 其余按 UTF-8。以前一律按 UTF-8 硬解，UTF-16 文件出来是成片乱码却照样报"占比 100%"。
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

let raw, encoding;
try { ({ text: raw, encoding } = readText(input)); }
catch (err) { console.error(`读取失败: ${input} — ${err.message}`); process.exit(2); }
if (encoding === 'utf8-suspect') {
  console.error(`注意: ${input} 解码后含大量替换字符（U+FFFD），很可能不是 UTF-8，解析结果不可信 —— 请另存为 UTF-8 后重跑。`);
}
if (raw.trim() === '') { console.error(`输入文件为空（或全是空白）: ${input}`); process.exit(2); }
// 兼容 \r\n / \n / \r 三种换行：以前只按 \r?\n 切，只有 \r 换行的老文件会被当成一整行，
// <status> 机器块与分区标题全部漏剔。
const lines = raw.split(/\r\n|\n|\r/);

const ROUND_RE = /^#{2,3}\s*第\s*(\d+|[零一二三四五六七八九十百]{1,6})\s*轮[^\S\n]*(.*)$/;
const CN_DIGIT = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
/** 「第3轮」「第三轮」「第十二轮」都解析成数字（中文数字轮次以前完全不被识别） */
function roundNoOf(tok) {
  if (/^\d+$/.test(tok)) return Number(tok);
  let n = 0, s = tok;
  if (s.includes('百')) { const [a, b] = s.split('百'); n += (a ? (CN_DIGIT[a] ?? 0) : 1) * 100; s = b || ''; }
  if (s.includes('十')) { const [a, b] = s.split('十'); n += (a ? (CN_DIGIT[a] ?? 0) : 1) * 10; s = b || ''; }
  if (s) n += CN_DIGIT[s] ?? 0;
  return n;
}
const AI_MARK = /世界引擎|AI|助手|模型/;
const PLAYER_MARK = /玩家|用户|我（|我\(/;
const BLOCK_OPEN = /^<\s*(status|状况|状态|state|信息栏)\s*>/i;
const BLOCK_CLOSE = /^<\s*\/\s*(status|状况|状态|state|信息栏)\s*>/i;
const CARD_HEAD_RE = /^\*\*[^*]{1,40}·\s*角色卡\*\*\s*$/;
const HR_RE = /^-{3,}\s*$/;

// —— 机器行 / 脚手架行判据（顺序执行，命中即剔除）——
// 原则：只剔除「无歧义的机器行 / 结构行」。带 ** 的整行**不一律剔除** ——
// 那里面大量是真的对话与拟声（`**“你怎么知道。”**`），误删等于丢正文。
const RULES = [
  // 判定行：允许 ** 包裹
  ['判定行',      /^\*{0,2}\s*【判定[:：]/],
  // 装备卡 / 结算卡：含 ｜ 分隔且带字段名
  ['装备卡',      /^\*{0,2}\s*【[^】]{1,12}】.*｜.*(属性[:：]|稀有度|负重[:：]|特性[:：])/],
  // 战斗能力行 / 地形行
  ['战场行',      /^\*{0,2}\s*(战场能力|战斗地形|战场|先攻)[:：]/],
  // 战斗网格：A # # # #  /  A # . . ▲ . #
  ['网格行',      /^\*{0,2}\s*[A-J]\s+[#.．\s▲▼|]+\s*\*{0,2}\s*(（[^）]*）)?\s*$/],
  // 网格图例：▲=北墙根凸起的基座
  ['网格图例',    /^\*{0,2}\s*[▲▼|#]\s*=/],
  // 结算 / 任务 / 经验行（【支线·… 完成】〔战役段结算·…〕）
  ['结算行',      /^\*{0,2}\s*(【[^】]{0,20}[··][^】]{0,40}】|〔[^〕]{0,40}〕)/],
  // 场景切换头：**第5日，黄昏。老鹰井。** / ——第11日，夜。断桨酒馆。
  // 注意 `(?:——)?` 不能写成 `——?` —— 后者意为「一个破折号 + 可选第二个」，会漏掉全部无破折号的行。
  ['场景切换头',  /^\*{0,2}\s*(?:——)?\s*第\s*\d+\s*日[，,。]/],
  // 战斗日志行：——灰鳗首领攻击。 / ——打手乙攻击。
  ['战斗日志行',  /^\*{0,2}\s*——\s*[^。\n]{0,14}(攻击|行动|回合|先攻)[。]?\s*\*{0,2}$/],
  // 时间跳跃标记：——五分钟后。
  ['时间跳跃',    /^\*{0,2}\s*——\s*(五分钟|十分钟|一刻钟|片刻|稍后|许久|一会儿|次日|翌日)(之?后)?[。]\s*\*{0,2}$/],
  // 章末元信息：——本章结束。/ ——本章完。
  ['章末元信息',  /^\*{0,2}\s*——\s*(本章结束|本章完|全书完)/],
  // 占位符：（未完）（待续）
  ['占位符',      /^\*{0,2}\s*[（(]\s*(未完|待续|本章完|全文完)\s*[）)]\s*\*{0,2}$/],
];

/** @type {{round:number,line:string}[]} */
const out = [];
let section = null;      // 'prose' | 'other'
let inBlock = false;
let roundNo = 0;
let inCard = false;
const dropped = new Map();   // 类别 -> 行数
const drop = (k) => dropped.set(k, (dropped.get(k) || 0) + 1);

let strayBold = 0;           // 正文里残留的 ** 标记（行内泄漏）
let wholeLineBold = 0;       // 整行被 ** 包起来的行（场景头已剔除，其余为台词/拟声）

const push = (line) => out.push({ round: roundNo, line });

// 全文预扫「世界引擎 / AI」分区：只要全文里存在 AI 分区，就说明这是结构化归档，
// 玩家段必须整体排除。旧逻辑是「见过 AI 分区之后才开始过滤」的增量开关，
// 于是第一轮的「### 玩家」在首个 AI 分区出现之前被当成正文（实测首轮玩家输入全部泄漏）。
const hasAiSection = lines.some((ln) => {
  const t = ln.trim();
  const m = t.match(ROUND_RE);
  return (m && AI_MARK.test(m[2] || '')) || /^###\s*(世界引擎|AI)/.test(t);
});

for (const line of lines) {
  const t = line.trim();

  // —— 轮次标题（两种归档格式）——
  const rm = t.match(ROUND_RE);
  if (rm) {
    roundNo = roundNoOf(rm[1]);
    const tail = rm[2] || '';
    if (AI_MARK.test(tail)) section = 'prose';
    else section = 'other';
    inBlock = false; inCard = false;
    if (section === 'prose' && rounds) push(`\n@@ROUND ${roundNo}@@\n`);
    continue;
  }

  // —— 小节标题 ——
  if (/^###/.test(t)) {
    if (/^###\s*(世界引擎|AI)/.test(t)) { section = 'prose'; if (rounds) push(`\n@@ROUND ${roundNo}@@\n`); }
    else section = 'other';
    inBlock = false; inCard = false;
    continue;
  }
  if (/^#\s/.test(t)) { section = 'other'; continue; }

  // —— 机器块开关：无条件切换，不假设"块外一定是正文" ——
  if (BLOCK_OPEN.test(t)) { inBlock = true; drop('机器块(<status>/<状况>)'); continue; }
  if (BLOCK_CLOSE.test(t)) { inBlock = false; continue; }
  if (inBlock) { drop('机器块内行'); continue; }

  // —— 单行 JSON 块 [[状态更新]]{…} / [[商店]]{…} ——
  if (/^\[\[/.test(t)) { drop('[[机器标记]]'); continue; }

  const active = hasAiSection ? section === 'prose' : true;
  if (!active) { continue; }

  if (CARD_HEAD_RE.test(t)) { inCard = true; continue; }
  if (inCard) { if (HR_RE.test(t)) inCard = false; continue; }

  if (t === '') { push(''); continue; }

  // —— 机器行 / 脚手架行 ——
  let hit = null;
  for (const [k, re] of RULES) if (re.test(t)) { hit = k; break; }
  if (hit) { drop(hit); continue; }

  if (HR_RE.test(t)) { drop('--- 分隔线'); continue; }
  if (/^[-|>]/.test(t)) { drop('引用/表格行'); continue; }
  if (/^!\[/.test(t)) { drop('图片行'); continue; }
  if (/^\*（.*）\*\s*$/.test(t)) { drop('斜体注记行'); continue; }

  // —— 整行加粗：保留内容，只记账 ——
  // 这个格式里整行 ** 既用于场景头（已在上面的规则里剔除），也用于台词与拟声
  // （`**“你怎么知道。”**`）。后者是真正文，绝不能删，所以这里只统计不剔除。
  if (/^\*\*[^*\n]{1,200}\*\*\s*$/.test(t)) {
    wholeLineBold++;
  }

  // —— 残留的 ** 泄漏：正文里出现的孤立加粗标记 ——
  let text = line;
  if (/\*\*/.test(text)) {
    strayBold += (text.match(/\*\*/g) || []).length;
    text = text.replace(/\*\*/g, '');
  }
  push(text);
}

// 压缩连续空行
const cleaned = [];
for (const e of out) {
  if (e.line === '' && (cleaned.length === 0 || cleaned[cleaned.length - 1].line === '')) continue;
  cleaned.push(e);
}
const body = cleaned.map((e) => e.line).join('\n').replace(/^\n+/, '').replace(/\n+$/, '') + '\n';

const chars = (s) => s.replace(/\s+/g, '').length;
const inChars = chars(raw);
const outChars = chars(body);
const ratio = inChars > 0 ? outChars / inChars : 0;

// 每轮正文规模：人读与 --json 两种报告共用一份统计
const perRound = new Map();
for (const e of cleaned) {
  if (!e.line) continue;
  perRound.set(e.round, (perRound.get(e.round) || '') + e.line + '\n');
}
const roundsArr = [...perRound.entries()].sort((a, b) => a[0] - b[0]).map(([r, t]) => ({ round: r, chars: chars(t) }));

const lowRatio = ratio < 0.15 && !lenient;
// 机器块开到文件尾都没闭合：后面的内容全被当块内行剔掉了，多半是源文件漏写闭合标签
const unclosedBlock = inBlock;

/** 写文件（失败时报人话，不甩栈） */
function writeOut(path, content) {
  try { writeFileSync(path, content, 'utf8'); }
  catch (err) { console.error(`写入失败: ${path} — ${err.message}`); process.exit(2); }
}

if (jsonReport) {
  const reportObj = {
    schemaVersion: 1,
    input,
    output: outFile || null,
    encoding,
    charsIn: inChars,
    charsOut: outChars,
    ratio: Number(ratio.toFixed(4)),
    hasAiSection,
    rounds: roundsArr,
    dropped: Object.fromEntries(dropped),
    strayBold,
    wholeLineBold,
    unclosedBlock,
    lowRatioWarning: ratio < 0.15,
  };
  const jsonText = JSON.stringify(reportObj, null, 2);
  console.error(jsonText);
  if (outFile) writeOut(outFile + '.stats.json', jsonText);
  if (lowRatio) process.exit(3);
  if (outFile) writeOut(outFile, body);
  else process.stdout.write(body);
  process.exit(0);
}

/** 统计报告同时进 stderr 和文件 —— Windows 上 stderr 重定向会毁掉编码，文件才可靠 */
const report = [];
const say = (s = '') => { report.push(s); console.error(s); };

if (stats) {
  say('## 轮次  正文规模');
  let total = 0;
  for (const r of roundsArr) {
    total += r.chars;
    say(`  ${String(r.round).padStart(2)}  ${String(r.chars).padStart(6)} 字`);
  }
  say(`合计  ${String(total).padStart(6)} 字`);

  const entries = [...dropped.entries()].sort((a, b) => b[1] - a[1]);
  if (entries.length) {
    say('');
    say('## 已剔除的机器行 / 脚手架行');
    for (const [k, n] of entries) say(`  ${String(n).padStart(4)} 行  ${k}`);
  }
  if (strayBold) {
    say('');
    say(`注意: 正文中清除残留 ** 标记 ${strayBold} 个（加粗泄漏，本身也是 AI 味信号）。`);
  }
  if (wholeLineBold) {
    say(`注意: 另有 ${wholeLineBold} 行整行被 ** 包裹（台词/拟声），已保留内容、只去掉标记。`);
  }
  if (unclosedBlock) {
    say('注意: 机器块（<status>/<状况>…）直到文件尾都没闭合，块内内容已全部剔除 —— 若源文件确实漏写闭合标签，请补上后重跑。');
  }
}

say('');
say(`原文件 ${inChars} 字 → 抽出正文 ${outChars} 字（占比 ${(ratio * 100).toFixed(1)}%）`);
if (!hasAiSection) say('提示: 未识别到「世界引擎/AI」分区，已按整篇正文处理（会话原始输出格式）。');

if (lowRatio) {
  report.push('');
  report.push('!! 警告: 抽出正文占比低于 15%，很可能解析失败（格式不被识别，或文件本身就是片段）。');
  report.push('!! 这种结果不要喂给 deslop-lint —— 指标会是假的。');
  report.push('!! 确认格式后重试，或加 --lenient 强制继续。');
  if (outFile) writeOut(outFile + '.stats.txt', report.join('\n'));
  console.error(report.slice(-4).join('\n'));
  process.exit(3);
}

if (outFile) {
  writeOut(outFile, body);
  writeOut(outFile + '.stats.txt', report.join('\n'));
  console.error(`已写入 ${outFile}（统计见 ${outFile}.stats.txt）`);
} else {
  process.stdout.write(body);
}
