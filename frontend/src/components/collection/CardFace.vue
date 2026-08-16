<script setup>
/* ═══════════════════════════════════════
   CardFace.vue — 通用卡面（收集系统）

   纯 CSS/SVG 绘制，无外部图：
   - 稀有度决定边框/底色：SSR 金渐变+流光、SR 紫、R 蓝、N 白灰
   - 系列决定纹样：塔罗=星月线条、美食=像素格、精灵=爪印圆瞳、节气=水墨笔触
   - 面值（隐藏值）只在右下角小字展示，不显眼
   - owned=false 时渲染剪影占位（收集页图鉴）
   - animated=true 才启用 SSR 流光（揭示动效用；图鉴列表无常驻动画）

   无 SVG defs/ids，多实例同页无 id 冲突。
   ═══════════════════════════════════════ */
import { computed } from 'vue'

const props = defineProps({
  card: { type: Object, required: true },  // 定义 + 可选 faceValue
  owned: { type: Boolean, default: true },
  count: { type: Number, default: 0 },     // 拥有数量角标（>1 才显示）
  animated: { type: Boolean, default: false }
})

const rarity = computed(() => props.card.rarity || 'N')
const series = computed(() => props.card.series || '')
</script>

<template>
  <div
    class="card-face"
    :class="['rarity-' + rarity.toLowerCase(), 'series-' + series, { unowned: !owned, animated }]"
  >
    <!-- 系列纹样层（剪影态隐藏） -->
    <svg v-if="owned && series === 'tarot'" class="cf-pattern" viewBox="0 0 100 140" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-width="1">
        <path d="M58 30 a16 16 0 1 0 8 26 a12.5 12.5 0 1 1 -8 -26 Z" opacity="0.8" />
        <circle cx="50" cy="46" r="26" opacity="0.28" stroke-dasharray="2 4" />
        <line x1="20" y1="96" x2="80" y2="96" opacity="0.3" />
        <line x1="26" y1="104" x2="74" y2="104" opacity="0.2" />
      </g>
      <g fill="currentColor">
        <circle cx="30" cy="34" r="1.4" opacity="0.8" />
        <circle cx="76" cy="26" r="1.1" opacity="0.6" />
        <circle cx="70" cy="66" r="1.2" opacity="0.7" />
        <path d="M32 74 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6 Z" opacity="0.75" />
      </g>
    </svg>

    <svg v-else-if="owned && series === 'food'" class="cf-pattern" viewBox="0 0 100 140" aria-hidden="true">
      <g fill="currentColor">
        <rect x="18" y="22" width="9" height="9" opacity="0.5" />
        <rect x="31" y="22" width="9" height="9" opacity="0.28" />
        <rect x="44" y="22" width="9" height="9" opacity="0.44" />
        <rect x="57" y="22" width="9" height="9" opacity="0.24" />
        <rect x="70" y="22" width="9" height="9" opacity="0.4" />
        <rect x="18" y="35" width="9" height="9" opacity="0.3" />
        <rect x="44" y="35" width="9" height="9" opacity="0.55" />
        <rect x="70" y="35" width="9" height="9" opacity="0.26" />
        <rect x="31" y="48" width="9" height="9" opacity="0.36" />
        <rect x="57" y="48" width="9" height="9" opacity="0.3" />
        <rect x="20" y="96" width="8" height="8" opacity="0.22" />
        <rect x="72" y="98" width="8" height="8" opacity="0.22" />
      </g>
    </svg>

    <svg v-else-if="owned && series === 'sprite'" class="cf-pattern" viewBox="0 0 100 140" aria-hidden="true">
      <!-- 爪印：掌垫 + 四趾 -->
      <g fill="currentColor">
        <ellipse cx="50" cy="52" rx="11" ry="9" opacity="0.6" />
        <circle cx="35" cy="38" r="4.4" opacity="0.55" />
        <circle cx="45" cy="31" r="4.4" opacity="0.6" />
        <circle cx="56" cy="31" r="4.4" opacity="0.6" />
        <circle cx="66" cy="38" r="4.4" opacity="0.55" />
        <!-- 萌系圆瞳点缀 -->
        <circle cx="26" cy="94" r="5" opacity="0.25" />
        <circle cx="74" cy="94" r="5" opacity="0.25" />
        <circle cx="27" cy="93" r="1.6" fill="#fff" opacity="0.7" />
        <circle cx="75" cy="93" r="1.6" fill="#fff" opacity="0.7" />
      </g>
    </svg>

    <svg v-else-if="owned && series === 'solar'" class="cf-pattern" viewBox="0 0 100 140" aria-hidden="true">
      <!-- 水墨笔触：几条浓淡不一的写意弧 -->
      <g fill="none" stroke="currentColor" stroke-linecap="round">
        <path d="M18 40 C 36 26, 60 30, 82 22" stroke-width="4.5" opacity="0.5" />
        <path d="M22 60 C 40 50, 58 56, 78 46" stroke-width="2.6" opacity="0.32" />
        <path d="M26 102 C 44 92, 62 98, 76 88" stroke-width="3.4" opacity="0.24" />
        <circle cx="74" cy="66" r="5" stroke-width="1.6" opacity="0.4" />
      </g>
    </svg>

    <!-- SSR 流光层（仅 animated 时启用，见样式） -->
    <span v-if="owned && rarity === 'SSR'" class="cf-shine" aria-hidden="true"></span>

    <!-- 剪影态问号 -->
    <span v-if="!owned" class="cf-unknown">?</span>

    <template v-else>
      <span class="cf-glyph" aria-hidden="true">{{ card.glyph }}</span>
      <span class="cf-name">{{ card.name }}</span>
      <span class="cf-rarity-tag">{{ rarity }}</span>
      <span v-if="card.faceValue != null" class="cf-face-value" title="隐藏面值">{{ card.faceValue }}</span>
      <span v-if="count > 1" class="cf-count">×{{ count }}</span>
    </template>
  </div>
</template>

<style scoped>
.card-face {
  position: relative;
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-2);
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border: 2px solid var(--border-strong);
  box-shadow: var(--shadow-sm);
}

/* ── 稀有度分级（身份色，变量集中在 variables.css）── */
.rarity-n {
  border-color: var(--rarity-n);
  background:
    radial-gradient(circle at 30% 18%, rgba(255, 255, 255, 0.5), transparent 55%),
    linear-gradient(160deg, var(--bg-elevated), var(--bg-muted));
}

.rarity-r {
  border-color: var(--rarity-r);
  background:
    radial-gradient(circle at 30% 18%, var(--rarity-r-soft), transparent 60%),
    linear-gradient(160deg, var(--bg-elevated), var(--rarity-r-soft));
  color: var(--rarity-r);
}

.rarity-sr {
  border-color: var(--rarity-sr);
  background:
    radial-gradient(circle at 30% 18%, var(--rarity-sr-soft), transparent 60%),
    linear-gradient(160deg, var(--bg-elevated), var(--rarity-sr-soft));
  color: var(--rarity-sr);
}

.rarity-ssr {
  border-color: var(--rarity-ssr);
  background:
    radial-gradient(circle at 28% 16%, var(--rarity-ssr-soft), transparent 58%),
    linear-gradient(155deg, var(--bg-elevated) 20%, var(--rarity-ssr-soft) 130%);
  color: var(--rarity-ssr-deep);
  box-shadow: var(--shadow-sm), 0 0 10px var(--rarity-ssr-glow);
}

/* ── SSR 流光：一条斜向高光扫过（仅 .animated 启用，paint-only 无 will-change）── */
.cf-shine {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(115deg, transparent 30%, rgba(255, 246, 214, 0.75) 48%, transparent 62%);
  background-size: 260% 100%;
  background-position: 120% 0;
  opacity: 0;
}

.animated .cf-shine {
  opacity: 1;
  animation: cf-shine-sweep 2.4s var(--ease-in-out) infinite;
}

@keyframes cf-shine-sweep {
  0% { background-position: 120% 0; }
  55% { background-position: -120% 0; }
  100% { background-position: -120% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .animated .cf-shine { animation: none; opacity: 0; }
}

/* ── 纹样与内容 ── */
.cf-pattern {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.cf-glyph {
  position: relative;
  font-size: 1.9rem;
  line-height: 1;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.18));
}

.cf-name {
  position: relative;
  font-family: var(--font-heading);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-primary);
  text-align: center;
  line-height: 1.3;
}

.cf-rarity-tag {
  position: absolute;
  top: var(--space-1);
  left: var(--space-2);
  font-family: var(--font-data);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  opacity: 0.85;
}

/* 隐藏面值：右下角小字，不显眼 */
.cf-face-value {
  position: absolute;
  right: var(--space-2);
  bottom: var(--space-1);
  font-family: var(--font-data);
  font-size: 8px;
  color: var(--text-muted);
  opacity: 0.65;
}

.cf-count {
  position: absolute;
  top: var(--space-1);
  right: var(--space-2);
  font-family: var(--font-data);
  font-size: 9px;
  font-weight: 700;
  color: var(--accent);
  background: var(--accent-muted);
  border-radius: var(--radius-full);
  padding: 0 5px;
  line-height: 1.5;
}

/* ── 剪影占位（未获得）── */
.card-face.unowned {
  border-style: dashed;
  border-color: var(--border-strong);
  background: var(--bg-muted);
  box-shadow: none;
}

.cf-unknown {
  font-family: var(--font-heading);
  font-size: 1.8rem;
  color: var(--text-muted);
  opacity: 0.55;
}
</style>
