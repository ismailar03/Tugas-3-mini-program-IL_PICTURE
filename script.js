const STORAGE = {
  inventory: "il-picture-rental-inventory-v2",
  rentals: "il-picture-rentals-v2",
};

const defaultProducts = [
  { id: "xr", name: "iPhone XR", price: 50000, stock: 5 },
  { id: "11", name: "iPhone 11", price: 60000, stock: 4 },
  { id: "11-pro-max", name: "iPhone 11 Pro Max", price: 80000, stock: 3 },
  { id: "12-pro", name: "iPhone 12 Pro", price: 90000, stock: 3 },
  { id: "13", name: "iPhone 13", price: 100000, stock: 4 },
  { id: "14", name: "iPhone 14", price: 120000, stock: 2 },
];

let products = readStoredList(STORAGE.inventory, defaultProducts);
let rentals = readStoredList(STORAGE.rentals, []);
let selectedProductId = null;
let pendingRental = null;

function readStoredList(key, fallback) {
  const saved = localStorage.getItem(key);
  if (saved === null) return structuredClone(fallback);
  try {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed))
      throw new Error("Data tersimpan bukan daftar yang valid.");
    return parsed;
  } catch (error) {
    console.error(`Tidak dapat membaca ${key} dari localStorage.`, error);
    window.addEventListener(
      "DOMContentLoaded",
      () => {
        showMessage(
          "#booking-message",
          "Data rental tersimpan tidak dapat dibaca. Hapus data situs untuk memulai ulang.",
        );
      },
      { once: true },
    );
    return structuredClone(fallback);
  }
}

function formatRupiah(value) {
  const amount = new Intl.NumberFormat("id-ID").format(Math.abs(value));
  return value < 0 ? `-Rp${amount}` : `Rp${amount}`;
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

function dateToLocalInput(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function rentalDuration(startDate, returnDate) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${returnDate}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end)
    ? Math.round((end - start) / 86400000)
    : 0;
}

function calculateBookingTotal(pricePerDay, days) {
  // FAULT 1: subtotal menggunakan penjumlahan, seharusnya perkalian
  return pricePerDay + days;
}

function calculateChange(payment, total) {
  return payment - total;
}

function isProductRentable(product) {
  // FAULT 2: validasi stok salah.
  // Stok 0 masih dianggap tersedia.
  return product.stock >= 0;
}

function isPaymentAccepted(payment, total) {
  // FAULT 3: pembayaran kurang tetap diterima, seharusnya transaksi ditolak
  return Number.isFinite(payment) && payment >= 0;
}

function productVisual(product, extraClass = "") {
  const single = product.id === "xr" ? "phone-single" : "";
  const modelClass = product.id.includes("pro") ? "model-pro" : "";
  return `<div class="product-art ${modelClass} ${extraClass}" aria-hidden="true"><span class="mini-phone ${single}"></span></div>`;
}

function productCard(product, index) {
  const available = isProductRentable(product);
  const stockLabel = product.stock > 0
    ? `Tersedia · ${product.stock} unit`
    : `Stok habis · ${product.stock} unit`;
  return `
    <article class="product-card">
      <div class="product-card-top"><span>IL SELECT / 0${index + 1}</span><span class="availability ${product.stock > 0 ? "" : "unavailable"}">${escapeHtml(stockLabel)}</span></div>
      ${productVisual(product)}
      <div class="product-info">
        <div><h3>${escapeHtml(product.name)}</h3><p><strong>${formatRupiah(product.price)}</strong> / hari</p></div>
        <button class="rent-now" type="button" data-rent-product="${escapeHtml(product.id)}" ${available ? "" : "disabled"}>Sewa Sekarang ↗</button>
      </div>
    </article>`;
}

function renderProducts() {
  const markup = products.map(productCard).join("");
  document.querySelector("#home-products").innerHTML = markup;
  document.querySelector("#catalog-products").innerHTML = markup;
}

function showView(viewName) {
  const target = document.querySelector(`[data-view="${viewName}"]`);
  if (!target) return;
  document.querySelectorAll(".page-view").forEach((view) => {
    view.hidden = view !== target;
  });
  document.querySelectorAll(".main-nav [data-view-link]").forEach((link) => {
    link.classList.toggle("active", link.dataset.viewLink === viewName);
  });
  history.replaceState(null, "", `#${viewName}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (viewName === "my-rentals") renderRentalLists();
  if (viewName === "history") renderRentalLists();
}

function openBooking(productId) {
  const product = products.find((item) => item.id === productId);
  if (!product || !isProductRentable(product)) return;
  selectedProductId = productId;
  pendingRental = null;
  document.querySelector("#booking-form").reset();
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const startDate = document.querySelector("#start-date");
  const returnDate = document.querySelector("#return-date");
  startDate.min = dateToLocalInput(today);
  startDate.value = dateToLocalInput(today);
  returnDate.min = dateToLocalInput(tomorrow);
  returnDate.value = dateToLocalInput(tomorrow);
  document.querySelector("#booking-phone-name").textContent = product.name;
  document.querySelector("#booking-product-preview").innerHTML = `
    <span class="preview-art" aria-hidden="true"></span>
    <div><strong>${escapeHtml(product.name)}</strong><span>${formatRupiah(product.price)} / hari · stok ${product.stock}</span></div>`;
  showMessage("#booking-message", "");
  updateBookingSummary();
  showView("rental");
}

function showMessage(selector, message) {
  const element = document.querySelector(selector);
  element.textContent = message;
  element.classList.toggle("visible", Boolean(message));
}

function updateBookingSummary() {
  const product = products.find((item) => item.id === selectedProductId);
  const start = document.querySelector("#start-date").value;
  const end = document.querySelector("#return-date").value;
  const days = rentalDuration(start, end);
  document.querySelector("#booking-duration").textContent =
    days > 0 ? `${days} hari` : "Pilih tanggal";
  document.querySelector("#booking-price").textContent = product
    ? `${formatRupiah(product.price)} / hari`
    : "—";
  document.querySelector("#booking-total").textContent =
    product && days > 0
      ? formatRupiah(calculateBookingTotal(product.price, days))
      : "—";
  if (start) {
    const minimumReturn = new Date(`${start}T00:00:00`);
    minimumReturn.setDate(minimumReturn.getDate() + 1);
    document.querySelector("#return-date").min =
      dateToLocalInput(minimumReturn);
  }
}

function saveState(updatedProducts, updatedRentals) {
  const oldInventory = localStorage.getItem(STORAGE.inventory);
  const oldRentals = localStorage.getItem(STORAGE.rentals);
  try {
    localStorage.setItem(STORAGE.inventory, JSON.stringify(updatedProducts));
    localStorage.setItem(STORAGE.rentals, JSON.stringify(updatedRentals));
    return true;
  } catch (error) {
    console.error("Gagal menyimpan data rental ke localStorage.", error);
    try {
      if (oldInventory === null) localStorage.removeItem(STORAGE.inventory);
      else localStorage.setItem(STORAGE.inventory, oldInventory);
      if (oldRentals === null) localStorage.removeItem(STORAGE.rentals);
      else localStorage.setItem(STORAGE.rentals, oldRentals);
    } catch (rollbackError) {
      console.error(
        "Gagal memulihkan data rental setelah penyimpanan gagal.",
        rollbackError,
      );
    }
    return false;
  }
}

function renderRentalLists() {
  const today = dateToLocalInput(new Date());
  const activeRentals = rentals.filter((rental) => !rental.returnedAt);
  document.querySelector("#active-rentals").innerHTML = activeRentals.length
    ? activeRentals.map((rental) => rentalCard(rental, today)).join("")
    : '<div class="empty-state">Belum ada penyewaan aktif.<br>Pilih iPhone favoritmu untuk memulai.</div>';
  const history = [...rentals].reverse();
  document.querySelector("#rental-history").innerHTML = history.length
    ? history.map((rental) => rentalCard(rental, today)).join("")
    : '<div class="empty-state">Riwayat penyewaanmu akan tersimpan di sini.<br>Belum ada rental yang tercatat.</div>';
}

function rentalCard(rental, today) {
  const product = products.find((item) => item.id === rental.productId);
  const daysLate =
    !rental.returnedAt && today > rental.returnDate
      ? rentalDuration(rental.returnDate, today)
      : 0;
  const status = rental.returnedAt
    ? "SELESAI"
    : daysLate > 0
      ? "TERLAMBAT"
      : "AKTIF";
  const statusClass = rental.returnedAt
    ? "completed"
    : daysLate > 0
      ? "late"
      : "";
  const returnedAction = !rental.returnedAt
    ? `<button type="button" data-return-rental="${escapeHtml(rental.id)}">Tandai dikembalikan</button>`
    : "";
  return `
    <article class="rental-item">
      <div class="rental-item-art">${productVisual(product || { id: "", name: rental.phone }, "compact-art")}</div>
      <div><h3>${escapeHtml(rental.phone)}</h3><p>Penyewa: ${escapeHtml(rental.name)}<br>${escapeHtml(rental.whatsapp)}</p></div>
      <div class="rental-item-meta"><div>Tanggal sewa: <strong>${formatDate(rental.startDate)}</strong></div><div>Tanggal kembali: <strong>${formatDate(rental.returnDate)}</strong></div><div>${rental.days} hari · ${formatRupiah(rental.total)}</div>${daysLate > 0 ? `<div>Terlambat: <strong>${daysLate} hari</strong></div>` : ""}</div>
      <div class="rental-item-side"><span class="rental-status ${statusClass}">${status}</span>${returnedAction}</div>
    </article>`;
}

function handleReturn(rentalId) {
  const rental = rentals.find((item) => item.id === rentalId);
  if (!rental || rental.returnedAt) return;
  const updatedRentals = rentals.map((item) =>
    item.id === rentalId
      ? { ...item, returnedAt: dateToLocalInput(new Date()) }
      : item,
  );
  const updatedProducts = products.map((product) =>
    product.id === rental.productId
      ? { ...product, stock: product.stock + 1 }
      : product,
  );
  if (!saveState(updatedProducts, updatedRentals)) {
    window.alert(
      "Pengembalian tidak dapat disimpan. Periksa pengaturan penyimpanan browser.",
    );
    return;
  }
  products = updatedProducts;
  rentals = updatedRentals;
  renderProducts();
  renderRentalLists();
}

function openFault3MainFlow() {
  const product = products.find((item) => item.id === "11");
  if (!product || product.stock < 1) {
    document.querySelector("#fault3-fixture-message").textContent =
      "iPhone 11 tidak tersedia. Kembalikan unit terlebih dahulu untuk menjalankan skenario ini.";
    return;
  }

  const start = new Date();
  const end = new Date(start);
  end.setDate(start.getDate() + 3);
  const startDate = dateToLocalInput(start);
  const returnDate = dateToLocalInput(end);
  selectedProductId = product.id;
  pendingRental = {
    productId: product.id,
    phone: product.name,
    price: product.price,
    name: "Penyewa Uji Fault 3",
    whatsapp: "08000000000",
    startDate,
    returnDate,
    days: 3,
    total: 180000,
  };

  document.querySelector("#payment-phone-name").textContent =
    pendingRental.phone;
  document.querySelector("#payment-dates").textContent =
    `${formatDate(startDate)} — ${formatDate(returnDate)}`;
  document.querySelector("#payment-duration").textContent = "3 hari";
  document.querySelector("#payment-price").textContent =
    `${formatRupiah(product.price)} / hari`;
  document.querySelector("#payment-total").textContent = formatRupiah(
    pendingRental.total,
  );
  document.querySelector("#payment-form").reset();
  document.querySelector("#payment-success").hidden = true;
  document.querySelector("#confirm-payment").disabled = false;
  document.querySelector("#confirm-payment").innerHTML =
    'Konfirmasi Pembayaran <span aria-hidden="true">→</span>';
  showMessage("#payment-message", "");
  showView("payment");
}

document.addEventListener("click", (event) => {
  const viewLink = event.target.closest("[data-view-link]");
  if (viewLink) {
    event.preventDefault();
    showView(viewLink.dataset.viewLink);
    return;
  }
  const rentButton = event.target.closest("[data-rent-product]");
  if (rentButton) {
    openBooking(rentButton.dataset.rentProduct);
    return;
  }
  const returnedButton = event.target.closest("[data-return-rental]");
  if (returnedButton) handleReturn(returnedButton.dataset.returnRental);
  const paymentFixtureButton = event.target.closest("#open-fault3-main-flow");
  if (paymentFixtureButton) openFault3MainFlow();
});

document
  .querySelector("#start-date")
  .addEventListener("change", updateBookingSummary);
document
  .querySelector("#return-date")
  .addEventListener("change", updateBookingSummary);

document.querySelector("#booking-form").addEventListener("submit", (event) => {
  event.preventDefault();
  showMessage("#booking-message", "");
  const product = products.find((item) => item.id === selectedProductId);
  const name = document.querySelector("#renter-name").value.trim();
  const whatsapp = document.querySelector("#renter-whatsapp").value.trim();
  const startDate = document.querySelector("#start-date").value;
  const returnDate = document.querySelector("#return-date").value;
  const days = rentalDuration(startDate, returnDate);
  if (!product || !isProductRentable(product)) {
    showMessage(
      "#booking-message",
      "iPhone yang dipilih sedang tidak tersedia.",
    );
    return;
  }
  if (!name || !/^[+\d\s()-]{8,20}$/.test(whatsapp)) {
    showMessage(
      "#booking-message",
      "Masukkan nama dan nomor WhatsApp yang valid.",
    );
    return;
  }
  if (
    !startDate ||
    !returnDate ||
    days < 1 ||
    startDate < dateToLocalInput(new Date())
  ) {
    showMessage(
      "#booking-message",
      "Tanggal kembali harus setelah tanggal mulai, dan tanggal mulai tidak boleh di masa lalu.",
    );
    return;
  }
  pendingRental = {
    productId: product.id,
    phone: product.name,
    price: product.price,
    name,
    whatsapp,
    startDate,
    returnDate,
    days,
    total: calculateBookingTotal(product.price, days),
  };
  document.querySelector("#payment-phone-name").textContent =
    pendingRental.phone;
  document.querySelector("#payment-dates").textContent =
    `${formatDate(startDate)} — ${formatDate(returnDate)}`;
  document.querySelector("#payment-duration").textContent = `${days} hari`;
  document.querySelector("#payment-price").textContent =
    `${formatRupiah(product.price)} / hari`;
  document.querySelector("#payment-total").textContent = formatRupiah(
    pendingRental.total,
  );
  document.querySelector("#payment-form").reset();
  document.querySelector("#payment-success").hidden = true;
  document.querySelector("#confirm-payment").disabled = false;
  document.querySelector("#confirm-payment").innerHTML =
    'Konfirmasi Pembayaran <span aria-hidden="true">→</span>';
  showMessage("#payment-message", "");
  showView("payment");
});

document.querySelector("#payment-form").addEventListener("submit", (event) => {
  event.preventDefault();
  showMessage("#payment-message", "");
  const payment = Number(document.querySelector("#payment-amount").value);
  if (!pendingRental) {
    showMessage(
      "#payment-message",
      "Detail rental tidak ditemukan. Silakan mulai kembali dari katalog iPhone.",
    );
    return;
  }
  if (!isPaymentAccepted(payment, pendingRental.total)) {
    showMessage(
      "#payment-message",
      "Uang pembayaran tidak cukup. Transaksi belum diselesaikan.",
    );
    return;
  }
  const product = products.find((item) => item.id === pendingRental.productId);
  if (!product || !isProductRentable(product)) {
    showMessage(
      "#payment-message",
      "iPhone yang dipilih sudah tidak tersedia. Silakan pilih perangkat lain.",
    );
    return;
  }
  const rental = {
    ...pendingRental,
    id: `IL-${Date.now().toString(36).toUpperCase()}`,
    payment,
    change: calculateChange(payment, pendingRental.total),
    status: "AKTIF",
    returnedAt: null,
    createdAt: new Date().toISOString(),
  };
  const updatedProducts = products.map((item) =>
    item.id === product.id ? { ...item, stock: item.stock - 1 } : item,
  );
  const updatedRentals = [...rentals, rental];
  if (!saveState(updatedProducts, updatedRentals)) {
    showMessage(
      "#payment-message",
      "Rental tidak dapat disimpan di browser. Periksa pengaturan penyimpanan lalu coba lagi.",
    );
    return;
  }
  products = updatedProducts;
  rentals = updatedRentals;
  renderProducts();
  document.querySelector("#payment-success").innerHTML =
    `<strong>Pembayaran diterima</strong><br>Kembalian: ${formatRupiah(rental.change)}<br>Rental ${escapeHtml(rental.phone)} sudah aktif.<br>Stok tersisa: ${updatedProducts.find((item) => item.id === product.id).stock} unit.`;
  document.querySelector("#payment-success").hidden = false;
  document.querySelector("#confirm-payment").disabled = true;
  document.querySelector("#confirm-payment").textContent =
    "Penyewaan dikonfirmasi";
  pendingRental = null;
});

function readLabInteger(selector, min = 0) {
  const value = Number(document.querySelector(selector).value);
  if (!Number.isSafeInteger(value) || value < min) {
    throw new Error(`Masukkan bilangan bulat minimal ${min}.`);
  }
  return value;
}

function renderLabResult(selector, expected, actual, passed) {
  const result = document.querySelector(selector);
  result.classList.add("has-result");
  result.innerHTML = `
    <div class="result-line"><span>Expected</span><strong>${escapeHtml(expected)}</strong></div>
    <div class="result-line"><span>Actual</span><strong>${escapeHtml(actual)}</strong></div>
    <span class="result-status">${passed ? "PASSED" : "FAILED"}</span>`;
}

function runLabTest(selector, test) {
  const result = document.querySelector(selector);
  try {
    test();
  } catch (error) {
    result.classList.add("has-result");
    result.textContent = error.message;
  }
}

document.querySelector("#test-fault-1").addEventListener("click", () => {
  runLabTest("#fault1-result", () => {
    const price = readLabInteger("#fault1-price");
    const days = readLabInteger("#fault1-days", 1);
    const expected = price * days;
    const actual = calculateBookingTotal(price, days);
    renderLabResult(
      "#fault1-result",
      formatRupiah(expected),
      formatRupiah(actual),
      expected === actual,
    );
  });
});

document.querySelector("#test-fault-2").addEventListener("click", () => {
  runLabTest("#fault2-result", () => {
    const stock = readLabInteger("#fault2-stock");
    const expected = stock > 0;
    const actual = isProductRentable({ stock });
    renderLabResult(
      "#fault2-result",
      expected ? "Penyewaan diizinkan" : "Stok habis, penyewaan ditolak",
      actual ? "Penyewaan diizinkan" : "Penyewaan ditolak",
      actual === expected,
    );
  });
});

document.querySelector("#test-fault-3").addEventListener("click", () => {
  runLabTest("#fault3-result", () => {
    const total = readLabInteger("#fault3-total");
    const payment = readLabInteger("#fault3-payment");
    const change = calculateChange(payment, total);
    const accepted = isPaymentAccepted(payment, total);
    const expected =
      payment < total ? "Pembayaran ditolak" : "Pembayaran diterima";
    const actual = `${accepted ? "Pembayaran diterima" : "Pembayaran ditolak"}; kembalian ${formatRupiah(change)}`;
    renderLabResult(
      "#fault3-result",
      expected,
      actual,
      accepted === payment >= total && change >= 0,
    );
  });
});

renderProducts();
renderRentalLists();
const initialView = location.hash.slice(1);
showView(
  ["home", "iphone", "my-rentals", "history", "testing-lab"].includes(
    initialView,
  )
    ? initialView
    : "home",
);
window.addEventListener("hashchange", () => {
  const requestedView = location.hash.slice(1);
  if (
    ["home", "iphone", "my-rentals", "history", "testing-lab"].includes(
      requestedView,
    )
  ) {
    showView(requestedView);
  }
});
