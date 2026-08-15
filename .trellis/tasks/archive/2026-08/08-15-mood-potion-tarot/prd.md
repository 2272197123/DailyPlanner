# PRD: 心情页塔罗化——药剂瓶多条吐槽混合色 + 近期视图 + 塔罗动效

父任务：`.trellis/tasks/08-15-plan-interaction-and-mood-tarot/prd.md`

## 背景

心情页现状：每日一条心情记录（`moods` 表：color/label/note/intensity，一色一天）；8 个硬编码预设色（`MOOD_PRESETS`）；只有年历（MoodGrid）+ 今日速记卡（MoodToday）。用户要求：

- 一天可存**多条吐槽**，每条带**自由选取**的颜色（积极暖色/消极冷色/任意色，**不用硬编码预设色板**），多条颜色**混合成当日颜色**，让每一天都丰富多彩。
- 心情颜色用**许愿瓶**设计：不同心情药剂显示不同颜色。
- 除年历外，增加**当日 / 近七天 / 近一月**视图。
- 更多塔罗元素与动画：星星吊坠（物理摆动）、帘子开幕、心情卡点击动画与特效、物理与粒子效果，增强正反馈。

## 需求

### R1 多条吐槽数据模型（后端）

- 新表 `mood_vents`：`id, user_id, date, text, color(hex), created_at`；SQLite / MySQL / PostgreSQL 三处 `_init_schema` + `scripts/init_mysql.sql` 同步建表。
- API：
  - `POST /api/mood/{date}/vents` `{text, color}` → 新增一条（color 校验 `#rrggbb`）
  - `DELETE /api/mood/vents/{vent_id}` → 删除本人一条
  - `GET /api/mood/{date}` 与 `GET /api/moods?year=` 返回中附 `vents: [{id,text,color}]`
- 当日颜色规则：有 vents → 颜色 = 全部 vent 颜色线性 RGB 混合（后端在 vent 增删时重算写回 `moods.color`，行不存在则创建，label 默认「一般」）；无 vents → 沿用 `moods.color`（预设卡路径不变）。`save_mood` 在该日有 vents 时忽略传入 color（只更新 label/note/intensity）。
- 既有 moods 数据零迁移、行为不变。

### R2 许愿瓶（当日视图核心）

- `WishingBottle.vue`：SVG 瓶，每条 vent = 一层药剂液体（自下而上叠色，层间波浪线，液体带气泡上升动画与微晃物理）；当日颜色 = 瓶内液体混合色实时呈现。
- 新增吐槽 = 倒入动画：色滴从瓶口落下 → 液体升高 → 瓶身轻微摇晃（弹簧物理）→ 星尘粒子爆发。
- 删除吐槽：对应液层消散（粒子）后重排。

### R3 吐槽录入 + 光谱取色

- 当日视图含吐槽输入：文本框 + **连续色谱滑条**（hue 0–360 线性渐变轨道，自由取色，非色板；暖端=积极、冷端=消极仅作视觉引导文案）+ 当前色预览。
- 保存 → 倒入动画 + 粒子正反馈；Ctrl+Enter 快捷发送保持。

### R4 多时间尺度视图

MoodView 增加视图切换：当日 / 近 7 天 / 近一月 / 年历。

- 当日：许愿瓶 + 吐槽录入 + 当日 vent 列表（可删）+ MoodToday 预设速记卡（保留，作为快捷入口，只定 label/基调）。
- 近 7 天：7 个小瓶（或迷你卡）横排，每天混合色 + vent 数；点击进入对应日详情。
- 近一月：月历网格，每天混合色块；点过去的格子可补记（Teleport 的补记弹层，可写吐槽）。
- 年历：MoodGrid 保留；cell 颜色改用混合色；有多个 vent 的天 cell 用多色渐变（线性/锥形渐变拼接 vents 颜色）呈现「丰富多彩」。

### R5 塔罗元素与动效

- **星星吊坠** `StarPendant.vue`：页面顶部悬挂星形吊坠，钟摆物理（角度弹簧阻尼；可拖拽甩动，松手摆动衰减；空闲微风轻摆）。
- **帘子开幕**：进入心情页时两侧丝绒帘（渐变褶皱 CSS）向两边拉开，露出内容；每次进入播放，≤1.2s，不阻塞交互。
- **心情卡点击动画**：MoodToday 预设卡点击 → 发光脉冲 + 微翻转 + 粒子爆发（现有 glow 基础上加强）。
- **环境粒子**：背景少量缓慢漂浮星尘（≤30 个，低成本）；尊重 `prefers-reduced-motion`（减少/禁用动画与粒子）。

### R6 兼容性

- 构建保持 chrome80 CSS 目标：禁 color-mix、现代媒体区间语法；透明度用 hex-alpha 变量。
- fixed/overlay 一律 Teleport body。
- 动画用 anime.js（既有依赖）+ CSS keyframes；粒子 DOM 用后清理。
- 暗/亮模式 + 9 主题正常；移动端 ≤390px 无横向溢出。

## 验收标准

- A1：同一天可新增多条吐槽（各自不同颜色），删除任意一条；刷新后仍在（API 持久化）。
- A2：当日颜色 = vents 混合色；年历 cell、近 7 天、近一月、侧栏迷你格子均显示混合色；多 vent 的年历 cell 呈多色渐变。
- A3：取色器为连续光谱，无硬编码色板；可选任意 hex。
- A4：无 vents 的日行为与现状一致（预设卡定色）；有 vents 时预设卡只改 label 不改混合色。
- A5：当日/近 7 天/近一月/年历四视图可切换且数据一致；过去日期可补记吐槽。
- A6：许愿瓶倒入动画、吊坠摆动、帘子开幕、卡片点击特效、保存粒子均可播放；`prefers-reduced-motion` 下粒子/摆动关闭。
- A7：本地 e2e（scripts/e2e_full_test.py 45 项）不回归；`npm run build` 通过；移动端无溢出。
- A8：部署生产后线上验证 A1/A2 抽项。

## 非目标

- 不删除 MOOD_PRESETS 与 MoodToday 速记卡（保留为快捷入口）。
- 不做年度统计/占比图表（列入后续可选）。
- 不改侧栏迷你心情格子的交互入口（仍开 MoodPicker；仅颜色显示改混合色）。
