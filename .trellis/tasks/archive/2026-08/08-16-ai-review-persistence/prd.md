# PRD: AI 每日评价 —— 持久化读回 + 到点自动生成 + 历史补档

调研：`research/bug-investigation.md`（含现状证据与两个附带坑）。

## 需求

1. **读回持久化的 AI 评价**：刷新/换设备后，历史日期的存档（含 AI 评价）能从服务端读回展示。archiveStore 加 `loadReview(date)`（GET `/day-data/{date}`），在切日期/DailyReview 展示时调用
2. **到点自动生成**：当前时间过了用户设定的存档时间（`archiveHour:archiveMinute`）且今日未存档时，自动执行存档（含 AI 评价生成）并持久化；页面开着时用定时器/visibilitychange 检查，无需刷新
3. **历史补档**：放开 DailyReview 对过去日期的禁用（textarea `:disabled="isPast"`、按钮 `v-if="!isPast"`），允许为历史日期生成/补写存档与 AI 评价
4. **修复覆盖写坑**：`archive.js` 的 `PUT /day-data/{date}` 改为「先 GET 合并再 PUT」（照 `routines.js:122-126` 模式），存档不再清掉服务端该日的 routines/routineProgress/timelineCfg

## 设计决策（选定方案）

- 存储继续走 `day_data.archive_data_json`（不迁移到闲置的 archives 表，最小改动；archives 表留作未来）
- 自动生成仅在前端在线时触发（无服务端调度器）；若当天完全没打开网站，次日打开时检测到昨日未存档且已过存档点，提示用户一键补档（不强制后台补）

## 约束

- 自动生成的 AI 评价失败（AI 接口异常/未配置 key）时：存档仍保存（无 AI 文本），不阻塞、不弹错
- 同一天自动生成只触发一次（标记防重）
- 遵守 quality-guidelines；注意 schedule.js 已有的 fetchDay 缓存机制，loadReview 不要与之打架

## 验收标准

1. 手动存档（含 AI 评价）后刷新页面、换到历史日期，评价完整显示；清 localStorage 后仍能从服务端读回
2. 过了存档时间未存档：页面在线时自动存档并生成 AI 评价；次日打开时昨日未存档有补档入口
3. 历史日期可以手动补写总结 + 生成 AI 评价并保存
4. 存档后该日的 routines/timelineCfg 等服务端数据不被清空
5. `npm run build` 通过；e2e 不回归
