<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useScheduleStore } from '@/stores/schedule'
import { useRoutineStore } from '@/stores/routines'
import { useToastStore } from '@/stores/toast'
import { fmtDate } from '@/utils/format'
import WeekStrip from '@/components/plan/WeekStrip.vue'
import DayHero from '@/components/plan/DayHero.vue'
import UnifiedTimeline from '@/components/plan/UnifiedTimeline.vue'
import GoalBoard from '@/components/goals/GoalBoard.vue'

const route = useRoute()
const scheduleStore = useScheduleStore()
const routineStore = useRoutineStore()
const toastStore = useToastStore()

const weekStripRef = ref(null)

/* ── 日期切换：拉取计划 + 排序 + 打卡 + 初始化日课副本 ── */
async function loadDate(date) {
  await scheduleStore.fetchDay(date)
  scheduleStore.fetchRoutineProgress(date)
  await routineStore.fetchRoutines()
  routineStore.initDailyCopy(date)
}

watch(() => scheduleStore.currentDate, (date) => {
  if (date) loadDate(date)
})

onMounted(() => {
  // route.query.date 仅作为进入页面时的初始值
  const q = route.query.date
  if (typeof q === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(q)) {
    scheduleStore.setDate(q)
  } else {
    loadDate(scheduleStore.currentDate)
  }
})

/* ── 页头 ── */
const displayDate = computed(() => fmtDate(scheduleStore.currentDate))
const dateState = computed(() => scheduleStore.dateState)

function goToday() {
  scheduleStore.goToday()
}

/* ── 新任务 ── */
const showAddModal = ref(false)
const newTask = ref({ subject: '', duration: 30, priority: 'medium' })

function handleAdd() {
  const subject = newTask.value.subject.trim()
  if (!subject) {
    toastStore.warn('请填写任务名')
    return
  }
  scheduleStore.addBlock(scheduleStore.currentDate, {
    id: 'blk_' + Date.now(),
    subject,
    duration: Number(newTask.value.duration) || 30,
    priority: newTask.value.priority,
    category: 'study',
    subtasks: [],
    completed: false
  })
  showAddModal.value = false
  newTask.value = { subject: '', duration: 30, priority: 'medium' }
  toastStore.ok('已添加任务')
}

/* ── 长期目标折叠 ── */
const goalsOpen = ref(false)
</script>

<template>
  <div class="plan-view">
    <!-- 页头：日期导航 + 三态点 + 档位 + 操作 -->
    <header class="plan-header">
      <div class="ph-top">
        <button class="ph-arrow" @click="scheduleStore.prevDay()" title="前一天">←</button>
        <h1 class="ph-date" @click="goToday" title="回到今天">
          {{ displayDate }}
          <span class="ph-state-dot" :class="'dot-' + dateState"></span>
        </h1>
        <button class="ph-arrow" @click="scheduleStore.nextDay()" title="后一天">→</button>
      </div>

      <div class="ph-bar">
        <div class="ph-actions">
          <button class="btn btn-primary btn-sm" @click="showAddModal = true">＋ 新任务</button>
        </div>
      </div>
    </header>

    <!-- 周导航 -->
    <WeekStrip ref="weekStripRef" />

    <!-- 完成进度 -->
    <DayHero />

    <!-- 统一时间轴 -->
    <UnifiedTimeline
      @add="showAddModal = true"
    />

    <!-- 长期目标（折叠） -->
    <section class="goals-fold card">
      <button class="goals-fold-head" @click="goalsOpen = !goalsOpen">
        <span class="goals-fold-title">🎯 长期目标</span>
        <span class="goals-fold-arrow" :class="{ open: goalsOpen }">▸</span>
      </button>
      <div v-if="goalsOpen" class="goals-fold-body">
        <GoalBoard />
      </div>
    </section>

    <!-- 新任务 modal -->
    <Teleport to="body">
      <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
        <div class="modal-panel modal-panel-sm">
          <div class="modal-head">
            <h3>＋ 新任务</h3>
            <button class="modal-close" @click="showAddModal = false">✕</button>
          </div>
          <label class="mf-label">任务名</label>
          <input
            v-model="newTask.subject"
            class="mf-input"
            maxlength="60"
            placeholder="要做什么？"
            @keydown.enter="handleAdd"
          />
          <label class="mf-label">时长（分钟）</label>
          <input v-model.number="newTask.duration" class="mf-input" type="number" min="5" step="5" />
          <label class="mf-label">优先级</label>
          <select v-model="newTask.priority" class="mf-input">
            <option value="high">🔴 高</option>
            <option value="medium">🟡 中</option>
            <option value="low">🟢 低</option>
          </select>
          <div class="modal-actions">
            <button class="btn btn-primary" @click="handleAdd">添加</button>
            <button class="btn btn-secondary" @click="showAddModal = false">取消</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.plan-view {
  max-width: 760px;
  margin: 0 auto;
}

/* ── 页头 ── */
.plan-header {
  margin-bottom: var(--space-5);
}

.ph-top {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  margin-bottom: var(--space-3);
}

.ph-arrow {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  font-size: var(--text-xl);
  color: var(--text-secondary);
  transition: background var(--duration-fast) var(--ease-out),
              color var(--duration-fast) var(--ease-out),
              transform var(--duration-fast) var(--ease-out);
}

.ph-arrow:hover {
  background: var(--bg-muted);
  color: var(--accent);
  transform: scale(1.08);
}

.ph-date {
  font-family: var(--font-heading);
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
  user-select: none;
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  transition: background var(--duration-fast) var(--ease-out);
}

.ph-date:hover { background: var(--bg-muted); }

.ph-state-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
}

.dot-past { background: var(--state-past); }
.dot-present { background: var(--state-present); }
.dot-future { background: var(--state-future); }

.ph-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.ph-actions {
  display: flex;
  gap: var(--space-2);
}

/* ── 长期目标折叠 ── */
.goals-fold {
  max-width: 680px;
  margin: 0 auto var(--space-6);
  padding: 0;
  overflow: hidden;
}

.goals-fold-head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  transition: background var(--duration-fast) var(--ease-out);
}

.goals-fold-head:hover {
  background: var(--bg-muted);
}

.goals-fold-title {
  font-family: var(--font-heading);
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--text-primary);
}

.goals-fold-arrow {
  font-size: var(--text-sm);
  color: var(--text-muted);
  transition: transform var(--duration-fast) var(--ease-out);
}

.goals-fold-arrow.open {
  transform: rotate(90deg);
}

.goals-fold-body {
  padding: 0 var(--space-5) var(--space-5);
}

/* ── Modals ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
  background: rgba(30, 32, 48, 0.3);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.modal-panel {
  width: 100%;
  max-width: 520px;
  padding: var(--space-6);
  background: var(--bg-elevated);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}

.modal-panel-sm {
  max-width: 400px;
}

.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4);
}

.modal-head h3 {
  font-family: var(--font-heading);
  font-size: var(--text-lg);
}

.modal-close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  font-size: var(--text-lg);
  color: var(--text-muted);
  transition: background var(--duration-fast) var(--ease-out);
}

.modal-close:hover { background: var(--bg-muted); }

.mf-label {
  display: block;
  font-size: var(--text-xs);
  color: var(--text-secondary);
  margin: var(--space-3) 0 var(--space-1);
}

.mf-input {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  background: var(--bg);
  color: var(--text-primary);
}

.mf-input:focus {
  border-color: var(--accent);
  outline: none;
}

.modal-actions {
  display: flex;
  gap: var(--space-3);
  justify-content: flex-end;
  margin-top: var(--space-4);
}
</style>
