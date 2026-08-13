<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useAccountingStore } from '@/stores/accounting'
import { useThemeStore } from '@/stores/theme'
import { useToastStore } from '@/stores/toast'
import { toLocalDate } from '@/utils/format'

const accountingStore = useAccountingStore()
const toastStore = useToastStore()
const themeStore = useThemeStore()

const showAddForm = ref(false)
const pieCanvas = ref(null)
const barCanvas = ref(null)
const newEntry = ref({ type: 'expense', category: '', amount: '', date: toLocalDate(new Date()), description: '' })

/* ── Computed ── */
const summary = computed(() => accountingStore.summary)
const expenseByCat = computed(() => accountingStore.expenseByCategory)
const trend = computed(() => accountingStore.trendByDay)
const categories = computed(() => accountingStore.categories)
const catOptions = computed(() =>
  newEntry.value.type === 'expense' ? categories.value.expense : categories.value.income
)

const periods = [
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'quarter', label: '近三月' },
  { key: 'year', label: '今年' },
  { key: 'custom', label: '自定义' }
]

/* ── Chart colors ── */
const chartColors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6']

/* Canvas 无法解析 var()，需读取计算后的 CSS 变量（背景/文字/网格线随暗色模式变化） */
function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

/* ── Draw pie ── */
function drawPie() {
  const canvas = pieCanvas.value
  if (!canvas || !expenseByCat.value.length) return
  const ctx = canvas.getContext('2d')
  const w = canvas.width = canvas.offsetWidth * 2
  const h = canvas.height = canvas.offsetHeight * 2
  ctx.scale(2, 2)
  const cx = canvas.offsetWidth / 2, cy = canvas.offsetHeight / 2
  const r = Math.min(cx, cy) - 20
  const total = expenseByCat.value.reduce((s, c) => s + c.amount, 0)

  let angle = -Math.PI / 2
  expenseByCat.value.forEach((cat, i) => {
    const slice = (cat.amount / total) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, r, angle, angle + slice)
    ctx.fillStyle = chartColors[i % chartColors.length]
    ctx.fill()

    // Label
    const midAngle = angle + slice / 2
    const lx = cx + Math.cos(midAngle) * (r * 0.65)
    const ly = cy + Math.sin(midAngle) * (r * 0.65)
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 11px system-ui'
    ctx.textAlign = 'center'
    const pct = Math.round(cat.amount / total * 100)
    if (pct >= 5) ctx.fillText(pct + '%', lx, ly)

    angle += slice
  })

  // Center hole (donut)
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2)
  ctx.fillStyle = cssVar('--bg-elevated', '#fff')
  ctx.fill()
}

/* ── Draw bar ── */
function drawBar() {
  const canvas = barCanvas.value
  if (!canvas || !trend.value.length) return
  const ctx = canvas.getContext('2d')
  const w = canvas.width = canvas.offsetWidth * 2
  const h = canvas.height = canvas.offsetHeight * 2
  ctx.scale(2, 2)
  const cw = canvas.offsetWidth, ch = canvas.offsetHeight
  const pad = { top: 20, right: 20, bottom: 30, left: 40 }
  const pw = cw - pad.left - pad.right
  const ph = ch - pad.top - pad.bottom

  const maxVal = Math.max(...trend.value.map(d => Math.max(d.income, d.expense)), 1)

  // Grid
  ctx.strokeStyle = cssVar('--border', '#e8e4dc')
  ctx.lineWidth = 0.5
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (ph / 4) * i
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(cw - pad.right, y); ctx.stroke()
  }

  // Bars
  const barW = Math.min(pw / trend.value.length * 0.35, 12)
  trend.value.forEach((d, i) => {
    const x = pad.left + (pw / trend.value.length) * i + (pw / trend.value.length - barW * 2) / 2

    // Expense bar
    const eh = (d.expense / maxVal) * ph
    ctx.fillStyle = '#ef4444'
    ctx.fillRect(x, pad.top + ph - eh, barW, eh)

    // Income bar
    const ih = (d.income / maxVal) * ph
    ctx.fillStyle = '#22c55e'
    ctx.fillRect(x + barW, pad.top + ph - ih, barW, ih)

    // X label
    ctx.fillStyle = cssVar('--text-muted', '#999')
    ctx.font = '9px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText((d.date || '').slice(5), x + barW, ch - 8)
  })
}

/* ── Actions ── */
async function handleAdd() {
  if (!newEntry.value.category || !newEntry.value.amount) {
    toastStore.warn('请填写分类和金额')
    return
  }
  await accountingStore.addEntry({
    type: newEntry.value.type,
    category: newEntry.value.category,
    amount: parseFloat(newEntry.value.amount),
    date: newEntry.value.date,
    description: newEntry.value.description
  })
  newEntry.value = { type: 'expense', category: '', amount: '', date: toLocalDate(new Date()), description: '' }
  showAddForm.value = false
  toastStore.ok('已添加')
  await nextTick()
  drawPie()
  drawBar()
}

async function handleDelete(id) {
  await accountingStore.deleteEntry(id)
  toastStore.warn('已删除')
}

/* ── Watch period ── */
onMounted(async () => {
  await accountingStore.fetchEntries()
  await nextTick()
  drawPie()
  drawBar()
})

/* 明暗模式切换后 canvas 颜色需重绘 */
watch(() => themeStore.mode, async () => {
  await nextTick()
  drawPie()
  drawBar()
})
</script>

<template>
  <div class="ledger-panel">
    <div class="ledger-header">
      <h2>💰 记账</h2>
      <button class="btn-add-goal" @click="showAddForm = !showAddForm">
        {{ showAddForm ? '✕ 取消' : '＋ 记一笔' }}
      </button>
    </div>

    <!-- Period tabs -->
    <div class="lp-periods">
      <button
        v-for="p in periods" :key="p.key"
        class="lp-period-btn"
        :class="{ active: accountingStore.period === p.key }"
        @click="accountingStore.setPeriod(p.key)"
      >{{ p.label }}</button>
    </div>

    <!-- Custom range -->
    <div v-if="accountingStore.period === 'custom'" class="lp-custom">
      <input type="date" class="gc-input sm" :value="accountingStore.customRange.from"
        @input="accountingStore.setCustomRange(($event.target).value, accountingStore.customRange.to)" />
      <span>—</span>
      <input type="date" class="gc-input sm" :value="accountingStore.customRange.to"
        @input="accountingStore.setCustomRange(accountingStore.customRange.from, ($event.target).value)" />
    </div>

    <!-- Summary cards -->
    <div class="lp-summary">
      <div class="lps-card income">
        <span class="lps-label">收入</span>
        <span class="lps-val">¥{{ summary.income.toFixed(2) }}</span>
      </div>
      <div class="lps-card expense">
        <span class="lps-label">支出</span>
        <span class="lps-val">¥{{ summary.expense.toFixed(2) }}</span>
      </div>
      <div class="lps-card" :class="summary.balance >= 0 ? 'balance' : 'neg'">
        <span class="lps-label">结余</span>
        <span class="lps-val">¥{{ summary.balance.toFixed(2) }}</span>
      </div>
    </div>

    <!-- Charts -->
    <div class="lp-charts" v-if="summary.count > 0">
      <!-- Pie -->
      <div class="lp-chart-box">
        <h4>📊 支出分类</h4>
        <canvas ref="pieCanvas" class="lp-canvas" style="height:220px" v-show="expenseByCat.length"></canvas>
        <div class="lp-legend" v-if="expenseByCat.length">
          <div v-for="(cat, i) in expenseByCat" :key="cat.name" class="lp-legend-item">
            <span class="lpl-dot" :style="{ background: chartColors[i % chartColors.length] }"></span>
            <span class="lpl-name">{{ cat.name }}</span>
            <span class="lpl-amt">¥{{ cat.amount.toFixed(0) }}</span>
          </div>
        </div>
        <p v-if="expenseByCat.length === 0" class="lp-empty">暂无支出数据</p>
      </div>

      <!-- Bar -->
      <div class="lp-chart-box">
        <h4>📈 收支趋势</h4>
        <canvas ref="barCanvas" class="lp-canvas" style="height:200px" v-show="trend.length"></canvas>
        <div class="lp-bar-legend">
          <span><span class="lpl-dot" style="background:#22c55e"></span> 收入</span>
          <span><span class="lpl-dot" style="background:#ef4444"></span> 支出</span>
        </div>
        <p v-if="trend.length === 0" class="lp-empty">暂无趋势数据</p>
      </div>
    </div>

    <!-- Add form -->
    <transition name="slide">
      <div v-if="showAddForm" class="lp-add-form">
        <div class="lp-type-toggle">
          <button :class="{ active: newEntry.type === 'expense' }" @click="newEntry.type = 'expense'">支出</button>
          <button :class="{ active: newEntry.type === 'income' }" @click="newEntry.type = 'income'">收入</button>
        </div>
        <select v-model="newEntry.category" class="gc-input">
          <option value="">选择分类</option>
          <option v-for="c in catOptions" :key="c" :value="c">{{ c }}</option>
        </select>
        <input v-model="newEntry.amount" type="number" class="gc-input" placeholder="金额" step="0.01" />
        <input v-model="newEntry.date" type="date" class="gc-input sm" />
        <input v-model="newEntry.description" class="gc-input" placeholder="备注（可选）" />
        <button class="btn-primary" @click="handleAdd">添加</button>
      </div>
    </transition>

    <!-- Recent entries -->
    <div class="lp-entries" v-if="accountingStore.filteredEntries.length > 0">
      <h4>📋 近期记录</h4>
      <div v-for="e in accountingStore.filteredEntries.slice(0, 20)" :key="e.id" class="lpe-item">
        <span class="lpe-cat">{{ e.category || '其他' }}</span>
        <span class="lpe-note" v-if="e.description">{{ e.description }}</span>
        <span class="lpe-date">{{ (e.date || '').slice(5) }}</span>
        <span class="lpe-amt" :class="e.type">{{ e.type === 'income' ? '+' : '-' }}¥{{ (e.amount || 0).toFixed(2) }}</span>
        <button class="lpe-del" @click="handleDelete(e.id)">✕</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ledger-panel {
  width: 100%;
}

.ledger-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: var(--space-4);
}

.ledger-header h2 { font-family: var(--font-heading); font-size: var(--text-lg); }

.btn-add-goal {
  padding: var(--space-1) var(--space-3); font-size: var(--text-xs); font-weight: 600;
  color: var(--accent); border: 1.5px solid var(--accent); border-radius: var(--radius-full);
  transition: all var(--duration-fast) var(--ease-out);
}

.btn-add-goal:hover { background: var(--accent); color: var(--text-inverse); }

/* ── Periods ── */
.lp-periods { display: flex; gap: var(--space-1); margin-bottom: var(--space-3); flex-wrap: wrap; }

.lp-period-btn {
  padding: var(--space-1) var(--space-3); font-size: var(--text-xs);
  border-radius: var(--radius-full); color: var(--text-secondary);
  transition: all var(--duration-fast);
}

.lp-period-btn.active { background: var(--accent); color: var(--text-inverse); font-weight: 600; }
.lp-period-btn:hover:not(.active) { background: var(--bg-muted); }

.lp-custom {
  display: flex; align-items: center; gap: var(--space-2);
  margin-bottom: var(--space-3); font-size: var(--text-xs); color: var(--text-muted);
}

/* ── Summary ── */
.lp-summary {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3); margin-bottom: var(--space-5);
}

.lps-card {
  padding: var(--space-4); background: var(--bg-card); border-radius: var(--radius-lg);
  border: 1px solid var(--border); display: flex; flex-direction: column; gap: var(--space-1);
}

.lps-label { font-size: var(--text-xs); color: var(--text-muted); }

.lps-val {
  font-family: var(--font-data); font-size: var(--text-lg); font-weight: 700;
}

.lps-card.income .lps-val { color: var(--success); }
.lps-card.expense .lps-val { color: var(--danger); }
.lps-card.balance .lps-val { color: var(--accent); }
.lps-card.neg .lps-val { color: var(--danger); }

/* ── Charts ── */
.lp-charts {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: var(--space-4); margin-bottom: var(--space-5);
}

.lp-chart-box {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: var(--space-4);
}

.lp-chart-box h4 {
  font-family: var(--font-heading); font-size: var(--text-xs); font-weight: 600;
  color: var(--text-secondary); margin-bottom: var(--space-3);
}

.lp-canvas { width: 100%; }

.lp-legend { margin-top: var(--space-3); display: flex; flex-wrap: wrap; gap: var(--space-2); }

.lp-legend-item {
  display: flex; align-items: center; gap: var(--space-1);
  font-size: 10px; color: var(--text-secondary);
}

.lpl-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

.lpl-name { max-width: 48px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lpl-amt { font-family: var(--font-data); }

.lp-bar-legend {
  margin-top: var(--space-2);
  display: flex; gap: var(--space-4); font-size: var(--text-xs); color: var(--text-secondary);
}

.lp-empty { font-size: var(--text-xs); color: var(--text-muted); text-align: center; padding: var(--space-4) 0; }

/* ── Add form ── */
.lp-add-form {
  display: flex; flex-wrap: wrap; gap: var(--space-3);
  padding: var(--space-4); background: var(--bg);
  border-radius: var(--radius-lg); border: 1px solid var(--accent);
  margin-bottom: var(--space-4);
}

.lp-type-toggle {
  display: flex; gap: 0; border-radius: var(--radius-md); overflow: hidden;
  border: 1px solid var(--border);
}

.lp-type-toggle button {
  padding: var(--space-2) var(--space-4); font-size: var(--text-sm);
  transition: all var(--duration-fast);
}

.lp-type-toggle button.active {
  background: var(--accent); color: var(--text-inverse); font-weight: 600;
}

.gc-input {
  padding: var(--space-2) var(--space-3); border: 1px solid var(--border);
  border-radius: var(--radius-md); font-size: var(--text-sm);
  background: var(--bg-elevated); color: var(--text-primary);
}

.gc-input:focus { border-color: var(--accent); outline: none; }
.gc-input.sm { width: 140px; flex-shrink: 0; }

.btn-primary {
  padding: var(--space-2) var(--space-4); background: var(--accent); color: var(--text-inverse);
  border-radius: var(--radius-md); font-size: var(--text-sm); font-weight: 600;
}

.slide-enter-active { transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.slide-leave-active { transition: all 0.2s cubic-bezier(0.4, 0, 1, 1); }
.slide-enter-from { opacity: 0; transform: translateY(-8px); }
.slide-leave-to { opacity: 0; transform: translateY(-8px); }

/* ── Entries ── */
.lp-entries {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: var(--space-4);
}

.lp-entries h4 {
  font-family: var(--font-heading); font-size: var(--text-xs); font-weight: 600;
  color: var(--text-secondary); margin-bottom: var(--space-3);
}

.lpe-item {
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-2) 0; border-bottom: 1px solid var(--border);
  font-size: var(--text-sm);
}

.lpe-item:last-child { border-bottom: none; }

.lpe-cat { font-weight: 500; }
.lpe-note { color: var(--text-muted); flex: 1; font-size: var(--text-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lpe-date { font-family: var(--font-data); font-size: var(--text-xs); color: var(--text-muted); }
.lpe-amt { font-family: var(--font-data); font-weight: 600; }
.lpe-amt.income { color: var(--success); }
.lpe-amt.expense { color: var(--danger); }
.lpe-del {
  font-size: var(--text-xs); color: var(--text-muted); padding: 2px 4px;
  transition: color var(--duration-fast);
}

.lpe-del:hover { color: var(--danger); }

@media (max-width: 768px) {
  .lp-charts { grid-template-columns: 1fr; }
}

@media (max-width: 480px) {
  .lp-summary { grid-template-columns: 1fr; }
}
</style>
