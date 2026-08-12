<script setup>
import { computed, onMounted, ref } from 'vue'
import { useScheduleStore } from '@/stores/schedule'
import { useMoodStore } from '@/stores/mood'
import { useCurrencyStore } from '@/stores/currency'
import { useAnime } from '@/composables/useAnime'

const scheduleStore = useScheduleStore()
const moodStore = useMoodStore()
const currencyStore = useCurrencyStore()
const { staggerEnter } = useAnime()

const mounted = ref(false)

const todayBlocks = computed(() => scheduleStore.todayBlocks || [])
const completedCount = computed(() => todayBlocks.value.filter(b => b.done).length)
const totalCount = computed(() => todayBlocks.value.length)
const progress = computed(() => totalCount.value ? (completedCount.value / totalCount.value) * 100 : 0)
const todayMood = computed(() => moodStore.todayMood)
const balance = computed(() => currencyStore.balance || 0)

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了，注意休息'
  if (hour < 11) return '早上好，开启新的一天'
  if (hour < 14) return '中午好，记得休息'
  if (hour < 18) return '下午好，保持专注'
  return '晚上好，回顾今天'
})

onMounted(() => {
  scheduleStore.fetchDay(scheduleStore.currentDate)
  mounted.value = true
  requestAnimationFrame(() => {
    staggerEnter('.dash-card', document.querySelector('.dashboard-view'))
  })
})
</script>

<template>
  <div class="dashboard-view" v-if="mounted">
    <header class="dash-header">
      <div>
        <h1 class="dash-greeting">{{ greeting }}</h1>
        <p class="dash-date">{{ new Date().toLocaleDateString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) }}</p>
      </div>
      <div class="dash-xp">
        <span class="xp-label">当前 Wafer</span>
        <span class="xp-value">{{ balance }}</span>
      </div>
    </header>

    <div class="dash-grid">
      <div class="dash-card card">
        <div class="card-icon">☑</div>
        <div class="card-meta">
          <div class="card-value">{{ completedCount }}/{{ totalCount }}</div>
          <div class="card-label">今日计划完成</div>
        </div>
        <div class="card-progress">
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: `${progress}%` }"></div>
          </div>
        </div>
      </div>

      <div class="dash-card card">
        <div class="card-icon" :style="{ color: todayMood?.color || 'var(--text-muted)' }">◉</div>
        <div class="card-meta">
          <div class="card-value">{{ todayMood?.label || '未记录' }}</div>
          <div class="card-label">今日心情</div>
        </div>
        <div v-if="todayMood?.note" class="card-note">{{ todayMood.note }}</div>
      </div>

      <div class="dash-card card">
        <div class="card-icon">¤</div>
        <div class="card-meta">
          <div class="card-value">--</div>
          <div class="card-label">本月收支</div>
        </div>
        <div class="card-hint">记账模块开发中</div>
      </div>

      <div class="dash-card card">
        <div class="card-icon">✦</div>
        <div class="card-meta">
          <div class="card-value">--</div>
          <div class="card-label">科技热点</div>
        </div>
        <div class="card-hint">新闻源配置中</div>
      </div>
    </div>

    <section class="dash-section card">
      <h2 class="section-title">快速入口</h2>
      <div class="quick-links">
        <router-link :to="{ name: 'plan' }" class="quick-link">
          <span class="quick-icon">☑</span>
          <span>制定今日计划</span>
        </router-link>
        <router-link :to="{ name: 'mood' }" class="quick-link">
          <span class="quick-icon">◉</span>
          <span>记录心情</span>
        </router-link>
        <router-link :to="{ name: 'ledger' }" class="quick-link">
          <span class="quick-icon">¤</span>
          <span>记一笔</span>
        </router-link>
        <router-link :to="{ name: 'news' }" class="quick-link">
          <span class="quick-icon">✦</span>
          <span>浏览热点</span>
        </router-link>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dashboard-view {
  max-width: 960px;
}

.dash-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: var(--space-6);
}

.dash-greeting {
  font-family: var(--font-heading);
  font-size: var(--text-2xl);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: var(--space-1);
}

.dash-date {
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.dash-xp {
  text-align: right;
}

.xp-label {
  display: block;
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-bottom: var(--space-1);
}

.xp-value {
  font-family: var(--font-data);
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--accent);
}

.dash-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.dash-card {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-3);
  align-items: center;
  min-height: 120px;
}

.card-icon {
  font-size: 1.75rem;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-muted);
  border-radius: var(--radius-lg);
}

.card-value {
  font-family: var(--font-data);
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--text-primary);
}

.card-label {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.card-progress {
  grid-column: 1 / -1;
}

.progress-track {
  height: 6px;
  background: var(--bg-muted);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-lighter));
  border-radius: var(--radius-full);
  transition: width 0.8s var(--ease-out);
}

.card-note {
  grid-column: 1 / -1;
  font-size: var(--text-xs);
  color: var(--text-muted);
  background: var(--bg-muted);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-hint {
  grid-column: 1 / -1;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.dash-section {
  padding: var(--space-5);
}

.dash-section .section-title {
  margin-bottom: var(--space-4);
}

.quick-links {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-3);
}

.quick-link {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-4);
  background: var(--bg-muted);
  border-radius: var(--radius-lg);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  transition: transform var(--duration-fast) var(--ease-out),
              background var(--duration-fast) var(--ease-out),
              color var(--duration-fast) var(--ease-out);
}

.quick-link:hover {
  background: var(--accent);
  color: var(--text-inverse);
  transform: translateY(-3px);
}

.quick-icon {
  font-size: 1.5rem;
}

@media (max-width: 768px) {
  .dash-grid {
    grid-template-columns: 1fr;
  }
  .quick-links {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
