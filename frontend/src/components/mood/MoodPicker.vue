<script setup>
import { ref, computed } from 'vue'
import { useMoodStore, MOOD_PRESETS } from '@/stores/mood'
import { useToastStore } from '@/stores/toast'
import VentComposer from './VentComposer.vue'

const props = defineProps({
  date: { type: String, required: true },
  mood: { type: Object, default: null }
})

const emit = defineEmits(['close', 'save', 'delete'])

const moodStore = useMoodStore()
const toastStore = useToastStore()

/* 当日吐槽（多条混色）：补记入口，年历/侧栏格子点开都能写 */
const vents = computed(() => moodStore.getVents(props.date))

async function removeVentItem(vent) {
  try {
    await moodStore.removeVent(props.date, vent.id)
  } catch {
    toastStore.err('删除失败，请稍后重试')
  }
}

const selectedColor = ref(props.mood?.color || MOOD_PRESETS[0].color)
const selectedLabel = ref(props.mood?.label || MOOD_PRESETS[0].label)
const note = ref(props.mood?.note || '')
const intensity = ref(props.mood?.intensity || 2)
const customLabel = ref('')
const customColor = ref('#84cc16')

const presets = computed(() => moodStore.presets)

const allPresets = computed(() => {
  return [...MOOD_PRESETS, ...presets.value.filter(p => p.isCustom)]
})

function selectPreset(preset) {
  selectedColor.value = preset.color
  selectedLabel.value = preset.label
}

function useCustom() {
  selectedColor.value = customColor.value
  selectedLabel.value = customLabel.value || '自定义'
}

function save() {
  emit('save', {
    color: selectedColor.value,
    label: selectedLabel.value,
    note: note.value,
    intensity: intensity.value
  })
}

function remove() {
  emit('delete')
}

function close() {
  emit('close')
}

function addCustomPreset() {
  if (!customLabel.value || !customColor.value) return
  moodStore.addCustomPreset(customLabel.value, customColor.value)
  selectedColor.value = customColor.value
  selectedLabel.value = customLabel.value
}
</script>

<template>
  <div class="mood-picker-overlay" @click.self="close">
    <div class="mood-picker card-glass anim-scale-in">
      <div class="picker-header">
        <h3 class="picker-title">{{ date }} 的心情</h3>
        <button class="picker-close" @click="close">×</button>
      </div>

      <div class="picker-preview" :style="{ backgroundColor: selectedColor + '20', borderColor: selectedColor }">
        <div class="preview-dot" :style="{ backgroundColor: selectedColor }"></div>
        <div class="preview-text">
          <div class="preview-label">{{ selectedLabel }}</div>
          <div class="preview-hint">强度 {{ intensity }}</div>
        </div>
      </div>

      <div class="picker-section">
        <div class="section-label">预设心情</div>
        <div class="preset-grid">
          <button
            v-for="preset in allPresets"
            :key="preset.id"
            class="preset-btn"
            :class="{ active: selectedColor === preset.color && selectedLabel === preset.label }"
            :style="{ backgroundColor: preset.color + '20', borderColor: selectedColor === preset.color ? preset.color : 'transparent' }"
            @click="selectPreset(preset)"
          >
            <span class="preset-dot" :style="{ backgroundColor: preset.color }"></span>
            <span class="preset-name">{{ preset.label }}</span>
          </button>
        </div>
      </div>

      <div class="picker-section">
        <div class="section-label">自定义</div>
        <div class="custom-row">
          <input
            v-model="customLabel"
            type="text"
            class="input"
            placeholder="标签，如：兴奋"
          />
          <input
            v-model="customColor"
            type="color"
            class="color-input"
          />
          <button class="btn btn-secondary btn-sm" @click="addCustomPreset">添加</button>
        </div>
      </div>

      <div class="picker-section">
        <div class="section-label">强度</div>
        <input
          v-model.number="intensity"
          type="range"
          min="1"
          max="4"
          step="1"
          class="intensity-slider"
        />
        <div class="intensity-labels">
          <span>淡</span>
          <span>浓</span>
        </div>
      </div>

      <div class="picker-section">
        <div class="section-label">吐槽 / 备注</div>
        <textarea
          v-model="note"
          class="textarea"
          placeholder="今天发生了什么？"
          rows="3"
        ></textarea>
      </div>

      <div class="picker-section">
        <div class="section-label">心情药剂（多条吐槽混色）</div>
        <div v-if="vents.length" class="picker-vents">
          <div v-for="v in vents" :key="v.id" class="picker-vent">
            <span class="picker-vent-dot" :style="{ backgroundColor: v.color }"></span>
            <span class="picker-vent-text">{{ v.text }}</span>
            <button class="picker-vent-del" title="删除这条吐槽" @click="removeVentItem(v)">×</button>
          </div>
        </div>
        <VentComposer :date="date" />
      </div>

      <div class="picker-actions">
        <button v-if="mood" class="btn btn-danger btn-sm" @click="remove">删除</button>
        <div class="actions-spacer"></div>
        <button class="btn btn-ghost" @click="close">取消</button>
        <button class="btn btn-primary" @click="save">保存</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mood-picker-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-3);
  background: rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.mood-picker {
  width: 100%;
  max-width: 420px;
  padding: var(--space-6);
  max-height: 90vh;
  overflow-y: auto;
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-5);
}

.picker-title {
  font-family: var(--font-heading);
  font-size: var(--text-lg);
  color: var(--text-primary);
}

.picker-close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  font-size: 1.5rem;
  color: var(--text-muted);
  transition: background var(--duration-fast) var(--ease-out);
}

.picker-close:hover {
  background: var(--bg-muted);
  color: var(--text-primary);
}

.picker-preview {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  border: 2px solid;
  margin-bottom: var(--space-5);
}

.preview-dot {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
}

.preview-label {
  font-weight: 600;
  color: var(--text-primary);
}

.preview-hint {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.picker-section {
  margin-bottom: var(--space-5);
}

.section-label {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: var(--space-2);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-2);
}

.preset-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2);
  border-radius: var(--radius-md);
  border: 2px solid transparent;
  transition: transform var(--duration-fast) var(--ease-out);
}

.preset-btn:hover {
  transform: translateY(-2px);
}

.preset-dot {
  width: 20px;
  height: 20px;
  border-radius: var(--radius-full);
}

.preset-name {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.custom-row {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.custom-row .input {
  flex: 1;
}

.color-input {
  width: 44px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  background: none;
}

.intensity-slider {
  width: 100%;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--bg-muted);
  outline: none;
  -webkit-appearance: none;
}

.intensity-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-full);
  background: var(--accent);
  cursor: pointer;
  box-shadow: var(--shadow-sm);
}

.intensity-labels {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-top: var(--space-1);
}

.picker-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border);
}

.actions-spacer {
  flex: 1;
}

/* ── 心情药剂（多条吐槽）── */
.picker-vents {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.picker-vent {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--bg-muted);
}

.picker-vent-dot {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border-radius: var(--radius-full);
}

.picker-vent-text {
  flex: 1;
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--text-primary);
  word-break: break-all;
}

.picker-vent-del {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-full);
  color: var(--text-muted);
  line-height: 1;
  transition: all var(--duration-fast) var(--ease-out);
}

.picker-vent-del:hover {
  background: var(--danger-bg);
  color: var(--danger);
}
</style>
