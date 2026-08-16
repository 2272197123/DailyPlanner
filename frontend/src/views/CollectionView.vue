<script setup>
/* ═══════════════════════════════════════
   CollectionView.vue — 「收集」页（v16）

   三块内容：
   1. 签到区：连签计数 + 今日签到按钮（幂等）+ 近 7 天打卡点
   2. 系列图鉴：4 系列分组，已获得亮显（数量角标 + 隐藏面值小字），
      未获得剪影占位
   3. 成就墙：已达成亮显 + 未达成进度条

   性能口径（MoodGrid 教训）：32 卡小列表，无 stagger 大动画、
   无常驻 will-change；SSR 流光仅揭示动效内启用，图鉴内静态。
   ═══════════════════════════════════════ */
import { computed, onMounted } from 'vue'
import { useCollectionStore } from '@/stores/collection'
import { useToastStore } from '@/stores/toast'
import CardFace from '@/components/collection/CardFace.vue'

const collectionStore = useCollectionStore()
const toastStore = useToastStore()

const checkin = computed(() => collectionStore.checkin)
const groups = computed(() => collectionStore.seriesGroups)
const achievements = computed(() => collectionStore.achievements)
const ownedMap = computed(() => collectionStore.ownedMap)

const RARITY_ORDER = { SSR: 0, SR: 1, R: 2, N: 3 }
function sortedCards(cards) {
  return [...cards].sort((a, b) => (RARITY_ORDER[a.rarity] ?? 9) - (RARITY_ORDER[b.rarity] ?? 9))
}

/* 近 7 天打卡点（旧 → 新排列；今天在最右） */
const weekDots = computed(() => {
  const checked = new Set(checkin.value.recentDates || [])
  const days = []
  const today = new Date()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
      '-' + String(d.getDate()).padStart(2, '0')
    days.push({ date: ds, label: `${d.getMonth() + 1}/${d.getDate()}`, checked: checked.has(ds), isToday: i === 0 })
  }
  return days
})

let _checking = false

async function handleCheckin() {
  if (_checking || checkin.value.todayChecked) return
  _checking = true
  try {
    const res = await collectionStore.checkinToday()
    if (!res) {
      toastStore.warn('签到失败，请稍后重试')
      return
    }
    if (res.already) {
      toastStore.ok('今日已签到')
      return
    }
    if (res.card) {
      collectionStore.enqueueReveal({ card: res.card, achievements: res.newAchievements })
    } else if ((res.newAchievements || []).length) {
      collectionStore.enqueueReveal({ achievements: res.newAchievements })
    }
    toastStore.ok(res.milestone
      ? `连签 ${res.streak} 天，里程碑保底 SR+ 已送达！`
      : `签到成功，连签 ${res.streak} 天`)
  } finally {
    _checking = false
  }
}

function achPct(a) {
  return a.target ? Math.round(a.progress / a.target * 100) : 0
}

onMounted(() => {
  collectionStore.fetchAll()
})
</script>

<template>
  <div class="collection-view">
    <header class="col-header">
      <div>
        <h1 class="col-title">收集</h1>
        <p class="col-sub">完成任务掉落卡牌，每日签到不断连</p>
      </div>
      <div class="col-stats">
        <div class="stat">
          <span class="stat-value">{{ collectionStore.distinctOwned }}/{{ collectionStore.defs.length }}</span>
          <span class="stat-label">图鉴</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ collectionStore.totalOwned }}</span>
          <span class="stat-label">累计卡牌</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ collectionStore.achievedCount }}/{{ achievements.length }}</span>
          <span class="stat-label">成就</span>
        </div>
      </div>
    </header>

    <!-- ── 签到区 ── -->
    <section class="card checkin-card">
      <div class="checkin-main">
        <div class="checkin-streak">
          <span class="streak-num">{{ checkin.streak }}</span>
          <span class="streak-label">天连签</span>
        </div>
        <div class="checkin-info">
          <p class="checkin-total">累计签到 {{ checkin.totalDays }} 天 · 每连签满 7 天保底 SR+</p>
          <div class="checkin-week">
            <div
              v-for="d in weekDots"
              :key="d.date"
              class="week-dot"
              :class="{ checked: d.checked, today: d.isToday }"
              :title="d.label"
            >
              <span class="week-dot-label">{{ d.label }}</span>
            </div>
          </div>
        </div>
        <button
          class="btn btn-primary checkin-btn"
          :disabled="checkin.todayChecked"
          @click="handleCheckin"
        >
          {{ checkin.todayChecked ? '✓ 今日已签' : '每日签到' }}
        </button>
      </div>
    </section>

    <!-- ── 系列图鉴 ── -->
    <section v-for="g in groups" :key="g.series" class="card series-card">
      <h2 class="section-title">
        {{ g.seriesName }}
        <span class="series-progress">
          {{ g.cards.filter(c => ownedMap[c.id]).length }}/{{ g.cards.length }}
        </span>
      </h2>
      <div class="series-grid">
        <div v-for="c in sortedCards(g.cards)" :key="c.id" class="series-cell">
          <CardFace
            :card="ownedMap[c.id] ? { ...c, faceValue: ownedMap[c.id].faceValues[0] } : c"
            :owned="!!ownedMap[c.id]"
            :count="ownedMap[c.id]?.count || 0"
          />
        </div>
      </div>
    </section>

    <!-- ── 成就墙 ── -->
    <section class="card ach-card">
      <h2 class="section-title">成就墙</h2>
      <div class="ach-list">
        <div
          v-for="a in achievements"
          :key="a.id"
          class="ach-row"
          :class="{ achieved: a.achieved }"
        >
          <span class="ach-icon">{{ a.achieved ? '🏅' : '🔒' }}</span>
          <div class="ach-body">
            <div class="ach-head">
              <span class="ach-name">{{ a.name }}</span>
              <span class="ach-progress-text">{{ a.progress }}/{{ a.target }}</span>
            </div>
            <p class="ach-desc">{{ a.desc }}</p>
            <div class="ach-track">
              <div class="ach-bar" :style="{ width: achPct(a) + '%' }"></div>
            </div>
          </div>
          <span v-if="a.achieved" class="ach-date">{{ (a.achievedAt || '').slice(0, 10) }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.collection-view {
  max-width: 960px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

@media (min-width: 1440px) {
  .collection-view {
    max-width: 1160px;
  }
}

.col-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
}

.col-title {
  font-family: var(--font-heading);
  font-size: var(--text-2xl);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: var(--space-1);
}

.col-sub {
  font-size: var(--text-sm);
  color: var(--text-muted);
}

.col-stats {
  display: flex;
  gap: var(--space-5);
  flex-shrink: 0;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-value {
  font-family: var(--font-data);
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--accent);
}

.stat-label {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

/* ── 签到区 ── */
.checkin-card {
  padding: var(--space-5);
}

.checkin-main {
  display: flex;
  align-items: center;
  gap: var(--space-5);
}

.checkin-streak {
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
  flex-shrink: 0;
}

.streak-num {
  font-family: var(--font-data);
  font-size: 2.4rem;
  font-weight: 700;
  color: var(--accent);
  line-height: 1;
}

.streak-label {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.checkin-info {
  flex: 1;
  min-width: 0;
}

.checkin-total {
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-bottom: var(--space-2);
}

.checkin-week {
  display: flex;
  gap: var(--space-2);
}

.week-dot {
  width: 34px;
  height: 34px;
  border-radius: var(--radius-md);
  background: var(--bg-muted);
  border: 1px solid var(--border);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 3px;
}

.week-dot.checked {
  background: var(--accent);
  border-color: var(--accent);
}

.week-dot.today {
  box-shadow: 0 0 0 2px var(--accent-muted);
}

.week-dot-label {
  font-family: var(--font-data);
  font-size: 8px;
  color: var(--text-muted);
}

.week-dot.checked .week-dot-label {
  color: var(--on-accent);
}

.checkin-btn {
  flex-shrink: 0;
}

.checkin-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

/* ── 系列图鉴 ── */
.series-card {
  padding: var(--space-5);
}

.section-title {
  font-family: var(--font-heading);
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: var(--space-4);
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}

.series-progress {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  color: var(--text-muted);
  font-weight: 400;
}

.series-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: var(--space-3);
}

/* ── 成就墙 ── */
.ach-card {
  padding: var(--space-5);
}

.ach-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.ach-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  background: var(--bg-muted);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  opacity: 0.75;
}

.ach-row.achieved {
  opacity: 1;
  background: var(--accent-muted);
  border-color: var(--accent);
}

.ach-icon {
  font-size: 1.4rem;
  flex-shrink: 0;
}

.ach-body {
  flex: 1;
  min-width: 0;
}

.ach-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}

.ach-name {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-primary);
}

.ach-progress-text {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  color: var(--text-muted);
  flex-shrink: 0;
}

.ach-desc {
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin: 2px 0 var(--space-2);
}

.ach-track {
  height: 4px;
  border-radius: var(--radius-full);
  background: var(--bg);
  overflow: hidden;
}

.ach-bar {
  height: 100%;
  border-radius: var(--radius-full);
  background: var(--accent);
  transition: width var(--duration-normal) var(--ease-out);
}

.ach-date {
  font-family: var(--font-data);
  font-size: 10px;
  color: var(--text-muted);
  flex-shrink: 0;
}

/* ── 移动端 ── */
@media (max-width: 768px) {
  .col-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .checkin-main {
    flex-wrap: wrap;
  }

  .checkin-btn {
    width: 100%;
  }

  .series-grid {
    grid-template-columns: repeat(4, 1fr);
  }

  .week-dot {
    width: 28px;
    height: 28px;
  }
}
</style>
