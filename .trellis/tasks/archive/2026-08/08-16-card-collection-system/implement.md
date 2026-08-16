# 实施计划: 成就与卡牌收集系统

1. 后端：card_defs 静态定义（4 系列 × 8 张）+ user_cards/checkins/user_achievements 三表（三套方言 + init_mysql.sql）+ 游客清理覆盖
2. 后端接口：POST /api/cards/draw（权重随机+幂等）、GET /api/cards、POST /api/checkin（幂等+streak+里程碑保底）、GET /api/achievements（惰性评估）
3. 前端 stores/collection.js
4. CardFace.vue 通用卡面（稀有度/系列视觉分级，纯 CSS）
5. CardReveal.vue 掉卡揭示动效（接入 FlowTimeline 完成分支；与 XP 退还链路隔离）
6. CollectionView.vue 收集页（系列图鉴/成就墙/签到区）+ 路由 + 侧栏入口
7. 签到交互（首页或收集页入口）
8. 验证：`npm run build`；e2e；权重/幂等/游客场景 curl 冒烟；移动端检查

依赖：task-card-art-redesign 先做（卡面视觉语言复用）；fix-xp-refund-stardial 的 toggleBlockDone 改动若冲突，以完成分支挂点为界各自独立。
回滚点：后端表/接口与前端可分批；新表残留无害。
