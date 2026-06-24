CREATE TYPE "public"."user_role" AS ENUM('owner', 'employee');
CREATE TYPE "public"."customer_type" AS ENUM('household', 'restaurant', 'industrial');
CREATE TYPE "public"."delivery_status" AS ENUM('active', 'voided');
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'transfer');
CREATE TYPE "public"."ledger_reference" AS ENUM('delivery', 'payment', 'void');
CREATE TYPE "public"."session_type" AS ENUM('telegram', 'magic_link');

CREATE TABLE IF NOT EXISTS "employees" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "phone" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "telegram_user_id" bigint NOT NULL UNIQUE,
  "telegram_username" text,
  "name" text NOT NULL,
  "role" "user_role" NOT NULL,
  "employee_id" uuid REFERENCES "employees"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "invite_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" text NOT NULL UNIQUE,
  "role" "user_role" NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "used_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token" text NOT NULL UNIQUE,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "type" "session_type" NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "customers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "phone" text NOT NULL,
  "address" text NOT NULL,
  "note" text,
  "customer_type" "customer_type" DEFAULT 'household' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "customers_phone_idx" ON "customers" ("phone");

CREATE TABLE IF NOT EXISTS "cylinder_types" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "capacity_kg" numeric(6,2) NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "price_periods" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "effective_from" timestamptz NOT NULL,
  "effective_to" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "cylinder_prices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "price_period_id" uuid NOT NULL REFERENCES "price_periods"("id"),
  "cylinder_type_id" uuid NOT NULL REFERENCES "cylinder_types"("id"),
  "price_per_cylinder" integer NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "cylinder_prices_period_type_idx" ON "cylinder_prices" ("price_period_id","cylinder_type_id");

CREATE TABLE IF NOT EXISTS "deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id"),
  "employee_id" uuid NOT NULL REFERENCES "employees"("id"),
  "price_period_id" uuid NOT NULL REFERENCES "price_periods"("id"),
  "order_amount" integer NOT NULL,
  "cash_received" integer NOT NULL,
  "debt_amount" integer NOT NULL,
  "note" text,
  "status" "delivery_status" DEFAULT 'active' NOT NULL,
  "delivered_at" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "voided_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "delivery_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "delivery_id" uuid NOT NULL REFERENCES "deliveries"("id"),
  "cylinder_type_id" uuid NOT NULL REFERENCES "cylinder_types"("id"),
  "cylinders_out" integer NOT NULL,
  "cylinders_in" integer NOT NULL,
  "gas_surplus_kg" numeric(8,2) DEFAULT '0' NOT NULL,
  "price_per_cylinder_snapshot" integer NOT NULL,
  "line_amount" integer NOT NULL
);

CREATE TABLE IF NOT EXISTS "debt_ledger" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id"),
  "amount" integer NOT NULL,
  "reference_type" "ledger_reference" NOT NULL,
  "reference_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "cylinder_ledger" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id"),
  "cylinder_type_id" uuid NOT NULL REFERENCES "cylinder_types"("id"),
  "quantity" integer NOT NULL,
  "reference_type" "ledger_reference" NOT NULL,
  "reference_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id"),
  "amount" integer NOT NULL,
  "method" "payment_method" NOT NULL,
  "note" text,
  "paid_at" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
