---
name: modal-flash-lessons-learned
description: 弹窗闪烁问题复盘 — 我为什么做了一天都修不好
metadata:
  type: feedback
---

# 弹窗闪烁问题复盘

## 你的解决方案

创建了两个新文件，用三态动画状态机从根本上解决了问题：

- **[css/overlay-anim.css](css/overlay-anim.css)** — `.hidden` → `.anim-open`（播放一次）→ `.anim-done`（动画结束，永不重播）
- **[js/overlay-anim.js](js/overlay-anim.js)** — 统一弹窗控制层，通过 `animationend` 事件 + 800ms 兜底 + 双重 `requestAnimationFrame` 确保动画只播一次

## 我为什么修不好

**根本错误：把「动画重复播放」误诊为「页面多次加载」。**

花了大量时间在 Python launcher 的 302 redirection vs 路径重写 vs `do_HEAD`、app.js 的 localStorage 防重入、currency.js 的 DOM 操作代替 innerHTML——全部打在了错误的目标上。

实际根因：CSS animation 绑定在元素选择器上，每次 innerHTML 创建新 DOM 都会自动触发动画。正确的解法是用 JS 显式控制动画状态（你的 `.anim-open` → `animationend` → `.anim-done` 方案）。

## 教训

1. **先诊断，再动手**——花 2 分钟看 DevTools 比花 2 小时改代码有效
2. **CSS animation 绑定在元素上而非状态上**——需要用状态机隔离
3. **遇到不清楚的问题先确认含义**——「弹窗多加载了」有歧义
4. **不要越改越深陷入沉没成本**——改两次不对就该停下来重新审视
5. **`animationend` 事件 + 安全超时是动画控制的正确模式**

**Why:** 在弹窗问题上浪费了大量时间却没有解决，必须记录
**How to apply:** 以后遇到问题先诊断（DevTools），再动手；有歧义先问用户；改几次不对就停下来重新分析
