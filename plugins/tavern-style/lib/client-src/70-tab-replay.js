/**
 * 文风实验室 · 客户端源码 · 70-tab-replay
 * ─────────────────────────────────────────────────────────────
 * 标签页「A/B 回放」：固定场景 × 两臂 × 限量真实调用，量出增强模块到底有没有用。
 * 按钮语义要点（这一页按钮最多、最贵）：三步编号 ①存场景 ②预估（免费）③执行（真实调用）；
 * 每个按钮都写清「干什么、要不要调模型」。
 */

function ReplayTab(props) {
  var presets = ((props.overview && props.overview.presets && props.overview.presets.presets) || []);
  var targets = presets.filter((x) => !x.isLab);
  var st = React.useState({
    target: "", modulesPreset: "style-lab", maxCalls: 10, maxTokens: 600, temperature: 0.9,
    priceInput: 0, priceOutput: 0, scenes: [], mtimeMs: null,
    estimate: null, result: null, busy: false, confirm: false, err: null, ok: null, fromExtract: false,
  });
  var s = st[0]; var set = st[1];

  React.useEffect(function () {
    if (s.target === "" && targets.length > 0) set(Object.assign({}, s, { target: targets[0].id || targets[0].dir }));
  }, [targets.length]);

  var loaded = useData(() => (s.target === "" ? Promise.resolve({ ok: false, error: "未选择目标预设" }) : api("GET", "/replay/fixtures?target=" + encodeURIComponent(s.target))), [s.target]);
  var history = useData(() => api("GET", "/replay/history"), []);

  React.useEffect(function () {
    if (loaded.data && loaded.data.scenes) set((prev) => Object.assign({}, prev, {
      scenes: loaded.data.scenes.map((x) => ({ id: x.id, title: x.title, system: x.system, prompt: x.prompt })),
      mtimeMs: loaded.data.mtimeMs, fromExtract: false, estimate: null, confirm: false,
    }));
  }, [loaded.data]);

  function mutateScene(i, patch) {
    set(Object.assign({}, s, { scenes: s.scenes.map((x, k) => (k === i ? Object.assign({}, x, patch) : x)) }));
  }
  function addScene() {
    set(Object.assign({}, s, { scenes: s.scenes.concat([{ id: "scene-" + (s.scenes.length + 1), title: "场景 " + (s.scenes.length + 1), system: "", prompt: "" }]) }));
  }
  function dropScene(i) {
    set(Object.assign({}, s, { scenes: s.scenes.filter((x, k) => k !== i) }));
  }

  function saveFixtures() {
    set(Object.assign({}, s, { busy: true, err: null, ok: null }));
    api("POST", "/replay/fixtures", { target: s.target, scenes: s.scenes, expectedMtimeMs: s.mtimeMs }).then((res) => {
      if (res.ok) set(Object.assign({}, s, { busy: false, mtimeMs: res.data.mtimeMs, fromExtract: false, ok: "夹具已保存（" + res.data.scenes.length + " 个场景；备份 " + (res.data.backup ? res.data.backup.id : "无") + "）" }));
      else set(Object.assign({}, s, { busy: false, err: res.code + ": " + res.error }));
    });
  }

  function extractScenes() {
    set(Object.assign({}, s, { busy: true, err: null, ok: null }));
    api("POST", "/replay/fixtures/extract", { bucket: s.target, limit: 5 }).then((res) => {
      if (res.ok) {
        var scenes = res.data.scenes || [];
        set(Object.assign({}, s, { busy: false, scenes: scenes, fromExtract: true, estimate: null, confirm: false, ok: "从该桶 " + res.data.scanned + " 个会话抓到 " + scenes.length + " 个真实开场（只取 user 消息；未保存，可编辑后再存）" }));
      } else set(Object.assign({}, s, { busy: false, err: res.code + ": " + res.error }));
    });
  }

  function doEstimate() {
    set(Object.assign({}, s, { busy: true, err: null, ok: null, confirm: false }));
    api("POST", "/replay/estimate", { target: s.target, scenes: s.scenes, modulesPreset: s.modulesPreset, maxCalls: s.maxCalls, maxTokens: s.maxTokens, priceInput: Number(s.priceInput) || 0, priceOutput: Number(s.priceOutput) || 0 }).then((res) => {
      if (res.ok) set(Object.assign({}, s, { busy: false, estimate: res.data }));
      else set(Object.assign({}, s, { busy: false, err: res.code + ": " + res.error }));
    });
  }

  function askRun() {
    var live = s.scenes.filter((x) => String(x.prompt || "").trim() !== "");
    if (live.length === 0) { set(Object.assign({}, s, { err: "先准备至少一个带 prompt 的场景（保存夹具或抓取场景）" })); return; }
    set(Object.assign({}, s, { confirm: true, err: null, ok: null }));
  }

  function doRun() {
    set(Object.assign({}, s, { busy: true, err: null, ok: null, confirm: false }));
    api("POST", "/replay/run", {
      confirm: true, target: s.target, scenes: s.scenes, modulesPreset: s.modulesPreset,
      maxCalls: s.maxCalls, maxTokens: s.maxTokens, temperature: Number(s.temperature),
    }).then((res) => {
      if (res.ok) {
        set(Object.assign({}, s, { busy: false, result: res.data.record, ok: "回放完成：" + res.data.record.plan.calls + " 次调用（记录 " + res.data.record.id + "）" }));
        history.reload();
      } else set(Object.assign({}, s, { busy: false, err: res.code + ": " + res.error }));
    });
  }

  function loadRecord(id) {
    api("GET", "/replay/record?id=" + encodeURIComponent(id)).then((res) => {
      if (res.ok) set(Object.assign({}, s, { result: res.data.record, ok: "已载入历史记录 " + id, err: null }));
      else set(Object.assign({}, s, { err: res.error, ok: null }));
    });
  }

  /** 导出结论 Markdown（浏览器下载）。 */
  function exportConclusion() {
    var r = s.result;
    if (r === null) return;
    var lines = [
      "# A/B 回放结论 · " + r.id, "",
      "- 时间：" + when(r.at),
      "- 目标预设：" + r.target + "｜B 臂增强块来源：" + (r.modulesPreset || "—"),
      "- 模型：" + (r.model ? r.model.model : "默认") + "｜调用 " + r.plan.calls + " 次",
      "- A 均分（无增强块）：" + r.arms.a.avgScore + "｜B 均分（带增强块）：" + r.arms.b.avgScore,
      "- Δ分数：" + fmtDelta(r.arms.delta.score) + "｜Δ八股：" + fmtDelta(r.arms.delta.aiHits) + "（越负越好）",
      "",
      "## 结论", "",
      r.arms.delta.score > 0
        ? "带增强块的 B 臂更接近目标文风（分数 +" + r.arms.delta.score + "，八股 " + fmtDelta(r.arms.delta.aiHits) + "），增强模块**有效**。"
        : "B 臂没有比 A 臂更好（Δ分数 " + fmtDelta(r.arms.delta.score) + "），增强模块在这批场景上**未见效**，建议调整模块或换场景再测。",
      "",
      "## 逐场景", "",
      "| 场景 | A 分数 | A 八股 | B 分数 | B 八股 | Δ分数 | Δ八股 |", "|---|---|---|---|---|---|---|",
    ];
    r.rows.forEach((row) => lines.push("| " + row.title + " | " + row.a.score + " | " + row.a.aiHits + " | " + row.b.score + " | " + row.b.aiHits + " | " + fmtDelta(row.delta.score) + " | " + fmtDelta(row.delta.aiHits) + " |"));
    lines.push("", "## 两臂输出对照", "");
    r.rows.forEach((row) => {
      lines.push("### " + row.title, "", "**A 臂（无增强块，" + row.a.chars + " 字）**", "", row.a.text || "（空）", "", "**B 臂（带增强块，" + row.b.chars + " 字）**", "", row.b.text || "（空）", "");
    });
    downloadText("ab-conclusion-" + r.id + ".md", lines.join("\n"));
    set(Object.assign({}, s, { ok: "已下载结论 Markdown（ab-conclusion-" + r.id + ".md）", err: null }));
  }

  var live = s.scenes.filter((x) => String(x.prompt || "").trim() !== "");

  return h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
    /* ① 说明与配置 */
    Card([
      CardHead("A/B 回放：同一批场景，两臂对比，量出增强模块有没有用", [
        h(Badge, { key: "1", tip: "两臂 = 同一场景跑两遍：A 不带增强块，B 带增强块" }, "两臂对照"),
        h(Badge, { key: "2", tip: "每次执行最多发起的真实模型调用次数" }, "调用上限 " + s.maxCalls + " 次"),
      ]),
      h(HelpLine, { key: "d" }, "A 臂 = 裸模型直接写；B 臂 = 把所选预设的启用模块拼进 system 再写。同一个评分器给两臂打分，看分数与八股命中差多少 —— 差值就是增强模块的净效果。"),
      h("div", { key: "legend", style: { display: "flex", flexDirection: "column", gap: "2px", border: "0.5px dashed var(--dsw-alias-border-l2)", borderRadius: "8px", padding: "8px 10px" } }, [
        h("p", { key: "t", style: S.sub }, "这一页的操作顺序（只有 ③ 会调模型花钱）："),
        h("p", { key: "1", style: S.sub }, "① 准备测试场景（手写或从会话抓）→ 点「保存场景」"),
        h("p", { key: "2", style: S.sub }, "② 点「预估成本」—— 只算 token 不调模型，免费"),
        h("p", { key: "3", style: S.sub }, "③ 点「执行 A/B 回放」→ 弹确认后才真实调用（默认 ≤10 次，硬上限 20）"),
      ]),
      h("div", { key: "target", style: S.bar }, [
        h("span", { key: "l", style: S.sub }, "测试跑在哪个预设上："),
        targets.map((x) => h("button", { key: x.id || x.dir, type: "button", style: (x.id || x.dir) === s.target ? S.tabOn : S.tab, title: "夹具与回放都归属「" + x.name + "」", onClick: () => set(Object.assign({}, s, { target: x.id || x.dir })) }, x.name)),
      ]),
      h("div", { key: "arm", style: S.bar }, [
        h("span", { key: "l", style: S.sub }, "B 臂用哪套增强块："),
        presets.map((x) => h("button", { key: x.dir, type: "button", style: x.dir === s.modulesPreset ? S.tabOn : S.tab, title: "B 臂会拼进「" + x.name + "」里所有启用的模块", onClick: () => set(Object.assign({}, s, { modulesPreset: x.dir })) }, x.name + (x.isLab ? "（实验室）" : ""))),
      ]),
      h("div", { key: "cfg", style: { display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" } }, [
        Field("调用上限（两臂各半）", h("div", { style: S.bar }, [5, 10, 20].map((n) => h("button", { key: n, type: "button", style: s.maxCalls === n ? S.tabOn : S.tab, title: "这一轮最多发起 " + n + " 次真实调用（A/B 各一半）", onClick: () => set(Object.assign({}, s, { maxCalls: n })) }, String(n) + " 次"))), "20 是硬上限"),
        Field("单次输出上限（tokens）", Input({ value: String(s.maxTokens), onChange: (v) => set(Object.assign({}, s, { maxTokens: Number(v) || 0 })), tip: "每次生成最多写多少 token；越大越慢越贵" })),
        Field("temperature", Input({ value: String(s.temperature), onChange: (v) => set(Object.assign({}, s, { temperature: v })), tip: "0 = 最稳，1 = 更发散；两臂用同一个值才公平" })),
        Field("单价（输入/百万 tokens）", Input({ value: String(s.priceInput), onChange: (v) => set(Object.assign({}, s, { priceInput: v })), tip: "填 0 = 只报 token 量不算钱" })),
        Field("单价（输出/百万 tokens）", Input({ value: String(s.priceOutput), onChange: (v) => set(Object.assign({}, s, { priceOutput: v })), tip: "填 0 = 只报 token 量不算钱" })),
      ]),
    ]),

    /* ② 场景 */
    Card([
      CardHead("测试场景（" + live.length + " 个可跑）", [
        h(Badge, { key: "1", tip: "带 prompt 的场景才会被跑（两臂各一次）" }, "可跑 " + live.length + " 个"),
        s.fromExtract ? h(Badge, { key: "w", on: true, tip: "这些场景是从会话抓来的，还没写进夹具文件" }, "抓取结果未保存") : null,
      ], [
        h(Btn, { key: "add", onClick: addScene, tip: "手写一个测试场景：给一段开场 prompt，两臂各写一次续写" }, "＋ 新增测试场景"),
        h(Btn, { key: "ex", onClick: extractScenes, disabled: s.busy, tip: "从最近会话里抓真实的用户开场做场景（只读 user 消息；抓完不保存，可改）" }, "从最近会话抓真实开场"),
        h(Btn, { key: "sv", primary: true, onClick: saveFixtures, disabled: s.busy, tip: "把当前场景存进夹具文件 data\\fixtures\\（带备份的原子写），下次打开还在" }, "① 保存场景"),
        h(Btn, { key: "rl", onClick: loaded.reload, tip: "丢弃未保存的场景改动，从夹具文件重读" }, "放弃改动并重读"),
      ]),
      loaded.phase === "error" ? Fail("loaderr", loaded.error) : null,
      s.scenes.length === 0 ? Empty("还没有场景。手动新增，或从最近会话抓真实开场。") : s.scenes.map((scene, i) => h(ItemRow, {
        key: scene.id + "-" + i,
        title: scene.title,
        summary: (String(scene.prompt || "").trim() === "" ? "⚠️ 缺 prompt（不会被跑）" : String(scene.prompt).length + " 字 prompt"),
        previewHint: "编辑场景",
        actions: [
          h(Btn, { key: "rm", danger: true, tip: "删掉这个场景（保存夹具后才写盘）", onClick: () => dropScene(i) }, "删除"),
        ],
      }, [
        Field("标题", Input({ value: scene.title, onChange: (v) => mutateScene(i, { title: v }), tip: "场景名，结果表里显示它" })),
        Field("system（两臂共用；B 臂会在其后拼增强块）", h(Area, { value: scene.system, style: { minHeight: "48px" }, onChange: (v) => mutateScene(i, { system: v }), tip: "可留空。写角色设定/世界观，两臂看到的一样" })),
        Field("prompt（场景开场，必填）", h(Area, { value: scene.prompt, style: { minHeight: "72px" }, onChange: (v) => mutateScene(i, { prompt: v }), tip: "用户开场白：两臂分别接这句写一段，用来对比文风" })),
        h("div", { key: "fs", style: { display: "flex", gap: "6px", flexWrap: "wrap" } }, [
          h(FocusBtn, {
            key: "f1", label: "⛶ 全屏改 prompt",
            tip: "在整窗大的编辑框里改这个场景的开场（应用后仍要点「① 保存场景」）",
            makeSpec: () => ({
              title: scene.title + " · prompt",
              subtitle: "场景开场 · 应用后仍要点「① 保存场景」",
              mode: "edit",
              value: scene.prompt,
              saveLabel: "应用到表单",
              onSave: (v) => { mutateScene(i, { prompt: v }); return "已应用到表单（还没保存）"; },
            }),
          }),
        ]),
      ])),
      h(HelpLine, { key: "n" }, "夹具落点：data\\fixtures\\<目标>.json（带备份的原子写）。抓取只读会话的 user 消息，绝不碰 assistant 正文与会话日志。"),
    ]),

    /* ③ 成本预估与执行 */
    Card([
      CardHead("预估与执行", [
        h(Badge, { key: "1", tip: "只有「执行」会调模型；预估是纯计算" }, "只有执行会花钱"),
      ]),
      h("div", { key: "acts", style: { display: "flex", gap: "8px", flexWrap: "wrap" } }, [
        h(Btn, { key: "est", primary: true, onClick: doEstimate, disabled: s.busy, tip: "只算这一轮要发多少次调用、多少 token、大概多少钱 —— 不调模型，免费" }, "② 预估成本（免费，不调模型）"),
        h(Btn, { key: "run", primary: true, onClick: askRun, disabled: s.busy || s.confirm, tip: "真实调用模型跑 A/B 两臂（这是唯一花钱的动作，会先弹确认）" }, s.busy ? "执行中…" : "③ 执行 A/B 回放（真实调用）"),
      ]),
      s.confirm ? h(ConfirmBar, {
        key: "cf",
        title: "确认发起 " + Math.min(s.maxCalls, live.length * 2) + " 次真实模型调用？",
        detail: "两臂各 " + Math.min(Math.floor(s.maxCalls / 2), live.length) + " 次，用模型「" + (s.estimate && s.estimate.model && s.estimate.model.model ? s.estimate.model.model : "默认模型") + "」。" + (s.estimate && s.estimate.cost ? "按你填的单价，预估费用 " + s.estimate.cost.total + s.estimate.cost.currency + "。" : "未填单价，只报 token 量。") + "这是本插件唯一会产生 API 消耗的动作。",
        confirmLabel: "确认执行",
        confirmTip: "真的开始调模型",
        onConfirm: doRun,
        onCancel: () => set(Object.assign({}, s, { confirm: false })),
      }) : null,
      MsgLine({ err: s.err, ok: s.ok }),
      s.estimate === null ? Empty("先点「② 预估成本」看这一轮要花多少。") : h("div", { key: "est", style: { display: "flex", flexDirection: "column", gap: "6px" } }, [
        h(MetricRow, {
          key: "m",
          items: [
            { value: s.estimate.plan.calls + " 次", label: "实际调用（上限 " + s.estimate.plan.maxCalls + "）", tone: "neutral", tip: "每个场景 A/B 各一次，直到用完上限" },
            { value: "≈" + s.estimate.estInputTokens, label: "输入 tokens", tone: "neutral", tip: "两臂合计的输入 token 估算" },
            { value: "≤" + s.estimate.estOutputTokens, label: "输出 tokens 上限", tone: "neutral", tip: "按单次输出上限 × 调用次数" },
            { value: s.estimate.cost ? s.estimate.cost.total + s.estimate.cost.currency : "—", label: "预估费用", tone: s.estimate.cost ? "warn" : "neutral", tip: s.estimate.cost ? "按你填的单价估算" : "没填单价，只报 token 量" },
          ],
        }),
        h(HelpLine, { key: "m2" }, "模型：" + (s.estimate.model.provider ? s.estimate.model.provider + " / " + s.estimate.model.model : "默认模型（执行时解析）") + "｜输出上限 " + s.estimate.maxTokensPerCall + " tokens/次｜增强块 " + s.estimate.moduleBlockChars + " 字（B 臂比 A 臂多出来的输入）"),
        Table(["场景", "A 臂输入 tokens", "B 臂输入 tokens"], s.estimate.rows.map((r) => [r.title, String(r.inputA), String(r.inputB)])),
      ]),
    ]),

    /* ④ 结果 */
    s.result === null ? null : Card([
      CardHead("回放结果 · " + s.result.id, [
        h(Badge, { key: "1", tip: "A 臂（无增强块）的平均分" }, "A 均分 " + s.result.arms.a.avgScore),
        h(Badge, { key: "2", on: s.result.arms.delta.score > 0, tip: "B 臂（带增强块）的平均分" }, "B 均分 " + s.result.arms.b.avgScore),
        h(Badge, { key: "3", on: s.result.arms.delta.score > 0, tip: "正数 = 带增强块更好" }, "Δ分数 " + fmtDelta(s.result.arms.delta.score)),
        h(Badge, { key: "4", on: s.result.arms.delta.aiHits < 0, tip: "负数 = 带增强块的八股更少（更好）" }, "Δ八股 " + fmtDelta(s.result.arms.delta.aiHits)),
        h(Badge, { key: "5" }, "调用 " + s.result.plan.calls + " 次"),
      ], [
        h(Btn, { key: "ex", onClick: exportConclusion, tip: "把这轮结论（含逐场景对照与两臂全文）导出成 Markdown 下载" }, "导出结论 Markdown"),
        h(Btn, { key: "cp", tip: "复制一段话的结论（可直接贴给我讨论）", onClick: () => copyText("A/B 回放 " + s.result.id + "：A 均分 " + s.result.arms.a.avgScore + "，B 均分 " + s.result.arms.b.avgScore + "，Δ分数 " + fmtDelta(s.result.arms.delta.score) + "，Δ八股 " + fmtDelta(s.result.arms.delta.aiHits) + "。" + (s.result.arms.delta.score > 0 ? "增强模块有效。" : "增强模块未见效。")) }, "复制一句话结论"),
      ]),
      h("div", { key: "verdict", style: Object.assign({}, S.confirm, { borderColor: s.result.arms.delta.score > 0 ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-state-warning-primary, #d97706)" }) },
        s.result.arms.delta.score > 0
          ? "结论：带增强块的 B 臂更接近目标文风（分数 +" + s.result.arms.delta.score + "，八股 " + fmtDelta(s.result.arms.delta.aiHits) + "），增强模块**有效**。"
          : "结论：B 臂没有比 A 臂更好（Δ分数 " + fmtDelta(s.result.arms.delta.score) + "），增强模块在这批场景上未见效 —— 换场景再测，或去「增强层 / 发布」调整模块。"),
      s.result.distance ? h(HelpLine, { key: "dist" }, "分布距离（越小越像你的改进稿）：A " + s.result.distance.a.distance + " / B " + s.result.distance.b.distance) : null,
      Table(["场景", "A 分数", "A 八股", "B 分数", "B 八股", "Δ分数", "Δ八股"], s.result.rows.map((r) => [
        r.title, String(r.a.score), String(r.a.aiHits), String(r.b.score), String(r.b.aiHits),
        h("span", { key: "d", style: r.delta.score > 0 ? S.good : S.err, title: "正数 = B 臂（带增强块）更好" }, fmtDelta(r.delta.score)),
        h("span", { key: "d2", style: r.delta.aiHits < 0 ? S.good : S.err, title: "负数 = B 臂八股更少（更好）" }, fmtDelta(r.delta.aiHits)),
      ])),
      s.result.rows.map((r) => h(Fold, { key: r.id, title: r.title + " · 两臂输出对照", summary: "A " + r.a.chars + " 字 / B " + r.b.chars + " 字" },
        h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, [
          h("p", { key: "la", style: S.sub }, "A 臂（无增强块，" + r.a.chars + " 字）" + (r.a.error ? "｜出错：" + r.a.error : "")),
          h("div", { key: "a", style: S.bubble }, r.a.text || "（空）"),
          h("p", { key: "lb", style: S.sub }, "B 臂（带增强块，" + r.b.chars + " 字）" + (r.b.error ? "｜出错：" + r.b.error : "")),
          h("div", { key: "b2", style: S.bubble }, r.b.text || "（空）"),
          h("div", { key: "fs", style: { display: "flex", gap: "6px", flexWrap: "wrap" } }, [
            h(FocusBtn, {
              key: "f", label: "⛶ 全屏对照",
              tip: "整窗并排看两臂写的同一场景",
              makeSpec: () => ({
                title: r.title + " · 两臂输出对照",
                subtitle: "A 臂无增强块 / B 臂带增强块",
                mode: "node",
                node: [
                  h("p", { key: "la", style: S.sub }, "A 臂（无增强块，" + r.a.chars + " 字）"),
                  h("div", { key: "a", style: Object.assign({}, S.bubble, { maxHeight: "none", flex: "1 1 auto" }) }, r.a.text || "（空）"),
                  h("p", { key: "lb", style: S.sub }, "B 臂（带增强块，" + r.b.chars + " 字）"),
                  h("div", { key: "b2", style: Object.assign({}, S.bubble, { maxHeight: "none", flex: "1 1 auto" }) }, r.b.text || "（空）"),
                ],
              }),
            }),
          ]),
        ]))),
    ]),

    /* ⑤ 历史 */
    history.data === null ? null : Card([
      CardHead("回放历史（data\\replays\\）", [
        h(Badge, { key: "1", tip: "跑过的回放轮数" }, ((history.data.replays || []).length) + " 轮"),
      ]),
      (history.data.replays || []).length === 0 ? Empty("还没有回放记录。") : Table(["时间", "目标", "模型", "调用", "A 均分", "B 均分", "Δ", ""],
        history.data.replays.slice(0, 20).map((r) => [
          when(r.at), r.target, r.model ? r.model.model : "—", String(r.calls), String(r.aScore), String(r.bScore),
          h("span", { key: "d", style: r.deltaScore > 0 ? S.good : S.err, title: "正数 = 带增强块更好" }, fmtDelta(r.deltaScore)),
          h(Btn, { key: "v", tip: "把这轮结果载入到上方结果区查看", onClick: () => loadRecord(r.id) }, "载入查看"),
        ])),
    ]),
  );
}
