<template>
  <section class="timeline-view">
    <div class="tl-header">
      <h3>🕘 今日时间轴</h3>
      <span class="tl-count">0 项</span>
    </div>

    <div class="tl-empty">
      <span class="tl-empty-icon">🍃</span>
      <p>今日本无事，庸人自扰之</p>
      <p class="tl-empty-hint">该日期未导入计划 — 点击「📥 导入」生成目标任务</p>
    </div>
  </section>
</template>

<style scoped>
.timeline-view {
  margin-top: var(--space-2);
}

.tl-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4);
}

.tl-header h3 {
  font-family: var(--font-heading);
  font-size: var(--text-base);
  color: var(--text-primary);
}

.tl-count {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  color: var(--text-muted);
  background: var(--bg-muted);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
}

.tl-empty {
  text-align: center;
  padding: var(--space-12) var(--space-4);
  color: var(--text-secondary);
}

.tl-empty-icon {
  font-size: 3rem;
  display: block;
  margin-bottom: var(--space-4);
}

.tl-empty p {
  margin-bottom: var(--space-2);
}

.tl-empty-hint {
  font-size: var(--text-sm);
  color: var(--text-muted);
}
</style>
