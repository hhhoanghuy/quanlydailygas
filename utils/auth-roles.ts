/** Tối đa co-owner (không tính chủ chính role `owner`). */
export const MAX_CO_OWNERS = 3;

export type AdminRole = "owner" | "co_owner";

export function isAdminRole(role: string): role is AdminRole {
  return role === "owner" || role === "co_owner";
}

export function isPrimaryOwnerRole(role: string): boolean {
  return role === "owner";
}

export function adminMenuRole(role: string): string {
  return role === "employee" ? "employee" : "admin";
}

export function roleDisplayLabel(role: string): string {
  if (role === "owner") return "Chủ đại lý";
  if (role === "co_owner") return "Quản trị viên";
  if (role === "employee") return "Nhân viên";
  return role;
}
