import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api, { unwrap } from '@/api/client'

/* v13 新闻聚合：目录/勾选（/prefs 持久化）+ 服务端聚合抓取（/news/feed） */

export const useNewsStore = defineStore('news', () => {
  const catalog = ref([])      // [{id, name, domain, desc}]
  const activeIds = ref([])    // 用户勾选的源 id
  const sections = ref([])     // [{source, name, domain, items}]
  const errors = ref({})       // {sourceId: 错误信息}
  const fetchedAt = ref('')
  const loading = ref(false)
  const initialized = ref(false)

  /* 目录按领域分组（保持注册顺序），供选择器展示 */
  const domains = computed(() => {
    const groups = []
    for (const s of catalog.value) {
      let g = groups.find(x => x.domain === s.domain)
      if (!g) {
        g = { domain: s.domain, sources: [] }
        groups.push(g)
      }
      g.sources.push(s)
    }
    return groups
  })

  function isActive(id) {
    return activeIds.value.includes(id)
  }

  async function loadCatalog() {
    try {
      const { data } = await api.get('/news/catalog')
      catalog.value = unwrap(data) || []
    } catch {
      catalog.value = []
    }
  }

  async function loadPrefs() {
    const all = catalog.value.map(s => s.id)
    try {
      const { data } = await api.get('/prefs')
      const prefs = unwrap(data)
      let sel = prefs?.newsSources
      // 兼容旧格式：[{id, name, active, ...}] → 取 active 的 id
      if (Array.isArray(sel) && sel.length && typeof sel[0] === 'object') {
        sel = sel.filter(s => s.active).map(s => s.id)
      }
      if (Array.isArray(sel) && sel.length) {
        const valid = new Set(all)
        const kept = sel.filter(id => valid.has(id))
        activeIds.value = kept.length ? kept : all
      } else {
        activeIds.value = all // 默认全选
      }
    } catch {
      activeIds.value = all
    }
  }

  async function savePrefs() {
    try {
      await api.put('/prefs', { newsSources: [...activeIds.value] })
    } catch { /* silent */ }
  }

  function toggleSource(id) {
    const i = activeIds.value.indexOf(id)
    if (i === -1) activeIds.value.push(id)
    else activeIds.value.splice(i, 1)
    savePrefs()
    refresh()
  }

  async function refresh() {
    if (!activeIds.value.length) {
      sections.value = []
      errors.value = {}
      return
    }
    loading.value = true
    try {
      const { data } = await api.get('/news/feed', {
        params: { sources: activeIds.value.join(',') },
        timeout: 30000
      })
      const d = unwrap(data) || {}
      sections.value = d.sections || []
      errors.value = d.errors || {}
      fetchedAt.value = d.fetched_at || ''
    } catch {
      errors.value = { _all: '加载失败，请检查网络后重试' }
    } finally {
      loading.value = false
    }
  }

  async function init() {
    if (initialized.value) return
    initialized.value = true
    await loadCatalog()
    await loadPrefs()
    await refresh()
  }

  return {
    catalog, activeIds, sections, errors, fetchedAt, loading,
    domains, isActive, init, toggleSource, refresh
  }
})
