<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useScheduleStore } from '@/stores/schedule'
import { useRoutineStore } from '@/stores/routines'
import { useCurrencyStore } from '@/stores/currency'
import { toLocalDate } from '@/utils/format'
import { useAnime } from '@/composables/useAnime'

const scheduleStore = useScheduleStore()
const routineStore = useRoutineStore()
const currencyStore = useCurrencyStore()
const { countUp } = useAnime()

/* ── 合并统计：任务块 + 固定事务 ── */
const stats = computed(() => {
  const date = scheduleStore.currentDate
  const blocks = scheduleStore.todayBlocks
  const routines = routineStore.routinesForCurrentDate
  const rp = scheduleStore.routineProgress[date] || {}
  const done = blocks.filter(b => b.completed).length + routines.filter(r => rp[r.id]).length
  const total = blocks.length + routines.length
  return { done, total, pct: total ? Math.round(done / total * 100) : 0 }
})

/* ── 今日已获 XP ── */
const xpToday = computed(() => {
  const todayStr = toLocalDate(new Date())
  return (currencyStore.transactions || [])
    .filter(t => t.type === 'earn' && t.timestamp && toLocalDate(new Date(t.timestamp)) === todayStr)
    .reduce((s, t) => s + (t.amount || 0), 0)
})

const encouragement = computed(() => scheduleStore.todaySchedule.encouragement || '')

const dateState = computed(() => scheduleStore.dateState)

/* ── 进度环百分比 countUp 动画 ── */
const pctRef = ref(null)
let prevPct = 0

watch(() => stats.value.pct, (next) => {
  if (pctRef.value) {
    countUp(pctRef.value, prevPct, next, 800)
  }
  prevPct = next
})

onMounted(() => {
  if (pctRef.value) countUp(pctRef.value, 0, stats.value.pct, 900)
  prevPct = stats.value.pct
})

const CIRC = 2 * Math.PI * 44 // r=44
</script>

<template>
  <div class="day-hero" :class="'state-' + dateState">
    <div class="dh-ring">
      <svg viewBox="0 0 100 100" class="dh-ring-svg">
        <circle cx="50" cy="50" r="44" class="dh-ring-bg" />
        <circle
          cx="50" cy="50" r="44"
          class="dh-ring-fill"
          :style="{ strokeDashoffset: CIRC - (CIRC * stats.pct / 100) }"
        />
      </svg>
      <div class="dh-ring-text">
        <span class="dh-pct"><span ref="pctRef">0</span>%</span>
      </div>
    </div>

    <div class="dh-info">
      <div class="dh-line">
        <strong>{{ stats.done }}</strong> / {{ stats.total }} 已完成
      </div>
      <div class="dh-sub">
        <span class="dh-xp">✦ 今日 +{{ xpToday }} XP</span>
      </div>
      <p v-if="encouragement" class="dh-encouragement">「 {{ encouragement }} 」</p>
    </div>
  </div>
</template>

<style scoped>
.day-hero {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  padding: var(--space-5);
  margin-bottom: var(--space-6);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
}

.dh-ring {
  position: relative;
  width: 88px;
  height: 88px;
  flex-shrink: 0;
}

.dh-ring-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.dh-ring-bg {
  fill: none;
  stroke: var(--border);
  stroke-width: 7;
}

.dh-ring-fill {
  fill: none;
  stroke: var(--accent);
  stroke-width: 7;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.8s var(--ease-out);
}

.state-past .dh-ring-fill { stroke: var(--state-past); }
.state-future .dh-ring-fill { stroke: var(--state-future); }

.dh-ring-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dh-pct {
  font-family: var(--font-data);
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--text-primary);
}

.dh-info {
  flex: 1;
  min-width: 0;
}

.dh-line {
  font-size: var(--text-base);
  color: var(--text-primary);
}

.dh-line strong {
  font-family: var(--font-data);
  font-size: var(--text-2xl);
  color: var(--accent);
}

.dh-sub {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

.dh-xp {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--accent);
  background: var(--accent-muted);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-full);
}

.dh-encouragement {
  margin-top: var(--space-3);
  font-family: var(--font-heading);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: 1.6;
}

/* ── 移动端 ── */
@media (max-width: 768px) {
  .day-hero {
    gap: var(--space-4);
    padding: var(--space-4);
  }

  .dh-ring {
    width: 72px;
    height: 72px;
  }
}
</style>
