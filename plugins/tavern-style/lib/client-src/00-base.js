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
