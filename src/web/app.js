/* GasOS Web Dashboard — UI chuẩn sidebar + stat cards + chart */
const AGENCY = document.body.dataset.agency || "GasOS";

const fmt = (n) => Number(n || 0).toLocaleString("vi-VN") + "đ";
const fmtShort = (n) => {
  const v = Number(n || 0);
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, "") + "tr";
  if (v >= 1_000) return Math.round(v / 1000) + "k";
  return String(v);
};
const fmtDate = (d) => (d ? new Date(d).toLocaleString("vi-VN") : "—");
const fmtDayLabel = (iso) => {
  const p = iso.split("-");
  return `${p[2]}/${p[1]}`;
};
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};
const displayDate = (iso) => {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
};

const TYPE_LABEL = { household: "Hộ gia đình", restaurant: "Quán ăn", industrial: "Công nghiệp" };
const PAY_LABEL = { cash: "TM", transfer: "CK" };
const ORDER_STATUS = {
  pending: "Chưa giao", delivering: "Đang giao", completed: "Đã giao", cancelled: "Đã huỷ",
};
const fmtKg = (n) => `${Number(n || 0).toLocaleString("vi-VN")} kg`;
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function roleBadge(role) {
  if (role === "owner") return '<span class="badge badge-owner">Chủ đại lý</span>';
  if (role === "employee") return '<span class="badge badge-employee">Nhân viên</span>';
  return '<span class="badge badge-pending">Chưa kích hoạt</span>';
}

function statusBadge(status) {
  const cls = status === "completed" ? "badge-ok" : status === "cancelled" ? "badge-danger" : "badge-warn";
  return `<span class="badge ${cls}">${ORDER_STATUS[status] || status}</span>`;
}

function fmtDelta(n, suffix = "đ") {
  const v = Number(n || 0);
  if (v === 0) return "0" + suffix;
  const sign = v > 0 ? "+" : "";
  return sign + v.toLocaleString("vi-VN") + suffix;
}

function readCorrectionForm(bodyEl) {
  const lines = [...bodyEl.querySelectorAll("[data-line-idx]")].map((row) => ({
    cylinders_out: Number(row.querySelector('[name="out"]').value),
    cylinders_in: Number(row.querySelector('[name="in"]').value),
    gas_surplus_kg: Number(row.querySelector('[name="gas"]')?.value || 0),
  }));
  return {
    lines,
    cash_received: Number(bodyEl.querySelector('[name="cash_received"]').value),
    payment_method: bodyEl.querySelector('[name="payment_method"]').value,
    employee_id: bodyEl.querySelector('[name="employee_id"]').value,
    note: bodyEl.querySelector('[name="note"]')?.value?.trim() || undefined,
  };
}

function renderCorrectionPreview(container, preview) {
  if (!preview) {
    container.innerHTML = "";
    container.classList.add("hidden");
    return;
  }
  const d = preview.delta;
  container.classList.remove("hidden");
  container.innerHTML = `
    <h4 class="correction-preview-title">Chênh lệch sau sửa</h4>
    <div class="correction-preview-grid">
      <div class="correction-preview-item">
        <span class="lbl">Tổng đơn</span>
        <span class="val money">${fmt(preview.before.orderAmount)} → ${fmt(preview.after.orderAmount)}</span>
        <span class="delta">${fmtDelta(d.orderAmount)}</span>
      </div>
      <div class="correction-preview-item">
        <span class="lbl">Thu tiền</span>
        <span class="val money">${fmt(preview.before.cashReceived)} → ${fmt(preview.after.cashReceived)}</span>
        <span class="delta">${fmtDelta(d.cashReceived)}</span>
      </div>
      <div class="correction-preview-item">
        <span class="lbl">Nợ thêm lần này</span>
        <span class="val money">${fmt(preview.before.debtAmount)} → ${fmt(preview.after.debtAmount)}</span>
        <span class="delta">${fmtDelta(d.debtAmount)}</span>
      </div>
      <div class="correction-preview-item">
        <span class="lbl">Vỏ giữ (lần giao)</span>
        <span class="val">${preview.before.holding} → ${preview.after.holding} bình</span>
        <span class="delta">${fmtDelta(d.holding, " bình")}</span>
      </div>
    </div>
    <p class="muted correction-preview-foot">Giá giữ nguyên lúc giao · Ngày giờ giao không đổi</p>`;
}

function renderCorrectionLines(lines) {
  return `<div class="correction-lines">${lines
    .map(
      (l, i) => `
    <div class="correction-line-card" data-line-idx="${i}">
      <div class="correction-line-head">
        <strong>${esc(l.typeName)}</strong>
        <span class="money muted">Giá cũ: ${fmt(l.lineAmount)}</span>
      </div>
      <div class="correction-line-fields">
        <div class="field correction-field">
          <label>Giao</label>
          <input name="out" type="number" min="0" value="${l.cylindersOut}" inputmode="numeric" />
        </div>
        <div class="field correction-field">
          <label>Thu vỏ</label>
          <input name="in" type="number" min="0" value="${l.cylindersIn}" inputmode="numeric" />
        </div>
        <div class="field correction-field">
          <label>Gas dư (kg)</label>
          <input name="gas" type="number" min="0" step="0.1" value="${l.gasSurplusKg || 0}" inputmode="decimal" />
        </div>
      </div>
    </div>`,
    )
    .join("")}</div>`;
}

async function openOrderEditModal(orderId, detail) {
  const f = detail.fulfillment;
  const o = detail.order;
  if (!f?.lines?.length) {
    alert("Đơn chưa có dữ liệu giao hàng để sửa.");
    return;
  }

  const { data: employees } = await api("/employees");
  const empOptions = (employees || [])
    .map((e) => `<option value="${e.id}" ${e.id === o.assignedEmployeeId ? "selected" : ""}>${esc(e.name)}${e.active ? "" : " (nghỉ)"}</option>`)
    .join("");

  const pay = f.paymentMethod || (f.cashReceived > 0 ? "tm" : "no");

  const body = `
    <p class="correction-hint muted">Chỉ sửa số trên dòng có sẵn · Trong 48h · Không đổi khách / ngày / giá</p>
    <div class="field"><label>NV giao</label><select name="employee_id">${empOptions}</select></div>
    <div class="field">
      <label>Dòng bình (${f.lines.length})</label>
      ${renderCorrectionLines(f.lines)}
    </div>
    <div class="field-row">
      <div class="field"><label>Thu tiền (đ)</label><input name="cash_received" type="number" min="0" step="1000" value="${f.cashReceived}" inputmode="numeric" /></div>
      <div class="field"><label>Thanh toán</label>
        <select name="payment_method">
          <option value="tm" ${pay === "tm" ? "selected" : ""}>Tiền mặt</option>
          <option value="ck" ${pay === "ck" ? "selected" : ""}>Chuyển khoản</option>
          <option value="no" ${pay === "no" ? "selected" : ""}>Ghi nợ</option>
        </select>
      </div>
    </div>
    <div class="field"><label>Ghi chú thêm (tuỳ chọn)</label><input name="note" type="text" placeholder="Ghi chú ngoài payment=..." /></div>
    <button type="button" class="btn btn-block" id="preview-correction">Xem trước chênh lệch</button>
    <div id="correction-preview" class="correction-preview hidden"></div>`;

  const modal = showModal("Sửa đơn đã giao", body, null, null, true);
  modal.querySelector(".modal")?.classList.add("modal-correction");
  const previewBox = modal.querySelector("#correction-preview");
  let lastPreview = null;

  modal.querySelector("#preview-correction").onclick = async () => {
    try {
      lastPreview = await api(`/orders/${orderId}/preview-correction`, {
        method: "POST",
        body: JSON.stringify(readCorrectionForm(modal.querySelector(".modal-body"))),
      });
      renderCorrectionPreview(previewBox, lastPreview);
    } catch (e) {
      alert(e.message);
    }
  };

  const foot = modal.querySelector(".modal-foot");
  const saveBtn = document.createElement("button");
  saveBtn.className = "btn btn-primary";
  saveBtn.textContent = "Lưu sửa";
  saveBtn.onclick = async () => {
    if (!lastPreview) {
      alert("Bấm 「Xem trước chênh lệch」 trước khi lưu.");
      return;
    }
    if (!confirm("Xác nhận sửa đơn? Công nợ và vỏ khách sẽ điều chỉnh theo số liệu mới.")) return;
    saveBtn.disabled = true;
    try {
      await api(`/orders/${orderId}/correct`, {
        method: "POST",
        body: JSON.stringify(readCorrectionForm(modal.querySelector(".modal-body"))),
      });
      modal.remove();
      await openOrderDetail(orderId);
    } catch (e) {
      alert(e.message);
      saveBtn.disabled = false;
    }
  };
  foot.insertBefore(saveBtn, foot.querySelector('[data-act="cancel"]'));
}

async function openOrderDetail(orderId) {
  const d = await api(`/orders/${orderId}`);
  const o = d.order;
  const cs = d.customerSummary || {};
  const displayLines = d.fulfillment?.lines?.length
    ? d.fulfillment.lines
    : (d.lines || []).map((l) => ({ typeName: l.typeName, cylindersOut: l.cylindersOut }));
  const hasFulfill = Boolean(d.fulfillment?.lines?.length);
  const lineRows = displayLines.map((l) => {
    if (hasFulfill) {
      const amountCell = l.lineAmount != null ? `<td class="money">${fmt(l.lineAmount)}</td>` : "";
      return `<tr><td>${esc(l.typeName)}</td><td>${l.cylindersOut}</td><td>${l.cylindersIn ?? "—"}</td><td>${l.gasSurplusKg ? fmtKg(l.gasSurplusKg) : "—"}</td>${amountCell}</tr>`;
    }
    return `<tr><td>${esc(l.typeName)}</td><td>${l.cylindersOut}</td></tr>`;
  });
  const lineHeaders = hasFulfill
    ? ["Loại bình", "Giao", "Thu", "Gas dư", "Tiền dòng"]
    : ["Loại bình", "Giao"];

  const cylRows = (cs.cylindersByType || []).map(
    (t) => `<tr><td>${esc(t.typeName)}</td><td><strong>${t.totalPurchased}</strong></td><td>${t.totalReturned}</td><td><strong>${t.currentlyHolding}</strong></td></tr>`,
  );
  const customerSummaryBlock = `
    <h4 style="margin:0 0 .75rem;font-size:.9rem">Tổng hợp khách hàng (toàn bộ lịch sử)</h4>
    <div class="detail-grid">
      <div class="detail-item"><div class="lbl">Bình đã giao (mua)</div><div class="val">${cs.totalCylindersPurchased ?? 0} bình</div></div>
      <div class="detail-item"><div class="lbl">Vỏ đang giữ</div><div class="val">${cs.totalCylindersHolding ?? 0} bình</div></div>
      <div class="detail-item"><div class="lbl">Tiền đang nợ</div><div class="val money">${fmt(cs.debtBalance ?? 0)}</div></div>
      <div class="detail-item"><div class="lbl">Tiền đã mua</div><div class="val money">${fmt(cs.totalPurchaseAmount ?? 0)}</div></div>
      <div class="detail-item"><div class="lbl">Đã trả tiền mặt/CK</div><div class="val money">${fmt(cs.totalCashPaid ?? 0)}</div></div>
      <div class="detail-item"><div class="lbl">Số lần giao</div><div class="val">${cs.deliveryCount ?? 0}</div></div>
    </div>
    ${panel("Theo loại bình", "", table(["Loại", "Đã giao", "Đã thu vỏ", "Đang giữ"], cylRows))}`;

  let fulfillBlock = "";
  if (d.fulfillment) {
    const f = d.fulfillment;
    fulfillBlock = `
      <h4 style="margin:1rem 0 .5rem;font-size:.9rem">Kết quả giao hàng (lần này)</h4>
      <div class="detail-grid">
        <div class="detail-item"><div class="lbl">Thời gian</div><div class="val">${fmtDate(f.deliveredAt)}</div></div>
        <div class="detail-item"><div class="lbl">NV giao</div><div class="val">${esc(f.employeeName)}</div></div>
        <div class="detail-item"><div class="lbl">Tổng đơn</div><div class="val money">${fmt(f.orderAmount)}</div></div>
        <div class="detail-item"><div class="lbl">Thu tiền</div><div class="val money">${fmt(f.cashReceived)}</div></div>
        <div class="detail-item"><div class="lbl">Nợ thêm</div><div class="val money">${fmt(f.debtAmount)}</div></div>
        <div class="detail-item"><div class="lbl">Thanh toán</div><div class="val">${f.paymentMethod === "transfer" ? "Chuyển khoản" : f.paymentMethod === "cash" ? "Tiền mặt" : "—"}</div></div>
      </div>`;
  }
  const body = `
    <div class="detail-grid">
      <div class="detail-item"><div class="lbl">Khách</div><div class="val">${esc(o.customerName)}</div></div>
      <div class="detail-item"><div class="lbl">SĐT</div><div class="val"><a href="tel:${o.customerPhone}">${esc(o.customerPhone)}</a></div></div>
      <div class="detail-item"><div class="lbl">Địa chỉ</div><div class="val">${esc(o.customerAddress || "—")}</div></div>
      <div class="detail-item"><div class="lbl">Loại KH</div><div class="val">${TYPE_LABEL[o.customerType] || o.customerType || "—"}</div></div>
      <div class="detail-item"><div class="lbl">Trạng thái đơn</div><div class="val">${statusBadge(o.status)}</div></div>
      <div class="detail-item"><div class="lbl">NV phụ trách</div><div class="val">${esc(o.assignedEmployeeName || "—")}</div></div>
      <div class="detail-item"><div class="lbl">Tạo lúc</div><div class="val">${fmtDate(o.createdAt)}</div></div>
      <div class="detail-item"><div class="lbl">Hoàn thành</div><div class="val">${o.completedAt ? fmtDate(o.completedAt) : "—"}</div></div>
    </div>
    ${o.note ? `<p class="muted">Ghi chú đơn: ${esc(o.note)}</p>` : ""}
    ${customerSummaryBlock}
    ${panel("Đơn này — dòng bình", "", table(lineHeaders, lineRows))}
    ${fulfillBlock}
    ${d.canCorrect
      ? `<button type="button" class="btn btn-primary" id="edit-order-btn" style="margin-top:.75rem">Sửa đơn</button>`
      : o.status === "completed"
        ? `<p class="muted" style="margin-top:.75rem">Quá 48 giờ — không sửa được trên web.</p>`
        : ""}
    <div class="msg-preview-label">Tin nhắn xác nhận (sao chép gửi khách sau này)</div>
    <div class="msg-preview" id="order-msg-preview"></div>
    <button type="button" class="btn btn-primary" id="copy-order-msg" style="margin-top:.75rem">Sao chép tin nhắn</button>`;
  const modal = showModal(`Chi tiết đơn hàng`, body, null, null, true);
  modal.querySelector("#order-msg-preview").textContent = d.messagePreview || "";
  modal.querySelector("#copy-order-msg").onclick = async () => {
    try {
      await navigator.clipboard.writeText(d.messagePreview || "");
      modal.querySelector("#copy-order-msg").textContent = "Đã sao chép!";
    } catch {
      alert("Không sao chép được — chọn thủ công trong khung tin nhắn.");
    }
  };
  const editBtn = modal.querySelector("#edit-order-btn");
  if (editBtn) {
    editBtn.onclick = () => {
      modal.remove();
      openOrderEditModal(orderId, d).catch((e) => alert(e.message));
    };
  }
}

const ICONS = {
  overview: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  revenue: '<svg viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  customers: '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  employees: '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>',
  cylinders: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v14c0 1.66 3.13 3 7 3s7-1.34 7-3V5"/><path d="M5 12c0 1.66 3.13 3 7 3s7-1.34 7-3"/></svg>',
  orders: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  gas: '<svg viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  logout: '<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  truck: '<svg viewBox="0 0 24 24"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 13.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>',
  cash: '<svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/></svg>',
  debt: '<svg viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  users: '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
};

function token() { return sessionStorage.getItem("gasos_token"); }
function setToken(t) { sessionStorage.setItem("gasos_token", t); }

async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  const t = token();
  if (t) headers.Authorization = "Bearer " + t;
  const res = await fetch("/api/v1" + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || "Lỗi kết nối");
  return data;
}

function getCodeFromUrl() {
  return new URLSearchParams(location.search).get("code");
}

function injectIcons() {
  document.querySelectorAll("[data-icon]").forEach((el) => {
    const key = el.dataset.icon;
    if (ICONS[key]) el.innerHTML = ICONS[key];
  });
}

function setPageActions(html) {
  document.getElementById("page-actions").innerHTML = html || "";
}

function setPageSub(text) {
  document.getElementById("page-sub").textContent = text || "";
}

function statCard(color, iconKey, label, value) {
  return `<div class="stat-card">
    <div class="stat-icon stat-icon-${color}">${ICONS[iconKey] || ""}</div>
    <div><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>
  </div>`;
}

function renderTrendChart(points) {
  if (!points.length) return '<p class="empty">Chưa có dữ liệu</p>';
  const W = 640, H = 200, pad = { t: 16, r: 16, b: 32, l: 40 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const maxD = Math.max(1, ...points.map((p) => p.deliveries));
  const maxR = Math.max(1, ...points.map((p) => p.revenue));
  const x = (i) => pad.l + (i / (points.length - 1 || 1)) * iw;
  const yD = (v) => pad.t + ih - (v / maxD) * ih;
  const yR = (v) => pad.t + ih - (v / maxR) * ih;

  const line = (key, yFn, color) => {
    const pts = points.map((p, i) => `${x(i)},${yFn(p[key])}`).join(" ");
    return `<polyline fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${pts}"/>`;
  };

  const grids = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const y = pad.t + ih * (1 - f);
    return `<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="#f3f4f6" stroke-width="1"/>`;
  }).join("");

  const labels = points.map((p, i) =>
    `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#9ca3af">${fmtDayLabel(p.date)}</text>`,
  ).join("");

  return `<div class="chart-wrap"><svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    ${grids}${line("deliveries", yD, "#16a34a")}${line("revenue", yR, "#2563eb")}
    ${labels}
  </svg></div>
  <div class="chart-legend">
    <span><i style="background:#16a34a"></i> Đơn giao</span>
    <span><i style="background:#2563eb"></i> Doanh thu</span>
  </div>`;
}

function showModal(title, bodyHtml, onSave, saveLabel = "Lưu", wide = false) {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `
    <div class="modal${wide ? " modal-wide" : ""}">
      <div class="modal-head">${title}</div>
      <div class="modal-body">${bodyHtml}</div>
      <div class="modal-foot">
        <button class="btn" data-act="cancel">Đóng</button>
        ${onSave ? `<button class="btn btn-primary" data-act="save">${saveLabel}</button>` : ""}
      </div>
    </div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.querySelector('[data-act="cancel"]').onclick = close;
  bg.onclick = (e) => { if (e.target === bg) close(); };
  const saveBtn = bg.querySelector('[data-act="save"]');
  if (saveBtn && onSave) {
    saveBtn.onclick = async () => {
      saveBtn.disabled = true;
      try {
        await onSave(bg.querySelector(".modal-body"));
        close();
      } catch (e) {
        alert(e.message);
        saveBtn.disabled = false;
      }
    };
  }
  return bg;
}

function panel(title, toolbarHtml, bodyHtml) {
  return `<div class="panel"><div class="panel-head"><h3>${title}</h3>${toolbarHtml || ""}</div><div class="panel-body">${bodyHtml}</div></div>`;
}

function table(headers, rows) {
  if (!rows.length) return '<p class="empty">Chưa có dữ liệu</p>';

  const parseCells = (tr) => {
    const cells = [];
    const re = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let m;
    while ((m = re.exec(tr)) !== null) cells.push(m[1].trim());
    return cells;
  };

  const desktop = `<div class="table-desktop"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;

  const cards = rows.map((tr) => {
    const cells = parseCells(tr);
    const orderId = (tr.match(/data-order="([^"]+)"/) || [])[1];
    const dataOrder = orderId ? ` data-order="${orderId}"` : "";
    const body = headers
      .map((h, i) => {
        if (cells[i] === undefined || cells[i] === "" || h === "") return "";
        return `<div class="data-card-row"><span class="data-lbl">${h}</span><span class="data-val">${cells[i]}</span></div>`;
      })
      .filter(Boolean)
      .join("");
    const clickable = tr.includes("row-clickable") ? " data-card-clickable" : "";
    return `<div class="data-card${clickable}"${dataOrder}>${body}</div>`;
  }).join("");

  return desktop + `<div class="table-mobile">${cards}</div>`;
}

/* ── Pages ── */
const pages = {
  async overview(el) {
    const period = el.dataset.period || "day";
    const date = el.dataset.date || today();
    setPageSub(period === "month" ? `Tháng ${date.slice(0, 7)}` : displayDate(date));
    setPageActions(`
      <select id="ov-period" class="btn"><option value="day">Theo ngày</option><option value="month">Theo tháng</option></select>
      <input type="date" id="ov-date" value="${date}" />
      <button class="btn btn-primary" id="ov-refresh">Tải lại</button>`);
    el.innerHTML = `<div id="ov-cards" class="stat-grid"><div class="empty">Đang tải…</div></div><div id="ov-chart"></div><div id="ov-rest"></div>`;
    document.getElementById("ov-period").value = period;

    const load = async () => {
      const p = document.getElementById("ov-period").value;
      const d = document.getElementById("ov-date").value;
      el.dataset.period = p;
      el.dataset.date = d;
      setPageSub(p === "month" ? `Tháng ${d.slice(0, 7)}` : displayDate(d));

      const [dash, orders, trend] = await Promise.all([
        api(`/dashboard?date=${d}&period=${p}`),
        api("/orders/stats"),
        api("/dashboard/trend?days=14"),
      ]);

      let cards = [
        statCard("blue", "truck", "Đơn giao", dash.totalDeliveries),
        statCard("green", "cash", "Thu TM + CK", fmtShort(dash.totalCashReceived)),
        statCard("amber", "debt", "Nợ thêm kỳ", fmtShort(dash.debtAddedInPeriod)),
        statCard("red", "debt", "Tổng nợ KH", fmtShort(dash.totalDebt)),
      ];
      if (dash.totalCylindersOutside > 0) {
        cards.push(statCard("purple", "cylinders", "Vỏ ngoài TT", dash.totalCylindersOutside));
      }
      if (dash.totalGasSurplusKg > 0 || dash.totalGasSurplusAllKg > 0) {
        cards.push(statCard("amber", "gas", `Gas dư ${p === "month" ? "tháng" : "ngày"}`, fmtKg(dash.totalGasSurplusKg)));
        if (dash.totalGasSurplusAllKg > 0) {
          cards.push(statCard("amber", "gas", "Gas dư tích lũy", fmtKg(dash.totalGasSurplusAllKg)));
        }
      }
      el.querySelector("#ov-cards").innerHTML = cards.join("");

      el.querySelector("#ov-chart").innerHTML = `
        <div class="chart-panel">
          <h3>Xu hướng giao hàng & doanh thu (14 ngày)</h3>
          ${renderTrendChart(trend.points || [])}
        </div>`;

      const empRows = (dash.topEmployees || []).map(
        (e, i) => `<tr><td>${i + 1}</td><td>${e.name}</td><td>${e.deliveryCount}</td><td>${e.cylindersOut}</td><td class="money">${fmt(e.cashHeld)}</td></tr>`,
      );
      const openRows = (orders.openList || []).map(
        (o) => `<tr><td>${o.customerName}</td><td><span class="badge badge-warn">${ORDER_STATUS[o.status] || o.status}</span></td><td>${o.assignedEmployeeName || "—"}</td></tr>`,
      );
      el.querySelector("#ov-rest").innerHTML =
        panel("Nhân viên giao hàng", "", table(["#", "Tên", "Đơn", "Bình", "TM cầm"], empRows)) +
        panel("Đơn chưa hoàn thành", `<span class="badge badge-warn">${orders.notDelivered} chưa giao · ${orders.delivering} đang giao</span>`, table(["Khách", "Trạng thái", "NV phụ trách"], openRows));
    };

    document.getElementById("ov-refresh").onclick = () => load().catch((e) => alert(e.message));
    document.getElementById("ov-period").onchange = () => load().catch((e) => alert(e.message));
    document.getElementById("ov-date").onchange = () => load().catch((e) => alert(e.message));
    await load();
  },

  async revenue(el) {
    const from = el.dataset.from || monthStart();
    const to = el.dataset.to || today();
    setPageSub(`Từ ${from} đến ${to}`);
    setPageActions(`
      <input type="date" id="rv-from" value="${from}" />
      <input type="date" id="rv-to" value="${to}" />
      <button class="btn btn-primary" id="rv-load">Xem</button>
      <button class="btn btn-primary" id="rv-add-pay">+ Thu nợ</button>`);
    el.innerHTML = `<div id="rv-body"><p class="empty">Đang tải…</p></div>`;

    const load = async () => {
      const f = document.getElementById("rv-from").value;
      const t = document.getElementById("rv-to").value;
      el.dataset.from = f;
      el.dataset.to = t;
      setPageSub(`Từ ${f} đến ${t}`);

      const [dash, debtors, payments, deliveries] = await Promise.all([
        api(`/dashboard?date=${t}&period=month`),
        api("/dashboard/debtors"),
        api(`/payments?from=${f}&to=${t}T23:59:59`),
        api(`/deliveries?from=${f}&to=${t}T23:59:59`),
      ]);
      const payRows = (payments.data || []).map(
        (p) => `<tr><td>${fmtDate(p.paidAt)}</td><td>${p.customerName}</td><td>${p.customerPhone}</td><td class="money">${fmt(p.amount)}</td><td>${PAY_LABEL[p.method]}</td><td>${p.note || ""}</td></tr>`,
      );
      const debtRows = (debtors.data || []).map(
        (d) => `<tr><td>${d.name}</td><td>${d.phone}</td><td class="money">${fmt(d.debtBalance)}</td></tr>`,
      );
      const delRows = (deliveries.data || []).slice(0, 50).map(
        (d) => `<tr><td>${fmtDate(d.deliveredAt)}</td><td>${d.customerName}</td><td>${d.employeeName}</td><td class="money">${fmt(d.orderAmount)}</td><td class="money">${fmt(d.cashReceived)}</td><td class="money">${fmt(d.debtAmount)}</td></tr>`,
      );
      el.querySelector("#rv-body").innerHTML = `
        <div class="stat-grid">
          ${statCard("green", "cash", "Thu tháng", fmtShort(dash.totalCashReceived))}
          ${statCard("blue", "cash", "Tiền mặt", fmtShort(dash.cashRevenue))}
          ${statCard("purple", "cash", "Chuyển khoản", fmtShort(dash.transferRevenue))}
          ${statCard("red", "debt", "Tổng nợ", fmtShort(dash.totalDebt))}
        </div>
        ${panel("Khách đang nợ", `<span class="badge badge-warn">${debtors.data?.length || 0} khách</span>`, table(["Tên", "SĐT", "Nợ"], debtRows))}
        ${panel("Lịch sử thu nợ", "", table(["Ngày", "Khách", "SĐT", "Số tiền", "HT", "Ghi chú"], payRows))}
        ${panel("Giao hàng", "", table(["Ngày", "Khách", "NV", "Đơn", "Thu", "Nợ thêm"], delRows))}`;
    };

    document.getElementById("rv-load").onclick = () => load().catch((e) => alert(e.message));
    document.getElementById("rv-add-pay").onclick = async () => {
      const customers = await api("/customers?limit=200");
      const opts = customers.data.map((c) => `<option value="${c.id}">${c.name} — ${c.phone} (nợ ${fmt(c.debtBalance)})</option>`).join("");
      showModal("Thu nợ khách", `
        <div class="field"><label>Khách</label><select id="m-cust">${opts}</select></div>
        <div class="field"><label>Số tiền (VNĐ)</label><input id="m-amt" type="number" min="1" /></div>
        <div class="field"><label>Hình thức</label><select id="m-method"><option value="cash">Tiền mặt</option><option value="transfer">Chuyển khoản</option></select></div>
        <div class="field"><label>Ghi chú</label><input id="m-note" /></div>`, async () => {
        await api("/payments", { method: "POST", body: JSON.stringify({
          customer_id: document.getElementById("m-cust").value,
          amount: Number(document.getElementById("m-amt").value),
          method: document.getElementById("m-method").value,
          note: document.getElementById("m-note").value || undefined,
          paid_at: new Date().toISOString(),
        })});
        await load();
      });
    };
    await load();
  },

  async customers(el) {
    setPageSub("Quản lý danh sách khách hàng");
    setPageActions(`
      <input id="cu-search" placeholder="Tìm tên / SĐT / địa chỉ…" />
      <button class="btn" id="cu-search-btn">Tìm</button>
      <button class="btn btn-primary" id="cu-add">+ Thêm khách</button>`);
    el.innerHTML = `<div id="cu-body"><p class="empty">Đang tải…</p></div>`;
    let loadGen = 0;

    const load = async (search = "") => {
      const gen = ++loadGen;
      const body = el.querySelector("#cu-body");
      if (!body) return;
      body.innerHTML = '<p class="empty">Đang tải…</p>';
      try {
        const q = search ? `?search=${encodeURIComponent(search)}&limit=200` : "?limit=200";
        const { data } = await api("/customers" + q);
        if (gen !== loadGen || !el.querySelector("#cu-body")) return;
        const list = Array.isArray(data) ? data : [];
        const rows = list.map((c) => {
          const debt = Number(c.debtBalance || 0);
          const canDelete = c.canDelete === true;
          return `<tr>
        <td><strong>${esc(c.name)}</strong></td><td>${esc(c.phone)}</td><td>${esc(c.address)}</td>
        <td>${TYPE_LABEL[c.customerType] || c.customerType}</td>
        <td class="money">${fmt(debt)}</td>
        <td>
          <button class="btn btn-sm" data-edit="${c.id}">Sửa</button>
          <button class="btn btn-sm" data-hide="${c.id}">Ẩn</button>
          ${canDelete ? `<button class="btn btn-sm btn-danger" data-del="${c.id}">Xoá</button>` : debt > 0 ? `<span class="muted" title="Còn nợ">—</span>` : `<span class="muted" title="Đã có lịch sử giao — chỉ ẩn được">—</span>`}
        </td></tr>`;
        });
        el.querySelector("#cu-body").innerHTML = panel(
          "Danh sách khách hàng",
          `<span class="badge badge-ok">${list.length} khách</span>`,
          table(["Tên", "SĐT", "Địa chỉ", "Loại", "Nợ", ""], rows),
        );
        el.querySelectorAll("[data-edit]").forEach((btn) => btn.onclick = () => openEdit(btn.dataset.edit, list, load));
        el.querySelectorAll("[data-hide]").forEach((btn) => btn.onclick = async () => {
          if (!confirm("Ẩn khách này khỏi danh sách?")) return;
          await api(`/customers/${btn.dataset.hide}/deactivate`, { method: "PATCH" });
          await load(document.getElementById("cu-search")?.value || "");
        });
        el.querySelectorAll("[data-del]").forEach((btn) => btn.onclick = async () => {
          if (!confirm("Xoá vĩnh viễn khách này?")) return;
          try {
            await api(`/customers/${btn.dataset.del}`, { method: "DELETE" });
            await load(document.getElementById("cu-search")?.value || "");
          } catch (e) {
            alert(e.message);
          }
        });
      } catch (e) {
        if (gen !== loadGen || !el.querySelector("#cu-body")) return;
        el.querySelector("#cu-body").innerHTML = `<p class="error">${esc(e.message)}</p>`;
      }
    };

    function openEdit(id, list, reload) {
      const c = list.find((x) => x.id === id);
      if (!c) return;
      showModal("Sửa khách", `
        <div class="field"><label>Tên</label><input id="m-name" value="${c.name.replace(/"/g, "&quot;")}" /></div>
        <div class="field"><label>SĐT</label><input id="m-phone" value="${c.phone}" /></div>
        <div class="field"><label>Địa chỉ</label><textarea id="m-addr">${c.address}</textarea></div>
        <div class="field"><label>Loại</label><select id="m-type">
          <option value="household" ${c.customerType === "household" ? "selected" : ""}>Hộ gia đình</option>
          <option value="restaurant" ${c.customerType === "restaurant" ? "selected" : ""}>Quán ăn</option>
          <option value="industrial" ${c.customerType === "industrial" ? "selected" : ""}>Công nghiệp</option>
        </select></div>
        <div class="field"><label>Ghi chú</label><input id="m-note" value="${(c.note || "").replace(/"/g, "&quot;")}" /></div>`, async () => {
        await api(`/customers/${id}`, { method: "PUT", body: JSON.stringify({
          name: document.getElementById("m-name").value,
          phone: document.getElementById("m-phone").value,
          address: document.getElementById("m-addr").value,
          customer_type: document.getElementById("m-type").value,
          note: document.getElementById("m-note").value,
        })});
        await reload(document.getElementById("cu-search")?.value || "");
      });
    }

    document.getElementById("cu-search-btn").onclick = () => load(document.getElementById("cu-search").value).catch((e) => alert(e.message));
    document.getElementById("cu-add").onclick = () => {
      showModal("Thêm khách mới", `
        <div class="field"><label>Tên</label><input id="m-name" /></div>
        <div class="field"><label>SĐT</label><input id="m-phone" /></div>
        <div class="field"><label>Địa chỉ</label><textarea id="m-addr"></textarea></div>
        <div class="field"><label>Loại</label><select id="m-type">
          <option value="household">Hộ gia đình</option><option value="restaurant">Quán ăn</option><option value="industrial">Công nghiệp</option>
        </select></div>`, async () => {
        await api("/customers", { method: "POST", body: JSON.stringify({
          name: document.getElementById("m-name").value,
          phone: document.getElementById("m-phone").value,
          address: document.getElementById("m-addr").value,
          customer_type: document.getElementById("m-type").value,
        })});
        await load();
      });
    };
    await load();
  },

  async employees(el) {
    setPageSub("Chủ đại lý và nhân viên giao hàng — phân vai trò rõ ràng");
    setPageActions(`<button class="btn btn-primary" id="em-invite">+ Tạo mã mời NV</button>`);
    el.innerHTML = `<div id="em-body"><p class="empty">Đang tải…</p></div>`;
    let teamCache = [];

    const openEdit = (member) => {
      showModal(
        `Sửa — ${member.roleLabel}`,
        `<div class="field"><label>Tên hiển thị</label><input id="em-edit-name" value="${esc(member.name)}" /></div>
         <div class="field"><label>Số điện thoại</label><input id="em-edit-phone" value="${esc(member.phone)}" inputmode="tel" /></div>
         <p class="muted" style="margin:0;font-size:.8rem">Tên cũng cập nhật trên Telegram (nếu đã kích hoạt).</p>`,
        async () => {
          await api(`/employees/${member.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              name: document.getElementById("em-edit-name").value.trim(),
              phone: document.getElementById("em-edit-phone").value.trim(),
            }),
          });
          await load();
        },
      );
    };

    const load = async () => {
      const { team, owner } = await api("/employees");
      const members = team || [];
      teamCache = owner ? [owner, ...members.filter((m) => !m.isOwner)] : members;

      const ownerRow = owner
        ? `<tr class="row-owner">
        <td>${roleBadge("owner")}</td>
        <td><strong>${owner.name}</strong></td><td>${owner.phone}</td>
        <td>${owner.telegramUsername ? "@" + owner.telegramUsername : '<span class="badge badge-ok">Telegram OK</span>'}</td>
        <td>${owner.deliveriesThisMonth}</td>
        <td><span class="badge badge-ok">Hoạt động</span></td>
        <td><button class="btn btn-sm" data-edit="${owner.id}">Sửa</button></td>
      </tr>`
        : "";

      const nvRows = members
        .filter((m) => !m.isOwner)
        .map((e) => {
          const tg = e.hasTelegram
            ? e.telegramUsername
              ? "@" + e.telegramUsername
              : '<span class="badge badge-ok">Telegram OK</span>'
            : '<span class="badge badge-pending">Chưa kích hoạt</span>';
          const actions = `<button class="btn btn-sm" data-edit="${e.id}">Sửa</button>
            <button class="btn btn-sm" data-toggle="${e.id}" data-active="${e.active}">${e.active ? "Ngưng" : "Bật lại"}</button>`;
          return `<tr>
        <td>${roleBadge(e.role)}</td>
        <td><strong>${e.name}</strong></td><td>${e.phone}</td>
        <td>${tg}</td>
        <td>${e.deliveriesThisMonth}</td>
        <td>${e.active ? '<span class="badge badge-ok">Hoạt động</span>' : '<span class="badge badge-off">Ngưng</span>'}</td>
        <td class="cell-actions">${actions}</td>
      </tr>`;
        });

      const nvOnly = members.filter((m) => !m.isOwner);
      el.querySelector("#em-body").innerHTML = `
        <div class="stat-grid" style="margin-bottom:1.25rem">
          ${statCard("blue", "users", "Chủ đại lý", owner ? 1 : 0)}
          ${statCard("green", "users", "NV đã kích hoạt", nvOnly.filter((e) => e.role === "employee").length)}
          ${statCard("amber", "users", "NV chờ kích hoạt", nvOnly.filter((e) => e.role === "pending").length)}
        </div>
        ${panel(
          "Đội ngũ",
          "",
          table(
            ["Vai trò", "Tên", "SĐT", "Telegram", "Đơn/tháng", "Trạng thái", "Thao tác"],
            ownerRow ? [ownerRow, ...nvRows] : nvRows,
          ),
        )}
        <p class="muted" style="margin-top:.75rem;font-size:.8rem">
          <strong>Chủ đại lý</strong> (owner): quản lý toàn bộ, mở web dashboard.<br />
          <strong>Nhân viên</strong> (employee): giao hàng qua bot Telegram.<br />
          <strong>Chưa kích hoạt</strong>: đã tạo hồ sơ NV nhưng chưa /start mã mời.
        </p>`;
      el.querySelectorAll("[data-edit]").forEach((btn) => {
        btn.onclick = () => {
          const m = teamCache.find((x) => x.id === btn.dataset.edit);
          if (m) openEdit(m);
        };
      });
      el.querySelectorAll("[data-toggle]").forEach((btn) => btn.onclick = async () => {
        await api(`/employees/${btn.dataset.toggle}/active`, {
          method: "PATCH", body: JSON.stringify({ active: btn.dataset.active !== "true" }),
        });
        await load();
      });
    };

    document.getElementById("em-invite").onclick = async () => {
      const inv = await api("/invite-codes", { method: "POST", body: JSON.stringify({ role: "employee" }) });
      showModal("Mã mời nhân viên", `
        <p>Gửi link cho NV:</p>
        <p><strong style="font-size:1.1rem">${inv.code}</strong></p>
        <p><a href="${inv.telegram_deep_link}" target="_blank">${inv.telegram_deep_link}</a></p>
        <p class="muted">Hết hạn: ${fmtDate(inv.expires_at)}</p>`, async () => {}, "Đóng");
    };
    await load();
  },

  async cylinders(el) {
    setPageSub("Theo dõi vỏ bình ngoài thị trường");
    setPageActions(`
      <input id="cy-search" placeholder="Tìm khách…" />
      <button class="btn btn-primary" id="cy-btn">Tìm</button>`);
    el.innerHTML = `<div id="cy-body"><p class="empty">Đang tải…</p></div>`;

    const load = async (search = "") => {
      const q = search ? `?search=${encodeURIComponent(search)}` : "";
      const [holders, summary] = await Promise.all([
        api("/cylinders/holders" + q),
        api("/cylinders/summary"),
      ]);
      const total = (summary.data || []).reduce((s, x) => s + x.total, 0);
      const sumCards = (summary.data || []).map((s) =>
        statCard("blue", "cylinders", s.typeName, s.total),
      ).join("");
      const rows = (holders.data || []).map((h) => {
        const types = h.types.map((t) => `${t.typeName}: ${t.balance}`).join(", ");
        return `<tr><td><strong>${h.name}</strong></td><td>${h.phone}</td><td>${types}</td><td><strong>${h.total}</strong></td></tr>`;
      });
      el.querySelector("#cy-body").innerHTML = `
        <div class="stat-grid">${sumCards || statCard("blue", "cylinders", "Tổng vỏ", total)}</div>
        ${panel("Khách đang giữ vỏ", `<span class="badge badge-warn">${holders.data?.length || 0} khách</span>`, table(["Tên", "SĐT", "Theo loại", "Tổng"], rows))}`;
    };
    document.getElementById("cy-btn").onclick = () => load(document.getElementById("cy-search").value).catch((e) => alert(e.message));
    await load();
  },

  async orders(el) {
    const status = el.dataset.status || "all";
    setPageSub("Danh sách đơn — nhấn dòng để xem chi tiết & tin nhắn xác nhận");
    setPageActions(`
      <select id="ord-status" class="btn">
        <option value="all">Tất cả</option>
        <option value="pending">Chưa giao</option>
        <option value="delivering">Đang giao</option>
        <option value="completed">Đã giao</option>
        <option value="cancelled">Đã huỷ</option>
      </select>
      <button class="btn btn-primary" id="ord-refresh">Tải lại</button>`);
    el.innerHTML = `<div id="ord-body"><p class="empty">Đang tải…</p></div>`;
    document.getElementById("ord-status").value = status;

    const load = async () => {
      const st = document.getElementById("ord-status").value;
      el.dataset.status = st;
      const { data } = await api(`/orders?status=${st}&limit=200`);
      const rows = (data || []).map((o) => `<tr class="row-clickable" data-order="${o.id}">
        <td>${fmtDate(o.createdAt)}</td>
        <td><strong>${o.customerName}</strong><br><span class="muted">${o.customerPhone}</span></td>
        <td>${o.lineSummary || "—"}</td>
        <td>${statusBadge(o.status)}</td>
        <td>${o.assignedEmployeeName || "—"}</td>
        <td>${o.completedAt ? fmtDate(o.completedAt) : "—"}</td>
      </tr>`);
      el.querySelector("#ord-body").innerHTML = panel(
        "Đơn hàng",
        `<span class="badge badge-ok">${data?.length || 0} đơn</span>`,
        table(["Tạo lúc", "Khách", "Bình giao", "Trạng thái", "NV", "Hoàn thành"], rows),
      );
      el.querySelectorAll("[data-order]").forEach((tr) => {
        tr.onclick = () => openOrderDetail(tr.dataset.order).catch((e) => alert(e.message));
      });
    };

    document.getElementById("ord-refresh").onclick = () => load().catch((e) => alert(e.message));
    document.getElementById("ord-status").onchange = () => load().catch((e) => alert(e.message));
    await load();
  },

  async "gas-surplus"(el) {
    setPageSub("Bình còn gas — tách riêng để trả nhà máy");
    setPageActions(`<button class="btn btn-primary" id="gs-refresh">Tải lại</button>`);
    el.innerHTML = `<div id="gs-body"><p class="empty">Đang tải…</p></div>`;

    const load = async () => {
      const gs = await api("/gas-surplus");
      const custRows = (gs.byCustomer || []).map((c) =>
        `<tr><td><strong>${c.customerName}</strong></td><td>${c.customerPhone}</td><td>${c.deliveryCount}</td><td><strong>${fmtKg(c.totalKg)}</strong></td></tr>`,
      );
      const recentRows = (gs.recent || []).map((r) => {
        const detail = (r.lines || []).map((l) => `${l.typeName}: ${fmtKg(l.kg)}`).join(", ");
        return `<tr><td>${fmtDate(r.deliveredAt)}</td><td>${r.customerName}</td><td>${r.customerPhone}</td><td>${detail}</td><td><strong>${fmtKg(r.totalKg)}</strong></td></tr>`;
      });
      el.querySelector("#gs-body").innerHTML = `
        <div class="stat-grid">
          ${statCard("amber", "gas", "Tích lũy (tất cả)", fmtKg(gs.totalAllKg))}
          ${statCard("amber", "gas", `Tháng ${gs.monthLabel}`, fmtKg(gs.totalMonthKg))}
        </div>
        <p class="muted" style="margin-bottom:1rem">Gas dư = gas còn trong vỏ khách trả, ghi kg để trả nhà máy và trừ tiền đơn. Chỉ bình ≥20kg; NV nhập lúc giao.</p>
        ${panel("Theo khách (tháng này)", "", table(["Khách", "SĐT", "Lần giao", "Tổng kg"], custRows))}
        ${panel("Giao hàng gần đây có gas dư", "", table(["Ngày", "Khách", "SĐT", "Chi tiết", "Tổng"], recentRows))}`;
    };

    document.getElementById("gs-refresh").onclick = () => load().catch((e) => alert(e.message));
    await load();
  },
};

const PAGE_TITLES = {
  overview: "Tổng quan",
  revenue: "Doanh thu / Công nợ",
  customers: "Khách hàng",
  employees: "Đội ngũ",
  cylinders: "Quản lý vỏ",
  orders: "Đơn hàng",
  "gas-surplus": "Gas dư trả NM",
};

function navigate(page) {
  closeSidebar();
  document.querySelectorAll(".nav a").forEach((a) => {
    a.classList.toggle("active", a.dataset.page === page);
  });
  document.getElementById("page-title").textContent = PAGE_TITLES[page] || page;
  setPageSub("");
  setPageActions("");
  const content = document.getElementById("page-content");
  content.innerHTML = '<p class="empty">Đang tải…</p>';
  if (pages[page]) pages[page](content).catch((e) => { content.innerHTML = `<p class="error">${e.message}</p>`; });
}

function closeSidebar() {
  document.getElementById("sidebar")?.classList.remove("open");
  document.getElementById("sidebar-backdrop")?.classList.add("hidden");
  document.body.classList.remove("nav-open");
}

function openSidebar() {
  document.getElementById("sidebar")?.classList.add("open");
  document.getElementById("sidebar-backdrop")?.classList.remove("hidden");
  document.body.classList.add("nav-open");
}

function renderApp(user) {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app-screen").classList.remove("hidden");
  document.getElementById("user-name").textContent = user.name;
  const roleEl = document.getElementById("user-role");
  const isOwner = user.role === "owner";
  roleEl.textContent = isOwner ? "Chủ đại lý" : "Nhân viên";
  roleEl.className = "user-role " + (isOwner ? "role-owner" : "role-employee");
  const initial = (AGENCY || "G").charAt(0).toUpperCase();
  document.getElementById("brand-initial").textContent = initial;
  const loginLogo = document.querySelector(".login-logo");
  if (loginLogo) loginLogo.textContent = initial;
  injectIcons();
  document.getElementById("btn-menu")?.addEventListener("click", () => {
    const sb = document.getElementById("sidebar");
    if (sb?.classList.contains("open")) closeSidebar();
    else openSidebar();
  });
  document.getElementById("sidebar-backdrop")?.addEventListener("click", closeSidebar);
  document.querySelectorAll(".nav a").forEach((a) => {
    a.onclick = (e) => { e.preventDefault(); navigate(a.dataset.page); };
  });
  document.getElementById("btn-logout").onclick = async () => {
    try { await api("/auth/logout", { method: "POST" }); } catch {}
    sessionStorage.removeItem("gasos_token");
    location.reload();
  };
  navigate("overview");
}

async function boot() {
  const code = getCodeFromUrl();
  const savedToken = token();

  // Phiên web đang hoạt động — ưu tiên
  if (savedToken) {
    try {
      const user = await api("/auth/me");
      if (code) history.replaceState({}, "", "/dashboard");
      renderApp(user);
      return;
    } catch {
      sessionStorage.removeItem("gasos_token");
    }
  }

  // Đăng nhập bằng magic link từ bot
  if (code) {
    try {
      const data = await api("/auth/magic-link", { method: "POST", body: JSON.stringify({ code }) });
      setToken(data.token);
      history.replaceState({}, "", "/dashboard");
      renderApp(data.user);
      return;
    } catch {
      document.getElementById("login-err").textContent =
        "Link đăng nhập hết hạn (5 phút) hoặc đã dùng — lấy link mới từ bot /dashboard.";
      document.getElementById("login-screen").classList.remove("hidden");
      return;
    }
  }

  document.getElementById("login-screen").classList.remove("hidden");
  const initial = (AGENCY || "G").charAt(0).toUpperCase();
  const loginLogo = document.querySelector(".login-logo");
  if (loginLogo) loginLogo.textContent = initial;
  if (savedToken) {
    document.getElementById("login-err").textContent =
      "Phiên web hết hạn (8 giờ) — lấy link mới từ bot /dashboard.";
  }
}

boot();
