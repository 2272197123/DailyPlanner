# Journal - Ahsoka·Tano (Part 1)

> AI development session journal
> Started: 2026-08-05

---



## Session 1: 生产部署 + UI 系统化改造（暗色模式/主题/响应式）+ 邮箱注册上线

**Date**: 2026-08-14
**Task**: 生产部署 + UI 系统化改造（暗色模式/主题/响应式）+ 邮箱注册上线
**Branch**: `master`

### Summary

Deployed to Tencent Cloud (49.235.147.177, Docker app+MySQL+host nginx:80); added dark/light mode, full 8-theme skins, card shadows, mobile drawer nav, desktop centering; enabled SMTP email registration (QQ); fixed first-user-admin counting guests

### Main Changes

- Deploy: server env Ubuntu 24.04 + docker.io; code at ~/dailyplan; .env with random DP_SECRET_KEY/MySQL pw + SMTP (QQ 2272197123@qq.com); host nginx :80 proxies to app:5000 (old static site backed up at /etc/nginx/sites-available/default.bak-zero-to-tech); docker mirror mirror.ccs.tencentyun.com
- Repo fixes: .dockerignore wrongly excluded frontend/ (broke multi-stage build); Dockerfile pip uses Tencent PyPI mirror via PIP_INDEX_URL build-arg; docker-compose passes DP_SMTP_* env
- Dark mode: full token set under :root[data-mode=dark] in variables.css; new tokens --on-accent/--border-strong/--orb-*; themes.css gives all 8 themes light+dark variants (bg tint/orbs/accent ramp); theme.js store gains mode with localStorage+server /prefs sync; toggle in AppSidebar header + SettingsView
- UI: layered shadows sm/md/lg; .card hover lift; App.vue .app-main max-width 1200px centered (1320px >=1600px); mobile hamburger + drawer sidebar + backdrop (previously no nav entry on phones); per-view mobile fixes across plan/timeline/ledger/mood/news/admin/AI drawer
- Bug fix: db.count_users now excludes guests so first real registration becomes admin (guests had blocked it)

### Git Commits

(No commits - planning session)

### Testing

- [OK] e2e_full_test.py 45/45 PASS (auth/admin/guest/ratelimit/encryption)
- [OK] vite build passes; online smoke: front 200, /api/auth/me ok, SPA /admin 200, send-email-code real mail sent

### Status

[OK] **Completed**

### Next Steps

- Continue feature polish tomorrow (user's call); verify mobile timeline + dark ledger charts visually
- Uncommitted working tree: README/.dockerignore/Dockerfile/docker-compose.yml + frontend overhaul; commit when user approves
- Optional: switch registration to open mode; restore zero-to-tech site if wanted
