/* ═══════════════════════════════════════
   color.js — 颜色工具
   hex/rgb 换算、线性光空间混色（与后端 db._blend_colors
   算法保持一致）、hex-alpha 拼接（兼容老内核，不用 color-mix）
   ═══════════════════════════════════════ */

/** '#rrggbb' → {r,g,b}（0-255）；非法输入返回 null */
export function hexToRgb(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || '').trim())
  if (!m) return null
  const v = parseInt(m[1], 16)
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 }
}

/** {r,g,b} 或 (r,g,b) → '#rrggbb' */
export function rgbToHex(r, g, b) {
  if (typeof r === 'object' && r) ({ r, g, b } = r)
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return '#' + c(r) + c(g) + c(b)
}

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function linearToSrgb(c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}

/** 多色混合：sRGB → 线性光空间算术平均 → 回 sRGB（同后端 _blend_colors） */
export function mixColors(hexes) {
  const list = (hexes || []).map(hexToRgb).filter(Boolean)
  if (!list.length) return '#9ca3af'
  const acc = [0, 0, 0]
  list.forEach(({ r, g, b }) => {
    acc[0] += srgbToLinear(r / 255)
    acc[1] += srgbToLinear(g / 255)
    acc[2] += srgbToLinear(b / 255)
  })
  const n = list.length
  return rgbToHex(
    linearToSrgb(acc[0] / n) * 255,
    linearToSrgb(acc[1] / n) * 255,
    linearToSrgb(acc[2] / n) * 255
  )
}

/** hex + 透明度(0-1) → '#rrggbbaa'（hex-alpha，兼容老内核） */
export function withAlpha(hex, alpha) {
  const a = Math.max(0, Math.min(1, alpha))
  return hex + Math.round(a * 255).toString(16).padStart(2, '0')
}

/** hsl(h:0-360, s:0-100, l:0-100) → '#rrggbb'，光谱取色用 */
export function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360
  s = Math.max(0, Math.min(100, s)) / 100
  l = Math.max(0, Math.min(100, l)) / 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let rgb
  if (h < 60) rgb = [c, x, 0]
  else if (h < 120) rgb = [x, c, 0]
  else if (h < 180) rgb = [0, c, x]
  else if (h < 240) rgb = [0, x, c]
  else if (h < 300) rgb = [x, 0, c]
  else rgb = [c, 0, x]
  return rgbToHex((rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255)
}

/** '#rrggbb' → {h,s,l}，用于把 hex 回显到光谱滑条 */
export function hexToHsl(hex) {
  const rgb = hexToRgb(hex)
  if (!rgb) return { h: 210, s: 70, l: 55 }
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6)
    else if (max === g) h = 60 * ((b - r) / d + 2)
    else h = 60 * ((r - g) / d + 4)
  }
  return { h: ((h % 360) + 360) % 360, s: s * 100, l: l * 100 }
}
