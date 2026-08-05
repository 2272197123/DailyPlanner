<script setup>
import { useCurrencyStore } from '@/stores/currency'
import { useRoutineStore } from '@/stores/routines'
import { useScheduleStore } from '@/stores/schedule'
import { useToastStore } from '@/stores/toast'

const props = defineProps({
  routine: Object,
  date: String,
  done: Boolean
})

const currencyStore = useCurrencyStore()
const routineStore = useRoutineStore()
const scheduleStore = useScheduleStore()
const toastStore = useToastStore()

const xpValue = 50 // ROUTINE_REWARD * WAFER_VALUE

function handleToggle() {
  const rp = scheduleStore.routineProgress[props.date] || {}
  const wasDone = !!rp[props.routine.id]
  const newState = !wasDone

  if (!scheduleStore.routineProgress[props.date]) {
    scheduleStore.routineProgress[props.date] = {}
  }
  scheduleStore.routineProgress[props.date][props.routine.id] = newState

  if (newState) {
    currencyStore.addXP(xpValue, '完成固定事务: ' + props.routine.name)
    toastStore.ok('+' + xpValue + ' XP')
  } else {
    currencyStore.setBalance(Math.max(0, currencyStore.balance - xpValue))
    currencyStore.recordTransaction('spend', xpValue, '撤销固定事务: ' + props.routine.name, 'fixed_' + props.routine.id)
    toastStore.warn('已撤销')
  }
}
</script>

<template>
  <div class="routine-item" :class="{ done }" @click="handleToggle">
    <span class="ri-icon">{{ routine.icon || '🔁' }}</span>
    <div class="ri-info">
      <span class="ri-name">{{ routine.name }}</span>
      <span class="ri-note" v-if="routine.note">{{ routine.note }}</span>
    </div>
    <span class="ri-xp">+{{ xpValue }} XP</span>
    <span class="ri-check">✓</span>
  </div>
</template>

<style scoped>
.routine-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
  margin-top: var(--space-2);
}

.routine-item:hover {
  border-color: var(--accent);
  background: var(--bg);
}

.routine-item.done {
  opacity: 0.5;
}

.routine-item.done .ri-name {
  text-decoration: line-through;
  color: var(--text-muted);
}

.ri-icon {
  font-size: var(--text-lg);
  flex-shrink: 0;
}

.ri-info {
  flex: 1;
  min-width: 0;
}

.ri-name {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-primary);
  display: block;
}

.ri-note {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.ri-xp {
  font-family: var(--font-data);
  font-size: 10px;
  font-weight: 600;
  color: var(--accent);
  background: var(--accent-muted);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-full);
}

.ri-check {
  font-size: var(--text-base);
  color: var(--success);
  opacity: 0;
  transform: scale(0);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.done .ri-check {
  opacity: 1;
  transform: scale(1);
}
</style>
