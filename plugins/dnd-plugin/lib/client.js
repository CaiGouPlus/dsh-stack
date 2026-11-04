/**
 * @local/dsh-dnd-ui — 浏览器半边（手写 bundle）。
 *
 * 为什么是手写纯 JS 而不是 TypeScript 工程：
 *   本机没有 DSH monorepo，也不存在 `pnpm run dev:web`；引入 tsc+tsdown 只是为了一层
 *   没有必要的构建。本插件用**原生 DOM API**（document.createElement）构造界面，
 *   槽位组件直接返回 DOM 节点（与 dsh-display-blocks 的 settings 面板同款做法）；
 *   React 只在诊断卡里读版本号，不参与构造（把原生 DOM 节点当 React 子节点会抛
 *   "Objects are not valid as a React child"，2026-10-05 修）。
 *   等界面复杂度真的上来了，再补一个 `tsdown` 配置——那不影响已经装好的插件身份。
 *
 * 本文件按项目约定使用 ASCII 安全写法：不写非 ASCII 的转义序列。
 */

window.__ModuleLoader__.load({
  // ⚠️ 2026-09-27 修正：这里**必须是包名**（= cordis.patch.yml 该行的 name 字段 `@local/dsh-dnd-ui`），
  // 不是行 id。写错会让加载器认为"该行没有注册"，于是回退用另一个 URL 再执行一次本文件 →
  // 同一个 bundle 跑两遍 → `duplicate factory registration for "dnd-ui"` → web boot 直接失败
  //（09-26 与 09-27 两次启动崩溃都是这一条）。
  id: "@local/dsh-dnd-ui",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    var React = require("react");

    /* ───────────────────────── 常量 ───────────────────────── */

    var B = "dnd-ui"; // BEM 前缀

    var VERSION = "0.1.0";

    /** 车卡台 15 步 —— 逐字对齐参考站 trpgcard /demo/dnd 的 StepController 步骤名。 */
    var STEPS = [
      ["basic", "基础信息", "角色名称 / 性别 / 头像"],
      ["class", "选择职业", "生命骰 / 关键属性 / 豁免 / 护甲武器工具熟练"],
      ["species", "选择物种", "物种 / 亚种 / 体型 / 速度 / 感官 / 抗性 / 物种特性"],
      ["background", "选择背景", "属性加成 / 技能 / 工具 / 起始金币 / 起源专长"],
      ["origin_confirm", "起源确认", "【确认点 A：起源】回溯检查 + 保存草稿"],
      ["abilities", "属性分配", "购点 27 / 标准数组 15-14-13-12-10-8 / 4d6 取高（三组候选）"],
      ["skills", "选择技能", "背景 + 职业 + 种族来源的技能与工具熟练"],
      ["languages", "选择语言", "起始语言 / 额外语言（标准·稀有·秘密·传说）"],
      ["feats", "选择专长", "可选专长 / 物种固定 / 背景起源专长"],
      ["ability_confirm", "能力确认", "【确认点 B：能力】属性 / 技能 / 工具 / 语言 / 专长 / 初始物品"],
      ["starting_items", "初始物品", "职业与背景初始包（选项 A / 选项 B）+ 金币替代方案"],
      ["spells", "选择法术", "戏法 / 法术 / 环位 / 来源筛选"],
      ["feature_choices", "职业特性选择", "子职业 + 子职特性"],
      ["shopping", "购物", "购物车 / 单价 GP / 小计 / 确认购买（建卡期仅寻常物品）"],
      ["summary", "摘要", "完成建卡 / 保存 / 导出"],
    ];

    /** 升级 N→N+1 的四件事，逐字对齐世界书【规则速查-升级】。 */
    var LEVELUP_AUTO = [
      "HP 增量 = 掷生命骰 + 体质修正（或固定平均）",
      "生命骰 +1",
      "5 / 9 / 13 / 17 级：熟练加值 → +3 / +4 / +5 / +6",
      "按职业获得子职业 / 新特性 / 专长 / 法术位",
    ];

    /** 升级时需要玩家亲手选的（前两项在项目规则里【未收录】，按〔规则推定〕补全）。 */
    var LEVELUP_CHOICES = [
      ["属性值提升", "4/8/12/16/19 级：+2 一维，或 +1/+1 两维（上限 20）", "推定"],
      ["专长", "与属性值提升二选一", "推定"],
      ["子职业", "战士 2 级；武僧 / 游侠 3 级；其余多数 3 级", "已收录"],
      ["新法术 / 戏法", "准备数 = 等级 + 施法属性；戏法 5/11/17 级 ×2/×3/×4", "已收录"],
    ];

    /**
     * 依赖注入声明：`['slots']` —— **必须声明**。官方结构要求（tavern-style 同款注释
     * 佐证）：客户端工厂用到 ctx.slots 就必须 inject: ['slots']，否则 apply 里拿不到
     * slots 服务，客户端半边永远不完成。这与 README「已知阻塞：加载器重复注册」无关
     * （实测声明与否都不影响那个宿主侧缺陷）。
     */
    exports.inject = ['slots'];

    /* ───────────────────────── 小工具 ───────────────────────── */

    function el(tag, cls, text) {
      var e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text !== undefined && text !== null && text !== "") e.textContent = String(text);
      return e;
    }

    /** 主题变量回退：亮/暗、DSH 外壳 / DND 皮肤四种组合下都要可读。 */
    var T = {
      ink: "var(--dnd-ink, var(--dsw-alias-label-primary, #e6dcc8))",
      sub: "var(--dnd-ink-secondary, var(--dsw-alias-label-secondary, #a99e88))",
      bg: "var(--dnd-card-bg, var(--dsw-alias-bg-layer-1, #211d30))",
      line: "var(--dnd-card-border, var(--dsw-alias-border-l2, rgba(180,150,80,.28)))",
      gold: "var(--dnd-gold, #c9a84b)",
      accent: "var(--dnd-accent-light, #a99bc8)",
      danger: "var(--dnd-hp, #ff7b6b)",
      ok: "var(--dnd-health, #5ed98b)",
      mono: "var(--dnd-mono, Consolas, monospace)",
    };

    function eyebrow(text) {
      var e = el("div", B + "-eyebrow", text);
      e.style.cssText =
        "font:600 10px/1.4 " + T.mono + ";letter-spacing:.18em;text-transform:uppercase;opacity:.75;color:" + T.gold;
      return e;
    }

    function h(text) {
      var e = el("h2", B + "-title", text);
      e.style.cssText = "margin:2px 0 0;font-size:19px;font-weight:700;color:" + T.ink;
      return e;
    }

    function p(text, sub) {
      var e = el("p", B + "-text", text);
      e.style.cssText = "margin:6px 0 0;font-size:13px;line-height:1.7;color:" + (sub ? T.sub : T.ink);
      return e;
    }

    function card(title) {
      var c = el("section", B + "-card");
      c.style.cssText =
        "border:1px solid " + T.line + ";border-radius:10px;background:" + T.bg +
        ";padding:14px 16px;margin:12px 0;box-shadow:0 2px 10px rgba(0,0,0,.18)";
      if (title) {
        var t = el("h3", B + "-card-title", title);
        t.style.cssText = "margin:0 0 8px;font-size:14px;font-weight:700;color:" + T.gold;
        c.appendChild(t);
      }
      return c;
    }

    function badge(text, tone) {
      var b = el("span", B + "-badge", text);
      var color = tone === "warn" ? T.danger : tone === "ok" ? T.ok : T.accent;
      b.style.cssText =
        "display:inline-block;padding:1px 7px;margin-left:6px;border:1px solid " + color +
        ";border-radius:999px;font-size:10px;line-height:1.6;color:" + color + ";vertical-align:middle";
      return b;
    }

    function row() {
      var r = el("div", B + "-row");
      r.style.cssText =
        "display:grid;grid-template-columns:26px 1fr auto;gap:8px;align-items:baseline;" +
        "padding:5px 0;border-bottom:1px dashed " + T.line;
      return r;
    }

    /* ───────────────────────── 车卡台视图 ───────────────────────── */

    /**
     * 车卡台 = `conversation.view` 注册出来的一个会话视图页签。
     * 组件收到的 props 由 conversation 外壳注入：{ viewRequest, openView, completeViewRequest }。
     * 返回值是**原生 DOM 节点**（槽位渲染契约：返回 Node 直接挂载；不能把 Node 包进
     * React.createElement —— React 子节点不收宿主 DOM 节点）。
     */
    function CarMakerView(props) {
      var focus = props && props.viewRequest && props.viewRequest.focus;
      // 升级向导只渲染一份：focus 命中 levelup 时放在 15 步之前（自动唤起置顶），
      // 否则放在其后 —— 旧版两处都 append，focus 时升级卡渲染两份（2026-10-05 修）。
      var focusLevelUp = focus && String(focus).indexOf("levelup") === 0 ? String(focus) : null;

      var root = el("div", B + "-host");
      root.style.cssText =
        "height:100%;overflow:auto;padding:18px 20px 28px;box-sizing:border-box;background:transparent";

      var head = el("header", B + "-head");
      head.appendChild(eyebrow("DND ENDLESS ADVENTURE / WORKSHOP"));
      var titleLine = el("div");
      titleLine.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap";
      titleLine.appendChild(h("\uD83C\uDFB4 车卡台 · 升级加点"));
      titleLine.appendChild(badge("v" + VERSION, "ok"));
      head.appendChild(titleLine);
      head.appendChild(
        p("与 AI 结合的车卡与升级工作台。下列 15 步逐字对齐参考站流程；数值一律以项目既有规则（世界书 + desc【建卡基线】）为准。", true)
      );
      root.appendChild(head);

      if (focusLevelUp) {
        root.appendChild(levelUpCard(focusLevelUp));
      }

      /* —— 建卡 15 步 —— */
      var buildCard = card("建卡流程 · 15 步");
      STEPS.forEach(function (s, i) {
        var r = row();
        var n = el("span", B + "-step-num", String(i + 1).padStart(2, "0"));
        n.style.cssText = "font:600 11px/1.7 " + T.mono + ";color:" + T.gold;
        var body = el("div");
        var nm = el("b", B + "-step-name", s[1]);
        nm.style.cssText = "font-size:13px;color:" + T.ink;
        body.appendChild(nm);
        var de = el("div", B + "-step-desc", s[2]);
        de.style.cssText = "font-size:11.5px;color:" + T.sub + ";margin-top:1px";
        body.appendChild(de);
        var key = el("code", B + "-step-key", s[0]);
        key.style.cssText = "font:11px/1.6 " + T.mono + ";color:" + T.sub + ";opacity:.7";
        r.appendChild(n); r.appendChild(body); r.appendChild(key);
        buildCard.appendChild(r);
      });
      root.appendChild(buildCard);

      /* —— 升级加点（focus 置顶时不再重复渲染） —— */
      if (!focusLevelUp) {
        root.appendChild(levelUpCard(null));
      }

      /* —— 诊断 —— */
      root.appendChild(diagCard());

      return root;
    }

    function levelUpCard(focus) {
      var c = card("升级加点 · AI 判定升级时自动唤起");
      c.appendChild(
        p("触发：AI 在 XP 达门槛的那一轮输出升级标记后，自动切到本页并聚焦升级向导。", true)
      );

      if (focus) {
        var hit = el("div", B + "-focus", "本次聚焦：" + String(focus));
        hit.style.cssText =
          "margin:8px 0;padding:6px 10px;border-left:3px solid " + T.gold +
          ";background:rgba(201,168,75,.08);font:12px/1.6 " + T.mono + ";color:" + T.ink;
        c.appendChild(hit);
      }

      var auto = el("div");
      auto.appendChild(eyebrow("自动结算（无需选择）"));
      LEVELUP_AUTO.forEach(function (t) {
        var li = el("div", B + "-auto-item", "· " + t);
        li.style.cssText = "font-size:12.5px;line-height:1.8;color:" + T.ink;
        auto.appendChild(li);
      });
      c.appendChild(auto);

      var pick = el("div");
      pick.style.marginTop = "12px";
      pick.appendChild(eyebrow("需要你选择"));
      LEVELUP_CHOICES.forEach(function (it) {
        var r = row();
        var mark = el("span", B + "-pick-mark", it[2] === "推定" ? "?" : "*");
        mark.style.cssText = "font:600 12px/1.7 " + T.mono + ";color:" + (it[2] === "推定" ? T.danger : T.ok);
        var body = el("div");
        var nm = el("b", null, it[0]);
        nm.style.cssText = "font-size:13px;color:" + T.ink;
        body.appendChild(nm);
        var de = el("div", null, it[1]);
        de.style.cssText = "font-size:11.5px;color:" + T.sub + ";margin-top:1px";
        body.appendChild(de);
        var tag = badge(it[2] === "推定" ? "〔规则推定〕" : "已收录", it[2] === "推定" ? "warn" : "ok");
        tag.style.marginLeft = "0";
        r.appendChild(mark); r.appendChild(body); r.appendChild(tag);
        pick.appendChild(r);
      });
      var note = p(
        "标注〔规则推定〕的两项在项目既有规则里【未收录】属性值提升（ASI）与专长获取条款，按世界书《规则推定协议》补全，界面与输出文本都会显式标注，你可在【房间规则区】否决或改写。",
        true
      );
      note.style.color = T.danger;
      note.style.fontSize = "11.5px";
      pick.appendChild(note);
      c.appendChild(pick);

      return c;
    }

    function diagCard() {
      var c = card("插件自检 · 运行时能力探测");
      var info = el("pre");
      info.style.cssText =
        "margin:0;padding:10px;border-radius:8px;background:rgba(0,0,0,.18);overflow:auto;" +
        "font:11.5px/1.7 " + T.mono + ";color:" + T.ink;
      info.textContent = [
        "plugin      : @local/dsh-dnd-ui v" + VERSION,
        "module id   : dnd-ui",
        "react       : " + (React && React.version ? React.version : "(unknown)"),
        "slots       : " + (SLOT_PROBE.available.length ? SLOT_PROBE.available.join(", ") : "(none yet)"),
        "slot errors : " + (SLOT_PROBE.errors.length ? SLOT_PROBE.errors.join(" | ") : "(none)"),
        "seed words  : react, react/jsx-runtime, react-dom, @deepseek-ai/cordis, dsh-client-store, dsh-client-ui-slots, dsh-client-ui-primitives",
      ].join("\n");
      c.appendChild(info);
      return c;
    }

    /* ───────────────────────── 槽位注册 ───────────────────────── */

    /** 探测结果留给诊断卡显示；也便于离线脚本断言。 */
    var SLOT_PROBE = { available: [], errors: [] };

    function tryRegister(slots, slotName, component, logger) {
      try {
        slots.inject(slotName, function () {
          try {
            var dispose = slots.register(
              {
                name: slotName,
                id: "dnd-carmaker",
                order: 20,
                label: function () {
                  return "\uD83C\uDFB4 车卡台";
                },
              },
              component
            );
            SLOT_PROBE.available.push(slotName);
            return dispose;
          } catch (e) {
            SLOT_PROBE.errors.push(slotName + ": " + (e && e.message ? e.message : e));
            return function () {};
          }
        });
        return true;
      } catch (e) {
        SLOT_PROBE.errors.push(slotName + " (inject): " + (e && e.message ? e.message : e));
        if (logger) logger("register " + slotName + " failed: " + e);
        return false;
      }
    }

    function apply(ctx) {
      var slots = ctx && ctx.slots;
      if (!slots) {
        // 留痕：静默 return 会让"槽位服务没注入"与"注册失败"看起来一样（2026-10-05 修）。
        var msg = "dnd-ui: ctx.slots missing (inject not honored?) - skip slot registration";
        try { if (ctx && ctx.logger) ctx.logger(msg); else console.warn(msg); } catch (e) { /* 忽略 */ }
        return;
      }
      tryRegister(slots, "conversation.view", CarMakerView, ctx.logger);
    }

    exports.apply = apply;
    exports.CarMakerView = CarMakerView;
    exports.STEPS = STEPS;
    exports.VERSION = VERSION;
    exports.SLOT_PROBE = SLOT_PROBE;
    return module.exports;
  },
});
