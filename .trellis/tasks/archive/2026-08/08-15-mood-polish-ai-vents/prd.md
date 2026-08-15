# PRD: 心情页打磨 + AI 评价接入吐槽

## 用户反馈（原话要点）

1. 「今日心情的预设删掉，没什么用处」——当日 tab 的 MoodToday 预设 8 卡移除。
2. 「许愿瓶里的颜色很容易变成灰粉色，但近一月的月历中却能正确显示渐变，我希望你沿用月历的颜色合成方法，这样我们的颜色才会明亮且鲜艳」——瓶内液体改用月历 cell 的多色渐变合成（vent 颜色 gradient），不再用线性空间平均的混合灰。
3. 「颜色无极调节保留，下面的亮度调节我觉得没必要，预设为标准值即可（稍微淡一点点）」——SpectrumPicker 去掉亮度滑条，亮度固定为标准值稍淡（如 l≈60%）。
4. 「心情页面的进场动画我希望帘子的颜色和主题同步」——CurtainReveal 帘子配色改用主题变量（--accent 等），9 主题 × 亮暗自适应。
5. 「每日心情吐槽我希望可以和 ai 每日总结打通，这样 ai 能够更个性化地生成每日评价」——归档复盘请求 AI 评价时，把当日吐槽注入 prompt。

## 需求

### R1 移除 MoodToday

- MoodView 当日 tab 删除 MoodToday 预设卡区块；若组件无其他引用则删除文件（grep 确认）。
- MOOD_PRESETS 的其他用途（年历图例、MoodPicker、侧栏）保持不动。

### R2 瓶内液体 = 多色渐变（沿用月历合成）

- 参照 MoodMonth/MoodCell 的多 vent 渐变写法（linear-gradient 135deg 拼接 vents 颜色），瓶内液体填充改为由 vents 颜色构成的平滑渐变（SVG linearGradient 多 stop，沿瓶身方向排布，stop 间平滑过渡——是渐变不是分层，无硬边界、无层间波浪）。
- 顶部单波浪保留；气泡保留；单条 vent = 纯色（渐变两端同色）。
- dayColor（混合 hex）的其他用途（瓶下色号点、侧栏迷你格、年历单色 cell）不动。

### R3 SpectrumPicker 简化

- 删除亮度滑条；lightness 固定标准值稍淡（建议 60%，实施者按视觉微调）；hue 无极滑条保留。

### R4 帘子随主题

- CurtainReveal 的丝绒帘/金穗/檐幕配色从硬编码改为 CSS 变量派生（--accent / --accent-muted / 主题 bg 等；可用 hex-alpha 变量做深浅），9 主题 × 亮暗模式都协调。

### R5 AI 评价接入当日吐槽

- `stores/archive.js` `_requestAiReview` 的 userPrompt 增加「当日心情吐槽」段落：从 mood store 取该日 vents，每条一行（文本 + 由色相推出的「偏暖/偏冷」倾向提示，帮助 AI 判断情绪效价，不硬编码心情标签）；无 vents 时该段省略。
- 该日 mood label 若非默认也附上。
- AI 请求失败路径不变（静默 null）。

## 验收

- A1：当日 tab 无预设卡；引用清零。
- A2：瓶中 2+ 色呈明亮渐变（截图对比：红+蓝不再是 #bc00bc 灰紫而是红→蓝渐变）；月历/年历/侧栏行为不变。
- A3：光谱只剩 hue 滑条，取色亮度一致。
- A4：切换 2-3 套主题 + 亮暗，帘子颜色协调不突兀（截图）。
- A5：构造有吐槽的归档，AI prompt 里含吐槽文本与倾向（可 stub fetch 验证 prompt 内容，无需真实 API key）。
- A6：`npm run build` 通过；chrome80 约束不破；移动端无溢出。
- A7：部署生产。
