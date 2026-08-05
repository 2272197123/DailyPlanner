<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useScheduleStore } from '@/stores/schedule'
import { useCurrencyStore } from '@/stores/currency'
import { useRoutineStore } from '@/stores/routines'
import { useToastStore } from '@/stores/toast'
import { fmtDate, fmtDuration, calcTaskReward } from '@/utils/format'
import { MODE_HIERARCHY, DEFAULT_MODE_CFG, MODE_ORDER } from '@/utils/constants'
import TimelineNav from './TimelineNav.vue'
import TaskCard from './TaskCard.vue'
import RoutineItem from './RoutineItem.vue'

const scheduleStore = useScheduleStore()
const currencyStore = useCurrencyStore()
const routineStore = useRoutineStore()
const toastStore = useToastStore()

const showImportModal = ref(false)
const importJson = ref('')
const showStartTimeInput = ref(false)
const animating = ref(false)
const canvasRef = ref(null)

/* ── Timeline data ── */
const timeline = computed(() => scheduleStore.getComputedTimeline(scheduleStore.currentDate))

/* ── Routines for today ── */
const todayRoutines = computed(() => routineStore.routinesForCurrentDate)

/* ── Mode label ── */
const modeLabel = computed(() => {
  const cfg = DEFAULT_MODE_CFG[scheduleStore.mode]
  return cfg ? cfg.label : '🔋 完整'
})

/* ── Completion stats ── */
const stats = computed(() => {
  const blocks = scheduleStore.todayBlocks
  const total = blocks.length
  const done = blocks.filter(b => b.completed).length
  const totalSubtasks = blocks.reduce((s, b) => s + (b.subtasks ? b.subtasks.length : 0), 0)
  const doneSubtasks = blocks.reduce((s, b) => s + (b.subtasks ? b.subtasks.filter(st => st.done).length : 0), 0)
  const routines = todayRoutines.value
  const routineTotal = routines.length
  const rp = scheduleStore.routineProgress[scheduleStore.currentDate] || {}
  const routineDone = routines.filter(r => rp[r.id]).length
  return {
    total, done, pct: total ? Math.round(done / total * 100) : 0,
    subtaskTotal: totalSubtasks, subtaskDone: doneSubtasks,
    routineTotal, routineDone
  }
})

/* ── Date state ── */
const dateState = computed(() => scheduleStore.dateState)

/* ── Actions ── */
function handleToggleTask(blockId) {
  const completed = scheduleStore.toggleBlockDone(scheduleStore.currentDate, blockId)
  if (completed) {
    const block = scheduleStore.todayBlocks.find(b => b.id === blockId)
    const reward = block ? calcTaskReward(block) * 5 : 0
    currencyStore.addXP(reward, '完成任务: ' + (block ? block.subject : blockId))
    toastStore.ok('🎉 +' + reward + ' XP')
    spawnSparks(blockId)
  }
}

function handleToggleSubtask(blockId, si) {
  const result = scheduleStore.toggleSubtask(scheduleStore.currentDate, blockId, si)
  if (result && result.allDone) {
    const block = scheduleStore.todayBlocks.find(b => b.id === blockId)
    const reward = block ? calcTaskReward(block) * 5 : 0
    currencyStore.addXP(reward, '完成所有子任务: ' + (block ? block.subject : blockId))
    toastStore.ok('🎉 +' + reward + ' XP')
    spawnSparks(blockId)
  }
}

function handleImport() {
  let blocks
  try {
    blocks = JSON.parse(importJson.value)
    if (!Array.isArray(blocks)) {
      // Maybe it's a full plan object
      blocks = blocks.blocks || blocks.tasks || []
    }
  } catch {
    toastStore.err('JSON 格式无效')
    return
  }
  const count = scheduleStore.importPlan(scheduleStore.currentDate, blocks)
  showImportModal.value = false
  importJson.value = ''
  toastStore.ok('已导入 ' + count + ' 条任务')
}

function handleStartTimeChange(time) {
  scheduleStore.setTimelineStart(scheduleStore.currentDate, time)
}

/* ── Date navigation with animation ── */
async function navPrev() {
  await animateOut()
  scheduleStore.prevDay()
  scheduleStore.fetchDay(scheduleStore.currentDate)
  routineStore.initDailyCopy(scheduleStore.currentDate)
  await nextTick()
  animateIn()
}

async function navNext() {
  await animateOut()
  scheduleStore.nextDay()
  scheduleStore.fetchDay(scheduleStore.currentDate)
  routineStore.initDailyCopy(scheduleStore.currentDate)
  await nextTick()
  animateIn()
}

async function navToday() {
  if (scheduleStore.isToday) return
  await animateOut()
  scheduleStore.goToday()
  scheduleStore.fetchDay(scheduleStore.currentDate)
  routineStore.initDailyCopy(scheduleStore.currentDate)
  await nextTick()
  animateIn()
}

function animateOut() {
  return new Promise(resolve => {
    animating.value = true
    setTimeout(resolve, 250)
  })
}

function animateIn() {
  setTimeout(() => {
    animating.value = false
  }, 50)
}

/* ── Spark particle effect ── */
function spawnSparks(blockId) {
  const el = document.getElementById('card-' + blockId)
  if (!el) return
  const rect = el.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2

  const colors = ['#4a9', '#ea0', '#e55', '#68e', '#d4a76a', '#c8c4e0']
  for (let i = 0; i < 12; i++) {
    const spark = document.createElement('div')
    spark.className = 'spark-particle'
    const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.3
    const dist = 40 + Math.random() * 60
    const dx = Math.cos(angle) * dist
    const dy = Math.sin(angle) * dist
    spark.style.cssText = `
      position: fixed;
      left: ${cx}px; top: ${cy}px;
      width: 6px; height: 6px;
      border-radius: 50%;
      background: ${colors[i % colors.length]};
      pointer-events: none;
      z-index: 999;
      transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
      opacity: 1;
    `
    document.body.appendChild(spark)
    requestAnimationFrame(() => {
      spark.style.transform = `translate(${dx}px, ${dy}px) scale(0)`
      spark.style.opacity = '0'
    })
    setTimeout(() => spark.remove(), 700)
  }
}

onMounted(() => {
  scheduleStore.fetchDay(scheduleStore.currentDate)
  routineStore.initDailyCopy(scheduleStore.currentDate)
})
</script>

<template>
  <div class="timeline-shell">
    <!-- Date navigation -->
    <TimelineNav
      :date="scheduleStore.currentDate"
      :date-state="dateState"
      :mode-label="modeLabel"
      :mode="scheduleStore.mode"
      @prev="navPrev"
      @next="navNext"
      @today="navToday"
      @set-mode="scheduleStore.setMode"
      @import="showImportModal = true"
    />

    <!-- Hero progress -->
    <div class="hero-progress" :class="'state-' + dateState">
      <div class="hero-ring">
        <svg viewBox="0 0 100 100" class="hero-ring-svg">
          <circle cx="50" cy="50" r="44" class="ring-bg" />
          <circle cx="50" cy="50" r="44" class="ring-fill"
            :style="{ strokeDashoffset: 276.5 - (276.5 * stats.pct / 100) }" />
        </svg>
        <div class="hero-ring-text">
          <span class="hr-pct">{{ stats.pct }}%</span>
        </div>
      </div>
      <div class="hero-stats">
        <div class="hs-line">今日完成 <strong>{{ stats.done }}</strong> / {{ stats.total }} 项</div>
        <div class="hs-sub">固定 {{ stats.routineDone }}/{{ stats.routineTotal }} · 任务 {{ stats.done }}/{{ stats.total }}</div>
      </div>
    </div>

    <!-- Mode indicator -->
    <div class="mode-badge">{{ modeLabel }}</div>

    <!-- Timeline content -->
    <transition name="tl-fade">
      <div class="timeline-list" :key="scheduleStore.currentDate" v-if="!animating">
        <!-- Start time row -->
        <div class="tl-start-row" @click="showStartTimeInput = !showStartTimeInput">
          <span class="tl-start-label">🕐 起点</span>
          <span class="tl-start-time">{{ scheduleStore.timelineStart }}</span>
          <input
            v-if="showStartTimeInput"
            type="time"
            class="tl-start-input"
            :value="scheduleStore.timelineStart"
            @change="handleStartTimeChange(($event.target).value)"
            @blur="showStartTimeInput = false"
          />
        </div>

        <!-- Task cards -->
        <transition-group name="card-list" tag="div" class="tl-cards">
          <TaskCard
            v-for="(block, idx) in timeline"
            :key="block.id"
            :block="block"
            :index="idx"
            :date-state="dateState"
            @toggle="handleToggleTask"
            @toggle-subtask="(si) => handleToggleSubtask(block.id, si)"
          />
        </transition-group>

        <!-- Routine items -->
        <RoutineItem
          v-for="routine in todayRoutines"
          :key="'r-' + routine.id"
          :routine="routine"
          :date="scheduleStore.currentDate"
          :done="!!(scheduleStore.routineProgress[scheduleStore.currentDate] && scheduleStore.routineProgress[scheduleStore.currentDate][routine.id])"
        />

        <!-- Empty state -->
        <div v-if="!timeline.length && !todayRoutines.length" class="tl-empty">
          <span class="tl-empty-icon">🍃</span>
          <p>今日本无事，庸人自扰之</p>
          <p class="tl-empty-hint">该日期未导入计划 — 点「📥 导入」生成目标任务</p>
          <p class="tl-empty-hint">或在「🔁 固定事务」添加日常预设</p>
        </div>

        <!-- Clock decoration -->
        <div class="tl-clock">{{ new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }}</div>
      </div>
    </transition>

    <!-- Import modal -->
    <Teleport to="body">
      <transition name="modal">
        <div v-if="showImportModal" class="modal-overlay" @click.self="showImportModal = false">
          <div class="modal-panel import-panel">
            <div class="modal-head">
              <h3>📥 导入计划</h3>
              <button class="modal-close" @click="showImportModal = false">✕</button>
            </div>
            <textarea
              v-model="importJson"
              class="import-textarea"
              placeholder='粘贴 JSON 计划数据...&#10;&#10;格式：[{"subject":"任务标题","duration":30,"subtasks":[{"text":"子任务"}],"category":"study","priority":"high"}]'
              rows="10"
            ></textarea>
            <div class="import-actions">
              <button class="btn-primary" @click="handleImport">📥 导入</button>
              <button class="btn-secondary" @click="showImportModal = false">取消</button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<style scoped>
.timeline-shell {
  max-width: 680px;
  margin: 0 auto;
  padding-bottom: var(--space-12);
}

/* ── Hero progress ring ── */
.hero-progress {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  padding: var(--space-4) 0;
  margin-bottom: var(--space-4);
  transition: opacity var(--duration-normal) var(--ease-out);
}

.hero-ring {
  position: relative;
  width: 72px;
  height: 72px;
  flex-shrink: 0;
}

.hero-ring-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.ring-bg {
  fill: none;
  stroke: var(--border);
  stroke-width: 6;
}

.ring-fill {
  fill: none;
  stroke: var(--accent);
  stroke-width: 6;
  stroke-linecap: round;
  stroke-dasharray: 276.5;
  transition: stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.state-past .ring-fill { stroke: var(--state-past); }
.state-future .ring-fill { stroke: var(--state-future); }

.hero-ring-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.hr-pct {
  font-family: var(--font-data);
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--text-primary);
}

.hero-stats {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hs-line {
  font-size: var(--text-sm);
  color: var(--text-primary);
}

.hs-line strong {
  font-family: var(--font-data);
  color: var(--accent);
  font-size: var(--text-lg);
}

.hs-sub {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

/* ── Mode badge ── */
.mode-badge {
  display: inline-block;
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--accent);
  background: var(--accent-muted);
  border-radius: var(--radius-full);
  margin-bottom: var(--space-4);
}

/* ── Timeline start row ── */
.tl-start-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--bg-card);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  margin-bottom: var(--space-4);
  transition: border-color var(--duration-fast) var(--ease-out);
}

.tl-start-row:hover {
  border-color: var(--accent);
}

.tl-start-label {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.tl-start-time {
  font-family: var(--font-data);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--accent);
}

.tl-start-input {
  font-family: var(--font-data);
  font-size: var(--text-sm);
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  color: var(--text-primary);
}

/* ── Card list ── */
.tl-cards {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* ── Card list transition ── */
.card-list-enter-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  transition-delay: calc(var(--tl-i, 0) * 40ms);
}

.card-list-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 1, 1);
}

.card-list-enter-from {
  opacity: 0;
  transform: translateY(16px) scale(0.97);
}

.card-list-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

.card-list-move {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

/* ── Timeline fade transition ── */
.tl-fade-enter-active {
  transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.tl-fade-leave-active {
  transition: opacity 0.2s cubic-bezier(0.4, 0, 1, 1);
}

.tl-fade-enter-from {
  opacity: 0;
  transform: translateY(12px);
}

.tl-fade-leave-to {
  opacity: 0;
}

/* ── Empty state ── */
.tl-empty {
  text-align: center;
  padding: var(--space-12) var(--space-4);
  color: var(--text-secondary);
}

.tl-empty-icon {
  font-size: 3rem;
  display: block;
  margin-bottom: var(--space-4);
  animation: float 3s ease-in-out infinite;
}

.tl-empty p {
  margin-bottom: var(--space-2);
}

.tl-empty-hint {
  font-size: var(--text-sm);
  color: var(--text-muted);
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

/* ── Clock ── */
.tl-clock {
  text-align: center;
  font-family: var(--font-data);
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-top: var(--space-8);
  opacity: 0.6;
}

/* ── Import modal ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
}

.modal-panel {
  background: var(--bg-elevated);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  width: 90%;
  max-width: 520px;
  box-shadow: var(--shadow-lg);
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
  transition: background var(--duration-fast) var(--ease-out);
}

.modal-close:hover { background: var(--bg-muted); }

.import-textarea {
  width: 100%;
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-family: var(--font-data);
  font-size: var(--text-xs);
  resize: vertical;
  background: var(--bg);
  color: var(--text-primary);
}

.import-textarea:focus {
  border-color: var(--accent);
  outline: none;
}

.import-actions {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-4);
  justify-content: flex-end;
}

.btn-primary {
  padding: var(--space-2) var(--space-4);
  background: var(--accent);
  color: var(--text-inverse);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 600;
  transition: background var(--duration-fast) var(--ease-out);
}

.btn-primary:hover { background: var(--accent-light); }

.btn-secondary {
  padding: var(--space-2) var(--space-4);
  background: var(--bg-muted);
  color: var(--text-secondary);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  transition: background var(--duration-fast) var(--ease-out);
}

.btn-secondary:hover { background: var(--border); }

/* ── Modal transition ── */
.modal-enter-active { transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.modal-leave-active { transition: all 0.2s cubic-bezier(0.4, 0, 1, 1); }
.modal-enter-from { opacity: 0; }
.modal-enter-from .modal-panel { transform: scale(0.95) translateY(20px); }
.modal-leave-to { opacity: 0; }
</style>
