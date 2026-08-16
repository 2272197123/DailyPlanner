<script setup>
/* ═══════════════════════════════════════
   DishImage.vue — 菜品图（public/food/<image>）
   无图或加载失败时回退到程序化像素格占位 + 菜名首字，
   不用 emoji 充当菜品图。
   ═══════════════════════════════════════ */
import { ref, computed, watch } from 'vue'

const props = defineProps({
  dish: { type: Object, required: true }
})

const failed = ref(false)

const url = computed(() => (props.dish.image ? '/food/' + props.dish.image : ''))
const showImg = computed(() => !!url.value && !failed.value)
const initial = computed(() => (props.dish.name || '?').trim().charAt(0) || '?')

/* 切换菜品（老虎机连抽）时重置失败态，让新图重新尝试加载 */
watch(() => props.dish.id, () => { failed.value = false })
</script>

<template>
  <img
    v-if="showImg"
    :src="url"
    :alt="dish.name"
    class="dish-img"
    loading="lazy"
    @error="failed = true"
  />
  <div v-else class="dish-img-placeholder" :title="dish.name">
    <span class="dish-initial">{{ initial }}</span>
  </div>
</template>

<style scoped>
.dish-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  image-rendering: pixelated; /* 像素风菜品图放大保持锐利 */
  display: block;
}

/* 程序化像素格占位：双层 45° 渐变错位成棋盘格 */
.dish-img-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-muted);
  background-image:
    linear-gradient(45deg, var(--border) 25%, transparent 25%, transparent 75%, var(--border) 75%),
    linear-gradient(45deg, var(--border) 25%, transparent 25%, transparent 75%, var(--border) 75%);
  background-size: 16px 16px;
  background-position: 0 0, 8px 8px;
}

.dish-initial {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-heading);
  font-size: 1.75rem;
  color: var(--accent);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}
</style>
