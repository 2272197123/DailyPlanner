<script setup>
/*
 * 动画日夜主题切换开关
 * 设计改编自 uiverse.io RiccardoRapelli / jolly-chicken-91（MIT License）
 * https://uiverse.io/RiccardoRapelli/jolly-chicken-91
 *
 * 状态由 Vue class（.night）驱动而非 :checked 选择器（chrome80 稳妥兼容）；
 * 定位全部使用 class，不用 SVG id（桌面/移动双实例共存会冲突）。
 * 业务逻辑不在组件内：点击仅 emit('toggle')，由父级走 toggleMode + /prefs。
 */
import { useThemeStore } from '@/stores/theme'

const emit = defineEmits(['toggle'])
const themeStore = useThemeStore()
</script>

<template>
  <button
    type="button"
    class="theme-toggle"
    :class="{ night: themeStore.isDark }"
    role="switch"
    :aria-checked="themeStore.isDark"
    :title="themeStore.isDark ? '切换到白天模式' : '切换到夜间模式'"
    :aria-label="themeStore.isDark ? '切换到白天模式' : '切换到夜间模式'"
    @click="emit('toggle')"
  >
    <span class="slider">
      <span class="sun-moon">
        <!-- 月面陨坑（夜间浮现） -->
        <svg class="moon-dot md1" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" /></svg>
        <svg class="moon-dot md2" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" /></svg>
        <svg class="moon-dot md3" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" /></svg>
        <!-- 太阳光晕 -->
        <svg class="light-ray lr1" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" /></svg>
        <svg class="light-ray lr2" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" /></svg>
        <svg class="light-ray lr3" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" /></svg>
        <!-- 漂移云朵（随太阳一起滑出视野） -->
        <svg class="cloud cloud-dark c1" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" /></svg>
        <svg class="cloud cloud-dark c2" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" /></svg>
        <svg class="cloud cloud-dark c3" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" /></svg>
        <svg class="cloud cloud-light c4" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" /></svg>
        <svg class="cloud cloud-light c5" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" /></svg>
        <svg class="cloud cloud-light c6" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" /></svg>
      </span>
      <!-- 星星（夜间自上方下落淡入并闪烁） -->
      <span class="stars">
        <svg class="star s1" viewBox="0 0 20 20"><path d="M 0 10 C 10 10,10 10 ,0 10 C 10 10 , 10 10 , 10 20 C 10 10 , 10 10 , 20 10 C 10 10 , 10 10 , 10 0 C 10 10,10 10 ,0 10 Z" /></svg>
        <svg class="star s2" viewBox="0 0 20 20"><path d="M 0 10 C 10 10,10 10 ,0 10 C 10 10 , 10 10 , 10 20 C 10 10 , 10 10 , 20 10 C 10 10 , 10 10 , 10 0 C 10 10,10 10 ,0 10 Z" /></svg>
        <svg class="star s3" viewBox="0 0 20 20"><path d="M 0 10 C 10 10,10 10 ,0 10 C 10 10 , 10 10 , 10 20 C 10 10 , 10 10 , 20 10 C 10 10 , 10 10 , 10 0 C 10 10,10 10 ,0 10 Z" /></svg>
        <svg class="star s4" viewBox="0 0 20 20"><path d="M 0 10 C 10 10,10 10 ,0 10 C 10 10 , 10 10 , 10 20 C 10 10 , 10 10 , 20 10 C 10 10 , 10 10 , 10 0 C 10 10,10 10 ,0 10 Z" /></svg>
      </span>
    </span>
  </button>
</template>

<style scoped>
/* 根元素不声明 display：移动端变体需由父级控制 display:none/block（避免同优先级冲突） */
.theme-toggle {
  position: relative;
  width: 60px;
  height: 34px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
}

.slider {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #2196f3;
  border-radius: 34px;
  overflow: hidden;
  transition: background-color 0.4s;
  /* 建立层叠上下文：light-ray 的 z-index:-1 才能画在滑轨底色之上（原设计即有） */
  z-index: 0;
}

.theme-toggle.night .slider {
  background-color: #000;
}

.theme-toggle:focus .slider {
  box-shadow: 0 0 1px #2196f3;
}

.sun-moon {
  position: absolute;
  width: 26px;
  height: 26px;
  left: 4px;
  bottom: 4px;
  background-color: #ff0;
  border-radius: 50%;
  transition: transform 0.4s, background-color 0.4s;
}

.theme-toggle.night .sun-moon {
  background-color: #fff;
  /* 位移合并进关键帧：animation fill both 会覆盖 transform，
     单独 rotate 会把月亮弹回原位 */
  animation: moon-rotate 0.6s ease-in-out both;
}

.moon-dot {
  position: absolute;
  z-index: 4;
  fill: #808080;
  opacity: 0;
  transition: opacity 0.4s;
}

.theme-toggle.night .moon-dot {
  opacity: 1;
}

.md1 { left: 10px; top: 3px; width: 6px; height: 6px; }
.md2 { left: 2px; top: 10px; width: 10px; height: 10px; }
.md3 { left: 16px; top: 18px; width: 3px; height: 3px; }

.light-ray {
  position: absolute;
  z-index: -1;
  fill: #fff;
  opacity: 0.1;
}

.lr1 { left: -8px; top: -8px; width: 43px; height: 43px; }
.lr2 { left: -50%; top: -50%; width: 55px; height: 55px; }
.lr3 { left: -18px; top: -18px; width: 60px; height: 60px; }

.cloud {
  position: absolute;
  animation: cloud-move 6s infinite;
}

.cloud-light { fill: #eee; }
.cloud-dark { fill: #ccc; animation-delay: 1s; }

.c1 { left: 30px; top: 15px; width: 40px; }
.c2 { left: 44px; top: 10px; width: 20px; }
.c3 { left: 18px; top: 24px; width: 30px; }
.c4 { left: 36px; top: 18px; width: 40px; }
.c5 { left: 48px; top: 14px; width: 20px; }
.c6 { left: 22px; top: 26px; width: 30px; }

/* .stars 需 display:block：span 默认 inline，transform 不生效（下落动画丢失），
   且无法作为星子元素的定位包含块 */
.stars {
  display: block;
  transform: translateY(-32px);
  opacity: 0;
  transition: transform 0.4s, opacity 0.4s;
}

.theme-toggle.night .stars {
  transform: translateY(0);
  opacity: 1;
}

.star {
  position: absolute;
  fill: #fff;
  animation: star-twinkle 2s infinite;
}

.s1 { width: 20px; top: 2px; left: 3px; animation-delay: 0.3s; }
.s2 { width: 6px; top: 16px; left: 3px; }
.s3 { width: 12px; top: 20px; left: 10px; animation-delay: 0.6s; }
.s4 { width: 18px; top: 0; left: 18px; animation-delay: 1.3s; }

@keyframes moon-rotate {
  0% { transform: translateX(0) rotate(0deg); }
  100% { transform: translateX(26px) rotate(360deg); }
}

@keyframes cloud-move {
  0% { transform: translateX(0); }
  40% { transform: translateX(4px); }
  80% { transform: translateX(-4px); }
  100% { transform: translateX(0); }
}

@keyframes star-twinkle {
  0% { transform: scale(1); }
  40% { transform: scale(1.2); }
  80% { transform: scale(0.8); }
  100% { transform: scale(1); }
}

/* reduced-motion：关闭循环/过渡动画，状态切换仍即时生效 */
@media (prefers-reduced-motion: reduce) {
  .slider,
  .sun-moon,
  .moon-dot,
  .stars {
    transition: none;
  }
  .cloud,
  .star,
  .theme-toggle.night .sun-moon {
    animation: none;
  }
  /* 无动画时仍需靠 transform 把月亮固定到右侧 */
  .theme-toggle.night .sun-moon {
    transform: translateX(26px);
  }
}
</style>
