/* ═══════════════════════════════════════
   constants.js — Immutable app constants
   ═══════════════════════════════════════ */

/* ── XP system ── */
export const XP_LVL_BASE = 100
export const XP_LVL_MULT = 1.5

/* ── Categories ── */
export const CAT_EMOJI = { study: '📚', work: '💼', life: '🏠', health: '💪', review: '📝', other: '📌' }
export const CAT_LABELS = { study: '学习', work: '工作', life: '生活', health: '健康', review: '复盘', other: '其他' }
export const PRI_LABELS = { high: '🔴 高', medium: '🟡 中', low: '🟢 低' }

/* ── Mode hierarchy ── */
export const MODE_ORDER = ['full', 'minimum', 'recovery']
export const MODE_HIERARCHY = { full: 3, minimum: 2, recovery: 1 }
export const DEFAULT_MODE_CFG = {
  full:     { label: '🔋 完整', factor: 1.0,  hours: '6-8h',  desc: '状态好，全力以赴。' },
  minimum:  { label: '⚡ 最低', factor: 0.55, hours: '3-4h',  desc: '先保底，完成核心任务就是胜利。' },
  recovery: { label: '🌱 恢复', factor: 0.25, hours: '1-2h',  desc: '慢下来，为明天蓄力。' }
}

/* ── Theme presets ── */
export const THEME_PRESETS = {
  sakura: { label: '🌸 樱', accent: '#c4647a' },
  forest: { label: '🌿 林', accent: '#4a7c5a' },
  ocean:  { label: '🌊 海', accent: '#3b6e8e' },
  sunset: { label: '🌅 晖', accent: '#c47a4a' },
  noir:   { label: '🖤 墨', accent: '#666' },
  vapor:  { label: '💜 幻', accent: '#7b5ea7' },
  aurora: { label: '🌌 极', accent: '#3a8a7a' },
  ember:  { label: '🔥 烬', accent: '#b84a3c' }
}

/* ── Storage keys ── */
export const ARCHIVE_PREFIX = 'dp_archive_'

/* ── Timer constants ── */
export const WORK_MINUTES = 25
export const BREAK_MINUTES = 5
