// 日付まわりの小さな純粋関数。
/** 今日の日付（YYYY-MM-DD, ローカルタイム）。 */
export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}
