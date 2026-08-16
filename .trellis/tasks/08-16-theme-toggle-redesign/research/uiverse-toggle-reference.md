# 参考设计调研：uiverse jolly-chicken-91 日夜切换开关

来源: https://uiverse.io/RiccardoRapelli/jolly-chicken-91 (MIT License)
现成实现参考: https://github.com/OfficialKovid/animated-toggle-button-uiverse

## 设计构成

60×34 圆角滑轨开关，一个 checkbox 控制两种状态：

- **白天态**：滑轨蓝色 `#2196f3`，左侧黄色太阳（26px 圆），太阳带 3 层白色光晕（light-ray，opacity 10%），滑轨内 6 朵云（cloud-light `#eee` / cloud-dark `#ccc` 交替）做 6s 无限横漂动画（±4px）。
- **夜间态**（checked）：滑轨变黑，太阳右移 26px 并变白成月亮 + 0.6s 旋转动画，月面浮现 3 个灰色陨坑（moon-dot，opacity 0→1），4 颗四角星形（star）从上方 32px 处下落淡入并各自 2s 闪烁（scale 0.8~1.2，不同 delay）。
- 过渡全部 0.4s。

## 关键 CSS 片段（原文要点）

```css
.switch { position: relative; display: inline-block; width: 60px; height: 34px; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; inset: 0; cursor: pointer; background: #2196f3;
          transition: .4s; overflow: hidden; border-radius: 34px; }
.sun-moon { position: absolute; height: 26px; width: 26px; left: 4px; bottom: 4px;
            background: yellow; transition: .4s; border-radius: 50%; }
input:checked + .slider { background: black; }
input:checked + .slider .sun-moon { transform: translateX(26px); background: white;
            animation: rotate-center .6s ease-in-out both; }
.moon-dot { opacity: 0; transition: .4s; fill: gray; }   /* checked 时 opacity:1 */
.stars { transform: translateY(-32px); opacity: 0; transition: .4s; }
input:checked + .slider .stars { transform: translateY(0); opacity: 1; }
```

星星 path（四角星）:
`M 0 10 C 10 10,10 10 ,0 10 C 10 10 , 10 10 , 10 20 C 10 10 , 10 10 , 20 10 C 10 10 , 10 10 , 10 0 C 10 10,10 10 ,0 10 Z`

## 与本项目的适配点

- 现有切换逻辑：`AppSidebar.vue:46 toggleThemeMode()` → `themeStore.toggleMode()` + `api.put('/prefs', { mode })`。新组件只需触发同一函数，业务逻辑零改动。
- 现有两处按钮：
  - 桌面端侧栏头部 `AppSidebar.vue:175-179`（`.collapse-btn`，显示 ☀/☾ 字符）
  - 移动端右上角快捷按钮 `AppSidebar.vue:160-165`（`.mobile-theme-btn`）
- 建议抽成独立组件 `ThemeToggle.vue`（props: 无；内部读 `themeStore.isDark` 绑定 checkbox checked），两处复用。
- **chrome80 约束**（spec/backend/quality-guidelines.md:150）：不能用 `color-mix()` / `:has()` / 媒体范围语法；`input:checked + .slider` 兄弟选择器没问题；可用 `:checked` 但为稳妥也可改用 Vue class 绑定（`:class="{ night: isDark }"`）替代 `:checked` 选择器，兼容性最好。
- 需要 `prefers-reduced-motion` 降级：关掉云漂移/星闪烁/旋转动画（站点已有此约定，见 quality-guidelines）。
- 颜色硬编码可保留（开关自身语义就是蓝天/黑夜），不随 9 套主题变量变化也可以；若想更融合可用 `--accent` 做白天滑轨色。建议：滑轨颜色微调以贴合各主题 accent，但保持辨识度。
- 无限动画元素小（60×34），云/星动画均为 transform，无性能隐患。
