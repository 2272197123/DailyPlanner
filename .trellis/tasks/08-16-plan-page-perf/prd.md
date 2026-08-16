# PRD: 计划页移动端性能优化（重复请求与渲染治理）

## 背景

用户反馈手机浏览器打开「计划页面」卡顿。调研（`research/plan-page-perf-investigation.md`）确认存在两类系统性问题：

- **重复请求**：每次切日期固定 7~11 个请求且无缓存/去重/abort；saveDay 无防抖，一次勾选最多 4 个请求、一次拖拽 3 个、跨日移动 6 个；跨页面重复拉取（Dashboard 与计划页重复 fetchDay 同一天、fetchMoods 双调用等）
- **重复渲染**：`getComputedTimeline` 每次调用全量重建对象导致整列 TaskCard 重渲染且被调用 N+ 次；拖拽期间每帧全组件 patch + layout thrashing；常驻大面积 blur 动画（ambient-orb）和 box-shadow 脉冲动画在移动端无降级

## 目标

不改变任何视觉设计与交互语义的前提下，消除重复请求与无效渲染，改善移动端（≤768px）计划页流畅度。

## 范围（按优先级）

### 必做（高）

1. **saveDay 防抖 + 预设快照比对**（R2）：`schedule.js saveDay` 按 date 做 ~300-500ms 防抖合并；`_snapshotPreset` 先比对内容，无变化不 PUT `/plan-preset`
2. **loadDate 缓存与去重**（R1）：
   - `fetchPresetAndRules`/`fetchRoutines` 已加载则跳过（日期无关的全局数据）
   - `fetchDay` 对已缓存日期直接复用（可带短 TTL 或显式刷新入口），in-flight 相同 date 去重
   - 快速切日期时取消/忽略过期响应（AbortController 或序号守卫）
3. **ambient-orb 移动端降级**（V5）：`App.vue` 3 个 blur(120px) 常驻动画球在 ≤768px 隐藏或静态化；`prefers-reduced-motion` 同样关闭
4. **拖拽帧优化**（V3）：`useDragSort.js` rowRects 拖拽开始时缓存、滚动后失效重取，避免每帧强制 layout；拖拽副本/指示线位置更新不触发 FlowTimeline 整树重渲染（直接 DOM style 或局部状态隔离）

### 应做（中）

5. **getComputedTimeline 治理**（V1）：按 date memoize（依赖 schedules+orderCfg），避免重复全量计算；`TaskCard.otherPinned` 上提到 FlowTimeline 算一次 prop 下发
6. **fetchMoods 去重**（R3）：App.vue 与 AppSidebar 双调用合并为一次
7. **脉冲点动画改合成属性**（V5）：`ctp-dot.pulsing` box-shadow 动画改 transform/opacity

### 可选（低，时间允许再做）

8. `flow-ambient` 滚动变色改双图层 opacity 交叉淡化（V4）
9. `dp_ledger` localStorage 裁剪上限（V6）
10. observer 每分钟重建条件化（V2）；WeekStrip 保存后刷新接线（V6 正确性）

## 约束

- **不得改变任何视觉设计与交互行为**（用户明确要求"保持设计不变"的历史约束同样适用）
- 遵守 `.trellis/spec/backend/quality-guidelines.md` Vue3 前端约束（chrome80、Teleport、移动端禁常驻 backdrop-filter、rAF 元素不挂 filter）
- 防抖不得导致数据丢失：页面卸载/切换路由前需 flush 待发的 saveDay
- 缓存不得造成脏数据：其他页面修改了同日数据后回计划页应能看到最新（可用 TTL/失效策略，最简方案：saveDay 成功后视为最新，切走再切回短 TTL 内复用）

## 验收标准

1. 计划页切日期（已访问过的日期）不再重复全量请求；preset/rules/routines 会话内只拉一次
2. 连续勾选 3 个任务只产生 ≤1 次 PUT /plan（防抖合并），数据最终一致且刷新后正确
3. 快速连点 ←/→ 切日期无请求堆积、无过期响应覆盖新数据
4. 移动端（≤768px）不再存在常驻 blur 动画元素；拖拽时间轴无整列卡片闪烁重渲染
5. 桌面端视觉与动画与改动前完全一致；`npm run build` 通过
