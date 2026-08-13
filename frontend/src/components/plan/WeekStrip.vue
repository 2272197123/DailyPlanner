<script setup>
import { ref, computed, onMounted } from 'vue'
import api, { unwrap } from '@/api/client'
import { useScheduleStore } from '@/stores/schedule'
import { useMoodStore } from '@/stores/mood'
import { toLocalDate } from '@/utils/format'

const scheduleStore = useScheduleStore()
const moodStore = useMoodStore()

/* 本周一（本地时区），可整周翻页 */
const weekOffset = ref(0)

const weekDates = computed(() => {
  const base = new Date(scheduleStore.currentDate + 'T00:00:00')
  const day = base.getDay() || 7 // Monday = 1
  const monday = new Date(base)
  monday.setDate(base.getDate() - day + 1 + weekOffset.value * 7)
  const dates = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    dates.push(toLocalDate(d))
  }
  return dates
})

/* 切日期时周视图跟随（回到包含该日期的一周） */
function resetOffset() { weekOffset.value = 0 }

const plans = ref({})

async function fetchPlans() {
  try {
    const { data } = await api.get('/plans', { params: { limit: 14 } })
    const list = unwrap(data)
    const map = {}
    if (Array.isArray(list)) {
      list.forEach(plan => { map[plan.date] = plan })
    }
    plans.value = map
  } catch { /* silent */ }
}

function dayStats(date) {
  const plan = plans.value[date]
  const blocks = plan?.blocks || []
  const total = blocks.length
  const done = blocks.filter(b => b.completed).length
  return { done, total, pct: total ? done / total : 0 }
}

function moodColor(date) {
  return moodStore.getEntry(date)?.color || ''
}

function mdLabel(date) {
  const d = new Date(date + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}`
}

const weekDayLabels = ['一', '二', '三', '四', '五', '六', '日']

function prevWeek() { weekOffset.value-- }
function nextWeek() { weekOffset.value++ }

/* 点击格子：真正切换时间轴日期 */
function select(date) {
  scheduleStore.setDate(date)
  if (weekOffset.value !== 0) resetOffset()
}

defineExpose({ fetchPlans })

onMounted(fetchPlans)
</script>

<template>
  <div class="week-strip">
    <button class="ws-arrow" @click="prevWeek" title="上一周">‹</button>

    <div class="ws-days">
      <button
        v-for="(date, i) in weekDates"
        :key="date"
        class="ws-cell"
        :class="{
          active: date === scheduleStore.currentDate,
          today: date === scheduleStore.today
        }"
        @click="select(date)"
      >
        <span class="ws-weekday">{{ weekDayLabels[i] }}</span>
        <span class="ws-md">{{ mdLabel(date) }}</span>
        <span class="ws-ring">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" class="ws-ring-bg" />
            <circle
              v-if="dayStats(date).total"
              cx="12" cy="12" r="9"
              class="ws-ring-fill"
              :class="{ full: dayStats(date).pct >= 1 }"
              :style="{ strokeDashoffset: 56.5 - 56.5 * dayStats(date).pct }"
            />
          </svg>
          <span v-if="!dayStats(date).total" class="ws-ring-empty"></span>
        </span>
        <span
          class="ws-mood"
          :style="moodColor(date) ? { backgroundColor: moodColor(date) } : {}"
        ></span>
      </button>
    </div>

    <button class="ws-arrow" @click="nextWeek" title="下一周">›</button>
  </div>
</template>

<style scoped>
.week-strip {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-5);
}

.ws-arrow {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  font-size: var(--text-lg);
  color: var(--text-secondary);
  transition: background var(--duration-fast) var(--ease-out),
              color var(--duration-fast) var(--ease-out);
}

.ws-arrow:hover {
  background: var(--bg-muted);
  color: var(--accent);
}

.ws-days {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: var(--space-1);
}

.ws-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: var(--space-2) var(--space-1);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  transition: background var(--duration-fast) var(--ease-out),
              border-color var(--duration-fast) var(--ease-out);
}

.ws-cell:hover {
  background: var(--bg-muted);
}

.ws-cell.active {
  background: var(--accent-muted);
  border-color: var(--accent);
}

.ws-weekday {
  font-size: 10px;
  color: var(--text-muted);
}

.ws-cell.today .ws-weekday {
  color: var(--accent);
  font-weight: 600;
}

.ws-md {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-primary);
}

.ws-ring {
  width: 20px;
  height: 20px;
  position: relative;
}

.ws-ring svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.ws-ring-bg {
  fill: none;
  stroke: var(--bg-muted);
  stroke-width: 3;
}

.ws-ring-fill {
  fill: none;
  stroke: var(--accent);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-dasharray: 56.5;
  transition: stroke-dashoffset var(--duration-normal) var(--ease-out);
}

.ws-ring-fill.full {
  stroke: var(--success);
}

.ws-ring-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ws-mood {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: transparent;
}
</style>
