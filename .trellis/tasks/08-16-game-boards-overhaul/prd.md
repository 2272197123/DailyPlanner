# PRD（父任务）: 游戏化改造与板块调整

## 源需求（用户原话要点）

1. 取消已完成计划时经验不退还（bug）
2. 删除记账板块，替换为「恰饭」板块：输入预算 → 老虎机抽取菜品（中晚餐），抽取后自动在计划里创建钉时任务（午饭默认 12:00-13:00，晚饭 18:00-19:00，时间可改）；食物卡片翻面设计（正面图片/反面描述+名称+预算，参照 uiverse tricky-robin-67）；像素风食物缩略图（用户用 kimiwork 生成，我方提供提示词）
3. 每日任务星轨轮盘分针异常（bug）
4. 任务卡美术重做：光效与交互参照 uiverse odd-fly-66 / cowardly-eagle-56 / witty-deer-12；优先级高中低用左上角绶带（参照 massive-earwig-94）
5. 成就系统 + 每日签到系统 + 卡牌收集：完成任务随机掉卡（SSR 金/SR 紫/R 蓝/N 白），4 个系列（塔罗星象/美食图鉴/精灵宠物/四季节气），每张卡内置隐藏面值（按稀有度范围随机，不显眼展示，为将来商城系统预留）；新增成就和收集页面
6. AI 每日评价：过了存档时间未手动生成则自动生成并保存；修复无法保存/无法补档

## 子任务地图

| 子任务 | 交付物 | 类型 |
|---|---|---|
| `08-16-fix-xp-refund-stardial` | bug 1 + bug 3 修复 | 轻量 |
| `08-16-ai-review-persistence` | AI 评价持久化读回 + 到点自动生成 + 历史补档 + day-data 覆盖写修复 | 中 |
| `08-16-chifan-board` | 恰饭板块（后端菜品库/抽取接口 + 老虎机 UI + 翻面食物卡 + 钉时任务联动 + 菜品管理 + 移除记账入口） | 复杂 |
| `08-16-task-card-art-redesign` | TaskCard 美术重做（3D 倾斜眩光/悬停光效/优先级绶带） | 中 |
| `08-16-card-collection-system` | 卡牌定义/掉落/签到/成就/收集页（前后端） | 复杂 |

## 跨子任务验收

- 恰饭「抽取后建钉时任务」与任务卡美术重做都改 TaskCard/计划页 —— 恰饭建的钉时卡必须自动获得新美术样式与优先级绶带
- 卡牌收集的「完成任务掉卡」与 bug1 的退 XP 都挂在 toggleBlockDone 链路 —— 取消完成时不退卡（卡牌一旦获得不回收，与 XP 口径不同，避免收集反复横跳），但 XP 退还逻辑不能误伤掉卡记录
- 全部改动遵守 quality-guidelines（chrome80/Teleport/移动端 perf/动画合成属性/reduced-motion）
- 最终 `npm run build` 全绿 + `python scripts/e2e_full_test.py` 不回归

## 依赖顺序（写在子任务里，树位置不代表依赖）

- fix-xp-refund-stardial、ai-review-persistence 相互独立，可先做
- task-card-art-redesign 应在 card-collection-system 之前（收集页复用卡面视觉语言）
- chifan-board 独立，但建钉时任务需遵循 orderCfg v2 钉时铁律
