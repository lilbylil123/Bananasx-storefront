/* =========================================================
   CONFIG / CONSTANTS
========================================================= */

const CSV_URL =
  "https://corsproxy.io/?" +
  encodeURIComponent(
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vT6xm990HH7LTwD7X8YDM8oeG35kSGPNv0ZKEohbCdm9oDHzC77_v73RVR8KHWRa5udSKHb9oyqEc4o/pub?gid=613857331&single=true&output=csv"
  );

const API_URL = "https://script.google.com/macros/s/AKfycbxLS5O2tw_9x2SAZXTYYonVfc8kiSmqgVEAw4jI2iVfGuATTZ6QhZD3judtu3c_8RY59Q/exec";
const GOLD = "#ffcc00";

// Cached inventory for order modal (not affected by filters)
let INVENTORY_ITEMS = [];

let PRICE_MAP = {};

function getPriceBySKU(sku) {
  return PRICE_MAP[sku] || 0;
}



/* =========================================================
   UTILITY FUNCTIONS
========================================================= */

// Simple CSV parser (handles quoted commas)
function parseCSV(text) {
  const rows = [];
  let cur = [], val = "", inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (inQuotes) {
      if (c === '"' && n === '"') { val += '"'; i++; continue; }
      if (c === '"' && n !== '"') { inQuotes = false; continue; }
      val += c;
    } else {
      if (c === '"') { inQuotes = true; continue; }
      if (c === ',') { cur.push(val); val = ""; continue; }
      if (c === '\n') { cur.push(val); rows.push(cur); cur = []; val = ""; continue; }
      if (c === '\r') continue;
      val += c;
    }
  }

  if (val.length || cur.length) {
    cur.push(val);
    rows.push(cur);
  }

  return rows;
}

// Formats numeric price into K / M display
function formatPrice(x) {
  const n = Number(x);
  if (!isFinite(n)) return x || "";
  return n >= 1_000_000 ? (n / 1_000_000).toFixed(2) + "M"
       : n >= 1_000     ? (n / 1_000).toFixed(2) + "K"
       : n.toFixed(0);
}


/* =========================================================
   INVENTORY FETCH & TABLE RENDERING
========================================================= */

async function load() {
  const t0 = Date.now();

  const res = await fetch(CSV_URL, { cache: "no-store", mode: "cors" });
  const txt = await res.text();
  const rows = parseCSV(txt).filter(r => r.length);
  if (!rows.length) return;

  const head = rows[0].map(s => s.trim());
  const body = rows.slice(1);


   console.log("CSV HEADERS:", head);   // pulling headers //


  const idx = name =>
  head.findIndex(h =>
    h.replace(/[\s_]+/g, "").toLowerCase() ===
    name.replace(/[\s_]+/g, "").toLowerCase()
  );

  const iName = idx("Name"),
        iSize = idx("Size"),
        iType = idx("Type"),
        iGrade = idx("Grade"),
        iStock = idx("Current Stock"),
        iPrice = idx("Sell Price"),
        iSku   = idx("SKU"),
        iCategory = idx("Category");

  const tb = document.getElementById("tbody");

  function makeSortable(data, render) {
    const thEls = document.querySelectorAll("thead th");
    let sortKey = null, asc = true;

    thEls.forEach((th, idx) => {
      th.style.cursor = "pointer";
      th.addEventListener("click", () => {
        asc = sortKey === idx ? !asc : true;
        sortKey = idx;

        data.sort((a, b) => {
          const A = (a[idx] || "").toString().toLowerCase();
          const B = (b[idx] || "").toString().toLowerCase();
          const numA = parseFloat(A), numB = parseFloat(B);
          if (!isNaN(numA) && !isNaN(numB)) return asc ? numA - numB : numB - numA;
          return asc ? A.localeCompare(B) : B.localeCompare(A);
        });

        render();
        thEls.forEach(h => h.style.textDecoration = "");
        th.style.textDecoration = asc ? "underline" : "underline overline";
      });
    });
  }

  function renderTable() {
    tb.innerHTML = "";
    body.forEach(r => {
      if (!r[iName]) return;

      const tr = document.createElement("tr");
      tr.dataset.category = (r[iCategory] || "components").toLowerCase();

      const td = (text, cls = "") => {
        const el = document.createElement("td");
        el.textContent = text || "";
        if (cls) el.className = cls;
        return el;
      };

      tr.appendChild(td(r[iName]));
      tr.appendChild(td(r[iSize], "center"));
      tr.appendChild(td(r[iType]));
      tr.appendChild(td(r[iGrade]));

      const stockVal = Number(r[iStock] || 0);
      tr.appendChild(td(isFinite(stockVal) ? stockVal : r[iStock], "center"));

      const priceTd = td(formatPrice(r[iPrice]), "right price");
      if (stockVal > 0) priceTd.style.color = GOLD;
      tr.appendChild(priceTd);

      tr.appendChild(td(r[iSku], "muted"));
      tb.appendChild(tr);
    });
  }

// Render inventory table first
renderTable();

// ✅ Build inventory cache AFTER indices exist
INVENTORY_ITEMS = body
  .map(r => ({
    name: r[iName]?.trim(),
    sku:  r[iSku]?.trim(),
    stock: Number(r[iStock] || 0)
  }))
  .filter(i => i.name && i.sku && i.stock > 0);

   PRICE_MAP = {};
body.forEach(r => {
  const sku = r[iSku]?.trim();
  const price = Number(r[iPrice] || 0);
  if (sku && price > 0) {
    PRICE_MAP[sku] = price;
  }
});


// Enable sorting & filters AFTER table + cache exist
makeSortable(body, renderTable);
applyAllFilters();

const ms = Date.now() - t0;
document.getElementById("updated").textContent =
  `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} • ${ms}ms`;

}

load();

/* =========================================================
   FILTERS & TABLE VISUALS
========================================================= */

let quickFilters = { size: "all", grade: "all" };

function applyZebraStriping() {
  const rows = [...document.querySelectorAll("#tbody tr")]
    .filter(r => r.style.display !== "none");

  rows.forEach((row, i) => {
    row.classList.toggle("row-even", i % 2 === 0);
    row.classList.toggle("row-odd", i % 2 !== 0);
  });
}

function applyAllFilters() {
  const search = document.getElementById("search").value.toLowerCase().trim();
  const activeCat =
    document.querySelector(".cat-btn.active")?.dataset.category || "components";

  document.querySelectorAll("#tbody tr").forEach(row => {
    const text = row.textContent.toLowerCase();
    const size = row.children[1]?.textContent.trim();
    const grade = row.children[3]?.textContent.trim();
    const cat = row.dataset.category;

    let show = true;
    if (search && !text.includes(search)) show = false;
    if (cat !== activeCat) show = false;
    if (quickFilters.size !== "all" && size !== quickFilters.size) show = false;
    if (quickFilters.grade !== "all" && grade !== quickFilters.grade) show = false;

    row.style.display = show ? "" : "none";
  });

  applyZebraStriping();
}


/* =========================================================
   PRICING & TOTAL CALCULATIONS
========================================================= */

function recalcOrderTotals() {
  let total = 0;

  document.querySelectorAll(".order-row").forEach(row => {
    const sku = row.querySelector(".order-item")?.value;
    const qtyInput = row.querySelector(".order-qty");
    const qty = Number(qtyInput?.value || 0);
    const price = getPriceBySKU(sku);
    const lineEl = row.querySelector(".line-total");

    const maxStock =
      INVENTORY_ITEMS.find(i => i.sku === sku)?.stock ?? Infinity;

    // Enforce stock limit
    if (qty > maxStock) {
      qtyInput.value = maxStock;
    }

    const lineTotal = price * qtyInput.value;
    total += lineTotal;

    if (lineEl) {
      lineEl.textContent = lineTotal
        ? `${lineTotal.toLocaleString()} aUEC`
        : "0 aUEC";
    }
  });

  document.getElementById("orderTotal").textContent =
    `${total.toLocaleString()} aUEC`;

  return total;
}



/* =========================================================
   ORDER MODAL & ORDER ROWS
========================================================= */

const placeOrderBtn = document.getElementById("placeOrderBtn");
const orderModal = document.getElementById("orderModal");
const closeOrderBtn = document.getElementById("closeOrder");
const addOrderItemBtn = document.getElementById("addOrderItem");
const orderItemsContainer = document.getElementById("orderItems");

function createOrderRow() {
  const row = document.createElement("div");
  row.className = "order-row";
  row.innerHTML = `
    <select class="order-item"></select>
    <input type="number" class="order-qty" min="1" value="1" />
    <span class="line-total">0 aUEC</span>
  `;
  return row;
}

function resetOrderModal() {
  orderItemsContainer.innerHTML = "";
  const row = createOrderRow();
  orderItemsContainer.appendChild(row);
  populateOrderSelect(row.querySelector(".order-item"));
  recalcOrderTotals();
}

placeOrderBtn?.addEventListener("click", () => {
  resetOrderModal();
  orderModal.classList.remove("hidden");
});

closeOrderBtn?.addEventListener("click", () => {
  orderModal.classList.add("hidden");
});

orderModal?.addEventListener("click", e => {
  if (e.target === orderModal) orderModal.classList.add("hidden");
});

addOrderItemBtn?.addEventListener("click", () => {
  const row = createOrderRow();
  orderItemsContainer.appendChild(row);
  populateOrderSelect(row.querySelector(".order-item"));
  recalcOrderTotals();
});

orderItemsContainer?.addEventListener("input", e => {
  if (
    e.target.classList.contains("order-qty") ||
    e.target.classList.contains("order-item")
  ) {
    recalcOrderTotals();
  }
});



/* =========================================================
   ORDER ITEM POPULATION
========================================================= */
function populateOrderSelect(select) {
  if (!INVENTORY_ITEMS || !INVENTORY_ITEMS.length) {
    select.innerHTML = `<option value="">Inventory unavailable</option>`;
    return;
  }

  const sorted = [...INVENTORY_ITEMS].sort((a, b) => {
    const sizeA = Number(a.sku.split("-")[0]) || 0;
    const sizeB = Number(b.sku.split("-")[0]) || 0;
    if (sizeA !== sizeB) return sizeA - sizeB;
    return a.name.localeCompare(b.name);
  });

  select.innerHTML = `<option value="">Select item…</option>`;

  sorted.forEach(item => {
  const opt = document.createElement("option");
  opt.value = item.sku;
  opt.textContent = `${item.name} (Stock: ${item.stock})`;
  opt.dataset.stock = item.stock;

  if (item.stock <= 0) {
    opt.disabled = true;
    opt.textContent += " — OUT OF STOCK";
  }

  select.appendChild(opt);
});
}



/* =========================================================
   DISCORD ORDER SUBMISSION
========================================================= */

document.getElementById("submitOrder")?.addEventListener("click", async () => {
  try {
    const row = document.querySelector(".order-row");
    const sku = row.querySelector(".order-item")?.value;
    const qty = Number(row.querySelector(".order-qty")?.value || 0);
    const discord = document.getElementById("orderDiscord")?.value || "";
    const notes = document.getElementById("orderNotes")?.value || "";

    if (!sku || qty <= 0) {
      alert("Please select an item and quantity.");
      return;
    }

    // DEBUG: confirm what we're sending
    console.log("SUBMIT SKU:", sku);

    const params = new URLSearchParams({ sku, qty, discord, notes });
    const res = await fetch(`${API_URL}?${params.toString()}`);
    const result = await res.json();

    if (!result.success) {
      alert(result.error || "Order failed");
      return;
    }

    alert(result.dryRun
      ? "🧪 Test order submitted (no stock changed)"
      : "✅ Order submitted successfully"
    );

  } catch (err) {
    console.error(err);
    alert("Network error submitting order.");
  }
});
