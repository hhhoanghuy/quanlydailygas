import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.js";
import {
  activateInvite,
  assertOwner,
  buildInviteDeepLink,
  createInviteCode,
  exchangeMagicLink,
  loginWithTelegramWebApp,
  revokeSession,
} from "../services/auth.service.js";
import {
  createCustomer,
  deactivateCustomer,
  getCustomerDetail,
  getDebtByPhone,
  hardDeleteCustomer,
  listCustomers,
  listZeroDebtCustomers,
  updateCustomer,
} from "../services/customer.service.js";
import {
  createDelivery,
  listDeliveries,
  previewDelivery,
  voidDelivery,
} from "../services/delivery.service.js";
import { createPayment, listPayments } from "../services/payment.service.js";
import { getDashboard, getDashboardTrend, getStatsOrders, listDebtors } from "../services/stats.service.js";
import {
  createPricePeriod,
  getCurrentPrices,
  listCylinderTypes,
} from "../services/price-period.service.js";
import { listEmployees, listTeamMembers, setEmployeeActive } from "../services/employee.service.js";
import { getGasSurplusDashboard } from "../services/gas-surplus.service.js";
import { getOrderDetailForWeb, listOrders, previewOrderCorrection, correctCompletedOrder } from "../services/order.service.js";
import type { OrderCorrectionInput } from "../services/order.service.js";
import {
  backfillCylinderLedgerFromDeliveries,
  getCylinderSummaryByType,
  listCylinderHolders,
} from "../services/ledger.service.js";
import { forbiddenError, validationError } from "../../utils/errors.js";
import type { AuthUser } from "../middleware/auth.js";

const ENABLE_CYLINDER_LEDGER = process.env.ENABLE_CYLINDER_LEDGER === "true";
const ENABLE_GAS_SURPLUS = process.env.ENABLE_GAS_SURPLUS === "true";

export async function registerApiRoutes(app: FastifyInstance) {
  app.register(
    async (api) => {
      api.post("/auth/telegram", async (req) => {
        const body = req.body as {
          invite_code: string;
          telegram_user_id: number;
          telegram_username?: string;
          name: string;
        };
        const result = await activateInvite(api.db, {
          inviteCode: body.invite_code,
          telegramUserId: body.telegram_user_id,
          telegramUsername: body.telegram_username,
          name: body.name,
        });
        return {
          token: result.token,
          user: {
            id: result.user.id,
            name: result.user.name,
            role: result.user.role,
            employee_id: result.user.employeeId,
          },
        };
      });

      api.post("/auth/magic-link", async (req) => {
        const body = req.body as { code?: string };
        return exchangeMagicLink(api.db, body.code ?? "");
      });

      /** Đăng nhập qua Telegram WebApp — xác minh initData (chữ ký Telegram), không cần magic link */
      api.post("/auth/telegram/webapp", async (req) => {
        const body = req.body as { init_data?: string };
        if (!body.init_data?.trim()) throw validationError("Thiếu init_data");
        return loginWithTelegramWebApp(api.db, body.init_data.trim());
      });

      await api.register(async (secured) => {
        secured.addHook("preHandler", authMiddleware);

        secured.post("/auth/logout", async (req) => {
        const header = req.headers.authorization;
        if (header?.startsWith("Bearer ")) {
          await revokeSession(api.db, header.slice(7));
        }
        return { ok: true };
      });

        secured.get("/auth/me", async (req) => ({
        id: req.user!.id,
        name: req.user!.name,
        role: req.user!.role,
        employee_id: req.user!.employeeId,
      }));

        secured.get("/cylinder-types", async (req) => {
        return { data: await listCylinderTypes(api.db) };
      });

        secured.get("/price-periods/current", async (req) => {
        return getCurrentPrices(api.db);
      });

        secured.post("/price-periods", async (req) => {
        assertOwner(req.user!);
        const body = req.body as {
          name: string;
          effective_from: string;
          prices: { cylinder_type_id: string; price_per_cylinder: number }[];
        };
        return createPricePeriod(api.db, {
          name: body.name,
          effectiveFrom: new Date(body.effective_from),
          prices: body.prices.map((p) => ({
            cylinderTypeId: p.cylinder_type_id,
            pricePerCylinder: p.price_per_cylinder,
          })),
        });
      });

        secured.get("/customers", async (req) => {
        assertOwner(req.user!);
        const q = req.query as { search?: string; limit?: string; offset?: string };
        return {
          data: await listCustomers(api.db, {
            search: q.search,
            limit: q.limit ? Number(q.limit) : undefined,
            offset: q.offset ? Number(q.offset) : undefined,
          }),
        };
      });

        secured.post("/customers", async (req) => {
        assertOwner(req.user!);
        const body = req.body as Record<string, string>;
        return createCustomer(api.db, {
          name: body.name,
          phone: body.phone,
          address: body.address,
          note: body.note,
          customerType: body.customer_type as "household" | "restaurant" | "industrial",
        });
        });

        secured.put("/customers/:id", async (req) => {
        assertOwner(req.user!);
        const { id } = req.params as { id: string };
        const body = req.body as Record<string, string>;
        return updateCustomer(api.db, id, {
          name: body.name,
          phone: body.phone,
          address: body.address,
          note: body.note,
          customerType: body.customer_type as "household" | "restaurant" | "industrial",
        });
      });

        secured.patch("/customers/:id/deactivate", async (req) => {
        assertOwner(req.user!);
        const { id } = req.params as { id: string };
        return deactivateCustomer(api.db, id);
      });

        secured.delete("/customers/:id", async (req) => {
        assertOwner(req.user!);
        const { id } = req.params as { id: string };
        return hardDeleteCustomer(api.db, id);
      });

        secured.get("/customers/:id", async (req) => {
        assertOwner(req.user!);
        const { id } = req.params as { id: string };
        return getCustomerDetail(api.db, id, ENABLE_CYLINDER_LEDGER);
      });

        secured.get("/customers/by-phone/:phone/debt", async (req) => {
        const { phone } = req.params as { phone: string };
        return getDebtByPhone(api.db, phone);
        });

        secured.get("/deliveries", async (req) => {
        assertOwner(req.user!);
        const q = req.query as { from?: string; to?: string };
        return {
          data: await listDeliveries(api.db, {
            from: q.from ? new Date(q.from) : undefined,
            to: q.to ? new Date(q.to) : undefined,
          }),
        };
      });

        secured.post("/deliveries/preview", async (req) => {
        const body = req.body as DeliveryBody;
        return previewDelivery(api.db, mapDeliveryBody(req.user!, body));
      });

        secured.post("/deliveries", async (req) => {
        const body = req.body as DeliveryBody;
        return createDelivery(api.db, mapDeliveryBody(req.user!, body));
      });

        secured.post("/deliveries/:id/void", async (req) => {
        assertOwner(req.user!);
        const { id } = req.params as { id: string };
        return voidDelivery(api.db, id);
        });

        secured.get("/payments", async (req) => {
        assertOwner(req.user!);
        const q = req.query as { from?: string; to?: string; customer_id?: string };
        return {
          data: await listPayments(api.db, {
            from: q.from ? new Date(q.from) : undefined,
            to: q.to ? new Date(q.to) : undefined,
            customerId: q.customer_id,
          }),
        };
      });

        secured.post("/payments", async (req) => {
        assertOwner(req.user!);
        const body = req.body as {
          customer_id: string;
          amount: number;
          method: "cash" | "transfer";
          note?: string;
          paid_at: string;
        };
        return createPayment(api.db, {
          customerId: body.customer_id,
          amount: body.amount,
          method: body.method,
          note: body.note,
          paidAt: new Date(body.paid_at),
        });
        });

        secured.get("/employees", async (req) => {
        assertOwner(req.user!);
        const team = await listTeamMembers(api.db);
        return {
          data: team.filter((m) => !m.isOwner),
          team,
          owner: team.find((m) => m.isOwner) ?? null,
        };
      });

        secured.patch("/employees/:id/active", async (req) => {
        assertOwner(req.user!);
        const { id } = req.params as { id: string };
        const body = req.body as { active: boolean };
        return setEmployeeActive(api.db, id, body.active);
      });

        secured.get("/cylinders/holders", async (req) => {
        assertOwner(req.user!);
        const q = req.query as { search?: string };
        return { data: await listCylinderHolders(api.db, { search: q.search }) };
      });

        secured.get("/cylinders/summary", async (req) => {
        assertOwner(req.user!);
        return { data: await getCylinderSummaryByType(api.db) };
      });

        secured.get("/orders/stats", async (req) => {
        assertOwner(req.user!);
        return getStatsOrders(api.db);
      });

        secured.get("/orders", async (req) => {
        assertOwner(req.user!);
        const q = req.query as { status?: string; limit?: string; offset?: string };
        return {
          data: await listOrders(api.db, {
            status: q.status,
            limit: q.limit ? Number(q.limit) : undefined,
            offset: q.offset ? Number(q.offset) : undefined,
          }),
        };
      });

        secured.get("/orders/:id", async (req) => {
        assertOwner(req.user!);
        const { id } = req.params as { id: string };
        return getOrderDetailForWeb(api.db, id);
      });

        secured.post("/orders/:id/preview-correction", async (req) => {
        assertOwner(req.user!);
        const { id } = req.params as { id: string };
        return previewOrderCorrection(api.db, id, mapCorrectionBody(req.body as CorrectionBody), {
          allowGasSurplus: ENABLE_GAS_SURPLUS,
        });
      });

        secured.post("/orders/:id/correct", async (req) => {
        assertOwner(req.user!);
        const { id } = req.params as { id: string };
        return correctCompletedOrder(api.db, id, mapCorrectionBody(req.body as CorrectionBody), {
          allowGasSurplus: ENABLE_GAS_SURPLUS,
          enableCylinderLedger: ENABLE_CYLINDER_LEDGER,
        });
      });

        secured.get("/gas-surplus", async (req) => {
        assertOwner(req.user!);
        return getGasSurplusDashboard(api.db);
      });

        secured.get("/dashboard/trend", async (req) => {
        assertOwner(req.user!);
        const q = req.query as { days?: string };
        const days = Math.min(30, Math.max(3, Number(q.days) || 7));
        return getDashboardTrend(api.db, days);
      });

        secured.get("/dashboard", async (req) => {
        assertOwner(req.user!);
        const q = req.query as { date?: string; period?: "day" | "month" };
        const date = q.date ? new Date(q.date) : new Date();
        const period = q.period === "month" ? "month" : "day";
        return getDashboard(api.db, date, {
          includeCylinders: ENABLE_CYLINDER_LEDGER,
          period,
        });
      });

        secured.get("/dashboard/debtors", async (req) => {
        assertOwner(req.user!);
        return { data: await listDebtors(api.db) };
      });

        secured.get("/dashboard/zero-debt-customers", async (req) => {
        assertOwner(req.user!);
        return { data: await listZeroDebtCustomers(api.db) };
      });

        secured.post("/invite-codes", async (req) => {
        assertOwner(req.user!);
        const body = req.body as { role?: "employee"; expires_in_hours?: number };
        const code = await createInviteCode(
          api.db,
          body.role ?? "employee",
          body.expires_in_hours ?? 72,
        );
        return {
          code: code.code,
          role: code.role,
          expires_at: code.expiresAt,
          telegram_deep_link: buildInviteDeepLink(code.code),
        };
      });

        secured.post("/admin/backfill-cylinder-ledger", async (req) => {
        assertOwner(req.user!);
        if (!ENABLE_CYLINDER_LEDGER) {
          throw forbiddenError("Cylinder ledger chưa bật");
        }
        const count = await backfillCylinderLedgerFromDeliveries(api.db);
        return { backfilled_deliveries: count };
      });
      });
    },
    { prefix: "/api/v1" },
  );
}

interface DeliveryBody {
  customer_id: string;
  employee_id?: string;
  cash_received: number;
  note?: string;
  delivered_at: string;
  lines: {
    cylinder_type_id: string;
    cylinders_out: number;
    cylinders_in: number;
    gas_surplus_kg?: number;
  }[];
}

function mapDeliveryBody(user: AuthUser, body: DeliveryBody) {
  let employeeId: string;
  if (user.role === "employee") {
    if (!user.employeeId) throw validationError("NV chưa gắn employee_id");
    employeeId = user.employeeId;
  } else {
    if (!body.employee_id) {
      throw validationError("employee_id bắt buộc khi chủ tạo delivery");
    }
    employeeId = body.employee_id;
  }

  return {
    customerId: body.customer_id,
    employeeId,
    cashReceived: body.cash_received,
    note: body.note,
    deliveredAt: new Date(body.delivered_at),
    lines: body.lines.map((l) => ({
      cylinderTypeId: l.cylinder_type_id,
      cylindersOut: l.cylinders_out,
      cylindersIn: l.cylinders_in,
      gasSurplusKg: l.gas_surplus_kg,
    })),
    allowGasSurplus: process.env.ENABLE_GAS_SURPLUS === "true",
    enableCylinderLedger: ENABLE_CYLINDER_LEDGER,
  };
}

interface CorrectionBody {
  lines: {
    cylinders_out: number;
    cylinders_in: number;
    gas_surplus_kg?: number;
  }[];
  cash_received: number;
  payment_method: "tm" | "ck" | "no";
  employee_id: string;
  note?: string;
}

function mapCorrectionBody(body: CorrectionBody): OrderCorrectionInput {
  if (!body.lines?.length) throw validationError("Thiếu dòng bình");
  if (!body.employee_id) throw validationError("employee_id bắt buộc");
  if (!["tm", "ck", "no"].includes(body.payment_method)) {
    throw validationError("payment_method phải là tm, ck hoặc no");
  }
  return {
    lines: body.lines.map((l) => ({
      cylindersOut: Number(l.cylinders_out),
      cylindersIn: Number(l.cylinders_in),
      gasSurplusKg: l.gas_surplus_kg != null ? Number(l.gas_surplus_kg) : 0,
    })),
    cashReceived: Number(body.cash_received),
    paymentMethod: body.payment_method,
    employeeId: body.employee_id,
    note: body.note,
  };
}
