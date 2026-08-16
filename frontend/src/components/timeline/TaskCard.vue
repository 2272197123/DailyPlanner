<script setup>
import { ref, computed, nextTick } from 'vue'
import anime from 'animejs'
import { useScheduleStore } from '@/stores/schedule'
import { useToastStore } from '@/stores/toast'
import { escapeHtml, fmtDuration, calcTaskReward } from '@/utils/format'
import { CAT_EMOJI, PRI_LABELS } from '@/utils/constants'
import StarDial from '@/components/plan/StarDial.vue'
import StarStrip from '@/components/plan/StarStrip.vue'
import StarDateBar from '@/components/plan/StarDateBar.vue'

const props = defineProps({
  block: Object,
  index: Number,
  dateState: String,
  pinned: Array  // 当日钉时块区间 [{id,start,end}]，由 FlowTimeline 统一计算下发
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
  note: '',
  time: ''
})
const editDate = ref('')

/* ── 子任务折叠（默认收起，标题行显示进度）── */
const subsExpanded = ref(false)

function toggleSubs(e) {
  e.stopPropagation()
  subsExpanded.value = !subsExpanded.value
}

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

/* ═══ 星轨翻面：点击时间区域 → 卡片 3D 翻面设置时间 ═══ */
const flipped = ref(false)
const flipRef = ref(null)
const dialTime = ref('09:00')
let dialDirty = false // 用户真正拖过轮盘/拖杆才把 ✓完成 视为「应用时间」
let flipping = false

/* 当日其他钉时块区间（星图拖杆磁吸避让用）：优先用 FlowTimeline 下发的 pinned prop，
   未下发时回落到 store 计算（getComputedTimeline 已 memoize，开销可控） */
const otherPinned = computed(() => {
  const list = props.pinned ||
    scheduleStore.getComputedTimeline(scheduleStore.currentDate)
      .filter(b => b.time)
      .map(b => ({ id: b.id, start: b._startMin, end: b._endMin }))
  return list
    .filter(p => p.id !== props.block.id)
    .map(p => ({ start: p.start, end: p.end }))
})

function flipTo(showBack) {
  if (flipping) return
  flipping = true
  const el = flipRef.value
  if (!el) {
    flipped.value = showBack
    flipping = false
    return
  }
  anime({
    targets: el,
    rotateY: [0, 90],
    duration: 200,
    easing: 'easeInQuad',
    complete: () => {
      flipped.value = showBack
      nextTick(() => {
        anime({
          targets: el,
          rotateY: [-90, 0],
          duration: 260,
          easing: 'easeOutQuad',
          complete: () => {
            el.style.transform = '' // 清掉残留 transform，避免成为 fixed 后代包含块
            flipping = false
          }
        })
      })
    }
  })
}

function openFlip(e) {
  if (e) e.stopPropagation()
  if (flipped.value) return
  dialTime.value = props.block.time || props.block._startStr || '09:00'
  dialDirty = false
  flipTo(true)
}

function closeFlip() {
  if (!flipped.value) return
  flipTo(false)
}

/* ✓ 完成：拖过轮盘/拖杆则应用新时间（钉住或改时），否则仅翻面返回 */
function confirmFlip() {
  if (dialDirty && dialTime.value && dialTime.value !== (props.block.time || '')) {
    scheduleStore.updateBlock(scheduleStore.currentDate, props.block.id, { time: dialTime.value })
    toastStore.ok('已钉住 ' + dialTime.value)
  }
  closeFlip()
}

function pinTime() {
  scheduleStore.updateBlock(scheduleStore.currentDate, props.block.id, { time: dialTime.value })
  toastStore.ok('已钉住 ' + dialTime.value)
  closeFlip()
}

function unpinTime() {
  scheduleStore.updateBlock(scheduleStore.currentDate, props.block.id, { time: '' })
  toastStore.ok('已转为流动')
  closeFlip()
}

/* ── 编辑面板 ── */
function openEdit() {
  editForm.value = {
    subject: props.block.subject || '',
    duration: props.block.duration || 30,
    category: props.block.category || 'study',
    priority: props.block.priority || 'medium',
    note: props.block.note || '',
    time: props.block.time || ''
  }
  editDate.value = scheduleStore.currentDate
  editing.value = true
}

function clearEditTime() {
  editForm.value.time = ''
}

function saveEdit() {
  const cur = scheduleStore.currentDate
  const target = editDate.value || cur
  scheduleStore.updateBlock(cur, props.block.id, { ...editForm.value })
  if (target !== cur) {
    /* 换日期 = 把块移动到另一天（两边持久化） */
    scheduleStore.moveBlockToDate(cur, target, props.block.id)
    toastStore.ok('已移到 ' + target)
  } else {
    toastStore.ok('已保存')
  }
  editing.value = false
}

function handleDelete() {
  scheduleStore.removeBlock(scheduleStore.currentDate, props.block.id)
  toastStore.warn('已删除')
}
</script>

<template>
  <div
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

    <!-- 翻面容器（rotateY 90° 中缝换面，避免双面 absolute 高度同步问题） -->
    <div class="tc-flip" ref="flipRef">
      <!-- Card body（整卡点击切换完成；内部交互区均已 @click.stop） -->
      <div v-if="!flipped" class="card-body" @click="emit('toggle', block.id, $event)">
        <!-- 时间主标题：大号等宽，点击进入星轨轮盘 -->
        <div class="card-time-head" @click.stop="openFlip" title="点击设置时间">
          <span class="cth-time">
            {{ block._startStr || '--:--' }}<span class="cth-sep">–</span>{{ block._endStr || '--:--' }}
          </span>
          <span class="cth-badge" :class="{ pinned: !!block.time }">{{ block.time ? '📌 钉时' : '🌊 流动' }}</span>
        </div>

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

        <!-- Subtasks: 折叠头部（进度条 + n/m）+ 可展开列表 -->
        <div class="card-subtasks-head" v-if="subCount > 0" @click.stop="toggleSubs">
          <div class="cp-bar">
            <div class="cp-fill" :style="{ width: subPct + '%', background: subGradient }"></div>
          </div>
          <span class="cp-text">{{ doneCount }}/{{ subCount }}</span>
          <span class="cst-chevron" :class="{ open: subsExpanded }">▸</span>
        </div>
        <div class="card-subtasks" v-if="subCount > 0 && subsExpanded">
          <div
            v-for="(st, si) in block.subtasks"
            :key="'st-' + si"
            class="cst-item"
            :class="{ done: st.done }"
            @click.stop="emit('toggleSubtask', si, $event)"
          >
            <span class="cst-check" :class="{ checked: st.done }">
              <span v-if="st.done">✓</span>
            </span>
            <span class="cst-text">{{ st.text }}</span>
          </div>
        </div>

        <!-- Inline timer -->
        <div class="card-timer" @click.stop>
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

      <!-- 背面：星轨轮盘 + 星图拖杆（点击不切换完成） -->
      <div v-else class="card-body tc-back" @click.stop>
        <div class="tcb-head">
          <span class="tcb-title">✦ 星轨定时</span>
          <button class="ca-btn" @click="closeFlip" title="返回">✕</button>
        </div>
        <StarDial v-model="dialTime" @update:model-value="dialDirty = true" @pin="pinTime" @unpin="unpinTime" @confirm="confirmFlip" />
        <StarStrip v-model="dialTime" :pinned="otherPinned" @update:model-value="dialDirty = true" />
      </div>
    </div>

    <!-- Inline edit overlay（fixed 元素 → Teleport body，避免被翻面 transform 截断） -->
    <Teleport to="body">
      <div v-if="editing" class="card-edit-overlay" @click.self="editing = false">
        <div class="edit-panel">
          <h4>编辑任务</h4>
          <label>标题</label>
          <input v-model="editForm.subject" class="ep-input" />
          <label>时长 (分钟)</label>
          <input v-model.number="editForm.duration" type="number" class="ep-input" />

          <label>日期（可移到另一天）</label>
          <StarDateBar v-model="editDate" />

          <label>开始时间 <span class="ep-hint">{{ editForm.time ? '📌 ' + editForm.time : '🌊 流动（顺排）' }}</span></label>
          <StarDial v-model="editForm.time" :show-actions="false" />
          <StarStrip v-model="editForm.time" :pinned="otherPinned" />
          <div class="ep-time-actions">
            <button v-if="editForm.time" class="btn-secondary" @click="clearEditTime">🌊 转为流动（清除时间）</button>
          </div>

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
    </Teleport>
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
  position: relative;
  z-index: 0;
  transition: all var(--duration-fast) var(--ease-out);
}

/* 脉冲光环：box-shadow 动画不可合成（每帧 repaint），改为 ::after 的
   transform/opacity 呼吸（同 2s 节奏、同扩散渐隐观感，合成器直接渲染） */
.ctp-dot.pulsing::after {
  content: '';
  position: absolute;
  inset: -2px; /* 对齐 border-box 外缘 */
  border-radius: 50%;
  background: var(--accent);
  z-index: -1; /* 压在点本体下，只露出扩散出边界的部分（同 box-shadow 层序） */
  animation: dot-pulse 2s ease-in-out infinite;
}

@keyframes dot-pulse {
  0% { transform: scale(1); opacity: 0.55; }
  100% { transform: scale(2); opacity: 0; }
}

.state-past .ctp-dot { background: var(--state-past); }
.state-future .ctp-dot { background: var(--state-future); }

/* ── 翻面容器 ── */
.tc-flip {
  flex: 1;
  min-width: 0;
  perspective: 900px;
  transform-style: preserve-3d;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

/* ── Card body ── */
.card-body {
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

/* ── 时间主标题（大号等宽 + 钉时/流动徽章） ── */
.card-time-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: calc(var(--space-2) * -1) calc(var(--space-2) * -1) var(--space-1);
  padding: var(--space-2);
  border-radius: var(--radius-md);
  transition: background var(--duration-fast) var(--ease-out);
}

.card-time-head:hover {
  background: var(--accent-muted);
}

.cth-time {
  font-family: var(--font-data);
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--accent);
  letter-spacing: 0.02em;
}

.cth-sep {
  margin: 0 2px;
  color: var(--text-muted);
  font-weight: 400;
}

.cth-badge {
  font-size: 10px;
  padding: 1px var(--space-2);
  border-radius: var(--radius-full);
  background: var(--bg-muted);
  color: var(--text-muted);
}

.cth-badge.pinned {
  background: var(--accent-muted);
  color: var(--accent);
}

/* ── 背面 ── */
.tc-back {
  cursor: default;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.tcb-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tcb-title {
  font-family: var(--font-heading);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--accent);
}

/* ── Header ── */
.card-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.card-icon { font-size: var(--text-base); }

.card-title {
  flex: 1;
  min-width: 0;
  font-size: var(--text-lg);
  font-weight: 700;
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
  color: var(--on-accent, #fff);
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

/* ── Subtasks collapse header ── */
.card-subtasks-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-3);
  cursor: pointer;
  user-select: none;
}

.card-subtasks-head:hover .cst-chevron {
  color: var(--accent);
}

.cst-chevron {
  font-size: var(--text-xs);
  color: var(--text-muted);
  transition: transform var(--duration-fast) var(--ease-out),
              color var(--duration-fast) var(--ease-out);
  flex-shrink: 0;
}

.cst-chevron.open {
  transform: rotate(90deg);
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
  -webkit-backdrop-filter: blur(4px);
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
  max-height: 90vh;
  overflow-y: auto;
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

.ep-hint {
  margin-left: var(--space-2);
  color: var(--accent);
  font-weight: 600;
}

.ep-time-actions {
  display: flex;
  justify-content: center;
  margin-top: var(--space-2);
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

/* ── 移动端 ── */
@media (max-width: 768px) {
  /* 头部一行放不下时允许换行，按钮组靠右 */
  .card-header {
    flex-wrap: wrap;
  }

  /* 标题保证最小宽度，避免被时长/XP/按钮挤成逐字竖排 */
  .card-title {
    flex: 1 1 7em;
  }

  .card-actions {
    margin-left: auto;
  }

  /* 计时器：进度条独占一行，时间与按钮一行 */
  .card-timer {
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .ctimer-bar {
    flex: 1 1 100%;
    order: -1;
  }

  .edit-panel {
    padding: var(--space-5);
  }
}
</style>
