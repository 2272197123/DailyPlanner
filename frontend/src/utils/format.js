import { XP_LVL_BASE, XP_LVL_MULT } from './constants.js'

/** Escape HTML to prevent XSS */
export function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Format seconds → HH:MM:SS */
export function fmtTimeHMS(totalSec) {
  if (!totalSec || totalSec < 0) return '00:00:00'
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = Math.floor(totalSec % 60)
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':')
}

/** Format minutes → human-readable */
export function fmtDuration(mins) {
  if (!mins || mins <= 0) return '——'
  if (mins < 60) return mins + ' 分钟'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? h + 'h ' + m + 'min' : h + ' 小时'
}

/** Get local date string YYYY-MM-DD */
export function toLocalDate(d) {
  const offset = d.getTimezoneOffset()
  const local = new Date(d.getTime() - offset * 60000)
  return local.toISOString().slice(0, 10)
}

/** 距离目标日期（YYYY-MM-DD）的整天数：>0 未来，0 今天，<0 已过；无效日期返回 null */
export function daysUntil(dateStr) {
  if (!dateStr) return null
  const target = new Date(dateStr + 'T00:00:00')
  if (isNaN(target.getTime())) return null
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target - today) / 86400000)
}

/** Format date for display */
export function fmtDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return dateStr + ' · ' + weekdays[d.getDay()]
}

/** Calculate XP reward for a task */
export function calcTaskReward(task) {
  const mins = task.duration || 25
  return Math.max(1, Math.min(20, Math.round(mins / 5)))
}

/** Get XP level from total XP */
export function getLevel(xp) {
  let lvl = 1
  let threshold = XP_LVL_BASE
  while (xp >= threshold) {
    xp -= threshold
    lvl++
    threshold = Math.round(threshold * XP_LVL_MULT)
  }
  return lvl
}

/** Get XP needed to next level */
export function xpToNextLevel(xp) {
  let remaining = xp
  let lvl = 1
  let threshold = XP_LVL_BASE
  let totalNeeded = threshold
  while (remaining >= threshold) {
    remaining -= threshold
    lvl++
    threshold = Math.round(threshold * XP_LVL_MULT)
    totalNeeded += threshold
  }
  return totalNeeded - xp
}
