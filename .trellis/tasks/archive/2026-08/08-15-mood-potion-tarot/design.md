# Design: 心情页塔罗化（药剂瓶 + 混合色 + 近期视图 + 动效）

对应 PRD：`./prd.md`。

## 1. 数据模型与 API（server）

### 表 `mood_vents`

三处 `_init_schema`（`server/db.py` SQLite ~L268 / MySQL ~L557 / PostgreSQL ~L858）+ `scripts/init_mysql.sql`：

```sql
CREATE TABLE IF NOT EXISTS mood_vents (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,   -- MySQL: INT AUTO_INCREMENT; PG: SERIAL/IDENTITY 写法按现有表风格
    user_id     INTEGER NOT NULL,
    date        TEXT NOT NULL,          -- YYYY-MM-DD
    text        TEXT NOT NULL DEFAULT '',
    color       TEXT NOT NULL DEFAULT '#9ca3af',
    created_at  ... 同现有表的时间默认写法
);
CREATE INDEX idx_mood_vents_user_date ON mood_vents (user_id, date);
```

注意三套方言各自模仿邻近表写法；SQLite 执行层会自动翻译 `%s→?`、`NOW()→datetime('now','localtime')`（db.py L109-117）。

### db.py 函数

- `add_vent(user_id, date, text, color) -> id`
- `delete_vent(user_id, vent_id) -> bool`
- `list_vents(user_id, date) -> list`
- `list_vents_by_year(user_id, year) -> {date: [vent,...]}`（或并入 list_moods 的 SQL 分别查再组装）
- `_blend_colors(hexes) -> hex`：sRGB→线性→算术平均→回 sRGB。纯函数，放 db.py 或 utils。
- `_refresh_day_color(user_id, date)`：查该日 vents；有 → blend 写回 `moods.color`（无行则插入，label '一般'，note ''）；无 vents → 不动（保持预设色）。add/delete_vent 后调用。
- `save_mood` 调整：该日存在 vents 时忽略 payload color（保留混合色），其余字段照常 upsert。
- `get_mood` / `list_moods` 返回增加 `vents: [...]`（按 created_at 升序）。list_moods 年视图带 vents 用于 cell 渐变。

### main.py 端点（均 require_user）

- `POST /api/mood/{date}/vents`，body 校验：text ≤500 字 strip 后可空？——不可空（吐槽要有内容，允许 1 字）；color 必须匹配 `^#[0-9a-fA-F]{6}$`，非法 422。
- `DELETE /api/mood/vents/{vent_id}` → `{ok, deleted}`。
- date 参数沿用现有 `YYYY-MM-DD` 校验风格（参考 api_save_mood）。

## 2. 前端 store（stores/mood.js）

- 新 state：`ventsByDate = {}`（date → vent 数组，由 fetchMoods/get 填充）。
- `dayColor(date)`：vents 非空 → 前端同款 blend（与后端一致算法，放 `utils/color.js` 共享）；否则 entry?.color。
- actions：`addVent(date, {text, color})`、`removeVent(date, ventId)`——乐观更新 + API；失败回滚并 toast。
- `setEntry/saveMood` 不变（预设卡路径）。
- `utils/color.js` 新增：`hexToRgb`、`rgbToHex`、`mixColors(hexes)`（线性空间平均）、`withAlpha(hex, aa)`（hex-alpha 拼接，兼容老内核）。

## 3. 组件

### WishingBottle.vue（当日核心）

- SVG 瓶身（圆底瓶/许愿瓶形，软木塞），clipPath 限制液体在瓶内。
- 液层：vents 按时间自下而上，每层 path 矩形 + 顶部波浪（正弦 path，CSS keyframes 平移做流动）；层高均分瓶内容积（层数多时压缩到最小 8%）。
- 气泡：每层 2–3 个 circle，CSS 上升动画（不同 delay/duration）。
- 倒入：新增 vent 时播 anime 时间线——色滴（小圆）从瓶口落至液面 → 液体高度 spring 上升 → 瓶身 rotate 弹簧晃动（±3° 阻尼振荡）→ ✦ 星尘粒子（参照 CardCelebration starShower，span 粒子 + anime，结束移除 DOM）。
- 删除：该层 opacity/scale 消散 + 粒子，然后其余层高度重排（spring）。
- props：`vents`、`loading`；emit：`remove(vent)`。

### SpectrumPicker.vue（光谱取色）

- 轨道：`background: linear-gradient(90deg, hsl(0..360))` 全色谱；Pointer Events 拖动/点击取 hue；下方细滑条调明度（hsl l 30–70）。
- 输出 hex（hsl→hex 换算放 utils/color.js）。无预设色板；引导文案「暖色=积极 · 冷色=消极，也可以选任何颜色」。
- 当前色圆形预览 + hex 文本。

### VentComposer.vue（吐槽录入）

- textarea（Ctrl+Enter 发送）+ SpectrumPicker + 发送按钮；成功 → emit 给 WishingBottle 播倒入动画。
- 取代/融合现有 MoodVentInput（当日视图内使用；MoodVentInput 原挂载点若在别处引用需一并调整——实施时 grep 引用）。

### 视图切换（MoodView.vue）

- tab：当日 / 近 7 天 / 近一月 / 年历（segmented control，沿用 year-btn 样式语言）。
- 当日：StarPendant 挂顶部 + WishingBottle + VentComposer + 当日 vent 列表（每条条目：色点+文本+时间+删除）+ MoodToday 预设卡。
- 近 7 天 `MoodWeek.vue`：7 个迷你瓶（WishingBottle 简化模式：只液层无动画或少量动画）按日排列，点击 → 切到「当日」并选中该日（MoodView 内 selectedDate 状态，当日/录入都作用于 selectedDate，默认今天）。
- 近一月 `MoodMonth.vue`：月历网格，cell = 混合色块（vents 多色 → linear-gradient 135deg 拼接），点过去/今天的格子 → selectedDate 切换当日视图补记；未来日期禁用。
- 年历：MoodGrid cell 颜色改 `dayColor(date)`；多 vent → 渐变。MoodCell 渐变 background 支持。侧栏迷你格子（AppSidebar）读同一 store getter，自动跟随。

### StarPendant.vue（星星吊坠）

- 顶部锚点 + 链子（线）+ 星形 SVG；requestAnimationFrame 角弹簧：θ'' = -k·θ - c·θ' + 风力微扰；Pointer 拖拽改 θ，松手释放摆动。
- `prefers-reduced-motion` → 静止。

### CurtainReveal.vue（帘子）

- 左右两片 fixed 帘（Teleport body），背景为纵向褶皱渐变（repeating-linear-gradient 深红/紫金）；进入页面 mount 后向两侧 translateX 收起 + 轻微摆动，~1.1s 后移除 DOM；播放期间 pointer-events:none 不阻塞。
- 仅在路由进入 MoodView 时播放（MoodView onMounted 挂载，切 tab 不重播）。

### 心情卡点击特效（MoodToday.vue 增强）

- 点击预设卡：scale 脉冲 + rotateY 微翻（≤25°）+ 以点击点为中心的 ✦ 粒子爆发 + 选中光环（现有 glow 保留）。
- 保存成功 toast 保持。

## 4. 粒子工具

`composables/useAnime.js` 已有 burst；新增/扩展 `starDust(x, y, {colors[], count})`（✦/✧/· 字符 span，anime 物理感位移+重力下落+淡出，完毕 remove）。所有粒子入口统一走它，便于 reduced-motion 统一关停。

## 5. 兼容与性能

- 禁 color-mix / 现代媒体区间语法；渐变、hsl()、hex-alpha 可用（chrome80 OK）。
- 环境星尘 ≤30 个 span，`will-change: transform`，reduced-motion 时不渲染。
- fixed 元素（帘子、补记弹层、粒子容器）Teleport body。
- 液层波浪动画用 transform 不做 layout 动画。

## 6. 文件清单

新增：

- `server/`（db.py 函数 + main.py 端点，非新文件）
- `frontend/src/utils/color.js`（扩展或新建）
- `frontend/src/components/mood/WishingBottle.vue`、`SpectrumPicker.vue`、`VentComposer.vue`、`MoodWeek.vue`、`MoodMonth.vue`、`StarPendant.vue`、`CurtainReveal.vue`

修改：

- `server/db.py`（3 套 schema + vents CRUD + blend + save_mood 调整）
- `server/main.py`（2 个端点 + get/list_moods 带 vents）
- `scripts/init_mysql.sql`（mood_vents）
- `frontend/src/stores/mood.js`（vents state/actions/dayColor）
- `frontend/src/views/MoodView.vue`（tab + 当日视图组装）
- `frontend/src/components/mood/MoodGrid.vue` / `MoodCell.vue` / `MoodPicker.vue`（混合色 + 渐变 + 补记吐槽入口）
- `frontend/src/components/mood/MoodToday.vue`（点击特效）
- `frontend/src/components/mood/MoodVentInput.vue`（被 VentComposer 取代或改造，看引用情况）
- `frontend/src/AppSidebar.vue`（迷你格子颜色来源换 dayColor，如现状已是 store entry 则自动跟随）

## 7. 回滚

- DB：新表独立，回滚代码后残留表无害；不 drop。
- 前端：组件新增为主，回滚 = 还原修改文件。
