# Implement: 计划块自由拖拽 + 创意时间/日期设置

对应 `prd.md` / `design.md`。按序执行，每步后验证。

## 前置

- [ ] 读 `frontend/src/components/plan/FlowTimeline.vue`（拖拽现状 L277-310、模板 L388-420）
- [ ] 读 `frontend/src/stores/schedule.js`（applyOrder L393、getComputedTimeline L417）
- [ ] 读 `frontend/src/components/timeline/TaskCard.vue`（排版 + 编辑面板）、`frontend/src/views/PlanView.vue`（新建 modal L184-210）
- [ ] 读 `frontend/src/components/plan/CardCelebration.vue`（星尘粒子/塔罗配色复用参考）、`frontend/src/composables/useAnime.js`

## 步骤

1. **store 层**：`schedule.js` 新增 `resolveDrop(date, dragId, target)`、`moveBlockToDate(from,to,id)`；`applyOrder` 过滤钉时块 id。
   - 验证：node 层无单测设施 → 用 CDP 或浏览器手测，后续步骤统一验证。
2. **useDragSort composable**：Pointer Events 拖拽（阈值 6px、悬浮副本 Teleport body、插入指示线、边缘自动滚动、点击穿透保留）。
3. **FlowTimeline 接入**：移除 HTML5 DnD（draggable/dragstart 等），改用 useDragSort；落点动作调 `resolveDrop`；指示线 UI（↕ / 📌 两态）。
4. **StarDial.vue**：SVG 轮盘（小时圈→分钟圈两段选择、拖针、5min 吸附、确认粒子、钉住/转流动按钮）。
5. **StarStrip.vue**：24h 拖杆 + 钉时区间星座标记 + 磁吸避让。
6. **StarDateBar.vue**：惯性日条 + 月相装饰 + 今天发光。
7. **TaskCard 排版 + 翻面**：时间主标题排版；点击时间区域翻面内嵌 StarDial + StarStrip + 「转为流动」；编辑面板替换原生控件并接入 StarDateBar（换日期调 `moveBlockToDate`）。
8. **PlanView 新建 modal**：`type="time"` → StarDial；加 StarDateBar 选日期（handleAdd 支持落到非当前日）。
9. **构建与本地验证**：`cd frontend && npm run build`；CDP（headless Chrome via 127.0.0.1 反代）桌面 @1440 + 移动触摸模拟 @390 验证 A1–A6。
10. **部署生产**：paramiko SFTP 上传改动文件 → `sudo docker compose up -d --build app` → 线上复验 A1/A2/A3 抽项（游客账号）。

## 验证命令

- `cd frontend && npm run build`
- CDP 脚本参考此前 session 做法（scripts/ 下无现成，临时写到 /tmp，不入库）
- 生产：`curl -s -o /dev/null -w '%{http_code}' http://49.235.147.177/` 及各 API 冒烟

## 回滚点

- 步骤 1–2 独立可回退；步骤 3 接入前 FlowTimeline 保持可运行。
- 全部改动为前端 + store，无 DB 变更。

## 注意事项

- fixed 元素一律 Teleport body（悬浮副本）。
- 禁 color-mix / 现代媒体区间语法（vite cssTarget chrome80 会兜底，但源码也不要写）。
- 整卡点击切换完成不可回归：拖拽阈值内指针抬起必须放行 click。
- 粒子 DOM 用后清理，避免泄漏。
