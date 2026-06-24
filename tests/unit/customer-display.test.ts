import { describe, it, expect } from "vitest";
import {
  formatCustomerSearchLine,
  customerPickButtonLabel,
  formatCustomerConfirmLine,
} from "../../utils/customer-display.js";

describe("formatCustomerSearchLine", () => {
  it("includes name phone address", () => {
    const line = formatCustomerSearchLine(
      { name: "Phở Hoa", phone: "0901234567", address: "123 Lê Lợi" },
      " (nợ 0đ)",
    );
    expect(line).toContain("Phở Hoa");
    expect(line).toContain("0901234567");
    expect(line).toContain("123 Lê Lợi");
    expect(line).toContain("nợ 0đ");
  });
});

describe("customerPickButtonLabel", () => {
  it("truncates to 64 chars for Telegram", () => {
    const label = customerPickButtonLabel({
      name: "Quán ăn tên rất dài để test truncate",
      phone: "0901111111",
      address: "Số 99999 Đường tên rất dài quận trung tâm thành phố Hồ Chí Minh Việt Nam",
    });
    expect(label.length).toBeLessThanOrEqual(64);
  });

  it("falls back to name and phone without address", () => {
    expect(customerPickButtonLabel({ name: "A", phone: "0901", address: "" })).toBe("A — 0901");
  });
});

describe("formatCustomerConfirmLine", () => {
  it("shows address when present", () => {
    expect(formatCustomerConfirmLine({ name: "Hoa", phone: "09", address: "Q1" })).toContain("Q1");
  });
});
