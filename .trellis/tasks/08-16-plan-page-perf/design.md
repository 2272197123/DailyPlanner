# 技术设计: 计划页移动端性能优化

## 总体原则

纯前端优化，不改后端接口、不改视觉与交互语义。所有改动集中在 `frontend/src`：stores（schedule/routines/mood）、PlanView/FlowTimeline/TaskCard/App、useDragSort。

## 1. 请求治理（stores 层）

### saveDay 防抖
- `schedule.js` 增加 per-date 防抖定时器 Map：`saveDay(date, { immediate })` 默认延迟 ~400ms 合并；内部仍即时更新 `this.schedules[date]`（UI 零延迟），仅网络 PUT 合并。
- flush 时机：定时器到期、显式 `flushSave(date)`（路由切走 beforeRouteLeave / `visibilitychange` hidden 时 flush 全部）。
- `_snapshotPreset`：比对上次已提交快照（内存里存 JSON 串），相同则跳过 PUT `/plan-preset`。
- `applyOrder`/`_persistOrderCfg` 同样可并入防抖，但与 saveDay 独立（不同接口），先只做 saveDay+preset，order PUT 量小可保留即时。
- 风险：防抖窗口内关页丢数据 → flush 钩子必须覆盖；`sendBeacon` 不适用（需鉴权 header 与否待实现时确认，若 axios 依赖 token 则用 visibilitychange 同步 flush fetch）。

### fetchDay 缓存 + in-flight 去重 + 过期守卫
- store 内 `dayFetchedAt: { [date]: ts }`，TTL ~30s 内且有缓存则 `fetchDay` 直接返回缓存；`saveDay` 成功/本地 mutation 时刷新该 ts（本地即最新）。
- `inFlight: Map<date, Promise>`，同 date 并发请求复用同一 Promise。
- `PlanView.loadDate` 加序号守卫：`const seq = ++loadSeq`，异步链完成后若 `seq !== loadSeq` 则丢弃结果（比 AbortController 简单且足够）。
- `fetchPresetAndRules`/`fetchRoutines`：加 `loaded` 标记，已加载直接 return。
- `fetchMoods`：mood store 加 `loadedYears` 记录或直接删 App.vue 里的重复调用（保留 AppSidebar 一处，或反之——以实现时两处用途为准，谁需要数据谁拉，另一处依赖 store 已有数据）。

## 2. 渲染治理

### getComputedTimeline memoize
- 计算结果缓存 `computedCache: { [date]: { blocksRef, orderRef, result } }`：以 `schedules[date]` 与 `orderCfg[date]` 的引用为依赖，引用不变直接返回旧 result（Pinia 中 mutation 产生新数组引用即可自然失效）。
- 返回值中尽量保留原 block 对象引用（附加字段如 `_startMin` 改为外部 Map 或挂在 result 的并行结构），避免 TaskCard prop 身份全变。若工程上太绕，可接受对象重建但保证 memoize 后同输入同引用——`timedRows` 不变则不重渲染。
- `TaskCard.otherPinned`（TaskCard.vue:114-118）上提：FlowTimeline 用 memoized timeline 算一次 pinned 列表，prop 下发。

### 拖拽帧优化（useDragSort.js）
- `rowRects()` 在 dragstart 时缓存一次；仅在自动滚动触发后标记 dirty、下一帧重取。
- `clonePos`/`indicator` 从 FlowTimeline 模板 ref 改为：拖拽副本/指示线元素用 `ref` 拿到 DOM 后直接 `el.style.transform = ...` 更新（Teleport 已在 body，元素静态挂载），不再走响应式 → FlowTimeline 不参与每帧 patch。
- 自动滚动 setInterval 内避免「写 scrollBy 后立即读 rect」：滚动后置 dirty，下一 pointermove 帧先重取再判定。

### ambient-orb 降级（App.vue + atmosphere.css）
- ≤768px（legacy 语法媒体查询）下 `.ambient-orb` `display: none`（或静态渐变无动画）；`prefers-reduced-motion` 同样停用。桌面端完全不变。

### 脉冲点（TaskCard.vue:417-424）
- `ctp-dot.pulsing` 的 box-shadow 动画改为 `transform: scale` + `opacity` 呼吸（视觉效果近似即可，不允许变成"不一样的设计"——保持同节奏同观感）。

## 3. 数据一致性契约

- 本地 mutation 先行、网络防抖随后：任何 UI 读取都走 store 内存态，防抖只影响持久化时机。
- 其他页面改同日数据 → 回计划页：TTL 30s 内复用缓存可接受（原行为也是各页面各自拉取，无实时同步）；saveDay 成功后本地 ts 刷新保证自己写的不会回滚。
- flush 失败处理：防抖 PUT 失败沿用现有错误处理（静默 + localStorage 兜底），不引入新交互。

## 兼容与回滚

- 全部改动在前端单仓内，逐文件可分步回滚；无数据库/接口变更。
- 验证方式：本地 `npm run dev` + CDP 模拟移动端观察 Network/Performance；`npm run build` 验证 chrome80 目标通过。
