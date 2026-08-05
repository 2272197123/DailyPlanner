# 存档系统 — 实施计划

## Phase 1：数据层（archive.js 重写）

- [ ] 1.1 新增 `initDailyData(date)` — 首次访问日期时从模板Copy所有数据
- [ ] 1.2 新增 `loadDailyData(date)` — 从 `dp_day_data_{date}` 加载当日数据
- [ ] 1.3 新增 `saveDailyData(date)` — 当日数据即时持久化
- [ ] 1.4 新增 `migrateLegacyDayData(date)` — 旧格式自动迁移
- [ ] 1.5 修改所有写操作（toggles.js / schedule.js / routines.js）的目标为 `dp_day_data_{date}`
- [ ] 1.6 修改 `store.schedules[date]` 的读源为 `dp_day_data_{date}`

## Phase 2：存档流程

- [ ] 2.1 新增存档时间配置（`dp_prefs.archiveHour/Minute`，默认 23:30）
- [ ] 2.2 重构 `archiveDay(date)` — 写入 `dp_day_data_{date}.archiveData`
- [ ] 2.3 新增存档自评面板 UI（打分 + 文字输入）
- [ ] 2.4 新增 AI 评价请求函数 `requestAiReview(date)`
- [ ] 2.5 新增 AI 人设 prompt 存储（`dp_prefs.aiPersonaPrompt`）
- [ ] 2.6 修改 `isDateLocked` / `isDateArchived` 逻辑

## Phase 3：导出

- [ ] 3.1 实现 `exportToMarkdown(date)` — md 格式导出
- [ ] 3.2 实现 `exportToPDF(date)` — pdf 格式导出（基于 md 转换）
- [ ] 3.3 导出内容：自评 + AI评价 + 任务明细 + 统计

## Phase 4：历史日期查看

- [ ] 4.1 重写 `viewArchive(date)` — 从 `dp_day_data_{date}` 读取
- [ ] 4.2 存档详情页展示自评 + AI评价 + 统计
- [ ] 4.3 未存档历史日期显示警告 + 手动存档按钮

## Phase 5：日课模板

- [ ] 5.1 新增 `pushRoutinesToTemplate(date)` — 当日改动推送到全局预设
- [ ] 5.2 推送时有确认提示，说明仅影响未来日期
- [ ] 5.3 覆盖 routines.js 中直接修改 `store.routines` 的路径，改为修改当日副本

## Phase 6：清理

- [ ] 6.1 移除废弃的键引用（`dp_schedules` / `dp_routineProgress` 等的直接渲染路径）
- [ ] 6.2 旧 `dp_archive_{date}` 历史数据保留，新增存档走新路径
- [ ] 6.3 全量测试：今天编辑 → 存档 → 切换日期 → 返回 → 验证数据完整性

## 验证命令

```bash
# 启动应用进行手动测试
cd study_planner && python launcher.py
# 测试项：
# 1. 创建今天的任务 → 存档 → 导航回今天 → 确认只读
# 2. 修改今天的日课 → 切换到明天 → 确认日课使用模板默认值
# 3. 切换到昨天 → 修改日课 → 确认不影响模板
```
