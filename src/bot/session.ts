export type SessionStep =
  | "idle"
  | "debt_phone"
  | "search_query"
  | "customer_add"
  | "customer_confirm"
  | "customer_search"
  | "order_customer_phone"
  | "order_line_qty"
  | "fulfill_compact"
  | "settings_price_amount"
  | "delivery_phone"
  | "delivery_line"
  | "delivery_cash"
  | "payment_search"
  | "payment_input"
  | "team_edit"
  | "team_assign_order"
  | "customer_edit";

export interface CustomerDraft {
  name: string;
  phone: string;
  address: string;
  customerType?: "household" | "restaurant" | "industrial";
}

export interface OrderDraft {
  customerId: string;
  customerName: string;
  lines: {
    cylinderTypeId: string;
    cylinderName: string;
    cylindersOut: number;
  }[];
  pendingTypeId?: string;
  pendingTypeName?: string;
}

export interface FulfillDraft {
  orderId: string;
  customerId: string;
  customerName: string;
  lines: {
    cylinderTypeId: string;
    cylinderName: string;
    cylindersOut: number;
    capacityKg?: number;
  }[];
  paymentMethod?: "cash" | "transfer";
  cylindersIn?: number[];
  gasSurplusKgByLine?: number[];
  note?: string;
  cashReceived?: number;
  preview?: {
    orderAmount: number;
    debtAmount: number;
    cashReceived: number;
  };
}

export interface DeliveryDraft {
  customerId: string;
  customerName: string;
  lines: {
    cylinderTypeId: string;
    cylinderName: string;
    cylindersOut: number;
    cylindersIn: number;
  }[];
  pendingTypeId?: string;
  pendingTypeName?: string;
  preview?: {
    orderAmount: number;
    debtAmount: number;
    cashReceived: number;
  };
}

export interface PriceEditDraft {
  cylinderTypeId: string;
  cylinderName: string;
}

export interface PaymentDraft {
  customerId: string;
  customerName: string;
}

export interface TeamEditDraft {
  employeeId: string;
  name: string;
  phone: string;
}

export interface TeamAssignDraft {
  employeeId: string;
  employeeName: string;
}

export interface CustomerEditDraft {
  customerId: string;
  name: string;
  phone: string;
  address: string;
}

export interface ChatSession {
  step: SessionStep;
  delivery?: DeliveryDraft;
  customerDraft?: CustomerDraft;
  orderDraft?: OrderDraft;
  fulfillDraft?: FulfillDraft;
  priceEditDraft?: PriceEditDraft;
  paymentDraft?: PaymentDraft;
  teamEditDraft?: TeamEditDraft;
  teamAssignDraft?: TeamAssignDraft;
  customerEditDraft?: CustomerEditDraft;
}

const sessions = new Map<number, ChatSession>();

export function getSession(telegramUserId: number): ChatSession {
  return sessions.get(telegramUserId) ?? { step: "idle" };
}

export function setSession(telegramUserId: number, session: ChatSession) {
  sessions.set(telegramUserId, session);
}

export function clearSession(telegramUserId: number) {
  sessions.delete(telegramUserId);
}
