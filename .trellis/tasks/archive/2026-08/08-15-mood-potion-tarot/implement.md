# Implement: 心情页塔罗化（药剂瓶 + 混合色 + 近期视图 + 动效）

对应 `prd.md` / `design.md`。依赖：无（与子任务 1 独立，但排在它之后做）。

## 前置阅读

- [ ] `server/db.py`（三套 _init_schema：SQLite ~L143-330 / MySQL ~L430-600 / PG ~L749+；moods 函数 L1194-1252；%s/NOW 翻译 L109-117）
- [ ] `server/main.py`（mood 端点 L462-490，MoodEntry 模型）
- [ ] `scripts/init_mysql.sql`（moods 表 L58-68）
- [ ] `frontend/src/stores/mood.js`、`frontend/src/views/MoodView.vue`
- [ ] `frontend/src/components/mood/`（MoodToday/MoodGrid/MoodCell/MoodPicker/MoodVentInput）
- [ ] `frontend/src/components/plan/CardCelebration.vue`（粒子与塔罗配色参考）、`frontend/src/composables/useAnime.js`
- [ ] `frontend/src/AppSidebar.vue`（迷你心情格子数据源）

## 步骤

1. **DB 层**：三处 `_init_schema` + `scripts/init_mysql.sql` 加 `mood_vents`；db.py 加 vents CRUD + `_blend_colors` + `_refresh_day_color`；`save_mood` 有 vents 时忽略 color；`get_mood`/`list_moods` 附 vents。
   - 验证：本地 SQLite 起服务，curl POST/DELETE/GET 冒烟（注册游客 → 加 2 条 vent → 查 color 是否混合 → 删 1 条 → 查）。
2. **API 层**：`POST /api/mood/{date}/vents`、`DELETE /api/mood/vents/{vent_id}`，参数校验（date 格式、color hex、text 非空 ≤500）。
   - 验证：非法 color 422；删他人 id 404/deleted=false。
3. **utils/color.js + mood store**：mixColors/hexToRgb/rgbToHex/withAlpha；ventsByDate、dayColor、addVent/removeVent（乐观更新+回滚）。
4. **WishingBottle.vue**：SVG 瓶 + 液层 + 波浪 + 气泡 + 倒入/消散/摇晃动画。
5. **SpectrumPicker.vue + VentComposer.vue**：连续光谱取色 + 录入（Ctrl+Enter）。
6. **MoodView 四视图 tab**：当日（StarPendant+Bottle+Composer+vent 列表+MoodToday）/ 近 7 天 MoodWeek / 近一月 MoodMonth / 年历；selectedDate 状态贯通。
7. **MoodGrid/MoodCell/MoodPicker/AppSidebar**：颜色改 dayColor；多 vent cell 渐变；过去日期补记入口（Teleport 弹层内含 VentComposer）。
8. **StarPendant.vue + CurtainReveal.vue + MoodToday 点击特效 + 环境星尘**；统一 reduced-motion 关停。
9. **本地验证**：`cd frontend && npm run build`；`python scripts/e2e_full_test.py`（45 项不回归）；CDP @1440/@390 验证 A1–A7。
10. **部署生产**：paramiko SFTP（db.py/main.py/init_mysql.sql/前端 dist 由镜像构建）→ `sudo docker compose up -d --build app` → 生产容器内建表生效（MySQL _init_schema IF NOT EXISTS 自动建）→ 线上复验 A1/A2/A5 抽项。

## 验证命令

- 后端冒烟：本地 `python -m server`（或既有启动方式）+ curl 序列
- `cd frontend && npm run build`
- `python scripts/e2e_full_test.py`
- 生产：`curl -s http://49.235.147.177/api/moods -H cookie...`（游客登录后）

## 回滚点

- 步骤 1–2（后端）与 3–8（前端）可分两批部署；先后端后前端，前端旧版对新 API 无感知（vents 字段忽略）。
- DB 新表残留无害，不 drop。

## 注意事项

- 三套 SQL 方言各自模仿邻近表；SQLite 靠执行层翻译，勿在 SQL 里写方言专属函数（NOW() 可用，SQLite 层会翻译）。
- 禁 color-mix / 现代媒体区间语法；粒子/帘子/弹层 fixed → Teleport body。
- 年视图 list_moods 带 vents 注意 payload 体积（365 天 × 平均几条，可接受；text 可截断返回？——不截断，保持简单，实测体积若 >200KB 再优化）。
- 粒子 DOM 用完清理；动画循环（吊坠/气泡）组件卸载时停 rAF。
