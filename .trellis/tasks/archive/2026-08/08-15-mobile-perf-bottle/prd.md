# PRD: 移动端性能优化（保持设计不变）+ 许愿瓶重绘

## 背景

用户反馈：手机页面卡顿明显（前端渲染负担过重）；许愿瓶画得丑。

## 需求

### R1 移动端性能优化（视觉设计保持不变）

已知开销点（按收益排序）：

1. **backdrop-filter blur**（AppSidebar 20px / AppHeader 12px / animations.css / components.css）——老内核移动 GPU 上每次滚动全屏重绘。移动端（≤768px 或 coarse pointer）降级：去掉 blur、提高背景不透明度保持可读性与观感接近。
2. **StarPendant 每帧 filter**——`drop-shadow` 挂在旋转元素上，rAF 每帧触发滤镜重渲染。改为：光晕移到不旋转的伪元素/SVG 静态层，旋转只动 transform（合成器）；页面隐藏时停 rAF（visibilitychange）。
3. **环境星尘 24 个 fixed 无限动画 span**（MoodView）——移动端减到 ≤8 个；页面隐藏时 `animation-play-state: paused`；仅当日 tab 挂载（切走即销毁）。
4. **许愿瓶每层无限波浪 + 每 2 个气泡**——移动端：只最上层液面流动、每层气泡减到 1 个；mini 瓶已无动画（保持）。
5. **FlowTimeline 滚动变色**——检查背景 transition 是否每帧触发大面积重绘；必要时移动端缩短/取消过渡动画但保留变色结果。
6. 通用：`will-change` 只留在真正动画中的元素；粒子/动画在 `document.hidden` 时暂停。

约束：桌面端视觉与体验完全不变；移动端仅允许「看不出差别」级别的实现替换（blur→实色、粒子数量、动画精简）。

### R2 许愿瓶重绘（精致玻璃药水瓶）

- 保持组件接口（props vents/mini、emit、倒入/消散动画、viewBox 200×280、LIQUID 几何常量与 clipPath 机制）不变，只换视觉：
  - 圆润瓶身 + 细颈 + 软木塞（锥形 + 纹理线）+ 颈部麻绳蝴蝶结
  - 玻璃：径向渐变淡填充 + 双弧线高光 + 细描边；瓶身塔罗 ✦ 刻印（低透明）
  - 液层：垂直线性渐变（顶浅下深）+ 液面泡沫亮线；气泡保留
- MoodWeek 的 mini 瓶、MoodView 大瓶、MoodPicker 内引用同步受益，不改调用方。

## 验收标准

- A1：桌面端截图级无视觉回归（抽查计划页/心情页/侧栏）。
- A2：移动端（CDP 390px + 触摸模拟）无横向溢出；星尘 ≤8；pendant 隐藏 tab 停 rAF；侧栏/头部无 backdrop-filter。
- A3：瓶子新画法在大瓶/mini 瓶/倒入动画下均正常，接口未变。
- A4：`npm run build` 通过；chrome80 约束不破；`e2e_full_test.py` 不回归（本轮纯前端）。
- A5：部署生产后线上抽查。

## 非目标

- 不重做信息架构/交互；不动后端；不删功能。
