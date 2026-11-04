import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// 按脚本自身位置解析，而不是 cwd —— 否则从别处运行会去找 <cwd>/skills/deslop/SKILL.md
const here = dirname(fileURLToPath(import.meta.url));
const t = readFileSync(join(here, '..', 'SKILL.md'), 'utf8').replace(/^\uFEFF/, '');
const m = t.match(/^---\n([\s\S]*?)\n---/);
if (!m) { console.log('  FAIL: 没有 frontmatter'); process.exit(1); }
const fm = m[1];
const name = (fm.match(/^name:[ \t]*(.+)$/m) || [])[1]?.trim();
const hasDesc = /^description:[ \t]*\S/m.test(fm);
const hasWhen = /^whenToUse:/m.test(fm);
console.log('  name        =', JSON.stringify(name));
console.log('  kebab-case  =', /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name || '') ? 'PASS' : 'FAIL');
console.log('  description =', hasDesc ? 'PASS' : 'FAIL');
console.log('  whenToUse   =', hasWhen ? 'PASS（可选键）' : '未设置（可选，无妨）');
const badBools = fm.match(/^[ \t]*[a-z-]+:[ \t]*(True|False|TRUE|FALSE|YesNo)\b/mi);
console.log('  布尔值语法  =', badBools ? 'FAIL → ' + badBools[1] : 'PASS（未使用布尔键或语法合法）');
console.log('  正文长度    =', t.length, '字符');
