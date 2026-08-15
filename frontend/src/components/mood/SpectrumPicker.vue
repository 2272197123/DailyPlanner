<script setup>
/* ═══════════════════════════════════════
   SpectrumPicker.vue — 连续光谱取色器
   hue 0–360 全色谱滑条（线性渐变轨道，Pointer 拖动/点击），
   明度固定为标准值稍淡（60%），无任何预设色板，自由取色。
   v-model 值为 '#rrggbb'。
   ═══════════════════════════════════════ */
import { ref, computed, watch } from 'vue'
import { hslToHex, hexToHsl } from '@/utils/color'

const props = defineProps({
  modelValue: { type: String, default: '#f59e0b' }
})
const emit = defineEmits(['update:modelValue'])

const init = hexToHsl(props.modelValue)
const hue = ref(init.h)
const SAT = 72
const LIGHT = 60 // 明度固定：标准值稍淡（用户反馈不需要亮度调节）

const hex = computed(() => hslToHex(hue.value, SAT, LIGHT))

watch(hex, (v) => emit('update:modelValue', v), { immediate: true })

/* 外部 v-model 变化（极少发生）时同步滑条位置 */
watch(() => props.modelValue, (v) => {
  if (v && v.toLowerCase() !== hex.value.toLowerCase()) {
    hue.value = hexToHsl(v).h
  }
})

/* 色相轨道：线性渐变全色谱（不用色板） */
const hueTrackBg = 'linear-gradient(90deg, hsl(0,72%,55%), hsl(45,72%,55%), hsl(90,72%,55%), hsl(150,72%,55%), hsl(210,72%,55%), hsl(270,72%,55%), hsl(330,72%,55%), hsl(360,72%,55%))'

/* Pointer 拖动取色（鼠标 + 触屏统一） */
const hueTrack = ref(null)

function ratioFromEvent(el, e) {
  const rect = el.getBoundingClientRect()
  const x = (e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? rect.left) - rect.left
  return Math.max(0, Math.min(1, x / rect.width))
}

let hueDragging = false
function onHueDown(e) {
  hueDragging = true
  hueTrack.value?.setPointerCapture?.(e.pointerId)
  hue.value = Math.round(ratioFromEvent(hueTrack.value, e) * 360)
}
function onHueMove(e) {
  if (hueDragging && hueTrack.value) {
    hue.value = Math.round(ratioFromEvent(hueTrack.value, e) * 360)
  }
}
function onHueUp() {
  hueDragging = false
}
</script>

<template>
  <div class="spectrum-picker">
    <div class="sp-head">
      <span class="sp-guide">暖色 ≈ 积极 · 冷色 ≈ 消极，也可以选任何颜色</span>
      <span class="sp-preview">
        <span class="sp-dot" :style="{ backgroundColor: hex }"></span>
        <span class="sp-hex">{{ hex }}</span>
      </span>
    </div>

    <div
      ref="hueTrack"
      class="sp-track sp-hue"
      :style="{ background: hueTrackBg }"
      @pointerdown="onHueDown"
      @pointermove="onHueMove"
      @pointerup="onHueUp"
      @pointercancel="onHueUp"
    >
      <span class="sp-thumb" :style="{ left: `${(hue / 360) * 100}%`, backgroundColor: hex }"></span>
    </div>
  </div>
</template>

<style scoped>
.spectrum-picker {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.sp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.sp-guide {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.sp-preview {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.sp-dot {
  width: 16px;
  height: 16px;
  border-radius: var(--radius-full);
  border: 2px solid var(--bg-elevated);
  box-shadow: var(--shadow-sm);
}

.sp-hex {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.sp-track {
  position: relative;
  border-radius: var(--radius-full);
  cursor: pointer;
  touch-action: none;
}

.sp-hue {
  height: 16px;
}

.sp-thumb {
  position: absolute;
  top: 50%;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-full);
  border: 2px solid #fff;
  box-shadow: 0 1px 5px rgba(0, 0, 0, 0.4);
  transform: translate(-50%, -50%);
  pointer-events: none;
}
</style>
