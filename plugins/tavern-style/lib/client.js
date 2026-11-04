/* eslint-disable */
/**
 * ⚠️ 本文件是构建产物 —— 不要直接编辑。
 * 源文件：lib/client-src/*.js（按文件名顺序拼接）
 * 重新生成：node D:/DSH/tavern-style/build/bundle-client.mjs
 *
 * 包装格式与 id 约定（实测规格）：
 *   - window.__ModuleLoader__.load({ id, factory }) 里的 id 必须是「包名」@local/dsh-tavern-style，
 *     不是 cordis.patch.yml 的行 id；写错会导致 duplicate factory registration、web boot 失败。
 *   - 组件函数被真实 React 调用时签名是 (props, legacyContext)：子节点一律走 kid()。
 *   - 数组里的子节点必须 h(Comp, {key})，不要直接调用 Comp(...)。
 */

window.__ModuleLoader__.load({
  id: "@local/dsh-tavern-style",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");
    var h = React.createElement;
/* ── client-src/00-base.js ─────────────────────────────── */
/**
 * 文风实验室 · 客户端源码 · 00-base
 * ─────────────────────────────────────────────────────────────
 * ⚠️ 本目录是**源码**，按文件名顺序拼接成 lib/client.js（构建产物）。
 *    重新生成：node D:\DSH\tavern-style\build\bundle-client.mjs
 * 约定：
 *   - 各文件共享同一个工厂作用域：**不要写 import / export**，直接声明 function/const。
 *   - `React`、`h`、`require` 由打包器在工厂头部注入，可直接使用。
 *   - 帮助组件被 React 调用时签名是 (props, legacyContext)，所以子节点一律走 kid()。
 *   - 数组里的子节点要用 h(Comp, {key})，不要直接调用 Comp(...)（key 会丢）。
 *
 * 00-base：样式令牌、基础组件、API 封装、通用工具。
 */

var API = "api/tavern-style";

/* ───────────────────────── 样式 ───────────────────────── */

var S = {
  wrap: { display: "flex", flexDirection: "column", gap: "12px", width: "100%", maxWidth: "1180px", color: "var(--dsw-alias-label-primary)" },
  bar: { display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", fontSize: "12px", color: "var(--dsw-alias-label-tertiary)" },
  tabs: { display: "flex", gap: "6px", flexWrap: "wrap" },
  tab: { padding: "6px 12px", borderRadius: "8px", border: "0.5px solid var(--dsw-alias-border-l3)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: "13px" },
  tabOn: { padding: "6px 12px", borderRadius: "8px", border: "0.5px solid var(--dsw-alias-border-l3)", background: "var(--dsw-alias-interactive-bg-hover)", color: "inherit", cursor: "pointer", fontSize: "13px", fontWeight: 600 },
  card: { border: "0.5px solid var(--dsw-alias-settings-card-stroke)", borderRadius: "12px", padding: "12px 14px", background: "var(--dsw-alias-settings-card-fill)", display: "flex", flexDirection: "column", gap: "8px" },
  h: { fontSize: "14px", fontWeight: 600, margin: 0 },
  sub: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary)", margin: 0, lineHeight: 1.7 },
  mono: { fontFamily: "var(--ds-font-family-code)", fontSize: "11.5px", overflowWrap: "anywhere", color: "var(--dsw-alias-label-tertiary)" },
  row: { display: "flex", gap: "8px", alignItems: "center", justifyContent: "space-between", fontSize: "13px", borderTop: "0.5px solid var(--dsw-alias-border-l2)", paddingTop: "6px" },
  tag: { fontSize: "11px", padding: "1px 6px", borderRadius: "6px", border: "0.5px solid var(--dsw-alias-border-l3)", color: "var(--dsw-alias-label-tertiary)", flex: "none" },
  tagOn: { fontSize: "11px", padding: "1px 6px", borderRadius: "6px", border: "0.5px solid var(--dsw-alias-state-business-primary)", color: "var(--dsw-alias-state-business-primary)", flex: "none" },
  btn: { padding: "5px 10px", borderRadius: "8px", border: "0.5px solid var(--dsw-alias-border-l3)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: "12.5px" },
  btnPrimary: { padding: "5px 10px", borderRadius: "8px", border: "0.5px solid var(--dsw-alias-state-business-primary)", background: "var(--dsw-alias-interactive-bg-hover)", color: "inherit", cursor: "pointer", fontSize: "12.5px", fontWeight: 600 },
  btnDanger: { padding: "5px 10px", borderRadius: "8px", border: "0.5px solid var(--dsw-alias-state-error-primary)", background: "transparent", color: "var(--dsw-alias-state-error-primary)", cursor: "pointer", fontSize: "12.5px" },
  input: { width: "100%", boxSizing: "border-box", padding: "6px 8px", borderRadius: "8px", border: "0.5px solid var(--dsw-alias-border-l3)", background: "var(--dsw-alias-bg-layer-1)", color: "inherit", fontSize: "12.5px" },
  textarea: { width: "100%", boxSizing: "border-box", minHeight: "120px", padding: "8px", borderRadius: "8px", border: "0.5px solid var(--dsw-alias-border-l3)", background: "var(--dsw-alias-bg-layer-1)", color: "inherit", fontSize: "12.5px", fontFamily: "var(--ds-font-family-code)", lineHeight: 1.7, resize: "vertical" },
  err: { color: "var(--dsw-alias-state-error-primary)", fontSize: "12.5px", margin: 0 },
  good: { color: "var(--dsw-alias-state-business-primary)", fontSize: "12.5px", margin: 0 },
  warn: { color: "var(--dsw-alias-state-warning-primary, #d97706)", fontSize: "12.5px", margin: 0 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "12.5px" },
  th: { textAlign: "left", color: "var(--dsw-alias-label-tertiary)", fontWeight: 400, padding: "4px 6px", borderBottom: "0.5px solid var(--dsw-alias-border-l2)" },
  td: { padding: "4px 6px", borderBottom: "0.5px solid var(--dsw-alias-border-l2)", verticalAlign: "top" },
  bubble: { border: "0.5px solid var(--dsw-alias-border-l2)", borderRadius: "10px", padding: "8px 10px", background: "var(--dsw-alias-bg-module-platform)", fontSize: "12.5px", lineHeight: 1.7, whiteSpace: "pre-wrap", maxHeight: "260px", overflow: "auto" },
  split: { display: "grid", gridTemplateColumns: "minmax(200px,260px) minmax(0,1fr)", gap: "12px", alignItems: "start" },
  list: { display: "flex", flexDirection: "column", gap: "4px", maxHeight: "420px", overflow: "auto" },
  item: { textAlign: "left", padding: "6px 8px", borderRadius: "8px", border: "0.5px solid transparent", background: "transparent", color: "inherit", cursor: "pointer", fontSize: "12.5px" },
  itemOn: { textAlign: "left", padding: "6px 8px", borderRadius: "8px", border: "0.5px solid var(--dsw-alias-border-l3)", background: "var(--dsw-alias-interactive-bg-hover)", color: "inherit", cursor: "pointer", fontSize: "12.5px" },
  chip: { fontSize: "11.5px", padding: "2px 7px", borderRadius: "999px", border: "0.5px solid var(--dsw-alias-border-l3)", background: "transparent", color: "inherit", cursor: "pointer", lineHeight: 1.6 },
  chipOn: { fontSize: "11.5px", padding: "2px 7px", borderRadius: "999px", border: "0.5px solid var(--dsw-alias-state-business-primary)", background: "var(--dsw-alias-interactive-bg-hover)", color: "inherit", cursor: "pointer", lineHeight: 1.6, fontWeight: 600 },
  pre: { margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: "12.5px", lineHeight: 1.7, fontFamily: "var(--ds-font-family-code)", maxHeight: "240px", overflow: "auto", border: "0.5px solid var(--dsw-alias-border-l2)", borderRadius: "10px", padding: "8px 10px", background: "var(--dsw-alias-bg-module-platform)" },
  /* 新增：卡片头部（标题 + 摘要 + 右侧操作） */
  cardHead: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" },
  cardTitle: { fontSize: "14px", fontWeight: 600, margin: 0, flex: "1 1 220px", minWidth: "160px" },
  /* 新增：折叠摘要行 */
  foldSummary: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", width: "100%", cursor: "pointer", fontSize: "12.5px" },
  /* 新增：确认条（高危动作） */
  confirm: { border: "0.5px solid var(--dsw-alias-state-warning-primary, #d97706)", borderRadius: "10px", padding: "10px", display: "flex", flexDirection: "column", gap: "6px" },
  /* 新增：指标块（数字语境化） */
  metric: { display: "flex", flexDirection: "column", gap: "2px", padding: "6px 10px", borderRadius: "10px", border: "0.5px solid var(--dsw-alias-border-l2)", minWidth: "86px" },
  metricValue: { fontSize: "16px", fontWeight: 600, lineHeight: 1.2 },
  metricLabel: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)" },
  /* 新增：专注模式覆盖层 */
  overlay: { position: "fixed", inset: 0, zIndex: 9999, background: "var(--dsw-alias-bg-layer-1, #fff)", display: "flex", flexDirection: "column", gap: "10px", padding: "14px 18px", boxSizing: "border-box", overflow: "auto" },
  overlayHead: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", borderBottom: "0.5px solid var(--dsw-alias-border-l2)", paddingBottom: "10px" },
  overlayBody: { flex: "1 1 auto", display: "flex", flexDirection: "column", gap: "10px", minHeight: "0" },
  overlayArea: { width: "100%", boxSizing: "border-box", flex: "1 1 auto", minHeight: "320px", padding: "10px 12px", borderRadius: "10px", border: "0.5px solid var(--dsw-alias-border-l3)", background: "var(--dsw-alias-bg-layer-1)", color: "inherit", fontSize: "13.5px", lineHeight: 1.8, fontFamily: "var(--ds-font-family-code)", resize: "none" },
};

/* ───────────────────────── React 基础组件 ───────────────────────── */

/* ⚠️ 帮助组件两种调用方式：① 直接调用 Comp(props, child)；② h(Comp, props, child)。
   真实 React 调组件永远带 (props, legacyContext)，第二参数是 {}，
   所以 kid() 必须优先取 props.children，把"裸对象"第二参数丢弃（否则面板整片空白）。 */
function isContextLike(x) { return x !== null && typeof x === "object" && !Array.isArray(x) && x.$$typeof === undefined; }
function kid(props, children) {
  if (props && props.children !== undefined) return props.children;
  if (children !== undefined && !isContextLike(children)) return children;
  return undefined;
}

function Badge(props, children) { return h("span", { style: props.on ? S.tagOn : S.tag, title: props.tip || undefined }, kid(props, children)); }

/** 数组子节点自动补 key（直接调用的 helper 返回的元素没有 key，React 会警告）。 */
function withKey(child, key) {
  if (child === null || child === undefined || child === false || typeof child !== "object") return child;
  if (typeof React.cloneElement === "function") return React.cloneElement(child, { key: key });
  /* 迷你 React 没有 cloneElement：重建元素时把 children 显式带上（它的 children 挂在 node.children）。 */
  var kids = child.children !== undefined ? child.children : (child.props ? child.props.children : undefined);
  return h(child.type, Object.assign({}, child.props, { key: key }), kids);
}
function keyedChildren(list) {
  if (!Array.isArray(list)) return list;
  /* 展平嵌套数组（.map() 结果直接塞进 children 的场景），再给没 key 的元素补 key。 */
  var flat = [];
  (function walk(items) {
    items.forEach((child) => {
      if (Array.isArray(child)) walk(child);
      else flat.push(child);
    });
  })(list);
  return flat.map((child, i) => {
    if (child === null || child === undefined || child === false || typeof child !== "object") return child;
    if (child.key !== null && child.key !== undefined) return child;
    return withKey(child, "k" + i);
  });
}

/* 全局 h 包装：凡是「数组子节点」都自动补 key（React 的 key 纪律），语义不变。
   直接调用 helper（Card(...) / Field(...) …）返回的元素没 key，混进数组时靠它兜底。 */
var createElementRaw = h;
h = function (type, props) {
  var rest = Array.prototype.slice.call(arguments, 2);
  var mapped = rest.map((child) => (Array.isArray(child) ? keyedChildren(child) : child));
  return createElementRaw.apply(null, [type, props].concat(mapped));
};
function Card(props, children) {
  var inner = Array.isArray(props) || typeof props === "string" || typeof props === "number" ? props : kid(props, children);
  return h("div", { style: S.card }, keyedChildren(inner));
}
function Empty(text) { return h("p", { style: S.sub }, text); }
function Err(text) { return text ? h("p", { style: S.err }, String(text)) : null; }
function Ok(text) { return text ? h("p", { style: S.good }, String(text)) : null; }

/** 按钮：tip = 悬停说明（干什么、会写什么、要不要钱），label 自身要能独立读懂。 */
function Btn(props, children) {
  return h("button", {
    type: "button",
    style: props.danger ? S.btnDanger : props.primary ? S.btnPrimary : S.btn,
    title: props.tip || undefined,
    onClick: props.onClick,
    disabled: props.disabled,
  }, kid(props, children));
}
function Input(props) {
  return h("input", {
    style: S.input,
    value: props.value,
    placeholder: props.placeholder,
    title: props.tip || undefined,
    onChange: (e) => props.onChange(e.target.value),
  });
}
function Area(props) {
  return h("textarea", {
    style: Object.assign({}, S.textarea, props.style || {}),
    value: props.value,
    placeholder: props.placeholder,
    title: props.tip || undefined,
    spellCheck: false,
    onChange: (e) => props.onChange(e.target.value),
  });
}
function Table(headers, rows) {
  return h("table", { style: S.table },
    h("thead", null, h("tr", null, headers.map((label, i) => h("th", { key: i, style: S.th }, label)))),
    h("tbody", null, rows.map((cells, i) => h("tr", { key: i }, cells.map((cell, j) => h("td", { key: j, style: S.td }, cell))))));
}
function Field(label, node, note) {
  return h("label", { style: { display: "flex", flexDirection: "column", gap: "4px", fontSize: "12.5px" } },
    keyedChildren([
      h("span", { key: "l", style: S.sub }, label),
      node === undefined || node === null ? null : (typeof node === "object" && node.key === null ? withKey(node, "n") : node),
      note ? h("span", { key: "note", style: S.sub }, note) : null,
    ]));
}
/** 只读文本框（点击即全选，方便手动复制）。 */
function ReadOnlyArea(props) {
  return h("textarea", {
    readOnly: true,
    style: Object.assign({}, S.textarea, props.style || {}),
    value: props.value,
    onFocus: (e) => { try { e.target.select(); } catch (err) { /* 忽略 */ } },
  });
}
/** 只读正文块（等宽 + 自动换行 + 限高滚动）。 */
function Pre(props) {
  return h("pre", { style: Object.assign({}, S.pre, props.style || {}) }, props.text);
}
/** 数组里用的带 key 的说明行 / 错误行。 */
function Note(key, text) { return h("p", { key: key, style: S.sub }, text); }
function Fail(key, text) { return text ? h("p", { key: key, style: S.err }, String(text)) : null; }
function Done(key, text) { return text ? h("p", { key: key, style: S.good }, String(text)) : null; }

/** 悬停说明标记 ⓘ：解释术语/数字/按钮，鼠标停上去看全文。 */
function Tip(props, children) {
  return h("span", {
    style: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: "15px", height: "15px", borderRadius: "50%", border: "0.5px solid var(--dsw-alias-border-l3)", color: "var(--dsw-alias-label-tertiary)", fontSize: "10px", cursor: "help", flex: "none" },
    title: (props && props.text) || (typeof props === "string" ? props : ""),
  }, "?");
}

/** 卡片头：标题 + 一行摘要 + 右侧按钮。 */
function CardHead(title, summary, actions) {
  return h("div", { style: S.cardHead }, keyedChildren([
    h("p", { key: "t", style: S.cardTitle }, title),
    summary ? h("div", { key: "s", style: S.bar }, keyedChildren(summary)) : null,
    actions ? h("div", { key: "a", style: { display: "flex", gap: "6px", flexWrap: "wrap" } }, keyedChildren(actions)) : null,
  ]));
}

/** 折叠块：默认收起（原生 details —— 正文常驻 DOM，Ctrl+F 可搜、可被脚本断言），标题行给出摘要。 */
function Fold(props) {
  var st = React.useState(props.defaultOpen === true);
  var open = st[0]; var setOpen = st[1];
  return h("details", {
    open: open,
    onToggle: (e) => { var next = e && e.currentTarget ? e.currentTarget.open : !open; if (next !== open) setOpen(next); },
    style: { display: "flex", flexDirection: "column", gap: "6px", borderTop: "0.5px solid var(--dsw-alias-border-l2)", paddingTop: "8px" },
  }, [
    h("summary", {
      key: "s",
      style: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", cursor: "pointer", fontSize: "12.5px" },
      title: props.tip || undefined,
    }, [
      h("span", { key: "t", style: { fontWeight: 600 } }, props.title),
      props.summary ? h("span", { key: "m", style: { color: "var(--dsw-alias-label-tertiary)" } }, props.summary) : null,
    ]),
    keyedChildren(props.children),
  ]);
}

/**
 * 高危确认条：danger 动作先出这条，写清"会发生什么、能不能撤"，再给确认按钮。
 * 用法：confirmNode(spec) 由各标签页自己管 state；这里只负责渲染。
 */
function ConfirmBar(props) {
  return h("div", { style: S.confirm }, [
    h("p", { key: "t", style: S.h }, props.title),
    h("p", { key: "d", style: S.sub }, props.detail),
    h("div", { key: "a", style: { display: "flex", gap: "8px", flexWrap: "wrap" } }, [
      h(Btn, { key: "y", danger: true, onClick: props.onConfirm, tip: props.confirmTip || undefined }, props.confirmLabel || "确认执行"),
      h(Btn, { key: "n", onClick: props.onCancel }, "取消"),
    ]),
  ]);
}

/* ───────────────────────── 数字语境化 ───────────────────────── */

/** 指标块：值 + 名称 + 悬停解释；tone 由调用方按刻度给出（good/ok/bad/neutral）。 */
function Metric(props) {
  var tone = props.tone || "neutral";
  var color = tone === "good" ? "var(--dsw-alias-state-business-primary)"
    : tone === "bad" ? "var(--dsw-alias-state-error-primary)"
      : tone === "warn" ? "var(--dsw-alias-state-warning-primary, #d97706)"
        : "inherit";
  return h("div", { style: Object.assign({}, S.metric, { borderColor: tone === "neutral" ? "var(--dsw-alias-border-l2)" : color }), title: props.tip || undefined }, [
    h("div", { key: "v", style: Object.assign({}, S.metricValue, { color: color }) }, String(props.value)),
    h("div", { key: "l", style: S.metricLabel }, props.label),
  ]);
}

/** 分数 0-100：≥80 好 / 60-79 一般 / <60 差。 */
function scoreTone(score) { return score >= 80 ? "good" : score >= 60 ? "warn" : "bad"; }
/** 八股命中：0 好 / 1-3 一般 / ≥4 差。 */
function hitTone(n) { return n <= 0 ? "good" : n <= 3 ? "warn" : "bad"; }
/** 变化量：positiveIsGood 决定正负哪个算改善。 */
function deltaTone(delta, positiveIsGood) {
  if (!delta) return "neutral";
  var good = positiveIsGood ? delta > 0 : delta < 0;
  return good ? "good" : "bad";
}
function fmtDelta(delta) { return (delta > 0 ? "+" : "") + String(delta); }

/* ───────────────────────── 工具 ───────────────────────── */

/** 新接口在"宿主半边没重启"时会 404 / 非 JSON —— 给一句人话解释。 */
function hostHint(res) {
  if (res === null || res === undefined) return "";
  if (res.status === 404 || res.status === 405) return "（该接口是新增的：宿主半边要重启 DSH 后才会注册）";
  if (/JSON|Unexpected token|not valid JSON/iu.test(String(res.error ?? ""))) return "（返回的不是 JSON —— 宿主半边可能还没重启、没加载新路由）";
  return "";
}
/** 复制到剪贴板：返回 Promise<boolean>，环境不支持时不抛。 */
function copyText(text) {
  return new Promise(function (resolve) {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        navigator.clipboard.writeText(String(text)).then(() => resolve(true), () => resolve(false));
        return;
      }
    } catch (err) { /* 落到 false */ }
    resolve(false);
  });
}
/** 触发浏览器下载（导出 Markdown 用）。 */
function downloadText(filename, text) {
  try {
    var blob = new Blob([String(text)], { type: "text/markdown;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
    return true;
  } catch (err) { return false; }
}
function kb(n) { return typeof n !== "number" ? "—" : n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(1) + " MB"; }
function when(ms) {
  if (typeof ms !== "number" || ms === 0) return "—";
  var d = new Date(ms); var p = (n) => (n < 10 ? "0" + n : String(n));
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

/** 统一 API 调用：返回 {ok, data, code, error, status}，绝不抛。 */
function api(method, path, body) {
  var init = { method: method, headers: { accept: "application/json" }, credentials: "same-origin" };
  if (body !== undefined) { init.headers["content-type"] = "application/json"; init.body = JSON.stringify(body); }
  return fetch(API + path, init)
    .then((r) => r.json().then((j) => ({ ok: j && j.ok === true, data: j && j.data, code: j && j.code, error: j && j.error, status: r.status })))
    .catch((e) => ({ ok: false, error: String((e && e.message) || e), status: 0 }));
}

/** 通用数据钩子：{phase, data, error, reload} */
function useData(loader, deps) {
  var st = React.useState({ phase: "loading", data: null, error: null });
  var state = st[0]; var setState = st[1];
  var tick = React.useState(0); var bump = tick[1];
  React.useEffect(function () {
    var alive = true;
    setState((prev) => ({ phase: prev.data === null ? "loading" : "refreshing", data: prev.data, error: null }));
    Promise.resolve(loader()).then((res) => {
      if (!alive) return;
      if (res && res.ok) setState({ phase: "ready", data: res.data, error: null });
      else setState({ phase: "error", data: null, error: (res && res.error) || "请求失败" });
    });
    return function () { alive = false; };
  }, deps ? deps.concat([tick[0]]) : [tick[0]]);
  return { phase: state.phase, data: state.data, error: state.error, reload: () => bump((n) => n + 1) };
}

/** 简易行级 diff（LCS）：返回 [{type:'same'|'add'|'del', text}]，大文本降级为整段对照。 */
function diffLines(aText, bText) {
  var a = String(aText === undefined || aText === null ? "" : aText).split("\n");
  var b = String(bText === undefined || bText === null ? "" : bText).split("\n");
  if (a.length * b.length > 250000) {
    return a.map((t) => ({ type: "del", text: t })).concat(b.map((t) => ({ type: "add", text: t })));
  }
  var n = a.length; var m = b.length;
  var dp = [];
  for (var i = 0; i <= n; i += 1) dp.push(new Array(m + 1).fill(0));
  for (i = n - 1; i >= 0; i -= 1) {
    for (var j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  var out = [];
  i = 0; j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: "same", text: a[i] }); i += 1; j += 1; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: "del", text: a[i] }); i += 1; }
    else { out.push({ type: "add", text: b[j] }); j += 1; }
  }
  while (i < n) { out.push({ type: "del", text: a[i] }); i += 1; }
  while (j < m) { out.push({ type: "add", text: b[j] }); j += 1; }
  return out;
}

/** diff 渲染：左原右新双栏 + 行内增删高亮；行数多时内部滚动。 */
function DiffView(props) {
  var rows = diffLines(props.before, props.after);
  var added = rows.filter((r) => r.type === "add").length;
  var removed = rows.filter((r) => r.type === "del").length;
  var styleFor = (t) => ({
    padding: "1px 6px",
    borderRadius: "4px",
    background: t === "add" ? "color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent)"
      : t === "del" ? "color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent)" : "transparent",
    color: t === "add" ? "var(--dsw-alias-state-business-primary)" : t === "del" ? "var(--dsw-alias-state-error-primary)" : "inherit",
    minHeight: "1.5em",
  });
  return h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, [
    h("div", { key: "b", style: S.bar }, [
      h(Badge, { key: "a", on: removed > 0 }, "删 " + removed + " 行"),
      h(Badge, { key: "d", on: added > 0 }, "增 " + added + " 行"),
      h("span", { key: "h", style: S.sub }, "灰底=原文，绿底=你的改法。行数太多时只显示变化附近。"),
    ]),
    h("div", { key: "rows", style: { maxHeight: props.maxHeight || "320px", overflow: "auto", fontFamily: "var(--ds-font-family-code)", fontSize: "12px", lineHeight: 1.7, border: "0.5px solid var(--dsw-alias-border-l2)", borderRadius: "10px", padding: "6px 8px" } },
      rows.map((r, i) => h("div", { key: i, style: styleFor(r.type) }, (r.type === "add" ? "+ " : r.type === "del" ? "- " : "  ") + (r.text === "" ? " " : r.text)))),
  ]);
}

/* ── client-src/10-focus.js ─────────────────────────────── */
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

/* ── client-src/20-common.js ─────────────────────────────── */
/**
 * 文风实验室 · 客户端源码 · 20-common
 * ─────────────────────────────────────────────────────────────
 * 跨标签页复用的业务组件：复制按钮、消息行、搜索框、指标行、差值徽章。
 * （带 hooks 的组件只能走 h(Comp, props) 渲染，不能直接调用。）
 */

/** 复制按钮：点击即复制，按钮上就地回显"已复制/失败"，不用去别处找提示。 */
function CopyBtn(props) {
  var st = React.useState(null);
  var state = st[0]; var set = st[1];
  return h(Btn, {
    tip: props.tip || "复制到剪贴板",
    onClick: () => {
      copyText(typeof props.getText === "function" ? props.getText() : props.text).then((ok) => {
        set(ok ? "已复制" : "复制失败");
        setTimeout(() => set(null), 2000);
      });
    },
  }, state === null ? (props.label || "复制") : state);
}

/** 成功 / 失败消息行（就地显示，不用滚动找）。 */
function MsgLine(props) {
  if (props.err) return h("p", { style: S.err }, "✗ " + String(props.err));
  if (props.ok) return h("p", { style: S.good }, "✓ " + String(props.ok));
  return null;
}

/** 搜索框：占位符写清"能搜什么"。 */
function SearchBox(props) {
  return h("div", { style: { display: "flex", gap: "6px", alignItems: "center", flex: "1 1 200px", minWidth: "160px" } }, [
    h("input", {
      key: "i",
      style: S.input,
      value: props.value,
      placeholder: props.placeholder || "搜索…",
      title: props.tip || "输入即过滤列表（不区分大小写）",
      onChange: (e) => props.onChange(e.target.value),
    }),
    props.value !== "" ? h(Btn, { key: "c", tip: "清空搜索", onClick: () => props.onChange("") }, "✕") : null,
    props.count !== undefined ? h("span", { key: "n", style: S.sub }, props.count + " 条") : null,
  ]);
}

/** 大数字指标行：值 + 名称 + 颜色刻度 + 悬停解释。 */
function MetricRow(props) {
  return h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
    (props.items || []).map((item, i) => h(Metric, { key: i, value: item.value, label: item.label, tone: item.tone, tip: item.tip })));
}

/** 差值徽章：Δ + 方向色（positiveIsGood 决定正负哪个算改善）。 */
function DeltaBadge(props) {
  var d = Number(props.delta) || 0;
  if (d === 0) return h(Badge, { key: props.key, tip: props.tip || "没有变化" }, (props.label || "Δ") + " ±0");
  return h(Badge, {
    key: props.key,
    on: true,
    tip: props.tip || (d > 0 ? "比原来高" : "比原来低"),
  }, (props.label || "Δ") + " " + fmtDelta(d));
}

/** 列表工具条：搜索 + 计数 + 右侧动作。 */
function ListToolbar(props) {
  return h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" } }, [
    h(SearchBox, { key: "q", value: props.query, onChange: props.onQuery, placeholder: props.placeholder, count: props.count }),
    props.children,
  ]);
}

/** 常用的一句话解释行（代替过去每张卡里那段长流程说明）。 */
function HelpLine(props, children) {
  return h("p", { style: S.sub }, kid(props, children));
}

/** 分段标签按钮组：options=[{value,label,tip}]，value 当前值。 */
function Segmented(props) {
  return h("div", { style: S.bar }, (props.options || []).map((opt) =>
    h("button", {
      key: String(opt.value),
      type: "button",
      style: opt.value === props.value ? S.tabOn : S.tab,
      title: opt.tip || undefined,
      onClick: () => props.onChange(opt.value),
    }, opt.label)));
}

/**
 * 折叠列表项：一行摘要（点开看正文）+ 右侧操作按钮。
 * 原生 details：正文常驻 DOM（可被 Ctrl+F 搜索 / 测试断言），视觉上默认折叠。
 * 摘要行里的按钮用 onClick preventDefault 阻止"点按钮=折叠"的误触。
 */
function ItemRow(props) {
  var st = React.useState(props.defaultOpen === true);
  var open = st[0]; var setOpen = st[1];
  return h("details", {
    open: open,
    onToggle: (e) => { var next = e && e.currentTarget ? e.currentTarget.open : !open; if (next !== open) setOpen(next); },
    style: { display: "flex", flexDirection: "column", gap: "6px", borderTop: "0.5px solid var(--dsw-alias-border-l2)", paddingTop: "8px" },
  }, [
    h("summary", {
      key: "h",
      style: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", cursor: "pointer" },
      title: open ? "收起正文" : "展开正文（" + (props.previewHint || "预览") + "）",
    }, keyedChildren([
      h("span", { key: "n", style: { fontSize: "13px", fontWeight: 600, flex: "1 1 220px", minWidth: "160px" } }, props.title),
      props.summary ? h("span", { key: "s", style: { color: "var(--dsw-alias-label-tertiary)", fontSize: "11.5px" } }, props.summary) : null,
      props.badges ? h("span", { key: "b", style: S.bar, onClick: (e) => e.preventDefault() }, keyedChildren(props.badges)) : null,
      props.actions ? h("div", { key: "a", style: { display: "flex", gap: "6px", flexWrap: "wrap" }, onClick: (e) => e.preventDefault() }, keyedChildren(props.actions)) : null,
    ])),
    keyedChildren(props.children),
  ]);
}

/* ── client-src/30-tab-anti.js ─────────────────────────────── */
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

/* ── client-src/40-tab-enhance.js ─────────────────────────────── */
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

/* ── client-src/50-tab-bench.js ─────────────────────────────── */
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

/* ── client-src/60-tab-learn.js ─────────────────────────────── */
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

/* ── client-src/70-tab-replay.js ─────────────────────────────── */
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

/* ── client-src/80-tab-home.js ─────────────────────────────── */
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

/* ── client-src/90-entry.js ─────────────────────────────── */
/**
 * 文风实验室 · 客户端源码 · 90-entry
 * ─────────────────────────────────────────────────────────────
 * 外壳与注册：标签栏 + 状态行 + 槽位注册（settings.section 主面板 + shell.overlay 专注模式浮层）。
 */

var TABS = [
  { id: "home", label: "总览", render: HomeTab, tip: "现在什么状态、下一步该干什么" },
  { id: "scan", label: "文本体检", render: ScanTab, tip: "粘一段文字立刻打分（免费，不调模型）" },
  { id: "anti", label: "反八股", render: AntiTab, tip: "antiCliche 开关 + 禁用词表 + 实际注入的条款正文" },
  { id: "enhance", label: "增强层 / 发布", render: EnhanceTab, tip: "改预设模块正文、套用内置包、发布到目标预设" },
  { id: "bench", label: "改进工作台", render: BenchTab, tip: "逐轮改写模型输出，攒教学样本" },
  { id: "learn", label: "学习与比对", render: LearnTab, tip: "候选规则采纳、成果浏览、分布拟合、备份回滚" },
  { id: "replay", label: "A/B 回放", render: ReplayTab, tip: "两臂真实调用对比，量出增强模块有没有用" },
];

function TavernStyleSection(props) {
  var overview = useData(() => api("GET", "/overview"), []);
  var tabState = React.useState("home");
  var tab = tabState[0]; var setTab = tabState[1];

  // ⚠️ 标签页必须用 h(active.render, props) 渲染成**组件**（直接调用会打乱 hook 顺序 → 面板空白）。
  try {
    var doctor = (overview.data && overview.data.doctor) || {};
    var active = TABS.filter((t) => t.id === tab)[0] || TABS[0];
    var body;
    if (overview.phase === "error") body = Card(Err("读取总览失败：" + overview.error));
    else if (overview.data === null) body = Card(Empty("正在读取酒馆数据…"));
    else body = h(active.render, { overview: overview.data, reloadOverview: overview.reload, go: setTab });

    return h("div", { style: S.wrap },
      h("div", { style: S.bar }, [
        h(Badge, { key: "1", on: doctor.tavernPresent === true, tip: "酒馆宿主插件是否在位（本插件只读写它的用户数据文件）" }, doctor.tavernPresent ? "宿主 dsh-tavern " + (doctor.tavernVersion || "?") : "未检测到 dsh-tavern"),
        h(Badge, { key: "2", tip: "插件的功能阶段标记" }, doctor.stage || ""),
        h(Badge, { key: "3", tip: "写入保护：备份 / mtime 守卫 / 原子替换 / 回读校验" }, doctor.writable ? "可写（带备份/守卫）" : "只读"),
        overview.phase !== "ready" ? h(Badge, { key: "4", on: true }, "加载中：" + overview.phase) : null,
        h(Btn, { key: "5", onClick: overview.reload, tip: "重新读取总览数据（各页数据在自己的卡片里另有「重新读取」）" }, "刷新"),
      ].filter(Boolean)),
      h("div", { style: S.tabs }, TABS.map((t) =>
        h("button", {
          key: t.id,
          type: "button",
          style: t.id === tab ? S.tabOn : S.tab,
          title: t.tip,
          onClick: () => setTab(t.id),
        }, t.label))),
      body,
      h(FocusLayer, { key: "__focus", fallback: true }),
      doctor.note ? h("p", { key: "note", style: S.sub }, doctor.note) : null);
  } catch (error) {
    var detail = String((error && error.stack) || error);
    return h("div", { style: S.wrap }, [
      h("p", { key: "t", style: S.h }, "文风实验室 · 渲染异常（把这段文字发我即可定位）"),
      h("pre", { key: "p", style: S.bubble }, detail),
      h("p", { key: "d", style: S.sub }, "总览 phase=" + overview.phase + "｜error=" + String(overview.error)),
    ]);
  }
}

/**
 * ⚠️ 官方结构要求：客户端工厂必须返回 { inject, apply }，且用到 ctx.slots 就必须 inject: ['slots']。
 * 注册两处：
 *   settings.section —— 主面板（文风实验室分区）
 *   shell.overlay    —— 专注模式的整窗浮层（脱离滚动容器）；外壳不渲染时由面板内的 fixed 兜底接管
 */
var inject = ['slots'];

function apply(ctx) {
  var slots = ctx && ctx.slots;
  if (!slots) return;
  function registerSafe(desc, comp) {
    try {
      return slots.register(desc, comp);
    } catch (error) {
      if (ctx.logger) ctx.logger("tavern-style: register " + desc.name + " failed: " + error);
      return function () {};
    }
  }
  try {
    slots.inject("settings.section", function () {
      try {
        // ⚠️ 注册的是纯渲染函数包装（不要把带 hooks 的组件直接交给 slots.register）
        return registerSafe({ name: "settings.section", id: "tavern-style", order: 152, label: function () { return "文风实验室"; } }, function (props) {
          return h(TavernStyleSection, props);
        });
      } catch (error) {
        return function () {};
      }
    });
    slots.inject("shell.overlay", function () {
      try {
        return registerSafe({ name: "shell.overlay", id: "tavern-style-focus", order: 152, label: function () { return "文风实验室 · 专注模式"; } }, function (props) {
          return h(FocusLayer, props);
        });
      } catch (error) {
        return function () {};
      }
    });
  } catch (error) {
    if (ctx.logger) ctx.logger("tavern-style: inject failed: " + error);
  }
}

exports.apply = apply;
exports.inject = inject;
exports.TavernStyleSection = TavernStyleSection;
/** 供自检脚本直渲染各标签页（生产环境无副作用）。 */
exports.Tabs = {
  HomeTab: HomeTab,
  ScanTab: ScanTab,
  AntiTab: AntiTab,
  EnhanceTab: EnhanceTab,
  BenchTab: BenchTab,
  LearnTab: LearnTab,
  ReplayTab: ReplayTab,
};

    return module.exports;
  },
});
