<script setup>
import { ref } from 'vue'
import { useScheduleStore } from '@/stores/schedule'

const scheduleStore = useScheduleStore()
const feedback = ref('')
const rating = ref(0)

function saveFeedback() {
  // Placeholder — will be wired to API in phase 2
  console.log('[Feedback]', { date: scheduleStore.currentDate, feedback: feedback.value, rating: rating.value })
}
</script>

<template>
  <section class="feedback-bar">
    <div class="feedback-header">
      <h3>💭 今日反馈</h3>
    </div>
    <textarea
      v-model="feedback"
      class="feedback-input"
      placeholder="今天完成了什么？有什么困难？"
      rows="2"
    ></textarea>
    <div class="feedback-actions">
      <div class="rating-stars">
        <button
          v-for="i in 5"
          :key="i"
          class="star-btn"
          :class="{ active: rating >= i }"
          @click="rating = rating === i ? 0 : i"
        >
          ★
        </button>
      </div>
      <button class="save-btn" @click="saveFeedback">💾 保存</button>
    </div>
  </section>
</template>

<style scoped>
.feedback-bar {
  max-width: 720px;
  margin: var(--space-6) auto;
  padding: var(--space-4);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.feedback-header h3 {
  font-family: var(--font-heading);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  margin-bottom: var(--space-3);
}

.feedback-input {
  width: 100%;
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  resize: vertical;
  background: var(--bg);
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  line-height: 1.6;
}

.feedback-input:focus {
  border-color: var(--accent);
  outline: none;
}

.feedback-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: var(--space-3);
}

.rating-stars {
  display: flex;
  gap: var(--space-1);
}

.star-btn {
  font-size: var(--text-xl);
  color: var(--text-muted);
  transition: color var(--duration-fast) var(--ease-out);
}

.star-btn.active {
  color: var(--warning);
}

.save-btn {
  padding: var(--space-2) var(--space-4);
  background: var(--accent);
  color: var(--text-inverse);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  transition: background var(--duration-fast) var(--ease-out);
}

.save-btn:hover {
  background: var(--accent-light);
}
</style>
