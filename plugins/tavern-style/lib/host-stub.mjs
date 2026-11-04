/**
 * host 半边「空壳」版：只验证「这一行能不能激活」。
 * 用它做二分：如果连它都卡在 `loading`，问题就不在插件的业务代码里；
 * 如果它能激活（并写出 data/probe-stub.json），说明问题出在真正的 host 代码或 client 半边。
 */

import { mkdirSync, writeFileSync } from 'node:fs'

export const name = 'tavern-style'

export function apply(ctx) {
  try {
    const dir = 'D:/DSH/tavern-style/data'
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      dir + '/probe-stub.json',
      JSON.stringify({ at: Date.now(), phase: 'apply-entered', hasWebServer: ctx?.webServer !== undefined }, null, 1),
      'utf8',
    )
  } catch {
    /* ignore */
  }
}
