import { describe, it, expect } from "vitest";
import { orderStatusText } from "../../utils/order-status.js";

describe("orderStatusText", () => {
  it("maps pending full label", () => {
    expect(orderStatusText("pending")).toBe("⏳ Chưa giao");
  });

  it("maps short labels", () => {
    expect(orderStatusText("delivering", true)).toBe("đang giao");
    expect(orderStatusText("completed", true)).toBe("đã giao");
  });

  it("returns unknown status as-is", () => {
    expect(orderStatusText("unknown")).toBe("unknown");
  });
});
