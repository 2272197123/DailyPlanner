import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/api/client'

const DEFAULT_SOURCES = [
  { id: 'hackernews', name: 'Hacker News', active: true, type: 'api', url: 'https://news.ycombinator.com' },
  { id: 'techcrunch', name: 'TechCrunch', active: false, type: 'rss', url: 'https://techcrunch.com/feed/' },
  { id: '36kr', name: '36Kr 科技', active: true, type: 'rss', url: 'https://36kr.com/feed' },
  { id: 'verge', name: 'The Verge', active: false, type: 'rss', url: 'https://www.theverge.com/rss/index.xml' }
]

const MOCK_NEWS = [
  {
    id: 1,
    title: 'OpenAI 发布新一代多模态模型，推理能力显著提升',
    summary: '新模型在数学、代码和视觉理解任务上取得突破性进展，API 延迟降低约 40%。',
    source: '36Kr 科技',
    time: '2 小时前',
    tag: 'AI'
  },
  {
    id: 2,
    title: 'Rust 基金会宣布 2026 年生态扶持计划',
    summary: '重点支持嵌入式、WebAssembly 和操作系统内核方向，资金池扩大至 300 万美元。',
    source: 'Hacker News',
    time: '4 小时前',
    tag: '编程语言'
  },
  {
    id: 3,
    title: '欧盟通过《人工智能责任指令》最终草案',
    summary: '新规明确了高风险 AI 系统的责任归属，预计 2027 年正式生效。',
    source: 'TechCrunch',
    time: '6 小时前',
    tag: '政策'
  },
  {
    id: 4,
    title: 'Linux Kernel 6.15 发布，新增多项文件系统优化',
    summary: 'ext4 和 Btrfs 性能提升明显，同时改进了对 ARM 架构的支持。',
    source: 'Hacker News',
    time: '8 小时前',
    tag: '开源'
  },
  {
    id: 5,
    title: 'SpaceX 星舰完成第七次轨道试飞',
    summary: '本次试飞验证了新型热防护系统，为后续载人登月任务奠定基础。',
    source: 'The Verge',
    time: '10 小时前',
    tag: '航天'
  }
]

export const useNewsStore = defineStore('news', () => {
  const sources = ref([...DEFAULT_SOURCES])
  const items = ref([...MOCK_NEWS])
  const loading = ref(false)
  const error = ref('')

  const activeSources = computed(() => sources.value.filter(s => s.active))
  const filteredItems = computed(() => {
    const activeNames = new Set(activeSources.value.map(s => s.name))
    return items.value.filter(item => activeNames.has(item.source))
  })

  async function loadSources() {
    try {
      const { data } = await api.get('/prefs')
      const newsPrefs = data?.newsSources
      if (newsPrefs && Array.isArray(newsPrefs)) {
        sources.value = newsPrefs
      }
    } catch (err) {
      console.warn('Failed to load news sources:', err)
    }
  }

  async function saveSources() {
    try {
      await api.put('/prefs', { newsSources: sources.value })
    } catch (err) {
      console.warn('Failed to save news sources:', err)
    }
  }

  function toggleSource(id) {
    const s = sources.value.find(x => x.id === id)
    if (s) {
      s.active = !s.active
      saveSources()
    }
  }

  function addSource(name, url, type = 'rss') {
    const id = 'custom-' + Date.now()
    sources.value.push({ id, name, url, type, active: true })
    saveSources()
  }

  function removeSource(id) {
    sources.value = sources.value.filter(s => s.id !== id)
    saveSources()
  }

  async function refresh() {
    loading.value = true
    error.value = ''
    try {
      // Placeholder: in production, call /api/news or external API
      await new Promise(r => setTimeout(r, 800))
      items.value = [...MOCK_NEWS]
    } catch (err) {
      error.value = '刷新失败'
    } finally {
      loading.value = false
    }
  }

  return {
    sources,
    items,
    loading,
    error,
    activeSources,
    filteredItems,
    loadSources,
    saveSources,
    toggleSource,
    addSource,
    removeSource,
    refresh
  }
})
