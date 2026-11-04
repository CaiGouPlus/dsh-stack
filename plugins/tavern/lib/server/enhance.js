// 通用增强层的运行时块：正文来自 lib/enhance-runtime-layer.txt（DIY 的数据文件驱动版）。
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** 开关：tavern-state.json 的 enhanceRuntime === true。 */
export function enhanceRuntimeEnabled(state) {
  return !!(state && state.enhanceRuntime === true)
}

/**
 * 运行时注入块（开关打开时追加到 system prompt 的最后一段）。
 *
 * 正文以同目录上一级的 `lib/enhance-runtime-layer.txt` 为准：
 * 文件存在且非空就用它（改文件即时生效，无需重启），否则返回空串、不注入。
 */
export function buildEnhanceRuntimeBlock() {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const file = path.join(here, '..', 'enhance-runtime-layer.txt')
    const custom = readFileSync(file, 'utf8')
    if (custom.trim() !== '') return custom.trimEnd()
  } catch { /* 文件缺失/不可读：不注入 */ }
  return ''
}
