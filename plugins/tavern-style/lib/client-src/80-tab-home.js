/**
 * 文风实验室 · 客户端源码 · 80-tab-home
 * ─────────────────────────────────────────────────────────────
 * 标签页「总览」：现在什么状态、下一步该干什么；外加「文本体检」——粘一段文字立刻打分。
 * 体检走 host 的 POST /analyze（复用 core/score.mjs 的 metrics）；宿主没重启时给出人话提示。
 */

function HomeTab(props) {
  var overview = props.overview;
  var anti = (overview && overview.antiCliche) || {};
  var presets = ((overview && overview.presets && overview.presets.presets) || []);
  var rulesSummary = (overview && overview.rules) || {};
  var improvements = (overview && overview.improvements) || {};
  var replays = (overview && overview.replays) || {};
  var lab = (overview && overview.lab) || {};
  var go = typeof props.go === "function" ? props.go : function () {};

  var pendingRules = 0;
  (rulesSummary.buckets || []).forEach((b) => { pendingRules += ((b.counts && b.counts.candidate) || 0); });

  var todo = [];
  if (anti.enabled === false) todo.push({ tab: "anti", title: "反八股现在是关的", detail: "打开 antiCliche 开关并保存，15 条结构禁令才会注入。", cta: "去打开" });
  if ((anti.bannedWords || []).length === 0) todo.push({ tab: "anti", title: "禁用词表是空的", detail: "只有 15 条结构禁令在起作用；从本地语料挑几条加进去。", cta: "去补词表" });
  if (pendingRules > 0) todo.push({ tab: "learn", title: "有 " + pendingRules + " 条候选规则等你决定", detail: "逐条看一眼，采纳后写进实验室增强层，再发布到目标预设。", cta: "去审规则" });
  if ((improvements.total || 0) === 0) todo.push({ tab: "bench", title: "还没有教学样本", detail: "在改进工作台改几轮模型输出，学习页的分布拟合才有的比。", cta: "去改几轮" });
  if ((replays.total || 0) === 0) todo.push({ tab: "replay", title: "还没跑过 A/B 回放", detail: "跑一轮就能知道增强模块到底有没有用（默认 ≤10 次调用）。", cta: "去跑一轮" });

  return h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
    Card([
      CardHead("文风实验室 · 现在的状态", [
        h(Badge, { key: "1", on: anti.enabled === true, tip: "tavern-state.json 的 antiCliche 开关" }, "反八股 " + (anti.enabled ? "开" : "关")),
        h(Badge, { key: "2", tip: "bannedWords 词条数" }, "禁用词 " + ((anti.bannedWords || []).length) + " 条"),
        h(Badge, { key: "3", tip: "预设注册表里的预设数（含实验室）" }, "预设 " + presets.length + " 个"),
        h(Badge, { key: "4", on: pendingRules > 0, tip: "还没决定采纳/否决的候选规则" }, "待审规则 " + pendingRules + " 条"),
        h(Badge, { key: "5", tip: "你在工作台存下的改进样本数（教学信号）" }, "教学样本 " + (improvements.total || 0) + " 条"),
        h(Badge, { key: "6", tip: "A/B 回放跑过的轮数" }, "回放 " + (replays.total || 0) + " 轮"),
      ]),
      h(HelpLine, { key: "n" }, "实验室目录：" + (lab.workspace || "—") + "｜备份目录：" + ((overview && overview.doctor && overview.doctor.backupRoot) || "—")),
    ]),

    Card([
      CardHead("下一步（按重要性）"),
      todo.length === 0 ? Empty("没什么待办了。想继续打磨就去「学习与比对」看分布拟合，或跑一轮 A/B 对比。") :
        h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, todo.map((t, i) =>
          h("div", { key: i, style: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", borderTop: i === 0 ? "none" : "0.5px solid var(--dsw-alias-border-l2)", paddingTop: i === 0 ? 0 : "6px" } }, [
            h("span", { key: "t", style: { fontWeight: 600, fontSize: "12.5px", flex: "1 1 200px" } }, t.title),
            h("span", { key: "d", style: S.sub }, t.detail),
            h(Btn, { key: "g", primary: true, tip: "跳到「" + t.title + "」对应的标签页", onClick: () => go(t.tab) }, t.cta),
          ]))),
    ]),

    h(ScanCard, { key: "scan" }),
  );
}

/** 文本体检的状态钩子（ScanTab 直接调用；HomeTab 里由 ScanCard 包一层）。 */
function useScanState() {
  var st = React.useState({ text: "", res: null, busy: false, err: null });
  var s = st[0]; var set = st[1];
  function scan() {
    if (String(s.text || "").trim() === "") { set(Object.assign({}, s, { err: "先粘一段文字进来" })); return; }
    set(Object.assign({}, s, { busy: true, err: null }));
    api("POST", "/analyze", { text: s.text }).then((res) => {
      if (res.ok) set(Object.assign({}, s, { busy: false, res: res.data }));
      else set(Object.assign({}, s, { busy: false, err: res.code + ": " + res.error + hostHint(res) }));
    });
  }
  return { s: s, set: set, scan: scan };
}

/** 文本体检卡（无 hook，可被直接调用渲染）。 */
function ScanBody(state) {
  var s = state.s; var set = state.set; var scan = state.scan;
  var d = s.res;
  return Card([
    CardHead("文本体检（粘一段，立刻打分）", [
      d ? h(Badge, { key: "1", tip: "字数" }, d.chars + " 字") : null,
      d ? h(Badge, { key: "2", tip: "句子数" }, d.sentences + " 句") : null,
    ], [
      h(Btn, { key: "go", primary: true, onClick: scan, disabled: s.busy, tip: "对下面这段文字跑一次指标：分数、八股命中、句长、对白比。纯计算，不调模型，免费" }, s.busy ? "体检中…" : "体检这段文字"),
      h(Btn, { key: "cl", tip: "清空文本与结果", onClick: () => set({ text: "", res: null, busy: false, err: null }) }, "清空"),
      h(FocusBtn, {
        key: "fs",
        label: "⛶ 全屏粘贴",
        tip: "在整窗大的编辑框里粘贴/编辑（应用后仍要点「体检」）",
        makeSpec: () => ({
          title: "文本体检 · 粘贴正文",
          subtitle: "改完点「应用到表单」，再回这里点「体检」",
          mode: "edit",
          value: s.text,
          saveLabel: "应用到表单",
          onSave: (v) => { set(Object.assign({}, s, { text: v })); return "已应用到表单"; },
        }),
      }),
    ]),
    h(Area, {
      key: "a",
      value: s.text,
      onChange: (v) => set(Object.assign({}, s, { text: v })),
      style: { minHeight: "140px" },
      placeholder: "把模型输出或你喜欢的文章片段贴进来…",
      tip: "建议 200 字以上，太短句长/对白比不稳定",
    }),
    MsgLine({ err: s.err }),
    d === null ? h(HelpLine, { key: "h" }, "这台打分器和「改进工作台」用的是同一套指标：分数越高越干净、八股命中越少越好。不调模型、不花钱。") : h("div", { key: "res", style: { display: "flex", flexDirection: "column", gap: "8px" } }, [
      h(MetricRow, {
        key: "m",
        items: [
          { value: d.score, label: "分数（0-100，越高越干净）", tone: scoreTone(d.score), tip: "100 - 八股惩罚 + 结构加成。≥80 干净，60-79 一般，<60 八股重" },
          { value: d.aiHits.total, label: "八股命中（越少越好）", tone: hitTone(d.aiHits.total), tip: "命中禁用套话模式的次数。0 最好，≥4 建议改写" },
          { value: d.avgSentence, label: "平均句长（字）", tone: "neutral", tip: "短句多节奏快；没有绝对好坏，看目标文风" },
          { value: (d.dialogueRatio * 100).toFixed(0) + "%", label: "对白比", tone: "neutral", tip: "对白引号内容占全文比例" },
          { value: d.avgParagraphChars !== undefined ? d.avgParagraphChars : d.avgParagraph, label: "平均段落（字）", tone: "neutral", tip: "段落越长越容易出现长句堆叠" },
        ],
      }),
      (d.aiHitList || []).length === 0 ? Empty("没有命中任何八股模式。") : Table(["命中的八股模式", "次数", "示例"],
        (d.aiHitList || []).map((hit) => [
          hit.name,
          String(hit.count),
          h("span", { key: "s", style: S.mono }, hit.samples ? hit.samples.join(" / ") : ""),
        ])),
      h(HelpLine, { key: "n" }, "想改写它？把这段贴到「改进工作台」对应轮次里改，保存后就是一条教学样本。"),
    ]),
  ]);
}

/** 文本体检的组件壳（给总览页用：h(ScanCard)）。 */
function ScanCard(props) {
  return ScanBody(useScanState());
}

/** 文本体检标签页（直接渲染体检卡，免多一层组件）。 */
function ScanTab(props) {
  return ScanBody(useScanState());
}
