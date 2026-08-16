# 实施计划: 恰饭板块

1. 后端 dishes 表（db.py 三套方言 init_tables + init_mysql.sql）+ seed 菜品库（60-100 道，行数为 0 才 seed）
2. 后端接口：GET /api/dishes（meal/maxPrice 过滤）、POST/PUT/DELETE /api/dishes/{id}（管理）
3. 前端 stores/dishes.js：列表拉取（会话缓存）、增删改
4. ChifanView + SlotMachine + FoodCard（翻面卡照 ref-tricky-robin）+ BudgetPicker
5. 「就吃这个」确认弹层（可改时间）→ schedule addBlock 钉时块
6. DishManager 管理弹层
7. 移除记账：路由/侧栏/LedgerView/components/accounting/ + grep 清引用
8. 占位图策略（public/food/ 缺图 onerror 回退）
9. 验证：`npm run build`；e2e_full_test.py；移动端 390px 检查；reduced-motion 检查

回滚点：1-2（后端）与 3-8（前端）可分批部署；表残留无害。
