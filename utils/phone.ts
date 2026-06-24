/** Chuẩn hoá SĐT VN: bỏ khoảng trắng, +84 → 0 */
export function normalizePhone(phone: string): string {
  let p = phone.trim().replace(/[\s.\-()]/g, "");
  if (p.startsWith("+84")) p = `0${p.slice(3)}`;
  else if (p.startsWith("84") && p.length >= 11) p = `0${p.slice(2)}`;
  return p;
}

export function looksLikePhone(query: string): boolean {
  const digits = query.replace(/\D/g, "");
  return digits.length >= 9 && digits.length <= 11;
}
