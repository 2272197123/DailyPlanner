<script setup>
/* ═══════════════════════════════════════
   CurtainReveal.vue — 丝绒帘开幕
   进入心情页时两片帘向两侧拉开（~1.1s），露出内容；
   Teleport body，播放期间 pointer-events:none 不阻塞交互，
   播完移除 DOM。prefers-reduced-motion 直接跳过。
   ═══════════════════════════════════════ */
import { ref, onMounted } from 'vue'
import anime from 'animejs'
import { prefersReducedMotion, isMobileViewport } from '@/composables/useAnime'

const emit = defineEmits(['done'])

const show = ref(true)
const leftRef = ref(null)
const rightRef = ref(null)
const valanceRef = ref(null)

onMounted(() => {
  /* 移动端同样跳过（老 GPU 上两片 51vw 大层位移动画太贵），CSS 侧有 display:none 兜底 */
  if (prefersReducedMotion() || isMobileViewport()) {
    show.value = false
    emit('done')
    return
  }
  anime.timeline({
    complete: () => {
      show.value = false
      emit('done')
    }
  })
    .add({
      targets: leftRef.value,
      translateX: ['0%', '-105%'],
      rotate: [0, -1.5],
      duration: 1100,
      easing: 'easeInOutCubic'
    }, 0)
    .add({
      targets: rightRef.value,
      translateX: ['0%', '105%'],
      rotate: [0, 1.5],
      duration: 1100,
      easing: 'easeInOutCubic'
    }, 0)
    .add({
      targets: valanceRef.value,
      translateY: ['0%', '-110%'],
      duration: 800,
      easing: 'easeInCubic'
    }, 150)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="curtain-stage" aria-hidden="true">
      <div ref="leftRef" class="curtain curtain-left">
        <span class="curtain-fringe"></span>
      </div>
      <div ref="rightRef" class="curtain curtain-right">
        <span class="curtain-fringe"></span>
      </div>
      <div ref="valanceRef" class="curtain-valance">✦ ✧ ✦ ✧ ✦ ✧ ✦</div>
    </div>
  </Teleport>
</template>

<style scoped>
.curtain-stage {
  position: fixed;
  inset: 0;
  z-index: 9990;
  pointer-events: none;
  overflow: hidden;
}

.curtain {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 51%;
  /* 纵向褶皱：主题 accent 为底，叠深色条纹 + 一道受光，随主题/亮暗自适应 */
  background:
    repeating-linear-gradient(
      90deg,
      rgba(0, 0, 0, 0.38) 0px,
      rgba(0, 0, 0, 0.08) 16px,
      rgba(255, 255, 255, 0.07) 30px,
      rgba(0, 0, 0, 0.28) 46px
    ),
    linear-gradient(180deg, rgba(0, 0, 0, 0.45), rgba(0, 0, 0, 0.62)),
    var(--accent);
  box-shadow: 0 0 40px rgba(0, 0, 0, 0.55);
  will-change: transform;
}

.curtain-left {
  left: 0;
  transform-origin: 0 0;
}

.curtain-right {
  right: 0;
  transform-origin: 100% 0;
}

/* 内侧穗边（主题浅色阶梯交替） */
.curtain-fringe {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 6px;
  background: repeating-linear-gradient(
    180deg,
    var(--accent-lighter) 0px,
    var(--accent-light) 10px,
    var(--accent-lighter) 20px
  );
  opacity: 0.9;
}

.curtain-left .curtain-fringe { right: 0; }
.curtain-right .curtain-fringe { left: 0; }

/* 顶部檐幕 */
.curtain-valance {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  background:
    linear-gradient(180deg, rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.38)),
    var(--accent);
  color: var(--accent-lighter);
  font-size: 12px;
  letter-spacing: 0.5em;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.5);
}

/* 移动端 / reduced-motion 兜底：即使被误挂载也不显示（照 atmosphere.css orb 模式） */
@media (max-width: 768px) {
  .curtain-stage {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .curtain-stage {
    display: none;
  }
}
</style>
