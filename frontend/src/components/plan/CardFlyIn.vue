<script setup>
/* ═══════════════════════════════════════
   CardFlyIn.vue — 任务卡「贴上时间轴」动效
   用于新建任务 / 导入前一天计划：
   卡牌从点击处飞出 → 中央放大旋转 + 金光高亮
   → 缩小飞向时间轴上的目标卡片 → 目标金色脉冲。
   与 CardCelebration 同源的卡牌视觉（正面）。
   ═══════════════════════════════════════ */
import { ref, nextTick } from 'vue'
import anime from 'animejs'

const active = ref(false)
const subject = ref('')
const emoji = ref('📌')
const cardRef = ref(null)

let playing = false

async function play({ x, y, subject: s, emoji: e, targetSel }) {
  if (playing) return
  playing = true
  subject.value = s || ''
  emoji.value = e || '📌'
  active.value = true
  await nextTick()

  const card = cardRef.value
  if (!card) { active.value = false; playing = false; return }

  const cx = window.innerWidth / 2
  const cy = window.innerHeight / 2
  const dx = (x ?? cx) - cx
  const dy = (y ?? cy) - cy
  const cardW = card.offsetWidth || 200

  const tl = anime.timeline({
    complete: () => { active.value = false; playing = false }
  })

  /* 1. 从点击处飞到屏幕中央 */
  tl.add({
    targets: card,
    translateX: [dx, 0],
    translateY: [dy, 0],
    scale: [0.3, 1],
    rotate: [-10, 0],
    opacity: [0, 1],
    duration: 380,
    easing: 'easeOutCubic'
  })

  /* 2. 中央旋转一圈 + 高亮脉动 */
  tl.add({
    targets: card,
    rotate: [0, 360],
    scale: [1, 1.07, 1],
    duration: 620,
    easing: 'easeInOutSine'
  })

  /* 3. 缩小贴上时间轴目标卡片（找不到目标则原地淡出） */
  const target = targetSel ? document.querySelector(targetSel) : null
  if (target) {
    const r = target.getBoundingClientRect()
    const tx = r.left + r.width / 2 - cx
    const ty = r.top + r.height / 2 - cy
    const s = Math.max(0.35, Math.min(r.width / cardW, 1))
    tl.add({
      targets: card,
      translateX: [0, tx],
      translateY: [0, ty],
      scale: [1, s],
      opacity: [1, 0],
      duration: 520,
      easing: 'easeInOutCubic',
      begin: () => {
        /* 目标卡片金色脉冲（内联样式，完成后还原） */
        anime({
          targets: target,
          boxShadow: [
            '0 0 0 3px rgba(232, 200, 116, 0.9)',
            '0 0 24px 6px rgba(232, 200, 116, 0)',
            '0 0 0 0 rgba(232, 200, 116, 0)'
          ],
          duration: 1100,
          easing: 'easeOutQuad',
          complete: () => { target.style.boxShadow = '' }
        })
      }
    })
  } else {
    tl.add({
      targets: card,
      scale: [1, 0.9],
      opacity: [1, 0],
      duration: 350,
      easing: 'easeInQuad'
    })
  }
}

defineExpose({ play })
</script>

<template>
  <Teleport to="body">
    <div v-if="active" class="cf-overlay">
      <div class="cf-card" ref="cardRef">
        <span class="cf-emoji">{{ emoji }}</span>
        <span class="cf-subject">{{ subject }}</span>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cf-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none; /* 不阻塞操作 */
}

.cf-card {
  width: min(200px, 52vw);
  aspect-ratio: 2 / 2.6;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: 16px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  background:
    radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.18), transparent 55%),
    linear-gradient(155deg, var(--accent-light, #7c9de8), var(--accent) 55%, var(--accent-dark, #3450a0));
  text-align: center;
  will-change: transform, opacity;
  filter: drop-shadow(0 0 22px rgba(232, 200, 116, 0.5))
          drop-shadow(0 14px 32px rgba(0, 0, 0, 0.45));
}

.cf-emoji { font-size: 2.6rem; }

.cf-subject {
  font-size: var(--text-sm);
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.35);
  word-break: break-all;
}
</style>
