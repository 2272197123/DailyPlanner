# 存档系统 — 技术设计

## 1. 数据模型

### 1.1 每日独立数据副本 `dp_day_data_{date}`

```javascript
// 每个日期存储自己完整的独立数据副本
{
  "blocks": [           // 该日目标任务（含完成状态）
    { "id": "...", "subject": "...", "duration": 60, "completed": true,
      "category": "study", "priority": "high", "goalId": "g_xxx", "phase": "...",
      "flowHint": "...", "subtasks": [{ "text": "...", "done": false, "estMin": 20 }]
    }
  ],
  "routines": [         // 该日日课副本（从模板Copy，独立修改）
    { "id": "r_xxx", "icon": "🏃", "name": "晨跑", "duration": 30, "note": "" }
  ],
  "routineProgress": {}, // 该日日课完成状态
  "goalsSnapshot": {    // 该日目标的当时状态快照
    "g_xxx": { "title": "...", "currentPhase": "P1", "phaseProgress": 45 }
  },
  "timelineCfg": {},    // 时间轴配置（起点+顺序）
  "progress": {},       // 反馈与评分
  "initFromTemplate": "2026-08-05T10:30:00Z",  // 首次初始化时间
  "archiveData": null   // 存档后才填充（见下）
}
```

### 1.2 存档快照（附加到当日副本的 archiveData 字段）

```javascript
{
  "archivedAt": "2026-08-05T23:45:00Z",
  "selfReview": { "rating": 4, "note": "今天效率不错" },
  "aiReview": "你今天的完成率是 80%...",  // AI 生成的评价文字
  "summary": { "tasks": { "total": 5, "done": 4 }, "routines": { "total": 3, "done": 3 } }
}
```

### 1.3 全局日课模板（保持不变但用途改变）

`store.routines` 不再直接用于渲染。它只是"出厂默认值"。新日期首次访问时 Copy 到当日副本，之后当日只读写自己的副本。

### 1.4 存储层级

```
dp_day_data_{date}        ← 每日独立数据（主存储）
dp_day_data_{date}.archiveData  ← 存档时附加
dp_routines               ← 全局预设模板（仅 Copy 源）
dp_archive_index          ← 存档日期索引数组
dp_prefs.archiveHour      ← 用户自定义存档时间（默认 23）
dp_prefs.archiveMinute    ← 用户自定义存档时间（默认 30）
```

## 2. 数据流

### 2.1 日期首次访问（日期初始化）

```
store.currentDate 变更
  → 检查 LS 中 dp_day_data_{date} 是否存在
  → 不存在 → 从模板 Copy：
    1. 从 store.routines Copy 日课副本
    2. 从 store.bigGoals 生成目标快照
    3. 创建空的 blocks + routineProgress
    4. 写入 dp_day_data_{date}
  → 存在 → 从 dp_day_data_{date} 加载到 store.schedules[date] + 渲染
  → 如果该日期有 archiveData → 渲染只读模式
```

### 2.2 当天编辑

```
用户编辑任务/日课
  → 更新 store 中的当日数据结构
  → 同步写入 dp_day_data_{date}（即时持久化）
  → 同步到服务器
```

### 2.3 存档

```
触发存档（到达设定时间 / 手动存档）
  → 检查 dp_day_data_{date} 是否有 archiveData（防重复）
  → 弹出存档面板：用户打分 + 文字自评
  → 生成 summary 统计数据
  → 调用 AI API（携带当日完成数据 + AI 人设 prompt）
  → 将 {archivedAt, selfReview, aiReview, summary} 写入 dp_day_data_{date}.archiveData
  → 更新 dp_archive_index
  → 同步到服务器 archive 表
  → UI 切换到只读模式
```

### 2.4 历史日期查看

```
导航到历史日期
  → 加载 dp_day_data_{date}
  → 如果有 archiveData → 只读渲染 + 显示自评/AI评价/统计
  → 如果无 archiveData → 只读渲染 + 提示未存档
```

## 3. 关键接口变更

### 3.1 新增函数

```javascript
// 日期初始化
initDailyData(date)        // 首次访问日期时从模板Copy
loadDailyData(date)        // 从LS加载当日数据
saveDailyData(date, data)  // 保存当日数据

// 存档
triggerArchive(date)       // 触发存档流程
renderArchivePanel(date)   // 渲染存档自评面板
requestAiReview(date)      // 调用AI生成评价
saveArchiveToData(date)    // 写入archiveData
exportToMarkdown(date)     // 导出md
exportToPDF(date)          // 导出pdf

// 日课模板
pushRoutinesToTemplate(date) // 将当日日课改动推送到模板
```

### 3.2 修改函数

```javascript
// toggles.js
toggleComplete(id)  → 完成后写 dp_day_data_{date}（不是 dp_schedules）
toggleRoutine(id)   → 同上

// schedule.js
generateSchedule()  → 写 dp_day_data_{date}.blocks
syncPlanToServer()  → 不变，只是源数据来自 dp_day_data_{date}

// archive.js
isDateLocked(date)  → 检查 dp_day_data_{date}.archiveData 是否存在
isDateArchived(date) → 同上
archiveDay(date)    → 改为写入 dp_day_data_{date}.archiveData
```

### 3.3 移除/废弃

```javascript
dp_schedules            → 废弃，改为 dp_day_data_{date}
dp_routineProgress      → 废弃，并入 dp_day_data_{date}.routineProgress
dp_timelineCfg          → 废弃，并入 dp_day_data_{date}.timelineCfg
dp_progress             → 废弃，并入 dp_day_data_{date}.progress
dp_archive_{date}       → 废弃，改为 dp_day_data_{date}.archiveData
```

## 4. 兼容性

### 4.1 旧数据迁移

检测到旧格式（`dp_schedules` 存在但 `dp_day_data_{date}` 不存在）时，自动迁移：
1. 从 `dp_schedules[date]` 读取 blocks
2. 从 `store.routines` Copy 当前日课
3. 从 `dp_routineProgress[date]` 读取完成状态
4. 组装为 `dp_day_data_{date}` 写入
5. 不删除旧键（保守策略）

### 4.2 回滚

如果出现问题，可以恢复旧行为：`dp_day_data_{date}` 不存在时，回退读 `dp_schedules`。
迁移工具路径不变，不影响已工作的旧数据路径。
