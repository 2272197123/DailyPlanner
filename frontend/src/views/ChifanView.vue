<script setup>
/* ═══════════════════════════════════════
   ChifanView.vue — 恰饭板块
   预算 + 餐次 → 老虎机抽菜 → 翻面食物卡 → 「就吃这个」
   钉时任务进当日计划（走 schedule store addBlock，钉时铁律：
   纯新增钉时块，不改任何既有块的时间/时长，不动全局顺序）。
   ═══════════════════════════════════════ */
import { ref, computed, onMounted } from 'vue'
import { useDishStore } from '@/stores/dishes'
import { useScheduleStore } from '@/stores/schedule'
import { useToastStore } from '@/stores/toast'
import SlotMachine from '@/components/chifan/SlotMachine.vue'
import FoodCard from '@/components/chifan/FoodCard.vue'
import DishManager from '@/components/chifan/DishManager.vue'

const dishStore = useDishStore()
const scheduleStore = useScheduleStore()
const toastStore = useToastStore()

/* ── 预算 + 餐次 ── */
const meal = ref('lunch')
const budget = ref(30)          // 预算上限（¥）；null = 不限
const BUDGET_CHIPS = [15, 25, 40, 60]

/* ── 抽取状态机：idle → spinning → done ── */
const phase = ref('idle')
const spinId = ref(0)
const currentDish = ref(null)
/* 同一餐次连续抽取不重复上次结果（餐次各自记忆） */
const lastPicked = { lunch: '', dinner: '' }

const candidates = computed(() => {
  return dishStore.dishes.filter(d => {
    if (d.meal !== 'both' && d.meal !== meal.value) return false
    if (budget.value !== null && budget.value !== '' && Number(d.price) > Number(budget.value)) return false
    return true
  })
})

const candidateNames = computed(() => candidates.value.map(d => d.name))

/* crypto.getRandomValues 随机抽取；范围内 >1 道时避开上次结果 */
function cryptoIdx(n) {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return buf[0] % n
}

function pickDish() {
  const pool = candidates.value
  if (!pool.length) return null
  let dish = pool[cryptoIdx(pool.length)]
  if (pool.length > 1 && dish.id === lastPicked[meal.value]) {
    for (let i = 0; i < 8 && dish.id === lastPicked[meal.value]; i++) {
      dish = pool[cryptoIdx(pool.length)]
    }
    /* 极端运气下兜底：顺序取下一个不同的 */
    if (dish.id === lastPicked[meal.value]) {
      const idx = pool.findIndex(d => d.id === lastPicked[meal.value])
      dish = pool[(idx + 1) % pool.length]
    }
  }
  return dish
}

function draw() {
  if (phase.value === 'spinning') return
  const dish = pickDish()
  if (!dish) {
    toastStore.warn('预算内没有可选菜品，调高预算或去菜品管理加几道')
    return
  }
  currentDish.value = dish
  lastPicked[meal.value] = dish.id
  phase.value = 'spinning'
  spinId.value++
}

function onSpinDone() {
  phase.value = 'done'
}

/* ── 「就吃这个」→ 钉时任务确认弹层 ── */
const showConfirm = ref(false)
const confirmTime = ref('12:00')
const confirmDuration = ref(60)
const pinning = ref(false)

const DEFAULT_TIME = { lunch: '12:00', dinner: '18:00' }

function openConfirm() {
  if (!currentDish.value) return
  confirmTime.value = DEFAULT_TIME[meal.value] || '12:00'
  confirmDuration.value = 60
  showConfirm.value = true
}

async function confirmPin() {
  const dish = currentDish.value
  if (!dish || pinning.value) return
  if (!/^\d{1,2}:\d{2}$/.test(confirmTime.value)) {
    toastStore.warn('时间格式不正确')
    return
  }
  pinning.value = true
  const date = scheduleStore.today
  try {
    /* 目标日计划未加载时先拉取，避免覆盖服务端已有计划（同 PlanView.handleAdd） */
    if (!scheduleStore.schedules[date]) {
      await scheduleStore.fetchDay(date)
    }
    scheduleStore.goToday()
    scheduleStore.addBlock(date, {
      id: 'blk_chifan_' + Date.now(),
      subject: '🍜 ' + dish.name,
      time: confirmTime.value,           // 有 time 即钉时块
      duration: Number(confirmDuration.value) || 60,
      category: 'life',
      priority: 'medium',
      note: dish.description || '',
      subtasks: [],
      completed: false
    })
    toastStore.ok('已钉到今日计划：' + confirmTime.value + ' ' + dish.name)
    showConfirm.value = false
  } finally {
    pinning.value = false
  }
}

/* ── 菜品管理 ── */
const showManager = ref(false)

onMounted(() => {
  dishStore.fetchDishes()
})
</script>

<template>
  <div class="chifan-view">
    <header class="chifan-header">
      <div>
        <h1 class="chifan-title">🍜 恰饭</h1>
        <p class="chifan-sub">今天吃什么？交给老虎机决定</p>
      </div>
      <button class="btn btn-secondary btn-sm" @click="showManager = true">⚙ 菜品管理</button>
    </header>

    <!-- 预算 + 餐次选择 -->
    <section class="card picker">
      <div class="picker-row">
        <span class="picker-label">餐次</span>
        <div class="meal-toggle">
          <button
            class="meal-btn"
            :class="{ on: meal === 'lunch' }"
            @click="meal = 'lunch'"
          >中餐</button>
          <button
            class="meal-btn"
            :class="{ on: meal === 'dinner' }"
            @click="meal = 'dinner'"
          >晚餐</button>
        </div>
      </div>
      <div class="picker-row">
        <span class="picker-label">预算上限</span>
        <div class="budget-row">
          <div class="budget-chips">
            <button
              v-for="b in BUDGET_CHIPS"
              :key="b"
              class="chip"
              :class="{ on: Number(budget) === b }"
              @click="budget = b"
            >¥{{ b }}</button>
            <button
              class="chip"
              :class="{ on: budget === null }"
              @click="budget = null"
            >不限</button>
          </div>
          <input
            v-model.number="budget"
            class="budget-input"
            type="number"
            min="0"
            step="1"
            placeholder="自定义"
          />
        </div>
      </div>
      <p class="picker-hint">
        范围内 {{ candidates.length }} 道菜可选
        <template v-if="dishStore.loaded && !dishStore.dishes.length">（菜品库为空，先去菜品管理添加）</template>
      </p>
      <button
        class="btn btn-primary btn-lg draw-btn"
        :disabled="phase === 'spinning' || !candidates.length"
        @click="draw"
      >
        {{ phase === 'spinning' ? '抽取中…' : (phase === 'done' ? '再抽一次' : '开始抽取') }}
      </button>
    </section>

    <!-- 老虎机 -->
    <section v-if="phase !== 'idle' && currentDish" class="machine-area">
      <SlotMachine
        :names="candidateNames"
        :target="currentDish.name"
        :spin-id="spinId"
        @done="onSpinDone"
      />
    </section>

    <!-- 抽中结果：翻面食物卡 -->
    <section v-if="phase === 'done' && currentDish" class="result-area anim-scale-in">
      <FoodCard :key="currentDish.id" :dish="currentDish" />
      <div class="result-actions">
        <button class="btn btn-primary" @click="openConfirm">就吃这个</button>
        <button class="btn btn-secondary" @click="draw">再抽一次</button>
      </div>
    </section>

    <!-- 「就吃这个」确认弹层（可改时间） -->
    <Teleport to="body">
      <div v-if="showConfirm" class="modal-overlay" @click.self="showConfirm = false">
        <div class="modal-panel">
          <div class="modal-head">
            <h3>📌 钉到今日计划</h3>
            <button class="modal-close" @click="showConfirm = false">✕</button>
          </div>
          <p class="cf-dish">
            🍜 {{ currentDish?.name }}
            <span class="cf-price">¥{{ currentDish?.price }}</span>
          </p>
          <label class="cf-label">开始时间</label>
          <input v-model="confirmTime" class="cf-input" type="time" />
          <label class="cf-label">时长</label>
          <select v-model.number="confirmDuration" class="cf-input">
            <option :value="30">30 分钟</option>
            <option :value="60">1 小时</option>
            <option :value="90">1.5 小时</option>
          </select>
          <p class="cf-hint">将创建钉时任务（{{ scheduleStore.today }}），不会被其他操作推挤</p>
          <div class="modal-actions">
            <button class="btn btn-secondary" @click="showConfirm = false">取消</button>
            <button class="btn btn-primary" :disabled="pinning" @click="confirmPin">
              {{ pinning ? '钉入中…' : '钉到计划' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 菜品管理 -->
    <Teleport to="body">
      <DishManager v-if="showManager" @close="showManager = false" />
    </Teleport>
  </div>
</template>

<style scoped>
.chifan-view {
  max-width: 640px;
  margin: 0 auto;
}

.chifan-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-5);
}

.chifan-title {
  font-family: var(--font-heading);
  font-size: var(--text-2xl);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: var(--space-1);
}

.chifan-sub {
  color: var(--text-muted);
  font-size: var(--text-sm);
}

/* ── 预算/餐次选择 ── */
.picker {
  padding: var(--space-5);
  margin-bottom: var(--space-5);
}

.picker-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.picker-label {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  width: 60px;
  flex-shrink: 0;
}

.meal-toggle {
  display: flex;
  gap: var(--space-2);
}

.meal-btn {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  transition: background var(--duration-fast) var(--ease-out),
              color var(--duration-fast) var(--ease-out),
              border-color var(--duration-fast) var(--ease-out);
}

.meal-btn.on {
  background: var(--accent);
  color: var(--on-accent);
  border-color: var(--accent);
}

.budget-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 1;
  min-width: 0;
  flex-wrap: wrap;
}

.budget-chips {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.chip {
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-full);
  border: 1px solid var(--border);
  font-family: var(--font-data);
  font-size: var(--text-xs);
  color: var(--text-secondary);
  transition: background var(--duration-fast) var(--ease-out),
              color var(--duration-fast) var(--ease-out),
              border-color var(--duration-fast) var(--ease-out);
}

.chip.on {
  background: var(--accent);
  color: var(--on-accent);
  border-color: var(--accent);
}

.budget-input {
  width: 88px;
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-family: var(--font-data);
  font-size: var(--text-sm);
}

.budget-input:focus {
  outline: none;
  border-color: var(--accent);
}

.picker-hint {
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-bottom: var(--space-3);
}

.draw-btn {
  width: 100%;
}

.draw-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── 老虎机 / 结果 ── */
.machine-area {
  margin-bottom: var(--space-5);
}

.result-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
}

.result-actions {
  display: flex;
  gap: var(--space-3);
}

/* ── 确认弹层 ── */
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
  max-width: 380px;
  padding: var(--space-6);
  background: var(--bg-elevated);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}

.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3);
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

.cf-dish {
  font-size: var(--text-base);
  color: var(--text-primary);
  font-weight: 600;
}

.cf-price {
  font-family: var(--font-data);
  color: var(--accent);
  margin-left: var(--space-2);
}

.cf-label {
  display: block;
  font-size: var(--text-xs);
  color: var(--text-secondary);
  margin: var(--space-3) 0 var(--space-1);
}

.cf-input {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-size: var(--text-sm);
}

.cf-input:focus {
  outline: none;
  border-color: var(--accent);
}

.cf-hint {
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-top: var(--space-3);
}

.modal-actions {
  display: flex;
  gap: var(--space-3);
  justify-content: flex-end;
  margin-top: var(--space-4);
}

.modal-actions .btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 移动端：弹层遮罩去 blur（全屏滤镜重绘） */
@media (max-width: 768px) {
  .modal-overlay {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    background: rgba(0, 0, 0, 0.5);
  }
}
</style>
