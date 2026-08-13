<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import anime from 'animejs'
import { useScheduleStore } from '@/stores/schedule'
import { useRoutineStore } from '@/stores/routines'
import { useCurrencyStore } from '@/stores/currency'
import { useAiStore } from '@/stores/ai'
import { useToastStore } from '@/stores/toast'
import { calcTaskReward } from '@/utils/format'
import { useAnime } from '@/composables/useAnime'
import TaskCard from '@/components/timeline/TaskCard.vue'
import RoutineItem from '@/components/timeline/RoutineItem.vue'

const emit = defineEmits(['add'])

const scheduleStore = useScheduleStore()
const routineStore = useRoutineStore()
const currencyStore = useCurrencyStore()
const aiStore = useAiStore()
const toastStore = useToastStore()
const { burst } = useAnime()

const dateState = computed(() => scheduleStore.dateState)

/* ═══ 数据合并：任务块 + 固定事务 → 统一时间轴 ═══ */
function parseHM(time) {
  if (!time || typeof time !== 'string') return null
  const m = time.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

const timedRows = computed(() => {
  const date = scheduleStore.currentDate
  const rows = []
  scheduleStore.getComputedTimeline(date).forEach(b => {
    rows.push({ kind: 'block', key: 'b_' + b.id, minutes: b._startMin, payload: b })
  })
  routineStore.routinesForCurrentDate.forEach(r => {
    const minutes = parseHM(r.time)
    if (minutes === null) return // 无时间 → 归入"任意时间"组
    rows.push({ kind: 'routine', key: 'r_' + r.id, minutes, payload: r })
  })
  rows.sort((a, b) => a.minutes - b.minutes)
  return rows
})

const anytimeRoutines = computed(() =>
  routineStore.routinesForCurrentDate.filter(r => parseHM(r.time) === null)
)

/* ═══ 现在时刻线（仅今天，每分钟刷新）═══ */
const nowMin = ref(0)
const nowStr = ref('')
let nowTimer = null

function updateNow() {
  const d = new Date()
  nowMin.value = d.getHours() * 60 + d.getMinutes()
  nowStr.value = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

/* 把"现在"作为哨兵行插入排序位置 */
const rows = computed(() => {
  const list = [...timedRows.value]
  if (scheduleStore.isToday) {
    const nowRow = { kind: 'now', key: '__now__', minutes: nowMin.value }
    let idx = list.findIndex(r => r.minutes > nowMin.value)
    if (idx === -1) idx = list.length
    list.splice(idx, 0, nowRow)
  }
  return list
})

const isEmpty = computed(() =>
  !scheduleStore.todayBlocks.length && !routineStore.routinesForCurrentDate.length
)

/* ═══ 完成统计 / 全部完成庆祝 ═══ */
const routineDoneMap = computed(() => scheduleStore.routineProgress[scheduleStore.currentDate] || {})

const allDone = computed(() => {
  const blocks = scheduleStore.todayBlocks
  const routines = routineStore.routinesForCurrentDate
  const total = blocks.length + routines.length
  if (!total) return false
  const rp = routineDoneMap.value
  return blocks.every(b => b.completed) && routines.every(r => rp[r.id])
})

const celebratedDates = new Set()
const showSeal = ref(false)
const sealRef = ref(null)

const CHEERS = [
  '今日毕，功不唐捐 🎉',
  '全部完成！给自己倒杯茶吧 🍵',
  '今日事今日毕，漂亮！',
  '完美的一天，明天见 ✨',
  '知行合一，今日圆满 🏅'
]

function celebrate() {
  const date = scheduleStore.currentDate
  celebratedDates.add(date)

  // 多次粒子爆发（不同坐标/颜色）
  const w = window.innerWidth
  const h = window.innerHeight
  burst(w * 0.3, h * 0.35, { count: 16 })
  setTimeout(() => burst(w * 0.7, h * 0.4, { count: 16, colors: ['#4a9', '#d4a76a', '#8a7bb8'] }), 220)
  setTimeout(() => burst(w * 0.5, h * 0.28, { count: 20 }), 420)

  // 朱砂印章浮印：弹入 → 停留 → 淡出
  showSeal.value = true
  nextTick(() => {
    if (!sealRef.value) return
    anime({
      targets: sealRef.value,
      scale: [1.9, 1],
      rotate: [-16, -8],
      opacity: [0, 0.92],
      easing: 'easeOutElastic(1, .5)',
      duration: 900
    })
    setTimeout(() => {
      if (!sealRef.value) return
      anime({
        targets: sealRef.value,
        opacity: [0.92, 0],
        translateY: [0, -12],
        easing: 'easeInQuad',
        duration: 600,
        complete: () => { showSeal.value = false }
      })
    }, 2200)
  })

  toastStore.ok(CHEERS[Math.floor(Math.random() * CHEERS.length)])
}

function maybeCelebrate() {
  if (allDone.value && !celebratedDates.has(scheduleStore.currentDate)) {
    celebrate()
  }
}

/* ═══ 勾选完成（XP 防刷分 + 粒子）═══ */
function handleToggleTask(blockId, event) {
  const date = scheduleStore.currentDate
  const completed = scheduleStore.toggleBlockDone(date, blockId)
  if (completed === undefined) return
  if (completed) {
    const block = scheduleStore.todayBlocks.find(b => b.id === blockId)
    const reward = block ? calcTaskReward(block) * 5 : 0
    if (reward && scheduleStore.awardOnce(date, 'block_' + blockId)) {
      currencyStore.addXP(reward, '完成任务: ' + (block ? block.subject : blockId))
      toastStore.ok('🎉 +' + reward + ' XP')
    } else {
      toastStore.ok('已完成')
    }
    if (event) burst(event.clientX, event.clientY, { count: 12 })
    maybeCelebrate()
  }
}

function handleToggleSubtask(blockId, si, event) {
  const date = scheduleStore.currentDate
  const result = scheduleStore.toggleSubtask(date, blockId, si)
  if (result && result.allDone) {
    const block = scheduleStore.todayBlocks.find(b => b.id === blockId)
    const reward = block ? calcTaskReward(block) * 5 : 0
    if (reward && scheduleStore.awardOnce(date, 'block_' + blockId)) {
      currencyStore.addXP(reward, '完成所有子任务: ' + (block ? block.subject : blockId))
      toastStore.ok('🎉 +' + reward + ' XP')
    } else {
      toastStore.ok('已完成')
    }
    if (event) burst(event.clientX, event.clientY, { count: 12 })
    maybeCelebrate()
  }
}

function onRoutineToggle() {
  maybeCelebrate()
}

/* ═══ 拖拽排序（仅任务块，HTML5 DnD）═══ */
const dragId = ref(null)
const dragOverId = ref(null)

function onDragStart(row, event) {
  dragId.value = row.payload.id
  event.dataTransfer.effectAllowed = 'move'
}

function onDragOver(row, event) {
  if (!dragId.value || row.kind !== 'block') return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  dragOverId.value = row.payload.id
}

function onDrop(row) {
  if (!dragId.value || row.kind !== 'block') return
  const date = scheduleStore.currentDate
  const ids = scheduleStore.getComputedTimeline(date).map(b => b.id)
  const from = ids.indexOf(dragId.value)
  const to = ids.indexOf(row.payload.id)
  if (from !== -1 && to !== -1 && from !== to) {
    ids.splice(to, 0, ids.splice(from, 1)[0])
    scheduleStore.applyOrder(date, ids)
  }
  dragId.value = null
  dragOverId.value = null
}

function onDragEnd() {
  dragId.value = null
  dragOverId.value = null
}

/* ═══ 固定事务模板管理（折叠面板）═══ */
const showRoutineMgr = ref(false)
const newRoutine = ref({ icon: '', name: '', time: '' })

function syncTodayCopy() {
  const date = scheduleStore.currentDate
  if (routineStore.dailyCopies[date]) {
    routineStore.saveForDate(date, routineStore.routines)
  }
}

function addRoutineItem() {
  const name = newRoutine.value.name.trim()
  if (!name) {
    toastStore.warn('请填写名称')
    return
  }
  routineStore.addRoutine({
    id: 'rt_' + Date.now(),
    icon: newRoutine.value.icon.trim() || '🔁',
    name,
    time: newRoutine.value.time || ''
  })
  newRoutine.value = { icon: '', name: '', time: '' }
  syncTodayCopy()
  toastStore.ok('已添加固定事务')
}

function removeRoutineItem(id) {
  routineStore.removeRoutine(id)
  syncTodayCopy()
  toastStore.ok('已删除')
}

/* ═══ 空状态快捷操作 ═══ */
function openAi() {
  aiStore.open()
}

onMounted(() => {
  updateNow()
  nowTimer = setInterval(updateNow, 60000)
})

onUnmounted(() => {
  if (nowTimer) clearInterval(nowTimer)
})
</script>

<template>
  <div class="utl" :class="'state-' + dateState">
    <!-- 空状态 -->
    <div v-if="isEmpty" class="utl-empty">
      <span class="utl-empty-icon">🍃</span>
      <p>今日本无事，庸人自扰之</p>
      <div class="utl-empty-actions">
        <button class="btn btn-secondary btn-sm" @click="openAi">🤖 AI 生成</button>
        <button class="btn btn-primary btn-sm" @click="emit('add')">＋ 新任务</button>
      </div>
    </div>

    <!-- 统一时间轴 -->
    <template v-else>
      <div
        v-for="row in rows"
        :key="row.key"
        class="utl-row"
        :class="{
          'utl-now-row': row.kind === 'now',
          'drag-over': row.kind === 'block' && dragOverId === row.payload.id,
          dragging: row.kind === 'block' && dragId === row.payload.id
        }"
        :draggable="row.kind === 'block'"
        @dragstart="row.kind === 'block' && onDragStart(row, $event)"
        @dragover="row.kind === 'block' && onDragOver(row, $event)"
        @drop="row.kind === 'block' && onDrop(row)"
        @dragend="onDragEnd"
      >
        <!-- 现在时刻线 -->
        <div v-if="row.kind === 'now'" class="utl-now">
          <span class="utl-now-time">{{ nowStr }}</span>
          <span class="utl-now-dot"></span>
          <span class="utl-now-line"></span>
        </div>

        <!-- 任务块（TaskCard 自带时间轨）-->
        <TaskCard
          v-else-if="row.kind === 'block'"
          :block="row.payload"
          :index="0"
          :date-state="dateState"
          @toggle="handleToggleTask"
          @toggle-subtask="(si, ev) => handleToggleSubtask(row.payload.id, si, ev)"
        />

        <!-- 固定事务（时间轨外壳）-->
        <div v-else class="utl-routine">
          <div class="utl-rail">
            <span class="utl-rail-time">{{ row.payload.time }}</span>
            <div class="utl-rail-line"></div>
            <div class="utl-rail-dot" :class="{ done: !!routineDoneMap[row.payload.id] }"></div>
          </div>
          <div class="utl-routine-body">
            <RoutineItem
              :routine="row.payload"
              :date="scheduleStore.currentDate"
              :done="!!routineDoneMap[row.payload.id]"
              @toggle="onRoutineToggle"
            />
          </div>
        </div>
      </div>

      <!-- 任意时间组 -->
      <div v-if="anytimeRoutines.length || showRoutineMgr" class="utl-anytime">
        <div class="utl-anytime-head">
          <span class="utl-anytime-title">⏳ 任意时间</span>
          <button class="btn btn-ghost btn-sm" @click="showRoutineMgr = !showRoutineMgr">
            {{ showRoutineMgr ? '收起' : '管理' }}
          </button>
        </div>

        <div v-for="r in anytimeRoutines" :key="'ar_' + r.id" class="utl-routine anytime">
          <div class="utl-rail">
            <span class="utl-rail-time">--:--</span>
            <div class="utl-rail-line"></div>
            <div class="utl-rail-dot" :class="{ done: !!routineDoneMap[r.id] }"></div>
          </div>
          <div class="utl-routine-body">
            <RoutineItem
              :routine="r"
              :date="scheduleStore.currentDate"
              :done="!!routineDoneMap[r.id]"
              @toggle="onRoutineToggle"
            />
          </div>
        </div>
      </div>

      <!-- 固定事务模板管理面板 -->
      <div v-if="showRoutineMgr" class="utl-mgr">
        <div v-for="r in routineStore.routines" :key="'tpl_' + r.id" class="mgr-row">
          <span class="mgr-icon">{{ r.icon || '🔁' }}</span>
          <span class="mgr-name">{{ r.name }}</span>
          <span class="mgr-time">{{ r.time || '' }}</span>
          <button class="btn btn-danger btn-sm" @click="removeRoutineItem(r.id)">删除</button>
        </div>
        <p v-if="!routineStore.routines.length" class="mgr-empty">暂无预设，添加后会出现在每天的时间轴里</p>
        <div class="mgr-add">
          <input v-model="newRoutine.icon" class="mgr-input mgr-icon-input" maxlength="4" placeholder="图标" />
          <input v-model="newRoutine.name" class="mgr-input mgr-name-input" maxlength="30" placeholder="名称，如：背单词" />
          <input v-model="newRoutine.time" class="mgr-input mgr-time-input" type="time" />
          <button class="btn btn-primary btn-sm" @click="addRoutineItem">添加</button>
        </div>
      </div>

      <!-- 固定事务管理入口（无任意时间组时也要可达）-->
      <div v-if="!anytimeRoutines.length && !showRoutineMgr" class="utl-mgr-entry">
        <button class="btn btn-ghost btn-sm" @click="showRoutineMgr = true">🔁 管理固定事务</button>
      </div>
    </template>

    <!-- 全部完成：朱砂印章浮印 -->
    <Teleport to="body">
      <div v-if="showSeal" class="seal-mask">
        <div ref="sealRef" class="day-seal">今日毕</div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.utl {
  max-width: 680px;
  margin: 0 auto;
  padding-bottom: var(--space-12);
}

/* ── Rows ── */
.utl-row {
  position: relative;
  border-top: 2px solid transparent;
  transition: border-color var(--duration-fast) var(--ease-out),
              opacity var(--duration-fast) var(--ease-out);
}

.utl-row.dragging {
  opacity: 0.45;
}

.utl-row.drag-over {
  border-top-color: var(--accent);
}

/* ── 现在时刻线 ── */
.utl-now {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) 0;
}

.utl-now-time {
  width: 52px;
  flex-shrink: 0;
  text-align: center;
  font-family: var(--font-data);
  font-size: 10px;
  font-weight: 700;
  color: var(--accent);
}

.utl-now-dot {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: var(--radius-full);
  background: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-muted);
}

.utl-now-line {
  flex: 1;
  height: 2px;
  background: var(--accent);
  border-radius: var(--radius-full);
  opacity: 0.7;
}

/* ── 固定事务时间轨（与 TaskCard 的 pipe 视觉对齐）── */
.utl-routine {
  display: flex;
  gap: var(--space-3);
}

.utl-rail {
  width: 52px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 2px;
}

.utl-rail-time {
  font-family: var(--font-data);
  font-size: 10px;
  color: var(--text-muted);
  margin-bottom: var(--space-1);
}

.utl-rail-line {
  width: 2px;
  flex: 1;
  background: var(--border);
  min-height: 100%;
}

.utl-rail-dot {
  width: 10px;
  height: 10px;
  border-radius: var(--radius-full);
  background: var(--accent);
  border: 2px solid var(--bg-elevated);
  margin-top: -5px;
}

.state-past .utl-rail-dot { background: var(--state-past); }
.state-future .utl-rail-dot { background: var(--state-future); }
.utl-rail-dot.done { background: var(--success); }

.utl-routine-body {
  flex: 1;
  min-width: 0;
}

/* RoutineItem 自带 margin-top，外壳内去掉避免双间距 */
.utl-routine-body :deep(.routine-item) {
  margin-top: 0;
}

/* ── 任意时间组 ── */
.utl-anytime {
  margin-top: var(--space-4);
}

.utl-anytime-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) 0;
}

.utl-anytime-title {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-muted);
}

/* ── 模板管理面板 ── */
.utl-mgr {
  margin-top: var(--space-3);
  padding: var(--space-4);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.mgr-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--border);
}

.mgr-row:last-of-type {
  border-bottom: none;
}

.mgr-icon { font-size: var(--text-lg); }

.mgr-name {
  flex: 1;
  min-width: 0;
  font-size: var(--text-sm);
  color: var(--text-primary);
}

.mgr-time {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.mgr-empty {
  font-size: var(--text-xs);
  color: var(--text-muted);
  padding: var(--space-2) 0;
}

.mgr-add {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-3);
  align-items: center;
}

.mgr-input {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  background: var(--bg);
  color: var(--text-primary);
}

.mgr-input:focus {
  border-color: var(--accent);
  outline: none;
}

.mgr-icon-input { width: 56px; text-align: center; }
.mgr-name-input { flex: 1; min-width: 0; }
.mgr-time-input { width: 100px; font-family: var(--font-data); }

.utl-mgr-entry {
  margin-top: var(--space-4);
  text-align: center;
}

/* ── 移动端 ── */
@media (max-width: 768px) {
  .utl {
    padding-bottom: var(--space-8);
  }

  /* 模板管理添加行：名称独占一行，其余换行排列 */
  .mgr-add {
    flex-wrap: wrap;
  }

  .mgr-name-input {
    flex: 1 1 100%;
    order: -1;
  }

  .mgr-icon-input {
    flex: 1;
    width: auto;
  }

  .mgr-time-input {
    flex: 2;
    width: auto;
  }
}

/* ── 空状态 ── */
.utl-empty {
  text-align: center;
  padding: var(--space-12) var(--space-4);
  color: var(--text-secondary);
}

.utl-empty-icon {
  font-size: 3rem;
  display: block;
  margin-bottom: var(--space-4);
  animation: float 3s ease-in-out infinite;
}

.utl-empty-actions {
  display: flex;
  justify-content: center;
  gap: var(--space-3);
  margin-top: var(--space-5);
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

/* ── 朱砂印章 ── */
.seal-mask {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.day-seal {
  padding: var(--space-4) var(--space-5);
  border: 3px solid var(--danger);
  border-radius: var(--radius-sm);
  font-family: var(--font-heading);
  font-size: 2.5rem;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: var(--danger);
  background: var(--danger-bg);
  box-shadow: 0 8px 32px var(--danger-bg);
  writing-mode: vertical-rl;
  opacity: 0;
}
</style>
