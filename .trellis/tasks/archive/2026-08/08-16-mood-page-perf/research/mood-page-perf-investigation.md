# 心情页性能调研报告（2026-08-16，explore 子代理产出）

用户反馈：手机浏览器上心情页面卡顿（计划页 08-16 优化后已不卡）。

## 组件树

```
App.vue（常驻）            onMounted → moodStore.fetchMoods()          App.vue:44
└─ AppSidebar.vue（常驻）  onMounted → moodStore.fetchMoods()  AppSidebar.vue:143
│  └─ 近12周心情格 84 个（getCellColor/dayColor 每格每次渲染都算）  AppSidebar.vue:196-207
└─ MoodView.vue（/mood，非 keep-alive，每次进页全量重挂载）
   ├─ CurtainReveal        每次进页都重播 ~1.1s 全屏帘幕动画       MoodView.vue:79-81,107
   ├─ 环境星尘 8/24 个      CSS 无限动画，仅 day tab 挂载，页面隐藏暂停  MoodView.vue:87-102,111
   ├─ [day]   StarPendant（rAF 钟摆）+ WishingBottle（波浪/气泡 CSS 动画）+ VentComposer
   ├─ [week]  MoodWeek → 7× WishingBottle mini（无动画）
   ├─ [month] MoodMonth → ~31 格，cellStyle 渲染期逐格调 dayColor/getVents
   └─ [year]  MoodGrid → ~365× MoodCell；watch(year, immediate) → fetchMoods + staggerEnter
```

## 请求侧：基本干净

- App.vue/AppSidebar 双调用已被 mood.js:72-100 `loadedYears` + `moodsInFlight` 单飞合并，每年 1 次 GET /moods?year=，**去重生效**。
- MoodGrid 切年与 loadedYears 无冲突；vents 增删为单次 POST/DELETE 乐观更新。
- 低：`loading` 标志跨年份共享（mood.js:78,94）；`loadedYears` 无失效机制（正确性非性能）。
- **结论：卡顿主因在渲染，不在请求。**

## 渲染热点（按严重程度）

### P1【高】年历 365 格 anime stagger：约 22 秒动画长尾
`MoodGrid.vue:163-170`（watch immediate）→ `useAnime.js:34-38 staggerEnter` → `anime-presets.js:42-48 staggerFadeUp`（delay: anime.stagger(60)）。切年历 tab/切年/保存心情后 'pop'（MoodGrid.vue:149-156）→ 365 个 DOM 逐帧写 inline transform/opacity，stagger 60ms × 365 ≈ 22s 主线程占用。叠加 `MoodCell.vue:54` 每格常驻 `will-change: transform`（365 个合成层）；`MoodCell.vue:64-72` is-today 光环 box-shadow 无限动画（单格，影响小）。

### P2【高】每次进页重播全屏帘幕 + 转场 + 当日 tab 动画群叠加
`MoodView.vue:79-81` 每次挂载 `curtainOn = true`（无会话级"只播一次"）。CurtainReveal 两个 51vw 全高多层 repeating-gradient + `box-shadow: 0 0 40px`（CurtainReveal.vue:83-95）大层做 1.1s 位移动画。只豁免 reduced-motion，**未做移动端豁免**（对照 atmosphere.css:95-99 orb 已降级）。进页瞬间 page 转场 + StarPendant rAF + 星尘同时启动。

### P3【中】当日 tab 并存多套动画系统
- StarPendant rAF：已 hidden 暂停 + reduced-motion，单元素 transform，低。
- WishingBottle `.wb-liquid` 波浪（:328-345）与 `.wb-bubble`（:347-356）：SVG 子元素动画不少移动内核不合成提升，逐帧重绘渐变 path；移动端只减了气泡数（:106），波浪没降级。mini 版已有 `animation: none` 先例（:333-335）。
- 星尘 8 span：已降级，OK。

### P4【中】MoodPicker 全屏 backdrop-filter 无移动端豁免
`MoodPicker.vue:185-186` overlay `backdrop-filter: blur(4px)`。计划页同类已去 blur（components.css:173-179），此处漏网。

### P5【中】侧栏 84 格心情图常驻全站
`AppSidebar.vue:196-207`：每格渲染期调 getCellColor（dayColor→mixColors）+ title 两次 getMood；任何 vent 增删都重渲染 84 格。移动端抽屉隐藏但**仍挂载**（:612-625 无 v-if）。

### P6【低】
- MoodGrid 模板逐格 getMood(date)：entries 变化 → 父重渲染 + 365 次调用，但 MoodCell 引用稳定不重复 patch，可控。
- 死代码：`components/mood/MoodVentInput.vue` 无 import；`mood.js:28 yearEntries` 无订阅者；`MoodGrid.vue:30-32` resize 监听无防抖。

### P7【低】watch/computed 链健康
addVent/removeVent 原地 mutate，依赖精准重算，无全量重建。

## 建议修复方向

1. **P1**：staggerEnter 移动端/reduced-motion 跳过（复用 App.vue:54 orbsDisabled 判定）；桌面端收敛 stagger（仅可视区/前 N 格，或降 delay）；去掉 MoodCell 常驻 will-change（hover 时才需要）。
2. **P2**：帘幕每会话一次（模块级标志/sessionStorage）或移动端跳过，复用 orb 降级模式（JS 跳过 + CSS display:none 双保险）。
3. **P3**：移动端停 `.wb-liquid` 波浪（照搬 mini 的 animation:none 先例）。
4. **P4**：MoodPicker overlay ≤768px 去 backdrop-filter（照抄 components.css:173-179）。
5. **P5**：移动端抽屉未开时 v-if 不渲染心情格；或颜色收敛为 entries 变化才重算的 computed map。
6. 清理：删 MoodVentInput.vue、yearEntries。

## 可复用的计划页模式

| 模式 | 出处 | 用于 |
|---|---|---|
| 移动端/reduced-motion 一次判定 + JS 跳过 + CSS display:none | App.vue:54-69, atmosphere.css:93-106 | P1/P2/P3 |
| 移动端去 backdrop-filter 媒体查询 | components.css:172-179 | P4 |
| 会话级缓存 + in-flight 单飞 | mood.js:72-100 | 已生效 |
| visibilitychange 暂停 rAF | StarPendant.vue:79-90 | 已做 |

## 回归风险

- loadedYears 与 MoodGrid 跨年拉取兼容；orb 降级只动自身；schedule.js 与 mood store 无交叉。
- 注意：计划页那轮优化若未部署生产，线上 loadedYears 去重可能未生效——排查线上先确认部署版本。
