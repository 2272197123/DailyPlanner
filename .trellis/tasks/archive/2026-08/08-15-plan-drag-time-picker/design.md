# Design: 计划块自由拖拽 + 创意时间/日期设置

对应 PRD：`./prd.md`。涉及文件：

- `frontend/src/components/plan/FlowTimeline.vue` — 拖拽重写、块排版
- `frontend/src/components/timeline/TaskCard.vue` — 排版、编辑面板接入轮盘/拖杆/日条
- `frontend/src/views/PlanView.vue` — 新建 modal 接入新组件
- `frontend/src/stores/schedule.js` — 拖拽落点动作（重排 / 钉住 / 改时 / 跨日移动）
- 新增 `frontend/src/components/plan/StarDial.vue`（星轨轮盘）、`StarStrip.vue`（星图拖杆）、`StarDateBar.vue`（星历横条）、`composables/useDragSort.js`（指针拖拽）

## 1. 拖拽架构（useDragSort composable）

Pointer Events 统一鼠标/触屏。核心状态机：

```
pointerdown on .flow-row (kind=block)
  → 记录起点、blockId；不 preventDefault（保留点击）
pointermove: 位移 > 6px → 进入拖拽态
  → setPointerCapture；创建悬浮副本（fixed 定位 clone，Teleport body，半透明+发光）
  → 每帧根据 pointerY 找落点：遍历行元素的 getBoundingClientRect 中线
  → 显示插入指示线（在目标行上沿/下沿渲染一条发光线 + 动作图标）
  → 距视口上下边缘 < 64px 时 window.scrollBy 自动滚动
pointerup: 无拖拽 → 放行点击（整卡切换）；有拖拽 → 计算动作并提交 store
pointercancel: 清理
```

要点：

- 拖拽源行加 `.dragging`（半透明占位），**不从 DOM 移除**，避免布局跳动。
- 触屏需 `touch-action: pan-y`（允许非拖拽时正常滚动）；进入拖拽态后 `touch-action: none`。旧内核不支持 `touch-action` 时退化为：进入拖拽态后 `preventDefault` touchmove（passive:false 监听）。
- 长列表每帧遍历 rect 可接受（一天块数 <50）；拖拽开始时缓存行 rect，自动滚动后失效重取。
- 行列表包含 routine 行与 now 哨兵行：落点计算只落在 block 行之间的间隙；拖到 routine/now 行附近时映射到最近的 block 间隙。

## 2. 落点动作解析（store 层新增 `resolveDrop(date, dragId, target)`）

`target` = `{ beforeId }`（插入到某 block 之前；null = 末尾）或 `{ onId }`（直接落在某块上）。

```
dragged 为流动块:
  onId 是钉时块        → 钉住: time = 该钉时块 start；若与其他钉时块重叠 → 顺延到最后重叠块 end；5min 取整
  onId 是流动块/beforeId → 重排: orderCfg.order 中移动位置（order 只含流动块 id，钉时块 id 不写入）
dragged 为钉时块:
  beforeId/onId → 新 time = 落点映射时间:
    onId 是块 → 该块 _startMin
    间隙 → 前后相邻块 _startMin 中点（无前块用 timelineStart，无后块用前块 _endMin）
    与其他钉时块重叠 → 顺延到其后；5min 取整；block.time 更新，saveDay 持久化
```

`orderCfg.order` 语义收窄为「流动块顺序」：`applyOrder` 过滤只留流动块 id；`getComputedTimeline` 排序时钉时块不受 order 影响（现状已是）。注意既有数据 order 里可能含钉时块 id——过滤即可兼容。

落点指示 UI：间隙插入 → 发光线 + ↕；落在钉时块上 → 目标块金色描边 + 📌。

## 3. StarDial 星轨轮盘

- 组件契约：`v-model="timeStr"`（'HH:MM' 或 ''），`emit('pin' | 'unpin' | 'confirm')`。
- 视觉：SVG 圆盘，深靛底 + 金色双环（复用 CardCelebration 卡背配色 token），内圈 12 个小时刻度（用 ✦ 与数字交替），外圈 60 分钟刻度；一根指针（小时针短粗、分钟针细长，或单针双圈切换模式：先选小时再选分钟，选中后自动切圈）。
- 交互：Pointer Events 拖针，角度→时间映射，5min 吸附（吸附瞬间微小 scale 脉冲）；中心显示当前时间数字（等宽字体）；确认时星尘粒子（复用 `useAnime().burst` 或 ✦ span 粒子，参考 CardCelebration starShower）。
- 翻面入口：TaskCard 点击时间区域 → 卡片容器 `rotateY` 翻面（CSS 3D，backface-visibility），背面放 StarDial + 「钉住时间 / 转为流动 / 完成」按钮。翻面板在卡片原位进行，不用 modal。
- 新建 modal 中不放翻面，直接内嵌 StarDial（modal 面板内）。

## 4. StarStrip 星图拖杆

- `v-model="timeStr"` + prop `pinned: [{start,end}]`（当日钉时块区间）。
- 24h 横条（SVG/div），钉时区间渲染为星座色块，手柄可拖；拖入钉时区间时磁吸到最近边界；松手粒子。
- 放在编辑面板轮盘下方，二者绑同一值，天然同步。
- 横条小时刻度每 3h 一个星符；移动端可横向捏合不需要——直接拖手柄即可。

## 5. StarDateBar 星历横条

- props: `modelValue`（dateStr）；范围：当前月 ±1 月（约 90 格）。
- 横向滚动容器（`overflow-x: auto` + 惯性由浏览器提供；桌面追加拖拽滚动）；每格：星期字符 + 日期数字 + 星座符号（按日期哈希取 ♈…♓ 之一装饰）；今天格发光环；选中格金色描边。
- 头部：月份名 + 月相 SVG 装饰（按当月 15 日月相简化为 8 态之一，纯装饰）。
- 编辑已有块换日期 → store 新增 `moveBlockToDate(fromDate, toDate, blockId)`：两边 `saveDay`；目标日 `orderCfg` 追加。
- 新建 modal 用同一组件选择任务落在哪一天（默认当前查看日）。

## 6. 块排版

TaskCard 主体改为：

```
┌─────────────────────────┐
│ 09:00–10:30      ✦(cat) │  ← 时间：--font-mono, text-xl, font-weight 700, accent 色
│ 任务名称（粗体, text-lg） │
│ 标签/备注/计时器…        │
└─────────────────────────┘
```

- 流动块显示推算时间（`_startStr–_endStr`），钉时块加 📌 小角标。
- 点击时间区域 → 翻面进 StarDial；点击卡片其余区域 → 切换完成（现状保持）。

## 7. store 变更汇总（schedule.js）

- `resolveDrop(date, dragId, target)` — 见 §2（内部调 `updateBlock`/`applyOrder`/`saveDay`）。
- `moveBlockToDate(fromDate, toDate, blockId)`。
- `applyOrder` 过滤钉时块 id。
- `getComputedTimeline` 逻辑不变（钉时按时间、流动按 order 顺排跳过钉时）。

## 8. 兼容性约束

- 禁用 color-mix / `:has` / 现代媒体区间语法；颜色透明度用 hex-alpha 变量（参照 MoodToday 既有模式）。
- 粒子元素用绝对定位 span + anime.js（既有依赖），结束自动清理 DOM。
- 翻面 3D 需要 `transform-style: preserve-3d`——老内核支持；外层不得有 backdrop-filter（Session 8 教训，fixed 元素 Teleport body）。
- 悬浮拖拽副本是 fixed 元素 → Teleport body。

## 9. 回滚

全部前端改动 + store 增量，无后端接口变更；回滚 = git checkout 相关文件（用户自行管理 git）。
