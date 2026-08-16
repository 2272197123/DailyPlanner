# PRD: 主题切换按钮改造（日夜模式创意开关）

## 背景

当前白天/黑夜切换按钮只是一个 ☀/☾ 字符按钮，不显眼且缺乏创意：

- 桌面端：侧栏头部 `.collapse-btn`（`frontend/src/components/layout/AppSidebar.vue:175-179`）
- 移动端：右上角快捷按钮 `.mobile-theme-btn`（`AppSidebar.vue:160-165`）

## 需求

参照 uiverse 设计（https://uiverse.io/RiccardoRapelli/jolly-chicken-91 ，MIT，调研见 `research/uiverse-toggle-reference.md`）实现动画日夜开关：

- 滑轨式开关（约 60×34）：白天 = 蓝天 + 太阳（带光晕）+ 漂移云朵；黑夜 = 夜空 + 月亮（陨坑浮现）+ 下落闪烁星星
- 切换时太阳/月亮滑动 + 旋转过渡（约 0.4~0.6s），星星下落淡入、月坑浮现
- 抽成独立可复用组件（如 `ThemeToggle.vue`），桌面侧栏与移动端两处统一替换
- 业务逻辑不变：仍走 `themeStore.toggleMode()` + `api.put('/prefs', { mode })`（AppSidebar.vue:46-49）

## 约束

- 遵守 `.trellis/spec/backend/quality-guidelines.md` 的 Vue3 前端约束：CSS 兼容 chrome80（禁 `color-mix()`/`:has()`/媒体范围语法）；建议用 Vue class 绑定（`:class="{ night }"`）替代 `:checked` 选择器
- `prefers-reduced-motion` 时关闭云漂移/星闪烁/旋转等动画
- 云/星动画只能用 transform/opacity（合成属性），不得引入 layout/paint 开销
- 新组件若含 fixed 定位元素需 Teleport（本组件为静态小开关，预计不涉及）
- 开关语义色（蓝天/夜空）可硬编码，不与 9 套主题变量冲突；视觉需在亮/暗两种模式下都清晰可辨

## 验收标准

1. 桌面端侧栏与移动端右上角均显示新开关，点击切换亮/暗模式即时生效，刷新后保持
2. 白天/黑夜两态视觉与参考设计一致（太阳/云 vs 月亮/星），过渡动画流畅
3. 切换后 mode 同步到 `/prefs`（登录用户跨设备保持）
4. chrome80 语法约束通过（构建 `npm run build` 无警告）；移动端（≤768px）显示正常
5. 系统开启 reduced-motion 时无循环/过渡动画，状态切换仍生效
