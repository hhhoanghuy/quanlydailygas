/** Làm tròn đến bội số 1.000đ — ROUND_1000 */
export function round1000(amount: number): number {
  return Math.round(amount / 1000) * 1000;
}

export function formatVnd(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("vi-VN");
  if (amount < 0) {
    return `Dư: ${formatted}đ`;
  }
  return `${formatted}đ`;
}

export interface LinePricingInput {
  cylindersOut: number;
  pricePerCylinder: number;
  capacityKg: number;
  gasSurplusKg?: number;
  /** P3: bật công thức trừ gas. P1/P2: false */
  allowGasSurplus?: boolean;
}

export interface LinePricingResult {
  lineAmount: number;
  rawBeforeRound: number;
}

export function calculateLineAmount(input: LinePricingInput): LinePricingResult {
  const {
    cylindersOut,
    pricePerCylinder,
    capacityKg,
    gasSurplusKg = 0,
    allowGasSurplus = false,
  } = input;

  const base = cylindersOut * pricePerCylinder;
  let raw = base;

  if (allowGasSurplus && gasSurplusKg > 0 && capacityKg >= 20) {
    raw = base - (pricePerCylinder / capacityKg) * gasSurplusKg;
  }

  return {
    rawBeforeRound: raw,
    lineAmount: round1000(raw),
  };
}

export function calculateOrderAmount(lineAmounts: number[]): number {
  return lineAmounts.reduce((sum, a) => sum + a, 0);
}

export function calculateDebtAmount(orderAmount: number, cashReceived: number): number {
  return orderAmount - cashReceived;
}
