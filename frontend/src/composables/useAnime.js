/* ═══════════════════════════════════════
   useAnime.js — anime.js wrapper composable
   ═══════════════════════════════════════ */

import { ref, onMounted, onUnmounted } from 'vue'
import anime from 'animejs'
import { getPreset } from '@/utils/anime-presets'

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

  function staggerEnter(selector, container, presetName = 'staggerFadeUp') {
    const elements = container ? container.querySelectorAll(selector) : document.querySelectorAll(selector)
    if (!elements.length) return null
    return runPreset(elements, presetName)
  }

  function burst(x, y, options = {}) {
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
