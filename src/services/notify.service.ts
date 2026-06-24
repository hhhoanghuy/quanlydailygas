import type { Api } from "grammy";
import { InlineKeyboard } from "grammy";
import type { Db } from "../db/index.js";
import {
  formatOrderNotification,
  getOrderDetail,
  listEmployeeTelegramIds,
} from "./order.service.js";

export async function notifyEmployeesNewOrder(
  db: Db,
  api: Api,
  orderId: string,
) {
  const { order, lines } = await getOrderDetail(db, orderId);
  const lineSummary = lines.map((l) => `${l.typeName} ×${l.cylindersOut}`).join(", ");
  const text = formatOrderNotification(
    order.id.slice(0, 8),
    order.customerName,
    order.customerAddress,
    lineSummary,
  );

  const kb = new InlineKeyboard()
    .text("📋 Xem đơn", `order_open:${orderId}`)
    .row()
    .text("🚚 Giao ngay", `order_fulfill:${orderId}`);

  if (!order.assignedEmployeeId) {
    console.warn("Order has no assigned employee, skip notify", orderId);
    return;
  }

  const employees = await listEmployeeTelegramIds(db, order.assignedEmployeeId);
  if (!employees.length) {
    console.warn("No employees to notify for order", orderId);
    return;
  }

  await Promise.allSettled(
    employees.map((emp) =>
      api
        .sendMessage(emp.telegramUserId, text, { reply_markup: kb })
        .catch((err) => {
          console.error(`Notify ${emp.name} failed:`, err);
        }),
    ),
  );
}
