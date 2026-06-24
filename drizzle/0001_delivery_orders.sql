CREATE TYPE "order_status" AS ENUM ('pending', 'delivering', 'completed', 'cancelled');

CREATE TABLE "delivery_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id"),
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "assigned_employee_id" uuid REFERENCES "employees"("id"),
  "delivery_id" uuid REFERENCES "deliveries"("id"),
  "status" "order_status" DEFAULT 'pending' NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);

CREATE TABLE "delivery_order_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL REFERENCES "delivery_orders"("id"),
  "cylinder_type_id" uuid NOT NULL REFERENCES "cylinder_types"("id"),
  "cylinders_out" integer NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL
);

CREATE INDEX "delivery_orders_status_idx" ON "delivery_orders" ("status");
CREATE INDEX "delivery_orders_created_at_idx" ON "delivery_orders" ("created_at");
