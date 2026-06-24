export function orderStatusText(status: string, short = false) {
  const map: Record<string, string> = short
    ? {
        pending: "chưa giao",
        delivering: "đang giao",
        completed: "đã giao",
        cancelled: "đã huỷ",
      }
    : {
        pending: "⏳ Chưa giao",
        delivering: "🚚 Đang giao",
        completed: "✅ Đã giao",
        cancelled: "❌ Đã huỷ",
      };
  return map[status] ?? status;
}
