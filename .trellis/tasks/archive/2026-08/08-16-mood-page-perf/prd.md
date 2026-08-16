# PRD: 心情页移动端性能优化（年历动画/帘幕/常驻动画治理）

## 背景

用户反馈手机浏览器上心情页面卡顿（计划页 08-16 优化后已不卡）。调研（`research/mood-page-perf-investigation.md`）确认请求侧已干净，卡顿全部来自渲染侧：

- **P1 高**：年历 365 格 × 60ms anime stagger ≈ 22 秒动画长尾，进年历 tab/切年/保存心情后都触发；MoodCell 常驻 `will-change` 产生 365 个合成层
- **P2 高**：每次进心情页重播 1.1s 全屏丝绒帘幕（无移动端豁免、无会话级只播一次）
- **P3 中**：WishingBottle 大瓶波浪动画移动端未降级（mini 版已有 animation:none 先例）
- **P4 中**：MoodPicker overlay 的 backdrop-filter blur(4px) 无移动端豁免
- **P5 中**：侧栏 84 格心情图全站常驻，移动端抽屉隐藏仍挂载，vent 增删即全量重算

## 目标

不改变视觉设计与交互语义，消除心情页移动端卡顿。修复模式复用计划页 08-16 已有方案（App.vue orb 降级、components.css 去 blur 媒体查询）。

## 范围（P1-P5 全修 + 清理）

1. **P1 年历动画**：staggerEnter 在移动端（≤768px）/reduced-motion 下跳过；桌面端收敛 stagger（delay 大幅降低或仅前 N 格）；MoodCell 常驻 `will-change: transform` 移除（仅动画期间/hover 需要）；is-today box-shadow 无限光环改 transform/opacity（参照 TaskCard ctp-dot 改法）
2. **P2 帘幕**：每会话只播一次（模块级标志或 sessionStorage）；移动端/reduced-motion 直接跳过（JS 判定 + CSS display:none 双保险，照 App.vue orb 模式）
3. **P3 瓶子波浪**：移动端 `.wb-liquid` 波浪动画停用（照搬 mini 版 animation:none 先例）；气泡移动端已减量，保持
4. **P4 MoodPicker**：overlay 在 ≤768px 下去掉 backdrop-filter（照抄 components.css:173-179 模式）
5. **P5 侧栏心情格**：移动端抽屉未打开时不渲染该区块（v-if）；或 84 格颜色收敛为 entries 变化才重算的 computed map——二选一，取改动小且彻底的
6. **清理**：删除死代码 `components/mood/MoodVentInput.vue` 与 `mood.js yearEntries`

## 约束

- 不得改变任何视觉设计与交互行为（桌面端尤其要逐像素一致）
- 遵守 `.trellis/spec/backend/quality-guidelines.md`：chrome80 CSS（禁 color-mix()/:has()/媒体范围语法）、动画只用 transform/opacity、prefers-reduced-motion 全覆盖
- 不引入新请求；mood store 的 loadedYears 去重保持有效

## 验收标准

1. 移动端进入心情页无全屏帘幕长动画，当日 tab 立即可交互
2. 年历 tab（移动端）无逐格 stagger 动画，滚动/切换流畅；桌面端年历动画仍在但更轻快
3. MoodPicker 打开时移动端无 backdrop-filter；瓶子在移动端无波浪动画（静态液体）
4. vent 增删不再触发侧栏 84 格全量重渲染（或移动端抽屉关闭时该区域不渲染）
5. `npm run build` 通过；桌面端视觉与改动前一致；reduced-motion 下所有循环/进页动画均不出现
