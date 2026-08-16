/* ═══════════════════════════════════════
   useAnime.js — anime.js wrapper composable
   ═══════════════════════════════════════ */

import { ref, onMounted, onUnmounted } from 'vue'
import anime from 'animejs'
import { getPreset } from '@/utils/anime-presets'

/* 统一的减弱动效开关：所有粒子/摆动动画入口先查它 */
export function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/* 移动端视口（≤768px）一次性判定，同 App.vue orbsDisabled 模式 */
let _mobileViewport = null
export function isMobileViewport() {
  if (_mobileViewport === null) {
    _mobileViewport = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(max-width: 768px)').matches
  }
  return _mobileViewport
}

export function useAnime() {
  const activeAnimations = new Set()

  function animate(target, params) {
    const animation = anime({
      targets: target,
      ...params
    })
    activeAnimations.add(animation)
    animation.finished.then(() => activeAnimations.delete(animation))
    return animation
  }

  function runPreset(target, presetName, overrides = {}) {
    const preset = getPreset(presetName)
    return animate(target, { ...preset, ...overrides })
  }

  /* maxCount > 0 时只动画前 N 个元素（年历 365 格收敛 stagger 用）；
     移动端 / reduced-motion 直接不播（大批 DOM 逐帧写在老 GPU 上卡顿） */
  function staggerEnter(selector, container, presetName = 'staggerFadeUp', maxCount = 0) {
    if (prefersReducedMotion() || isMobileViewport()) return null
    let elements = container ? container.querySelectorAll(selector) : document.querySelectorAll(selector)
    if (maxCount > 0 && elements.length > maxCount) {
      elements = Array.prototype.slice.call(elements, 0, maxCount)
    }
    if (!elements.length) return null
    return runPreset(elements, presetName)
  }

  function burst(x, y, options = {}) {
    if (prefersReducedMotion()) return null
    const {
      count = 12,
      colors = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6'],
      distance = 80,
      size = 6
    } = options

    const container = document.body
    const particles = []

    for (let i = 0; i < count; i++) {
      const particle = document.createElement('div')
      const angle = (i / count) * Math.PI * 2
      const color = colors[i % colors.length]

      particle.style.cssText = `
        position: fixed;
        left: ${x}px;
        top: ${y}px;
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        background: ${color};
        pointer-events: none;
        z-index: 9999;
        will-change: transform, opacity;
      `
      container.appendChild(particle)
      particles.push({ el: particle, angle })
    }

    const animation = anime({
      targets: particles.map(p => p.el),
      translateX: (el, i) => Math.cos(particles[i].angle) * distance,
      translateY: (el, i) => Math.sin(particles[i].angle) * distance,
      scale: [1, 0],
      opacity: [1, 0],
      easing: 'easeOutExpo',
      duration: 700,
      complete: () => {
        particles.forEach(p => p.el.remove())
      }
    })

    activeAnimations.add(animation)
    return animation
  }

  /* 星尘粒子：✦/✧/· 字符 span，物理感飞散 + 重力下落 + 淡出，完毕移除 DOM */
  function starDust(x, y, options = {}) {
    if (prefersReducedMotion()) return null
    const {
      count = 16,
      colors = ['#e8c874', '#f5e3b3', '#b9a7e8', '#ffffff'],
      spread = 180,
      fall = 150
    } = options

    const els = []
    for (let i = 0; i < count; i++) {
      const isStar = i % 3 !== 2
      const el = document.createElement('span')
      el.textContent = isStar ? (i % 2 ? '✦' : '✧') : '·'
      const size = isStar ? 9 + Math.random() * 13 : 16 + Math.random() * 14
      el.style.cssText = `
        position: fixed; left: ${x}px; top: ${y}px;
        font-size: ${size}px; line-height: 1;
        color: ${colors[i % colors.length]};
        text-shadow: 0 0 8px rgba(232, 200, 116, 0.9);
        pointer-events: none; z-index: 10001;
        will-change: transform, opacity;
      `
      document.body.appendChild(el)
      els.push(el)
    }

    const animation = anime({
      targets: els,
      translateX: () => anime.random(-spread, spread),
      translateY: [
        { value: () => anime.random(-spread, spread * 0.4), duration: 420, easing: 'easeOutCubic' },
        { value: `+=${fall}`, duration: 620, easing: 'easeInQuad' }
      ],
      rotate: () => anime.random(-180, 180),
      scale: [1, 0.2],
      opacity: [1, 0],
      duration: () => anime.random(750, 1200),
      complete: () => els.forEach(el => el.remove())
    })

    activeAnimations.add(animation)
    return animation
  }

  function countUp(element, from = 0, to = 100, duration = 1200) {
    const obj = { value: from }
    return anime({
      targets: obj,
      value: to,
      round: 1,
      easing: 'easeOutExpo',
      duration,
      update: () => {
        if (element) element.textContent = obj.value
      }
    })
  }

  function morphPath(element, fromD, toD, duration = 800) {
    return anime({
      targets: element,
      d: [fromD, toD],
      easing: 'easeInOutCubic',
      duration
    })
  }

  function cancelAll() {
    activeAnimations.forEach(anim => anim.pause())
    activeAnimations.clear()
  }

  return {
    anime,
    animate,
    runPreset,
    staggerEnter,
    burst,
    starDust,
    countUp,
    morphPath,
    cancelAll
  }
}

export function useTypingText(textRef, options = {}) {
  const {
    speed = 40,
    delay = 0,
    onComplete
  } = options

  const displayedText = ref('')
  let timeoutId = null

  function type(text) {
    displayedText.value = ''
    let index = 0

    const typeChar = () => {
      if (index < text.length) {
        displayedText.value += text[index]
        index++
        timeoutId = setTimeout(typeChar, speed)
      } else if (onComplete) {
        onComplete()
      }
    }

    timeoutId = setTimeout(typeChar, delay)
  }

  onUnmounted(() => {
    if (timeoutId) clearTimeout(timeoutId)
  })

  if (textRef && textRef.value) {
    onMounted(() => type(textRef.value))
  }

  return { displayedText, type }
}

export default useAnime
