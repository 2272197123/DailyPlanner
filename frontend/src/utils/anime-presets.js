/* ═══════════════════════════════════════
   anime-presets.js — Reusable anime.js parameter sets
   ═══════════════════════════════════════ */

import anime from 'animejs'

export const presets = {
  fadeUp: {
    opacity: [0, 1],
    translateY: [18, 0],
    easing: 'easeOutExpo',
    duration: 500
  },

  fadeIn: {
    opacity: [0, 1],
    easing: 'easeOutQuad',
    duration: 400
  },

  scaleIn: {
    opacity: [0, 1],
    scale: [0.9, 1],
    easing: 'easeOutBack',
    duration: 500
  },

  slideInLeft: {
    opacity: [0, 1],
    translateX: [-24, 0],
    easing: 'easeOutExpo',
    duration: 500
  },

  slideInRight: {
    opacity: [0, 1],
    translateX: [24, 0],
    easing: 'easeOutExpo',
    duration: 500
  },

  staggerFadeUp: {
    opacity: [0, 1],
    translateY: [16, 0],
    easing: 'easeOutExpo',
    duration: 450,
    delay: anime.stagger(60)
  },

  pop: {
    scale: [0.8, 1.15, 1],
    easing: 'easeOutElastic(1, .6)',
    duration: 700
  },

  pulse: {
    scale: [1, 1.08, 1],
    easing: 'easeInOutSine',
    duration: 1200,
    loop: true
  },

  shake: {
    translateX: [0, -6, 6, -6, 6, 0],
    easing: 'easeInOutSine',
    duration: 400
  },

  float: {
    translateY: [0, -8, 0],
    easing: 'easeInOutSine',
    duration: 3000,
    loop: true
  }
}

export function getPreset(name) {
  return presets[name] || presets.fadeUp
}
