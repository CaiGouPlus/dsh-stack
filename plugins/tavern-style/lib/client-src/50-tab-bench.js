/**
 * 文风实验室 · 客户端源码 · 50-tab-bench
 * ─────────────────────────────────────────────────────────────
 * 标签页「改进工作台」：逐轮读模型输出 → 改写 → 存改进样本（绝不回写会话日志）。
 * 可读性要点：会话可搜索；轮次折叠；改稿用 diff 对照（原文 vs 你的改法）；长文可 ⛶ 全屏。
 */

function BenchTab(props) {
  var list = useData(() => api("GET", "/sessions?limit=80"), []);
  var sel = React.useState(null);
  var session = sel[0]; var setSession = sel[1];
  var detail = useData(() => (session === null ? Promise.resolve({ ok: false, error: "未选择会话" }) : api("GET", "/session?dir=" + encodeURIComponent(session.dir) + "&file=" + encodeURIComponent(session.file))), [session]);
  var editor = React.useState({ seq: null, text: "", note: "", tags: [], msg: null, err: null, diff: null, busy: false, showDiff: true });
  var ed = editor[0]; var setEd = editor[1];
  var query = React.useState("");
  var q = query[0]; var setQ = query[1];
  var TAGS = ["八股", "AI味", "出戏", "抢话", "视角越界", "太长", "重复", "结尾升华", "节奏", "用词"];

  function openAssistant(turn, assistant) {
    setEd({
      seq: assistant.seq,
      text: assistant.improved ? assistant.improved.improved : assistant.text,
      note: assistant.improved ? assistant.improved.note : "",
      tags: assistant.improved ? assistant.improved.tags || [] : [],
      msg: null, err: null, busy: false, showDiff: true,
      diff: assistant.improved ? { delta: assistant.improved.delta } : null,
      original: assistant.text, turn: turn.turn, step: assistant.step, sessionId: session.sessionId,
    });
  }

  function save() {
    if (ed.seq === null) return;
    setEd(Object.assign({}, ed, { busy: true, err: null, msg: null }));
    api("POST", "/improvement", { sessionId: ed.sessionId, seq: ed.seq, turn: ed.turn, step: ed.step, original: ed.original, improved: ed.text, tags: ed.tags, note: ed.note }).then((res) => {
      if (res.ok) setEd(Object.assign({}, ed, { busy: false, msg: "已保存改进（分数 " + res.data.before.score + " → " + res.data.after.score + "）", diff: { delta: res.data.delta, before: res.data.before, after: res.data.after } }));
      else setEd(Object.assign({}, ed, { busy: false, err: res.code + ": " + res.error }));
    });
    detail.reload();
  }

  function exportMd() {
    api("POST", "/improvement/export", { sessionId: ed.sessionId, seq: ed.seq }).then((res) => {
      setEd(Object.assign({}, ed, res.ok ? { msg: "已导出：" + res.data.file } : { err: res.error }));
    });
  }

  function pushTavern() {
    api("POST", "/improvement/push", { sessionId: ed.sessionId, turnIndex: ed.turn - 1, text: ed.text }).then((res) => {
      setEd(Object.assign({}, ed, res.ok ? { msg: "已推送到酒馆显示层（edited-messages.json）" } : { err: res.error }));
    });
  }

  /** 整会话导出 Markdown（浏览器直接下载，不经磁盘写入）。 */
  function exportSession() {
    if (!detail.data) return;
    var lines = ["# 改进样本 · " + (detail.data.title || detail.data.sessionId), "", "- 会话：" + detail.data.sessionId, "- 预设：" + (detail.data.preset || ""), "- 轮次：" + detail.data.turns.length + "（可改进 " + detail.data.assistantTotal + "，已改进 " + detail.data.improvements + "）", ""];
    detail.data.turns.forEach((turn) => {
      lines.push("## turn " + turn.turn + "（user " + turn.userChars + " 字）");
      if (turn.user) { lines.push("**用户**：", "", turn.user, ""); }
      turn.assistants.forEach((a) => {
        lines.push("### 模型输出 seq " + a.seq + "（" + a.chars + " 字 · 分数 " + a.metrics.score + " · 八股 " + a.metrics.aiHits.total + "）", "");
        if (a.improved) {
          lines.push("**原文**：", "", a.improved.original !== undefined ? a.improved.original : a.text, "", "**你的改进**：", "", a.improved.improved, "", "**标签**：" + ((a.improved.tags || []).join("、") || "无") + "｜**批注**：" + (a.improved.note || "无"), "");
        } else {
          lines.push(a.text, "");
        }
      });
    });
    downloadText("improvements-" + detail.data.sessionId + ".md", lines.join("\n"));
    setEd(Object.assign({}, ed, { msg: "已下载整会话 Markdown", err: null }));
  }

  var sessions = (list.data && list.data.sessions) || [];
  var qLower = q.trim().toLowerCase();
  var filtered = qLower === "" ? sessions : sessions.filter((s) =>
    String(s.sessionId || "").toLowerCase().indexOf(qLower) >= 0
    || String(s.preset || "").toLowerCase().indexOf(qLower) >= 0
    || String(s.workspace || "").toLowerCase().indexOf(qLower) >= 0);

  return h("div", { style: S.split },
    h("div", { key: "left", style: { display: "flex", flexDirection: "column", gap: "8px" } },
      Card([
        CardHead("会话（只含白名单桶）", [h(Badge, { key: "1", tip: "扫过并合格的会话数" }, "共 " + ((list.data && list.data.total) || 0) + " 条")]),
        h(ListToolbar, { key: "q", query: q, onQuery: setQ, placeholder: "搜会话/预设名…", count: filtered.length, tip: "按会话 id、预设名、工作区过滤" }),
        list.phase === "error" ? Err(list.error) : null,
        list.data === null ? Empty("加载中…") : Table(["预设 / 会话", "大小", "时间"], filtered.slice(0, 40).map((s) => [
          h("button", {
            key: "b", type: "button",
            style: s.sessionId === (session && session.sessionId) ? S.itemOn : S.item,
            title: "打开这个会话，逐轮改写模型输出",
            onClick: () => setSession(s),
          }, (s.preset || "").replace("preset-", "") + " · " + s.sessionId.slice(8, 16)),
          kb(s.fileSize), when(s.mtimeMs),
        ])),
        filtered.length > 40 ? HelpLine({ key: "more" }, "只显示前 40 条，用上面的搜索缩小范围。") : null,
        h(HelpLine, { key: "n" }, "只抽 assistant 正文（user 消息仅作场景上下文）。点一个会话开始改。"),
      ])),

    h("div", { key: "right", style: { display: "flex", flexDirection: "column", gap: "10px" } },
      session === null ? Card(Empty("左侧选一个会话，就能逐轮改进模型输出。")) : Card([
        CardHead((detail.data && detail.data.title) || session.sessionId, [
          h(Badge, { key: "1" }, "预设 " + (session.preset || "").replace("preset-", "")),
          h(Badge, { key: "2", tip: "这个会话里的对话轮数" }, "轮次 " + ((detail.data && detail.data.turns.length) || 0)),
          h(Badge, { key: "3", tip: "可以拿来改写的模型正文条数" }, "可改进 " + ((detail.data && detail.data.assistantTotal) || 0)),
          h(Badge, { key: "4", on: ((detail.data && detail.data.improvements) || 0) > 0, tip: "你已经改过并保存的条数（= 教学样本数）" }, "已改进 " + ((detail.data && detail.data.improvements) || 0)),
          h(Badge, { key: "5", tip: "会话日志的解码帧数（坏帧=损坏跳过）" }, "帧 " + ((detail.data && detail.data.frames) || 0) + "（坏 " + ((detail.data && detail.data.badFrames) || 0) + "）"),
        ], [
          h(Btn, { key: "ex", onClick: exportSession, disabled: detail.data === null, tip: "把这个会话的原文/改进稿打包成 Markdown 下载（含指标与标签）" }, "导出整会话 Markdown"),
        ]),
        detail.phase === "error" ? Err(detail.error) : null,
      ]),

      ed.seq === null ? null : Card([
        CardHead("改这一轮（turn " + ed.turn + " / step " + ed.step + "）", [
          h(Badge, { key: "1", tip: "这条模型输出在会话日志里的序号" }, "seq " + ed.seq),
          h(Badge, { key: "2" }, ed.original.length + " 字"),
        ]),
        h("div", { key: "tabs", style: S.bar }, [
          h("button", { key: "d", type: "button", style: ed.showDiff ? S.tabOn : S.tab, title: "左右对照：原文 vs 你的改法（改动高亮）", onClick: () => setEd(Object.assign({}, ed, { showDiff: true })) }, "对照视图"),
          h("button", { key: "e", type: "button", style: ed.showDiff ? S.tab : S.tabOn, title: "只看可编辑的改稿框", onClick: () => setEd(Object.assign({}, ed, { showDiff: false })) }, "编辑视图"),
        ]),
        ed.showDiff
          ? h("div", { key: "cmp", style: { display: "flex", flexDirection: "column", gap: "6px" } }, [
            h("p", { key: "l", style: S.sub }, "模型原文（只读）"),
            h("div", { key: "o", style: Object.assign({}, S.bubble, { maxHeight: "180px" }) }, ed.original),
            h("p", { key: "l2", style: S.sub }, "你的改进（保存即算一次教学样本）"),
            h(Area, { key: "e", value: ed.text, onChange: (v) => setEd(Object.assign({}, ed, { text: v })), style: { minHeight: "180px" }, tip: "直接改写；改完点「保存改进」" }),
            h(DiffView, { key: "df", before: ed.original, after: ed.text, maxHeight: "220px" }),
          ])
          : h("div", { key: "edt", style: { display: "flex", flexDirection: "column", gap: "6px" } }, [
            h("p", { key: "l2", style: S.sub }, "你的改进（保存即算一次教学样本）"),
            h(Area, { key: "e", value: ed.text, onChange: (v) => setEd(Object.assign({}, ed, { text: v })), style: { minHeight: "260px" }, tip: "直接改写；改完点「保存改进」" }),
          ]),
        h("div", { key: "tags", style: { display: "flex", gap: "6px", flexWrap: "wrap" } }, [
          h("span", { key: "l", style: S.sub }, "问题标签："),
        ].concat(TAGS.map((tag) =>
          h("button", {
            key: tag, type: "button",
            style: ed.tags.indexOf(tag) >= 0 ? S.tabOn : S.tab,
            title: ed.tags.indexOf(tag) >= 0 ? "已选中，再点取消" : "标记这一条改掉的主要问题（可多选）",
            onClick: () => {
              var next = ed.tags.slice();
              if (next.indexOf(tag) >= 0) next = next.filter((x) => x !== tag); else next.push(tag);
              setEd(Object.assign({}, ed, { tags: next }));
            },
          }, tag)))),
        Field("批注（可选，给自己留的备注）", Input({ value: ed.note, onChange: (v) => setEd(Object.assign({}, ed, { note: v })), tip: "例如「这里删掉了总结句」" })),
        h("div", { key: "acts", style: { display: "flex", gap: "8px", flexWrap: "wrap" } }, [
          h(Btn, { key: "s", primary: true, onClick: save, disabled: ed.busy, tip: "把改稿存成一条教学样本（存到插件的 data/improvements/，不碰会话日志）；保存后立刻给出分数对比" }, ed.busy ? "保存中…" : "保存改进"),
          h(Btn, { key: "e", onClick: exportMd, tip: "把这一条（原文+改进+标签）导出成 Markdown 文件（data/improvements/ 下）" }, "导出这条 Markdown"),
          h(Btn, { key: "p", onClick: pushTavern, tip: "用你的改稿替换酒馆聊天界面里这条消息的显示（写 edited-messages.json；可逆，属于显示层）" }, "推到酒馆显示层"),
          h(FocusBtn, {
            key: "fs",
            label: "⛶ 全屏改写",
            tip: "在整窗大的编辑框里改写（应用后仍要点「保存改进」）",
            makeSpec: () => ({
              title: "改这一轮 · turn " + ed.turn + "（seq " + ed.seq + "）",
              subtitle: ed.original.length + " 字原文 · 全屏改完点「应用到表单」",
              mode: "edit",
              value: ed.text,
              saveLabel: "应用到表单",
              onSave: (v) => { setEd(Object.assign({}, ed, { text: v })); return "已应用到表单（还没保存）"; },
            }),
          }),
          h(Btn, { key: "c", tip: "收起编辑器（不保存）", onClick: () => setEd(Object.assign({}, ed, { seq: null })) }, "关闭"),
        ]),
        MsgLine({ err: ed.err, ok: ed.msg }),
        ed.diff === null ? null : h(MetricRow, {
          key: "m",
          items: [
            { value: ed.diff.before.score + " → " + ed.diff.after.score, label: "分数（越高越好）", tone: scoreTone(ed.diff.after.score), tip: "综合分：100 - 八股惩罚 + 结构加成。改后更高 = 更像你要的文风" },
            { value: ed.diff.before.aiHits.total + " → " + ed.diff.after.aiHits.total, label: "八股命中（越少越好）", tone: hitTone(ed.diff.after.aiHits.total), tip: "命中禁用套话模式的次数。0 最好" },
            { value: ed.diff.before.avgSentence + " → " + ed.diff.after.avgSentence, label: "平均句长（字）", tone: "neutral", tip: "句长没有绝对好坏，看你要的节奏" },
          ],
        }),
        ed.diff && ed.diff.before && ed.diff.after ? HelpLine({ key: "rm" }, "被消灭的八股：" + ((ed.diff.before.aiHitList || []).filter((hh) => !(ed.diff.after.aiHits.byPattern || {})[hh.name]).map((hh) => hh.name).join("、") || "（无）")) : null,
      ]),

      detail.data === null ? null : detail.data.turns.map((turn) => h(Card, { key: turn.turn }, [
        CardHead("turn " + turn.turn, [
          h(Badge, { key: "1", tip: "这一轮用户消息的字数" }, "user " + turn.userChars + " 字"),
          h(Badge, { key: "2", tip: "这一轮里可以改写的模型正文条数" }, "模型输出 " + turn.assistants.length + " 条"),
        ]),
        turn.user ? h(Fold, { key: "u", title: "用户消息（场景上下文 · 只读）", summary: turn.userChars + " 字" },
          h("div", { style: Object.assign({}, S.bubble, { maxHeight: "160px" }) }, turn.user)) : null,
        turn.assistants.length === 0 ? Empty("该轮没有可改进的模型正文。") : turn.assistants.map((a) => h(ItemRow, {
          key: a.seq,
          title: "模型输出 seq " + a.seq,
          summary: a.chars + " 字 · 分数 " + a.metrics.score + " · 八股 " + a.metrics.aiHits.total + (a.improved ? " · 已改进" : ""),
          previewHint: "看这条输出 / 改写",
          badges: [
            h(Badge, { key: "1", tip: "综合分（越高越好，≥80 算干净）", on: a.metrics.score >= 80 }, "分数 " + a.metrics.score),
            h(Badge, { key: "2", tip: "八股命中次数（越少越好，0 最佳）", on: a.metrics.aiHits.total <= 0 }, "八股 " + a.metrics.aiHits.total),
            a.improved ? h(Badge, { key: "3", on: true, tip: "你已经改过这条" }, "已改进 Δ" + (a.improved.delta ? a.improved.delta.score : 0)) : null,
          ].filter(Boolean),
          actions: [
            h(Btn, { key: "e", primary: true, tip: a.improved ? "继续改这条（会覆盖上一次的改进稿）" : "打开编辑器改写这条（保存后成为教学样本）", onClick: () => openAssistant(turn, a) }, a.improved ? "继续改" : "改进这一轮"),
          ],
        }, [
          h("div", { key: "t", style: S.bubble }, a.improved ? a.improved.improved : a.text),
          a.improved ? h(HelpLine, { key: "n" }, "标签：" + ((a.improved.tags || []).join("、") || "无") + "｜批注：" + (a.improved.note || "无")) : null,
        ])),
      ])),
    ));
}
