import { describe, it, expect } from "vitest";
import { normalizePhone, looksLikePhone } from "../../utils/phone.js";

describe("normalizePhone", () => {
  it("strips spaces and dashes", () => {
    expect(normalizePhone("0901 234 567")).toBe("0901234567");
    expect(normalizePhone("0901-234-567")).toBe("0901234567");
  });

  it("converts +84 to 0", () => {
    expect(normalizePhone("+84901234567")).toBe("0901234567");
  });

  it("converts 84 prefix when length >= 11", () => {
    expect(normalizePhone("84901234567")).toBe("0901234567");
  });
});

describe("looksLikePhone", () => {
  it("true for 9-11 digits", () => {
    expect(looksLikePhone("0901234567")).toBe(true);
    expect(looksLikePhone("901234567")).toBe(true);
  });

  it("false for names", () => {
    expect(looksLikePhone("Phở Hoa")).toBe(false);
    expect(looksLikePhone("123")).toBe(false);
  });
});
