# -*- coding: utf-8 -*-
"""全量统计蒸馏：句法/标点/词汇/结构指纹 + 分层抽样切片"""
import json, re, sys, os
from collections import Counter

SRC = sys.argv[1] if len(sys.argv) > 1 else input("语料目录: ").strip()
OUT = os.path.join(SRC, "_蒸馏报告")
os.makedirs(OUT, exist_ok=True)
os.makedirs(os.path.join(OUT, "samples"), exist_ok=True)

CJK = re.compile(r'[\u4e00-\u9fff]')
SENT_SPLIT = re.compile(r'[。？！…]+')
CHAP = re.compile(r'^\s*(第[0-9一二三四五六七八九十百千万零两]+[章卷节回]|序章|楔子|番外|尾声|后记|卷[0-9一二三四五六七八九十])')
QUOTE = re.compile(r'[「“]([^」”]*)[」”]')
SIMILE = ['像', '仿佛', '犹如', '宛如', '好似', '似的', '一样', '如同']
NEG_WORDS = ['氤氲', '缱绻', '蓦地', '蓦然', '宛如', '旖旎', '纷至沓来', '戛然而止', '转瞬即逝', '如梦似幻', '刹那间', '须臾']

def read_text(path):
    raw = open(path, 'rb').read()
    for enc in ('utf-8-sig', 'utf-8', 'gb18030'):
        try:
            t = raw.decode(enc)
            if CJK.search(t):
                return t, enc
        except UnicodeDecodeError:
            continue
    return raw.decode('utf-8', errors='replace'), 'utf-8(replace)'

def analyze(name, text):
    paras = [p.strip() for p in re.split(r'\n+', text) if p.strip()]
    paras = [p for p in paras if not CHAP.match(p)]  # 去掉章标题行
    full = ''.join(paras)
    cjk_total = len(CJK.findall(full))

    sents = []
    for p in paras:
        for s in SENT_SPLIT.split(p):
            s = s.strip()
            if s:
                sents.append(s)
    sent_lens = [len(CJK.findall(s)) for s in sents]
    sl = sorted(sent_lens)
    n = len(sl)
    def pct(p):
        return sl[min(n - 1, int(n * p))] if n else 0
    buckets = {'le8': 0, 'b9_20': 0, 'b21_35': 0, 'gt35': 0}
    for L in sent_lens:
        if L <= 8: buckets['le8'] += 1
        elif L <= 20: buckets['b9_20'] += 1
        elif L <= 35: buckets['b21_35'] += 1
        else: buckets['gt35'] += 1
    buckets_pct = {k: round(v * 100.0 / max(1, n), 1) for k, v in buckets.items()}

    para_sent_counts = [len([x for x in SENT_SPLIT.split(p) if x.strip()]) for p in paras]
    single_para = sum(1 for c in para_sent_counts if c == 1)

    def per10k(ch):
        return round(full.count(ch) * 10000.0 / max(1, cjk_total), 2)

    quoted = ''.join(QUOTE.findall(full))
    dialogue_chars = len(CJK.findall(quoted))

    le_count = full.count('了')
    le_para_avg = round(le_count / max(1, len(paras)), 2)

    simile = {w: round(full.count(w) * 10000.0 / max(1, cjk_total), 2) for w in SIMILE}
    neg = {w: full.count(w) for w in NEG_WORDS}

    # n-gram 频率（仅中文连续串内）
    grams = {2: Counter(), 3: Counter(), 4: Counter()}
    sent_initial = Counter()
    for p in paras:
        for run in re.findall(r'[\u4e00-\u9fff]+', p):
            for k in (2, 3, 4):
                for i in range(len(run) - k + 1):
                    grams[k][run[i:i + k]] += 1
    for s in sents[:]:
        run = CJK.findall(s)
        if len(run) >= 2:
            sent_initial[''.join(run[:2])] += 1

    # 章结构
    lines = [l.strip() for l in text.split('\n')]
    chap_idx = [i for i, l in enumerate(lines) if CHAP.match(l) and len(l) < 40]
    openings, endings = [], []
    for ci, i in enumerate(chap_idx):
        j = chap_idx[ci + 1] if ci + 1 < len(chap_idx) else min(len(lines), i + 200)
        body = [l for l in lines[i + 1:j] if l.strip()]
        if body:
            openings.append(''.join(CJK.findall(body[0]))[:12])
            endings.append(''.join(CJK.findall(body[-1]))[:16])
    open2 = Counter(o[:2] for o in openings if len(o) >= 2)
    end_type = Counter()
    for e in endings:
        if not e: continue
        if e.endswith('？'): end_type['问句收尾'] += 1
        elif e.endswith('！'): end_type['感叹收尾'] += 1
        elif e.endswith('”') or e.endswith('」'): end_type['对白收尾'] += 1
        else: end_type['陈述/动作收尾'] += 1

    return {
        'name': name, 'chars_cjk': cjk_total, 'paras': len(paras), 'sents': n,
        'avg_sent_len': round(sum(sent_lens) / max(1, n), 1),
        'sent_len_pct': {'p10': pct(.10), 'p50': pct(.50), 'p90': pct(.90)},
        'sent_buckets_pct': buckets_pct,
        'para_avg_sents': round(sum(para_sent_counts) / max(1, len(paras)), 2),
        'single_sent_para_pct': round(single_para * 100.0 / max(1, len(paras)), 1),
        'punct_per10k': {c: per10k(c) for c in '，、。？！…—：；'},
        'dialogue_pct': round(dialogue_chars * 100.0 / max(1, cjk_total), 1),
        'le_per_para': le_para_avg,
        'simile_per10k': simile,
        'neg_words_count': neg,
        'top2': grams[2].most_common(40),
        'top3': grams[3].most_common(40),
        'top4': grams[4].most_common(30),
        'sent_initial_top': open2.most_common(30),
        'chapters': len(chap_idx),
        'open2_top': open2.most_common(15),
        'ending_types': dict(end_type),
    }

def cut_samples(name, text, tag):
    lines = [l.strip() for l in text.split('\n')]
    chap_idx = [i for i, l in enumerate(lines) if CHAP.match(l) and len(l) < 40]
    out = []
    if len(chap_idx) >= 6:
        picks = [len(chap_idx) // 4, len(chap_idx) // 2, (len(chap_idx) * 3) // 4]
        for pi, pos in enumerate(picks):
            i = chap_idx[pos]
            j = chap_idx[pos + 1] if pos + 1 < len(chap_idx) else min(len(lines), i + 300)
            body = '\n'.join(l for l in lines[i:j] if l.strip())
            fp = os.path.join(OUT, 'samples', f'{tag}_p{pi + 1}_{lines[i][:20]}.txt')
            fp = re.sub(r'[\\/:*?"<>|]', '_', fp)
            open(fp, 'w', encoding='utf-8').write(body)
            out.append(os.path.basename(fp))
    return out

books = []
samples = {}
for fn in sorted(os.listdir(SRC)):
    if not fn.endswith('.txt'):
        continue
    path = os.path.join(SRC, fn)
    text, enc = read_text(path)
    short = re.sub(r'[《》（）]', '', fn)[:12]
    r = analyze(short, text)
    r['file'] = fn
    r['encoding'] = enc
    books.append(r)
    samples[short] = cut_samples(short, text, short)
    print(f'OK {short}: {r["chars_cjk"]} 字, {r["chapters"]} 章, enc={enc}', flush=True)

json.dump({'books': books, 'samples': samples}, open(os.path.join(OUT, 'stats.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('stats.json written')
