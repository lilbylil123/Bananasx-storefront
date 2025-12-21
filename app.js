/* =========================================================
   CONFIG / CONSTANTS
========================================================= */

const CSV_URL =
  "https://corsproxy.io/?" +
  encodeURIComponent(
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vT6xm990HH7LTwD7X8YDM8oeG35kSGPNv0ZKEohbCdm9oDHzC77_v73RVR8KHWRa5udSKHb9oyqEc4o/pub?gid=613857331&single=true&output=csv"
  );

const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1451374761958703135/VvmaKD3wJqBIs7Zkge7JM7wgLI6_bTz6GN197T4giUB8UTeHLchzyJZ1g_gxJ4w_Vyd6";
const GOLD = "#ffcc00";


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

  const idx = name => head.indexOf(name);
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

  renderTable();
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

function buildPriceMap() {
  const map = {};
  document.querySelectorAll("#tbody tr").forEach(row => {
    const name = row.children[0]?.textContent.trim();
    const priceText = row.children[5]?.textContent.trim();
    if (!name || !priceText) return;

    const price =
      priceText.includes("M") ? parseFloat(priceText) * 1_000_000 :
      priceText.includes("K") ? parseFloat(priceText) * 1_000 :
      parseFloat(priceText);

    if (Number.isFinite(price)) map[name] = price;
  });
  return map;
}

function recalcOrderTotals() {
  const prices = buildPriceMap();
  let total = 0;

  document.querySelectorAll(".order-row").forEach(row => {
    const item = row.querySelector(".order-item")?.value;
    const qty = Number(row.querySelector(".order-qty")?.value || 0);
    const lineEl = row.querySelector(".line-total");

    const line = (prices[item] || 0) * qty;
    if (lineEl) lineEl.textContent = `${line.toLocaleString()} aUEC`;
    total += line;
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

function getVisibleItems() {
  return [...document.querySelectorAll("#tbody tr")]
    .filter(r => r.style.display !== "none")
    .map(r => r.children[0]?.textContent.trim())
    .filter(Boolean);
}

function populateOrderSelect(select) {
  select.innerHTML = "";
  getVisibleItems().forEach(item => {
    const opt = document.createElement("option");
    opt.value = opt.textContent = item;
    select.appendChild(opt);
  });
}


/* =========================================================
   DISCORD ORDER SUBMISSION
========================================================= */

document.getElementById("submitOrder")?.addEventListener("click", async () => {
  const items = [];
  document.querySelectorAll(".order-row").forEach(row => {
    const item = row.querySelector(".order-item")?.value;
    const qty = Number(row.querySelector(".order-qty")?.value || 0);
    if (item && qty > 0) items.push(`• **${item}** × ${qty}`);
  });

  const total = recalcOrderTotals();

 const payload = {
  embeds: [{
    title: "🛒 New BananasX Order",
    color: 0xffcc00,
    fields: [
      { name: "Items", value: items.join("\n") },
      { name: "Order Total", value: `${total.toLocaleString()} aUEC` },
      { name: "Discord Handle / Name", value: discord, inline: true }
    ],
    timestamp: new Date().toISOString()
  }]
};

  await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  alert("Order sent successfully!");
  orderModal.classList.add("hidden");
  resetOrderModal();
});

