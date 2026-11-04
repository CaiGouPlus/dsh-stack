/**
 * 文风实验室 · 客户端源码 · 60-tab-learn
 * ─────────────────────────────────────────────────────────────
 * 标签页「学习与比对」：候选规则采纳 → 写入实验室增强层；成果浏览（out/）；自我比对；备份回滚。
 * 可读性要点：规则一行摘要 + 折叠正文；状态可筛选；回滚先出确认条；分布差距带刻度解释。
 */

function LearnTab(props) {
  var buckets = useData(() => api("GET", "/rules"), []);
  var sel = React.useState("");
  var bucket = sel[0]; var setBucket = sel[1];
  React.useEffect(function () {
    if (bucket === "" && buckets.data && buckets.data.buckets.length > 0) setBucket(buckets.data.buckets[0].bucket);
  }, [buckets.data]);
  var detail = useData(() => (bucket === "" ? Promise.resolve({ ok: false, error: "未选择桶" }) : api("GET", "/rules/bucket?bucket=" + encodeURIComponent(bucket))), [bucket]);
  var sampleSel = React.useState({ bucket: "", count: 3 });
  var sample = sampleSel[0]; var setSample = sampleSel[1];
  var cmp = useData(() => api("GET", "/compare?bucket=" + encodeURIComponent(bucket) + "&sampleBucket=" + encodeURIComponent(sample.bucket) + "&sampleSessions=" + sample.count), [bucket, sample.bucket, sample.count]);
  var backups = useData(() => api("GET", "/backups"), []);
  var outputs = useData(() => api("GET", "/lab/outputs"), []);
  var msg = React.useState({ err: null, ok: null });
  var m = msg[0]; var setMsg = msg[1];
  var editSel = React.useState(null);
  var edit = editSel[0]; var setEdit = editSel[1];
  var filterSel = React.useState("all");
  var filter = filterSel[0]; var setFilter = filterSel[1];
  var querySel = React.useState("");
  var query = querySel[0]; var setQuery = querySel[1];
  var rbSel = React.useState(null);
  var rollbackTarget = rbSel[0]; var setRollbackTarget = rbSel[1];
  var docSel = React.useState(null);
  var doc = docSel[0]; var setDoc = docSel[1];

  function startEdit(rule) {
    setEdit({ id: rule.id, name: rule.name, rule: rule.rule || "", bad: rule.bad || "", good: rule.good || "", check: rule.check || "" });
  }
  function saveEdit() {
    if (edit === null) return;
    api("POST", "/rules/update", { bucket: bucket, id: edit.id, patch: { name: edit.name, rule: edit.rule, bad: edit.bad, good: edit.good, check: edit.check } }).then((res) => {
      if (res.ok) { setMsg({ err: null, ok: "已保存规则正文（备份：" + (res.data.backup ? res.data.backup.id : "无") + "）" }); setEdit(null); detail.reload(); }
      else setMsg({ err: res.error, ok: null });
    });
  }
  function setStatus(id, status) {
    api("POST", "/rules/update", { bucket: bucket, id: id, patch: { status: status } }).then((res) => {
      if (res.ok) { setMsg({ err: null, ok: "已" + (status === "accepted" ? "采纳" : status === "rejected" ? "否决" : "重置") }); detail.reload(); buckets.reload(); }
      else setMsg({ err: res.error, ok: null });
    });
  }
  function toPreset() {
    api("POST", "/rules/to-preset", { bucket: bucket }).then((res) => {
      if (res.ok) { setMsg({ err: null, ok: "已写入实验室增强层：新增 " + res.data.added + " / 更新 " + res.data.updated + "（备份 " + (res.data.backup ? res.data.backup.id : "无") + "）" }); props.reloadOverview && props.reloadOverview(); }
      else setMsg({ err: res.error, ok: null });
    });
  }
  function rollback(id) {
    setRollbackTarget(null);
    api("POST", "/rollback", { id: id }).then((res) => {
      if (res.ok) { setMsg({ err: null, ok: "已回滚 " + id + "（该文件恢复到备份时的状态）" }); backups.reload(); detail.reload(); }
      else setMsg({ err: res.error, ok: null });
    });
  }
  function importRules() {
    api("POST", "/rules/import", {}).then((res) => {
      if (res.ok) {
        const lines = res.data.report.map((r) => (r.ok ? r.file + "→" + r.bucket + "（新增 " + r.added + "）" : r.file + " 跳过：" + r.error));
        setMsg({ err: null, ok: "扫描 " + res.data.files + " 个文件；" + (lines.join("；") || "目录为空") });
        buckets.reload(); detail.reload();
      } else setMsg({ err: res.error, ok: null });
    });
  }
  function openDoc(file) {
    api("GET", "/lab/output?file=" + encodeURIComponent(file)).then((res) => {
      if (res.ok) setDoc({ file: file, text: res.data.content });
      else setMsg({ err: "读取 " + file + " 失败：" + res.error + hostHint(res), ok: null });
    });
  }

  var rules = (detail.data && detail.data.rules) || [];
  var qLower = query.trim().toLowerCase();
  var shown = rules.filter((r) => {
    if (filter === "candidate" && r.status !== "candidate") return false;
    if (filter === "accepted" && r.status !== "accepted") return false;
    if (filter === "rejected" && r.status !== "rejected") return false;
    if (qLower === "") return true;
    return String(r.name || "").toLowerCase().indexOf(qLower) >= 0 || String(r.rule || "").toLowerCase().indexOf(qLower) >= 0;
  });

  return h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
    /* ① 候选规则 */
    Card([
      CardHead("候选规则（实验室自我总结 / 改进稿差异归纳）", [
        (buckets.data ? buckets.data.buckets : []).map((b) =>
          h(Badge, { key: b.bucket, on: b.bucket === bucket, tip: "切到「" + b.bucket + "」桶" }, b.bucket + "：候选 " + b.counts.candidate + " / 采纳 " + b.counts.accepted)),
      ], [
        h(Btn, { key: "imp", primary: true, onClick: importRules, tip: "扫描 lab-workspace\\out\\rules\\*.json，把新的候选规则收进库里（去重）" }, "从 out\\rules 导入候选规则"),
        h(Btn, { key: "rl", onClick: () => { buckets.reload(); detail.reload(); }, tip: "重新读取规则库" }, "刷新"),
      ]),
      h("div", { key: "b2", style: S.bar }, (buckets.data ? buckets.data.buckets : []).map((b) =>
        h("button", { key: b.bucket, type: "button", style: b.bucket === bucket ? S.tabOn : S.tab, title: "切到「" + b.bucket + "」桶", onClick: () => setBucket(b.bucket) }, b.bucket))),
      h(HelpLine, { key: "n" }, "流程：用「文风实验室」预设分析语料 → 产出 out\\rules → 这里导入 → 逐条采纳 → 写入实验室增强层 → 到「增强层 / 发布」页发布到目标预设。"),
      MsgLine({ err: m.err, ok: m.ok }),
    ]),

    detail.data === null ? null : Card([
      CardHead("规则清单 · " + bucket, [
        h(Badge, { key: "1", tip: "这个桶的规则总数" }, "规则 " + rules.length),
        h(Badge, { key: "2", tip: "采纳后可以转成增强层模块" }, "已采纳 " + rules.filter((r) => r.status === "accepted").length),
        h(Badge, { key: "3", tip: "已采纳规则对应的增强层模块数" }, "可发布模块 " + detail.data.acceptedModules.length),
      ], [
        h(Btn, { key: "w", primary: true, onClick: toPreset, tip: "把已采纳的规则转成 ✨增强丨 模块写进「文风实验室」预设的增强层（写前自动备份）" }, "采纳的规则 → 写入实验室增强层"),
      ]),
      h(ListToolbar, { key: "q", query: query, onQuery: setQuery, placeholder: "搜规则名/正文…", count: shown.length }),
      h(Segmented, {
        key: "f",
        value: filter,
        onChange: setFilter,
        options: [
          { value: "all", label: "全部", tip: "显示所有状态的规则" },
          { value: "candidate", label: "只看候选", tip: "还没决定的规则" },
          { value: "accepted", label: "只看已采纳", tip: "会转成增强层模块的规则" },
          { value: "rejected", label: "只看已否决", tip: "已否决，不再采纳" },
        ],
      }),
      shown.length === 0 ? Empty(rules.length === 0 ? "该桶还没有规则。" : "没有符合筛选的规则。") : shown.map((rule) => h(ItemRow, {
        key: rule.id,
        title: rule.name,
        summary: "置信 " + rule.confidence + " · " + String(rule.rule || "").slice(0, 40) + (String(rule.rule || "").length > 40 ? "…" : ""),
        previewHint: "规则三件套（硬规则/示例/判定）",
        badges: [
          h(Badge, { key: "s", on: rule.status === "accepted", tip: rule.status === "accepted" ? "已采纳：会转成增强层模块" : rule.status === "rejected" ? "已否决：不会转成模块" : "候选：等你决定" }, rule.status === "accepted" ? "已采纳" : rule.status === "rejected" ? "已否决" : "候选"),
        ],
        actions: [
          h(Btn, { key: "a", primary: true, tip: "采纳：标记为可用，之后「写入实验室增强层」会带上它", onClick: () => setStatus(rule.id, "accepted") }, "采纳"),
          h(Btn, { key: "r", tip: "否决：不再考虑这条规则（可再改回候选）", onClick: () => setStatus(rule.id, "rejected") }, "否决"),
          h(Btn, { key: "e", tip: "改这条规则的正文（硬规则/示例/判定）", onClick: () => startEdit(rule) }, edit && edit.id === rule.id ? "编辑中…" : "编辑正文"),
        ],
      }, [
        h("div", { key: "body", style: S.bubble }, rule.rule + (rule.bad || rule.good ? "\n违反：" + (rule.bad || "—") + "\n正确：" + (rule.good || "—") : "") + (rule.check ? "\n判定：" + rule.check : "")),
        h("div", { key: "acts", style: { display: "flex", gap: "6px", flexWrap: "wrap" } }, [
          h(FocusBtn, {
            key: "fs", label: "⛶ 全屏查看",
            tip: "整窗查看这条规则的三件套",
            makeSpec: () => ({
              title: rule.name,
              subtitle: "候选规则 · 置信 " + rule.confidence,
              mode: "view",
              value: rule.rule + "\n\n违反示例：" + (rule.bad || "—") + "\n\n正确示例：" + (rule.good || "—") + "\n\n判定：" + (rule.check || "—"),
            }),
          }),
          rule.status !== "candidate" ? h(Btn, { key: "reset", tip: "改回候选状态", onClick: () => setStatus(rule.id, "candidate") }, "改回候选") : null,
        ]),
        edit && edit.id === rule.id ? h("div", { key: "editor", style: { display: "flex", flexDirection: "column", gap: "6px", border: "0.5px solid var(--dsw-alias-border-l3)", borderRadius: "10px", padding: "8px" } }, [
          Field("模块名（✨增强丨 前缀会自动补）", Input({ value: edit.name, onChange: (v) => setEdit(Object.assign({}, edit, { name: v })) })),
          Field("硬规则（一句话，可判定）", h(Area, { value: edit.rule, style: { minHeight: "60px" }, onChange: (v) => setEdit(Object.assign({}, edit, { rule: v })) })),
          Field("违反示例", h(Area, { value: edit.bad, style: { minHeight: "48px" }, onChange: (v) => setEdit(Object.assign({}, edit, { bad: v })) })),
          Field("正确示例", h(Area, { value: edit.good, style: { minHeight: "48px" }, onChange: (v) => setEdit(Object.assign({}, edit, { good: v })) })),
          Field("判定（逐句自查方法）", h(Area, { value: edit.check, style: { minHeight: "48px" }, onChange: (v) => setEdit(Object.assign({}, edit, { check: v })) })),
          h("div", { key: "acts", style: { display: "flex", gap: "8px" } }, [
            h(Btn, { key: "s", primary: true, onClick: saveEdit, tip: "保存这条规则的正文（只改候选规则库；转模块要再点「写入实验室增强层」）" }, "保存正文"),
            h(Btn, { key: "c", onClick: () => setEdit(null), tip: "放弃这次编辑" }, "取消"),
          ]),
        ]) : null,
      ])),
      detail.data.versions.length > 1 ? h(Fold, { key: "v", title: "版本历史", summary: detail.data.versions.length + " 个版本" },
        Table(["#", "时间", "来源", "规则数", "备注"], detail.data.versions.map((v) => [String(v.index), when(v.at), v.source, String(v.count), v.note || ""]))) : null,
    ]),

    /* ② 成果浏览（lab-workspace/out） */
    Card([
      CardHead("实验室成果（lab-workspace\\out\\）", [
        outputs.data && outputs.data.entries ? h(Badge, { key: "1", tip: "报告 / 风格卡 / 候选规则 / 已发布归档的文件数" }, outputs.data.entries.length + " 份成果") : null,
      ], [
        h(Btn, { key: "rl", onClick: outputs.reload, tip: "重新扫描 out\\ 目录下的成果文件" }, "刷新"),
      ]),
      outputs.phase === "loading" ? Note("load", "扫描成果目录…") : null,
      outputs.phase === "error" ? Fail("err", "读取成果失败：" + outputs.error + hostHint(outputs)) : null,
      outputs.data !== null && (outputs.data.entries || []).length === 0 ? Empty("还没有成果。把语料给「文风实验室」预设分析后，报告/风格卡/候选规则会出现在这里。") : null,
      outputs.data !== null && (outputs.data.entries || []).length > 0 ? Table(["文件", "类型", "时间", ""],
        (outputs.data.entries || []).slice(0, 30).map((e) => [
          h("span", { key: "f", style: S.mono }, e.file),
          e.kind,
          when(e.at),
          h(Btn, { key: "v", tip: "在下方预览这份成果", onClick: () => openDoc(e.file) }, "预览"),
        ])) : null,
      doc === null ? null : h(Fold, { key: "doc", title: "预览：" + doc.file, summary: doc.text.length + " 字", defaultOpen: true }, [
        h("div", { key: "a", style: { display: "flex", gap: "6px", flexWrap: "wrap" } }, [
          h(CopyBtn, { key: "cp", label: "复制全文", getText: () => doc.text, tip: "复制这份成果的全文" }),
          h(FocusBtn, {
            key: "fs", label: "⛶ 全屏查看",
            tip: "整窗查看这份成果",
            makeSpec: () => ({ title: doc.file, subtitle: doc.text.length + " 字", mode: "view", value: doc.text }),
          }),
          h(Btn, { key: "x", tip: "关闭预览", onClick: () => setDoc(null) }, "关闭预览"),
        ]),
        h(Pre, { key: "p", text: doc.text }),
      ]),
    ]),

    /* ③ 自我比对 */
    cmp.data === null ? null : Card([
      CardHead("自我比对（你的改进稿 vs 模型输出的分布）", [
        h(Badge, { key: "1", tip: "你保存过的改进样本数" }, "改进样本 " + cmp.data.improvements.improvements),
        h(Badge, { key: "2", tip: "改后分数比原文平均高多少（正数 = 你的改法更干净）" }, "平均分数提升 " + cmp.data.improvements.scoreDeltaAvg),
        cmp.data.distance ? h(Badge, { key: "3", tip: "两组文本的分布距离：0 = 完全一致，越小越像你的文风" }, "分布距离 " + cmp.data.distance.distance) : h(Badge, { key: "3" }, "分布距离：样本不足"),
      ]),
      h("div", { key: "picker", style: { display: "flex", flexDirection: "column", gap: "6px", borderTop: "0.5px solid var(--dsw-alias-border-l2)", paddingTop: "8px" } }, [
        h(HelpLine, { key: "l" }, "抽样设置：模型输出取自哪个桶、取几个会话（目标分布固定 = 你的改进稿）"),
        h("div", { key: "chips", style: S.bar }, [
          h("button", { key: "__default", type: "button", style: sample.bucket === "" ? S.tabOn : S.tab, title: "用当前规则桶的会话做样本", onClick: () => setSample({ bucket: "", count: sample.count }) }, "跟随规则桶（默认）"),
          (cmp.data.sampleBuckets || []).map((b) => h("button", { key: b.key, type: "button", style: sample.bucket === b.key ? S.tabOn : S.tab, title: "用「" + b.key + "」桶的会话做样本", onClick: () => setSample({ bucket: b.key, count: sample.count }) }, b.key + "（" + b.count + " 会话）")),
        ]),
        h("div", { key: "counts", style: S.bar }, [
          h("span", { key: "l", style: S.sub }, "抽样会话数："),
          [1, 3, 5, 10].map((n) => h("button", { key: n, type: "button", style: sample.count === n ? S.tabOn : S.tab, title: "取 " + n + " 个会话的模型输出做样本", onClick: () => setSample({ bucket: sample.bucket, count: n }) }, String(n))),
          h("span", { key: "used", style: S.sub }, "本次用了 " + ((cmp.data.usedSessions || []).length) + " 个会话 / " + (cmp.data.sampleCounts ? cmp.data.sampleCounts.samples : 0) + " 段模型输出"),
        ]),
      ]),
      cmp.data.improvements.removedPatterns.length === 0 ? Empty("还没有改进样本，先在工作台改几轮。") : Table(["你最常消灭的八股", "次数"], cmp.data.improvements.removedPatterns.map((x) => [x.key, String(x.count)])),
      cmp.data.distance ? Table(["维度", "目标(你的改进)", "当前(模型输出)", "差距"], cmp.data.distance.rows.map((r) => [
        r.key,
        String(r.target),
        String(r.sample),
        h("span", { key: "g", style: Math.abs(Number(r.gap)) <= 0.2 ? S.good : S.warn, title: "差距越小越像你的文风；|差距| ≤ 0.2 算基本拟合" }, String(r.gap)),
      ])) : null,
      cmp.data.improvements.byTag.length === 0 ? null : Table(["问题标签", "次数"], cmp.data.improvements.byTag.map((x) => [x.key, String(x.count)])),
    ]),

    /* ④ 备份与回滚 */
    backups.data === null ? null : Card([
      CardHead("备份与回滚（每次写入前自动备份）", [
        h(Badge, { key: "1", tip: "插件 data\\backups\\ 里的备份份数" }, (backups.data.backups || []).length + " 份备份"),
      ]),
      (backups.data.backups || []).length === 0 ? Empty("还没有备份。") : Table(["时间", "文件", "标签", "大小", ""],
        backups.data.backups.slice(0, 25).map((b) => [
          when(b.at),
          h("span", { key: "f", style: S.mono, title: b.original }, b.original.split(/[\\/]/).slice(-2).join("/")),
          b.label,
          kb(b.size),
          h(Btn, {
            key: "r", danger: true,
            tip: "把这份文件恢复到备份时的状态（当前内容会先再备份一份，仍然可撤）",
            onClick: () => setRollbackTarget(b),
          }, "回滚"),
        ])),
      rollbackTarget === null ? null : h(ConfirmBar, {
        key: "cf",
        title: "回滚「" + rollbackTarget.label + "」？",
        detail: "将把 " + rollbackTarget.original.split(/[\\/]/).slice(-2).join("/") + " 恢复到 " + when(rollbackTarget.at) + " 的状态。当前内容会先自动备份（两步都可再撤）。其他文件不受影响。",
        confirmLabel: "确认回滚",
        onConfirm: () => rollback(rollbackTarget.id),
        onCancel: () => setRollbackTarget(null),
      }),
    ]),
  );
}
