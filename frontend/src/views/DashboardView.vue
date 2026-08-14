<script setup>
import { computed, onMounted, ref } from 'vue'
import { useScheduleStore } from '@/stores/schedule'
import { useMoodStore } from '@/stores/mood'
import { useCurrencyStore } from '@/stores/currency'
import { useAccountingStore } from '@/stores/accounting'
import { useNewsStore } from '@/stores/news'
import { useGoalStore } from '@/stores/goals'
import { toLocalDate, daysUntil } from '@/utils/format'
import { useAnime } from '@/composables/useAnime'

const scheduleStore = useScheduleStore()
const moodStore = useMoodStore()
const currencyStore = useCurrencyStore()
const accountingStore = useAccountingStore()
const newsStore = useNewsStore()
const goalStore = useGoalStore()
const { staggerEnter } = useAnime()

const mounted = ref(false)

const todayBlocks = computed(() => scheduleStore.todayBlocks || [])
const completedCount = computed(() => todayBlocks.value.filter(b => b.completed).length)
const totalCount = computed(() => todayBlocks.value.length)
const progress = computed(() => totalCount.value ? (completedCount.value / totalCount.value) * 100 : 0)
const todayMood = computed(() => moodStore.todayMood)
const balance = computed(() => currencyStore.balance || 0)

/* ── 本月收支（真实记账数据）── */
const monthSummary = computed(() => {
  const month = toLocalDate(new Date()).slice(0, 7)
  const entries = (accountingStore.entries || []).filter(e => e.date && e.date.startsWith(month))
  const income = entries.filter(e => e.type === 'income').reduce((s, e) => s + (e.amount || 0), 0)
  const expense = entries.filter(e => e.type === 'expense').reduce((s, e) => s + (e.amount || 0), 0)
  return { income, expense }
})

/* ── 新闻热点（v13：来自服务端聚合的真实新闻流）── */
const topNews = computed(() => {
  const out = []
  for (const sec of newsStore.sections || []) {
    for (const item of sec.items || []) {
      out.push({ title: item.title, sourceName: sec.name, url: item.url })
      if (out.length >= 3) return out
    }
  }
  return out
})

/* ── 最近的倒数日（今天或未来最近的一个）── */
const nextCountdown = computed(() => {
  for (const cd of goalStore.countdowns) {
    const d = daysUntil(cd.date)
    if (d !== null && d >= 0) return { ...cd, days: d }
  }
  return null
})

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
  accountingStore.fetchEntries()
  newsStore.init()
  goalStore.fetchGoals()
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
          <div class="card-value">¥{{ monthSummary.expense.toFixed(0) }}</div>
          <div class="card-label">本月支出</div>
        </div>
        <div class="card-hint">收入 ¥{{ monthSummary.income.toFixed(0) }} · 结余 ¥{{ (monthSummary.income - monthSummary.expense).toFixed(0) }}</div>
      </div>

      <div class="dash-card card">
        <div class="card-icon">✦</div>
        <div class="card-meta">
          <div class="card-value">{{ topNews.length }} 条</div>
          <div class="card-label">新闻热点</div>
        </div>
        <div class="card-hint news-hint">
          <div v-for="(item, i) in topNews" :key="i" class="news-line">
            <span class="news-src">[{{ item.sourceName }}]</span> {{ item.title }}
          </div>
        </div>
      </div>
    </div>

    <!-- 最近倒数日横幅 -->
    <router-link
      v-if="nextCountdown"
      :to="{ name: 'plan' }"
      class="cd-banner card"
      :class="{ today: nextCountdown.days === 0 }"
    >
      <span class="cd-banner-icon">⏳</span>
      <div class="cd-banner-info">
        <span class="cd-banner-title">{{ nextCountdown.title }}</span>
        <span class="cd-banner-date">{{ nextCountdown.date }}</span>
      </div>
      <div class="cd-banner-days">
        <template v-if="nextCountdown.days > 0">
          <span class="cd-banner-label">还有</span>
          <span class="cd-banner-num">{{ nextCountdown.days }}</span>
          <span class="cd-banner-label">天</span>
        </template>
        <span v-else class="cd-banner-num">就是今天！</span>
      </div>
    </router-link>

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
  margin: 0 auto;
}

@media (min-width: 1440px) {
  .dashboard-view {
    max-width: 1160px;
  }
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

.news-hint {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.news-line {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.news-src {
  color: var(--text-secondary);
}

.dash-section {
  padding: var(--space-5);
}

/* ── 倒数日横幅 ── */
.cd-banner {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  margin-bottom: var(--space-6);
  color: var(--text-primary);
  transition: transform var(--duration-fast) var(--ease-out),
              border-color var(--duration-fast) var(--ease-out),
              box-shadow var(--duration-fast) var(--ease-out);
}

.cd-banner:hover {
  transform: translateY(-2px);
  border-color: var(--accent);
  box-shadow: var(--shadow-md);
}

.cd-banner.today {
  border-color: var(--accent);
  background: var(--accent-muted);
}

.cd-banner-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.cd-banner-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cd-banner-title {
  font-size: var(--text-base);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cd-banner-date {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.cd-banner-days {
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
  flex-shrink: 0;
}

.cd-banner-num {
  font-family: var(--font-data);
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--accent);
}

.cd-banner-label {
  font-size: var(--text-sm);
  color: var(--text-secondary);
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
