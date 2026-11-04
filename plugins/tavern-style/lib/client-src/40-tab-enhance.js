/**
 * 文风实验室 · 客户端源码 · 40-tab-enhance
 * ─────────────────────────────────────────────────────────────
 * 标签页「增强层 / 发布」：预设模块正文编辑器 + 内置模块包 + 运行时块镜像 + 发布通道。
 * 可读性要点：模块默认折叠成一行摘要；正文可 ⛶ 全屏编辑；批量/覆盖/删除类动作先出确认条。
 */

function EnhanceTab(props) {
  var presets = (props.overview && props.overview.presets && props.overview.presets.presets) || [];
  var sel = React.useState("");
  var dir = sel[0]; var setDir = sel[1];
  React.useEffect(function () {
    if (dir === "" && presets.length > 0) setDir(presets[0].dir);
  }, [presets.length]);

  var loaded = useData(() => (dir === "" ? Promise.resolve({ ok: false, error: "未选择预设" }) : api("GET", "/preset?dir=" + encodeURIComponent(dir))), [dir]);
  var edit = React.useState(null);
  var draft = edit[0]; var setDraft = edit[1];
  var msg = React.useState({ err: null, ok: null, busy: false });
  var m = msg[0]; var setMsg = msg[1];

  React.useEffect(function () {
    if (loaded.data) setDraft({
      mtimeMs: loaded.data.mtimeMs,
      groups: loaded.data.groups.map((g) => ({
        name: g.name,
        collapsed: g.collapsed,
        modules: g.modules.map((x) => ({ name: x.name, content: x.content, enabled: x.enabled, protected: x.protected })),
      })),
    });
  }, [loaded.data]);

  var pub = React.useState({ targets: [], overwrite: false, plan: null, busy: false, err: null, ok: null, confirm: false });
  var p = pub[0]; var setPub = pub[1];
  var tvState = React.useState(null);
  var tv = tvState[0]; var setTv = tvState[1];
  var TV_RE = /\{\{[^}]{0,80}\}\}/gu;
  /** 危险动作确认：{kind:'delete-group'|'apply-all', ...} */
  var cfState = React.useState(null);
  var cf = cfState[0]; var setCf = cfState[1];

  var pack = useData(() => api("GET", "/enhance/pack"), []);
  var apState = React.useState({ picked: null, overwrite: false, groupIndex: 0, busy: false, err: null, ok: null, editing: null, edit: {} });
  var ap = apState[0]; var setAp = apState[1];

  React.useEffect(function () {
    if (pack.data && ap.picked === null) {
      var all = {};
      (pack.data.modules || []).forEach((mod) => { all[mod.name] = true; });
      setAp((prev) => (prev.picked === null ? Object.assign({}, prev, { picked: all }) : prev));
    }
  }, [pack.data]);
  function togglePack(name, on) {
    var next = Object.assign({}, ap.picked || {});
    if (on) next[name] = true; else delete next[name];
    setAp(Object.assign({}, ap, { picked: next, ok: null, err: null }));
  }
  /** names=null → 全部套用；names=[...] → 只套用这些模块。 */
  function applyPack(names, label) {
    setCf(null);
    if (dir === "") { setAp(Object.assign({}, ap, { err: "未选择预设", ok: null })); return; }
    setAp(Object.assign({}, ap, { busy: true, err: null, ok: null }));
    api("POST", "/enhance/apply", { dir: dir, names: names, overwrite: ap.overwrite === true, groupIndex: ap.groupIndex, expectedMtimeMs: loaded.data ? loaded.data.mtimeMs : null }).then((res) => {
      if (res.ok) {
        var d = res.data; var counts = d.stat || {};
        setAp(Object.assign({}, ap, {
          busy: false,
          ok: label + " → 写入「" + d.groupName + "」：新增 " + counts.added + " / 覆盖 " + counts.overwritten + " / 保留同名 " + counts.kept
            + (counts.protectedKept > 0 ? " / 受保护跳过 " + counts.protectedKept : "")
            + "；该分组现有 " + d.total + " 个模块；备份 " + (d.backup ? d.backup.id : "无（原文件不存在）"),
        }));
        loaded.reload(); props.reloadOverview && props.reloadOverview();
      } else setAp(Object.assign({}, ap, { busy: false, ok: null, err: res.code + ": " + res.error }));
    });
  }
  var pickedNames = Object.keys(ap.picked || {});

  /* ── 内置包模块的行内编辑：编辑「改过的副本」，保存进当前预设（绝不写回内置包） ── */
  function startPackEdit(mod) {
    var cur = ap.edit || {};
    setAp(Object.assign({}, ap, { editing: mod.name, edit: Object.assign({}, cur, { [mod.name]: cur[mod.name] !== undefined ? cur[mod.name] : mod.content }), ok: null, err: null }));
  }
  function setPackEdit(name, text) {
    setAp(Object.assign({}, ap, { edit: Object.assign({}, ap.edit || {}, { [name]: text }), ok: null, err: null }));
  }
  function cancelPackEdit(name) {
    var next = Object.assign({}, ap.edit || {});
    delete next[name];
    setAp(Object.assign({}, ap, { edit: next, editing: null, ok: null, err: null }));
  }
  function savePackEdit(mod) {
    if (dir === "") { setAp(Object.assign({}, ap, { ok: null, err: "未选择预设，先在上方点一个预设" })); return; }
    var content = (ap.edit || {})[mod.name];
    if (typeof content !== "string") return;
    setAp(Object.assign({}, ap, { busy: true, ok: null, err: null }));
    api("GET", "/preset?dir=" + encodeURIComponent(dir)).then((res) => {
      if (!res.ok) { setAp(Object.assign({}, ap, { busy: false, ok: null, err: res.code + ": " + res.error })); return; }
      var groups = (res.data.groups || []).map((g) => ({ name: g.name, collapsed: g.collapsed, modules: (g.modules || []).map((mm) => ({ name: mm.name, content: mm.content, enabled: mm.enabled })) }));
      if (groups.length === 0) groups.push({ name: "通用增强", collapsed: false, modules: [] });
      var found = false;
      groups.forEach((g) => (g.modules || []).forEach((mm) => { if (mm.name === mod.name) { mm.content = content; found = true; } }));
      if (!found) groups[0].modules.push({ name: mod.name, content: content, enabled: true, protected: false });
      api("POST", "/preset", { dir: dir, groups: groups, expectedMtimeMs: res.data.mtimeMs, templateVarPolicy: "keep" }).then((r2) => {
        if (r2.ok) {
          var next = Object.assign({}, ap.edit || {});
          delete next[mod.name];
          var tvHits = String(content).match(TV_RE) || [];
          setAp(Object.assign({}, ap, {
            busy: false, editing: null, edit: next, err: null,
            ok: "已把「" + mod.name + "」的修改版写入预设" + (found ? "（同名覆盖）" : "（新增）")
              + "（备份：" + (r2.data.backup ? r2.data.backup.id : "无") + "）；内置包文件未改动"
              + (tvHits.length > 0 ? "；含 {{…}} 模板变量 " + tvHits.length + " 处，已保留原文" : ""),
          }));
          loaded.reload(); props.reloadOverview && props.reloadOverview();
        } else setAp(Object.assign({}, ap, { busy: false, ok: null, err: r2.code + ": " + r2.error }));
      });
    });
  }

  function findTemplateVars() {
    var found = [];
    (draft && draft.groups ? draft.groups : []).forEach((g) => (g.modules || []).forEach((mod) => {
      var matches = String(mod.content || "").match(TV_RE) || [];
      if (matches.length > 0) found.push({ name: mod.name, count: matches.length, samples: matches.slice(0, 3) });
    }));
    return found;
  }

  function mutateDraft(fn) {
    setDraft((prev) => {
      if (prev === null) return prev;
      var next = { mtimeMs: prev.mtimeMs, groups: prev.groups.map((g) => ({ name: g.name, collapsed: g.collapsed, modules: g.modules.map((x) => Object.assign({}, x)) })) };
      fn(next);
      return next;
    });
  }

  /** policy: "clean"（按酒馆规则剔除 {{…}}）| "keep"（保留原文）。不带 policy 且检测到模板变量 → 先弹确认。 */
  function save(policy) {
    if (draft === null) return;
    if (policy === undefined) {
      var hits = findTemplateVars();
      if (hits.length > 0) { setTv({ hits: hits }); return; }
      policy = "keep";
    }
    setTv(null);
    setMsg({ busy: true, err: null, ok: null });
    api("POST", "/preset", { dir: dir, groups: draft.groups, expectedMtimeMs: draft.mtimeMs, templateVarPolicy: policy }).then((res) => {
      if (res.ok) {
        var tvr = res.data.templateVars || [];
        var tvCount = tvr.reduce((n, g) => n + (g.module || []).reduce((k, mm) => k + (mm.count || 0), 0), 0);
        var tvNote = tvCount > 0 ? "；模板变量 " + tvCount + " 处" + (res.data.templateVarPolicy === "clean" ? "（已按酒馆规则清洗）" : "（已保留原文）") : "";
        setMsg({ busy: false, err: null, ok: "已写入（备份：" + (res.data.backup ? res.data.backup.id : "无") + "）" + tvNote });
        loaded.reload(); props.reloadOverview && props.reloadOverview();
      }
      else setMsg({ busy: false, ok: null, err: res.code + ": " + res.error });
    });
  }

  function previewPublish() {
    setPub(Object.assign({}, p, { busy: true, err: null, ok: null }));
    api("POST", "/publish/preview", { targets: p.targets, overwrite: p.overwrite }).then((res) => {
      if (res.ok) setPub(Object.assign({}, p, { busy: false, plan: res.data }));
      else setPub(Object.assign({}, p, { busy: false, err: res.code + ": " + res.error }));
    });
  }

  function applyPublish() {
    if (p.plan === null) return;
    var expected = {};
    for (const item of p.plan.plan) expected[item.dir] = item.target.mtimeMs;
    setPub(Object.assign({}, p, { busy: true, err: null, ok: null, confirm: false }));
    api("POST", "/publish/apply", { targets: p.plan.plan.map((x) => x.dir), overwrite: p.overwrite, expectedMtime: expected }).then((res) => {
      if (res.ok) { setPub(Object.assign({}, p, { busy: false, ok: "已发布到 " + res.data.results.length + " 个预设" })); loaded.reload(); props.reloadOverview && props.reloadOverview(); }
      else setPub(Object.assign({}, p, { busy: false, err: res.code + ": " + res.error }));
    });
  }

  return h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
    /* ① 预设选择 */
    Card([
      CardHead("通用增强层编辑器（酒馆的「⚙️ 预设模块」）", [
        loaded.data ? h(Badge, { key: "1", tip: "当前预设的模块总数与启用数" }, "模块 " + loaded.data.stats.total + "（启用 " + loaded.data.stats.enabled + "）") : null,
        loaded.data ? h(Badge, { key: "2", tip: "按 1 字 ≈ 0.67 token 粗估的注入开销" }, "约 " + loaded.data.stats.tokens + " tokens") : null,
        loaded.data ? h(Badge, { key: "3", tip: "受保护模块（变量/格式/era）不可改不可删，防止把酒馆的格式契约改坏" }, "受保护 " + loaded.data.stats.protected) : null,
      ]),
      h("div", { key: "b", style: S.bar }, presets.map((preset) =>
        h("button", {
          key: preset.dir,
          type: "button",
          style: preset.dir === dir ? S.tabOn : S.tab,
          title: "切换到「" + preset.name + "」的模块表（未保存的改动会被丢弃）",
          onClick: () => setDir(preset.dir),
        }, preset.name + "（" + preset.modules.total + "）" + (preset.isLab ? " · 实验室" : "")))),
      loaded.phase === "error" ? Fail("loaderr", loaded.error) : null,
      loaded.data ? h("span", { key: "f", style: S.mono }, loaded.data.file) : null,
    ]),

    /* ② 模块正文编辑器（折叠列表） */
    draft === null ? Card(Empty("选择一个预设以编辑它的模块。")) : draft.groups.length === 0 ? h(Card, { key: "nogroup" }, [
      CardHead("模块正文编辑 · 这个预设还没有分组"),
      Note("none", "从下面的「内置增强层模块包」点「编辑正文 → 保存到当前预设」自动建组，或先建一个空分组从零写。"),
      h("div", { key: "a", style: { display: "flex", gap: "8px" } }, [
        h(Btn, { key: "g", tip: "新建一个空分组，然后往里加模块", onClick: () => mutateDraft((d) => { d.groups.push({ name: "通用增强", collapsed: false, modules: [] }); }) }, "＋ 新增分组"),
      ]),
    ]) : draft.groups.map((group, gi) => h(Card, { key: "g" + gi }, [
      CardHead("模块正文编辑 · 分组：" + group.name, [
        h(Badge, { key: "n", tip: "该分组里的模块数" }, group.modules.length + " 个模块"),
        h(Badge, { key: "e", tip: "已启用（会注入提示词）的模块数" }, "启用 " + group.modules.filter((x) => x.enabled).length),
      ], [
        h(Btn, { key: "a", tip: "往该分组加一个新模块（默认不启用，改完正文再启用）", onClick: () => mutateDraft((d) => { d.groups[gi].modules.push({ name: "✨增强丨文风·新模块", content: "【硬规则】…", enabled: false, protected: false }); }) }, "＋ 新增模块"),
        h(Btn, { key: "g", tip: "再建一个空分组（模块可以按主题分组管理）", onClick: () => mutateDraft((d) => { d.groups.push({ name: "通用增强", collapsed: false, modules: [] }); }) }, "＋ 新增分组"),
        h(Btn, {
          key: "rm", danger: true,
          tip: "删掉整个分组和里面的模块（未保存前可以「放弃改动并重读」恢复）",
          onClick: () => setCf({ kind: "delete-group", gi: gi, name: group.name, count: group.modules.length }),
        }, "删除该分组"),
      ]),
      group.modules.length === 0 ? Note("empty", "该分组还没有模块。用右上「＋ 新增模块」，或从下面的内置模块包保存进来。") : group.modules.map((mod, mi) => h(ItemRow, {
        key: mi,
        title: mod.name,
        summary: (mod.content || "").length + " 字 · " + (mod.enabled ? "启用中" : "已停用"),
        previewHint: "查看/编辑正文",
        badges: [
          h(Badge, { key: "p", on: mod.protected, tip: mod.protected ? "受保护：变量/格式/era 类模块，不可改不可删（会破坏酒馆的注入契约）" : "普通模块，可改可删" }, mod.protected ? "🔒 受保护" : (mod.enabled ? "启用" : "关闭")),
        ],
        actions: [
          h(Btn, { key: "tg", tip: mod.enabled ? "停用：不再注入提示词（正文保留）" : "启用：注入提示词", disabled: mod.protected, onClick: () => mutateDraft((d) => { d.groups[gi].modules[mi].enabled = !d.groups[gi].modules[mi].enabled; }) }, mod.enabled ? "停用" : "启用"),
          h(Btn, { key: "rm", danger: true, tip: "从该分组删除这个模块（保存后写盘；保存前可「放弃改动并重读」）", disabled: mod.protected, onClick: () => mutateDraft((d) => { d.groups[gi].modules.splice(mi, 1); }) }, "删除"),
        ],
      }, [
        h(Area, { key: "body", value: mod.content, style: { minHeight: "110px" }, tip: "直接改正文；改完记得点下面的「保存到酒馆」", onChange: (v) => mutateDraft((d) => { d.groups[gi].modules[mi].content = v; }) }),
        h("div", { key: "acts", style: { display: "flex", gap: "8px", flexWrap: "wrap" } }, [
          h(FocusBtn, {
            key: "fs",
            label: "⛶ 全屏编辑",
            tip: "在整窗大的编辑框里改这个模块（应用后仍要点「保存到酒馆」）",
            makeSpec: () => ({
              title: mod.name,
              subtitle: "分组：" + group.name + " · 全屏改完点「应用到表单」，再回这里保存",
              mode: "edit",
              value: draft.groups[gi].modules[mi].content,
              saveLabel: "应用到表单",
              onSave: (v) => { mutateDraft((d) => { d.groups[gi].modules[mi].content = v; }); return "已应用到表单（还没写盘）"; },
            }),
          }),
          h(CopyBtn, { key: "cp", label: "复制正文", getText: () => draft.groups[gi].modules[mi].content, tip: "把这个模块的正文复制到剪贴板" }),
        ]),
      ])),
    ])),

    /* ③ 保存操作条 */
    draft === null ? null : Card([
      CardHead("保存到酒馆（写 " + dir + " 的 presets.json）", [
        h(Badge, { key: "1", tip: "保存会整组替换 presets.json 的模块数组；写前自动备份" }, "分组 " + draft.groups.length),
        h(Badge, { key: "2", tip: "本次草稿里的模块总数" }, "模块 " + draft.groups.reduce((n, g) => n + g.modules.length, 0)),
      ], [
        h(Btn, { key: "sv", primary: true, onClick: () => save(), disabled: m.busy, tip: "把上面的全部改动写进该预设的 presets.json：写前自动备份 + mtime 冲突检查 + 回读校验；受保护模块会被跳过" }, m.busy ? "写入中…" : "保存到酒馆"),
        h(Btn, { key: "rl", onClick: loaded.reload, tip: "丢弃所有未保存改动，从文件重新读取（不可撤销）" }, "放弃改动并重读"),
      ]),
      tv === null ? null : h("div", { key: "tv", style: S.confirm }, [
        h("p", { key: "t", style: S.h }, "检测到模板变量 {{…}}（" + tv.hits.reduce((n, x) => n + x.count, 0) + " 处）"),
        h("p", { key: "d", style: S.sub }, "酒馆落盘时会剔除 {{…}}（cleanSillyTavernVars）。要怎么处理？涉及模块：" + tv.hits.map((x) => x.name + "×" + x.count).join("、")),
        h("div", { key: "s", style: S.bar }, (tv.hits[0] ? tv.hits[0].samples : []).map((x, i) => h("span", { key: i, style: S.mono }, x))),
        h("div", { key: "acts", style: { display: "flex", gap: "8px", flexWrap: "wrap" } }, [
          h(Btn, { key: "c", primary: true, tip: "把 {{…}} 变量从正文里删掉再保存（和酒馆落盘行为一致）", onClick: () => save("clean") }, "按酒馆规则清洗并保存"),
          h(Btn, { key: "k", tip: "原样保存 {{…}}（酒馆落盘时仍会剔除）", onClick: () => save("keep") }, "保留原文保存"),
          h(Btn, { key: "x", tip: "不保存，回到编辑", onClick: () => setTv(null) }, "取消"),
        ]),
      ]),
      MsgLine({ err: m.err, ok: m.ok }),
    ]),

    /* ④ 危险动作确认（删除分组 / 全部套用） */
    cf === null ? null : Card(
      cf.kind === "delete-group"
        ? h(ConfirmBar, {
          key: "cg",
          title: "删除分组「" + cf.name + "」（含 " + cf.count + " 个模块）？",
          detail: "这只是删除草稿里的内容，还没写盘；点「保存到酒馆」后才真正写入（写前自动备份，可回滚）。若想撤销：删除后直接点「放弃改动并重读」。",
          confirmLabel: "删除该分组",
          onConfirm: () => { mutateDraft((d) => { d.groups.splice(cf.gi, 1); }); setCf(null); },
          onCancel: () => setCf(null),
        })
        : h(ConfirmBar, {
          key: "ca",
          title: "全部套用内置模块包？",
          detail: "将把内置包 " + (pack.data ? pack.data.modules.length : "?") + " 个模块写进「" + dir + "」的所选分组：" + (ap.overwrite === true ? "⚠️ 你勾了「同名也覆盖」，预设里已改过的同名模块会被内置默认版替换！" : "同名模块保留你的版本，只补缺失的。") + "写前自动备份，可在「学习与比对 → 备份与回滚」撤回。",
          confirmLabel: ap.overwrite === true ? "确认覆盖套用" : "确认套用",
          onConfirm: () => applyPack(null, "全部套用"),
          onCancel: () => setCf(null),
        }),
    ),

    /* ⑤ 内置增强层模块包 */
    h(Card, { key: "pack" }, [
      CardHead("内置增强层模块包（内置文件只读 · 可编辑后存到当前预设）", [
        pack.data !== null && pack.data.exists === true ? h(Badge, { key: "1", tip: "内置包自带的模块数量" }, "模块 " + pack.data.stats.total + "（启用 " + pack.data.stats.enabled + "）") : null,
        pack.data !== null && pack.data.exists === true ? h(Badge, { key: "2", tip: "整包注入开销的粗估" }, "约 " + pack.data.stats.tokens + " tokens") : null,
        pack.data !== null && pack.data.exists === true ? h(Badge, { key: "3", on: pack.data.runtime.mirror.ok, tip: "运行时注入块的镜像是否与酒馆源码一致" }, pack.data.runtime.mirror.ok ? "运行时块镜像已核对" : "运行时块镜像待复核") : null,
      ], [
        h(Btn, { key: "rl", onClick: pack.reload, tip: "重新读取内置包文件（dsh-tavern/lib/preset-enhance-pack.json）" }, "重新读取"),
      ]),
      pack.phase === "loading" ? Note("load", "读取 preset-enhance-pack.json …") : null,
      pack.phase === "error" ? Fail("err", "读取失败：" + pack.error + hostHint(pack)) : null,
      pack.data !== null && pack.data.exists !== true ? Note("none", "读不到内置模块包（dsh-tavern/lib/preset-enhance-pack.json）") : null,
      pack.data !== null && pack.data.exists === true ? h(HelpLine, { key: "n" }, "每条都能改：点「编辑正文」改好后「保存到当前预设」，只写预设的同名模块，内置包文件本身永远不改。勾选后可整批套用到当前预设（当前：" + (dir === "" ? "未选择" : dir) + "）。") : null,
      pack.data !== null && pack.data.exists === true ? h("div", { key: "list", style: { display: "flex", flexDirection: "column", gap: "8px" } }, pack.data.modules.map((mod, i) => {
        var cur = ap.edit || {};
        var editing = ap.editing === mod.name;
        var edited = cur[mod.name] !== undefined && cur[mod.name] !== mod.content;
        return h(ItemRow, {
          key: i,
          title: mod.name,
          summary: mod.chars + " 字 · 点开看正文/编辑",
          previewHint: "内置包正文",
          badges: [
            edited ? h(Badge, { key: "e", on: true, tip: "你改过但还没保存到预设" }, "已改未存") : null,
            mod.protected ? h(Badge, { key: "p", on: true, tip: "受保护：不参与覆盖套用" }, "🔒 受保护") : null,
          ].filter(Boolean),
          actions: [
            h("label", { key: "c", style: { display: "flex", gap: "4px", alignItems: "center", fontSize: "12px", cursor: "pointer" }, title: "勾选后参与「套用选中」批量写入当前预设" },
              [h("input", { key: "i", type: "checkbox", checked: (ap.picked || {})[mod.name] === true, onChange: (e) => togglePack(mod.name, e.target.checked) }), "选"]),
            h(Btn, { key: "ed", primary: true, tip: "改这个模块的正文（改的是副本，保存到当前预设；内置包不动）", onClick: () => startPackEdit(mod) }, edited ? "继续修改" : "编辑正文"),
            h(Btn, { key: "one", tip: "只把这一个模块写进当前预设的同名位置（同名默认保留你的版本）", disabled: ap.busy || dir === "", onClick: () => applyPack([mod.name], "套用「" + mod.name + "」") }, "只套用这一个"),
            h(CopyBtn, { key: "cp", label: "复制正文", getText: () => cur[mod.name] !== undefined ? cur[mod.name] : mod.content, tip: "复制这个模块的正文（含未保存的修改）" }),
          ],
        }, [
          editing
            ? h("div", { key: "e", style: { display: "flex", flexDirection: "column", gap: "6px" } }, [
              h(Area, { key: "a", value: cur[mod.name], style: { minHeight: "160px" }, tip: "改完点「保存到当前预设」；也可以 ⛶ 全屏改", onChange: (v) => setPackEdit(mod.name, v) }),
              h("div", { key: "b", style: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" } }, [
                h(Btn, { key: "save", primary: true, onClick: () => savePackEdit(mod), disabled: ap.busy || dir === "", tip: "写进当前预设的同名模块（同名覆盖 / 没有就新增）；带备份与回读校验；内置包文件不改" }, ap.busy ? "写入中…" : "保存到当前预设"),
                h(Btn, { key: "cancel", tip: "放弃这处修改，恢复内置原文", onClick: () => cancelPackEdit(mod.name) }, "取消"),
                h(FocusBtn, {
                  key: "fs",
                  label: "⛶ 全屏编辑",
                  tip: "在整窗大的编辑框里改（应用后仍要点「保存到当前预设」）",
                  makeSpec: () => ({
                    title: mod.name,
                    subtitle: "内置包副本 · 全屏改完点「应用到表单」",
                    mode: "edit",
                    value: cur[mod.name],
                    saveLabel: "应用到表单",
                    onSave: (v) => { setPackEdit(mod.name, v); return "已应用到表单（还没写盘）"; },
                  }),
                }),
                h("span", { key: "n", style: S.sub }, dir === "" ? "先在上方选一个预设再保存" : "保存到「" + dir + "」：只写预设的同名模块，内置包文件不改。"),
              ]),
            ])
            : h("div", { key: "pre", style: { display: "flex", flexDirection: "column", gap: "6px" } }, [
              h(Pre, { key: "p", text: mod.content }),
              h("div", { key: "a", style: { display: "flex", gap: "6px", flexWrap: "wrap" } }, [
                h(FocusBtn, {
                  key: "fs", label: "⛶ 全屏查看",
                  tip: "整窗查看这个模块的正文",
                  makeSpec: () => ({ title: mod.name, subtitle: mod.chars + " 字 · 只读", mode: "view", value: mod.content }),
                }),
                h(Btn, { key: "ed2", tip: "改这个模块的正文（改的是副本，保存到当前预设）", onClick: () => startPackEdit(mod) }, "编辑正文"),
              ]),
            ]),
        ]);
      })) : null,
      pack.data !== null && pack.data.exists === true ? h("div", { key: "acts", style: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" } }, [
        h(Btn, {
          key: "sel", primary: true, disabled: ap.busy || dir === "" || pickedNames.length === 0,
          tip: "把勾选的模块写进当前预设的所选分组：同名默认保留你的版本，受保护永不覆盖；写前自动备份，可一键回滚",
          onClick: () => applyPack(pickedNames, "套用选中 " + pickedNames.length + " 个模块"),
        }, ap.busy ? "写入中…" : "套用选中（" + pickedNames.length + " 个）到当前预设"),
        h(Btn, {
          key: "all",
          tip: "把内置包全部模块套用到当前预设（恢复内置默认）。会先弹确认",
          onClick: () => setCf({ kind: "apply-all" }),
        }, "全部套用（恢复内置默认）"),
        draft !== null && draft.groups.length > 1 ? h("label", { key: "gi", style: { display: "flex", gap: "6px", alignItems: "center", fontSize: "12.5px" }, title: "套用的模块写进哪个分组" }, [
          "套用到分组：",
          h("select", { key: "s", value: String(ap.groupIndex), onChange: (e) => setAp(Object.assign({}, ap, { groupIndex: Number(e.target.value) })), style: S.input },
            draft.groups.map((group, gi) => h("option", { key: gi, value: String(gi) }, gi + " · " + group.name))),
        ]) : null,
        h("label", { key: "ov", style: { display: "flex", gap: "6px", alignItems: "center", fontSize: "12.5px" }, title: "默认只补缺失模块；勾上后你预设里改过的同名模块会被内置版替换" }, [
          h("input", { key: "c", type: "checkbox", checked: ap.overwrite === true, onChange: (e) => setAp(Object.assign({}, ap, { overwrite: e.target.checked })) }),
          "同名模块也覆盖（危险：会替换你改过的版本）",
        ]),
      ]) : null,
      MsgLine({ err: ap.err, ok: ap.ok }),
    ]),

    /* ⑥ 运行时注入块（折叠） */
    h(Card, { key: "runtime" }, [
      CardHead("运行时注入块（enhanceRuntime: true 时追加到 system prompt 最后一段）", [
        pack.data ? h(Badge, { key: "1", tip: "这段正文的字数" }, "约 " + pack.data.runtime.chars + " 字") : null,
        pack.data ? h(Badge, { key: "2", on: pack.data.runtime.mirror.ok, tip: "镜像与酒馆 utils.js 的 buildEnhanceRuntimeBlock() 是否一致" }, pack.data.runtime.mirror.ok ? "镜像已核对" : "镜像待复核") : null,
      ]),
      pack.data === null ? Note("wait", "等待内置包数据…") : h(Fold, {
        key: "f",
        title: "运行时注入块正文",
        summary: pack.data.runtime.chars + " 字 · 只读镜像 · 可复制/全屏",
      }, [
        h("div", { key: "b", style: S.bar }, [
          h(CopyBtn, { key: "cp", label: "复制全文", getText: () => pack.data.runtime.block, tip: "复制整段运行时注入块" }),
          h(FocusBtn, {
            key: "fs", label: "⛶ 全屏查看",
            tip: "整窗查看运行时注入块",
            makeSpec: () => ({ title: "运行时注入块", subtitle: pack.data.runtime.chars + " 字 · 只读镜像", mode: "view", value: pack.data.runtime.block }),
          }),
        ]),
        h(Pre, { key: "pre", text: pack.data.runtime.block }),
        h(HelpLine, { key: "n" }, pack.data.runtime.mirror.note + "。开关由酒馆面板控制（本插件不碰这个键）。"),
      ]),
    ]),

    /* ⑦ 发布通道 */
    Card([
      CardHead("发布通道：实验室（staging） → 目标预设（production）", [
        h(Badge, { key: "1", tip: "只发布实验室预设里 ✨增强丨 开头的非受保护模块" }, "目标 " + p.targets.length + " 个"),
      ]),
      h(HelpLine, { key: "s" }, "只发布实验室预设里 ✨增强丨 开头的非受保护模块；目标预设里同名模块默认跳过（可勾选覆盖）；永不反向同步。"),
      h("div", { key: "t2", style: { display: "flex", flexWrap: "wrap", gap: "8px" } }, presets.filter((x) => !x.isLab).map((preset) =>
        h("label", { key: preset.dir, style: { display: "flex", gap: "6px", alignItems: "center", fontSize: "12.5px" }, title: "发布到「" + preset.name + "」" }, [
          h("input", {
            key: "c", type: "checkbox", checked: p.targets.indexOf(preset.dir) >= 0,
            onChange: (e) => {
              var next = p.targets.slice();
              if (e.target.checked) next.push(preset.dir); else next = next.filter((x) => x !== preset.dir);
              setPub(Object.assign({}, p, { targets: next, plan: null }));
            },
          }),
          preset.name,
        ]))),
      h("label", { key: "ov", style: { display: "flex", gap: "6px", alignItems: "center", fontSize: "12.5px" }, title: "默认跳过目标里已有的同名模块；勾上则用实验室版覆盖目标版本" }, [
        h("input", { key: "c", type: "checkbox", checked: p.overwrite, onChange: (e) => setPub(Object.assign({}, p, { overwrite: e.target.checked, plan: null })) }),
        "同名模块也覆盖（危险：会替换目标预设的版本）",
      ]),
      h("div", { key: "acts", style: { display: "flex", gap: "8px", flexWrap: "wrap" } }, [
        h(Btn, { key: "pv", primary: true, onClick: previewPublish, disabled: p.busy, tip: "只算差异不写盘：看每个目标会新增/覆盖/跳过哪些模块" }, "① 预演差异（不写入）"),
        h(Btn, { key: "ap", primary: true, onClick: () => setPub(Object.assign({}, p, { confirm: true })), disabled: p.busy || p.plan === null, tip: "按上面的预演结果真正写入目标预设（写前自动备份，可回滚）" }, "② 执行发布"),
      ]),
      p.confirm ? h(ConfirmBar, {
        key: "cf",
        title: "发布到 " + p.targets.length + " 个目标预设？",
        detail: "按预演结果写入：" + (p.plan ? p.plan.plan.map((x) => x.dir + "（新增 " + x.summary.add + " / 覆盖 " + x.summary.overwrite + " / 跳过 " + x.summary.skipped + "）").join("、") : "") + "。写前自动备份，可在「学习与比对 → 备份与回滚」撤回。",
        confirmLabel: "确认发布",
        onConfirm: applyPublish,
        onCancel: () => setPub(Object.assign({}, p, { confirm: false })),
      }) : null,
      MsgLine({ err: p.err, ok: p.ok }),
      p.plan === null ? null : Table(["目标预设", "新增", "覆盖", "不变", "跳过", "字符增量"],
        p.plan.plan.map((item) => [item.dir, String(item.summary.add), String(item.summary.overwrite), String(item.summary.unchanged), String(item.summary.skipped), String(item.summary.charsDelta)])),
      p.plan === null ? null : p.plan.plan.map((item) => h(Fold, { key: item.dir, title: item.dir + " 明细", summary: item.rows.length + " 条 · 新增 " + item.summary.add + " / 覆盖 " + item.summary.overwrite },
        Table(["模块", "动作", "新字数", "原字数"], item.rows.map((row) => [row.name, row.action, String(row.chars), row.existingChars === null ? "—" : String(row.existingChars)])))),
    ]),
  );
}
