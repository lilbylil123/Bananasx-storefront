<script>
  // === Settings ===
const CSV_URL = "https://corsproxy.io/?" + encodeURIComponent("https://docs.google.com/spreadsheets/d/e/2PACX-1vT6xm990HH7LTwD7X8YDM8oeG35kSGPNv0ZKEohbCdm9oDHzC77_v73RVR8KHWRa5udSKHb9oyqEc4o/pub?gid=613857331&single=true&output=csv");

  const GOLD = "#ffcc00";

  // === Discord ===
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1451374761958703135/VvmaKD3wJqBIs7Zkge7JM7wgLI6_bTz6GN197T4giUB8UTeHLchzyJZ1g_gxJ4w_Vyd6";

  // Simple CSV parser (handles commas in values wrapped with quotes)
  function parseCSV(text){
    const rows = [];
    let cur = [], val = "", inQuotes = false;
    for (let i=0;i<text.length;i++){
      const c = text[i], n = text[i+1];
      if (inQuotes){
        if (c === '"' && n === '"'){ val += '"'; i++; continue; }
        if (c === '"' && n !== '"'){ inQuotes = false; continue; }
        val += c;
      } else {
        if (c === '"'){ inQuotes = true; continue; }
        if (c === ','){ cur.push(val); val = ""; continue; }
        if (c === '\n'){ cur.push(val); rows.push(cur); cur = []; val = ""; continue; }
        if (c === '\r'){ continue; }
        val += c;
      }
    }
    if (val.length || cur.length) { cur.push(val); rows.push(cur); }
    return rows;
  }

  function formatPrice(x){
    const n = Number(x);
    if (!isFinite(n)) return x || "";
    // Compact currency-ish (no symbol so it works globally)
    return n >= 1_000_000 ? (n/1_000_000).toFixed(2) + "M"
         : n >= 1_000     ? (n/1_000).toFixed(2) + "K"
         : n.toFixed(0);
  }

  async function load(){
  const t0 = Date.now();
  const res = await fetch(CSV_URL, { cache: "no-store", mode: "cors" });
  const txt = await res.text();
      console.log("CSV text preview:", txt.slice(0, 500));
  const rows = parseCSV(txt).filter(r => r.length);
  if (!rows.length) return;


    // Expect headers in first row from your Public sheet:
    // Name | Size | Type | Grade | Current Stock | Sell Price | SKU
    const head = rows[0].map(s => s.trim());
    const body = rows.slice(1);

    const idx = (name) => head.indexOf(name);
    const iName = idx("Name"),
          iSize = idx("Size"),
          iType = idx("Type"),
          iGrade = idx("Grade"),
          iStock = idx("Current Stock"),
          iPrice = idx("Sell Price"),
          iSku   = idx("SKU"),
          iCategory = idx("Category");

    const tb = document.getElementById("tbody");

// --- Click-to-sort helper ---
function makeSortable(headers, data, render) {
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

// --- Render function ---
function renderTable() {
  tb.innerHTML = "";
  body.forEach(r => {
    if (!r[iName]) return;
   const tr = document.createElement("tr");
      tr.setAttribute("data-category",(r[iCategory] || "components").toLowerCase()
);



    const tdName = document.createElement("td"); tdName.textContent = r[iName] || ""; tr.appendChild(tdName);
    const tdSize = document.createElement("td"); tdSize.textContent = r[iSize] || ""; tdSize.className="center"; tr.appendChild(tdSize);
    const tdType = document.createElement("td"); tdType.textContent = r[iType] || ""; tr.appendChild(tdType);
    const tdGrade= document.createElement("td"); tdGrade.textContent= r[iGrade]|| ""; tr.appendChild(tdGrade);

    const stockVal = Number(r[iStock] || 0);
    const tdStock= document.createElement("td"); tdStock.textContent = isFinite(stockVal)? stockVal : (r[iStock]||""); tdStock.className="center"; tr.appendChild(tdStock);

    const tdPrice= document.createElement("td"); tdPrice.textContent = formatPrice(r[iPrice]); tdPrice.className="right price";
    if (stockVal > 0) tdPrice.style.color = GOLD;
    tr.appendChild(tdPrice);

    const tdSku  = document.createElement("td"); tdSku.textContent   = r[iSku] || ""; tdSku.className="muted"; tr.appendChild(tdSku);

    tb.appendChild(tr);
  });
}

   // --- Initial render + make headers sortable ---
renderTable();
makeSortable(head, body, renderTable);

// ✅ APPLY FILTERS AFTER ROWS EXIST
applyAllFilters();


    // Updated time
    const ms = Date.now() - t0;
    const d = new Date();
    document.getElementById("updated").textContent = "Updated " +
      d.toLocaleString([], {hour:'2-digit', minute:'2-digit'}) + " • " + ms + "ms";
  }

  // === Build price map from rendered table (AFTER renderTable) ===
window.buildPriceMap = function () {
  const map = {};

  document.querySelectorAll("#tbody tr").forEach(row => {
    const name = row.children[0]?.textContent.trim();
    const priceText = row.children[5]?.textContent.trim();

    if (!name || !priceText) return;

    let price =
      priceText.includes("M")
        ? parseFloat(priceText) * 1_000_000
        : priceText.includes("K")
        ? parseFloat(priceText) * 1_000
        : parseFloat(priceText);

    if (Number.isFinite(price)) {
      map[name] = price;
    }
  });

  return map;
};


  load();
  // Optional: refresh every 2 minutes
  // setInterval(load, 120000);

// === Quick Filter State ===
let quickFilters = {
  size: "all",
  grade: "all"
};

  function applyZebraStriping() {
  const visibleRows = Array.from(
    document.querySelectorAll("#tbody tr")
  ).filter(row => row.style.display !== "none");

  visibleRows.forEach((row, index) => {
    row.classList.remove("row-even", "row-odd");
    row.classList.add(index % 2 === 0 ? "row-even" : "row-odd");
  });
}

// === Master Filter: Search + Category + Size + Grade ===
function applyAllFilters() {
  const searchTerm = document.getElementById("search").value
    .toLowerCase()
    .trim();

  const activeCategory =
    document.querySelector(".cat-btn.active")?.dataset.category || "components";

  document.querySelectorAll("#tbody tr").forEach(row => {
    const text = row.textContent.toLowerCase();
    const size = row.children[1]?.textContent.trim();
    const grade = row.children[3]?.textContent.trim();
    const category = row.dataset.category;

    let visible = true;

    if (searchTerm && !text.includes(searchTerm)) visible = false;
    if (category !== activeCategory) visible = false;
    if (quickFilters.size !== "all" && size !== quickFilters.size) visible = false;
    if (quickFilters.grade !== "all" && grade !== quickFilters.grade) visible = false;

    row.style.display = visible ? "" : "none";
  });
   applyZebraStriping();
}
// === Category Tabs (Context-Aware) ===
document.querySelectorAll(".cat-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    const cat = btn.dataset.category;

    // COMPONENTS → Size + Grade
    if (cat === "components") {
      document.querySelector(".quick-filters").style.display = "flex";
      document.getElementById("filter-size").style.display = "flex";
      document.getElementById("filter-grade").style.display = "flex";
    }

    // WEAPONS → Size only
    if (cat === "weapons") {
      document.querySelector(".quick-filters").style.display = "flex";
      document.getElementById("filter-size").style.display = "flex";
      document.getElementById("filter-grade").style.display = "none";

      // Reset grade
      quickFilters.grade = "all";
      document
        .querySelectorAll('.filter-pill[data-filter="grade"]')
        .forEach(p => p.classList.remove("active"));

      document
        .querySelector('.filter-pill[data-filter="grade"][data-value="all"]')
        ?.classList.add("active");
    }

    applyAllFilters();
  });
});
// === Size & Grade Pill Click Handling ===
document.querySelectorAll(".filter-pill").forEach(pill => {
  pill.addEventListener("click", () => {
    const group = pill.dataset.filter;
    const value = pill.dataset.value;

        // 🚫 Hard guard: Size 3 Stealth cannot be selected
    if (
      group === "grade" &&
      value === "A Stealth" &&
      quickFilters.size === "3"
    ) {
      return;
    }

    // Clear active state for this group
    document
      .querySelectorAll(`.filter-pill[data-filter="${group}"]`)
      .forEach(p => p.classList.remove("active"));

    pill.classList.add("active");
    quickFilters[group] = value;

    // 🚫 Game rule: Size 3 Stealth does not exist
    const stealthPill = document.querySelector(
      '.filter-pill[data-filter="grade"][data-value="A Stealth"]'
    );

    if (group === "size" && value === "3") {
      // Hide stealth option
      if (stealthPill) stealthPill.style.display = "none";

      // Reset grade if stealth was active
      if (quickFilters.grade === "A Stealth") {
        quickFilters.grade = "all";
        document
          .querySelectorAll('.filter-pill[data-filter="grade"]')
          .forEach(p => p.classList.remove("active"));

        document
          .querySelector('.filter-pill[data-filter="grade"][data-value="all"]')
          ?.classList.add("active");
      }
  
  // Only restore Stealth if size is NOT S3
  if (quickFilters.size !== "3" && stealthPill) {
    stealthPill.style.display = "";
  }
}


    applyAllFilters();
  });
});


// === Search input hooks into master filter ===
document
  .getElementById("search")
  .addEventListener("input", applyAllFilters);

  // === Recalculate Order Totals (uses price map from table) ===
function recalcOrderTotals() {
  if (typeof buildPriceMap !== "function") return 0;

  const priceMap = buildPriceMap();
  let grandTotal = 0;

  document.querySelectorAll(".order-row").forEach(row => {
    const item = row.querySelector(".order-item")?.value;
    const qty = Number(row.querySelector(".order-qty")?.value || 0);
    const lineEl = row.querySelector(".line-total");

    const price = priceMap[item] || 0;
    const lineTotal = price * qty;

    if (lineEl) {
      lineEl.textContent = `$${lineTotal.toLocaleString()}`;
    }

    grandTotal += lineTotal;
  });

  const totalEl = document.getElementById("orderTotal");
  if (totalEl) {
    totalEl.textContent = `${grandTotal.toLocaleString()} aUEC`;
  }

  return grandTotal;
}

  // Live update totals when item or quantity changes
document.addEventListener("input", e => {
  if (
    e.target.classList.contains("order-item") ||
    e.target.classList.contains("order-qty")
  ) {
    recalcOrderTotals();
  }
});




  /* ===== ORDER MODAL LOGIC ===== */

const placeOrderBtn = document.getElementById("placeOrderBtn");
const orderModal = document.getElementById("orderModal");
const closeOrderBtn = document.getElementById("closeOrder");

if (placeOrderBtn) {
  placeOrderBtn.addEventListener("click", () => {
    orderModal.classList.remove("hidden");
    resetOrderModal(); 
  });
}

if (closeOrderBtn) {
  closeOrderBtn.addEventListener("click", () => {
    orderModal.classList.add("hidden");
    orderItemsContainer.innerHTML = ""; // cleanup
  });
}

// Close modal if clicking outside content
orderModal?.addEventListener("click", e => {
  if (e.target === orderModal) {
    orderModal.classList.add("hidden");
  }
});

  /* ===== POPULATE ORDER ITEM DROPDOWNS ===== */

function getVisibleItems() {
  const rows = document.querySelectorAll("#tbody tr");
  const items = [];

  rows.forEach(row => {
    if (row.style.display === "none") return;

    const nameCell = row.querySelector("td");
    if (nameCell) {
      items.push(nameCell.textContent.trim());
    }
  });

  return items;
}

function populateOrderSelect(select) {
  select.innerHTML = "";
  const items = getVisibleItems();

  items.forEach(item => {
    const opt = document.createElement("option");
    opt.value = item;
    opt.textContent = item;
    select.appendChild(opt);
  });
}

// Populate initial dropdown when modal opens
placeOrderBtn?.addEventListener("click", () => {
  document.querySelectorAll(".order-item").forEach(populateOrderSelect);
});
  function resetOrderModal() {
  if (!orderItemsContainer) return;

  orderItemsContainer.innerHTML = "";

  // Create ONE clean base row
  const row = document.createElement("div");
  row.className = "order-row";

  row.innerHTML = `
    <label>Item</label>
    <select class="order-item"></select>

    <label>Quantity</label>
    <input type="number" class="order-qty" min="1" value="1" />
  `;

  orderItemsContainer.appendChild(row);

  // Populate dropdown using visible table rows
  populateOrderSelect(row.querySelector(".order-item"));
}


  /* ===== ADD MULTIPLE ORDER ITEMS ===== */

const addOrderItemBtn = document.getElementById("addOrderItem");
const orderItemsContainer = document.getElementById("orderItems");

addOrderItemBtn?.addEventListener("click", () => {
  const firstRow = orderItemsContainer.querySelector(".order-row");
  if (!firstRow) return;

  const newRow = firstRow.cloneNode(true);
  newRow.querySelector(".order-qty").value = 1;

  orderItemsContainer.appendChild(newRow);
  populateOrderSelect(newRow.querySelector(".order-item"));
});


/* ===== SUBMIT ORDER → DISCORD WEBHOOK ===== */

document.getElementById("submitOrder")?.addEventListener("click", async () => {
  const items = [];

  document.querySelectorAll(".order-row").forEach(row => {
    const item = row.querySelector(".order-item")?.value;
    const qty = Number(row.querySelector(".order-qty")?.value || 0);
    if (item && qty > 0) {
      items.push(`• **${item}** × ${qty}`);
    }
  });

  const orderTotal = recalcOrderTotals(); // ✅ REQUIRED

  const delivery = document.getElementById("deliveryRequired")?.value || "No";
  const discord = document.getElementById("orderDiscord")?.value?.trim() || "Not provided";
  const notes = document.getElementById("orderNotes")?.value?.trim() || "—";

  const payload = {
    embeds: [
      {
        title: "🛒 New BananasX Order",
        color: 0xffcc00,
        fields: [
          { name: "Items", value: items.join("\n") },
          {
            name: "Order Total",
            value: `${orderTotal.toLocaleString()} aUEC`,
            inline: false
          },
          { name: "Delivery Required", value: delivery, inline: true },
          { name: "Discord Handle", value: discord, inline: true },
          { name: "Notes", value: notes }
        ],
        footer: { text: "BananasX & Co." },
        timestamp: new Date().toISOString()
      }
    ]
  };


  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    alert("Order sent successfully!");
    orderModal.classList.add("hidden");

    // Reset modal
    document.getElementById("orderItems").innerHTML = `
      <div class="order-row">
        <select class="order-item"></select>
        <input type="number" class="order-qty" min="1" value="1" />
      </div>
    `;
    populateOrderSelect(document.querySelector(".order-item"));

    document.getElementById("deliveryRequired").value = "No";
    document.getElementById("orderDiscord").value = "";
    document.getElementById("orderNotes").value = "";
  } catch (err) {
    console.error("Webhook failed:", err);
    alert("Failed to send order. Check console.");
  }
});




  
</script>
