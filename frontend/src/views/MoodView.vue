<script setup>
import { ref } from 'vue'
import MoodGrid from '@/components/mood/MoodGrid.vue'

const currentYear = ref(new Date().getFullYear())

const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i)
</script>

<template>
  <div class="mood-view">
    <header class="page-header">
      <div>
        <h1 class="page-title">心情年历</h1>
        <p class="page-subtitle">用颜色记录每一天，回顾情绪起伏</p>
      </div>
      <div class="year-select">
        <button
          v-for="year in years"
          :key="year"
          class="year-btn"
          :class="{ active: year === currentYear }"
          @click="currentYear = year"
        >
          {{ year }}
        </button>
      </div>
    </header>

    <section class="mood-section card">
      <MoodGrid :year="currentYear" />
    </section>

    <section class="mood-legend card">
      <h3 class="legend-title">图例</h3>
      <div class="legend-items">
        <div class="legend-item">
          <span class="legend-dot" style="background-color: var(--bg-muted)"></span>
          <span class="legend-label">无记录</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot" style="background-color: var(--mood-joy)"></span>
          <span class="legend-label">开心</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot" style="background-color: var(--mood-calm)"></span>
          <span class="legend-label">平静</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot" style="background-color: var(--mood-productive)"></span>
          <span class="legend-label">充实</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot" style="background-color: var(--mood-tired)"></span>
          <span class="legend-label">疲惫</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot" style="background-color: var(--mood-anxious)"></span>
          <span class="legend-label">焦虑</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.mood-view {
  max-width: 1100px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
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

.year-select {
  display: flex;
  gap: var(--space-1);
  background: var(--bg-muted);
  padding: 4px;
  border-radius: var(--radius-md);
}

.year-btn {
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  transition: all var(--duration-fast) var(--ease-out);
}

.year-btn:hover {
  color: var(--text-primary);
}

.year-btn.active {
  background: var(--bg-elevated);
  color: var(--accent);
  box-shadow: var(--shadow-sm);
}

.mood-section {
  padding: var(--space-6);
  margin-bottom: var(--space-6);
  overflow-x: auto;
}

.mood-legend {
  padding: var(--space-5);
}

.legend-title {
  font-family: var(--font-heading);
  font-size: var(--text-base);
  margin-bottom: var(--space-4);
  color: var(--text-primary);
}

.legend-items {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.legend-dot {
  width: 14px;
  height: 14px;
  border-radius: 4px;
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
  }
}
</style>
