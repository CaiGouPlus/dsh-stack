/**
 * 文风实验室 · 客户端源码 · 30-tab-anti
 * ─────────────────────────────────────────────────────────────
 * 标签页「反八股」：tavern-state.json 的 antiCliche / bannedWords + 实际注入的条款正文。
 * 可读性要点：正文一律折叠（摘要行给出条数/字数），长正文有「⛶ 全屏」，按钮都带悬停说明。
 */

function AntiTab(props) {
  var loaded = useData(() => api("GET", "/anti"), []);
  var rules = useData(() => api("GET", "/anti/rules"), []);
  var corpus = useData(() => api("GET", "/anti/corpus"), []);
  var st = React.useState({ enabled: null, words: [], text: "", mtimeMs: null, msg: null, err: null, busy: false });
  var s = st[0]; var set = st[1];
  var pk = React.useState({ picked: {}, msg: null, open: false });
  var pick = pk[0]; var setPick = pk[1];

  React.useEffect(function () {
    if (loaded.data) set((prev) => Object.assign({}, prev, {
      enabled: loaded.data.enabled,
      words: loaded.data.bannedWords || [],
      text: (loaded.data.bannedWords || []).join("\n"),
      mtimeMs: loaded.data.mtimeMs,
    }));
  }, [loaded.data]);

  if (loaded.phase === "loading") return Card(Empty("正在读取 tavern-state.json…"));
  if (loaded.phase === "error") return Card(Err("读取失败：" + loaded.error));

  var words = s.text.split("\n").map((w) => w.trim()).filter((w) => w !== "");
  function save() {
    set(Object.assign({}, s, { busy: true, msg: null, err: null }));
    api("POST", "/anti", { enabled: s.enabled, bannedWords: words, expectedMtimeMs: s.mtimeMs }).then((res) => {
      if (res.ok) set({ enabled: res.data.anti.enabled, words: res.data.anti.bannedWords, text: res.data.anti.bannedWords.join("\n"), mtimeMs: res.data.anti.mtimeMs, msg: "已写入 tavern-state.json（备份：" + (res.data.backup ? res.data.backup.id : "无") + "）", err: null, busy: false });
      else set(Object.assign({}, s, { busy: false, err: res.code + ": " + res.error }));
    });
  }
  function togglePick(item) {
    var next = Object.assign({}, pick.picked);
    if (next[item] === true) delete next[item]; else next[item] = true;
    setPick(Object.assign({}, pick, { picked: next, msg: null }));
  }
  function addPicked() {
    var chosen = Object.keys(pick.picked);
    if (chosen.length === 0) { setPick(Object.assign({}, pick, { msg: "还没挑任何条目" })); return; }
    var next = words.slice();
    var added = 0;
    for (const item of chosen) if (next.indexOf(item) < 0) { next.push(item); added += 1; }
    set(Object.assign({}, s, { text: next.join("\n"), msg: null, err: null }));
    setPick(Object.assign({}, pick, { picked: {}, msg: "已加入 " + added + " 条到禁用词编辑框（还要点「保存到酒馆」才真正写入）" }));
  }
  var pickedCount = Object.keys(pick.picked).length;
  var corpusTotal = corpus.data ? corpus.data.sections.reduce((n, x) => n + x.count, 0) : 0;
  var wordDelta = words.length - (loaded.data.bannedWords || []).length;

  return h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
    /* ① 状态与保存 */
    Card([
      CardHead("反 AI 八股 · 写入 tavern-state.json", [
        h(Badge, { key: "1", on: s.enabled === true, tip: "antiCliche 是酒馆的反八股总开关；关掉后下面 15 条结构禁令不再注入" }, s.enabled ? "开关：开" : "开关：关"),
        h(Badge, { key: "2", tip: "这些词会注入到「词汇禁令」段，逐个用「、」连接" }, "禁用词 " + words.length + " 条"),
        wordDelta !== 0 ? h(Badge, { key: "d", on: true, tip: "还没保存的增删数量" }, "未保存改动 " + fmtDelta(wordDelta)) : null,
        h(Badge, { key: "3", tip: "酒馆的提示词窗口大小，只读展示" }, "窗口 " + (loaded.data.promptWindowTokens == null ? "—" : loaded.data.promptWindowTokens) + " tokens"),
      ], [
        h(Btn, {
          key: "tg", primary: true,
          tip: s.enabled ? "关掉后注入文本里不再出现 15 条结构禁令（要再点「保存到酒馆」才生效）" : "打开后每次生成都会带上 15 条结构禁令（要再点「保存到酒馆」才生效）",
          onClick: () => set(Object.assign({}, s, { enabled: !s.enabled })),
        }, s.enabled ? "关闭反八股" : "打开反八股"),
        h(Btn, { key: "sv", primary: true, onClick: save, disabled: s.busy, tip: "把上面的开关与禁用词整表写进 tavern-state.json：写前自动备份、写后回读校验，只动 antiCliche 与 bannedWords 两个键" }, s.busy ? "保存中…" : "保存到酒馆"),
        h(Btn, { key: "rl", onClick: loaded.reload, tip: "丢弃未保存的改动，从文件重新读取" }, "重新读取"),
      ]),
      MsgLine({ err: s.err, ok: s.msg }),
      h(HelpLine, { key: "n" }, "这里只改两个键：antiCliche（开关）与 bannedWords（词表）。文件路径："),
      h("span", { key: "f", style: S.mono }, loaded.data.file),
    ]),

    /* ② 实际注入的条款（折叠） */
    h(Card, { key: "rules" }, [
      CardHead("实际注入的反八股条款（只读 · 含正文）", [
        h(Badge, { key: "1", on: rules.data && rules.data.enabled === true, tip: "酒馆拼提示词时会不会带上这一段" }, rules.data ? (rules.data.enabled ? "正在注入" : "未注入（开关关）") : "…"),
        h(Badge, { key: "2", tip: "来自 dsh-tavern 内置注入段的结构禁令条数" }, "结构禁令 " + (rules.data ? rules.data.structureRules.length : "—") + " 条"),
        h(Badge, { key: "3", on: rules.data && rules.data.wordCount > 0, tip: "来自你 bannedWords 词表的词汇禁令条数" }, "词汇禁令 " + (rules.data ? rules.data.wordCount : "—") + " 条"),
        h(Badge, { key: "4", on: rules.data && rules.data.mirror.ok, tip: "我们从酒馆源码镜像了这份正文，每次读取都回源核对；不一致会显示「待复核」" }, rules.data && rules.data.mirror.checked ? (rules.data.mirror.ok ? "镜像已核对" : "镜像待复核") : "未核对"),
      ], [
        h(Btn, { key: "rl", onClick: rules.reload, tip: "重新从酒馆源码读取并核对镜像" }, "重新读取"),
      ]),
      rules.phase === "loading" ? Note("load", "读取条款…") : null,
      rules.phase === "error" ? Fail("err", "读取条款失败：" + rules.error + hostHint(rules)) : null,
      rules.data !== null && rules.data.wordCount === 0 ? h("p", { key: "warn", style: S.warn }, "⚠️ 禁用词表是空的 → 注入文本里的「" + (rules.data.vocabTitle || "## 词汇禁令") + "」是空段，反八股只剩 15 条结构禁令在起作用。可在下面补词，或从「本地语料」逐条挑。") : null,
      rules.data === null ? null : h(Fold, {
        key: "list",
        title: "15 条结构禁令正文",
        summary: "点开逐条查看 · 来源是酒馆内置注入段（不在用户数据文件里）",
        tip: "这些条款是酒馆每次生成时真正注入的原文，本插件只读展示",
      },
        h("ol", { style: { margin: 0, paddingLeft: "22px", display: "flex", flexDirection: "column", gap: "2px", fontSize: "12.5px", lineHeight: 1.7 } },
          rules.data.structureRules.map((rule, i) => h("li", { key: i }, rule)))),
      rules.data === null ? null : h(Fold, {
        key: "pv",
        title: "完整注入预览 · 与酒馆拼出的字符串逐字一致",
        summary: rules.data.previewChars + " 字 · 可复制 / 全屏查看",
      }, [
        h("div", { key: "b", style: S.bar }, [
          h(CopyBtn, { key: "cp", label: "复制全文", getText: () => rules.data.preview, tip: "复制整段注入文本（含 15 条结构禁令与词汇禁令）" }),
          h(FocusBtn, {
            key: "fs",
            label: "⛶ 全屏查看",
            tip: "整窗查看注入预览（只读，可全选）",
            makeSpec: () => ({ title: "完整注入预览", subtitle: rules.data.previewChars + " 字 · 与酒馆拼出的字符串逐字一致", mode: "view", value: rules.data.preview }),
          }),
        ]),
        h(ReadOnlyArea, { key: "a", value: rules.data.preview, style: { minHeight: "150px" } }),
        h(HelpLine, { key: "n" }, rules.data.mirror.note),
      ]),
    ]),

    /* ③ 禁用词编辑 */
    Card([
      CardHead("禁用词（每行一条 · 保存时整表替换）", [
        h(Badge, { key: "1", tip: "当前编辑框里的条数（按行计）" }, words.length + " 条"),
        wordDelta !== 0 ? h(Badge, { key: "2", on: true }, "未保存 " + fmtDelta(wordDelta)) : null,
      ], [
        h(FocusBtn, {
          key: "fs",
          label: "⛶ 全屏编辑",
          tip: "词表很长时在整窗大的编辑框里改（应用后仍要点「保存到酒馆」）",
          makeSpec: () => ({
            title: "禁用词表编辑",
            subtitle: "每行一条 · 全屏改完点「应用到表单」，再回这里保存",
            mode: "edit",
            value: s.text,
            saveLabel: "应用到表单",
            onSave: (v) => { set(Object.assign({}, s, { text: v, msg: null, err: null })); return "已应用到表单（还没写盘）"; },
          }),
        }),
      ]),
      h(Area, { key: "a", value: s.text, onChange: (v) => set(Object.assign({}, s, { text: v })), style: { minHeight: "140px" }, placeholder: "每行一条，例如：\n总而言之\n他终于明白了一切" }),
      h(HelpLine, { key: "n" }, "这些词会原样拼进注入段的「词汇禁令」，用「、」连接 —— 所以一条一个词/短语，别写整句规则。删除行 = 从词表移除，保存时整表替换。"),
    ]),

    /* ④ 本地语料（候选词表） */
    h(Card, { key: "corpus" }, [
      CardHead("本地反八股语料（deslop 词表 · 只读候选）", [
        corpus.data !== null && corpus.data.exists === true ? h(Badge, { key: "1", tip: "生成期硬禁令：写作时完全不许出现的模式" }, "硬禁令 " + corpus.data.hardRules.length + " 条") : null,
        corpus.data !== null && corpus.data.exists === true ? h(Badge, { key: "2", tip: "词表候选：可疑但不是违禁词，挑着加进禁用词表" }, "词表候选 " + corpusTotal + " 条") : null,
      ]),
      corpus.phase === "loading" ? Note("load", "读取语料…") : null,
      corpus.phase === "error" ? Fail("err", "读取语料失败：" + corpus.error + hostHint(corpus)) : null,
      corpus.data !== null && corpus.data.exists !== true ? Note("none", corpus.data.note) : null,
      corpus.data !== null && corpus.data.exists === true ? h(Fold, {
        key: "body",
        title: "逐条浏览 · 点击挑选加入禁用词表",
        summary: "硬禁令 " + corpus.data.hardRules.length + " 条 + 词表候选 " + corpusTotal + " 条 · 已挑 " + pickedCount + " 条",
        tip: "词表是线索不是违禁词：挑中后点「加入禁用词表」，还要保存才生效",
      }, [
        h("p", { key: "hr", style: S.sub }, "① 生成期硬禁令（写作时完全禁止的模式）："),
        h("ol", { key: "hl", style: { margin: 0, paddingLeft: "22px", fontSize: "12.5px", lineHeight: 1.7 } }, corpus.data.hardRules.map((x, i) => h("li", { key: i }, x))),
        h("div", { key: "secs", style: { display: "flex", flexDirection: "column", gap: "8px" } }, corpus.data.sections.map((section, si) =>
          h("div", { key: si, style: { display: "flex", flexDirection: "column", gap: "4px" } }, [
            h("p", { key: "t", style: S.sub }, "② " + section.title + "（" + section.count + " 条 · 点击挑选）"),
            h("div", { key: "chips", style: { display: "flex", flexWrap: "wrap", gap: "4px" } }, section.items.map((item, ii) =>
              h("button", { key: ii, type: "button", style: pick.picked[item] === true ? S.chipOn : S.chip, title: pick.picked[item] === true ? "已挑中，再点取消" : "挑中后加入上方禁用词表（要点保存才写盘）", onClick: () => togglePick(item) }, item))),
          ]))),
        h("div", { key: "acts", style: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" } }, [
          h(Btn, { key: "add", primary: true, onClick: addPicked, disabled: pickedCount === 0, tip: "把挑中的词条填进上方禁用词编辑框（去重）；还要点「保存到酒馆」才写盘" }, "加入禁用词表（已挑 " + pickedCount + " 条）"),
          h("span", { key: "n", style: S.sub }, corpus.data.note),
        ]),
        Done("msg", pick.msg),
      ]) : null,
    ]),
  );
}
