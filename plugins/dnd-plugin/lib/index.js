/**
 * @local/dsh-dnd-ui — 宿主（Node）半边。
 *
 * 为什么这个文件几乎是空的：
 *   DSH 的客户端插件是「宿主半边 + 浏览器半边」的双面包。本插件的全部行为都在浏览器里
 *   （注册 conversation.view / shell.overlay 槽位并渲染 React 组件），宿主侧不需要
 *   注册任何服务、路由或工具。但 `dsh.bundle.patch` 指向的行必须能被 resolve 到一个
 *   真实的包入口，所以这里保留一个合法的空插件。
 *
 * 若将来需要"官方通道"读写数据（例如把车卡草稿落到磁盘、或提供 /api/dnd-ui/* 路由），
 * 就在这里用 ctx.xxx 注册——那属于宿主半边的活。
 */

export const name = 'dnd-ui'

/** Cordis 入口。宿主半边当前无事可做。 */
export function apply() {}
