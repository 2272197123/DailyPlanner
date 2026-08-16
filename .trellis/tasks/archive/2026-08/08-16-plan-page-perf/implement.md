# 实施计划: 计划页移动端性能优化

执行顺序按「请求层 → 渲染层 → 动画层」，每步独立可验证。验证基线：本地 dev + CDP（设备模拟 768px 以下）观察 Network 请求数；`npm run build` 全绿。

## Step 1: store 请求治理（R1/R2/R3）

- [ ] 1.1 `stores/schedule.js`：saveDay per-date 防抖（~400ms）+ `_snapshotPreset` 内容比对跳过
- [ ] 1.2 `stores/schedule.js`：flushSave/flushAll（定时器到期、visibilitychange hidden）
- [ ] 1.3 `stores/schedule.js`：fetchDay TTL 缓存（30s）+ inFlight Map 去重 + mutation 后刷新 ts
- [ ] 1.4 `stores/schedule.js` + `stores/routines.js`：fetchPresetAndRules / fetchRoutines loaded 标记
- [ ] 1.5 `stores/mood.js`（或 App/AppSidebar）：fetchMoods 去掉双调用
- [ ] 1.6 `views/PlanView.vue`：loadDate 序号守卫，过期响应丢弃
- 验证：CDP Network 面板 —— 进计划页首屏请求数、切回已看日期 0 新请求、连勾 3 任务 ≤1 个 PUT /plan、快速切日期无堆积

## Step 2: 渲染治理（V1）

- [ ] 2.1 `stores/schedule.js`：getComputedTimeline memoize（引用依赖失效）
- [ ] 2.2 `FlowTimeline.vue` + `TaskCard.vue`：otherPinned 上提为 prop
- 验证：勾选单个任务时 Vue devtools / Performance 中仅该卡重渲染（不再整列 patch）

## Step 3: 拖拽帧优化（V3）

- [ ] 3.1 `composables/useDragSort.js`：rowRects dragstart 缓存 + 滚动后 dirty 重取
- [ ] 3.2 `FlowTimeline.vue`：clonePos/indicator 改直接 DOM style 更新，脱离响应式
- 验证：CDP Performance 录制拖拽过程，无每帧 Layout/Paint 风暴；触屏长按拖拽+自动滚动正常

## Step 4: 动画降级（V5）

- [ ] 4.1 `App.vue` / `atmosphere.css`：ambient-orb 移动端隐藏 + reduced-motion 停用
- [ ] 4.2 `TaskCard.vue`：ctp-dot.pulsing 改 transform/opacity
- 验证：≤768px 无常驻 blur 元素；桌面端视觉逐像素一致

## Step 5（可选，时间允许）

- [ ] 5.1 flow-ambient 双图层 opacity 过渡（V4）
- [ ] 5.2 dp_ledger 裁剪（V6）
- [ ] 5.3 observer 重建条件化（V2）/ WeekStrip 刷新接线（V6）

## 回归检查（每步后）

- [ ] 计划页全功能手测：新建/勾选/子任务/拖拽/钉时/跨日移动/导入前一天/周期规则
- [ ] `npm run build` 通过（chrome80 目标）
- [ ] 桌面端视觉对比无差异
