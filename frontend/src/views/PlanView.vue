<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, onBeforeRouteLeave } from 'vue-router'
import { useScheduleStore } from '@/stores/schedule'
import { useRoutineStore } from '@/stores/routines'
import { useToastStore } from '@/stores/toast'
import { fmtDate } from '@/utils/format'
import WeekStrip from '@/components/plan/WeekStrip.vue'
import FlowTimeline from '@/components/plan/FlowTimeline.vue'
import RecurringRulesModal from '@/components/plan/RecurringRulesModal.vue'
import CountdownPanel from '@/components/plan/CountdownPanel.vue'
import DailyReview from '@/components/plan/DailyReview.vue'
import ImportPlanModal from '@/components/plan/ImportPlanModal.vue'
import CardFlyIn from '@/components/plan/CardFlyIn.vue'
import StarDial from '@/components/plan/StarDial.vue'
import StarDateBar from '@/components/plan/StarDateBar.vue'
import { CAT_EMOJI } from '@/utils/constants'

const route = useRoute()
const scheduleStore = useScheduleStore()
const routineStore = useRoutineStore()
const toastStore = useToastStore()

const weekStripRef = ref(null)

/* ── 日期切换：拉取计划/预设/规则 → 空白日自动预填 → 打卡 + 日课副本 ── */
/* 序号守卫：快速连点切日期时，过期 loadDate 的后续写入（ensureDayPlan/toast/initDailyCopy）直接丢弃 */
let loadSeq = 0
async function loadDate(date) {
  const seq = ++loadSeq
  await Promise.all([
    scheduleStore.fetchDay(date),
    scheduleStore.fetchPresetAndRules()
  ])
  if (seq !== loadSeq) return
  // v14：空白的新日期（今天/未来）仅自动物化周期规则；预设改为手动「导入前一天」
  const filled = await scheduleStore.ensureDayPlan(date)
  if (seq !== loadSeq) return
  if (filled) toastStore.ok('已按你的固定日程填入，可继续调整')
  scheduleStore.fetchRoutineProgress(date)
  await routineStore.fetchRoutines()
  if (seq !== loadSeq) return
  routineStore.initDailyCopy(date)
}

/* 路由离开前 flush 防抖中的 saveDay，避免丢数据 */
onBeforeRouteLeave(() => {
  scheduleStore.flushAllSaves()
})

watch(() => scheduleStore.currentDate, (date) => {
  if (date) loadDate(date)
})

onMounted(() => {
  // route.query.date 仅作为进入页面时的初始值
  const q = route.query.date
  if (typeof q === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(q)) {
    const prev = scheduleStore.currentDate
    scheduleStore.setDate(q)
    // q 与 currentDate 相同时 watch 不触发，需要显式加载
    if (q === prev) loadDate(q)
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
const showRulesModal = ref(false)
const showImportModal = ref(false)
const flyInRef = ref(null)
const newTask = ref({ subject: '', duration: 30, priority: 'medium', time: '', date: '' })

/* 打开新建 modal：日期默认当前查看日 */
function openAdd() {
  newTask.value.date = scheduleStore.currentDate
  showAddModal.value = true
}

/* 新卡片落入时间轴后，播放「贴上时间轴」动效 */
function playFlyIn(id, subject, emoji) {
  setTimeout(() => {
    flyInRef.value?.play({
      subject,
      emoji,
      targetSel: `[data-bid="${id}"]`
    })
  }, 60)
}

async function handleAdd() {
  const subject = newTask.value.subject.trim()
  if (!subject) {
    toastStore.warn('请填写任务名')
    return
  }
  const date = newTask.value.date || scheduleStore.currentDate
  /* 目标日计划未加载时先拉取，避免覆盖服务端已有计划 */
  if (!scheduleStore.schedules[date]) {
    await scheduleStore.fetchDay(date)
  }
  const id = 'blk_' + Date.now()
  scheduleStore.addBlock(date, {
    id,
    subject,
    duration: Number(newTask.value.duration) || 30,
    priority: newTask.value.priority,
    category: 'study',
    time: newTask.value.time || '',
    subtasks: [],
    completed: false
  })
  showAddModal.value = false
  newTask.value = { subject: '', duration: 30, priority: 'medium', time: '', date: scheduleStore.currentDate }
  if (date === scheduleStore.currentDate) {
    playFlyIn(id, subject, CAT_EMOJI.study)
  } else {
    /* 加到非当前日：目标不在时间轴上，跳过飞入动效 */
    toastStore.ok('已添加到 ' + fmtDate(date))
  }
}

/* ── 导入前一天计划（用户勾选取舍）── */
function handleImport(selected) {
  if (!selected.length) return
  const date = scheduleStore.currentDate
  const ts = Date.now()
  const clones = selected.map((b, i) => {
    const { _checked, _startMin, _startStr, _prevSubtaskDone, ...rest } = b
    return {
      ...rest,
      id: `blk_imp_${ts}_${i}`,
      completed: false,
      completedAt: null,
      subtasks: (b.subtasks || []).map(st => ({ ...st, done: false }))
    }
  })
  scheduleStore.importPlan(date, clones)
  showImportModal.value = false
  toastStore.ok(`已导入 ${clones.length} 项任务`)
  playFlyIn(clones[0].id, `导入 ${clones.length} 项任务`, '📥')
}
</script>

<template>
  <div class="plan-view">
    <!-- 页头：日期导航 + 三态点 + 操作 -->
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
          <button class="btn btn-primary btn-sm" @click="openAdd">＋ 新任务</button>
          <button class="btn btn-secondary btn-sm" @click="showImportModal = true">⏮ 导入前一天</button>
          <button class="btn btn-secondary btn-sm" @click="showRulesModal = true">🗓 固定日程</button>
        </div>
      </div>
    </header>

    <!-- 周导航 -->
    <WeekStrip ref="weekStripRef" />

    <!-- 三栏：左每日复盘 + 中时间轴 + 右倒数日（窄屏降级，移动端堆叠） -->
    <div class="plan-columns">
      <div class="plan-main">
        <!-- 纵向时间轴（v13） -->
        <FlowTimeline
          @add="openAdd"
          @rules="showRulesModal = true"
          @import="showImportModal = true"
        />
      </div>
      <CountdownPanel class="plan-rail plan-rail-right" />
      <DailyReview class="plan-rail plan-rail-left" />
    </div>

    <!-- 周期固定日程管理 -->
    <Teleport to="body">
      <RecurringRulesModal v-if="showRulesModal" @close="showRulesModal = false" />
    </Teleport>

    <!-- 导入前一天计划 -->
    <Teleport to="body">
      <ImportPlanModal
        v-if="showImportModal"
        :date="scheduleStore.currentDate"
        @close="showImportModal = false"
        @import="handleImport"
      />
    </Teleport>

    <!-- 任务卡「贴上时间轴」动效 -->
    <CardFlyIn ref="flyInRef" />

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
          <label class="mf-label">日期</label>
          <StarDateBar v-model="newTask.date" />
          <label class="mf-label">开始时间</label>
          <div class="mf-time-toggle">
            <button
              type="button"
              class="mf-time-btn"
              :class="{ on: !newTask.time }"
              @click="newTask.time = ''"
            >🌊 流动顺排</button>
            <button
              type="button"
              class="mf-time-btn"
              :class="{ on: !!newTask.time }"
              @click="newTask.time = newTask.time || '09:00'"
            >📌 钉住时间</button>
          </div>
          <StarDial v-if="newTask.time" v-model="newTask.time" :show-actions="false" />
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

/* 分栏布局：默认移动端堆叠（时间轴 → 倒数日 → 复盘） */
.plan-columns {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.plan-main { order: 1; }
.plan-rail-right { order: 2; }
.plan-rail-left { order: 3; }

/* 中屏：时间轴 + 右倒数日，复盘通栏置底 */
@media (min-width: 1024px) and (max-width: 1279px) {
  .plan-view {
    max-width: 1080px;
  }
  .plan-columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    align-items: start;
  }
  .plan-main { grid-column: 1; grid-row: 1; }
  .plan-rail-right {
    grid-column: 2;
    grid-row: 1;
    position: sticky;
    top: var(--space-5);
  }
  .plan-rail-left { grid-column: 1 / -1; grid-row: 2; }
}

/* 宽屏：左复盘 + 中时间轴 + 右倒数日 */
@media (min-width: 1280px) {
  .plan-view {
    max-width: 1360px;
  }
  .plan-columns {
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr) 300px;
    align-items: start;
  }
  .plan-rail-left {
    grid-column: 1;
    grid-row: 1;
    order: unset;
    position: sticky;
    top: var(--space-5);
  }
  .plan-main { grid-column: 2; grid-row: 1; order: unset; }
  .plan-rail-right {
    grid-column: 3;
    grid-row: 1;
    order: unset;
    position: sticky;
    top: var(--space-5);
  }
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

/* ── Modals ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
  background: rgba(0, 0, 0, 0.4);
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
  max-height: 90vh;
  overflow-y: auto;
}

/* 开始时间：流动/钉住切换 */
.mf-time-toggle {
  display: flex;
  gap: var(--space-2);
}

.mf-time-btn {
  flex: 1;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--text-xs);
  color: var(--text-secondary);
  background: var(--bg-muted);
  transition: all var(--duration-fast) var(--ease-out);
}

.mf-time-btn.on {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-muted);
  font-weight: 600;
}

.mf-time-toggle + .star-dial {
  margin-top: var(--space-3);
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
