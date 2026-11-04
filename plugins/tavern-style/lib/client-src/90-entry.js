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
