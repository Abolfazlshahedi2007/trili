// ==========================================
// حسابدار تریلی و راننده - فرانت‌اند جاوااسکریپت
// ==========================================

let appState = {
  role: 'owner', // 'owner' یا 'driver'
  settings: {},
  summary: {},
  trips: [],
  expenses: [],
  payments: [],
  settlements: [],
  tripsFilter: 'unsettled',
  expensesFilter: 'all'
};

// --- Shamsi Date Utility ---
function getTodayShamsi() {
  try {
    const today = new Date();
    const formatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.format(today);
    // Convert Persian numbers to English digits for standard storage
    const persianToEnglish = (str) => str.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
    return persianToEnglish(parts);
  } catch (e) {
    return '1405/02/01';
  }
}

// --- Number & Currency Formatting ---
function formatToman(num) {
  if (num === null || num === undefined) return '۰';
  const n = Math.abs(Math.round(num));
  return n.toLocaleString('fa-IR');
}

// --- Initialize App ---
document.addEventListener('DOMContentLoaded', () => {
  // Register Service Worker for PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW registration error:', err));
  }

  // Pre-fill today's Shamsi date in modals
  const today = getTodayShamsi();
  if (document.getElementById('tripLoadingDate')) document.getElementById('tripLoadingDate').value = today;
  if (document.getElementById('expDate')) document.getElementById('expDate').value = today;
  if (document.getElementById('payDate')) document.getElementById('payDate').value = today;

  // Load Initial Data
  loadAllData();
});

async function loadAllData() {
  await Promise.all([
    fetchSettings(),
    fetchSummary(),
    fetchTrips(),
    fetchExpenses(),
    fetchPayments(),
    fetchSettlements()
  ]);
  renderDashboard();
  renderTripsList();
  renderExpensesList();
  renderPaymentsList();
  renderSettlementsList();
}

// --- API Calls ---
async function fetchSettings() {
  try {
    const res = await fetch('/api/settings');
    appState.settings = await res.json();
    updateHeaderWithSettings();
  } catch (err) {
    console.error('Error fetching settings:', err);
  }
}

async function fetchSummary() {
  try {
    const res = await fetch('/api/summary');
    appState.summary = await res.json();
    updateSummaryUI();
  } catch (err) {
    console.error('Error fetching summary:', err);
  }
}

async function fetchTrips() {
  try {
    const res = await fetch('/api/trips');
    appState.trips = await res.json();
  } catch (err) {
    console.error('Error fetching trips:', err);
  }
}

async function fetchExpenses() {
  try {
    const res = await fetch('/api/expenses');
    appState.expenses = await res.json();
  } catch (err) {
    console.error('Error fetching expenses:', err);
  }
}

async function fetchPayments() {
  try {
    const res = await fetch('/api/payments');
    appState.payments = await res.json();
  } catch (err) {
    console.error('Error fetching payments:', err);
  }
}

async function fetchSettlements() {
  try {
    const res = await fetch('/api/settlements');
    appState.settlements = await res.json();
  } catch (err) {
    console.error('Error fetching settlements:', err);
  }
}

// --- Header & Settings UI ---
function updateHeaderWithSettings() {
  const s = appState.settings;
  if (!s) return;
  const plate = s.plate_number || '۱۲ ع ۳۴۵ ایران ۲۱';
  const parts = plate.split('ایران');
  if (parts.length > 1) {
    document.getElementById('plateDisplay').textContent = parts[0].trim();
    document.getElementById('plateCityDisplay').textContent = 'ایران ' + parts[1].trim();
  } else {
    document.getElementById('plateDisplay').textContent = plate;
    document.getElementById('plateCityDisplay').textContent = 'ایران';
  }

  document.getElementById('headerSubtitle').textContent = `${s.truck_model || 'تریلی'} | قرارداد ${s.driver_share_percent || 20}٪`;
}

// --- Role Switcher (Owner vs Driver View) ---
function switchRole(role) {
  appState.role = role;
  document.getElementById('tabRoleOwner').classList.toggle('active', role === 'owner');
  document.getElementById('tabRoleDriver').classList.toggle('active', role === 'driver');
  updateSummaryUI();
}

// --- Summary & Dashboard Rendering ---
function updateSummaryUI() {
  const sum = appState.summary;
  if (!sum) return;

  const balance = sum.final_balance || 0;
  const tagEl = document.getElementById('heroTag');
  const amountEl = document.getElementById('heroAmountText');
  const descEl = document.getElementById('heroDescText');

  amountEl.textContent = formatToman(balance);

  const isDriver = appState.role === 'driver';

  if (balance > 0) {
    // راننده طلبکار است
    tagEl.className = 'hero-status-tag status-credit';
    if (isDriver) {
      tagEl.innerHTML = '🟢 طلب شما از صاحب‌ماشین';
      descEl.textContent = 'شما هم‌اکنون از صاحب ماشین بستانکار هستید و باید به شما پرداخت شود.';
    } else {
      tagEl.innerHTML = '🟢 بدهی پدر به راننده (طلب راننده)';
      descEl.textContent = 'پدر (مالک) باید این مبلغ را در زمان تسویه به راننده پرداخت کند.';
    }
  } else if (balance < 0) {
    // راننده بدهکار است (پول اضافه دستشه)
    tagEl.className = 'hero-status-tag status-debit';
    if (isDriver) {
      tagEl.innerHTML = '🔴 بدهی شما به صاحب‌ماشین';
      descEl.textContent = 'مجموع پیش‌کرایه‌های نقدی و مساعده‌ها بیشتر از سهم شما بوده و این مبلغ دست شماست.';
    } else {
      tagEl.innerHTML = '🔴 بدهی راننده به پدر (طلب پدر)';
      descEl.textContent = 'راننده پول نقد یا مساعده اضافه در دست دارد که باید به پدر پس دهد.';
    }
  } else {
    tagEl.className = 'hero-status-tag status-zero';
    tagEl.innerHTML = '🔵 حساب کاملاً صاف و تراز است';
    descEl.textContent = 'تمامی بارها و خرج‌ها کاملاً تسویه شده و هیچ اختلافی وجود ندارد.';
  }

  // Breakdown values
  document.getElementById('dashDriverShare').textContent = formatToman(sum.driver_share_unsettled) + ' ت';
  document.getElementById('dashDriverExpenses').textContent = '+' + formatToman(sum.driver_paid_expenses) + ' ت';
  document.getElementById('dashCashCollected').textContent = '-' + formatToman(sum.driver_cash_collected) + ' ت';
  document.getElementById('dashAdvancesPaid').textContent = '-' + formatToman(sum.advances_paid) + ' ت';
  document.getElementById('dashTripCountBadge').textContent = (sum.unsettled_trips_count || 0) + ' سفر باز';
}

function renderDashboard() {
  const unsettledTrips = appState.trips.filter(t => !t.is_settled);
  const container = document.getElementById('dashTripsList');
  if (unsettledTrips.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✅</div>
        <div class="empty-text">هیچ بارنامه تسویه نشده‌ای وجود ندارد. تمام بارها تسویه شده‌اند.</div>
      </div>
    `;
  } else {
    container.innerHTML = unsettledTrips.slice(0, 3).map(t => renderTripCardHTML(t)).join('');
  }

  // Unsettled expenses
  const unsettledExpenses = appState.expenses.filter(e => !e.is_settled);
  const expContainer = document.getElementById('dashExpensesList');
  if (unsettledExpenses.length === 0) {
    expContainer.innerHTML = `
      <div class="empty-state" style="padding: 20px;">
        <div class="empty-text">هیچ خرجی ثبت نشده برای این دوره وجود ندارد.</div>
      </div>
    `;
  } else {
    expContainer.innerHTML = unsettledExpenses.slice(0, 4).map(e => renderExpenseCardHTML(e)).join('');
  }
}

// --- Trip Card HTML Generator ---
function renderTripCardHTML(t) {
  const isSettled = t.is_settled;
  return `
    <div class="item-card">
      <div class="card-top">
        <div class="card-title">
          <span>🚚</span>
          <span>${t.origin} به ${t.destination}</span>
        </div>
        <span class="badge-tag ${isSettled ? 'badge-settled' : 'badge-unsettled'}">
          ${isSettled ? 'تسویه شده' : 'تسویه نشده'}
        </span>
      </div>

      <div class="card-body-row">
        <span>بارنامه: <strong>${t.bill_number || '---'}</strong></span>
        <span>نوع بار: <strong>${t.cargo_type || 'تریلی'} (${t.weight_tons || 0} تن)</strong></span>
      </div>

      <div class="card-body-row">
        <span>کل کرایه: <strong>${formatToman(t.total_freight)} ت</strong></span>
        <span>کمیسیون باربری: <strong>${formatToman(t.commission_fee)} ت</strong></span>
      </div>

      <div class="card-highlight-box">
        <div>
          <div class="highlight-label">کرایه صافی بار:</div>
          <div style="font-weight:700; font-size:13px; color:#475569;">${formatToman(t.net_freight)} تومان</div>
        </div>
        <div style="text-align: left;">
          <div class="highlight-label">سهم راننده (${t.driver_share_percent}٪):</div>
          <div class="highlight-value">${formatToman(t.driver_share_amount)} تومان</div>
        </div>
      </div>

      ${t.cash_received_by_driver > 0 ? `
        <div class="card-body-row" style="margin-top: 8px; color: #b45309; background: #fffbeb; padding: 6px 10px; border-radius: 8px;">
          <span>💵 پیش‌کرایه نقدی دست راننده:</span>
          <strong>${formatToman(t.cash_received_by_driver)} تومان</strong>
        </div>
      ` : ''}

      ${!isSettled ? `
        <div class="card-footer-actions">
          <button class="btn-sm-action btn-sm-danger" onclick="deleteTrip(${t.id})">
            <span>🗑️ حذف بارنامه</span>
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

// --- Expense Card HTML Generator ---
function renderExpenseCardHTML(e) {
  const isDriver = e.paid_by === 'driver';
  const categoryIcons = {
    'گازوئیل': '⛽',
    'عوارض': '🛣️',
    'باسکول': '⚖️',
    'انعام': '🤝',
    'پنچری': '🛞',
    'روغن': '🛢️',
    'تعمیرات': '🔧',
    'جریمه': '⚠️',
    'متفرقه': '📝'
  };
  const icon = categoryIcons[e.category] || '💸';

  return `
    <div class="item-card">
      <div class="card-top">
        <div class="card-title">
          <span>${icon}</span>
          <span>${e.category} - ${formatToman(e.amount)} تومان</span>
        </div>
        <span class="badge-tag ${isDriver ? 'badge-driver' : 'badge-owner'}">
          ${isDriver ? 'پرداخت: راننده (طلب)' : 'پرداخت: پدر'}
        </span>
      </div>

      <div class="card-body-row">
        <span>مربوط به: <strong>${e.trip_title || 'خرج عمومی ماشین'}</strong></span>
        <span>تاریخ: <strong>${e.expense_date || '---'}</strong></span>
      </div>

      ${e.description ? `
        <div class="card-body-row" style="font-size: 12px; color: #64748b;">
          <span>شرح: ${e.description}</span>
        </div>
      ` : ''}

      <div class="card-footer-actions">
        ${e.receipt_image ? `
          <button class="btn-sm-action" onclick="viewReceiptImage('${e.receipt_image}')">
            <span>📷 مشاهده رسید</span>
          </button>
        ` : ''}
        ${!e.is_settled ? `
          <button class="btn-sm-action btn-sm-danger" onclick="deleteExpense(${e.id})">
            <span>🗑️ حذف</span>
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

// --- Payment Card HTML Generator ---
function renderPaymentCardHTML(p) {
  return `
    <div class="item-card">
      <div class="card-top">
        <div class="card-title" style="color: #047857;">
          <span>💳</span>
          <span>واریزی: ${formatToman(p.amount)} تومان</span>
        </div>
        <span class="badge-tag badge-settled">${p.payment_method || 'کارت به کارت'}</span>
      </div>

      <div class="card-body-row">
        <span>تاریخ واریز: <strong>${p.payment_date || '---'}</strong></span>
        <span>پیگیری: <strong>${p.tracking_code || '---'}</strong></span>
      </div>

      ${p.description ? `
        <div class="card-body-row" style="font-size: 12px; color: #64748b;">
          <span>بابت: ${p.description}</span>
        </div>
      ` : ''}

      ${!p.is_settled ? `
        <div class="card-footer-actions">
          <button class="btn-sm-action btn-sm-danger" onclick="deletePayment(${p.id})">
            <span>🗑️ حذف</span>
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

// --- Settlements History HTML Generator ---
function renderSettlementCardHTML(s) {
  const balance = s.final_balance || 0;
  const isCredit = balance >= 0;
  return `
    <div class="item-card">
      <div class="card-top">
        <div class="card-title">
          <span>📑</span>
          <span>${s.title}</span>
        </div>
        <span class="badge-tag badge-settled">${s.settlement_date}</span>
      </div>

      <div class="card-body-row">
        <span>تعداد سفرهای بسته شده: <strong>${s.total_trips_count} سفر</strong></span>
        <span>سهم راننده: <strong>${formatToman(s.driver_earned_share)} ت</strong></span>
      </div>

      <div class="card-body-row">
        <span>خرج‌های پرداخت شده راننده: <strong>+${formatToman(s.driver_paid_expenses)} ت</strong></span>
        <span>مساعده‌ها و پیش‌کرایه: <strong>-${formatToman(s.total_driver_debit)} ت</strong></span>
      </div>

      <div class="card-highlight-box" style="background: ${isCredit ? '#ecfdf5' : '#fef2f2'};">
        <div>
          <div class="highlight-label">${isCredit ? 'مبلغ پرداخت شده به راننده:' : 'مبلغ بازگردانده شده توسط راننده:'}</div>
          <div style="font-size: 16px; font-weight: 900; color: ${isCredit ? '#059669' : '#dc2626'};">
            ${formatToman(balance)} تومان
          </div>
        </div>
        <button class="btn-sm-action" onclick="showSettlementDetail(${s.id})">
          مشاهده فاکتور ←
        </button>
      </div>
    </div>
  `;
}

// --- Filter & Views Switching ---
function switchNav(viewName) {
  const views = ['Dashboard', 'Trips', 'Expenses', 'Payments', 'Settlements'];
  views.forEach(v => {
    const el = document.getElementById(`view${v}`);
    if (el) el.style.display = (v.toLowerCase() === viewName.toLowerCase()) ? 'block' : 'none';
  });

  const navs = ['Dash', 'Trips', 'Expenses', 'Payments', 'Settlements'];
  navs.forEach(n => {
    const el = document.getElementById(`nav${n}`);
    if (el) el.classList.toggle('active', n.toLowerCase() === (viewName === 'dashboard' ? 'dash' : viewName.toLowerCase()));
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function filterTrips(status) {
  appState.tripsFilter = status;
  renderTripsList();
}

function renderTripsList() {
  const container = document.getElementById('allTripsList');
  let list = appState.trips;
  if (appState.tripsFilter === 'unsettled') list = list.filter(t => !t.is_settled);
  if (appState.tripsFilter === 'settled') list = list.filter(t => t.is_settled);

  if (list.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🚛</div><div class="empty-text">باری یافت نشد.</div></div>`;
  } else {
    container.innerHTML = list.map(t => renderTripCardHTML(t)).join('');
  }
}

function filterExpenses(paidBy) {
  appState.expensesFilter = paidBy;
  renderExpensesList();
}

function renderExpensesList() {
  const container = document.getElementById('allExpensesList');
  let list = appState.expenses;
  if (appState.expensesFilter === 'driver') list = list.filter(e => e.paid_by === 'driver');
  if (appState.expensesFilter === 'owner') list = list.filter(e => e.paid_by === 'owner');

  if (list.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">⛽</div><div class="empty-text">هزینه‌ای یافت نشد.</div></div>`;
  } else {
    container.innerHTML = list.map(e => renderExpenseCardHTML(e)).join('');
  }
}

function renderPaymentsList() {
  const container = document.getElementById('allPaymentsList');
  if (appState.payments.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">💳</div><div class="empty-text">هیچ واریزی یا مساعده‌ای ثبت نشده است.</div></div>`;
  } else {
    container.innerHTML = appState.payments.map(p => renderPaymentCardHTML(p)).join('');
  }
}

function renderSettlementsList() {
  const container = document.getElementById('allSettlementsList');
  if (appState.settlements.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📑</div><div class="empty-text">هنوز هیچ تسویه‌حسابی ثبت نشده است.</div></div>`;
  } else {
    container.innerHTML = appState.settlements.map(s => renderSettlementCardHTML(s)).join('');
  }
}

// --- Modal Control ---
function openModal(id) {
  document.getElementById(id).classList.add('active');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

// Open Form Modals
function openTripModal() {
  document.getElementById('formTrip').reset();
  document.getElementById('tripLoadingDate').value = getTodayShamsi();
  calcTripSharesLive();
  openModal('modalTrip');
}

function openExpenseModal() {
  document.getElementById('formExpense').reset();
  document.getElementById('expDate').value = getTodayShamsi();
  
  // Populate trip options
  const tripSelect = document.getElementById('expTripId');
  tripSelect.innerHTML = `<option value="">خرج عمومی ماشین (تعویض روغن، بیمه، استهلاک)</option>`;
  const openTrips = appState.trips.filter(t => !t.is_settled);
  openTrips.forEach(t => {
    tripSelect.innerHTML += `<option value="${t.id}">بارنامه ${t.bill_number || ''}: ${t.origin} به ${t.destination}</option>`;
  });

  openModal('modalExpense');
}

function openPaymentModal() {
  document.getElementById('formPayment').reset();
  document.getElementById('payDate').value = getTodayShamsi();
  openModal('modalPayment');
}

function openSettingsModal() {
  const s = appState.settings || {};
  document.getElementById('settingOwner').value = s.owner_name || '';
  document.getElementById('settingDriver').value = s.driver_name || '';
  document.getElementById('settingPlate').value = s.plate_number || '';
  document.getElementById('settingModel').value = s.truck_model || '';
  document.getElementById('settingDriverPct').value = s.driver_share_percent || 20;
  openModal('modalSettings');
}

// --- Live Share Calculator in Trip Form ---
function calcTripSharesLive() {
  const total = parseInt(document.getElementById('tripTotalFreight').value) || 0;
  const commission = parseInt(document.getElementById('tripCommission').value) || 0;
  const net = Math.max(0, total - commission);
  
  const pct = (appState.settings && appState.settings.driver_share_percent) ? appState.settings.driver_share_percent : 20.0;
  const driverShare = Math.round(net * (pct / 100.0));
  const ownerShare = net - driverShare;

  document.getElementById('liveNetFreight').textContent = formatToman(net) + ' تومان';
  document.getElementById('liveDriverShare').textContent = formatToman(driverShare) + ' تومان';
  document.getElementById('liveOwnerShare').textContent = formatToman(ownerShare) + ' تومان';
}

// --- Form Submissions ---
async function handleTripSubmit(e) {
  e.preventDefault();
  const data = {
    origin: document.getElementById('tripOrigin').value,
    destination: document.getElementById('tripDestination').value,
    bill_number: document.getElementById('tripBillNumber').value,
    loading_date: document.getElementById('tripLoadingDate').value,
    cargo_type: document.getElementById('tripCargo').value,
    weight_tons: document.getElementById('tripWeight').value,
    total_freight: document.getElementById('tripTotalFreight').value,
    commission_fee: document.getElementById('tripCommission').value,
    cash_received_by_driver: document.getElementById('tripCashDriver').value,
    notes: document.getElementById('tripNotes').value
  };

  try {
    const res = await fetch('/api/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      closeModal('modalTrip');
      await loadAllData();
      alert('بارنامه با موفقیت ثبت شد!');
    }
  } catch (err) {
    alert('خطا در ثبت بارنامه: ' + err.message);
  }
}

async function handleExpenseSubmit(e) {
  e.preventDefault();
  
  let receiptImage = null;
  const fileInput = document.getElementById('expReceiptFile');
  if (fileInput.files.length > 0) {
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    try {
      const upRes = await fetch('/api/upload', { method: 'POST', body: formData });
      const upData = await upRes.json();
      if (upData.status === 'success') {
        receiptImage = upData.filename;
      }
    } catch (err) {
      console.warn('File upload failed:', err);
    }
  }

  const paidBy = document.querySelector('input[name="expPaidBy"]:checked').value;
  const data = {
    trip_id: document.getElementById('expTripId').value,
    category: document.getElementById('expCategory').value,
    amount: document.getElementById('expAmount').value,
    paid_by: paidBy,
    expense_date: document.getElementById('expDate').value,
    description: document.getElementById('expDesc').value,
    receipt_image: receiptImage
  };

  try {
    const res = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      closeModal('modalExpense');
      await loadAllData();
      alert('هزینه با موفقیت ثبت شد!');
    }
  } catch (err) {
    alert('خطا در ثبت هزینه: ' + err.message);
  }
}

async function handlePaymentSubmit(e) {
  e.preventDefault();
  const data = {
    amount: document.getElementById('payAmount').value,
    payment_date: document.getElementById('payDate').value,
    payment_method: document.getElementById('payMethod').value,
    tracking_code: document.getElementById('payTracking').value,
    description: document.getElementById('payDesc').value
  };

  try {
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      closeModal('modalPayment');
      await loadAllData();
      alert('واریزی با موفقیت ثبت شد!');
    }
  } catch (err) {
    alert('خطا در ثبت واریزی: ' + err.message);
  }
}

async function handleSettingsSubmit(e) {
  e.preventDefault();
  const data = {
    owner_name: document.getElementById('settingOwner').value,
    driver_name: document.getElementById('settingDriver').value,
    plate_number: document.getElementById('settingPlate').value,
    truck_model: document.getElementById('settingModel').value,
    driver_share_percent: document.getElementById('settingDriverPct').value
  };

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      closeModal('modalSettings');
      await loadAllData();
      alert('تنظیمات با موفقیت ذخیره شد!');
    }
  } catch (err) {
    alert('خطا در ذخیره تنظیمات: ' + err.message);
  }
}

// --- Deletion Functions ---
async function deleteTrip(id) {
  if (!confirm('آیا از حذف این بارنامه مطمئن هستید؟')) return;
  await fetch(`/api/trips/${id}`, { method: 'DELETE' });
  await loadAllData();
}

async function deleteExpense(id) {
  if (!confirm('آیا از حذف این هزینه مطمئن هستید؟')) return;
  await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
  await loadAllData();
}

async function deletePayment(id) {
  if (!confirm('آیا از حذف این واریزی مطمئن هستید؟')) return;
  await fetch(`/api/payments/${id}`, { method: 'DELETE' });
  await loadAllData();
}

// --- Receipt Image Viewer ---
function viewReceiptImage(filename) {
  document.getElementById('viewerImg').src = `/uploads/${filename}`;
  openModal('modalImage');
}

// --- Settlement & WhatsApp Invoice Sharing ---
function openSettlementPreviewModal() {
  const sum = appState.summary;
  const s = appState.settings;
  const today = getTodayShamsi();

  document.getElementById('invTruckInfo').textContent = `پلاک: ${s.plate_number || '---'} | مالک: ${s.owner_name} | راننده: ${s.driver_name}`;
  document.getElementById('invDate').textContent = `تاریخ تسویه: ${today}`;
  document.getElementById('invSharePercent').textContent = `${s.driver_share_percent || 20}٪`;

  document.getElementById('invDriverShare').textContent = formatToman(sum.driver_share_unsettled) + ' تومان';
  document.getElementById('invDriverExpenses').textContent = formatToman(sum.driver_paid_expenses) + ' تومان';
  document.getElementById('invTotalCredit').textContent = formatToman(sum.driver_total_credit) + ' تومان';

  document.getElementById('invCashCollected').textContent = formatToman(sum.driver_cash_collected) + ' تومان';
  document.getElementById('invAdvancesPaid').textContent = formatToman(sum.advances_paid) + ' تومان';
  document.getElementById('invTotalDebit').textContent = formatToman(sum.driver_total_debit) + ' تومان';

  const balance = sum.final_balance || 0;
  const balanceEl = document.getElementById('invFinalBalance');
  const labelEl = document.getElementById('invBalanceLabel');
  const concEl = document.getElementById('invConclusionText');

  balanceEl.textContent = formatToman(balance) + ' تومان';

  if (balance > 0) {
    labelEl.textContent = 'مبلغ قابل پرداخت توسط مالک به راننده:';
    balanceEl.style.color = '#16a34a';
    concEl.textContent = `با پرداخت این مبلغ (${formatToman(balance)} تومان) به حساب راننده، حساب این دوره کاملاً تسویه و صفر می‌شود.`;
  } else if (balance < 0) {
    labelEl.textContent = 'مبلغ اضافه دست راننده (قابل بازگشت به مالک):';
    balanceEl.style.color = '#dc2626';
    concEl.textContent = `راننده مبلغ (${formatToman(balance)} تومان) بیشتر از سهم و مخارجش در دست دارد و باید به مالک پرداخت نماید.`;
  } else {
    labelEl.textContent = 'مانده نهایی تسویه:';
    balanceEl.style.color = '#2563eb';
    concEl.textContent = 'حساب دو طرف کاملاً تراز و صفر است.';
  }

  openModal('modalSettlement');
}

function shareInvoiceWhatsApp() {
  const sum = appState.summary;
  const s = appState.settings;
  const today = getTodayShamsi();
  const balance = sum.final_balance || 0;

  let conclusion = '';
  if (balance > 0) {
    conclusion = `✅ مبلغ قابل پرداخت توسط مالک به راننده: ${formatToman(balance)} تومان`;
  } else if (balance < 0) {
    conclusion = `⚠️ مبلغ اضافه دست راننده که باید برگشت داده شود: ${formatToman(balance)} تومان`;
  } else {
    conclusion = `✅ حساب کاملاً صاف و تراز است (صفر تومان)`;
  }

  const text = `
📋 *صورت‌حساب شفاف تسویه تریلی*
🚛 پلاک: ${s.plate_number} (${s.truck_model})
👤 مالک: ${s.owner_name}
🧢 راننده: ${s.driver_name}
📅 تاریخ: ${today}
━━━━━━━━━━━━━━━━━━
🔹 *بخش اول: بستانکاری راننده (طلب)*
• سهم ${s.driver_share_percent}٪ از کرایه صافی بارها: ${formatToman(sum.driver_share_unsettled)} تومان
• خرج‌های مسیر پرداختی از جیب راننده: ${formatToman(sum.driver_paid_expenses)} تومان
➕ *جمع طلب راننده: ${formatToman(sum.driver_total_credit)} تومان*

🔸 *بخش دوم: بدهکاری راننده (دریافتی‌ها)*
• پیش‌کرایه‌های نقدی دست راننده: ${formatToman(sum.driver_cash_collected)} تومان
• مساعده‌ها و واریزی‌های پدر: ${formatToman(sum.advances_paid)} تومان
➖ *جمع دریافتی راننده: ${formatToman(sum.driver_total_debit)} تومان*
━━━━━━━━━━━━━━━━━━
📊 *مانده نهایی تسویه:*
${conclusion}
━━━━━━━━━━━━━━━━━━
_تولید شده توسط نرم‌افزار حسابدار تریلی_
  `.trim();

  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

async function confirmAndExecuteSettlement() {
  if (!confirm('آیا از ثبت قطعی تسویه حساب این دوره اطمینان دارید؟ تمام بارها و خرج‌های فعلی بسته شده و مانده برای دوره بعدی صفر خواهد شد.')) return;

  const today = getTodayShamsi();
  try {
    const res = await fetch('/api/settlements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `تسویه حساب مورخ ${today}`,
        settlement_date: today
      })
    });
    if (res.ok) {
      closeModal('modalSettlement');
      await loadAllData();
      alert('تسویه حساب با موفقیت ثبت شد و فاکتور در تاریخچه ذخیره گردید!');
      switchNav('settlements');
    } else {
      const err = await res.json();
      alert(err.message || 'خطا در تسویه حساب');
    }
  } catch (err) {
    alert('خطا: ' + err.message);
  }
}
