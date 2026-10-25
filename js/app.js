// =================================================================
// سیستم مدیریت مالی تریلی و راننده - فرانت‌اند جاوااسکریپت پیشرفته
// =================================================================

let appState = {
  role: localStorage.getItem('trili_role') || null, // null means user must choose role on Login screen
  settings: {},
  summary: {},
  trips: [],
  expenses: [],
  payments: [],
  settlements: [],
  activeSettlement: null, // used for preview or detail viewing
  tripsFilter: 'unsettled',
  expensesFilter: 'all',
  paymentsFilter: 'all'
};

// --- Persian & Arabic Numeral Normalization ---
function normalizeDigits(val) {
  if (val === null || val === undefined) return '';
  let str = String(val);
  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  for (let i = 0; i < 10; i++) {
    str = str.replaceAll(persianDigits[i], String(i)).replaceAll(arabicDigits[i], String(i));
  }
  return str.trim();
}

function parseCleanInt(val) {
  if (!val) return 0;
  const clean = normalizeDigits(val).replace(/[,،\s]/g, '');
  const num = parseInt(clean, 10);
  return isNaN(num) ? 0 : Math.max(0, num);
}

// --- Number & Currency Formatting ---
function formatToman(num) {
  if (num === null || num === undefined) return '۰';
  const n = Math.abs(Math.round(num));
  return n.toLocaleString('fa-IR');
}

// Persian Currency in Words Helper (تومان به حروف)
function numberToPersianWords(num) {
  if (!num || num <= 0) return '';
  if (num >= 1000000000) {
    const b = (num / 1000000000).toFixed(1).replace('.0', '');
    return `${b} میلیارد تومان`;
  }
  if (num >= 1000000) {
    const m = (num / 1000000).toFixed(1).replace('.0', '');
    return `${m} میلیون تومان`;
  }
  if (num >= 1000) {
    const k = (num / 1000).toFixed(0);
    return `${k} هزار تومان`;
  }
  return `${num} تومان`;
}

// Live 3-digit comma formatter on input
function handleCurrencyInput(inputEl) {
  const raw = normalizeDigits(inputEl.value).replace(/[^0-9]/g, '');
  if (!raw) {
    inputEl.value = '';
    updateInputWordHint(inputEl, '');
    return;
  }
  const intVal = parseInt(raw, 10);
  inputEl.value = intVal.toLocaleString('en-US'); // Standard comma formatting
  updateInputWordHint(inputEl, numberToPersianWords(intVal));
}

function updateInputWordHint(inputEl, text) {
  let hintEl = null;
  if (inputEl.id === 'tripTotalFreight') hintEl = document.getElementById('hintTripTotal');
  else if (inputEl.id === 'tripCommission') hintEl = document.getElementById('hintTripComm');
  else if (inputEl.id === 'tripCashDriver') hintEl = document.getElementById('hintTripCash');
  else if (inputEl.id === 'expAmount') hintEl = document.getElementById('hintExpAmount');
  else if (inputEl.id === 'payAmount') hintEl = document.getElementById('hintPayAmount');
  if (hintEl) hintEl.textContent = text;
}

// --- Toast Notification Helper ---
function showToast(msg, duration = 3000) {
  const toast = document.getElementById('appToast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

// --- Client-Side Image Compression (Saves road bandwidth on 3G/Edge) ---
function compressImageClientSide(file, maxWidth = 1280, quality = 0.75) {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith('image/')) {
      return resolve(file);
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          resolve(blob || file);
        }, 'image/jpeg', quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// --- Shamsi Date Utility ---
function getTodayShamsi() {
  try {
    const today = new Date();
    const formatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return normalizeDigits(formatter.format(today));
  } catch (e) {
    return '1405/02/01';
  }
}

// --- App Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW notice:', err));
  }

  const today = getTodayShamsi();
  if (document.getElementById('tripLoadingDate')) document.getElementById('tripLoadingDate').value = today;
  if (document.getElementById('expDate')) document.getElementById('expDate').value = today;
  if (document.getElementById('payDate')) document.getElementById('payDate').value = today;

  const isAuth = checkAuthState();
  if (isAuth) {
    loadAllData();
  }
});

// --- Authentication & Role Switching Flow ---
function checkAuthState() {
  const isAuth = !!appState.role;
  const loginView = document.getElementById('viewLogin');
  const bottomNav = document.querySelector('.bottom-nav');
  const bannerEl = document.getElementById('roleStatusBanner');

  if (!isAuth) {
    if (loginView) loginView.style.display = 'flex';
    if (bottomNav) bottomNav.style.display = 'none';

    // Hide all main content views
    ['Dashboard', 'Trips', 'Expenses', 'Payments', 'Settlements'].forEach(v => {
      const el = document.getElementById(`view${v}`);
      if (el) el.style.display = 'none';
    });

    const logoEl = document.getElementById('appLogoBadge');
    const titleEl = document.getElementById('appMainTitle');
    const subEl = document.getElementById('headerSubtitle');
    if (logoEl) logoEl.textContent = '🚛';
    if (titleEl) titleEl.textContent = 'سامانه حسابداری تریلی';
    if (subEl) subEl.textContent = 'صفحه ورود و انتخاب نقش';
    if (bannerEl) bannerEl.innerHTML = '';
    return false;
  }

  if (loginView) loginView.style.display = 'none';
  if (bottomNav) bottomNav.style.display = 'flex';
  renderRoleHeaderAndAccess();
  return true;
}

function loginAsDriver() {
  appState.role = 'driver';
  localStorage.setItem('trili_role', 'driver');
  checkAuthState();
  switchNav('dashboard');
  loadAllData();
  showToast('خوش آمدید! وارد پنل راننده شدید.');
}

async function handleOwnerLoginDirect(e) {
  e.preventDefault();
  const pinInput = document.getElementById('loginOwnerPin');
  const pin = normalizeDigits(pinInput.value);
  const errEl = document.getElementById('loginPinError');
  errEl.style.display = 'none';

  try {
    const res = await fetch('/api/auth/verify-owner-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      appState.role = 'owner';
      localStorage.setItem('trili_role', 'owner');
      pinInput.value = '';
      checkAuthState();
      switchNav('dashboard');
      loadAllData();
      showToast('خوش آمدید! وارد پنل مدیریت پدر شدید.');
    } else {
      errEl.textContent = data.message || 'رمز عبور نادرست است!';
      errEl.style.display = 'block';
    }
  } catch (err) {
    errEl.textContent = 'خطا در ارتباط با سرور';
    errEl.style.display = 'block';
  }
}

function logoutToLoginScreen() {
  if (confirm('آیا می‌خواهید از این پنل خارج شده و به صفحه انتخاب نقش بازگردید؟')) {
    appState.role = null;
    localStorage.removeItem('trili_role');
    checkAuthState();
    showToast('از حساب کاربری خارج شدید.');
  }
}

async function loadAllData() {
  if (!appState.role) return;
  renderRoleHeaderAndAccess();
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

// --- Role Management & Header Access Bar ---
function renderRoleHeaderAndAccess() {
  if (!appState.role) return;
  const isOwner = appState.role === 'owner';
  const s = appState.settings || {};

  const logoEl = document.getElementById('appLogoBadge');
  const titleEl = document.getElementById('appMainTitle');
  const subEl = document.getElementById('headerSubtitle');
  const bannerEl = document.getElementById('roleStatusBanner');

  if (isOwner) {
    if (logoEl) logoEl.textContent = '👑';
    if (titleEl) titleEl.textContent = 'پنل مدیریت تریلی (مالک)';
    if (subEl) subEl.textContent = `مالک: ${s.owner_name || 'پدر'} | پلاک: ${s.plate_number || ''}`;
    if (bannerEl) {
      bannerEl.innerHTML = `
        <div style="display: flex; gap: 8px; width: 100%; align-items: center;">
          <div class="role-tab active" style="flex: 2; font-weight: 800; display:flex; align-items:center; justify-content:center; gap:6px;">
            <span>👑</span>
            <span>پنل مدیریت مالک فعال است</span>
          </div>
          <button type="button" onclick="logoutToLoginScreen()" class="role-tab" style="flex: 1; background: rgba(239, 68, 68, 0.25); color: #fca5a5; font-size: 12px; border: 1px solid rgba(239,68,68,0.3); cursor: pointer; border-radius: 9px; padding: 6px 0;">
            🚪 خروج
          </button>
        </div>
      `;
    }
  } else {
    if (logoEl) logoEl.textContent = '🧢';
    if (titleEl) titleEl.textContent = 'حسابدار تریلی (نسخه راننده)';
    if (subEl) subEl.textContent = `راننده: ${s.driver_name || 'محترم'} | قرارداد ${s.driver_share_percent || 20}٪`;
    if (bannerEl) {
      bannerEl.innerHTML = `
        <div style="display: flex; gap: 8px; width: 100%; align-items: center;">
          <button type="button" onclick="openPinModal()" class="role-tab" style="flex: 2; background: rgba(37, 99, 235, 0.35); border: 1px solid rgba(255, 255, 255, 0.25); color: #fff; font-weight: 700; border-radius: 10px; padding: 8px 12px; display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer;">
            <span>🔒</span>
            <span>ورود به پنل مدیریت پدر</span>
          </button>
          <button type="button" onclick="logoutToLoginScreen()" class="role-tab" style="flex: 1; background: rgba(148, 163, 184, 0.2); color: #e2e8f0; font-size: 12px; border: 1px solid rgba(255,255,255,0.15); cursor: pointer; border-radius: 10px; padding: 8px 0;">
            🔄 تغییر نقش
          </button>
        </div>
      `;
    }
  }

  // Quick Action Payment Button: Visible for BOTH roles!
  const qPay = document.getElementById('quickBtnPayment');
  if (qPay) {
    qPay.style.display = 'flex';
    const qPayLabel = qPay.querySelector('span');
    if (qPayLabel) qPayLabel.textContent = isOwner ? 'ثبت واریزی / مساعده' : 'ثبت واریزی به کارت پدر';
  }

  // Settlement CTA Button: Only Owner can settle
  const setBox = document.getElementById('dashSettlementContainer');
  if (setBox) setBox.style.display = isOwner ? 'block' : 'none';

  // New Payment Button in Payments view: Visible for BOTH roles!
  const btnNewPay = document.getElementById('btnNewPayment');
  if (btnNewPay) {
    btnNewPay.style.display = 'block';
    btnNewPay.textContent = isOwner ? '+ ثبت واریزی / مساعده' : '+ واریز به کارت پدر';
  }

  const btnNewSet = document.getElementById('btnNewSettlement');
  if (btnNewSet) btnNewSet.style.display = isOwner ? 'block' : 'none';

  const lblOwnerPaid = document.getElementById('labelPaidByOwner');
  if (lblOwnerPaid) lblOwnerPaid.style.display = isOwner ? 'flex' : 'none';

  const navPay = document.getElementById('navPayments');
  if (navPay) navPay.querySelector('span').textContent = 'واریزی‌ها';

  const navSet = document.getElementById('navSettlements');
  if (navSet) navSet.querySelector('span').textContent = isOwner ? 'تسویه‌ها' : 'صورت‌حساب‌ها';
}

function handlePlateClick() {
  if (appState.role === 'owner') {
    openSettingsModal();
  } else {
    alert('تنظیمات خودرو و قرارداد فقط در پنل مدیریت پدر در دسترس است.\nبرای دسترسی، لطفاً از دکمه بالا رمز پدر را وارد کنید.');
  }
}

function openPinModal() {
  document.getElementById('inputOwnerPin').value = '';
  document.getElementById('pinErrorMessage').style.display = 'none';
  openModal('modalPinLogin');
  setTimeout(() => document.getElementById('inputOwnerPin').focus(), 300);
}

async function handlePinLogin(e) {
  e.preventDefault();
  const pin = normalizeDigits(document.getElementById('inputOwnerPin').value);
  const errEl = document.getElementById('pinErrorMessage');
  errEl.style.display = 'none';

  try {
    const res = await fetch('/api/auth/verify-owner-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      appState.role = 'owner';
      localStorage.setItem('trili_role', 'owner');
      closeModal('modalPinLogin');
      await loadAllData();
      showToast('خوش آمدید! وارد پنل مدیریت پدر شدید.');
    } else {
      errEl.textContent = data.message || 'رمز عبور نادرست است!';
      errEl.style.display = 'block';
    }
  } catch (err) {
    errEl.textContent = 'خطا در ارتباط با سرور';
    errEl.style.display = 'block';
  }
}

// --- API Calls ---
async function fetchSettings() {
  try {
    const res = await fetch('/api/settings');
    appState.settings = await res.json();
    updateHeaderWithSettings();
  } catch (err) {
    console.error('Settings error:', err);
  }
}

async function fetchSummary() {
  try {
    const res = await fetch(`/api/summary?role=${appState.role}`);
    appState.summary = await res.json();
    updateSummaryUI();
  } catch (err) {
    console.error('Summary error:', err);
  }
}

async function fetchTrips() {
  try {
    const res = await fetch('/api/trips');
    appState.trips = await res.json();
  } catch (err) {
    console.error('Trips error:', err);
  }
}

async function fetchExpenses() {
  try {
    const res = await fetch(`/api/expenses?role=${appState.role}`);
    appState.expenses = await res.json();
  } catch (err) {
    console.error('Expenses error:', err);
  }
}

async function fetchPayments() {
  try {
    const res = await fetch('/api/payments');
    appState.payments = await res.json();
  } catch (err) {
    console.error('Payments error:', err);
  }
}

async function fetchSettlements() {
  try {
    const res = await fetch('/api/settlements');
    appState.settlements = await res.json();
  } catch (err) {
    console.error('Settlements error:', err);
  }
}

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
  renderRoleHeaderAndAccess();
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
    tagEl.className = 'hero-status-tag status-credit';
    if (isDriver) {
      tagEl.innerHTML = '🟢 طلب شما از صاحب‌ماشین (بستانکار)';
      descEl.textContent = 'این مبلغ حاصل سهم ۲۰٪ بارها، مخارج مسیر و واریزی‌های شما به کارت پدر است که باید دریافت کنید.';
    } else {
      tagEl.innerHTML = '🟢 بدهی شما به راننده (طلب راننده)';
      descEl.textContent = 'شما (مالک) باید این مبلغ را در زمان تسویه حساب به راننده پرداخت نمایید.';
    }
  } else if (balance < 0) {
    tagEl.className = 'hero-status-tag status-debit';
    if (isDriver) {
      tagEl.innerHTML = '🔴 بدهی شما به صاحب‌ماشین (بدهکار)';
      descEl.textContent = 'مجموع پیش‌کرایه‌ها و مساعده‌های دریافتی بیشتر از سهم شما بوده و پول دست شماست.';
    } else {
      tagEl.innerHTML = '🔴 طلب شما از راننده (بدهی راننده)';
      descEl.textContent = 'راننده این مبلغ اضافه را در دست دارد که باید به شما برگرداند.';
    }
  } else {
    tagEl.className = 'hero-status-tag status-zero';
    tagEl.innerHTML = '🔵 حساب کاملاً تراز و صفر است (تسویه کامل)';
    descEl.textContent = 'تمامی بارها و خرج‌ها کاملاً تسویه شده و هیچ مانده حسابی وجود ندارد.';
  }

  document.getElementById('dashDriverShare').textContent = formatToman(sum.driver_share_unsettled) + ' ت';
  document.getElementById('dashDriverExpenses').textContent = '+' + formatToman(sum.driver_paid_expenses) + ' ت';
  document.getElementById('dashCashCollected').textContent = '-' + formatToman(sum.driver_cash_collected) + ' ت';
  document.getElementById('dashAdvancesPaid').textContent = '-' + formatToman(sum.advances_paid) + ' ت';
  document.getElementById('dashTripCountBadge').textContent = (sum.unsettled_trips_count || 0) + ' سفر باز';

  // Pending Transfers Notification for Owner
  const pendingAlert = document.getElementById('dashPendingAlert');
  const pendingAlertText = document.getElementById('dashPendingAlertText');
  const pendingListAlert = document.getElementById('pendingTransfersAlert');
  const pendingAlertCountText = document.getElementById('pendingAlertCountText');
  const tabPending = document.getElementById('tabPendingPayments');

  const pendingCount = sum.pending_transfers_count || 0;
  const pendingAmount = sum.pending_driver_transfers || 0;

  if (tabPending) {
    tabPending.textContent = `⏳ در انتظار تایید (${pendingCount})`;
    tabPending.style.display = (pendingCount > 0 || appState.role === 'owner') ? 'inline-block' : 'none';
  }

  if (appState.role === 'owner' && pendingCount > 0) {
    if (pendingAlert) {
      pendingAlert.style.display = 'block';
      if (pendingAlertText) {
        pendingAlertText.textContent = `${pendingCount} واریزی جدید راننده (${formatToman(pendingAmount)} تومان) منتظر تایید شماست`;
      }
    }
    if (pendingListAlert) {
      pendingListAlert.style.display = 'block';
      if (pendingAlertCountText) {
        pendingAlertCountText.textContent = `${pendingCount} واریزی جدید راننده (${formatToman(pendingAmount)} تومان) در انتظار تایید شما`;
      }
    }
  } else {
    if (pendingAlert) pendingAlert.style.display = 'none';
    if (pendingListAlert) pendingListAlert.style.display = 'none';
  }
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

  const unsettledExpenses = appState.expenses.filter(e => !e.is_settled);
  const expContainer = document.getElementById('dashExpensesList');
  if (unsettledExpenses.length === 0) {
    expContainer.innerHTML = `
      <div class="empty-state" style="padding: 20px;">
        <div class="empty-text">هیچ هزینه ثبت‌نشده‌ای برای این دوره وجود ندارد.</div>
      </div>
    `;
  } else {
    expContainer.innerHTML = unsettledExpenses.slice(0, 4).map(e => renderExpenseCardHTML(e)).join('');
  }
}

// --- Card HTML Renderers ---
function renderTripCardHTML(t) {
  const isSettled = t.is_settled;
  const isOwner = appState.role === 'owner';

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
          <div style="font-size: 15px; font-weight: 800; color: #1e293b;">
            ${formatToman(t.net_freight)} تومان
          </div>
        </div>
        <div style="text-align: left;">
          <div class="highlight-label">سهم ۲۰٪ راننده:</div>
          <div style="font-size: 16px; font-weight: 900; color: #16a34a;">
            ${formatToman(t.driver_share_amount)} تومان
          </div>
        </div>
      </div>

      ${t.cash_received_by_driver > 0 ? `
        <div class="card-body-row" style="color: #dc2626; font-size: 12px; font-weight: 700;">
          <span>پیش‌کرایه نقدی دست راننده:</span>
          <span>-${formatToman(t.cash_received_by_driver)} تومان</span>
        </div>
      ` : ''}

      <div class="card-footer-actions">
        <span style="font-size: 12px; color: #64748b;">تاریخ: ${t.loading_date || 'ثبت شده'}</span>
        ${!isSettled && isOwner ? `
          <button class="btn-sm-action btn-sm-danger" onclick="deleteTrip(${t.id})">
            <span>🗑️ حذف</span>
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

function renderExpenseCardHTML(e) {
  const isDriverPaid = e.paid_by === 'driver';
  const isSettled = e.is_settled;
  const isOwner = appState.role === 'owner';

  return `
    <div class="item-card">
      <div class="card-top">
        <div class="card-title">
          <span>⛽</span>
          <span>${e.category}: ${formatToman(e.amount)} تومان</span>
        </div>
        <span class="badge-tag ${isDriverPaid ? 'badge-driver' : 'badge-owner'}">
          ${isDriverPaid ? 'پرداخت راننده (طلب)' : 'پرداخت پدر'}
        </span>
      </div>

      <div class="card-body-row">
        <span>تاریخ: <strong>${e.expense_date || 'امروز'}</strong></span>
        <span>مسئولیت: <strong>${e.liability === 'owner_machine' ? 'پای صاحب ماشین' : 'مشترک'}</strong></span>
      </div>

      ${e.description ? `
        <div class="card-body-row" style="font-size: 12px; color: #64748b;">
          <span>توضیح: ${e.description}</span>
        </div>
      ` : ''}

      <div class="card-footer-actions">
        ${e.receipt_image ? `
          <button class="btn-sm-action" onclick="viewReceiptImage('${e.receipt_image}')">
            <span>📷 مشاهده فاکتور</span>
          </button>
        ` : ''}
        ${!isSettled && isOwner ? `
          <button class="btn-sm-action btn-sm-danger" onclick="deleteExpense(${e.id})">
            <span>🗑️ حذف</span>
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

function renderPaymentCardHTML(p) {
  const isOwner = appState.role === 'owner';
  const isDriverPayer = (p.payer === 'driver');
  const isApproved = (p.is_approved !== false);

  let statusBadge = '';
  if (p.is_settled) {
    statusBadge = '<span class="badge-tag badge-settled">تسویه شده</span>';
  } else if (!isApproved) {
    statusBadge = '<span class="badge-tag" style="background:#fef3c7; color:#b45309; border:1px solid #fde68a;">⏳ منتظر تایید پدر</span>';
  } else {
    statusBadge = `<span class="badge-tag ${isDriverPayer ? 'badge-driver' : 'badge-owner'}">${isDriverPayer ? 'تایید شده (طلب)' : 'مساعده (بدهی)'}</span>`;
  }

  return `
    <div class="item-card" style="border-right: 4px solid ${!isApproved ? '#f59e0b' : (isDriverPayer ? '#10b981' : '#ef4444')}; ${!isApproved ? 'background:#fffdfa;' : ''}">
      <div class="card-top">
        <div class="card-title" style="color: ${isDriverPayer ? '#059669' : '#b45309'};">
          <span>${!isApproved ? '⏳' : (isDriverPayer ? '🟢' : '🔴')}</span>
          <span>${isDriverPayer ? 'واریز راننده به کارت مالک: ' : 'مساعده مالک به راننده: '}<strong>${formatToman(p.amount)} تومان</strong></span>
        </div>
        ${statusBadge}
      </div>

      <div class="card-body-row">
        <span>تاریخ: <strong>${p.payment_date || '---'}</strong></span>
        <span>روش: <strong>${p.payment_method || 'کارت به کارت'}</strong></span>
      </div>

      <div class="card-body-row">
        <span>کد پیگیری: <strong>${p.tracking_code || 'ندارد'}</strong></span>
        <span>وضعیت حساب: <strong style="color: ${p.is_settled ? '#10b981' : (!isApproved ? '#b45309' : '#059669')};">
          ${p.is_settled ? 'تسویه شده' : (!isApproved ? '⏳ هنوز در حساب اعمال نشده' : 'اعمال در طلب راننده')}
        </strong></span>
      </div>

      ${p.description ? `
        <div class="card-body-row" style="font-size: 12px; color: #64748b;">
          <span>بابت: ${p.description}</span>
        </div>
      ` : ''}

      ${!isApproved && isOwner && !p.is_settled ? `
        <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:10px; padding:10px; margin:8px 0; font-size:12px; color:#92400e;">
          🔔 راننده این واریز را ثبت کرده است. پس از چک کردن حساب بانکی‌تان، در صورت صحت تایید فرمایید:
        </div>
      ` : ''}

      ${!isApproved && !isOwner && !p.is_settled ? `
        <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:8px 10px; margin:6px 0; font-size:12px; color:#1e40af;">
          💡 این واریزی ثبت شده و به محض اینکه پدر دریافت آن را تایید کند، به طلب شما اضافه خواهد شد.
        </div>
      ` : ''}

      <div class="card-footer-actions">
        ${p.receipt_image ? `
          <button class="btn-sm-action" onclick="viewReceiptImage('${p.receipt_image}')">
            <span>📷 مشاهده رسید بانکی</span>
          </button>
        ` : ''}
        ${!isApproved && isOwner && !p.is_settled ? `
          <button class="btn-sm-action" style="background:#10b981; color:white; font-weight:800;" onclick="approvePayment(${p.id})">
            <span>✅ تایید واریزی</span>
          </button>
          <button class="btn-sm-action btn-sm-danger" onclick="rejectPayment(${p.id})">
            <span>❌ رد و حذف</span>
          </button>
        ` : ''}
        ${!p.is_settled && isOwner && isApproved ? `
          <button class="btn-sm-action btn-sm-danger" onclick="deletePayment(${p.id})">
            <span>🗑️ حذف</span>
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

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
        <span>تعداد سفرها: <strong>${s.total_trips_count} سفر</strong></span>
        <span>سهم راننده: <strong>${formatToman(s.driver_earned_share)} ت</strong></span>
      </div>

      <div class="card-body-row">
        <span>خرج‌های راننده: <strong>+${formatToman(s.driver_paid_expenses)} ت</strong></span>
        <span>واریزی‌های راننده: <strong>+${formatToman(s.driver_transfers_to_owner || 0)} ت</strong></span>
      </div>

      <div class="card-body-row">
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

// --- Navigation & Filters ---
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
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🚛</div><div class="empty-text">بارنامه‌ای یافت نشد.</div></div>`;
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

function filterPayments(type) {
  appState.paymentsFilter = type;
  renderPaymentsList();
}

function renderPaymentsList() {
  const container = document.getElementById('allPaymentsList');
  let list = appState.payments;

  if (appState.paymentsFilter === 'pending') {
    list = list.filter(p => !p.is_settled && p.is_approved === false);
  } else if (appState.paymentsFilter === 'driver') {
    list = list.filter(p => p.payer === 'driver');
  } else if (appState.paymentsFilter === 'owner') {
    list = list.filter(p => p.payer !== 'driver');
  }

  if (list.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">💳</div><div class="empty-text">هیچ واریزی در این دسته‌بندی یافت نشد.</div></div>`;
  } else {
    container.innerHTML = list.map(p => renderPaymentCardHTML(p)).join('');
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

// --- Modals Control ---
function openModal(id) {
  document.getElementById(id).classList.add('active');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

function openTripModal() {
  document.getElementById('formTrip').reset();
  document.getElementById('tripLoadingDate').value = getTodayShamsi();
  document.getElementById('hintTripTotal').textContent = '';
  document.getElementById('hintTripComm').textContent = '';
  document.getElementById('hintTripCash').textContent = '';
  calcTripSharesLive();
  openModal('modalTrip');
}

function openExpenseModal() {
  document.getElementById('formExpense').reset();
  document.getElementById('expDate').value = getTodayShamsi();
  document.getElementById('hintExpAmount').textContent = '';

  if (appState.role === 'driver') {
    document.getElementById('radioPaidByDriver').checked = true;
    document.getElementById('labelPaidByOwner').style.display = 'none';
  } else {
    document.getElementById('labelPaidByOwner').style.display = 'flex';
  }

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
  document.getElementById('hintPayAmount').textContent = '';

  const isOwner = appState.role === 'owner';
  const titleEl = document.getElementById('modalPaymentTitle');
  const noticeEl = document.getElementById('driverPayNotice');
  const ownerSelector = document.getElementById('ownerPaySelector');
  const duplicateNotice = document.getElementById('ownerDuplicateNotice');
  const submitBtn = document.querySelector('#formPayment button[type="submit"]');

  if (duplicateNotice) duplicateNotice.style.display = 'none';

  if (isOwner) {
    if (titleEl) titleEl.textContent = '💳 ثبت واریزی و مساعده';
    if (noticeEl) noticeEl.style.display = 'none';
    if (ownerSelector) ownerSelector.style.display = 'block';
    document.getElementById('radioPayerOwner').checked = true;
    if (submitBtn) submitBtn.textContent = 'ثبت در سیستم';
  } else {
    if (titleEl) titleEl.textContent = '💳 ثبت واریز وجه به کارت صاحب‌ماشین (پدر)';
    if (noticeEl) noticeEl.style.display = 'block';
    if (ownerSelector) ownerSelector.style.display = 'none';
    if (submitBtn) submitBtn.textContent = 'ثبت و ارسال فیش برای پدر';
  }

  openModal('modalPayment');
}

function handlePayerRadioChange() {
  const radioDriver = document.getElementById('radioPayerDriver');
  const notice = document.getElementById('ownerDuplicateNotice');
  if (notice && radioDriver) {
    notice.style.display = radioDriver.checked ? 'block' : 'none';
  }
}

function openSettingsModal() {
  const s = appState.settings || {};
  document.getElementById('settingOwner').value = s.owner_name || '';
  document.getElementById('settingDriver').value = s.driver_name || '';
  document.getElementById('settingPlate').value = s.plate_number || '';
  document.getElementById('settingModel').value = s.truck_model || '';
  document.getElementById('settingDriverPct').value = s.driver_share_percent || 20;
  if (document.getElementById('settingDriverBasis')) {
    document.getElementById('settingDriverBasis').value = s.driver_share_basis || 'net';
  }
  document.getElementById('settingOwnerPin').value = '';
  openModal('modalSettings');
}

function calcTripSharesLive() {
  const total = parseCleanInt(document.getElementById('tripTotalFreight').value);
  const commission = parseCleanInt(document.getElementById('tripCommission').value);
  const net = Math.max(0, total - commission);
  
  const pct = (appState.settings && appState.settings.driver_share_percent) ? appState.settings.driver_share_percent : 20.0;
  const basis = (appState.settings && appState.settings.driver_share_basis) ? appState.settings.driver_share_basis : 'net';
  
  const baseAmount = basis === 'gross' ? total : net;
  const driverShare = Math.round(baseAmount * (pct / 100.0));
  const ownerShare = Math.max(0, net - driverShare);

  document.getElementById('liveNetFreight').textContent = formatToman(net) + ' تومان';
  document.getElementById('liveDriverShare').textContent = formatToman(driverShare) + ' تومان';
  document.getElementById('liveOwnerShare').textContent = formatToman(ownerShare) + ' تومان';
}

// --- Submissions With Double-Click & Duplicate Protection ---
async function handleTripSubmit(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.classList.add('btn-loading');
  submitBtn.textContent = 'در حال ذخیره...';

  const data = {
    origin: document.getElementById('tripOrigin').value.trim(),
    destination: document.getElementById('tripDestination').value.trim(),
    bill_number: normalizeDigits(document.getElementById('tripBillNumber').value),
    loading_date: normalizeDigits(document.getElementById('tripLoadingDate').value),
    cargo_type: document.getElementById('tripCargo').value.trim(),
    weight_tons: parseFloat(document.getElementById('tripWeight').value) || 0,
    total_freight: parseCleanInt(document.getElementById('tripTotalFreight').value),
    commission_fee: parseCleanInt(document.getElementById('tripCommission').value),
    cash_received_by_driver: parseCleanInt(document.getElementById('tripCashDriver').value),
    notes: document.getElementById('tripNotes').value.trim()
  };

  try {
    const res = await fetch('/api/trips', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Role': appState.role
      },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      closeModal('modalTrip');
      await loadAllData();
      showToast('بارنامه با موفقیت ثبت شد!');
    } else {
      const err = await res.json();
      alert(err.message || 'خطا در ثبت بارنامه');
    }
  } catch (err) {
    alert('خطا در برقراری ارتباط: ' + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('btn-loading');
    submitBtn.textContent = 'ذخیره بارنامه';
  }
}

async function handleExpenseSubmit(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.classList.add('btn-loading');
  submitBtn.textContent = 'در حال ارسال و بهینه‌سازی...';
  
  let receiptImage = null;
  const fileInput = document.getElementById('expReceiptFile');
  if (fileInput && fileInput.files.length > 0) {
    try {
      const compressedBlob = await compressImageClientSide(fileInput.files[0]);
      const formData = new FormData();
      formData.append('file', compressedBlob, 'receipt.jpg');
      const upRes = await fetch('/api/upload', { method: 'POST', body: formData });
      const upData = await upRes.json();
      if (upData.status === 'success') {
        receiptImage = upData.filename;
      }
    } catch (err) {
      console.warn('Image compression/upload failed:', err);
    }
  }

  const paidBy = appState.role === 'driver' ? 'driver' : document.querySelector('input[name="expPaidBy"]:checked').value;
  const data = {
    trip_id: document.getElementById('expTripId').value,
    category: document.getElementById('expCategory').value,
    amount: parseCleanInt(document.getElementById('expAmount').value),
    paid_by: paidBy,
    liability: 'owner_machine',
    expense_date: normalizeDigits(document.getElementById('expDate').value),
    description: document.getElementById('expDesc').value.trim(),
    receipt_image: receiptImage
  };

  try {
    const res = await fetch('/api/expenses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Role': appState.role
      },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      closeModal('modalExpense');
      await loadAllData();
      showToast('هزینه با موفقیت ثبت شد!');
    } else {
      const err = await res.json();
      alert(err.message || 'خطا در ثبت هزینه');
    }
  } catch (err) {
    alert('خطا در ثبت هزینه: ' + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('btn-loading');
    submitBtn.textContent = 'ثبت هزینه';
  }
}

async function handlePaymentSubmit(e, isDuplicateConfirmed = false) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.classList.add('btn-loading');
  submitBtn.textContent = 'در حال بررسی و ثبت...';

  let receiptImage = null;
  const fileInput = document.getElementById('payReceiptFile');
  if (fileInput && fileInput.files.length > 0) {
    try {
      const compressedBlob = await compressImageClientSide(fileInput.files[0]);
      const formData = new FormData();
      formData.append('file', compressedBlob, 'payment_receipt.jpg');
      const upRes = await fetch('/api/upload', { method: 'POST', body: formData });
      const upData = await upRes.json();
      if (upData.status === 'success') {
        receiptImage = upData.filename;
      }
    } catch (err) {
      console.warn('Receipt upload notice:', err);
    }
  }

  let payer = 'driver';
  if (appState.role === 'owner') {
    const radio = document.querySelector('input[name="payPayerRadio"]:checked');
    payer = radio ? radio.value : 'owner';
  }

  const data = {
    payer: payer,
    amount: parseCleanInt(document.getElementById('payAmount').value),
    payment_date: normalizeDigits(document.getElementById('payDate').value),
    payment_method: document.getElementById('payMethod').value,
    tracking_code: normalizeDigits(document.getElementById('payTracking').value),
    description: document.getElementById('payDesc').value.trim(),
    receipt_image: receiptImage,
    confirm_duplicate: isDuplicateConfirmed
  };

  try {
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Role': appState.role
      },
      body: JSON.stringify(data)
    });

    // Check for Duplicate Warning (HTTP 409)
    if (res.status === 409) {
      const warnData = await res.json();
      submitBtn.disabled = false;
      submitBtn.classList.remove('btn-loading');
      submitBtn.textContent = 'ثبت واریزی';
      if (confirm(warnData.message)) {
        return handlePaymentSubmit(e, true);
      } else {
        return;
      }
    }

    const resData = await res.json();
    if (res.ok && resData.status === 'success') {
      closeModal('modalPayment');
      await loadAllData();
      if (appState.role === 'driver') {
        showToast('واریزی ثبت شد و پس از تایید پدر در حساب اعمال می‌شود.');
      } else {
        showToast(payer === 'driver' ? 'واریزی راننده مستقیماً تایید و ثبت شد!' : 'مساعده با موفقیت ثبت شد!');
      }
    } else {
      alert(resData.message || 'خطا در ثبت واریزی');
    }
  } catch (err) {
    alert('خطا در ارتباط با سرور: ' + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('btn-loading');
    submitBtn.textContent = 'ثبت واریزی';
  }
}

// --- Payment Verification Actions for Owner ---
async function approvePayment(id) {
  if (appState.role !== 'owner') return;
  try {
    const res = await fetch(`/api/payments/${id}/approve`, {
      method: 'POST',
      headers: { 'X-Role': 'owner' }
    });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      await loadAllData();
      showToast('واریزی راننده با موفقیت تایید شد و به عنوان طلب او در حساب اعمال گردید.');
    } else {
      alert(data.message || 'خطا در تایید واریزی');
    }
  } catch (err) {
    alert('خطا در ارتباط با سرور: ' + err.message);
  }
}

async function rejectPayment(id) {
  if (appState.role !== 'owner') return;
  if (!confirm('آیا مطمئن هستید که این واریزی به حسابتان نیامده و می‌خواهید آن را رد و حذف کنید؟')) return;
  try {
    const res = await fetch(`/api/payments/${id}/reject`, {
      method: 'POST',
      headers: { 'X-Role': 'owner' }
    });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      await loadAllData();
      showToast('واریزی رد و از سیستم حذف گردید.');
    } else {
      alert(data.message || 'خطا در رد واریزی');
    }
  } catch (err) {
    alert('خطا در ارتباط با سرور: ' + err.message);
  }
}

async function handleSettingsSubmit(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'در حال ذخیره...';

  const data = {
    owner_name: document.getElementById('settingOwner').value.trim(),
    driver_name: document.getElementById('settingDriver').value.trim(),
    plate_number: normalizeDigits(document.getElementById('settingPlate').value),
    truck_model: document.getElementById('settingModel').value.trim(),
    driver_share_percent: parseFloat(document.getElementById('settingDriverPct').value) || 20.0,
    driver_share_basis: document.getElementById('settingDriverBasis').value
  };
  const pinVal = normalizeDigits(document.getElementById('settingOwnerPin').value);
  if (pinVal) data.owner_pin = pinVal;

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Role': appState.role
      },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      closeModal('modalSettings');
      await loadAllData();
      showToast('تنظیمات با موفقیت ذخیره شد!');
    }
  } catch (err) {
    alert('خطا در ذخیره تنظیمات: ' + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'ذخیره تنظیمات';
  }
}

// --- Deletions ---
async function deleteTrip(id) {
  if (appState.role !== 'owner') return;
  if (!confirm('آیا از حذف این بارنامه مطمئن هستید؟')) return;
  await fetch(`/api/trips/${id}`, { method: 'DELETE', headers: { 'X-Role': 'owner' } });
  await loadAllData();
  showToast('بارنامه حذف گردید.');
}

async function deleteExpense(id) {
  if (appState.role !== 'owner') return;
  if (!confirm('آیا از حذف این هزینه مطمئن هستید؟')) return;
  await fetch(`/api/expenses/${id}`, { method: 'DELETE', headers: { 'X-Role': 'owner' } });
  await loadAllData();
  showToast('هزینه حذف گردید.');
}

async function deletePayment(id) {
  if (appState.role !== 'owner') return;
  if (!confirm('آیا از حذف این واریزی مطمئن هستید؟')) return;
  await fetch(`/api/payments/${id}`, { method: 'DELETE', headers: { 'X-Role': 'owner' } });
  await loadAllData();
  showToast('واریزی حذف گردید.');
}

function viewReceiptImage(filename) {
  document.getElementById('viewerImg').src = `/uploads/${filename}`;
  openModal('modalImage');
}

// --- Audit Log Viewer Modal ---
async function openAuditModal() {
  if (appState.role !== 'owner') return;
  openModal('modalAuditLogs');
  const container = document.getElementById('auditLogContent');
  container.innerHTML = `<div class="empty-state">در حال فراخوانی لاگ‌ها...</div>`;
  try {
    const res = await fetch('/api/audit-logs?role=owner');
    const logs = await res.json();
    if (!logs || logs.length === 0) {
      container.innerHTML = `<div class="empty-state">هیچ رویدادی ثبت نشده است.</div>`;
      return;
    }
    container.innerHTML = logs.map(l => `
      <div class="audit-item">
        <div class="audit-meta">
          <span>📅 ${l.created_at || '---'}</span>
          <span>نقش: <strong>${l.actor_role === 'owner' ? '👑 مالک' : (l.actor_role === 'driver' ? '🧢 راننده' : 'سیستم')}</strong></span>
        </div>
        <div style="font-weight: 600; color: #1e293b;">${l.details || l.action}</div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div class="empty-state" style="color:red;">خطا در دریافت لاگ‌ها</div>`;
  }
}

// --- Settlements & WhatsApp / Clipboard Invoice ---
function openSettlementPreviewModal() {
  appState.activeSettlement = null;
  const sum = appState.summary;
  const s = appState.settings || {};
  const today = getTodayShamsi();

  document.getElementById('invTruckInfo').textContent = `پلاک: ${s.plate_number || '---'} | مالک: ${s.owner_name || ''} | راننده: ${s.driver_name || ''}`;
  document.getElementById('invDate').textContent = `تاریخ تسویه: ${today}`;
  document.getElementById('invSharePercent').textContent = `${s.driver_share_percent || 20}٪`;

  document.getElementById('invDriverShare').textContent = formatToman(sum.driver_share_unsettled) + ' تومان';
  document.getElementById('invDriverExpenses').textContent = formatToman(sum.driver_paid_expenses) + ' تومان';
  document.getElementById('invDriverTransfers').textContent = formatToman(sum.driver_transfers_to_owner || 0) + ' تومان';
  document.getElementById('invTotalCredit').textContent = formatToman(sum.driver_total_credit) + ' تومان';

  document.getElementById('invCashCollected').textContent = formatToman(sum.driver_cash_collected) + ' تومان';
  document.getElementById('invAdvancesPaid').textContent = formatToman(sum.advances_paid) + ' تومان';
  document.getElementById('invTotalDebit').textContent = formatToman(sum.driver_total_debit) + ' تومان';

  const balance = sum.final_balance || 0;
  const balanceEl = document.getElementById('invFinalBalance');
  const labelEl = document.getElementById('invBalanceLabel');
  const concEl = document.getElementById('invConclusionText');

  balanceEl.textContent = formatToman(Math.abs(balance)) + ' تومان';

  if (balance > 0) {
    labelEl.textContent = 'مبلغ قابل پرداخت توسط مالک به راننده:';
    balanceEl.style.color = '#16a34a';
    concEl.textContent = `با پرداخت این مبلغ (${formatToman(balance)} تومان) به حساب راننده، حساب این دوره کاملاً تسویه و صفر می‌شود.`;
  } else if (balance < 0) {
    labelEl.textContent = 'مبلغ اضافه دست راننده (قابل بازگشت به مالک):';
    balanceEl.style.color = '#dc2626';
    concEl.textContent = `راننده مبلغ (${formatToman(Math.abs(balance))} تومان) بیشتر از سهم و مخارجش در دست دارد و باید به مالک پرداخت نماید.`;
  } else {
    labelEl.textContent = 'مانده نهایی تسویه:';
    balanceEl.style.color = '#2563eb';
    concEl.textContent = 'حساب دو طرف کاملاً تراز و صفر است.';
  }

  // Show confirm settlement button if owner
  const confirmBtn = document.getElementById('btnConfirmSettlement');
  if (confirmBtn) confirmBtn.style.display = (appState.role === 'owner') ? 'flex' : 'none';

  openModal('modalSettlement');
}

function showSettlementDetail(id) {
  const s = appState.settlements.find(item => item.id === id);
  if (!s) return;

  appState.activeSettlement = s;
  const cfg = appState.settings || {};

  document.getElementById('invTruckInfo').textContent = `پلاک: ${cfg.plate_number || '---'} | مالک: ${cfg.owner_name || ''} | راننده: ${cfg.driver_name || ''}`;
  document.getElementById('invDate').textContent = `تاریخ تسویه: ${s.settlement_date}`;
  document.getElementById('invSharePercent').textContent = `${cfg.driver_share_percent || 20}٪`;

  document.getElementById('invDriverShare').textContent = formatToman(s.driver_earned_share) + ' تومان';
  document.getElementById('invDriverExpenses').textContent = formatToman(s.driver_paid_expenses) + ' تومان';
  document.getElementById('invDriverTransfers').textContent = formatToman(s.driver_transfers_to_owner || 0) + ' تومان';
  document.getElementById('invTotalCredit').textContent = formatToman(s.total_driver_credit) + ' تومان';

  document.getElementById('invCashCollected').textContent = formatToman(s.driver_cash_collected) + ' تومان';
  document.getElementById('invAdvancesPaid').textContent = formatToman(s.advances_paid_by_owner) + ' تومان';
  document.getElementById('invTotalDebit').textContent = formatToman(s.total_driver_debit) + ' تومان';

  const balance = s.final_balance || 0;
  const balanceEl = document.getElementById('invFinalBalance');
  const labelEl = document.getElementById('invBalanceLabel');
  const concEl = document.getElementById('invConclusionText');

  balanceEl.textContent = formatToman(Math.abs(balance)) + ' تومان';

  if (balance > 0) {
    labelEl.textContent = 'مبلغ پرداخت شده به راننده:';
    balanceEl.style.color = '#16a34a';
    concEl.textContent = `این دوره قطعی تسویه شده و مبلغ (${formatToman(balance)} تومان) به راننده پرداخت گردیده است.`;
  } else if (balance < 0) {
    labelEl.textContent = 'مبلغ بازگردانده شده توسط راننده:';
    balanceEl.style.color = '#dc2626';
    concEl.textContent = `راننده مبلغ (${formatToman(Math.abs(balance))} تومان) اضافه را به مالک بازگردانده است.`;
  } else {
    labelEl.textContent = 'مانده نهایی تسویه:';
    balanceEl.style.color = '#2563eb';
    concEl.textContent = 'حساب کاملاً تراز و صفر بوده است.';
  }

  // Hide confirm settlement button because it's already settled!
  const confirmBtn = document.getElementById('btnConfirmSettlement');
  if (confirmBtn) confirmBtn.style.display = 'none';

  openModal('modalSettlement');
}

function generateInvoiceText() {
  const isHistorical = !!appState.activeSettlement;
  const s = appState.settings || {};
  
  let shareAmount = 0;
  let driverExpenses = 0;
  let driverTransfers = 0;
  let totalCredit = 0;
  let cashCollected = 0;
  let advancesPaid = 0;
  let totalDebit = 0;
  let balance = 0;
  let settlementDate = getTodayShamsi();

  if (isHistorical) {
    const act = appState.activeSettlement;
    shareAmount = act.driver_earned_share || 0;
    driverExpenses = act.driver_paid_expenses || 0;
    driverTransfers = act.driver_transfers_to_owner || 0;
    totalCredit = act.total_driver_credit || 0;
    cashCollected = act.driver_cash_collected || 0;
    advancesPaid = act.advances_paid_by_owner || 0;
    totalDebit = act.total_driver_debit || 0;
    balance = act.final_balance || 0;
    settlementDate = act.settlement_date || getTodayShamsi();
  } else {
    const sum = appState.summary || {};
    shareAmount = sum.driver_share_unsettled || 0;
    driverExpenses = sum.driver_paid_expenses || 0;
    driverTransfers = sum.driver_transfers_to_owner || 0;
    totalCredit = sum.driver_total_credit || 0;
    cashCollected = sum.driver_cash_collected || 0;
    advancesPaid = sum.advances_paid || 0;
    totalDebit = sum.driver_total_debit || 0;
    balance = sum.final_balance || 0;
  }

  let balanceMessage = '';
  if (balance > 0) {
    balanceMessage = `✅ مانده نهایی جهت تسویه:\nمبلغ قابل پرداخت توسط مالک به راننده: ${formatToman(balance)} تومان\n(${numberToPersianWords(balance)})`;
  } else if (balance < 0) {
    balanceMessage = `⚠️ مانده نهایی جهت تسویه:\nمبلغ اضافه دست راننده که باید بازگردانده شود: ${formatToman(Math.abs(balance))} تومان\n(${numberToPersianWords(Math.abs(balance))})`;
  } else {
    balanceMessage = `✅ حساب طرفین کاملاً تراز و صفر است (بدون مانده).`;
  }

  const text = 
`📋 صورت‌حساب رسمی کارکرد تریلی و راننده
━━━━━━━━━━━━━━━━━━━━
🚛 مشخصات تریلی: ${s.plate_number || '---'} (${s.truck_model || 'تریلی'})
👤 صاحب ماشین (مالک): ${s.owner_name || 'مالک'}
🧢 راننده محترم: ${s.driver_name || 'راننده'}
📅 تاریخ تسویه: ${settlementDate}
━━━━━━━━━━━━━━━━━━━━
🟢 بخش اول: بستانکاری راننده (طلب راننده)
۱. سهم ${s.driver_share_percent || 20}٪ راننده از کرایه صافی بارها: ${formatToman(shareAmount)} تومان
۲. مخارج مسیر پرداختی از جیب راننده: ${formatToman(driverExpenses)} تومان
۳. واریزی‌های راننده به کارت مالک: ${formatToman(driverTransfers)} تومان
➕ جمع کل طلب راننده: ${formatToman(totalCredit)} تومان

🔴 بخش دوم: بدهکاری راننده (دریافتی‌های راننده)
۱. پیش‌کرایه‌های نقدی دست راننده: ${formatToman(cashCollected)} تومان
۲. مساعده‌ها و واریزی‌های پدر به راننده: ${formatToman(advancesPaid)} تومان
➖ جمع کل بدهی راننده: ${formatToman(totalDebit)} تومان
━━━━━━━━━━━━━━━━━━━━
⚖️ نتیجه نهایی:
${balanceMessage}
━━━━━━━━━━━━━━━━━━━━
✨ ثبت شده در سامانه حسابداری هوشمند تریلی`;

  return text;
}

function copyInvoiceText() {
  const text = generateInvoiceText();
  const btn = document.getElementById('btnCopyInvoice');
  const btnIcon = document.getElementById('copyBtnIcon');
  const btnText = document.getElementById('copyBtnText');

  // Universal copy with fallback for non-secure HTTP contexts
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => {
      onCopySuccess();
    }).catch(() => {
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }

  function fallbackCopy(str) {
    const el = document.createElement('textarea');
    el.value = str;
    el.setAttribute('readonly', '');
    el.style.position = 'absolute';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    try {
      const successful = document.execCommand('copy');
      if (successful) onCopySuccess();
      else alert('لطفاً متن را به صورت دستی انتخاب و کپی فرمایید.');
    } catch (err) {
      alert('خطا در کپی: ' + err);
    }
    document.body.removeChild(el);
  }

  function onCopySuccess() {
    if (btn) btn.classList.add('copied');
    if (btnIcon) btnIcon.textContent = '✅';
    if (btnText) btnText.textContent = 'متن صورت‌حساب کپی شد!';
    showToast('📋 متن صورت‌حساب با موفقیت در حافظه کپی شد! اکنون می‌توانید در ایتا، واتساپ یا پیامک الصاق (Paste) نمایید.');

    setTimeout(() => {
      if (btn) btn.classList.remove('copied');
      if (btnIcon) btnIcon.textContent = '📋';
      if (btnText) btnText.textContent = 'کپی متن صورت‌حساب (جهت ارسال در ایتا، روبیکا، پیامک و...)';
    }, 2800);
  }
}

function shareInvoiceWhatsApp() {
  const text = generateInvoiceText();
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

async function confirmAndExecuteSettlement() {
  if (appState.role !== 'owner') {
    alert('فقط مالک مجاز به ثبت قطعی تسویه حساب است.');
    return;
  }
  if (!confirm('آیا از ثبت قطعی تسویه حساب این دوره اطمینان دارید؟ تمام بارها و خرج‌های فعلی بسته شده و مانده برای دوره بعدی صفر خواهد شد.')) return;

  const today = getTodayShamsi();
  try {
    const res = await fetch('/api/settlements', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Role': 'owner'
      },
      body: JSON.stringify({
        title: `تسویه حساب مورخ ${today}`,
        settlement_date: today
      })
    });
    if (res.ok) {
      closeModal('modalSettlement');
      await loadAllData();
      showToast('تسویه حساب با موفقیت ثبت شد و فاکتور در تاریخچه ذخیره گردید!');
      switchNav('settlements');
    } else {
      const err = await res.json();
      alert(err.message || 'خطا در تسویه حساب');
    }
  } catch (err) {
    alert('خطا: ' + err.message);
  }
}

function downloadDatabaseBackup() {
  if (appState.role !== 'owner') {
    alert('فقط مالک مجاز به دریافت فایل پشتیبان دیتابیس است.');
    return;
  }
  showToast('در حال دریافت و دانلود فایل پشتیبان دیتابیس...');
  window.location.href = '/api/backup/download?role=owner';
}
