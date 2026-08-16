<script setup>
/* ═══════════════════════════════════════
   FoodCard.vue — 翻面食物卡
   参照 research/ref-tricky-robin（uiverse tricky-robin-67, MIT）：
   正面 = 食物图 + 分类徽章 + 名称/价格；背面 = 名称 + 描述 + 预算价。
   点击翻面（兼容触屏，不依赖 hover）；只动 transform/opacity。
   ═══════════════════════════════════════ */
import { ref } from 'vue'
import DishImage from './DishImage.vue'

defineProps({
  dish: { type: Object, required: true }
})

const flipped = ref(false)

const MEAL_LABELS = { lunch: '仅午餐', dinner: '仅晚餐', both: '午晚均可' }
</script>

<template>
  <div
    class="food-card"
    :class="{ flipped }"
    role="button"
    tabindex="0"
    :aria-label="dish.name + '，点击查看详情'"
    @click="flipped = !flipped"
    @keydown.enter.prevent="flipped = !flipped"
    @keydown.space.prevent="flipped = !flipped"
  >
    <div class="food-card-inner">
      <!-- 正面：像素风菜品图 -->
      <div class="face face-front">
        <div class="front-img">
          <DishImage :dish="dish" />
        </div>
        <div class="front-content">
          <small class="badge">{{ dish.category }}</small>
          <div class="front-desc">
            <div class="front-title">
              <strong>{{ dish.name }}</strong>
              <span class="front-price">¥{{ dish.price }}</span>
            </div>
            <p class="front-footer">{{ MEAL_LABELS[dish.meal] || dish.meal }} · 点我翻面</p>
          </div>
        </div>
      </div>

      <!-- 背面：名称 + 描述 + 预算价（旋转光圈装饰同参考卡） -->
      <div class="face face-back">
        <div class="back-content">
          <strong class="back-name">{{ dish.name }}</strong>
          <p class="back-desc">{{ dish.description || '暂无描述' }}</p>
          <div class="back-meta">
            <span class="back-price">¥{{ dish.price }}</span>
            <span class="back-meal">{{ MEAL_LABELS[dish.meal] || dish.meal }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.food-card {
  width: 220px;
  height: 300px;
  margin: 0 auto;
  cursor: pointer;
  outline: none;
}

.food-card-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform var(--duration-slow) var(--ease-in-out);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}

.food-card.flipped .food-card-inner {
  transform: rotateY(180deg);
}

.face {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  border-radius: var(--radius-lg);
  overflow: hidden;
}

/* ── 正面 ── */
.face-front {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
}

.front-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.front-content {
  position: absolute;
  inset: 0;
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.badge {
  align-self: flex-start;
  padding: 2px var(--space-2);
  border-radius: var(--radius-full);
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: var(--text-xs);
}

.front-desc {
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
}

.front-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  font-size: var(--text-sm);
}

.front-price {
  font-family: var(--font-data);
  font-weight: 700;
  color: #ffd88a;
  flex-shrink: 0;
}

.front-footer {
  margin-top: var(--space-1);
  font-size: var(--text-xs);
  color: rgba(255, 255, 255, 0.65);
}

/* ── 背面 ── */
.face-back {
  transform: rotateY(180deg);
  background: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 旋转光圈（参考卡同款，纯 transform 动画；reduced-motion 由全局规则压平） */
.face-back::before {
  content: ' ';
  position: absolute;
  width: 140px;
  height: 160%;
  background: linear-gradient(90deg, transparent, var(--accent-lighter), var(--accent-lighter), transparent);
  opacity: 0.7;
  animation: spin-slow 5s infinite linear;
}

.back-content {
  position: absolute;
  inset: 1px;
  border-radius: var(--radius-lg);
  background: var(--accent);
  color: var(--on-accent);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-5);
  text-align: center;
}

.back-name {
  font-family: var(--font-heading);
  font-size: var(--text-xl);
}

.back-desc {
  font-size: var(--text-sm);
  line-height: 1.7;
  opacity: 0.85;
}

.back-meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--text-sm);
}

.back-price {
  font-family: var(--font-data);
  font-size: var(--text-lg);
  font-weight: 700;
}

.back-meal {
  opacity: 0.7;
  font-size: var(--text-xs);
}
</style>
