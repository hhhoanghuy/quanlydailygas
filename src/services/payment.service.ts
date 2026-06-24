import { eq, and, gte, lte, desc } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { payments, customers } from "../db/schema.js";
import { validationError } from "../../utils/errors.js";
import { insertDebtEntry, getDebtBalance } from "./ledger.service.js";
import { formatVnd } from "../../utils/money.js";

export async function listPayments(
  db: Db,
  opts?: { from?: Date; to?: Date; customerId?: string; limit?: number },
) {
  const limit = opts?.limit ?? 100;
  const conditions = [];

  if (opts?.from) conditions.push(gte(payments.paidAt, opts.from));
  if (opts?.to) conditions.push(lte(payments.paidAt, opts.to));
  if (opts?.customerId) conditions.push(eq(payments.customerId, opts.customerId));

  const rows = await db
    .select({
      id: payments.id,
      amount: payments.amount,
      method: payments.method,
      note: payments.note,
      paidAt: payments.paidAt,
      customerId: payments.customerId,
      customerName: customers.name,
      customerPhone: customers.phone,
    })
    .from(payments)
    .innerJoin(customers, eq(customers.id, payments.customerId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(payments.paidAt))
    .limit(limit);

  return rows;
}

export async function createPayment(
  db: Db,
  input: {
    customerId: string;
    amount: number;
    method: "cash" | "transfer";
    note?: string;
    paidAt: Date;
  },
) {
  if (input.amount <= 0) {
    throw validationError("Số tiền phải lớn hơn 0");
  }
  if (!["cash", "transfer"].includes(input.method)) {
    throw validationError("method phải là cash hoặc transfer");
  }

  const [payment] = await db
    .insert(payments)
    .values({
      customerId: input.customerId,
      amount: input.amount,
      method: input.method,
      note: input.note,
      paidAt: input.paidAt,
    })
    .returning();

  await insertDebtEntry(db, {
    customerId: input.customerId,
    amount: -input.amount,
    referenceType: "payment",
    referenceId: payment.id,
  });

  const debtBalance = await getDebtBalance(db, input.customerId);

  return {
    payment,
    debtBalance,
    display: debtBalance < 0 ? formatVnd(debtBalance) : formatVnd(debtBalance),
  };
}
