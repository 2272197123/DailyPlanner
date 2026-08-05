# XP/主题系统统一 — 円→XP全量迁移+WAFER_SKINS清理+主题扩展

## Goal

完成晶圆/円 → XP 的术语和底层数据彻底迁移，清理所有旧常量残留，确保新旧前端一致使用 XP 系统。

## Requirements

### R1：术语全量迁移
- R1.1：所有用户可见文本「円」「晶圆」→「XP」
- R1.2：CSS class `wafer-reward` → `xp-reward`
- R1.3：后端 API 注释/日志中的旧术语清理

### R2：字段重命名
- R2.1：routine.wafers → routine.xpReward（兼容读取旧字段）
- R2.2：旧 routine 数据迁移时自动转换

### R3：WAFER_SKINS 残留清理
- R3.1：移除 `WAFER_SKINS` 对象引用
- R3.2：日课行显示 💎 → XP 数值（来自 WAFER_VALUE * ROUTINE_REWARD）

### R4：主题系统保留
- R4.1：8 套主题全部可用且切换正常
- R4.2：主题预览功能正常
- R4.3：用户自定义 CSS 变量入口保留

## Acceptance Criteria

- [ ] AC1：全局搜索「円」和「晶圆」→ 仅注释/文档中出现，代码中不再有运行时可观察的显示
- [ ] AC2：完成任务 → XP 正常增加，无 NaN
- [ ] AC3：切换 8 套主题 → 全部生效
- [ ] AC4：`WAFER_SKINS` 引用值为对象时不会崩溃（不访问 .icon）
