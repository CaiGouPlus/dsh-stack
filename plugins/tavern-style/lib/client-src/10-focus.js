/**
 * 文风实验室 · 客户端源码 · 10-focus
 * ─────────────────────────────────────────────────────────────
 * 专注模式：把「一大块正文」放进**整窗大小**的浮层里读/编辑。
 * 解决的问题：设置面板只有半屏高，正文编辑框、注入预览、两臂输出对照都挤在小格子里。
 *
 * 两个挂载点：
 *   1. shell.overlay 槽（框架级浮动层，脱离所有滚动容器）——主挂载点；
 *   2. 设置分区内的 position:fixed 兜底 —— 万一 shell.overlay 没被外壳渲染也能全屏。
 * 谁先挂载谁生效（focusStore.overlayMounted），避免双层叠影。
 *
 * 三种形态（focus.open 的 spec.mode）：
 *   edit —— 全屏编辑框 + 保存（onSave 回调，写哪儿由调用方决定）
 *   view —— 全屏只读正文（可全选复制）
 *   node —— 调用方给一个 React 子树（如 DiffView、两臂对照），整窗铺开
 */

var focusStore = {
  spec: null,
  version: 0,
  overlayMounted: false,
  listeners: [],
  subscribe: function (fn) {
    focusStore.listeners.push(fn);
    return function () {
      focusStore.listeners = focusStore.listeners.filter((f) => f !== fn);
    };
  },
  bump: function () {
    focusStore.version += 1;
    focusStore.listeners.slice().forEach((fn) => { try { fn(); } catch (e) { /* 忽略 */ } });
  },
  /** spec: {title, subtitle, mode:'edit'|'view'|'node', value, onSave, node, saveLabel, hint} */
  open: function (spec) {
    focusStore.spec = Object.assign({ mode: "view", id: "f" + Date.now() }, spec);
    focusStore.bump();
  },
  close: function () {
    focusStore.spec = null;
    focusStore.bump();
  },
};

function FocusEditor(props) {
  var spec = props.spec;
  var st = React.useState({ value: spec.value === undefined ? "" : String(spec.value), msg: null, err: null, busy: false });
  var s = st[0]; var set = st[1];
  var isEdit = spec.mode === "edit" && typeof spec.onSave === "function";
  return h("div", { style: { display: "flex", flexDirection: "column", gap: "10px", flex: "1 1 auto", minHeight: "0" } },
    isEdit
      ? h("textarea", {
        style: S.overlayArea,
        value: s.value,
        spellCheck: false,
        onChange: (e) => set(Object.assign({}, s, { value: e.target.value, msg: null })),
      })
      : spec.mode === "node"
        ? h("div", { style: { flex: "1 1 auto", minHeight: "0", overflow: "auto", display: "flex", flexDirection: "column", gap: "10px" } }, spec.node)
        : h("textarea", {
          style: Object.assign({}, S.overlayArea, { color: "var(--dsw-alias-label-primary)" }),
          readOnly: true,
          value: spec.value === undefined ? "" : String(spec.value),
          onFocus: (e) => { try { e.target.select(); } catch (err) { /* 忽略 */ } },
        }),
    h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" } }, [
      isEdit ? h(Btn, {
        key: "sv", primary: true, disabled: s.busy,
        tip: "保存后写回下面的表单（还没写进磁盘，仍要点各页的「保存」）",
        onClick: () => {
          set(Object.assign({}, s, { busy: true }));
          Promise.resolve(spec.onSave(s.value)).then(
            (msg) => set(Object.assign({}, s, { busy: false, msg: typeof msg === "string" && msg !== "" ? msg : "已应用到表单" })),
            (e) => set(Object.assign({}, s, { busy: false, err: String((e && e.message) || e) })),
          );
        },
      }, s.busy ? "应用中…" : (spec.saveLabel || "应用到表单")) : null,
      h(Btn, {
        key: "cp", tip: "把整篇正文复制到剪贴板",
        onClick: () => copyText(spec.mode === "edit" ? s.value : (spec.value === undefined ? "" : String(spec.value)))
          .then((ok) => set(Object.assign({}, s, { msg: ok ? "已复制全文" : "复制失败：请手动全选", err: null }))),
      }, "复制全文"),
      h(Btn, { key: "x", tip: "关闭全屏（Esc 也行）", onClick: () => focusStore.close() }, "关闭全屏"),
      s.msg ? h("span", { key: "m", style: S.good }, s.msg) : null,
      s.err ? h("span", { key: "e", style: S.err }, s.err) : null,
    ]));
}

function FocusLayer(props) {
  var isFallback = props !== null && props !== undefined && props.fallback === true;
  var st = React.useState(focusStore.version);
  var setV = st[1];
  React.useEffect(function () {
    return focusStore.subscribe(() => setV(focusStore.version));
  }, []);
  React.useEffect(function () {
    if (isFallback) return undefined;
    focusStore.overlayMounted = true;
    focusStore.bump();
    return function () { focusStore.overlayMounted = false; focusStore.bump(); };
  }, []);
  React.useEffect(function () {
    if (!focusStore.spec) return undefined;
    var onKey = (e) => { if (e && e.key === "Escape") focusStore.close(); };
    var canListen = typeof window !== "undefined" && typeof window.addEventListener === "function";
    if (canListen) window.addEventListener("keydown", onKey);
    var prevOverflow = "";
    try {
      if (typeof document !== "undefined" && document.body) { prevOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; }
    } catch (e) { /* 忽略 */ }
    return function () {
      if (canListen) window.removeEventListener("keydown", onKey);
      try {
        if (typeof document !== "undefined" && document.body) document.body.style.overflow = prevOverflow;
      } catch (e) { /* 忽略 */ }
    };
  }, [focusStore.version]);

  if (isFallback && focusStore.overlayMounted) return null;
  var spec = focusStore.spec;
  if (spec === null) return null;

  return h("div", { style: S.overlay },
    h("div", { style: S.overlayHead }, [
      h("p", { key: "t", style: { fontSize: "15px", fontWeight: 600, margin: 0, flex: "1 1 240px" } }, spec.title || "全屏"),
      spec.subtitle ? h("span", { key: "s", style: S.sub }, spec.subtitle) : null,
      h(Btn, { key: "x", tip: "关闭全屏（Esc 也行）", onClick: () => focusStore.close() }, "✕ 关闭"),
    ]),
    spec.hint ? h("p", { key: "h", style: S.sub }, spec.hint) : null,
    h("div", { style: S.overlayBody }, h(FocusEditor, { key: spec.id, spec: spec })));
}

/** 便捷按钮：把一块正文送进全屏。specFactory() 在点击时才执行，保证拿的是最新内容。 */
function FocusBtn(props) {
  return h(Btn, {
    quiet: true,
    tip: props.tip || "在整窗大的浮层里读/编辑（Esc 退出）",
    onClick: () => focusStore.open(props.makeSpec()),
  }, props.label || "⛶ 全屏");
}
