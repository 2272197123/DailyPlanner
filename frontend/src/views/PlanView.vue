<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import TimelineNav from '@/components/timeline/TimelineNav.vue'
import TimelineView from '@/components/timeline/TimelineView.vue'
import GoalBoard from '@/components/goals/GoalBoard.vue'
import PlanBoard from '@/components/plan/PlanBoard.vue'
import { useScheduleStore } from '@/stores/schedule'

const route = useRoute()
const scheduleStore = useScheduleStore()

const baseDate = ref(route.query.date || new Date().toISOString().split('T')[0])

onMounted(() => {
  scheduleStore.fetchDay(scheduleStore.currentDate)
})
</script>

<template>
  <div class="plan-view">
    <header class="page-header">
      <div>
        <h1 class="page-title">每日计划</h1>
        <p class="page-subtitle">规划时间，拆解任务，追踪进度</p>
      </div>
    </header>

    <PlanBoard v-model:baseDate="baseDate" />

    <section class="plan-section card">
      <GoalBoard />
    </section>

    <section class="plan-section card">
      <TimelineNav />
      <TimelineView />
    </section>
  </div>
</template>

<style scoped>
.plan-view {
  max-width: 1100px;
}

.page-header {
  margin-bottom: var(--space-6);
}

.page-title {
  font-family: var(--font-heading);
  font-size: var(--text-2xl);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: var(--space-1);
}

.page-subtitle {
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.plan-section {
  margin-bottom: var(--space-6);
  padding: var(--space-5);
}

.plan-section :deep(.timeline-nav) {
  margin-bottom: var(--space-4);
}
</style>
