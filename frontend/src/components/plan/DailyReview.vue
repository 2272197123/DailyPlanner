<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useScheduleStore } from '@/stores/schedule'
import { useArchiveStore } from '@/stores/archive'
import { useToastStore } from '@/stores/toast'

const scheduleStore = useScheduleStore()
const archiveStore = useArchiveStore()
const toastStore = useToastStore()

const feedback = ref('')
const rating = ref(0)
const requestAi = ref(true)
const isArchiving = ref(false)
const showHistoryReview = ref(false)

/* ── Computed ── */
const isPast = computed(() => scheduleStore.isPast)
const isToday = computed(() => scheduleStore.isToday)
const currentReview = computed(() => archiveStore.reviewForDate(scheduleStore.currentDate))
const isArchived = computed(() => archiveStore.isArchived(scheduleStore.currentDate))
const shouldPrompt = computed(() => isToday.value && archiveStore.shouldPromptArchive && !isArchived.value)

const displayRating = computed(() => {
  if (isArchived.value && currentReview.value) {
    return currentReview.value.rating || 0
  }
  return rating.value
})

/* ── Init：挂载与切日期时从服务端读回存档（含 AI 评价）并同步表单 ── */
/* 序号守卫：快速切日期时过期 loadCurrent 的表单写入直接丢弃（同 PlanView loadSeq 模式） */
let loadSeq = 0
async function loadCurrent() {
  const seq = ++loadSeq
  const date = scheduleStore.currentDate
  await archiveStore.loadReview(date)
  if (seq !== loadSeq || date !== scheduleStore.currentDate) return
  const review = archiveStore.reviewForDate(date)
  feedback.value = review ? (review.feedback || '') : ''
  rating.value = review ? (review.rating || 0) : 0
}

onMounted(loadCurrent)
watch(() => scheduleStore.currentDate, (date) => {
  if (date) loadCurrent()
})

/* ── Actions ── */
async function handleArchive() {
  if (!feedback.value.trim() && rating.value === 0) {
    toastStore.warn('请至少填写反馈或打分')
    return
  }
  isArchiving.value = true
  try {
    await archiveStore.archiveDay(scheduleStore.currentDate, {
      feedback: feedback.value,
      rating: rating.value,
      requestAi: requestAi.value
    })
    toastStore.ok('📦 已存档！')
  } catch {
    toastStore.err('存档失败')
  }
  isArchiving.value = false
}

function handleExportMD() {
  const md = archiveStore.exportMarkdown(scheduleStore.currentDate)
  if (!md) {
    toastStore.warn('没有可导出的复盘数据')
    return
  }
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'DailyPlan_' + scheduleStore.currentDate + '.md'
  a.click()
  URL.revokeObjectURL(url)
  toastStore.ok('已导出 Markdown')
}

function handleExportPDF() {
  // Service-side PDF export — for now, trigger browser print
  const review = archiveStore.reviewForDate(scheduleStore.currentDate)
  if (!review) {
    toastStore.warn('没有可导出的复盘数据')
    return
  }
  window.print()
}

async function handleDelete() {
  if (!window.confirm('确定删除 ' + scheduleStore.currentDate + ' 的复盘吗？此操作不可恢复。')) return
  await archiveStore.deleteReview(scheduleStore.currentDate)
  feedback.value = ''
  rating.value = 0
  toastStore.ok('复盘已删除，可以重新填写')
}
</script>

<template>
  <section class="review-panel" :class="{
    'state-past': isPast,
    'state-archived': isArchived,
    'state-prompt': shouldPrompt
  }">
    <!-- Header -->
    <div class="rp-header">
      <h3>
        <span v-if="isArchived">📦 每日复盘</span>
        <span v-else-if="isPast && !isArchived">⚠️ 未存档</span>
        <span v-else>💭 今日反馈</span>
      </h3>
      <span class="rp-status" v-if="shouldPrompt && !isArchived">
        🔔 建议存档
      </span>
      <span class="rp-status archived" v-else-if="isArchived">
        ✓ 已存档
      </span>
    </div>

    <!-- Archived review view -->
    <template v-if="isArchived && currentReview">
      <div class="rp-review-content">
        <!-- Self review -->
        <div class="rp-section" v-if="currentReview.feedback">
          <h4>📝 自评</h4>
          <p>{{ currentReview.feedback }}</p>
        </div>

        <!-- Rating -->
        <div class="rp-rating-display">
          <span
            v-for="i in 5"
            :key="i"
            class="rp-star"
            :class="{ filled: (currentReview.rating || 0) >= i }"
          >★</span>
        </div>

        <!-- AI review -->
        <div class="rp-section ai-review" v-if="currentReview.aiReview">
          <h4>🤖 AI 评价</h4>
          <p>{{ currentReview.aiReview }}</p>
        </div>

        <!-- Stats -->
        <div class="rp-stats" v-if="currentReview.stats">
          <div class="rps-item">
            <span class="rps-val">{{ currentReview.stats.doneTasks || 0 }}/{{ currentReview.stats.totalTasks || 0 }}</span>
            <span class="rps-label">任务</span>
          </div>
          <div class="rps-item">
            <span class="rps-val">{{ currentReview.stats.routineDone || 0 }}/{{ currentReview.stats.routineTotal || 0 }}</span>
            <span class="rps-label">日课</span>
          </div>
          <div class="rps-item">
            <span class="rps-val">{{ currentReview.stats.doneSubtasks || 0 }}/{{ currentReview.stats.totalSubtasks || 0 }}</span>
            <span class="rps-label">子任务</span>
          </div>
        </div>

        <!-- Export buttons -->
        <div class="rp-export-actions">
          <button class="btn-sm btn-danger-text" @click="handleDelete">🗑 删除复盘</button>
          <button class="btn-sm" @click="handleExportMD">📥 导出 MD</button>
          <button class="btn-sm" @click="handleExportPDF">🖨️ 导出 PDF</button>
        </div>
      </div>
    </template>

    <!-- Active feedback + archive form（历史日期也可补写/补档） -->
    <template v-else-if="!isArchived">
      <textarea
        v-model="feedback"
        class="rp-textarea"
        :placeholder="isPast ? '该日期未存档，仍可填写反馈...' : '今天完成了什么？有什么困难？'"
        rows="3"
      ></textarea>

      <div class="rp-actions">
        <div class="rp-rating">
          <span class="rp-rating-label">{{ isPast ? '当日状态:' : '今日状态:' }}</span>
          <button
            v-for="i in 5"
            :key="i"
            class="rp-star-btn"
            :class="{ active: rating >= i }"
            @click="rating = rating === i ? 0 : i"
          >
            ★
          </button>
        </div>

        <div class="rp-archive-row">
          <label class="rp-ai-toggle">
            <input type="checkbox" v-model="requestAi" />
            <span>🤖 AI 评价</span>
          </label>
          <button
            class="btn-archive"
            :disabled="isArchiving"
            @click="handleArchive"
          >
            {{ isArchiving ? '存档中...' : (isPast ? '📦 补档' : '📦 存档') }}
          </button>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.review-panel {
  width: 100%;
  padding: var(--space-4);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  transition: border-color var(--duration-normal) var(--ease-out),
              box-shadow var(--duration-normal) var(--ease-out);
}

.state-past { border-color: var(--state-past); }
.state-archived { border-color: var(--success); }
.state-prompt {
  border-color: var(--warning);
  box-shadow: 0 0 0 3px var(--warning-bg);
  animation: prompt-pulse 2s ease-in-out infinite;
}

@keyframes prompt-pulse {
  0%, 100% { box-shadow: 0 0 0 3px var(--warning-bg); }
  50% { box-shadow: 0 0 0 8px transparent; }
}

/* ── Header ── */
.rp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4);
}

.rp-header h3 {
  font-family: var(--font-heading);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.rp-status {
  font-size: var(--text-xs);
  color: var(--warning);
  font-weight: 600;
  padding: var(--space-1) var(--space-2);
  background: var(--warning-bg);
  border-radius: var(--radius-sm);
}

.rp-status.archived {
  color: var(--success);
  background: var(--success-bg);
}

/* ── Textarea ── */
.rp-textarea {
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
  transition: border-color var(--duration-fast) var(--ease-out);
}

.rp-textarea:focus {
  border-color: var(--accent);
  outline: none;
}

.rp-textarea:disabled {
  opacity: 0.6;
  background: var(--bg-muted);
}

/* ── Actions ── */
.rp-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: var(--space-3);
  flex-wrap: wrap;
  gap: var(--space-3);
}

.rp-rating {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.rp-rating-label {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  margin-right: var(--space-2);
}

.rp-star-btn {
  font-size: var(--text-xl);
  color: var(--text-muted);
  transition: all var(--duration-fast) var(--ease-out);
}

.rp-star-btn.active {
  color: var(--warning);
  transform: scale(1.15);
}

.rp-star-btn:hover:not(:disabled) {
  color: var(--warning);
  transform: scale(1.1);
}

.rp-star-btn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.rp-archive-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.rp-ai-toggle {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}

.rp-ai-toggle input[type="checkbox"] {
  accent-color: var(--accent);
}

.btn-archive {
  padding: var(--space-2) var(--space-4);
  background: var(--accent);
  color: var(--text-inverse);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 600;
  transition: all var(--duration-fast) var(--ease-out);
}

.btn-archive:hover:not(:disabled) {
  background: var(--accent-light);
  transform: translateY(-1px);
}

.btn-archive:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── Archived review content ── */
.rp-review-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.rp-section {
  padding: var(--space-3);
  background: var(--bg);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--accent);
}

.rp-section h4 {
  font-family: var(--font-heading);
  font-size: var(--text-xs);
  color: var(--text-secondary);
  margin-bottom: var(--space-2);
}

.rp-section p {
  font-size: var(--text-sm);
  color: var(--text-primary);
  line-height: 1.7;
  white-space: pre-wrap;
}

.ai-review {
  border-left-color: var(--info);
}

.rp-rating-display {
  display: flex;
  gap: var(--space-1);
}

.rp-star {
  font-size: var(--text-xl);
  color: var(--text-muted);
}

.rp-star.filled {
  color: var(--warning);
}

/* ── Stats ── */
.rp-stats {
  display: flex;
  gap: var(--space-4);
}

.rps-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: var(--space-2) var(--space-4);
  background: var(--bg);
  border-radius: var(--radius-md);
}

.rps-val {
  font-family: var(--font-data);
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--accent);
}

.rps-label {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

/* ── Export ── */
.rp-export-actions {
  display: flex;
  gap: var(--space-3);
  justify-content: flex-end;
}

.btn-sm {
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-xs);
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  transition: all var(--duration-fast) var(--ease-out);
}

.btn-sm:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.btn-danger-text {
  color: var(--danger);
  margin-right: auto;
}

.btn-danger-text:hover {
  border-color: var(--danger);
  color: var(--danger);
}
</style>
