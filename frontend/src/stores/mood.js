import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api, { unwrap } from '@/api/client'
import { toLocalDate } from '@/utils/format'
import { mixColors } from '@/utils/color'

export const MOOD_PRESETS = [
  { id: 'joy', label: '开心', color: '#f59e0b' },
  { id: 'calm', label: '平静', color: '#3b82f6' },
  { id: 'tired', label: '疲惫', color: '#8b5cf6' },
  { id: 'anxious', label: '焦虑', color: '#ef4444' },
  { id: 'productive', label: '充实', color: '#10b981' },
  { id: 'neutral', label: '一般', color: '#9ca3af' },
  { id: 'creative', label: '灵感', color: '#ec4899' },
  { id: 'focused', label: '专注', color: '#06b6d4' }
]

export const useMoodStore = defineStore('mood', () => {
  const entries = ref({})
  const presets = ref([...MOOD_PRESETS])
  const customColors = ref([])
  const loading = ref(false)

  const today = computed(() => toLocalDate(new Date()))

  const todayMood = computed(() => entries.value[today.value] || null)

  function getEntry(date) {
    return entries.value[date] || null
  }

  /* 当日吐槽（多条）；无记录返回空数组 */
  function getVents(date) {
    return entries.value[date]?.vents || []
  }

  /* 当日颜色：有吐槽 → 线性光混合色；无吐槽 → 预设/手动色 */
  function dayColor(date) {
    const entry = entries.value[date]
    if (!entry) return null
    const vents = entry.vents || []
    return vents.length ? mixColors(vents.map(v => v.color)) : entry.color
  }

  function setEntry(date, { color, label, note = '', intensity = 2 }) {
    const prev = entries.value[date]
    const vents = prev?.vents || []
    entries.value[date] = {
      date,
      // 有吐槽时颜色由吐槽混合决定，预设卡只改基调（与后端 save_mood 一致）
      color: vents.length ? mixColors(vents.map(v => v.color)) : color,
      label,
      note,
      intensity,
      vents,
      updatedAt: new Date().toISOString()
    }
  }

  /* 按年去重：同年会话内只拉一次（App.vue / AppSidebar 双调用合并于此），并发单飞 */
  const loadedYears = new Set()
  const moodsInFlight = new Map()

  async function fetchMoods(year = new Date().getFullYear()) {
    if (loadedYears.has(year)) return
    if (moodsInFlight.has(year)) return moodsInFlight.get(year)
    loading.value = true
    const p = (async () => {
      try {
        const { data } = await api.get('/moods', { params: { year } })
        const list = unwrap(data)
        if (Array.isArray(list)) {
          const mapped = {}
          list.forEach(item => {
            mapped[item.date] = item
          })
          entries.value = { ...entries.value, ...mapped }
          loadedYears.add(year)
        }
      } catch (err) {
        console.warn('Failed to fetch moods:', err)
      } finally {
        loading.value = false
        moodsInFlight.delete(year)
      }
    })()
    moodsInFlight.set(year, p)
    return p
  }

  async function saveMood(date, payload) {
    setEntry(date, payload)
    try {
      // 后端 MoodEntry 要求 payload 含 date 字段
      await api.put(`/mood/${date}`, { date, ...payload })
    } catch (err) {
      console.warn('Failed to save mood:', err)
    }
  }

  async function deleteMood(date) {
    delete entries.value[date]
    try {
      await api.delete(`/mood/${date}`)
    } catch (err) {
      console.warn('Failed to delete mood:', err)
    }
  }

  /* ── 吐槽（多条/天，颜色混合成当日色）── */

  function _ensureEntry(date) {
    if (!entries.value[date]) {
      entries.value[date] = {
        date, color: '#9ca3af', label: '一般', note: '', intensity: 2, vents: []
      }
    }
    if (!entries.value[date].vents) entries.value[date].vents = []
    return entries.value[date]
  }

  /* 乐观更新：先上屏，失败回滚并抛错（调用方 toast） */
  async function addVent(date, { text, color }) {
    const created = !entries.value[date]
    const entry = _ensureEntry(date)
    const prevColor = entry.color
    const temp = { id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text, color, created_at: '' }
    entry.vents.push(temp)
    entry.color = mixColors(entry.vents.map(v => v.color))
    try {
      const { data } = await api.post(`/mood/${date}/vents`, { text, color })
      if (data && data.id) temp.id = data.id
      return temp
    } catch (err) {
      entry.vents = entry.vents.filter(v => v.id !== temp.id)
      // 回滚到添加前的颜色；本地产物（后端无该行）整个撤掉，避免幽灵灰格
      if (created) delete entries.value[date]
      else entry.color = prevColor
      throw err
    }
  }

  async function removeVent(date, ventId) {
    const entry = entries.value[date]
    if (!entry || !entry.vents) return
    const idx = entry.vents.findIndex(v => v.id === ventId)
    if (idx < 0) return
    const [removed] = entry.vents.splice(idx, 1)
    // 删空后保持当前混合色：后端 _refresh_day_color 对无 vents 的日不回写，两侧口径一致
    entry.color = entry.vents.length ? mixColors(entry.vents.map(v => v.color)) : entry.color
    try {
      await api.delete(`/mood/vents/${ventId}`)
    } catch (err) {
      entry.vents.splice(Math.min(idx, entry.vents.length), 0, removed)
      entry.color = mixColors(entry.vents.map(v => v.color))
      throw err
    }
  }

  function addCustomPreset(label, color) {
    const id = `custom-${Date.now()}`
    const preset = { id, label, color, isCustom: true }
    presets.value.push(preset)
    customColors.value.push(color)
    return preset
  }

  function removeCustomPreset(id) {
    presets.value = presets.value.filter(p => p.id !== id)
  }

  return {
    entries,
    presets,
    customColors,
    loading,
    today,
    todayMood,
    getEntry,
    getVents,
    dayColor,
    setEntry,
    fetchMoods,
    saveMood,
    deleteMood,
    addVent,
    removeVent,
    addCustomPreset,
    removeCustomPreset
  }
})
