# Bug 调研：AI 每日评价 保存/补档/自动生成（2026-08-16 explore 产出）

## 现状

**(a) 保存：存了，但读不出。**
`archiveDay`（`frontend/src/stores/archive.js:88-104`）把含 `aiReview` 的 review 双写 localStorage `dp_day_data_{date}` + `PUT /day-data/{date}`（服务端 `day_data.archive_data_json`，`server/db.py:1621-1648`）。**读回链路断裂**：
- `reviewData` 只被三处填充：`archiveDay`、`initFromCache`（archive.js:270-289，只从 localStorage 读、只读今天）、`deleteReview`
- 前端没有任何代码 `GET /day-data/{date}` 把 archiveData 灌回 `reviewData`（仅 archive.js:188 删除时、routines.js:124 存日课时 GET 过）；`fetchDay` 只拉 plan/order/earned
- 后果：刷新后翻历史日期 `reviewForDate` 永远 null → 显示"⚠️ 未存档"；换设备/清 LS 连今天的也读不出

**(b) 到点自动生成：不存在。**
`shouldPromptArchive`（archive.js:46-55）只是 DailyReview.vue:22,109 的"建议存档"徽章；存档时间 `archiveHour:archiveMinute` 存 localStorage `dp_prefs`（archive.js:254-268）；无任何调度器触发 archiveDay。

**(c) 补档：被 UI 硬禁。**
`DailyReview.vue:174` textarea `:disabled="isPast"`、:192 存档按钮行 `v-if="!isPast"` —— 过去日期永远填不了存不了补不了 AI 评价。

## 附带坑（必须一起修）

- `archive.js:103` 的 `PUT /day-data/{date}` 只发 `{archiveData: review}`，后端 `save_day_data` 是**全列覆盖式整写**（缺失字段写默认值）——存档会清掉服务端该日的 routines/routineProgress/timelineCfg！`routines.js:122-126` 用的是正确的"先 GET 合并再 PUT"，archive.js 没照做
- 后端有独立的 `archives` 表 + `GET/PUT /api/archive/{date}` + `GET /api/archives`（main.py:655-668），前端从未调用——两套存档体系并行，前端只用了 day-data 那套

## 修复方向

1. **读回**：archiveStore 加 `loadReview(date)`（GET /day-data/{date} → 填 reviewData），fetchDay 或 DailyReview watch currentDate 时调用
2. **自动生成**：定时器或 visibilitychange 检查 `now >= archiveTime && !isArchived(today)` → 自动 `archiveDay(today, { requestAi: true })` 并持久化
3. **补档**：放开 isPast 禁用，允许历史日期触发 AI 评价（`_requestAiReview` 已支持任意 date）
4. **写口径**：archive.js PUT 改 GET-合并-PUT；或迁移到闲置的 `/api/archive/{date}`（archives 表语义更干净，自带历史列表）——二选一，迁移更彻底
