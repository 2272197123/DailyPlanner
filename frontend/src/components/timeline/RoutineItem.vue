<script setup>
import { useCurrencyStore } from '@/stores/currency'
import { useRoutineStore } from '@/stores/routines'
import { useScheduleStore } from '@/stores/schedule'
import { useToastStore } from '@/stores/toast'
import { useAnime } from '@/composables/useAnime'

const props = defineProps({
  routine: Object,
  date: String,
  done: Boolean
})

const emit = defineEmits(['toggle'])

const currencyStore = useCurrencyStore()
const routineStore = useRoutineStore()
const scheduleStore = useScheduleStore()
const toastStore = useToastStore()
const { burst } = useAnime()

const xpValue = 50 // ROUTINE_REWARD * WAFER_VALUE

function handleToggle(event) {
  const rp = scheduleStore.routineProgress[props.date] || {}
  const wasDone = !!rp[props.routine.id]
  const newState = !wasDone

  // 持久化：PUT /routine-done/{date}/{routine_id} + 本地缓存
  scheduleStore.setRoutineDone(props.date, props.routine.id, newState)

  if (newState) {
    // 防刷分：同一 routine 每天只发一次 XP（服务端幂等）
    if (scheduleStore.awardOnce(props.date, 'fixed_' + props.routine.id, xpValue)) {
      currencyStore.addXP(xpValue, '完成固定事务: ' + props.routine.name)
      toastStore.ok('+' + xpValue + ' XP')
    } else {
      toastStore.ok('已完成')
    }
    if (event) {
      burst(event.clientX, event.clientY, { count: 10 })
    }
  } else {
    // 撤销完成：按存证金额退还 XP（无存证时回退固定值）
    const refunded = scheduleStore.revokeAward(props.date, 'fixed_' + props.routine.id, xpValue)
    if (refunded) {
      currencyStore.subtractXP(refunded, '撤销固定事务: ' + props.routine.name)
      toastStore.ok('-' + refunded + ' XP')
    } else {
      toastStore.warn('已撤销')
    }
  }

  emit('toggle')
}
</script>

<template>
  <div class="routine-item" :class="{ done }" @click="handleToggle">
    <span class="ri-icon">{{ routine.icon || '🔁' }}</span>
    <div class="ri-info">
      <span class="ri-name">{{ routine.name }}</span>
      <span class="ri-note" v-if="routine.note">{{ routine.note }}</span>
    </div>
    <span class="ri-time" v-if="routine.time">{{ routine.time }}</span>
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

.ri-time {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  color: var(--text-muted);
  flex-shrink: 0;
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

/* ── 移动端 ── */
@media (max-width: 768px) {
  .routine-item {
    gap: var(--space-2);
    padding: var(--space-3);
  }

  /* 时间已由左侧时间轨显示，小屏隐藏避免挤压 */
  .ri-time {
    display: none;
  }
}
</style>
