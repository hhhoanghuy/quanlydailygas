import { describe, it, expect } from "vitest";
import {
  round1000,
  calculateLineAmount,
  calculateOrderAmount,
  calculateDebtAmount,
  formatVnd,
} from "../../utils/money.js";

describe("round1000", () => {
  it("rounds to nearest thousand", () => {
    expect(round1000(2_568_888.89)).toBe(2_569_000);
    expect(round1000(700_000)).toBe(700_000);
  });
});

describe("calculateLineAmount", () => {
  it("PRC-H01: no gas surplus", () => {
    const r = calculateLineAmount({
      cylindersOut: 2,
      pricePerCylinder: 350_000,
      capacityKg: 12,
    });
    expect(r.lineAmount).toBe(700_000);
  });

  it("PRC-H02: CN 45kg with gas surplus (P3 formula)", () => {
    const r = calculateLineAmount({
      cylindersOut: 4,
      pricePerCylinder: 680_000,
      capacityKg: 45,
      gasSurplusKg: 10,
      allowGasSurplus: true,
    });
    expect(r.lineAmount).toBe(2_569_000);
  });

  it("ignores gas surplus when allowGasSurplus false (P1)", () => {
    const r = calculateLineAmount({
      cylindersOut: 4,
      pricePerCylinder: 680_000,
      capacityKg: 45,
      gasSurplusKg: 10,
      allowGasSurplus: false,
    });
    expect(r.lineAmount).toBe(2_720_000);
  });
});

describe("calculateOrderAmount", () => {
  it("PRC-H03: sums rounded lines", () => {
    expect(calculateOrderAmount([700_000, 2_569_000])).toBe(3_269_000);
  });
});

describe("calculateDebtAmount", () => {
  it("computes debt from order and cash", () => {
    expect(calculateDebtAmount(3_269_000, 1_000_000)).toBe(2_269_000);
  });
});

describe("formatVnd", () => {
  it("formats negative as Dư", () => {
    expect(formatVnd(-200_000)).toContain("Dư");
  });
});
