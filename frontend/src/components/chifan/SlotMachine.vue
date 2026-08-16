<script setup>
/* ═══════════════════════════════════════
   SlotMachine.vue — 恰饭老虎机
   菜名纵列快速滚动后减速定格（easeOutQuart 只动 transform）；
   spinId 递增触发一次抽取；reduced-motion 下直接定格。
   ═══════════════════════════════════════ */
import { ref, watch, nextTick, onUnmounted } from 'vue'
import anime from 'animejs'
import { prefersReducedMotion } from '@/composables/useAnime'

const props = defineProps({
  names: { type: Array, required: true },  // 候选菜名池
  target: { type: String, default: '' },   // 定格目标菜名
  spinId: { type: Number, default: 0 }     // 每次抽取 +1
})
const emit = defineEmits(['done'])

const ITEM_H = 56   // 单行高度（与 .slot-item 保持一致）
const REEL_LEN = 26 // 滚动条长度（末位为目标）

const trackRef = ref(null)
const reel = ref([])
let anim = null

/* crypto.getRandomValues 随机（不用 Math.random） */
function cryptoIdx(n) {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return buf[0] % n
}

/* 随机菜名填满滚动条，避免相邻重名，末位放定格目标 */
function buildReel() {
  const pool = props.names.length ? props.names : ['恰饭']
  const out = []
  while (out.length < REEL_LEN - 1) {
    const name = pool[cryptoIdx(pool.length)]
    if (pool.length > 1) {
      if (out.length && out[out.length - 1] === name) continue
      if (name === props.target && out.length === REEL_LEN - 2) continue
    }
    out.push(name)
  }
  out.push(props.target || pool[0])
  return out
}

watch(() => props.spinId, async (id) => {
  if (!id) return
  if (anim) { anim.pause(); anim = null }
  reel.value = buildReel()
  await nextTick()
  const el = trackRef.value
  if (!el) { emit('done'); return }
  /* 窗口高 3 行、目标居中：末位 item 中心对准窗口中心 → 偏移 (len-2)*ITEM_H */
  const offset = ITEM_H * (reel.value.length - 2)
  if (prefersReducedMotion()) {
    el.style.transform = 'translateY(' + (-offset) + 'px)'
    emit('done')
    return
  }
  anim = anime({
    targets: el,
    translateY: [0, -offset],
    easing: 'easeOutQuart',
    duration: 2300,
    complete: () => emit('done')
  })
})

onUnmounted(() => {
  if (anim) anim.pause()
})
</script>

<template>
  <div class="slot-machine">
    <div class="slot-window">
      <div ref="trackRef" class="slot-track">
        <div v-for="(n, i) in reel" :key="i" class="slot-item">{{ n }}</div>
      </div>
      <div class="slot-fade slot-fade-top"></div>
      <div class="slot-fade slot-fade-bottom"></div>
      <div class="slot-cursor"></div>
    </div>
  </div>
</template>

<style scoped>
.slot-machine {
  display: flex;
  justify-content: center;
}

.slot-window {
  position: relative;
  width: min(320px, 100%);
  height: 168px; /* 3 × 56px */
  overflow: hidden;
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
  border: 1px solid var(--border-strong);
  box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.08);
}

.slot-track {
  will-change: transform;
}

.slot-item {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-heading);
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
}

/* 上下渐隐：滚动中的菜名在边缘淡出（纯静态渐变层，不参与动画） */
.slot-fade {
  position: absolute;
  left: 0;
  right: 0;
  height: 56px;
  pointer-events: none;
  z-index: 1;
}

.slot-fade-top {
  top: 0;
  background: linear-gradient(180deg, var(--bg-elevated) 20%, rgba(255, 255, 255, 0));
}

.slot-fade-bottom {
  bottom: 0;
  background: linear-gradient(0deg, var(--bg-elevated) 20%, rgba(255, 255, 255, 0));
}

/* 中线指针 */
.slot-cursor {
  position: absolute;
  top: 56px;
  left: var(--space-2);
  right: var(--space-2);
  height: 56px;
  border-top: 2px solid var(--accent);
  border-bottom: 2px solid var(--accent);
  border-radius: var(--radius-sm);
  pointer-events: none;
  opacity: 0.5;
}
</style>
