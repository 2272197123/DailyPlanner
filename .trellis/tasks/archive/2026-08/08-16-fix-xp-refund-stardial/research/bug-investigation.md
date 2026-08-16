# Bug 调研：取消完成不退 XP + 星轨轮盘分针（2026-08-16 explore 产出）

## Bug 1：取消完成不退还经验 —— 撤销路径整体缺失

**完成时发了什么**（`frontend/src/components/plan/FlowTimeline.vue:259-274` `handleToggleTask`）：
- 仅 `if (completed)` 分支发奖：`calcTaskReward(block) * 5` 点 **XP**
- `scheduleStore.awardOnce(date, 'block_' + blockId)`（`schedule.js:687-693`）→ `earnedToday` 登记 + `POST /earned/{date}/{itemId}`（服务端幂等防刷）
- `currencyStore.addXP(r, ...)`（`currency.js:38-42`）→ `PUT /balance` + 本地流水

**取消时漏了什么**：`completed === false` 分支是空的；`toggleBlockDone`（`schedule.js:465-489`）只翻转状态。不扣 XP、不删 earnedToday、不调后端。

**后端无回退接口**：`server/main.py:593-600` 只有 GET/POST earned；`server/db.py:1539-1563` 只有 `is_earned/mark_earned/get_all_earned`；earned 表定义在 db.py 三套方言 schema（226/529/859 三处）。

**次生不一致**：取消后 itemId 残留在 earnedToday → 再次完成 awardOnce 返回 false 不再发 XP，余额与登记永久脱节。

**同款缺陷**：`RoutineItem.vue:43-46` 固定事务打卡注释明写"撤销完成：仅改状态，不发也不扣 XP"（+50 XP）。

**与 08-16 防抖改造无关**（XP 链路独立 fire-and-forget）。

### 修复方向
1. 后端加 `DELETE /api/earned/{date}/{item_id}` + `db.unmark_earned`（三套方言）
2. `schedule.js` 加 `revokeAward(date, itemId)`
3. `currency.js` 加 `subtractXP(amount, reason)`（流水 type:'refund'）
4. `handleToggleTask` else 分支调用
5. **金额口径：award 时存证金额**（重算会因中途改 duration/priority 对不上账）；RoutineItem +50 同理

## Bug 3：分针异常 —— transform-origin 残留死代码

**根因**（`frontend/src/components/plan/StarDial.vue:269-271`）：

```css
.sd-min-hand { transform-origin: 120px 120px; }
```

- SVG `transform` 属性是 CSS transform 的呈现属性，`transform-origin` 包裹整个变换列表：最终矩阵 = T(origin)·rotate(a,120,120)·T(-origin)
- 分针 `<g>` 属性变换 `rotate(minuteAngle 120 120)`（StarDial.vue:196）本已绕 (120,120)；被套 origin 后等效绕 (240,240) 旋转 → 分针沿大圆飞离表盘
- 时针 `<g>`（:190）无此 CSS 故正常；a=0 时净效果恒等 → 默认 09:00 看着正常，拖到非 0 分钟就飞
- 历史脉络：08-15 修"分针 scale 覆盖 rotate"时把 anime 脉冲挪到中心读数，但配合 scale 加的 transform-origin 没删

### 修复方向
- 删掉 StarDial.vue:269-271 三行即可（角度计算/5min 吸附/angleFromEvent 均核对无问题）
- 顺带：`snapPulse` 缩放的 `.sd-time` 是 inline span，加 `display: inline-block` 脉冲才生效（spec 已有此条约束）
