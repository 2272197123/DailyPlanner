<script setup>
/* ═══════════════════════════════════════
   CardCelebration.vue — 任务完成庆祝
   卡牌从点击处飞入屏幕中央 → 翻转（塔罗星轨卡背）
   → 金光 + 「完成」印章 + 星星粒子 → 淡出。
   纯 CSS/SVG 绘制卡背，无图片资源。
   ═══════════════════════════════════════ */
import { ref, nextTick } from 'vue'
import anime from 'animejs'

const active = ref(false)
const subject = ref('')
const emoji = ref('📌')
const reward = ref(0)
const cardRef = ref(null)
const innerRef = ref(null)
const stampRef = ref(null)
const xpRef = ref(null)

/* 卡背四角与环上的装饰星 */
const CORNER_STARS = ['✦', '✦', '✦', '✦']
const TWINKLES = [
  { x: '18%', y: '26%', d: '0s' },
  { x: '78%', y: '20%', d: '0.4s' },
  { x: '12%', y: '62%', d: '0.8s' },
  { x: '84%', y: '58%', d: '0.2s' },
  { x: '30%', y: '80%', d: '0.6s' },
  { x: '66%', y: '84%', d: '1s' }
]

/* 星星粒子雨：✦ 字符 + 金点，从屏幕中心向外飞散 */
function starShower() {
  const cx = window.innerWidth / 2
  const cy = window.innerHeight / 2
  const colors = ['#e8c874', '#f5e3b3', '#b9a7e8', '#ffffff']
  const els = []
  for (let i = 0; i < 22; i++) {
    const isStar = i % 3 !== 2
    const el = document.createElement('span')
    el.textContent = isStar ? (i % 2 ? '✦' : '✧') : '·'
    const size = isStar ? 10 + Math.random() * 14 : 18 + Math.random() * 16
    el.style.cssText = `
      position: fixed; left: ${cx}px; top: ${cy}px;
      font-size: ${size}px; line-height: 1;
      color: ${colors[i % colors.length]};
      text-shadow: 0 0 8px rgba(232, 200, 116, 0.9);
      pointer-events: none; z-index: 10001;
      will-change: transform, opacity;
    `
    document.body.appendChild(el)
    els.push(el)
  }
  anime({
    targets: els,
    translateX: () => anime.random(-190, 190),
    translateY: () => anime.random(-220, 160),
    rotate: () => anime.random(-180, 180),
    scale: [1, 0.2],
    opacity: [1, 0],
    easing: 'easeOutExpo',
    duration: () => anime.random(800, 1300),
    complete: () => els.forEach(el => el.remove())
  })
}

let playing = false

async function play({ x, y, subject: s, emoji: e, reward: r }) {
  if (playing) return
  playing = true
  subject.value = s || ''
  emoji.value = e || '📌'
  reward.value = r || 0
  active.value = true
  await nextTick()

  const card = cardRef.value
  const inner = innerRef.value
  if (!card || !inner) { active.value = false; playing = false; return }

  /* 起点：点击位置（相对屏幕中心的偏移），小且倾斜 */
  const dx = (x ?? window.innerWidth / 2) - window.innerWidth / 2
  const dy = (y ?? window.innerHeight / 2) - window.innerHeight / 2

  const tl = anime.timeline({
    complete: () => { active.value = false; playing = false }
  })

  tl
    /* 1. 飞入中央 */
    .add({
      targets: card,
      translateX: [dx, 0],
      translateY: [dy, 0],
      scale: [0.25, 1],
      rotate: [-14, 0],
      opacity: [0, 1],
      easing: 'easeOutCubic',
      duration: 480
    })
    /* 2. 卡牌翻转（卡背朝前），金光渐强 */
    .add({
      targets: inner,
      rotateY: [0, 180],
      easing: 'easeInOutSine',
      duration: 760
    })
    .add({
      targets: card,
      scale: [1, 1.08, 1],
      duration: 760,
      easing: 'easeInOutSine'
    }, '-=760')
    /* 3. 印章砸下 + 星星粒子 + XP */
    .add({
      targets: stampRef.value,
      scale: [2.4, 1],
      rotate: [-24, -12],
      opacity: [0, 1],
      easing: 'easeOutElastic(1, .45)',
      duration: 640,
      begin: () => starShower()
    })
    .add({
      targets: xpRef.value,
      opacity: [0, 1],
      translateY: [10, 0],
      easing: 'easeOutCubic',
      duration: 400
    }, '-=300')
    /* 4. 停留片刻后整体淡出 */
    .add({
      targets: card,
      scale: [1, 0.92],
      translateY: [0, -26],
      opacity: [1, 0],
      easing: 'easeInQuad',
      duration: 420,
      delay: 780
    })
    .add({
      targets: '.cc-overlay',
      opacity: [1, 0],
      easing: 'linear',
      duration: 420
    }, '-=420')
}

defineExpose({ play })
</script>

<template>
  <Teleport to="body">
    <div v-if="active" class="cc-overlay">
      <div class="cc-card" ref="cardRef">
        <div class="cc-inner" ref="innerRef">
          <!-- 卡面：任务本身 -->
          <div class="cc-face cc-front">
            <span class="cc-front-emoji">{{ emoji }}</span>
            <span class="cc-front-subject">{{ subject }}</span>
          </div>
          <!-- 卡背：塔罗星轨 -->
          <div class="cc-face cc-back">
            <span v-for="(s, i) in CORNER_STARS" :key="'c' + i" class="cc-corner" :class="'cc-corner-' + i">{{ s }}</span>
            <span
              v-for="(t, i) in TWINKLES"
              :key="'t' + i"
              class="cc-twinkle"
              :style="{ left: t.x, top: t.y, animationDelay: t.d }"
            >✦</span>
            <svg class="cc-tarot" viewBox="0 0 100 100" aria-hidden="true">
              <g fill="none" stroke="#e8c874">
                <circle cx="50" cy="50" r="40" stroke-width="0.5" stroke-dasharray="1.5 3" opacity="0.55" />
                <circle cx="50" cy="50" r="31" stroke-width="0.8" opacity="0.7" />
                <!-- 八道光芒 -->
                <g stroke-width="1" opacity="0.85">
                  <line x1="50" y1="16" x2="50" y2="26" />
                  <line x1="50" y1="74" x2="50" y2="84" />
                  <line x1="16" y1="50" x2="26" y2="50" />
                  <line x1="74" y1="50" x2="84" y2="50" />
                  <line x1="26" y1="26" x2="33" y2="33" />
                  <line x1="67" y1="67" x2="74" y2="74" />
                  <line x1="74" y1="26" x2="67" y2="33" />
                  <line x1="33" y1="67" x2="26" y2="74" />
                </g>
                <!-- 四角星 -->
                <path
                  d="M50 28 C52.5 41 59 47.5 72 50 C59 52.5 52.5 59 50 72 C47.5 59 41 52.5 28 50 C41 47.5 47.5 41 50 28 Z"
                  fill="#e8c874" stroke="none" opacity="0.95"
                />
                <circle cx="50" cy="50" r="5.5" fill="#16103a" stroke-width="1" />
                <circle cx="50" cy="50" r="2" fill="#e8c874" stroke="none" />
              </g>
            </svg>
            <div class="cc-stamp" ref="stampRef">完成</div>
            <div class="cc-xp" ref="xpRef" v-if="reward > 0">+{{ reward }} XP</div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cc-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(8, 6, 20, 0.55);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}

/* 卡牌本体：塔罗比例 2 : 3.1 */
.cc-card {
  width: min(220px, 56vw);
  aspect-ratio: 2 / 3.1;
  perspective: 1200px;
  will-change: transform, opacity;
  filter: drop-shadow(0 0 26px rgba(232, 200, 116, 0.45))
          drop-shadow(0 18px 40px rgba(0, 0, 0, 0.5));
}

.cc-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  will-change: transform;
}

.cc-face {
  position: absolute;
  inset: 0;
  border-radius: 16px;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-4);
}

/* ── 卡面 ── */
.cc-front {
  background:
    radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.18), transparent 55%),
    linear-gradient(155deg, var(--accent-light, #7c9de8), var(--accent) 55%, var(--accent-dark, #3450a0));
  border: 2px solid rgba(255, 255, 255, 0.35);
  text-align: center;
}

.cc-front-emoji { font-size: 3rem; }

.cc-front-subject {
  font-size: var(--text-base);
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.35);
  word-break: break-all;
}

/* ── 卡背：深靛星空 + 描金 ── */
.cc-back {
  transform: rotateY(180deg);
  background:
    radial-gradient(circle at 22% 18%, rgba(232, 200, 116, 0.14), transparent 42%),
    radial-gradient(circle at 80% 82%, rgba(138, 123, 184, 0.22), transparent 46%),
    radial-gradient(circle at 50% 50%, #2b1b5e 0%, #1a1440 52%, #0d0a24 100%);
  border: 2px solid #e8c874;
  box-shadow: inset 0 0 0 5px #16103a, inset 0 0 0 6.5px rgba(232, 200, 116, 0.65);
}

.cc-corner {
  position: absolute;
  color: #e8c874;
  font-size: 11px;
  opacity: 0.9;
}

.cc-corner-0 { left: 10px; top: 8px; }
.cc-corner-1 { right: 10px; top: 8px; }
.cc-corner-2 { left: 10px; bottom: 8px; }
.cc-corner-3 { right: 10px; bottom: 8px; }

.cc-twinkle {
  position: absolute;
  color: #f5e3b3;
  font-size: 9px;
  animation: cc-twinkle 1.7s ease-in-out infinite alternate;
}

@keyframes cc-twinkle {
  from { opacity: 0.15; transform: scale(0.7); }
  to { opacity: 1; transform: scale(1.25); }
}

.cc-tarot {
  width: 72%;
  filter: drop-shadow(0 0 10px rgba(232, 200, 116, 0.55));
}

/* 「完成」印章 */
.cc-stamp {
  position: absolute;
  bottom: 17%;
  padding: var(--space-1) var(--space-3);
  border: 2px solid #e8c874;
  border-radius: var(--radius-sm);
  color: #e8c874;
  font-family: var(--font-heading);
  font-size: var(--text-lg);
  font-weight: 700;
  letter-spacing: 0.35em;
  text-indent: 0.35em;
  opacity: 0;
  background: rgba(22, 16, 58, 0.6);
  box-shadow: 0 0 14px rgba(232, 200, 116, 0.4);
}

.cc-xp {
  position: absolute;
  bottom: 8%;
  font-family: var(--font-data);
  font-size: var(--text-sm);
  font-weight: 700;
  color: #f5e3b3;
  text-shadow: 0 0 8px rgba(232, 200, 116, 0.7);
  opacity: 0;
}
</style>
