# 计划页性能调研报告（2026-08-16，explore 子代理产出）

用户反馈：手机浏览器打开「计划页面」卡顿，怀疑大量重复请求与重复渲染。

## 组件树与数据流

```
App.vue (常驻：ambient-orb×3 无限动画、fetchMoods)
└─ PlanView.vue
   │  loadDate(date) → fetchDay + fetchPresetAndRules + ensureDayPlan
   │                    + fetchRoutineProgress + fetchRoutines + initDailyCopy  (PlanView.vue:27-38)
   │  watch(currentDate) → loadDate  (PlanView.vue:40-42)
   ├─ WeekStrip.vue                  onMounted → GET /plans?limit=14 (WeekStrip.vue:33-43, 75)
   ├─ FlowTimeline.vue               时间轴主组件
   │   ├─ TaskCard.vue ×N            每卡内含 1s 计时器、翻面星轨
   │   ├─ RoutineItem.vue ×N         toggle → PUT /routine-done (无防抖)
   │   ├─ useDragSort.js             Pointer 拖拽，每帧读布局
   │   └─ CardCelebration/CardFlyIn  anime.js 粒子
   ├─ CountdownPanel.vue             onMounted → GET /goals (CountdownPanel.vue:77)
   └─ Modals (ImportPlanModal → 再 fetchDay 前一天)
```

核心数据流：`scheduleStore.schedules[date]` → `getComputedTimeline(date)`（每次调用全量排序+对象展开，schedule.js:568-619）→ `FlowTimeline.timedRows` → `rows`（每分钟插入 now 哨兵行）→ v-for TaskCard。

## 一、重复请求问题

### R1. 每次切日期固定 7~11 个请求，无缓存 —— 高

| 接口 | 次数 | 位置 |
|---|---|---|
| GET `/plan/{date}` `/order/{date}` `/earned/{date}` | 3 | schedule.js:97-99 |
| GET `/plan-preset` `/recurring-rules` | 2 | schedule.js:168-169 |
| GET `/routine-done/{date}` `/routines` | 2 | schedule.js:380, routines.js:33 |
| GET+PUT `/day-data/{date}` | 0~2 | routines.js:115-117 |
| 空白日 ensureDayPlan → PUT `/plan` + PUT `/plan-preset` | 0~2 | schedule.js:250→147,197 |

- `fetchPresetAndRules`/`fetchRoutines` 拉的是日期无关的全局数据，每次切日期重复请求。
- 切回已看过的日期仍全量重拉，loadDate 不检查缓存。
- 快速连点 ←/→ 无防抖、无 abort、无 in-flight 去重。

### R2. saveDay 无防抖 —— 高

`schedule.js:142-161 saveDay()`：PUT `/plan/{date}` + `_snapshotPreset` 无条件 PUT `/plan-preset`（schedule.js:197，内容没变也 PUT）+ 全量 localStorage 序列化。

- 勾选任务 `toggleBlockDone`（schedule.js:349）→ saveDay + 可能 POST `/earned` = 一次勾选最多 4 请求
- 拖拽落点 `resolveDrop`（schedule.js:481/492）→ saveDay + PUT `/order` = 3 请求
- `moveBlockToDate`（schedule.js:542-543）→ 6 请求

### R3. 跨页面重复拉取 —— 中

- Dashboard（`/` 默认路由）DashboardView.vue:69 先 fetchDay(currentDate)；再进计划页又全量重拉同一天。
- `App.vue:44` 与 `AppSidebar.vue:142` 各自 `moodStore.fetchMoods()` → GET `/moods?year=当年` 重复 2 次。
- `CountdownPanel.vue:77` 每次进计划页 GET `/goals`（Dashboard 也拉一次）。
- `WeekStrip.vue:75` 每次进计划页 GET `/plans?limit=14`（14 天完整 blocks 仅用于画 7 个小圆环）。

### R4. 其他

- `ImportPlanModal.vue:32` 打开弹窗时 fetchDay(prevDate) 即使已缓存。
- 网络层 `api/client.js`：单 axios 实例、401 refresh 有单飞锁（没问题）；缺 GET 缓存/in-flight 去重/AbortController/写操作防抖。

## 二、重复渲染问题

### V1. getComputedTimeline 每次重建全部对象 —— 高

`schedule.js:568-619`：每次调用 sort + 逐块 `{ ...b, ... }` 展开成全新对象 → 任何变化后每个 TaskCard 的 `:block` prop 都是新引用 → 整列 N 张卡全部重渲染。且被多处重复调用：`FlowTimeline.vue:287`、每张 TaskCard 的 `otherPinned`（TaskCard.vue:114-118，**N 张卡 = N 次全量时间轴计算**）、`resolveDrop`、`setTimelineStart`。

### V2. 每分钟定时器连锁重建 —— 中

`FlowTimeline.vue:326` setInterval(updateNow, 60000) → rows 重算 → watch(rows)（FlowTimeline.vue:161）→ 每分钟 disconnect 并重建 IntersectionObserver、重新 observe 全部块（FlowTimeline.vue:138-159）。

### V3. 拖拽期间每帧全组件 patch + layout thrashing —— 高（移动端）

- `useDragSort.js:39-56 rowRects()` 每次 pointermove 对所有行 querySelectorAll + getBoundingClientRect（强制 layout），自动滚动 setInterval 32ms 内 scrollBy（写）+ updateDrag（再读）。
- `clonePos`/`indicator` 是 FlowTimeline 模板引用的 ref，每帧更新 → FlowTimeline 整体重渲染（含整个 v-for diff）。

### V4. 滚动变色全屏背景重绘 —— 中（移动端）

`FlowTimeline.vue:339 .flow-ambient` 是 position:fixed inset:0 全屏层，transition background（径向渐变，非合成属性），滚动时 IntersectionObserver 高频改 ambientColor → 整个视口逐帧重绘。

### V5. 常驻高耗能动画 —— 高（移动端）

- `App.vue:48-59` 3 个 `.ambient-orb` 无限动画，`atmosphere.css:12` 挂 `filter: blur(120px)` 的 500~600px fixed 元素，所有页面常驻，无移动端降级。
- 每张未完成卡片 `ctp-dot.pulsing`（TaskCard.vue:417-424）box-shadow 无限动画（不可合成），N 张卡 = N 个持续 repaint 源。

### V6. 其他 —— 低

- `xpToday`（FlowTimeline.vue:96-101）每次 transactions 变化全量 filter+reduce；`currency.js:55-66 recordTransaction` 只 unshift 不裁剪，`dp_ledger` localStorage 无限增长。
- `PlanView.vue:24` weekStripRef 声明未使用，WeekStrip 的 fetchPlans 无人调用（保存后周圆环不刷新，正确性问题）。

## 三、优先级建议

1. **高**：saveDay 防抖 + `_snapshotPreset` 内容比对（R2）；loadDate 缓存/去重/abort（R1）；orb 移动端降级（V5）；拖拽帧更新与 layout 读写优化（V3）。
2. **中**：getComputedTimeline memoize + otherPinned 上提（V1）；fetchMoods 去双调用（R3）；flow-ambient 改 opacity 过渡（V4）。
3. **低**：observer 重建条件化（V2）；ledger 裁剪（V6）；WeekStrip 刷新接线（V6）。
