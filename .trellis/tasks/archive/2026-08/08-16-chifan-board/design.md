# 技术设计: 恰饭板块

## 架构

```
前端: ChifanView.vue (路由 /chifan, 侧栏入口替换记账)
  ├─ BudgetPicker（餐次 中/晚 + 预算滑杆/输入）
  ├─ SlotMachine.vue（老虎机：名称+图快速滚动减速定格，transform/opacity）
  ├─ FoodCard.vue（翻面卡，参照 research/ref-tricky-robin.*）
  ├─ DishManager.vue（菜品增删改弹层）
  └─ 「就吃这个」→ schedule store addBlock 钉时块 → 计划页可见
后端: server/main.py + db.py
  ├─ dishes 表（三套方言 + init_mysql.sql）
  ├─ GET /api/dishes?meal=lunch|dinner&maxPrice=N  （菜品列表/过滤）
  ├─ POST/PUT/DELETE /api/dishes/{id}               （菜品管理）
  └─ 抽取在前端做（列表已拉取，crypto.getRandomValues 随机；菜品无防作弊需求）
```

## 数据契约

dishes 表：`id TEXT PK, name TEXT, description TEXT, price REAL, meal TEXT('lunch'/'dinner'/'both'), category TEXT, image TEXT, created_at`。
菜品库为**全站共享**（非 per-user）：用户增删改即改共享库。首版 seed 60-100 道在 `_init_schema` 后幂等插入（INSERT IF NOT EXISTS / 行数为 0 才 seed）。

## 钉时任务联动

- 复用 `schedule.js` 现有 addBlock 路径：构造 block `{ subject: '🍜 '+name, time: '12:00'|'18:00', duration: 60, pinned: true }`，走 saveDay + _persistOrderCfg（遵守钉时铁律，新块是纯新增不推挤既有块）
- 时间可由用户在确认弹层里改（复用 StarDial 或简单时间输入）

## 图片

- `frontend/public/food/<image>` 静态引用；`onerror` 回退到程序化占位（CSS 像素格图案或内置 placeholder.png）
- 图片资源由用户线下生成后放入仓库 public/food/，前端零依赖生图工具

## 记账移除

- 删 `frontend/src/views/LedgerView.vue`、`components/accounting/`、路由项、侧栏项；grep 清理引用（Dashboard 若有记账入口一并移除）
- 后端 `server/` 记账路由与表保留不动

## 回滚

- 前端整体可回滚（git）；dishes 表残留无害
