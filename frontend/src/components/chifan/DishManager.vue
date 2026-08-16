<script setup>
/* ═══════════════════════════════════════
   DishManager.vue — 菜品管理弹层（增删改）
   全站共享菜品库：改动即改共享库，持久化在服务端 dishes 表。
   ═══════════════════════════════════════ */
import { ref, computed } from 'vue'
import { useDishStore } from '@/stores/dishes'
import { useToastStore } from '@/stores/toast'
import DishImage from './DishImage.vue'

const emit = defineEmits(['close'])

const dishStore = useDishStore()
const toastStore = useToastStore()

const MEAL_LABELS = { lunch: '仅午餐', dinner: '仅晚餐', both: '午晚均可' }
const MEAL_OPTIONS = [
  { value: 'both', label: '午晚均可' },
  { value: 'lunch', label: '仅午餐' },
  { value: 'dinner', label: '仅晚餐' }
]

const keyword = ref('')
const saving = ref(false)

/* ── 编辑表单（null = 列表模式；id 为空串 = 新增）── */
const editing = ref(null)
/* 删除二次确认：记录已武装的菜品 id */
const armedDeleteId = ref('')

const filtered = computed(() => {
  const kw = keyword.value.trim()
  const list = dishStore.dishes
  if (!kw) return list
  return list.filter(d =>
    d.name.includes(kw) || (d.category || '').includes(kw) || (d.description || '').includes(kw)
  )
})

const categories = computed(() =>
  [...new Set(dishStore.dishes.map(d => d.category).filter(Boolean))]
)

function openAdd() {
  editing.value = {
    id: '',
    name: '',
    description: '',
    price: 25,
    meal: 'both',
    category: '家常',
    image: ''
  }
  armedDeleteId.value = ''
}

function openEdit(dish) {
  editing.value = { ...dish }
  armedDeleteId.value = ''
}

async function save() {
  const f = editing.value
  if (!f) return
  const name = (f.name || '').trim()
  if (!name) {
    toastStore.warn('请填写菜名')
    return
  }
  const payload = {
    name,
    description: (f.description || '').trim(),
    price: Number(f.price) || 0,
    meal: f.meal,
    category: (f.category || '').trim() || '家常',
    image: (f.image || '').trim()
  }
  saving.value = true
  try {
    if (f.id) {
      await dishStore.updateDish(f.id, payload)
      toastStore.ok('已更新「' + name + '」')
    } else {
      await dishStore.createDish(payload)
      toastStore.ok('已添加「' + name + '」')
    }
    editing.value = null
  } catch {
    toastStore.err('保存失败，请稍后重试')
  } finally {
    saving.value = false
  }
}

async function removeDish(dish) {
  if (armedDeleteId.value !== dish.id) {
    armedDeleteId.value = dish.id
    return
  }
  armedDeleteId.value = ''
  try {
    await dishStore.deleteDish(dish.id)
    toastStore.ok('已删除「' + dish.name + '」')
  } catch {
    toastStore.err('删除失败，请稍后重试')
  }
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-panel dm-panel">
      <div class="modal-head">
        <h3>{{ editing ? (editing.id ? '✎ 编辑菜品' : '＋ 新增菜品') : '🍜 菜品管理' }}</h3>
        <button class="modal-close" @click="emit('close')">✕</button>
      </div>

      <!-- ── 编辑 / 新增表单 ── -->
      <template v-if="editing">
        <label class="dm-label">菜名</label>
        <input v-model="editing.name" class="dm-input" maxlength="60" placeholder="如：麻婆豆腐" />

        <div class="dm-row">
          <div class="dm-col">
            <label class="dm-label">参考价（¥）</label>
            <input v-model.number="editing.price" class="dm-input" type="number" min="0" step="1" />
          </div>
          <div class="dm-col">
            <label class="dm-label">餐次</label>
            <select v-model="editing.meal" class="dm-input">
              <option v-for="o in MEAL_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </div>
        </div>

        <label class="dm-label">分类</label>
        <input v-model="editing.category" class="dm-input" maxlength="30" list="dm-cats" placeholder="如：家常 / 川湘 / 面食" />
        <datalist id="dm-cats">
          <option v-for="c in categories" :key="c" :value="c"></option>
        </datalist>

        <label class="dm-label">描述</label>
        <textarea v-model="editing.description" class="dm-input dm-textarea" maxlength="300"
          placeholder="一句话描述，翻面卡背面展示"></textarea>

        <label class="dm-label">图片文件名（可选，对应 public/food/ 下文件）</label>
        <input v-model="editing.image" class="dm-input" maxlength="200" placeholder="如 mapo-tofu.png，留空显示占位图" />

        <div class="modal-actions">
          <button class="btn btn-secondary" :disabled="saving" @click="editing = null">返回</button>
          <button class="btn btn-primary" :disabled="saving" @click="save">
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </div>
      </template>

      <!-- ── 菜品列表 ── -->
      <template v-else>
        <div class="dm-tools">
          <input v-model="keyword" class="dm-input dm-search" placeholder="搜索菜名 / 分类 / 描述" />
          <button class="btn btn-primary btn-sm" @click="openAdd">＋ 新增</button>
        </div>

        <div v-if="!filtered.length" class="dm-empty">
          {{ dishStore.dishes.length ? '没有匹配的菜品' : '菜品库为空，点「新增」添加第一道' }}
        </div>

        <div v-else class="dm-list">
          <div v-for="d in filtered" :key="d.id" class="dm-item">
            <div class="dm-thumb">
              <DishImage :dish="d" />
            </div>
            <div class="dm-info">
              <div class="dm-name">
                {{ d.name }}
                <span class="dm-cat">{{ d.category }}</span>
              </div>
              <div class="dm-meta">¥{{ d.price }} · {{ MEAL_LABELS[d.meal] || d.meal }}</div>
            </div>
            <button class="btn btn-ghost btn-sm" title="编辑" @click="openEdit(d)">✎</button>
            <button
              class="btn btn-sm"
              :class="armedDeleteId === d.id ? 'btn-danger' : 'btn-ghost'"
              :title="armedDeleteId === d.id ? '再点一次确认删除' : '删除'"
              @click="removeDish(d)"
            >{{ armedDeleteId === d.id ? '确认?' : '✕' }}</button>
          </div>
        </div>
      </template>
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
  padding: var(--space-4);
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.modal-panel {
  width: 100%;
  max-width: 560px;
  max-height: 86vh;
  display: flex;
  flex-direction: column;
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

.dm-label {
  display: block;
  font-size: var(--text-xs);
  color: var(--text-secondary);
  margin: var(--space-3) 0 var(--space-1);
}

.dm-input {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-size: var(--text-sm);
  transition: border-color var(--duration-fast) var(--ease-out);
}

.dm-input:focus {
  outline: none;
  border-color: var(--accent);
}

.dm-textarea {
  resize: vertical;
  min-height: 64px;
  line-height: 1.6;
}

.dm-row {
  display: flex;
  gap: var(--space-3);
}

.dm-col { flex: 1; min-width: 0; }

.dm-tools {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.dm-search { flex: 1; min-width: 0; }

.dm-empty {
  padding: var(--space-6) 0;
  text-align: center;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.dm-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dm-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2);
  border-radius: var(--radius-md);
  transition: background var(--duration-fast) var(--ease-out);
}

.dm-item:hover { background: var(--bg-muted); }

.dm-thumb {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--border);
}

.dm-info { flex: 1; min-width: 0; }

.dm-name {
  font-size: var(--text-sm);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dm-cat {
  font-size: var(--text-xs);
  color: var(--accent);
  background: var(--accent-muted);
  padding: 0 var(--space-1);
  border-radius: var(--radius-sm);
  margin-left: var(--space-1);
}

.dm-meta {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  color: var(--text-muted);
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

/* 移动端：遮罩去 blur（全屏滤镜重绘） */
@media (max-width: 768px) {
  .modal-overlay {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    background: rgba(0, 0, 0, 0.5);
  }
}
</style>
