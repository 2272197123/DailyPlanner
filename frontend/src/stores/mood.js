import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/api/client'

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

  const today = computed(() => new Date().toISOString().split('T')[0])

  const todayMood = computed(() => entries.value[today.value] || null)

  const yearEntries = computed(() => {
    const result = {}
    const currentYear = new Date().getFullYear()
    Object.entries(entries.value).forEach(([date, entry]) => {
      if (date.startsWith(String(currentYear))) {
        result[date] = entry
      }
    })
    return result
  })

  function getEntry(date) {
    return entries.value[date] || null
  }

  function setEntry(date, { color, label, note = '', intensity = 2 }) {
    entries.value[date] = {
      date,
      color,
      label,
      note,
      intensity,
      updatedAt: new Date().toISOString()
    }
  }

  async function fetchMoods(year = new Date().getFullYear()) {
    loading.value = true
    try {
      const { data } = await api.get('/moods', { params: { year } })
      if (data && Array.isArray(data)) {
        const mapped = {}
        data.forEach(item => {
          mapped[item.date] = item
        })
        entries.value = { ...entries.value, ...mapped }
      }
    } catch (err) {
      console.warn('Failed to fetch moods:', err)
    } finally {
      loading.value = false
    }
  }

  async function saveMood(date, payload) {
    setEntry(date, payload)
    try {
      await api.put(`/mood/${date}`, payload)
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
    yearEntries,
    getEntry,
    setEntry,
    fetchMoods,
    saveMood,
    deleteMood,
    addCustomPreset,
    removeCustomPreset
  }
})
