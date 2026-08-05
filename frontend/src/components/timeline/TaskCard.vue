<script setup>
import { ref, computed } from 'vue'
import { useScheduleStore } from '@/stores/schedule'
import { useToastStore } from '@/stores/toast'
import { escapeHtml, fmtDuration, calcTaskReward } from '@/utils/format'
import { CAT_EMOJI, PRI_LABELS } from '@/utils/constants'

const props = defineProps({
  block: Object,
  index: Number,
  dateState: String
})

const emit = defineEmits(['toggle', 'toggleSubtask', 'edit', 'delete', 'timerStart'])

const scheduleStore = useScheduleStore()
const toastStore = useToastStore()

/* ── Timer ── */
const timerSec = ref(0)
const timerRunning = ref(false)
let timerInterval = null

function toggleTimer(e) {
  e.stopPropagation()
  if (timerRunning.value) {
    clearInterval(timerInterval)
    timerRunning.value = false
  } else {
    timerRunning.value = true
    timerInterval = setInterval(() => {
      timerSec.value++
    }, 1000)
  }
}

function resetTimer(e) {
  e.stopPropagation()
  clearInterval(timerInterval)
  timerRunning.value = false
  timerSec.value = 0
}

function fmtTimer(s) {
  if (!s || s < 0) return '00:00:00'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':')
}

/* ── Timer ratio for progress bar color ── */
const timerRatio = computed(() => {
  const dur = props.block.duration || 30
  return timerSec.value / (dur * 60)
})

const timerColor = computed(() => {
  if (timerRatio.value < 0.5) return 'var(--success)'
  if (timerRatio.value < 0.9) return 'var(--accent)'
  if (timerRatio.value < 1.2) return 'var(--warning)'
  return 'var(--danger)'
})

const editing = ref(false)
const editForm = ref({
  subject: '',
  duration: 30,
  category: 'study',
  priority: 'medium',
  note: ''
})

/* ── Computed display ── */
const subCount = computed(() => (props.block.subtasks || []).length)
const doneCount = computed(() => (props.block.subtasks || []).filter(s => s.done).length)
const subPct = computed(() => subCount.value ? Math.round(doneCount.value / subCount.value * 100) : (props.block.completed ? 100 : 0))
const xpReward = computed(() => calcTaskReward(props.block) * 5)
const catEmoji = computed(() => CAT_EMOJI[props.block.category] || '📌')
const priLabel = computed(() => PRI_LABELS[props.block.priority] || '')
const timelineTime = computed(() => props.block._startStr || '')
const durationFmt = computed(() => fmtDuration(props.block.duration))

/* ── Subtask progress gradient ── */
const subGradient = computed(() => {
  if (subPct.value >= 100) return 'var(--success)'
  if (subPct.value >= 60) return 'var(--accent)'
  if (subPct.value >= 30) return 'var(--warning)'
  return 'var(--text-muted)'
})

function openEdit() {
  editForm.value = {
    subject: props.block.subject || '',
    duration: props.block.duration || 30,
    category: props.block.category || 'study',
    priority: props.block.priority || 'medium',
    note: props.block.note || ''
  }
  editing.value = true
}

function saveEdit() {
  scheduleStore.updateBlock(scheduleStore.currentDate, props.block.id, editForm.value)
  editing.value = false
  toastStore.ok('已保存')
}

function handleDelete() {
  scheduleStore.removeBlock(scheduleStore.currentDate, props.block.id)
  toastStore.warn('已删除')
}
</script>

<template>
  <div
    :id="'card-' + block.id"
    class="task-card"
    :class="{
      'card-completed': block.completed,
      'card-active': !block.completed,
      ['state-' + dateState]: true
    }"
    :style="{ '--tl-i': index }"
  >
    <!-- Timeline time pipe -->
    <div class="card-time-pipe">
      <span class="ctp-time">{{ timelineTime }}</span>
      <div class="ctp-line"></div>
      <div class="ctp-dot" :class="{ pulsing: !block.completed }"></div>
    </div>

    <!-- Card body -->
    <div class="card-body" @click.self="emit('toggle', block.id)">
      <!-- Header row -->
      <div class="card-header">
        <span class="card-icon">{{ catEmoji }}</span>
        <span class="card-title">{{ block.subject || '(未命名)' }}</span>
        <span class="card-duration">{{ durationFmt }}</span>

        <!-- XP badge -->
        <span class="card-xp" v-if="!block.completed">+{{ xpReward }} XP</span>
        <span class="card-xp done" v-else>✓ 已获得</span>

        <div class="card-actions">
          <button class="ca-btn" @click.stop="openEdit" title="编辑">✎</button>
          <button class="ca-btn ca-del" @click.stop="handleDelete" title="删除">✕</button>
        </div>
      </div>

      <!-- Tags row -->
      <div class="card-tags" v-if="block.category || block.priority || block.goalId">
        <span class="ct-tag ct-cat">{{ catEmoji }} {{ block.category || 'other' }}</span>
        <span class="ct-tag ct-pri" v-if="priLabel">{{ priLabel }}</span>
        <span class="ct-tag ct-goal" v-if="block.goalId">{{ block.phase || '目标' }}</span>
      </div>

      <!-- Note -->
      <div class="card-note" v-if="block.note">{{ block.note }}</div>

      <!-- Subtask list -->
      <div class="card-subtasks" v-if="block.subtasks && block.subtasks.length">
        <div
          v-for="(st, si) in block.subtasks"
          :key="'st-' + si"
          class="cst-item"
          :class="{ done: st.done }"
          @click.stop="emit('toggleSubtask', si)"
        >
          <span class="cst-check" :class="{ checked: st.done }">
            <span v-if="st.done">✓</span>
          </span>
          <span class="cst-text">{{ st.text }}</span>
        </div>
      </div>

      <!-- Progress bar -->
      <div class="card-progress" v-if="subCount > 0">
        <div class="cp-bar">
          <div class="cp-fill" :style="{ width: subPct + '%', background: subGradient }"></div>
        </div>
        <span class="cp-text">{{ doneCount }}/{{ subCount }}</span>
      </div>

      <!-- Inline timer -->
      <div class="card-timer">
        <div class="ctimer-bar" v-if="timerRunning || timerSec > 0">
          <div class="ctimer-fill" :style="{ width: Math.min(timerRatio * 100, 100) + '%', background: timerColor }"></div>
        </div>
        <span class="ctimer-display" :class="{ running: timerRunning }">{{ fmtTimer(timerSec) }}</span>
        <div class="ctimer-btns">
          <button class="ctimer-btn" :class="timerRunning ? 'pause' : 'play'" @click="toggleTimer">
            {{ timerRunning ? '⏸' : '▶' }}
          </button>
          <button v-if="timerSec > 0" class="ctimer-btn reset" @click="resetTimer" title="重置">↺</button>
        </div>
      </div>
    </div>

    <!-- Inline edit overlay -->
    <div v-if="editing" class="card-edit-overlay" @click.self="editing = false">
      <div class="edit-panel">
        <h4>编辑任务</h4>
        <label>标题</label>
        <input v-model="editForm.subject" class="ep-input" />
        <label>时长 (分钟)</label>
        <input v-model.number="editForm.duration" type="number" class="ep-input" />
        <label>分类</label>
        <select v-model="editForm.category" class="ep-input">
          <option value="study">📚 学习</option>
          <option value="work">💼 工作</option>
          <option value="life">🏠 生活</option>
          <option value="health">💪 健康</option>
          <option value="review">📝 复盘</option>
          <option value="other">📌 其他</option>
        </select>
        <label>优先级</label>
        <select v-model="editForm.priority" class="ep-input">
          <option value="high">🔴 高</option>
          <option value="medium">🟡 中</option>
          <option value="low">🟢 低</option>
        </select>
        <label>备注</label>
        <input v-model="editForm.note" class="ep-input" />
        <div class="ep-actions">
          <button class="btn-primary" @click="saveEdit">💾 保存</button>
          <button class="btn-secondary" @click="editing = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Card shell ── */
.task-card {
  display: flex;
  gap: var(--space-3);
  position: relative;
}

/* ── Time pipe ── */
.card-time-pipe {
  width: 52px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 2px;
}

.ctp-time {
  font-family: var(--font-data);
  font-size: 10px;
  color: var(--text-muted);
  margin-bottom: var(--space-1);
}

.ctp-line {
  width: 2px;
  flex: 1;
  background: var(--border);
  min-height: 100%;
}

.ctp-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid var(--bg-elevated);
  margin-top: -5px;
  transition: all var(--duration-fast) var(--ease-out);
}

.ctp-dot.pulsing {
  animation: dot-pulse 2s ease-in-out infinite;
}

@keyframes dot-pulse {
  0%, 100% { box-shadow: 0 0 0 0 var(--accent); }
  50% { box-shadow: 0 0 0 6px transparent; }
}

.state-past .ctp-dot { background: var(--state-past); }
.state-future .ctp-dot { background: var(--state-future); }

/* ── Card body ── */
.card-body {
  flex: 1;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  transition: all var(--duration-normal) var(--ease-out);
  position: relative;
  cursor: pointer;
}

.card-body:hover {
  border-color: var(--accent);
  box-shadow: var(--shadow-md);
}

.card-completed .card-body {
  opacity: 0.55;
}

.card-completed .card-title {
  text-decoration: line-through;
  color: var(--text-muted);
}

/* ── Header ── */
.card-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.card-icon { font-size: var(--text-lg); }

.card-title {
  flex: 1;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-primary);
  transition: color var(--duration-fast) var(--ease-out);
}

.card-duration {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  color: var(--text-muted);
  background: var(--bg-muted);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
}

.card-xp {
  font-family: var(--font-data);
  font-size: 10px;
  font-weight: 600;
  color: var(--accent);
  background: var(--accent-muted);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-full);
}

.card-xp.done {
  color: var(--success);
  background: var(--success-bg);
}

.card-actions {
  display: flex;
  gap: 2px;
  margin-left: var(--space-2);
}

.ca-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  transition: all var(--duration-fast) var(--ease-out);
}

.ca-btn:hover { background: var(--bg-muted); color: var(--accent); }
.ca-del:hover { color: var(--danger); }

/* ── Tags ── */
.card-tags {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-2);
  flex-wrap: wrap;
}

.ct-tag {
  font-size: 10px;
  padding: 1px var(--space-2);
  border-radius: var(--radius-sm);
}

.ct-cat { background: var(--bg-muted); color: var(--text-secondary); }
.ct-pri { background: var(--warning-bg); color: var(--warning); }
.ct-goal { background: var(--accent-muted); color: var(--accent); }

/* ── Note ── */
.card-note {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  margin-top: var(--space-2);
  line-height: 1.5;
}

/* ── Subtasks ── */
.card-subtasks {
  margin-top: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.cst-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.cst-item:hover { background: var(--bg-muted); }

.cst-check {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--border);
  border-radius: 50%;
  font-size: 10px;
  transition: all var(--duration-fast) var(--ease-out);
  flex-shrink: 0;
}

.cst-check.checked {
  background: var(--success);
  border-color: var(--success);
  color: white;
}

.cst-text {
  font-size: var(--text-sm);
  color: var(--text-primary);
  transition: all var(--duration-fast) var(--ease-out);
}

.cst-item.done .cst-text {
  text-decoration: line-through;
  color: var(--text-muted);
}

/* ── Progress bar ── */
.card-progress {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.cp-bar {
  flex: 1;
  height: 4px;
  background: var(--bg-muted);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.cp-fill {
  height: 100%;
  border-radius: var(--radius-full);
  transition: width 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.cp-text {
  font-family: var(--font-data);
  font-size: 10px;
  color: var(--text-muted);
  flex-shrink: 0;
}

/* ── Edit overlay ── */
.card-edit-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
}

.edit-panel {
  background: var(--bg-elevated);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  width: 90%;
  max-width: 400px;
  box-shadow: var(--shadow-lg);
}

.edit-panel h4 {
  font-family: var(--font-heading);
  margin-bottom: var(--space-4);
}

.edit-panel label {
  display: block;
  font-size: var(--text-xs);
  color: var(--text-secondary);
  margin: var(--space-3) 0 var(--space-1);
}

.ep-input {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  background: var(--bg);
  color: var(--text-primary);
}

.ep-input:focus { border-color: var(--accent); outline: none; }

.ep-actions {
  display: flex;
  gap: var(--space-3);
  justify-content: flex-end;
  margin-top: var(--space-5);
}

.btn-primary {
  padding: var(--space-2) var(--space-4);
  background: var(--accent);
  color: var(--text-inverse);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 600;
}

.btn-primary:hover { background: var(--accent-light); }

.btn-secondary {
  padding: var(--space-2) var(--space-4);
  background: var(--bg-muted);
  color: var(--text-secondary);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}

.btn-secondary:hover { background: var(--border); }

/* ── Inline timer ── */
.card-timer {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-4);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
}

.ctimer-bar {
  flex: 1;
  height: 3px;
  background: var(--bg-muted);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.ctimer-fill {
  height: 100%;
  border-radius: var(--radius-full);
  transition: width 1s linear, background 0.3s var(--ease-out);
}

.ctimer-display {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-muted);
  min-width: 56px;
  text-align: center;
}

.ctimer-display.running {
  color: var(--success);
  animation: timer-pulse 1.5s ease-in-out infinite;
}

@keyframes timer-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.ctimer-btns {
  display: flex;
  gap: 2px;
}

.ctimer-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  transition: all var(--duration-fast) var(--ease-out);
}

.ctimer-btn.play { color: var(--success); }
.ctimer-btn.play:hover { background: var(--success-bg); }
.ctimer-btn.pause { color: var(--warning); }
.ctimer-btn.pause:hover { background: var(--warning-bg); }
.ctimer-btn.reset { color: var(--text-muted); font-size: var(--text-xs); }
.ctimer-btn.reset:hover { background: var(--bg-muted); color: var(--danger); }
</style>
