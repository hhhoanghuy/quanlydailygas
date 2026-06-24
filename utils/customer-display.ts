export type CustomerPick = { name: string; phone: string; address?: string | null };

/** Dòng kết quả tìm khách (bot Telegram). */
export function formatCustomerSearchLine(c: CustomerPick, suffix = ""): string {
  const addr = c.address?.trim() || "—";
  return `· ${c.name} — ${c.phone}\n  📍 ${addr}${suffix}`;
}

/** Nhãn nút inline (tối đa 64 ký tự Telegram). */
export function customerPickButtonLabel(c: CustomerPick): string {
  const addr = (c.address?.trim() || "").replace(/\s+/g, " ");
  if (!addr) return `${c.name} — ${c.phone}`.slice(0, 64);
  const full = `${c.name} · ${addr}`;
  if (full.length <= 64) return full;
  const namePart = c.name.length > 20 ? `${c.name.slice(0, 17)}…` : c.name;
  const room = 64 - namePart.length - 3;
  const shortAddr =
    addr.length > room ? `${addr.slice(0, Math.max(room - 1, 8))}…` : addr;
  return `${namePart} · ${shortAddr}`.slice(0, 64);
}

/** Danh sách chọn khách khi lên đơn. */
export function formatCustomerPickList(results: CustomerPick[]): string {
  return results
    .map((c, i) => {
      const addr = c.address?.trim() || "—";
      return `${i + 1}. ${c.name} — ${c.phone}\n   📍 ${addr}`;
    })
    .join("\n\n");
}

export function formatCustomerConfirmLine(c: CustomerPick): string {
  const addr = c.address?.trim();
  return addr ? `✅ ${c.name}\n📍 ${addr}` : `✅ ${c.name}`;
}
