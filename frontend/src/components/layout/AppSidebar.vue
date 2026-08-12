<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useMoodStore, MOOD_PRESETS } from '@/stores/mood'
import { useAnime } from '@/composables/useAnime'

const route = useRoute()
const moodStore = useMoodStore()
const { burst, runPreset } = useAnime()

const collapsed = ref(false)
const ventText = ref('')

const navItems = [
  { name: 'dashboard', title: '总览', icon: '□' },
  { name: 'plan', title: '计划', icon: '☑' },
  { name: 'ledger', title: '记账', icon: '¤' },
  { name: 'mood', title: '心情', icon: '◉' },
  { name: 'news', title: '热点', icon: '✦' },
  { name: 'settings', title: '设置', icon: '⚙' }
]

const isActive = (name) => route.name === name

const recentDates = computed(() => {
  const dates = []
  const today = new Date()
  for (let i = 83; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    dates.push(d.toISOString().split('T')[0])
  }
  return dates
})

const recentWeeks = computed(() => {
  const weeks = []
  for (let i = 0; i < 12; i++) {
    weeks.push(recentDates.value.slice(i * 7, (i + 1) * 7))
  }
  return weeks.reverse()
})

function getMood(date) {
  return moodStore.getEntry(date)
}

function getCellColor(date) {
  const mood = getMood(date)
  if (!mood) return 'var(--bg-muted)'
  const alpha = 0.35 + (mood.intensity || 2) * 0.18
  return mood.color + Math.round(alpha * 255).toString(16).padStart(2, '0')
}

async function handleCellClick(date, event) {
  const existing = getMood(date)
  if (existing) {
    await moodStore.saveMood(date, { ...existing, note: ventText.value || existing.note })
  } else {
    const preset = MOOD_PRESETS[Math.floor(Math.random() * MOOD_PRESETS.length)]
    await moodStore.saveMood(date, {
      color: preset.color,
      label: preset.label,
      note: ventText.value,
      intensity: 2
    })
  }

  const rect = event.target.getBoundingClientRect()
  burst(rect.left + rect.width / 2, rect.top + rect.height / 2, {
    count: 10,
    colors: ['#f59e0b', '#3b82f6', '#10b981', '#ef4444']
  })
}

async function submitVent(event) {
  if (!ventText.value.trim()) return
  const today = moodStore.today
  const existing = getMood(today)
  const payload = existing
    ? { ...existing, note: ventText.value }
    : {
        color: MOOD_PRESETS[0].color,
        label: MOOD_PRESETS[0].label,
        note: ventText.value,
        intensity: 2
      }
  await moodStore.saveMood(today, payload)
  ventText.value = ''

  if (event && event.target) {
    const rect = event.target.getBoundingClientRect()
    burst(rect.left + rect.width / 2, rect.top, { count: 8 })
  }
}

onMounted(() => {
  moodStore.fetchMoods()
})

watch(() => route.name, () => {
  runPreset('.sidebar-nav-item', 'staggerFadeUp')
})
</script>

<template>
  <aside class="app-sidebar" :class="{ collapsed }">
    <div class="sidebar-header">
      <div class="brand">
        <span class="brand-mark">∿</span>
        <span v-if="!collapsed" class="brand-name">DailyPlan</span>
      </div>
      <button class="collapse-btn" @click="collapsed = !collapsed" title="折叠/展开">
        {{ collapsed ? '»' : '«' }}
      </button>
    </div>

    <nav class="sidebar-nav">
      <router-link
        v-for="item in navItems"
        :key="item.name"
        :to="{ name: item.name }"
        class="sidebar-nav-item"
        :class="{ active: isActive(item.name) }"
      >
        <span class="nav-icon">{{ item.icon }}</span>
        <span v-if="!collapsed" class="nav-title">{{ item.title }}</span>
      </router-link>
    </nav>

    <div v-if="!collapsed" class="sidebar-mood">
      <div class="mood-header">
        <span class="mood-title">近 12 周心情</span>
        <router-link :to="{ name: 'mood' }" class="mood-link">查看全部</router-link>
      </div>
      <div class="mood-mini-grid">
        <div v-for="(week, wIndex) in recentWeeks" :key="wIndex" class="mood-week">
          <div
            v-for="date in week"
            :key="date"
            class="mood-cell"
            :style="{ backgroundColor: getCellColor(date) }"
            :title="date + (getMood(date) ? ` · ${getMood(date).label}` : '')"
            @click="handleCellClick(date, $event)"
          ></div>
        </div>
      </div>
    </div>

    <div v-if="!collapsed" class="sidebar-vent">
      <div class="vent-label">每日吐槽</div>
      <textarea
        v-model="ventText"
        class="vent-input"
        placeholder="今天发生了什么？吐槽一下…"
        rows="3"
        @keydown.enter.prevent="submitVent"
      ></textarea>
      <button class="btn btn-primary btn-sm vent-submit" @click="submitVent">
        发送
      </button>
    </div>

    <div v-if="!collapsed" class="sidebar-footer">
      <span class="footer-hint">Ctrl+Enter 快捷发送</span>
    </div>
  </aside>
</template>

<style scoped>
.app-sidebar {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 260px;
  z-index: var(--z-sticky);
  display: flex;
  flex-direction: column;
  padding: var(--space-5);
  background: var(--glass-bg);
  border-right: 1px solid var(--glass-border);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: var(--glass-shadow);
  transition: width var(--duration-normal) var(--ease-out);
}

.app-sidebar.collapsed {
  width: 72px;
  padding: var(--space-4) var(--space-3);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-6);
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.brand-mark {
  font-family: var(--font-heading);
  font-size: 1.75rem;
  color: var(--accent);
  line-height: 1;
}

.brand-name {
  font-family: var(--font-heading);
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--text-primary);
}

.collapse-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  color: var(--text-muted);
  font-size: var(--text-sm);
  transition: background var(--duration-fast) var(--ease-out);
}

.collapse-btn:hover {
  background: var(--bg-muted);
  color: var(--text-primary);
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-bottom: var(--space-6);
}

.sidebar-nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: 500;
  transition: background var(--duration-fast) var(--ease-out),
              color var(--duration-fast) var(--ease-out),
              transform var(--duration-fast) var(--ease-out);
}

.sidebar-nav-item:hover {
  background: var(--bg-muted);
  color: var(--text-primary);
  transform: translateX(3px);
}

.sidebar-nav-item.active {
  background: var(--accent);
  color: var(--text-inverse);
  box-shadow: 0 2px 8px rgba(30, 32, 48, 0.18);
}

.nav-icon {
  font-size: 1rem;
  width: 20px;
  text-align: center;
}

.sidebar-mood {
  margin-bottom: var(--space-5);
  padding: var(--space-4);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.mood-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3);
}

.mood-title {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--text-secondary);
}

.mood-link {
  font-size: var(--text-xs);
  color: var(--accent);
  transition: opacity var(--duration-fast) var(--ease-out);
}

.mood-link:hover {
  opacity: 0.7;
}

.mood-mini-grid {
  display: flex;
  flex-direction: row-reverse;
  gap: 3px;
  overflow-x: auto;
  padding-bottom: var(--space-1);
}

.mood-week {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.mood-cell {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: var(--bg-muted);
  cursor: pointer;
  transition: transform var(--duration-fast) var(--ease-out),
              box-shadow var(--duration-fast) var(--ease-out);
}

.mood-cell:hover {
  transform: scale(1.6);
  box-shadow: 0 0 0 2px var(--accent-muted);
  z-index: 1;
}

.sidebar-vent {
  margin-top: auto;
  margin-bottom: var(--space-4);
}

.vent-label {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: var(--space-2);
}

.vent-input {
  width: 100%;
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-size: var(--text-sm);
  resize: none;
  line-height: 1.5;
  transition: border-color var(--duration-fast) var(--ease-out);
}

.vent-input:focus {
  outline: none;
  border-color: var(--accent);
}

.vent-submit {
  width: 100%;
  margin-top: var(--space-2);
}

.sidebar-footer {
  text-align: center;
}

.footer-hint {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .app-sidebar {
    transform: translateX(-100%);
    transition: transform var(--duration-normal) var(--ease-out);
  }
  .app-sidebar.open {
    transform: translateX(0);
  }
}
</style>
