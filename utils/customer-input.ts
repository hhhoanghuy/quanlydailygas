export const CUSTOMER_INPUT_FORMAT = "Tên - SĐT - Địa chỉ";
export const CUSTOMER_INPUT_EXAMPLE = "Phở Hoa - 0901234567 - 123 Lê Lợi";

export interface CustomerInputDraft {
  name: string;
  phone: string;
  address: string;
  customerType?: "household" | "restaurant" | "industrial";
}

/** Parse `Tên - SĐT - Địa chỉ` — chỉ tách 2 dấu `-` đầu, phần sau là địa chỉ. */
export function parseCustomerInput(text: string): CustomerInputDraft | null {
  const trimmed = text.trim();
  const firstDash = trimmed.indexOf("-");
  if (firstDash <= 0) return null;

  const afterName = trimmed.slice(firstDash + 1);
  const secondDash = afterName.indexOf("-");
  if (secondDash <= 0) return null;

  const name = trimmed.slice(0, firstDash).trim();
  const phone = afterName.slice(0, secondDash).trim();
  const address = afterName.slice(secondDash + 1).trim();

  if (!name || !phone || !address) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 9) return null;

  return { name, phone, address };
}
