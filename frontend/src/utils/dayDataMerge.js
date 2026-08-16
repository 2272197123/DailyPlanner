/* /day-data/{date} 的服务端整写是覆盖式的，各 store 都用「GET 合并再 PUT」。
   但 read-modify-write 本身有竞态：archive.js（archiveDay/deleteReview）与
   routines.js（_persistDaily）并发写同一日期时，两个 GET 都拿到旧快照，
   后落地的 PUT 会把先 PUT 写入的字段冲掉（存档清掉 routines，或反之）。
   参照 schedule.js 的 _queueAwardReq 模式：按 date 串行化合并写链。 */
const _mergeChains = new Map() // date → Promise 链尾

/** 串行执行某日期的一次 day-data 合并写（fn 内部自行 GET+PUT 并兜底异常） */
export function queueDayDataMerge(date, fn) {
  const prev = _mergeChains.get(date) || Promise.resolve()
  /* fn 失败静默且不断链：后续合并写仍能落地（各写方字段独立，互不依赖成败） */
  const p = prev.then(() => fn().catch(() => {}))
  _mergeChains.set(date, p)
  p.then(() => { if (_mergeChains.get(date) === p) _mergeChains.delete(date) })
  return p
}
