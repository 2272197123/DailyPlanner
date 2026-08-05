# DailyPlan 核心功能重构

## Goal

修复当前项目的核心架构缺陷（数据隔离、AI 交互、任务卡片编辑、货币系统、记账、计时器、UI），将 Demo 级产品升级为可日常使用的自律工具。

## 子任务索引

| # | 任务 | 关键交付 |
|---|------|---------|
| 1 | [存档系统重写](08-05-archive-rewrite/prd.md) | 模板-副本分离、每日快照、自评+AI评价、md/pdf导出 |
| 2 | [AI 交互流程重写](08-05-ai-interaction-overhaul/prd.md) | 集中式对话面板、多轮讨论、可编辑预览、动态顺延 |
| 3 | [任务卡片UI重设计](08-05-task-card-redesign/prd.md) | 统一卡片渲染、始终可编辑、子任务划掉 |
| 4 | [货币系统重设计](08-05-currency-redesign/prd.md) | 晶圆→XP、与任务解耦、主题保留扩展 |
| 5 | [记账模块重写](08-05-accounting-rewrite/prd.md) | 时间段筛选、饼图、条形图 |
| 6 | [计时器UI优化](08-05-timer-ui-optimization/prd.md) | 内嵌卡片、脉冲指示、快捷键 |
| 7 | [固定日课数据隔离修复](08-05-routines-isolation-fix/prd.md) | 每日独立副本、推送到模板 |
| 8 | [整体UI现代化](08-05-ui-modernization/prd.md) | 时间三态、翻页动画、弹窗规范、输入优化 |

## 跨模块约束

- **无硬编码**：所有模块不使用旧项目的具体示例数据作为默认值；所有 prompt 模板使用参数化描述
- **设计系统**：`--accent: #1e2030`、Noto Serif SC + JetBrains Mono、氛围元素不可移除
- **数据流**：store → LS → Server，写操作 LS 先落盘再异步同步
- **JS 规范**：只用 `var` 和 `function`，不引入 `const`/`let`/箭头函数/模板字符串

## Dependencies

- 子任务 1（存档系统）和 7（日课隔离）共享数据模型（模板-副本分离），应协同实现
- 子任务 2（AI）和 3（任务卡片）的编辑逻辑相互依赖
- 子任务 8（整体UI）应在其他模块完成后统一收束
- 子任务 4（货币）和 6（计时器）相对独立，可并行
