<template>
  <div class="home-view">
    <GoalBoard />
    <TimelineNav />
    <TimelineView />
    <LedgerPanel />
  </div>
</template>

<script setup>
import GoalBoard from '@/components/goals/GoalBoard.vue'
import TimelineNav from '@/components/timeline/TimelineNav.vue'
import TimelineView from '@/components/timeline/TimelineView.vue'
import LedgerPanel from '@/components/accounting/LedgerPanel.vue'
</script>
