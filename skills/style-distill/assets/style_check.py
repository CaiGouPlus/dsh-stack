# -*- coding: utf-8 -*-
"""文风体检：把一段正文对照蒸馏指纹打分，输出可执行的差距清单。
用法: python deslop_check.py <txt文件路径>
目标值来自 蒸馏卡（四本全量统计）。"""
import sys, re
from collections import Counter
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

CJK = re.compile(r'[\u4e00-\u9fff]')
SENT_SPLIT = re.compile(r'[。？！…]+')

NEG = ['氤氲', '缱绻', '蓦地', '蓦然', '宛如', '旖旎', '如梦似幻', '须臾', '惊鸿', '韶华']
T1 = {
    '翻案句(不是A而是B)': re.compile(r'不是[^，。]{1,12}[，,]\s*(而)?是|并非[^，。]{1,12}[，,]\s*(而)?是|你以为.{1,15}其实|看似.{1,12}实则'),
    '万能状语(带着)': re.compile(r'[，。！？]带着[^，。]{0,8}(目光|眼神|笑意|惆怅|伤感|愤怒|疑惑)'),
    '明喻套(仿佛/犹如/宛若)': re.compile(r'仿佛|犹如|宛若|宛如'),
    '使动句(让/令/使)': re.compile(r'让[^，。]{1,8}(想起|明白|意识到|感到|感动|愤怒)|令[^，。]{1,8}(想起|明白|意识到|感到)'),
    '时间套壳(当…时)': re.compile(r'当[^，。]{1,15}的时候|当[^，。]{1,15}时[，,]'),
    '认知动词前置': re.compile(r'他?意识?到|他感到|他注意到|她?忽然?明白|这才明白|终于明白'),
    '转场词(与此同时)': re.compile(r'与此同时'),
    '升华句': re.compile(r'在这一刻|那一刻[，,]?所有|也许这就是|这就是.{0,8}的意义'),
    '上帝视角': re.compile(r'此时的他还不知道|他不知道的是|更大的风暴'),
    '结论小尾巴': re.compile(r'[。！？](都没再说话|没再说话|没有说话|没进来|没有人回答)[。！]?$'),
}
SIG_OK = ['愣了一下', '看了一眼', '的时候', '说道', '问道']

def main(path):
    text = open(path, encoding='utf-8-sig').read()
    paras = [p.strip() for p in re.split(r'\n+', text) if p.strip()]
    paras = [p for p in paras if not re.match(r'^\s*第[0-9一二三四五六七八九十百千]+[章回]', p)]
    full = ''.join(paras)
    n_cjk = max(1, len(CJK.findall(full)))

    sents = [s.strip() for p in paras for s in SENT_SPLIT.split(p) if s.strip()]
    lens = [len(CJK.findall(s)) for s in sents]
    n = max(1, len(lens))
    le8 = sum(1 for L in lens if L <= 8) / n * 100
    gt35 = sum(1 for L in lens if L > 35) / n * 100
    mid = 100 - le8 - gt35
    psc = [len([x for x in SENT_SPLIT.split(p) if x.strip()]) for p in paras]
    single = sum(1 for c in psc if c == 1) / max(1, len(paras)) * 100
    le_para = full.count('了') / max(1, len(paras))
    simile = (full.count('像') + full.count('仿佛') + full.count('犹如')) * 10000 / n_cjk
    bang = full.count('！') * 10000 / n_cjk
    dash = full.count('——') * 10000 / n_cjk

    print(f'== 文风体检 {path} ==')
    print(f'字数 {n_cjk} | 句 {n} | 段 {len(paras)}\n')

    def row(name, val, lo, hi, unit='%'):
        ok = lo <= val <= hi
        flag = '✅' if ok else '⚠️'
        print(f'{flag} {name}: {val:.1f}{unit}（目标 {lo}-{hi}）')
        return ok

    print('--- 分布指纹 ---')
    row('碎句(≤8字)占比', le8, 22, 35)
    row('长句(>35字)占比', gt35, 18, 32)
    row('中等句占比(越低越好)', mid, 30, 52)
    row('单句段占比', single, 50, 70)
    row('「了」/段', le_para, 0.3, 1.1)
    row('明喻/万字', simile, 8, 20)
    row('感叹号/万字(越低越好)', bang, 0, 60)
    row('破折号/万字(应≈0)', dash, 0, 2)

    print('\n--- T1 修辞动作（应为 0） ---')
    bad = 0
    for name, rx in T1.items():
        hits = rx.findall(full)
        if hits:
            bad += len(hits)
            print(f'❌ {name}: {len(hits)} 处  例:「{hits[0][:24]}」')
    if bad == 0:
        print('✅ T1 全清')

    print('\n--- 负词表（应为 0） ---')
    nb = [(w, full.count(w)) for w in NEG if full.count(w)]
    if nb:
        for w, c in nb:
            print(f'❌ {w}: {c} 处')
    else:
        print('✅ 负词表全清')

    print('\n--- 风格正选（应有） ---')
    for w in SIG_OK:
        c = full.count(w)
        print(f'{"✅" if c else "⚠️"} {w}: {c} 处' + ('' if c else '（签名词缺失，不像）'))
    cl = full.count('愣了一下') + full.count('了一下')
    print(f'{"✅" if cl else "⚠️"} 「V了一下」家族: {cl} 处（白名单，清创不许清）')

    print('\n--- 结论 ---')
    if bad == 0 and not nb and le8 >= 22 and single >= 50:
        print('分布与指纹同侧，T1/负词干净——像不像的差距已主要在内容层（人物是否有事干、信息是否逆着给）。')
    else:
        print('先修 ❌ 项；分布不达标就调句段结构，别靠换词。')

if __name__ == '__main__':
    main(sys.argv[1])
