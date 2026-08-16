# PRD: 任务卡美术重做（3D 光效 + 优先级绶带）

## 背景

计划页 TaskCard 美术升级。参考设计代码已提取到 `research/`（均 uiverse，MIT）：

- `ref-odd-fly.*`（Pravins01/odd-fly-66）：卡片悬停光效
- `ref-cowardly-eagle.*`（00Kubi/cowardly-eagle-56）：9 区鼠标追踪 3D 倾斜 + 眩光（card-glare）
- `ref-witty-deer.*`（kennyotsu/witty-deer-12）：25 区追踪 3D 倾斜卡
- `ref-massive-earwig.*`（mrhyddenn/massive-earwig-94）：角标绶带

## 需求

1. **3D 倾斜 + 眩光**：鼠标在卡片上移动时卡片轻微 3D 倾斜（参照 cowardly-eagle 的 tracker 分区方案或 JS pointermove 方案二选一，移动端无 hover 则自动跳过），眩光层跟随鼠标
2. **悬停光效**：参照 odd-fly 的卡片 hover 效果融入
3. **优先级绶带**：高/中/低优先级改为**左上角斜角绶带**（参照 massive-earwig 的角标方案），绶带颜色区分优先级（如 高=红/金、中=蓝、低=灰绿，具体色板融入现有主题变量），取代现有优先级展示方式
4. 保持现有交互不回归：翻面设置时间（星轨轮盘）、勾选完成、子任务、拖拽（useDragSort Pointer Events）、CardFlyIn/CardCelebration 联动

## 约束

- **移动端（触屏无 hover）**：3D 倾斜/眩光自动失效，卡片视觉静态完整；不得影响触屏长按拖拽（280ms 长按激活的既有逻辑）
- 倾斜/眩光只用 transform/opacity；3D 倾斜需要 `transform-style: preserve-3d` 时注意 Teleport 约束（fixed 浮层规则不变）
- 拖拽副本（clone）渲染 TaskCard 时不得卡死动画帧
- chrome80；reduced-motion 下倾斜/眩光关闭
- 性能：每卡常驻效果必须为合成属性；参照 08-16 计划页优化成果（不要引入每帧 layout 读写）

## 验收标准

1. 桌面端鼠标移动：卡片 3D 倾斜 + 眩光跟随，流畅无掉帧
2. 优先级高/中/低在左上角绶带清晰可辨，亮暗主题 + 9 套主题下都协调
3. 移动端：无 hover 效果残留，长按拖拽/翻面/勾选全部正常
4. 翻面（星轨轮盘）与 3D 倾斜不冲突（翻面时倾斜暂停）
5. `npm run build` 通过；e2e 不回归
