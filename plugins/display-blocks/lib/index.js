// dsh-display-blocks —— 宿主半边
//
// 有意做成**空 apply**，理由有两条：
//   1. 本插件的渲染全在浏览器侧（见 lib/client.js），宿主这边没有服务要做；
//   2. 不 import 任何 `@deepseek-ai/dsh*` —— 启动期的兼容性门禁只检查
//      `@deepseek-ai/dsh*` 的 peer 范围，没有这类 peer 就没有可失败的门，
//      插件不会被**静默 disable**（这个 profile 里已经栽过一次：
//      dsh-better-sidebar 的旧版本就是被静默禁掉的）。
//
// 纯函数模块（spec / parse / render）通过 package.json 的 exports 单独暴露，
// 别的插件或夹具可以直接 `import 'dsh-display-blocks/spec'` 复用词表与解析，
// 不需要走宿主。

export const name = 'dsh-display-blocks'

/** 宿主侧无依赖，apply 只留一个可观测的日志，便于在启动日志里确认它加载了。 */
export function apply(ctx) {
  try {
    ctx?.logger?.info?.('[display-blocks] 宿主半边已加载（渲染在浏览器侧；核心模块可直接 import 复用）')
  } catch {
    // 连 logger 都拿不到也不能抛 —— 空 apply 必须绝对安全。
  }
}
