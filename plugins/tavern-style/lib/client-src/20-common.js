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
