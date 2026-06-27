import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  bigint,
  pgEnum,
  numeric,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["owner", "co_owner", "employee"]);
export const customerTypeEnum = pgEnum("customer_type", [
  "household",
  "restaurant",
  "industrial",
]);
export const deliveryStatusEnum = pgEnum("delivery_status", ["active", "voided"]);
export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "delivering",
  "completed",
  "cancelled",
]);
export const paymentMethodEnum = pgEnum("payment_method", ["cash", "transfer"]);
export const ledgerReferenceEnum = pgEnum("ledger_reference", [
  "delivery",
  "payment",
  "void",
]);
export const sessionTypeEnum = pgEnum("session_type", ["telegram", "magic_link", "web"]);

export const employees = pgTable("employees", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  telegramUserId: bigint("telegram_user_id", { mode: "number" }).notNull().unique(),
  telegramUsername: text("telegram_username"),
  name: text("name").notNull(),
  role: userRoleEnum("role").notNull(),
  employeeId: uuid("employee_id").references(() => employees.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inviteCodes = pgTable("invite_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  role: userRoleEnum("role").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedByUserId: uuid("used_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: text("token").notNull().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  type: sessionTypeEnum("type").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    address: text("address").notNull(),
    note: text("note"),
    customerType: customerTypeEnum("customer_type").notNull().default("household"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("customers_phone_idx").on(t.phone)],
);

export const cylinderTypes = pgTable("cylinder_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  capacityKg: numeric("capacity_kg", { precision: 6, scale: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pricePeriods = pgTable("price_periods", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
  effectiveTo: timestamp("effective_to", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cylinderPrices = pgTable(
  "cylinder_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pricePeriodId: uuid("price_period_id")
      .notNull()
      .references(() => pricePeriods.id),
    cylinderTypeId: uuid("cylinder_type_id")
      .notNull()
      .references(() => cylinderTypes.id),
    pricePerCylinder: integer("price_per_cylinder").notNull(),
  },
  (t) => [
    uniqueIndex("cylinder_prices_period_type_idx").on(
      t.pricePeriodId,
      t.cylinderTypeId,
    ),
  ],
);

export const deliveries = pgTable("deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id),
  pricePeriodId: uuid("price_period_id")
    .notNull()
    .references(() => pricePeriods.id),
  orderAmount: integer("order_amount").notNull(),
  cashReceived: integer("cash_received").notNull(),
  debtAmount: integer("debt_amount").notNull(),
  note: text("note"),
  status: deliveryStatusEnum("status").notNull().default("active"),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
});

export const deliveryLines = pgTable("delivery_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  deliveryId: uuid("delivery_id")
    .notNull()
    .references(() => deliveries.id),
  cylinderTypeId: uuid("cylinder_type_id")
    .notNull()
    .references(() => cylinderTypes.id),
  cylindersOut: integer("cylinders_out").notNull(),
  cylindersIn: integer("cylinders_in").notNull(),
  gasSurplusKg: numeric("gas_surplus_kg", { precision: 8, scale: 2 })
    .notNull()
    .default("0"),
  pricePerCylinderSnapshot: integer("price_per_cylinder_snapshot").notNull(),
  lineAmount: integer("line_amount").notNull(),
});

export const deliveryOrders = pgTable("delivery_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id),
  createdByUserId: uuid("created_by_user_id")
    .notNull()
    .references(() => users.id),
  assignedEmployeeId: uuid("assigned_employee_id").references(() => employees.id),
  deliveryId: uuid("delivery_id").references(() => deliveries.id),
  status: orderStatusEnum("status").notNull().default("pending"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const deliveryOrderLines = pgTable("delivery_order_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => deliveryOrders.id),
  cylinderTypeId: uuid("cylinder_type_id")
    .notNull()
    .references(() => cylinderTypes.id),
  cylindersOut: integer("cylinders_out").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const debtLedger = pgTable("debt_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id),
  amount: integer("amount").notNull(),
  referenceType: ledgerReferenceEnum("reference_type").notNull(),
  referenceId: uuid("reference_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cylinderLedger = pgTable("cylinder_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id),
  cylinderTypeId: uuid("cylinder_type_id")
    .notNull()
    .references(() => cylinderTypes.id),
  quantity: integer("quantity").notNull(),
  referenceType: ledgerReferenceEnum("reference_type").notNull(),
  referenceId: uuid("reference_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id),
  amount: integer("amount").notNull(),
  method: paymentMethodEnum("method").notNull(),
  note: text("note"),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
