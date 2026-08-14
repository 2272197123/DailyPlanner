<script setup>
/* ═══════════════════════════════════════
   ImportPlanModal.vue — 导入前一天计划
   列出前一天的任务块（不含周期规则块，规则会自动物化），
   用户勾选取舍后导入当前日期（完成态清零、生成新 id）。
   ═══════════════════════════════════════ */
import { ref, computed, onMounted } from 'vue'
import { useScheduleStore } from '@/stores/schedule'
import { toLocalDate, fmtDuration } from '@/utils/format'
import { CAT_EMOJI } from '@/utils/constants'

const props = defineProps({
  date: { type: String, required: true }
})

const emit = defineEmits(['close', 'import'])

const scheduleStore = useScheduleStore()
const loading = ref(true)
const blocks = ref([])

const prevDate = computed(() => {
  const d = new Date(props.date + 'T00:00:00')
  d.setDate(d.getDate() - 1)
  return toLocalDate(d)
})

const checkedCount = computed(() => blocks.value.filter(b => b._checked).length)

onMounted(async () => {
  // 拉取前一天计划（fetchDay 会写入 schedules 缓存）
  await scheduleStore.fetchDay(prevDate.value)
  const sched = scheduleStore.schedules[prevDate.value]
  const list = (sched && Array.isArray(sched.blocks) ? sched.blocks : [])
    .filter(b => !b.ruleId) // 规则块由固定日程自动生成，不参与导入
  blocks.value = list.map(b => ({ ...b, _checked: true }))
  loading.value = false
})

function toggleAll(val) {
  blocks.value.forEach(b => { b._checked = val })
}

function confirm() {
  const selected = blocks.value.filter(b => b._checked)
  if (!selected.length) return
  emit('import', selected)
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-panel">
      <div class="modal-head">
        <h3>⏮ 导入前一天计划</h3>
        <button class="modal-close" @click="emit('close')">✕</button>
      </div>
      <p class="imp-hint">{{ prevDate }} 的任务，勾选需要的导入（完成状态会清零）</p>

      <div v-if="loading" class="imp-empty">读取中…</div>
      <div v-else-if="!blocks.length" class="imp-empty">
        前一天没有可导入的任务
      </div>

      <template v-else>
        <div class="imp-tools">
          <button class="imp-tool" @click="toggleAll(true)">全选</button>
          <button class="imp-tool" @click="toggleAll(false)">清空</button>
        </div>
        <div class="imp-list">
          <label
            v-for="b in blocks"
            :key="b.id"
            class="imp-item"
            :class="{ off: !b._checked }"
          >
            <input type="checkbox" v-model="b._checked" />
            <span class="imp-emoji">{{ CAT_EMOJI[b.category] || '📌' }}</span>
            <span class="imp-subject">{{ b.subject || '(未命名)' }}</span>
            <span class="imp-meta">
              {{ b.time ? b.time + ' · ' : '' }}{{ fmtDuration(b.duration) }}
            </span>
          </label>
        </div>
      </template>

      <div class="modal-actions">
        <button class="btn btn-secondary" @click="emit('close')">取消</button>
        <button
          class="btn btn-primary"
          :disabled="!checkedCount"
          @click="confirm"
        >导入 {{ checkedCount }} 项</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
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
  max-width: 440px;
  padding: var(--space-6);
  background: var(--bg-elevated);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}

.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-2);
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

.imp-hint {
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-bottom: var(--space-3);
}

.imp-empty {
  padding: var(--space-6) 0;
  text-align: center;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.imp-tools {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.imp-tool {
  font-size: var(--text-xs);
  color: var(--accent);
  padding: 2px var(--space-2);
  border-radius: var(--radius-sm);
}

.imp-tool:hover { background: var(--accent-muted); }

.imp-list {
  max-height: 46vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.imp-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out),
              opacity var(--duration-fast) var(--ease-out);
}

.imp-item:hover { background: var(--bg-muted); }
.imp-item.off { opacity: 0.45; }

.imp-item input[type="checkbox"] {
  accent-color: var(--accent);
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.imp-emoji { flex-shrink: 0; }

.imp-subject {
  flex: 1;
  min-width: 0;
  font-size: var(--text-sm);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.imp-meta {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  color: var(--text-muted);
  flex-shrink: 0;
}

.modal-actions {
  display: flex;
  gap: var(--space-3);
  justify-content: flex-end;
  margin-top: var(--space-4);
}

.modal-actions .btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
