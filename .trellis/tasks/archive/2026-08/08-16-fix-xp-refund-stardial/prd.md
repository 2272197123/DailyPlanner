# PRD: 修复 取消完成退 XP + 星轨轮盘分针

调研与根因：`research/bug-investigation.md`（证据链已闭合，含行号）。

## 需求 1：取消完成退还经验

- 计划块/子任务/Routine 打卡在「完成→取消完成」时，退还完成时发放的 XP
- **金额口径用存证**：award 时记录实际发放金额（不依赖 `calcTaskReward` 重算，防止中途改 duration/priority 后对不上账）
- 后端新增 `DELETE /api/earned/{date}/{item_id}` + `db.unmark_earned`（三套方言 schema 同步）；前端 `schedule.js` 加 `revokeAward`、`currency.js` 加减额方法（流水记 `refund`）
- 修复次生不一致：取消后再次完成应能重新发奖（earnedToday 登记要真正移除）
- `RoutineItem.vue` 的 +50 XP 打卡同样支持撤销退还

## 需求 2：星轨轮盘分针

- 删除 `StarDial.vue:269-271` 的 `.sd-min-hand { transform-origin: 120px 120px; }`（分针属性变换已绕表盘中心，残留 origin 导致绕 (240,240) 旋转飞离表盘）
- 顺带：`.sd-time`（snapPulse 动画目标）是 inline span，加 `display: inline-block` 使脉冲生效

## 验收标准

1. 完成任务 +XP → 取消完成 -等额 XP → 再次完成 +等额 XP；流水记录完整（earn/refund/earn），余额正确
2. 完成时记录金额后，修改任务时长/优先级再取消，退还金额仍等于实发金额
3. Routine 打卡撤销退还 50 XP
4. 星轨轮盘分针拖到任意分钟（含非 0 分）指针指向正确，5 分钟吸附正常，时针不受影响
5. 后端 DELETE 接口三套方言可用；`npm run build` 通过；e2e 不回归
