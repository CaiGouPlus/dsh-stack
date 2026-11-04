# -*- coding: utf-8 -*-
"""分层抽样切片（修复版）：每本取 1/4、1/2、3/4 处各一章"""
import re, os, sys

SRC = sys.argv[1] if len(sys.argv) > 1 else input("语料目录: ").strip()
OUT = os.path.join(SRC, "_蒸馏报告", "samples")
os.makedirs(OUT, exist_ok=True)
CJK = re.compile(r'[\u4e00-\u9fff]')
CHAP = re.compile(r'^\s*(第[0-9一二三四五六七八九十百千万零两]+[章卷节回]|序章|楔子|番外|尾声|后记|卷[0-9一二三四五六七八九十])')

TAGS = {}

for fn in sorted(os.listdir(SRC)):
    if not fn.endswith('.txt'):
        continue
    tag = TAGS.get(os.path.splitext(fn)[0], re.sub(r'[^\w]', '', os.path.splitext(fn)[0])[:8])
    text = open(os.path.join(SRC, fn), encoding='utf-8-sig').read()
    lines = [l.strip() for l in text.split('\n')]
    chap_idx = [i for i, l in enumerate(lines) if CHAP.match(l) and len(l) < 40]
    for pi, pos in enumerate([len(chap_idx) // 4, len(chap_idx) // 2, (len(chap_idx) * 3) // 4]):
        i = chap_idx[pos]
        j = chap_idx[pos + 1] if pos + 1 < len(chap_idx) else min(len(lines), i + 300)
        body = '\n'.join(l for l in lines[i:j] if l.strip())
        title = re.sub(r'[\\/:*?"<>|\s]', '_', lines[i])[:18]
        fp = os.path.join(OUT, f'{tag}_p{pi+1}_{title}.txt')
        open(fp, 'w', encoding='utf-8').write(body)
        print(f'{os.path.basename(fp)} | {len(body)} chars')
