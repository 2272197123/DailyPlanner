<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api/client'
import { useAnime } from '@/composables/useAnime'
import PlanCard from './PlanCard.vue'

const router = useRouter()
const { staggerEnter } = useAnime()

const props = defineProps({
  baseDate: { type: String, default: () => new Date().toISOString().split('T')[0] }
})

const plans = ref({})
const loading = ref(false)
const boardRef = ref(null)

const weekDates = computed(() => {
  const base = new Date(props.baseDate + 'T00:00:00')
  const day = base.getDay() || 7
  const monday = new Date(base)
  monday.setDate(base.getDate() - day + 1)

  const dates = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    dates.push(d.toISOString().split('T')[0])
  }
  return dates
})

const weekRangeText = computed(() => {
  const start = new Date(weekDates.value[0] + 'T00:00:00')
  const end = new Date(weekDates.value[6] + 'T00:00:00')
  return `${start.getMonth() + 1}/${start.getDate()} - ${end.getMonth() + 1}/${end.getDate()}`
})

async function fetchWeekPlans() {
  loading.value = true
  try {
    const { data } = await api.get('/plans', { params: { limit: 14 } })
    const map = {}
    if (data && Array.isArray(data)) {
      data.forEach(plan => {
        map[plan.date] = plan
      })
    }
    plans.value = map
  } catch (err) {
    console.warn('Failed to fetch plans:', err)
  } finally {
    loading.value = false
  }
}

function getPlan(date) {
  return plans.value[date] || null
}

function goToPlan(date) {
  router.push({ name: 'plan', query: { date } })
}

function prevWeek() {
  const current = new Date(props.baseDate + 'T00:00:00')
  current.setDate(current.getDate() - 7)
  emit('update:baseDate', current.toISOString().split('T')[0])
}

function nextWeek() {
  const current = new Date(props.baseDate + 'T00:00:00')
  current.setDate(current.getDate() + 7)
  emit('update:baseDate', current.toISOString().split('T')[0])
}

const emit = defineEmits(['update:baseDate'])

onMounted(() => {
  fetchWeekPlans().then(() => {
    nextTick(() => {
      if (boardRef.value) {
        staggerEnter('.plan-card', boardRef.value)
      }
    })
  })
})

watch(() => props.baseDate, fetchWeekPlans)
</script>

<template>
  <div class="plan-board">
    <div class="board-header">
      <h2 class="board-title">本周计划</h2>
      <div class="board-nav">
        <button class="btn btn-icon" @click="prevWeek">‹</button>
        <span class="board-range">{{ weekRangeText }}</span>
        <button class="btn btn-icon" @click="nextWeek">›</button>
      </div>
    </div>

    <div ref="boardRef" class="board-grid">
      <PlanCard
        v-for="date in weekDates"
        :key="date"
        :date="date"
        :plan="getPlan(date)"
        @click="goToPlan"
      />
    </div>
  </div>
</template>

<style scoped>
.plan-board {
  margin-bottom: var(--space-6);
}

.board-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4);
}

.board-title {
  font-family: var(--font-heading);
  font-size: var(--text-lg);
  color: var(--text-primary);
}

.board-nav {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.board-range {
  font-family: var(--font-data);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  min-width: 100px;
  text-align: center;
}

.board-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: var(--space-3);
}

@media (max-width: 1100px) {
  .board-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

@media (max-width: 768px) {
  .board-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .board-grid {
    grid-template-columns: 1fr;
  }
}
</style>
