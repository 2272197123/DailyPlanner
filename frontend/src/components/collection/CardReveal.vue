<script setup>
/* ═══════════════════════════════════════
   CardReveal.vue — 掉卡/签到 新卡揭示动效（全局单例，App.vue 挂载）

   消费 collection store 的 revealQueue，逐个播放：
   - N   简洁：卡面直接弹入 → 停留 → 淡出
   - R   卡背翻正面 + 蓝色光晕
   - SR  翻面 + 紫色光晕 + 星尘粒子
   - SSR 最华丽：翻面 + 金色流光（CardFace animated）+ 星尘 + 金色粒子雨
   之后依次弹「成就达成」横幅（弹性砸入 + burst 粒子）。

   降级：prefers-reduced-motion 时不播 overlay，改 toast 通知。
   点击遮罩可跳过当前动画。所有动画 transform/opacity；粒子播完移除 DOM。
   ═══════════════════════════════════════ */
import { ref, watch, nextTick } from 'vue'
import anime from 'animejs'
import { useCollectionStore } from '@/stores/collection'
import { useToastStore } from '@/stores/toast'
import { useAnime, prefersReducedMotion, isMobileViewport } from '@/composables/useAnime'
import CardFace from '@/components/collection/CardFace.vue'

const collectionStore = useCollectionStore()
const toastStore = useToastStore()
const { burst, starDust } = useAnime()

const active = ref(false)
const card = ref(null)
const achievements = ref([])     // 待播成就队列（当前 item 的）
const currentAch = ref(null)     // 正在展示的成就
const showAch = ref(false)

const boxRef = ref(null)         // 外层：位移/缩放
const innerRef = ref(null)       // 内层：翻面 rotateY
const achRef = ref(null)

let playing = false
let currentTl = null

/* 卡背装饰（塔罗星轨，同源 CardCelebration 卡背视觉） */
const TWINKLES = [
  { x: '18%', y: '26%', d: '0s' }, { x: '78%', y: '20%', d: '0.4s' },
  { x: '12%', y: '62%', d: '0.8s' }, { x: '84%', y: '58%', d: '0.2s' },
  { x: '30%', y: '80%', d: '0.6s' }, { x: '66%', y: '84%', d: '1s' }
]

const RARITY_LABEL = { N: '普通', R: '稀有', SR: '史诗', SSR: '传说' }

function rarityLabel(r) {
  return RARITY_LABEL[r] || r
}

/* 降级路径：toast 告知结果，不播 overlay */
function toastFallback(item) {
  if (item.card) {
    toastStore.ok(`获得卡牌「${item.card.name}」（${rarityLabel(item.card.rarity)}）`)
  }
  for (const a of item.achievements || []) {
    toastStore.ok(`🏅 成就达成：${a.name}`)
  }
}

async function playItem(item) {
  if (prefersReducedMotion()) {
    toastFallback(item)
    return
  }
  card.value = item.card || null
  achievements.value = [...(item.achievements || [])]
  currentAch.value = null
  showAch.value = false

  if (card.value) {
    active.value = true
    await nextTick()
    await playCard(card.value)
    active.value = false
  }
  /* 成就横幅逐个播 */
  for (const a of achievements.value) {
    currentAch.value = a
    showAch.value = true
    active.value = true
    await nextTick()
    await playAchievement()
    showAch.value = false
  }
  active.value = false
}

function playCard(c) {
  return new Promise(resolve => {
    const box = boxRef.value
    const inner = innerRef.value
    if (!box || !inner) { resolve(); return }
    const rarity = c.rarity || 'N'
    const cx = window.innerWidth / 2
    const cy = window.innerHeight / 2
    const mobile = isMobileViewport()

    const tl = anime.timeline({
      complete: () => { currentTl = null; resolve() }
    })
    currentTl = tl

    if (rarity === 'N') {
      /* 简洁：直接弹入 → 停留 → 淡出 */
      tl.add({
        targets: box,
        scale: [0.4, 1], opacity: [0, 1],
        easing: 'easeOutBack', duration: 420
      }).add({
        targets: box,
        opacity: [1, 0], translateY: [0, -20],
        easing: 'easeInQuad', duration: 350, delay: 750
      })
      return
    }

    /* R/SR/SSR：卡背朝前弹入 → 翻面揭示 */
    tl.add({
      targets: box,
      scale: [0.3, 1], rotate: [-10, 0], opacity: [0, 1],
      easing: 'easeOutCubic', duration: 460
    }).add({
      targets: inner,
      rotateY: [0, 180],
      easing: 'easeInOutSine', duration: 700,
      complete: () => {
        /* 翻面落定瞬间按稀有度放粒子 */
        if (rarity === 'SR') {
          starDust(cx, cy, { count: mobile ? 10 : 14 })
        } else if (rarity === 'SSR') {
          starDust(cx, cy, { count: mobile ? 14 : 22, spread: 220, fall: 170 })
          burst(cx, cy, { count: mobile ? 10 : 16, colors: ['#e8c874', '#f5e3b3', '#d9a92c'], distance: 110 })
        } else {
          burst(cx, cy, { count: 8, colors: ['#4a7dd8', '#8fb2ee'], distance: 70 })
        }
      }
    })

    if (rarity === 'SSR') {
      /* 金色呼吸脉动，停留更久 */
      tl.add({
        targets: box,
        scale: [1, 1.1, 1.04],
        easing: 'easeOutElastic(1, .5)', duration: 900
      }).add({
        targets: box,
        opacity: [1, 0], translateY: [0, -30], scale: [1.04, 0.94],
        easing: 'easeInQuad', duration: 450, delay: 1100
      })
    } else if (rarity === 'SR') {
      tl.add({
        targets: box,
        scale: [1, 1.06, 1],
        easing: 'easeInOutSine', duration: 500
      }).add({
        targets: box,
        opacity: [1, 0], translateY: [0, -24],
        easing: 'easeInQuad', duration: 400, delay: 700
      })
    } else {
      tl.add({
        targets: box,
        opacity: [1, 0], translateY: [0, -20],
        easing: 'easeInQuad', duration: 380, delay: 620
      })
    }
  })
}

function playAchievement() {
  return new Promise(resolve => {
    const el = achRef.value
    if (!el) { resolve(); return }
    const tl = anime.timeline({
      complete: () => { currentTl = null; resolve() }
    })
    currentTl = tl
    tl.add({
      targets: el,
      scale: [1.8, 1], opacity: [0, 1], translateY: [24, 0],
      easing: 'easeOutElastic(1, .5)', duration: 700,
      begin: () => {
        burst(window.innerWidth / 2, window.innerHeight / 2 - 40, {
          count: isMobileViewport() ? 8 : 12,
          colors: ['#e8c874', '#f5e3b3', '#b9a7e8']
        })
      }
    }).add({
      targets: el,
      opacity: [1, 0], translateY: [0, -18],
      easing: 'easeInQuad', duration: 380, delay: 1000
    })
  })
}

function skip() {
  /* 点击遮罩：快进当前 timeline（粒子由各自 complete 自清理，不受影响） */
  if (currentTl) currentTl.seek(currentTl.duration)
}

watch(() => collectionStore.revealQueue.length, async () => {
  if (playing) return
  playing = true
  while (collectionStore.revealQueue.length) {
    const item = collectionStore.revealQueue.shift()
    try {
      await playItem(item)
    } catch { /* 动画异常不阻塞队列 */ }
  }
  playing = false
})
</script>

<template>
  <Teleport to="body">
    <div v-if="active" class="cr-overlay" @click="skip">
      <!-- 新卡揭示 -->
      <div v-if="card && !showAch" class="cr-box" ref="boxRef">
        <div class="cr-inner" ref="innerRef">
          <!-- 卡背：塔罗星轨（N 不翻面，正面直接朝前） -->
          <div v-if="card.rarity !== 'N'" class="cr-face cr-back">
            <span
              v-for="(t, i) in TWINKLES"
              :key="i"
              class="cr-twinkle"
              :style="{ left: t.x, top: t.y, animationDelay: t.d }"
            >✦</span>
            <svg class="cr-tarot" viewBox="0 0 100 100" aria-hidden="true">
              <g fill="none" stroke="#e8c874">
                <circle cx="50" cy="50" r="40" stroke-width="0.5" stroke-dasharray="1.5 3" opacity="0.55" />
                <circle cx="50" cy="50" r="31" stroke-width="0.8" opacity="0.7" />
                <path
                  d="M50 28 C52.5 41 59 47.5 72 50 C59 52.5 52.5 59 50 72 C47.5 59 41 52.5 28 50 C41 47.5 47.5 41 50 28 Z"
                  fill="#e8c874" stroke="none" opacity="0.95"
                />
                <circle cx="50" cy="50" r="5.5" fill="#16103a" stroke-width="1" />
                <circle cx="50" cy="50" r="2" fill="#e8c874" stroke="none" />
              </g>
            </svg>
          </div>
          <!-- 卡面 -->
          <div class="cr-face cr-front" :class="{ 'cr-front-static': card.rarity === 'N' }">
            <CardFace :card="card" :animated="card.rarity === 'SSR'" />
          </div>
        </div>
        <div class="cr-caption" :class="'cr-cap-' + (card.rarity || 'N').toLowerCase()">
          {{ rarityLabel(card.rarity) }} · {{ card.seriesName }}
        </div>
      </div>

      <!-- 成就达成横幅 -->
      <div v-if="showAch && currentAch" class="cr-ach" ref="achRef">
        <span class="cr-ach-icon">🏅</span>
        <div class="cr-ach-text">
          <span class="cr-ach-title">成就达成 · {{ currentAch.name }}</span>
          <span class="cr-ach-desc">{{ currentAch.desc }}</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cr-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(8, 6, 20, 0.5);
}

/* 卡牌容器：塔罗比例 */
.cr-box {
  width: min(230px, 58vw);
  aspect-ratio: 2 / 3.1;
  perspective: 1200px;
  opacity: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.cr-inner {
  position: relative;
  width: 100%;
  flex: 1;
  transform-style: preserve-3d;
}

.cr-face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  border-radius: var(--radius-xl);
  overflow: hidden;
}

.cr-front {
  transform: rotateY(180deg);
}

.cr-front-static {
  transform: none;
}

.cr-front .card-face {
  width: 100%;
  height: 100%;
  aspect-ratio: auto;
}

/* ── 卡背：深靛星空描金（与 CardCelebration 卡背同源）── */
.cr-back {
  background:
    radial-gradient(circle at 22% 18%, rgba(232, 200, 116, 0.14), transparent 42%),
    radial-gradient(circle at 80% 82%, rgba(138, 123, 184, 0.22), transparent 46%),
    radial-gradient(circle at 50% 50%, #2b1b5e 0%, #1a1440 52%, #0d0a24 100%);
  border: 2px solid #e8c874;
  box-shadow: inset 0 0 0 5px #16103a, inset 0 0 0 6.5px rgba(232, 200, 116, 0.65);
}

.cr-twinkle {
  position: absolute;
  color: #f5e3b3;
  font-size: 9px;
  animation: cr-twinkle 1.7s ease-in-out infinite alternate;
}

@keyframes cr-twinkle {
  from { opacity: 0.15; transform: scale(0.7); }
  to { opacity: 1; transform: scale(1.25); }
}

.cr-tarot {
  position: absolute;
  left: 14%;
  top: 14%;
  width: 72%;
  filter: drop-shadow(0 0 10px rgba(232, 200, 116, 0.55));
}

/* ── 稀有度标题 ── */
.cr-caption {
  margin-top: var(--space-3);
  font-family: var(--font-heading);
  font-size: var(--text-sm);
  font-weight: 600;
  color: #f5f3ee;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.5);
}

.cr-cap-ssr { color: #e8c874; text-shadow: 0 0 10px rgba(232, 200, 116, 0.8); }
.cr-cap-sr { color: #c4b0f5; }
.cr-cap-r { color: #a9c4f0; }

/* ── 成就横幅 ── */
.cr-ach {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-6);
  background: var(--bg-elevated);
  border: 2px solid var(--rarity-ssr);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg), 0 0 24px var(--rarity-ssr-glow);
  opacity: 0;
}

.cr-ach-icon {
  font-size: 2rem;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
}

.cr-ach-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cr-ach-title {
  font-family: var(--font-heading);
  font-size: var(--text-base);
  font-weight: 700;
  color: var(--text-primary);
}

.cr-ach-desc {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .cr-overlay {
    /* 移动端去全屏滤镜已天然无 backdrop-filter；略提亮遮罩保持层次 */
    background: rgba(8, 6, 20, 0.62);
  }
}
</style>
