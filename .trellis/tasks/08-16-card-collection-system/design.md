# 技术设计: 成就与卡牌收集系统

## 架构

```
后端 (server/main.py + db.py, 三套方言 + init_mysql.sql):
  card_defs     静态定义（代码内常量 seed，或直接建表 seed）：id/series/name/rarity/flavor
  user_cards    (user_id, card_id, face_value, obtained_at, source)  — 掉落记录
  checkins      (user_id, check_date UNIQUE, streak)                 — 每日签到
  user_achievements (user_id, achievement_id, achieved_at)
  接口:
    POST /api/cards/draw {source: 'task'|'checkin'} → 服务端按权重随机稀有度+卡+面值，幂等键防重
    GET  /api/cards                                 → 我的收集
    POST /api/checkin                               → 签到（每日一次幂等，返回 streak+奖励卡）
    GET  /api/achievements                          → 成就列表（含进度/达成时间）
前端:
  stores/collection.js   — 卡册/签到/成就状态
  CardReveal.vue         — 掉卡揭示动效（稀有度分级华丽度，复用 CardCelebration 粒子）
  CollectionView.vue     — /collection 收集页（系列分组图鉴+成就墙+签到）
  CardFace.vue           — 通用卡面（稀有度边框色/系列纹样/名称；面值角落小字）
  触发点: FlowTimeline handleToggleTask 完成分支 → collectionStore.drawFromTask()
```

## 关键契约

- **稀有度权重**（服务端常量）：N 55 / R 27 / SR 13 / SSR 5；连签 7 天保底 SR+
- **面值范围**：N 1-10 / R 5-20 / SR 15-40 / SSR 30-100（服务端生成，前端只读）
- **幂等**：draw 携带 client 生成的 idempotency key（或 source+blockId 唯一约束）；checkin 以 (user_id, check_date) 唯一约束幂等
- **取消完成不回收卡**：draw 记录与 earned/XP 链路完全独立
- 游客：走同一 user_id 体系（游客有 user 记录），7 天清除逻辑覆盖新表（检查现有游客清理任务覆盖范围，补上三张新表）
- 成就检查时机：签到/掉卡/任务完成时在服务端惰性评估（检查达成条件 → 插入 user_achievements → 响应带回新达成列表）

## 卡面视觉

- 纯 CSS 卡面：稀有度决定边框/底色（SSR 金渐变+流光、SR 紫、R 蓝、N 白灰）；系列决定纹样（塔罗=星月线条、美食=像素格、精灵=爪印/圆瞳、节气=水墨笔触，用 SVG 线条/渐变实现，不依赖外部图）
- 性能：收集页图鉴列表无 stagger 大动画、无常驻 will-change（MoodGrid 教训）

## 分期

- 第一期（本任务）：卡牌定义 4 系列 × 每系列 8 张（2N+3R+2SR+1SSR）共 32 张 + 掉落 + 签到 + 10 个成就 + 收集页
- 后续（不在本任务）：商城（消费面值）、卡牌图片美术、交易

## 回滚

- 新表残留无害；前端路由/入口可单独回滚
