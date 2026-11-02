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
  services: [],
  activeSettlement: null, // used for preview or detail viewing
  tripsFilter: 'unsettled',
  expensesFilter: 'all',
  paymentsFilter: 'all',
  servicesFilter: 'all',
  settlementViewTab: 'history',
  settlementSearchQuery: '',
  modalSettlementTab: 'current',
  modalSettlementSearchQuery: ''
};

// =================================================================
// موتور ذخیره‌سازی محلی کاملاً آفلاین روی حافظه آیفون (LocalDB Engine)
// این بخش تضمین می‌کند برنامه بدون نیاز به لپ‌تاپ یا اینترنت ۱۰۰٪ کار کند
// =================================================================

// Helper to detect static hosts (GitHub Pages, etc.) or offline mode
function isStaticHost() {
  return window.location.protocol === 'file:' || 
         window.location.hostname.includes('github.io') ||
         window.location.hostname.includes('pages.dev') ||
         window.location.hostname.includes('netlify.app') ||
         window.location.hostname.includes('vercel.app') ||
         !navigator.onLine;
}

const LocalDB = {
  KEYS: {
    SETTINGS: 'trili_local_settings',
    TRIPS: 'trili_local_trips',
    EXPENSES: 'trili_local_expenses',
    PAYMENTS: 'trili_local_payments',
    SETTLEMENTS: 'trili_local_settlements',
    SERVICES: 'trili_local_services',
    AUDIT: 'trili_local_audit'
  },

  defaultSettings: {
    owner_name: 'مالک تریلی',
    driver_name: 'راننده محترم',
    plate_number: '۱۲ ع ۳۴۵ ایران ۲۱',
    truck_model: 'تریلی ولوو FH500',
    driver_share_percent: 20.0,
    driver_share_basis: 'net',
    owner_pin: '1234'
  },

  repairCorruptedState() {
    const arrayKeys = [
      this.KEYS.TRIPS,
      this.KEYS.EXPENSES,
      this.KEYS.PAYMENTS,
      this.KEYS.SERVICES,
      this.KEYS.SETTLEMENTS,
      this.KEYS.AUDIT
    ];
    arrayKeys.forEach(k => {
      try {
        const raw = localStorage.getItem(k);
        if (!raw) {
          localStorage.setItem(k, JSON.stringify([]));
          return;
        }
        const val = JSON.parse(raw);
        if (!Array.isArray(val)) {
          console.warn(`LocalDB: Repaired corrupted non-array key ${k}`, val);
          localStorage.setItem(k, JSON.stringify([]));
        }
      } catch (e) {
        localStorage.setItem(k, JSON.stringify([]));
      }
    });

    try {
      const sRaw = localStorage.getItem(this.KEYS.SETTINGS);
      if (sRaw) {
        const s = JSON.parse(sRaw);
        if (!s || typeof s !== 'object' || Array.isArray(s) || s.offline) {
          localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(this.defaultSettings));
        }
      } else {
        localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(this.defaultSettings));
      }
    } catch (e) {
      localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(this.defaultSettings));
    }
  },

  init() {
    this.repairCorruptedState();

    if (!localStorage.getItem('trili_demo_data_purged_v1')) {
      localStorage.setItem(this.KEYS.TRIPS, JSON.stringify([]));
      localStorage.setItem(this.KEYS.EXPENSES, JSON.stringify([]));
      localStorage.setItem(this.KEYS.PAYMENTS, JSON.stringify([]));
      localStorage.setItem(this.KEYS.SERVICES, JSON.stringify([]));
      localStorage.setItem(this.KEYS.SETTLEMENTS, JSON.stringify([]));
      localStorage.setItem(this.KEYS.AUDIT, JSON.stringify([]));
      localStorage.setItem('trili_demo_data_purged_v1', 'true');
    }
  },

  get(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return key === this.KEYS.SETTINGS ? { ...this.defaultSettings } : [];
      }
      const parsed = JSON.parse(raw);
      if (key === this.KEYS.SETTINGS) {
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && !parsed.offline) {
          return parsed;
        }
        return { ...this.defaultSettings };
      }
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return key === this.KEYS.SETTINGS ? { ...this.defaultSettings } : [];
    }
  },

  set(key, val) {
    try {
      if (key !== this.KEYS.SETTINGS) {
        if (!Array.isArray(val)) {
          console.warn(`LocalDB.set rejected non-array for key ${key}:`, val);
          return;
        }
      } else {
        if (!val || typeof val !== 'object' || Array.isArray(val) || val.offline) {
          return;
        }
      }
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  },

  calculateSummary(role) {
    const trips = this.get(this.KEYS.TRIPS);
    const expenses = this.get(this.KEYS.EXPENSES);
    const payments = this.get(this.KEYS.PAYMENTS);
    const services = this.get(this.KEYS.SERVICES);
    const settings = this.get(this.KEYS.SETTINGS) || {};

    const unsettledTrips = trips.filter(t => !t.is_settled);
    const unsettledExpenses = expenses.filter(e => !e.is_settled);
    const unsettledPayments = payments.filter(p => !p.is_settled);

    const totalFreightUnsettled = unsettledTrips.reduce((acc, t) => acc + (t.total_freight || 0), 0);
    const netFreightUnsettled = unsettledTrips.reduce((acc, t) => acc + (t.net_freight || 0), 0);
    const driverEarnedShare = unsettledTrips.reduce((acc, t) => acc + (t.driver_share_amount || 0), 0);
    const ownerShareUnsettled = unsettledTrips.reduce((acc, t) => acc + (t.owner_share_amount || Math.max(0, (t.net_freight || 0) - (t.driver_share_amount || 0))), 0);

    const driverPaidExpenses = unsettledExpenses
      .filter(e => e.paid_by === 'driver')
      .reduce((acc, e) => acc + (e.amount || 0), 0);
    const ownerPaidExpenses = unsettledExpenses
      .filter(e => e.paid_by === 'owner')
      .reduce((acc, e) => acc + (e.amount || 0), 0);

    // واریزی‌های تایید شده راننده به حساب مالک
    const driverTransfersToOwner = unsettledPayments
      .filter(p => p.payer === 'driver' && (p.is_approved !== false))
      .reduce((acc, p) => acc + (p.amount || 0), 0);

    const pendingDriverTransfers = unsettledPayments
      .filter(p => p.payer === 'driver' && p.is_approved === false)
      .reduce((acc, p) => acc + (p.amount || 0), 0);

    const pendingTransfersCount = unsettledPayments
      .filter(p => p.payer === 'driver' && p.is_approved === false).length;

    const driverCashCollected = unsettledTrips.reduce((acc, t) => acc + (t.cash_received_by_driver || 0), 0);
    const advancesPaidByOwner = unsettledPayments
      .filter(p => p.payer !== 'driver')
      .reduce((acc, p) => acc + (p.amount || 0), 0);

    const driverTotalCredit = driverEarnedShare + driverPaidExpenses + driverTransfersToOwner;
    const driverTotalDebit = driverCashCollected + advancesPaidByOwner;
    const finalBalance = driverTotalCredit - driverTotalDebit;

    // آخرین وضعیت تعویض روغن
    const oilServices = services.filter(s => s.service_type === 'تعویض روغن موتور' || (s.service_type && s.service_type.includes('روغن')));
    const latestOil = oilServices.length > 0 ? oilServices[0] : (services[0] || null);
    if (latestOil) {
      latestOil.remaining_km = Math.max(0, (latestOil.next_km || 0) - (latestOil.current_km || 0));
    }

    const totalLifetimeFreight = trips.reduce((acc, t) => acc + (t.net_freight || 0), 0);
    const totalLifetimeExpenses = expenses.reduce((acc, e) => acc + (e.amount || 0), 0);
    const netTruckProfit = totalLifetimeFreight - totalLifetimeExpenses;

    return {
      role: role || 'driver',
      driver_percent: settings.driver_share_percent || 20.0,
      unsettled_trips_count: unsettledTrips.length,
      total_freight_unsettled: totalFreightUnsettled,
      net_freight_unsettled: netFreightUnsettled,
      total_net_freight_unsettled: netFreightUnsettled,
      total_expenses_unsettled: driverPaidExpenses + ownerPaidExpenses,
      driver_share_unsettled: driverEarnedShare,
      owner_share_unsettled: ownerShareUnsettled,
      driver_paid_expenses: driverPaidExpenses,
      owner_paid_expenses: ownerPaidExpenses,
      driver_transfers_to_owner: driverTransfersToOwner,
      pending_driver_transfers: pendingDriverTransfers,
      pending_transfers_count: pendingTransfersCount,
      driver_cash_collected: driverCashCollected,
      advances_paid: advancesPaidByOwner,
      driver_total_credit: driverTotalCredit,
      driver_total_debit: driverTotalDebit,
      final_balance: finalBalance,
      latest_oil_service: latestOil,
      lifetime: {
        total_trips: trips.length,
        total_net_freight: totalLifetimeFreight,
        total_expenses: totalLifetimeExpenses,
        net_profit: netTruckProfit
      }
    };
  },

  exportBackup() {
    const data = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      shamsi_date: getTodayShamsi(),
      settings: this.get(this.KEYS.SETTINGS),
      trips: this.get(this.KEYS.TRIPS),
      expenses: this.get(this.KEYS.EXPENSES),
      payments: this.get(this.KEYS.PAYMENTS),
      settlements: this.get(this.KEYS.SETTLEMENTS),
      services: this.get(this.KEYS.SERVICES),
      audit: this.get(this.KEYS.AUDIT)
    };
    return JSON.stringify(data, null, 2);
  },

  importBackup(jsonString) {
    const data = JSON.parse(jsonString);
    if (data.settings) this.set(this.KEYS.SETTINGS, data.settings);
    if (Array.isArray(data.trips)) this.set(this.KEYS.TRIPS, data.trips);
    if (Array.isArray(data.expenses)) this.set(this.KEYS.EXPENSES, data.expenses);
    if (Array.isArray(data.payments)) this.set(this.KEYS.PAYMENTS, data.payments);
    if (Array.isArray(data.settlements)) this.set(this.KEYS.SETTLEMENTS, data.settlements);
    if (Array.isArray(data.services)) this.set(this.KEYS.SERVICES, data.services);
    if (Array.isArray(data.audit)) this.set(this.KEYS.AUDIT, data.audit);
  }
};

function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

function updateOnlineStatusUI() {
  const badge = document.getElementById('storageStatusBadge');
  const icon = document.getElementById('storageIcon');
  const text = document.getElementById('storageText');
  if (!badge) return;

  if (navigator.onLine) {
    badge.className = 'storage-mode-pill';
    if (icon) icon.textContent = '🟢';
    if (text) text.textContent = 'آنلاین + حافظه آیفون';
  } else {
    badge.className = 'storage-mode-pill offline';
    if (icon) icon.textContent = '📱';
    if (text) text.textContent = 'آفلاین ۱۰۰٪ (حافظه آیفون)';
  }
}

window.addEventListener('online', () => {
  updateOnlineStatusUI();
  showToast('دستگاه به اینترنت متصل شد.');
});
window.addEventListener('offline', () => {
  updateOnlineStatusUI();
  showToast('حالت کاملاً آفلاین فعال شد: کلیه اطلاعات روی حافظه گوشی ذخیره می‌شود.');
});

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

function toPersianDigits(val) {
  if (val === null || val === undefined) return '';
  const faDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(val).replace(/[0-9]/g, (d) => faDigits[d]);
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
  else if (inputEl.id === 'serviceCost') hintEl = document.getElementById('hintServiceCost');
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
  LocalDB.init();
  updateOnlineStatusUI();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW notice:', err));
  }

  const today = getTodayShamsi();
  if (document.getElementById('tripLoadingDate')) document.getElementById('tripLoadingDate').value = today;
  if (document.getElementById('expDate')) document.getElementById('expDate').value = today;
  if (document.getElementById('payDate')) document.getElementById('payDate').value = today;
  if (document.getElementById('serviceDate')) document.getElementById('serviceDate').value = today;

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
    ['Dashboard', 'Trips', 'Expenses', 'Services', 'Payments', 'Settlements'].forEach(v => {
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

  const localCfg = LocalDB.get(LocalDB.KEYS.SETTINGS) || {};
  const correctPin = localCfg.owner_pin || (appState.settings && appState.settings.owner_pin) || '1234';

  let verified = false;
  if (pin === correctPin) {
    verified = true;
    if (!isStaticHost()) {
      fetch('/api/auth/verify-owner-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      }).catch(() => {});
    }
  } else if (!isStaticHost()) {
    try {
      const res = await fetch('/api/auth/verify-owner-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success') verified = true;
      }
    } catch (err) {}
  }

  if (verified) {
    appState.role = 'owner';
    localStorage.setItem('trili_role', 'owner');
    pinInput.value = '';
    checkAuthState();
    switchNav('dashboard');
    loadAllData();
    showToast('خوش آمدید! وارد پنل مدیریت مالک شدید.');
  } else {
    errEl.textContent = 'رمز عبور نادرست است!';
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

  // 1. Synchronously load and render from LocalDB for instant offline UI
  appState.settings = LocalDB.get(LocalDB.KEYS.SETTINGS) || {};
  appState.trips = LocalDB.get(LocalDB.KEYS.TRIPS) || [];
  appState.expenses = LocalDB.get(LocalDB.KEYS.EXPENSES) || [];
  appState.payments = LocalDB.get(LocalDB.KEYS.PAYMENTS) || [];
  appState.settlements = LocalDB.get(LocalDB.KEYS.SETTLEMENTS) || [];
  appState.services = LocalDB.get(LocalDB.KEYS.SERVICES) || [];
  appState.summary = LocalDB.calculateSummary(appState.role);

  renderRoleHeaderAndAccess();
  updateHeaderWithSettings();
  updateSummaryUI();
  renderDashboard();
  renderTripsList();
  renderExpensesList();
  renderServicesList();
  renderPaymentsList();
  renderSettlementsList();

  // 2. Background sync only if connected to actual server (not GitHub Pages)
  if (!isStaticHost()) {
    try {
      await Promise.allSettled([
        fetchSettings(),
        fetchSummary(),
        fetchTrips(),
        fetchExpenses(),
        fetchServices(),
        fetchPayments(),
        fetchSettlements()
      ]);
      renderDashboard();
      renderTripsList();
      renderExpensesList();
      renderServicesList();
      renderPaymentsList();
      renderSettlementsList();
    } catch (e) {}
  }
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
    if (subEl) subEl.textContent = `مالک: ${s.owner_name || 'مالک'} | پلاک: ${s.plate_number || ''}`;
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
            <span>ورود به پنل مدیریت مالک</span>
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
    if (qPayLabel) qPayLabel.textContent = isOwner ? 'ثبت واریزی / مساعده' : 'ثبت واریزی به کارت مالک';
  }

  // Settlement CTA Button: Only Owner can settle
  const setBox = document.getElementById('dashSettlementContainer');
  if (setBox) setBox.style.display = isOwner ? 'block' : 'none';

  const driverSetBox = document.getElementById('driverSettlementContainer');
  if (driverSetBox) driverSetBox.style.display = isOwner ? 'none' : 'block';

  // Badges update across panels
  const setCount = appState.settlements ? appState.settlements.length : 0;
  const countText = `${setCount} دوره`;
  const dashSetBadge = document.getElementById('dashSettlementCountBadge');
  if (dashSetBadge) dashSetBadge.textContent = countText;
  const driverDashSetBadge = document.getElementById('driverDashSettlementCountBadge');
  if (driverDashSetBadge) driverDashSetBadge.textContent = countText;
  const setHistBadge = document.getElementById('settlementHistoryCountBadge');
  if (setHistBadge) setHistBadge.textContent = `${setCount}`;
  const modalHistBadge = document.getElementById('modalHistoryCountBadge');
  if (modalHistBadge) modalHistBadge.textContent = `${setCount}`;

  // New Payment Button in Payments view: Visible for BOTH roles!
  const btnNewPay = document.getElementById('btnNewPayment');
  if (btnNewPay) {
    btnNewPay.style.display = 'block';
    btnNewPay.textContent = isOwner ? '+ ثبت واریزی / مساعده' : '+ واریز به کارت مالک';
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
    alert('تنظیمات خودرو و قرارداد فقط در پنل مدیریت مالک در دسترس است.\nبرای دسترسی، لطفاً از دکمه بالا رمز مالک را وارد کنید.');
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

  const localCfg = LocalDB.get(LocalDB.KEYS.SETTINGS) || {};
  const correctPin = localCfg.owner_pin || (appState.settings && appState.settings.owner_pin) || '1234';

  let verified = false;
  if (pin === correctPin) {
    verified = true;
    if (!isStaticHost()) {
      fetch('/api/auth/verify-owner-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      }).catch(() => {});
    }
  } else if (!isStaticHost()) {
    try {
      const res = await fetch('/api/auth/verify-owner-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success') verified = true;
      }
    } catch (err) {}
  }

  if (verified) {
    appState.role = 'owner';
    localStorage.setItem('trili_role', 'owner');
    closeModal('modalPinLogin');
    await loadAllData();
    showToast('خوش آمدید! وارد پنل مدیریت مالک شدید.');
  } else {
    errEl.textContent = 'رمز عبور نادرست است!';
    errEl.style.display = 'block';
  }
}

// --- API Calls & Local Fallback ---
async function fetchSettings() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 800);
    const res = await fetch('/api/settings', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const serverSettings = await res.json();
      if (serverSettings && typeof serverSettings === 'object' && !serverSettings.offline && (serverSettings.plate_number || serverSettings.owner_name)) {
        const localCfg = LocalDB.get(LocalDB.KEYS.SETTINGS) || {};
        if (!serverSettings.owner_pin && localCfg.owner_pin) {
          serverSettings.owner_pin = localCfg.owner_pin;
        }
        appState.settings = serverSettings;
        LocalDB.set(LocalDB.KEYS.SETTINGS, appState.settings);
        updateHeaderWithSettings();
        return;
      }
    }
  } catch (err) {}
  appState.settings = LocalDB.get(LocalDB.KEYS.SETTINGS) || {};
  updateHeaderWithSettings();
}

async function fetchSummary() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 800);
    const res = await fetch(`/api/summary?role=${appState.role}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const s = await res.json();
      if (s && typeof s === 'object' && !s.offline && s.net_profit !== undefined) {
        appState.summary = s;
        updateSummaryUI();
        return;
      }
    }
  } catch (err) {}
  appState.summary = LocalDB.calculateSummary(appState.role);
  updateSummaryUI();
}

async function fetchTrips() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 800);
    const res = await fetch('/api/trips', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        appState.trips = data;
        LocalDB.set(LocalDB.KEYS.TRIPS, data);
        return;
      }
    }
  } catch (err) {}
  appState.trips = LocalDB.get(LocalDB.KEYS.TRIPS);
}

async function fetchExpenses() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 800);
    const res = await fetch(`/api/expenses?role=${appState.role}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        appState.expenses = data;
        LocalDB.set(LocalDB.KEYS.EXPENSES, data);
        return;
      }
    }
  } catch (err) {}
  appState.expenses = LocalDB.get(LocalDB.KEYS.EXPENSES);
}

async function fetchPayments() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 800);
    const res = await fetch('/api/payments', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        appState.payments = data;
        LocalDB.set(LocalDB.KEYS.PAYMENTS, data);
        return;
      }
    }
  } catch (err) {}
  appState.payments = LocalDB.get(LocalDB.KEYS.PAYMENTS);
}

async function fetchSettlements() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 800);
    const res = await fetch('/api/settlements', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        appState.settlements = data;
        LocalDB.set(LocalDB.KEYS.SETTLEMENTS, data);
        return;
      }
    }
  } catch (err) {}
  appState.settlements = LocalDB.get(LocalDB.KEYS.SETTLEMENTS);
}

async function fetchServices() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 800);
    const res = await fetch('/api/services', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        appState.services = data;
        LocalDB.set(LocalDB.KEYS.SERVICES, data);
        return;
      }
    }
  } catch (err) {}
  appState.services = LocalDB.get(LocalDB.KEYS.SERVICES);
}

function updateHeaderWithSettings() {
  const s = appState.settings;
  if (!s) return;
  const plate = s.plate_number || '۱۲ ع ۳۴۵ ایران ۲۱';
  const clean = normalizeDigits(plate).trim();
  const tokens = clean.split(/\s+/);
  let p1 = '12', letter = 'ع', p2 = '345', p3 = '21';

  if (tokens.length >= 4) {
    p1 = tokens[0].replace(/[^0-9]/g, '') || '12';
    letter = tokens[1] || 'ع';
    p2 = tokens[2].replace(/[^0-9]/g, '') || '345';
    p3 = tokens[tokens.length - 1].replace(/[^0-9]/g, '') || '21';
  } else {
    const match = clean.match(/(\d{2})\s*([^\d\s]+)\s*(\d{3})\s*(?:ایران)?\s*(\d{2})/);
    if (match) {
      p1 = match[1] || '12';
      letter = match[2] || 'ع';
      p2 = match[3] || '345';
      p3 = match[4] || '21';
    }
  }

  const p1Fa = toPersianDigits(p1);
  const p2Fa = toPersianDigits(p2);
  const p3Fa = toPersianDigits(p3);

  const elP1 = document.getElementById('plateHeaderP1');
  const elLetter = document.getElementById('plateHeaderLetter');
  const elP2 = document.getElementById('plateHeaderP2');
  const elCity = document.getElementById('plateHeaderCity');

  if (elP1) elP1.textContent = p1Fa;
  if (elLetter) elLetter.textContent = letter;
  if (elP2) elP2.textContent = p2Fa;
  if (elCity) elCity.textContent = p3Fa;

  const plateDisplay = document.getElementById('plateDisplay');
  if (plateDisplay) plateDisplay.textContent = `${p1Fa} ${letter} ${p2Fa}`;

  const plateCityDisplay = document.getElementById('plateCityDisplay');
  if (plateCityDisplay && !elCity) plateCityDisplay.textContent = 'ایران ' + p3Fa;

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
      descEl.textContent = 'این مبلغ حاصل سهم ۲۰٪ بارها، مخارج مسیر و واریزی‌های شما به کارت مالک است که باید دریافت کنید.';
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

  // Truck Oil & Service Card in Dashboard
  const oil = sum.latest_oil_service || (appState.services && appState.services.find(s => s.service_type === 'تعویض روغن موتور' || (s.service_type && s.service_type.includes('روغن')))) || (appState.services && appState.services[0]) || null;
  const oilCard = document.getElementById('dashOilCard');
  if (oilCard) {
    if (oil) {
      const curKm = oil.current_km || 0;
      const nextKm = oil.next_km || 0;
      const remaining = Math.max(0, nextKm - curKm);

      const elRemaining = document.getElementById('dashOilRemainingKm');
      const elCurrent = document.getElementById('dashOilCurrentKm');
      const elNext = document.getElementById('dashOilNextKm');
      const elBrand = document.getElementById('dashOilBrand');
      const elDate = document.getElementById('dashOilDate');
      const statusBadge = document.getElementById('dashOilStatusBadge');
      const progressBar = document.getElementById('dashOilProgressBar');

      if (elRemaining) elRemaining.textContent = remaining.toLocaleString('fa-IR');
      if (elCurrent) elCurrent.textContent = curKm.toLocaleString('fa-IR') + ' km';
      if (elNext) elNext.textContent = nextKm.toLocaleString('fa-IR') + ' km';
      if (elBrand) elBrand.textContent = oil.oil_brand || 'ثبت نشده';
      if (elDate) elDate.textContent = oil.service_date || '---';

      if (remaining <= 0) {
        if (statusBadge) {
          statusBadge.className = 'oil-status-badge oil-status-danger';
          statusBadge.textContent = '🔴 سررسید تعویض شده!';
        }
        if (progressBar) {
          progressBar.className = 'oil-progress-bar danger';
          progressBar.style.width = '100%';
        }
      } else if (remaining < 3000) {
        if (statusBadge) {
          statusBadge.className = 'oil-status-badge oil-status-warning';
          statusBadge.textContent = '🟡 هشدار: نزدیک به موعد';
        }
        if (progressBar) {
          progressBar.className = 'oil-progress-bar warning';
          progressBar.style.width = '85%';
        }
      } else {
        if (statusBadge) {
          statusBadge.className = 'oil-status-badge oil-status-good';
          statusBadge.textContent = '🟢 وضعیت مناسب و عادی';
        }
        if (progressBar) {
          progressBar.className = 'oil-progress-bar';
          progressBar.style.width = '45%';
        }
      }
    } else {
      const elRemaining = document.getElementById('dashOilRemainingKm');
      if (elRemaining) elRemaining.textContent = 'سرویسی ثبت نشده';
    }
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
  const driverPercent = t.driver_share_percent || (appState.settings && appState.settings.driver_share_percent) || 20;

  return `
    <div class="route-ticket-card">
      <div class="ticket-header-row">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="ticket-bill-badge">بارنامه: ${t.bill_number || 'ثبت شده'}</span>
          <span class="badge-tag ${isSettled ? 'badge-settled' : 'badge-unsettled'}">
            ${isSettled ? 'تسویه شده' : 'تسویه نشده'}
          </span>
        </div>
        <span style="font-size: 11.5px; color: #64748b; font-weight: 600;">
          ${t.cargo_type || 'تریلی'} ${t.weight_tons ? `• ${t.weight_tons} تن` : ''}
        </span>
      </div>

      <div class="ticket-road-track">
        <div class="city-node">
          <div class="city-dot"></div>
          <span class="city-name">${t.origin || 'مبدأ'}</span>
        </div>
        <div class="road-dashed-line">
          <div class="truck-transit-icon">🚛</div>
        </div>
        <div class="city-node">
          <div class="city-dot city-dot-dest"></div>
          <span class="city-name">${t.destination || 'مقصد'}</span>
        </div>
      </div>

      <div class="ticket-metrics-bar">
        <div class="ticket-metric-box">
          <span class="ticket-metric-title">صافی بار</span>
          <div class="ticket-metric-val">${formatToman(t.net_freight)} ت</div>
        </div>
        <div class="ticket-metric-box">
          <span class="ticket-metric-title">سهم راننده (${driverPercent}٪)</span>
          <div class="ticket-metric-val val-success">${formatToman(t.driver_share_amount)} ت</div>
        </div>
        <div class="ticket-metric-box">
          <span class="ticket-metric-title">پیش‌کرایه دستی</span>
          <div class="ticket-metric-val ${t.cash_received_by_driver > 0 ? 'val-warning' : 'val-muted'}">
            ${t.cash_received_by_driver > 0 ? formatToman(t.cash_received_by_driver) + ' ت' : '۰'}
          </div>
        </div>
      </div>

      <div class="ticket-footer-row">
        <div class="ticket-meta-info">
          <span>📅 ${t.loading_date || 'بدون تاریخ'}</span>
          ${t.total_freight ? `<span style="margin-right: 6px; color: #64748b;">(کل: ${formatToman(t.total_freight)} ت - کمیسیون: ${formatToman(t.commission_fee || 0)})</span>` : ''}
        </div>
        ${!isSettled && isOwner ? `
          <button class="btn-sm-action btn-sm-danger" onclick="deleteTrip(${t.id})" title="حذف بارنامه">
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
          ${isDriverPaid ? 'پرداخت راننده (طلب)' : 'پرداخت مالک'}
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
          <button class="btn-sm-action" onclick="viewReceiptById('expense', ${e.id})">
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
    statusBadge = '<span class="badge-tag" style="background:#fef3c7; color:#b45309; border:1px solid #fde68a;">⏳ منتظر تایید مالک</span>';
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
          💡 این واریزی ثبت شده و به محض اینکه مالک دریافت آن را تایید کند، به طلب شما اضافه خواهد شد.
        </div>
      ` : ''}

      <div class="card-footer-actions">
        ${p.receipt_image ? `
          <button class="btn-sm-action" onclick="viewReceiptById('payment', ${p.id})">
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
  const isOwner = appState.role === 'owner';
  const adjAmt = s.adjustment_amount || 0;

  return `
    <div class="item-card" style="box-shadow: 0 2px 8px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; margin-bottom: 12px;">
      <div class="card-top">
        <div class="card-title">
          <span>📑</span>
          <span>${s.title}</span>
        </div>
        <span class="badge-tag badge-settled">مورخ ${s.settlement_date}</span>
      </div>

      <div class="card-body-row">
        <span>تعداد سفرها: <strong>${s.total_trips_count} سفر</strong></span>
        <span>سهم کارکرد راننده: <strong>${formatToman(s.driver_earned_share)} ت</strong></span>
      </div>

      <div class="card-body-row">
        <span>خرج‌های راننده: <strong>+${formatToman(s.driver_paid_expenses)} ت</strong></span>
        <span>واریزی‌های راننده: <strong>+${formatToman(s.driver_transfers_to_owner || 0)} ت</strong></span>
      </div>

      <div class="card-body-row">
        <span>مساعده‌ها و پیش‌کرایه: <strong>-${formatToman(s.total_driver_debit)} ت</strong></span>
        ${isOwner && s.owner_net_profit ? `
          <span style="color:#15803d; font-weight:700;">سود خالص مالک: ${formatToman(s.owner_net_profit)} ت</span>
        ` : ''}
      </div>

      ${adjAmt !== 0 ? `
      <div style="margin-top:6px; font-size:11.5px; padding:6px 10px; border-radius:8px; background:${adjAmt > 0 ? '#f0fdf4' : '#fef2f2'}; color:${adjAmt > 0 ? '#15803d' : '#b91c1c'}; display:flex; justify-content:space-between;">
        <span>${adjAmt > 0 ? '🌟 پاداش راننده:' : '⚠️ کسورات/خسارت:'} ${s.adjustment_desc || ''}</span>
        <strong>${adjAmt > 0 ? '+' : ''}${formatToman(adjAmt)} ت</strong>
      </div>` : ''}

      <div class="card-highlight-box" style="background: ${isCredit ? '#ecfdf5' : '#fef2f2'}; margin-top:10px;">
        <div>
          <div class="highlight-label">${isCredit ? 'مبلغ پرداخت شده به راننده:' : 'مبلغ بازگردانده شده توسط راننده:'}</div>
          <div style="font-size: 16px; font-weight: 900; color: ${isCredit ? '#059669' : '#dc2626'};">
            ${formatToman(Math.abs(balance))} تومان
          </div>
        </div>
        <button class="btn-sm-action" onclick="showSettlementDetail(${s.id})">
          👁️ مشاهده ریز فاکتور ←
        </button>
      </div>

      <div style="display: flex; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: 1px dashed #e2e8f0; flex-wrap: wrap;">
        <button type="button" class="btn-sm-action" style="flex: 1; text-align: center; background: #f8fafc; color: #1e293b; border: 1px solid #cbd5e1; padding: 7px 10px; font-size: 12px; border-radius: 8px;" onclick="copySettlementTextById(${s.id})">
          📋 کپی متن فاکتور
        </button>
        <button type="button" class="btn-sm-action" style="flex: 1; text-align: center; background: #22c55e; color: #ffffff; padding: 7px 10px; font-size: 12px; border-radius: 8px;" onclick="shareSettlementWhatsAppById(${s.id})">
          📲 ارسال واتساپ
        </button>
        ${isOwner ? `
          <button type="button" class="btn-sm-action" style="background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; padding: 7px 10px; font-size: 12px; border-radius: 8px;" onclick="confirmRollbackSettlement(${s.id})" title="لغو و بازگردانی این تسویه">
            🗑️ لغو تسویه
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

// --- Navigation & Filters ---
function switchNav(viewName) {
  const views = ['Dashboard', 'Trips', 'Expenses', 'Services', 'Payments', 'Settlements'];
  views.forEach(v => {
    const el = document.getElementById(`view${v}`);
    if (el) el.style.display = (v.toLowerCase() === viewName.toLowerCase()) ? 'block' : 'none';
  });

  const navs = ['Dash', 'Trips', 'Expenses', 'Services', 'Payments', 'Settlements'];
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

function switchServiceCategory(cat) {
  appState.serviceCategoryFilter = cat;
  document.getElementById('segBtnAll')?.classList.toggle('active', cat === 'all');
  document.getElementById('segBtnService')?.classList.toggle('active', cat === 'service');
  document.getElementById('segBtnRepair')?.classList.toggle('active', cat === 'repair');
  renderServicesList();
}

function filterServices(category) {
  appState.servicesFilter = category;
  renderServicesList();
}

function renderServicesList() {
  const container = document.getElementById('allServicesList');
  if (!container) return;

  let list = appState.services || [];

  // Filter by category: 'all', 'service', 'repair'
  if (appState.serviceCategoryFilter && appState.serviceCategoryFilter !== 'all') {
    list = list.filter(s => {
      const isRepair = s.service_category === 'repair' || (s.service_type && (
        s.service_type.includes('تعمیر') || s.service_type.includes('لنت') || 
        s.service_type.includes('باطری') || s.service_type.includes('لاستیک') || 
        s.service_type.includes('پمپ') || s.service_type.includes('آهنگری') || 
        s.service_type.includes('فنر')
      ));
      const itemCat = isRepair ? 'repair' : 'service';
      return itemCat === appState.serviceCategoryFilter;
    });
  }

  // Filter by sub-category keyword
  if (appState.servicesFilter && appState.servicesFilter !== 'all') {
    list = list.filter(s => s.service_type && s.service_type.includes(appState.servicesFilter));
  }

  if (list.length === 0) {
    const isRepairMode = appState.serviceCategoryFilter === 'repair';
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${isRepairMode ? '🔧' : '🛢️'}</div>
        <div class="empty-text">هیچ موردی در این دسته‌بندی یافت نشد.</div>
      </div>
    `;
  } else {
    container.innerHTML = list.map(s => renderServiceCardHTML(s)).join('');
  }
}

function renderServiceCardHTML(s) {
  const isOwner = appState.role === 'owner';
  const remaining = Math.max(0, (s.next_km || 0) - (s.current_km || 0));
  
  let statusBadge = '<span class="oil-status-badge oil-status-good">🟢 عادی</span>';
  if (remaining <= 0) {
    statusBadge = '<span class="oil-status-badge oil-status-danger">🔴 سررسید تعویض</span>';
  } else if (remaining < 3000) {
    statusBadge = '<span class="oil-status-badge oil-status-warning">🟡 نزدیک به موعد</span>';
  }

  const isRepair = s.service_category === 'repair' || (s.service_type && (
    s.service_type.includes('تعمیر') || s.service_type.includes('لنت') || 
    s.service_type.includes('باطری') || s.service_type.includes('لاستیک') || 
    s.service_type.includes('پمپ') || s.service_type.includes('آهنگری') || 
    s.service_type.includes('فنر')
  ));

  const typeBadge = isRepair 
    ? '<span class="badge-tag badge-repair">🔧 تعمیرگاه و قطعات</span>'
    : '<span class="badge-tag badge-service-fluid">🛢️ سرویس دوره‌ای</span>';

  const typeIcon = isRepair ? '🔧' : '🛢️';

  const paidByText = s.paid_by === 'driver' 
    ? '<span style="color:#2563eb; font-weight:700;">🧢 راننده از جیبش (طلبکار)</span>'
    : '<span style="color:#475569; font-weight:700;">👑 مالک تریلی</span>';

  return `
    <div class="service-item-card" style="border-right: 4px solid ${isRepair ? '#ea580c' : '#0284c7'};">
      <div class="service-item-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:22px;">${typeIcon}</span>
          <div>
            <div style="display:flex; align-items:center; gap:6px;">
              <strong style="font-size:14px; color:#0f172a;">${s.service_type}</strong>
            </div>
            <div style="font-size:11px; color:#64748b; margin-top:2px;">تاریخ ثبت: ${s.service_date || '---'}</div>
          </div>
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
          ${typeBadge}
          ${statusBadge}
        </div>
      </div>

      <div class="card-body-row">
        <span>کیلومتر انجام کار: <strong>${(s.current_km || 0).toLocaleString('fa-IR')} km</strong></span>
        <span>کیلومتر سررسید بعدی: <strong>${(s.next_km || 0).toLocaleString('fa-IR')} km</strong></span>
      </div>

      <div class="card-highlight-box" style="margin-top:6px; background:${isRepair ? '#fff7ed' : '#f0fdf4'};">
        <div>
          <div class="highlight-label">باقیمانده تا سرویس/بازدید بعدی:</div>
          <div style="font-size:14px; font-weight:800; color:${remaining <= 0 ? '#dc2626' : (isRepair ? '#ea580c' : '#16a34a')};">
            ${remaining.toLocaleString('fa-IR')} کیلومتر
          </div>
        </div>
        <div style="text-align:left;">
          <div class="highlight-label">هزینه کل قطعات و دستمزد:</div>
          <div style="font-size:15px; font-weight:900; color:#0f172a;">
            ${formatToman(s.cost)} تومان
          </div>
        </div>
      </div>

      ${s.shop_name ? `
      <div style="margin-top:6px; font-size:12px; color:#475569; display:flex; align-items:center; gap:6px;">
        <span>مرکز / استادکار:</span>
        <span class="shop-tag-pill">📍 ${s.shop_name}</span>
      </div>` : ''}

      ${s.oil_brand ? `
      <div class="card-body-row" style="margin-top:6px;">
        <span>${isRepair ? 'قطعات / برند:' : 'مارک روغن / سیالات:'} <strong>${s.oil_brand}</strong></span>
        <span>پرداخت‌کننده: ${paidByText}</span>
      </div>` : `
      <div class="card-body-row" style="margin-top:6px;">
        <span>پرداخت‌کننده: ${paidByText}</span>
      </div>`}

      ${s.filters_replaced ? `
      <div style="margin-top:6px; font-size:12px; color:#475569;">
        <span>اقدامات انجام شده: </span>
        <span class="filter-tag-badge">${s.filters_replaced}</span>
      </div>` : ''}

      ${s.description ? `
      <div style="margin-top:6px; font-size:12px; color:#64748b; background:#f8fafc; padding:6px 10px; border-radius:8px;">
        📝 ${s.description}
      </div>` : ''}

      <div class="card-footer-actions">
        ${s.receipt_image ? `
          <button class="btn-sm-action" onclick="viewReceiptById('service', ${s.id})">
            📷 فاکتور ${isRepair ? 'تعمیرگاه' : 'روغن'}
          </button>` : ''}
        ${isOwner ? `
          <button class="btn-sm-action btn-sm-danger" onclick="deleteService(${s.id})">
            🗑️ حذف
          </button>` : ''}
      </div>
    </div>
  `;
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
  if (!container) return;
  let list = appState.settlements || [];

  if (appState.settlementSearchQuery) {
    const q = appState.settlementSearchQuery.trim().toLowerCase();
    list = list.filter(s => {
      const title = (s.title || '').toLowerCase();
      const date = (s.settlement_date || '').toLowerCase();
      const amount = String(s.final_balance || '');
      return title.includes(q) || date.includes(q) || amount.includes(q);
    });
  }

  // Update all badges
  const totalCount = appState.settlements ? appState.settlements.length : 0;
  const dashBadge = document.getElementById('dashSettlementCountBadge');
  if (dashBadge) dashBadge.textContent = `${totalCount} دوره`;
  const driverDashBadge = document.getElementById('driverDashSettlementCountBadge');
  if (driverDashBadge) driverDashBadge.textContent = `${totalCount} دوره`;
  const setHistBadge = document.getElementById('settlementHistoryCountBadge');
  if (setHistBadge) setHistBadge.textContent = `${totalCount}`;
  const modalHistBadge = document.getElementById('modalHistoryCountBadge');
  if (modalHistBadge) modalHistBadge.textContent = `${totalCount}`;

  if (list.length === 0) {
    if (appState.settlementSearchQuery) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 24px 16px;">
          <div class="empty-icon">🔍</div>
          <div class="empty-text">تسویه‌حسابی مطابق با جستجوی شما یافت نشد.</div>
        </div>`;
    } else {
      container.innerHTML = `
        <div class="empty-state" style="padding: 32px 16px; background: white; border-radius: 16px; border: 1.5px dashed #cbd5e1; margin-top: 6px;">
          <div class="empty-icon" style="font-size: 38px; margin-bottom: 8px;">📑</div>
          <div style="font-weight: 800; font-size: 15px; color: #1e293b; margin-bottom: 6px;">هنوز هیچ تسویه‌حسابی ثبت نشده است</div>
          <div class="empty-text" style="font-size: 12.5px; color: #64748b; line-height: 1.6; max-width: 320px; margin: 0 auto 16px auto;">
            با زدن دکمه «+ تسویه جدید» یا «محاسبه و صدور صورت‌حساب»، تمام بارها و خرج‌های فعلی محاسبه و بسته می‌شوند و صورت‌حساب رسمی آن‌ها در این تاریخچه برای همیشه بایگانی خواهد شد.
          </div>
          <button type="button" class="btn-primary btn-success" style="width: auto; margin: 0 auto; padding: 9px 20px; font-size: 13px;" onclick="openSettlementPreviewModal()">
            <span>📑</span>
            <span>محاسبه و صدور تسویه جدید</span>
          </button>
        </div>`;
    }
  } else {
    container.innerHTML = list.map(s => renderSettlementCardHTML(s)).join('');
  }
}

function filterSettlementView(tab) {
  appState.settlementViewTab = tab;
  const isHistory = tab === 'history';

  const tabHistory = document.getElementById('tabSetHistory');
  const tabCurrent = document.getElementById('tabSetCurrent');
  if (tabHistory) {
    tabHistory.className = `badge-tag ${isHistory ? 'badge-unsettled' : 'badge-owner'}`;
  }
  if (tabCurrent) {
    tabCurrent.className = `badge-tag ${isHistory ? 'badge-owner' : 'badge-unsettled'}`;
  }

  const histSection = document.getElementById('settlementsHistorySection');
  const currSection = document.getElementById('settlementsCurrentSection');
  if (histSection) histSection.style.display = isHistory ? 'block' : 'none';
  if (currSection) currSection.style.display = isHistory ? 'none' : 'block';

  if (isHistory) {
    renderSettlementsList();
  } else {
    renderSettlementCurrentOverview();
  }
}

function handleSettlementSearch(query) {
  appState.settlementSearchQuery = query;
  renderSettlementsList();
}

function renderSettlementCurrentOverview() {
  const container = document.getElementById('settlementsCurrentOverviewCard');
  if (!container) return;
  const isOwner = appState.role === 'owner';
  const sum = LocalDB.calculateSummary('owner');
  const unsettledTrips = (appState.trips || []).filter(t => !t.is_settled);
  const unsettledExpDriver = (appState.expenses || []).filter(e => !e.is_settled && e.paid_by === 'driver');
  const unsettledPay = (appState.payments || []).filter(p => !p.is_settled && p.is_approved);

  const totalCredit = (sum.driver_share_unsettled || 0) + (sum.driver_paid_expenses || 0) + (sum.driver_transfers_to_owner || 0);
  const totalDebit = (sum.driver_cash_collected || 0) + (sum.advances_paid || 0);
  const balance = totalCredit - totalDebit;
  const isCredit = balance >= 0;

  container.innerHTML = `
    <div class="item-card" style="border-top: 4px solid #2563eb; padding: 16px; margin-top: 4px;">
      <div class="card-top">
        <div class="card-title">
          <span>⏳</span>
          <span style="font-weight: 800;">خلاصه دوره جاری در جریان (تسویه نشده)</span>
        </div>
        <span class="badge-tag badge-unsettled">دوره فعال</span>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px;">
        <div style="background: #f8fafc; padding: 10px; border-radius: 10px; border: 1px solid #e2e8f0;">
          <div style="font-size: 11.5px; color: #64748b;">بارهای باز دوره:</div>
          <div style="font-size: 14px; font-weight: 800; color: #1e293b; margin-top: 2px;">${unsettledTrips.length} سفر</div>
          <div style="font-size: 11px; color: #16a34a; margin-top: 2px;">سهم راننده: ${formatToman(sum.driver_share_unsettled || 0)} ت</div>
        </div>

        <div style="background: #f8fafc; padding: 10px; border-radius: 10px; border: 1px solid #e2e8f0;">
          <div style="font-size: 11.5px; color: #64748b;">خرج‌های باز راننده (+):</div>
          <div style="font-size: 14px; font-weight: 800; color: #1e293b; margin-top: 2px;">${formatToman(sum.driver_paid_expenses || 0)} تومان</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${unsettledExpDriver.length} ردیف خرج</div>
        </div>

        <div style="background: #f8fafc; padding: 10px; border-radius: 10px; border: 1px solid #e2e8f0;">
          <div style="font-size: 11.5px; color: #64748b;">واریزی راننده به مالک (+):</div>
          <div style="font-size: 14px; font-weight: 800; color: #7c3aed; margin-top: 2px;">${formatToman(sum.driver_transfers_to_owner || 0)} تومان</div>
        </div>

        <div style="background: #f8fafc; padding: 10px; border-radius: 10px; border: 1px solid #e2e8f0;">
          <div style="font-size: 11.5px; color: #64748b;">مساعده‌ها و پیش‌کرایه (-):</div>
          <div style="font-size: 14px; font-weight: 800; color: #b45309; margin-top: 2px;">${formatToman(totalDebit)} تومان</div>
        </div>
      </div>

      <div class="card-highlight-box" style="background: ${isCredit ? '#ecfdf5' : '#fef2f2'}; margin-top: 14px; padding: 12px;">
        <div>
          <div class="highlight-label">${isCredit ? 'مانده تخمینی طلب راننده:' : 'مانده تخمینی بدهی راننده به مالک:'}</div>
          <div style="font-size: 17px; font-weight: 900; color: ${isCredit ? '#059669' : '#dc2626'};">
            ${formatToman(Math.abs(balance))} تومان
          </div>
        </div>
        <button type="button" class="btn-primary btn-success" style="width: auto; padding: 8px 16px; font-size: 12.5px;" onclick="openSettlementPreviewModal()">
          <span>📑</span>
          <span>${isOwner ? 'صدور صورت‌حساب رسمی' : 'مشاهده پیش‌فاکتور'}</span>
        </button>
      </div>
    </div>
  `;
}

function switchModalSettlementTab(tab) {
  appState.modalSettlementTab = tab;
  const isCurrent = tab === 'current';

  const tabCurrent = document.getElementById('tabModalCurrentSettlement');
  const tabHistory = document.getElementById('tabModalHistorySettlement');
  if (tabCurrent) tabCurrent.classList.toggle('active-service', isCurrent);
  if (tabHistory) tabHistory.classList.toggle('active-service', !isCurrent);

  const containerCurrent = document.getElementById('modalSettlementCurrentContainer');
  const containerHistory = document.getElementById('modalSettlementHistoryContainer');
  if (containerCurrent) containerCurrent.style.display = isCurrent ? 'block' : 'none';
  if (containerHistory) containerHistory.style.display = isCurrent ? 'none' : 'flex';

  if (!isCurrent) {
    renderModalSettlementHistory();
  }
}

function handleModalSettlementSearch(query) {
  appState.modalSettlementSearchQuery = query;
  renderModalSettlementHistory();
}

function renderModalSettlementHistory() {
  const container = document.getElementById('modalSettlementHistoryList');
  if (!container) return;
  let list = appState.settlements || [];
  if (appState.modalSettlementSearchQuery) {
    const q = appState.modalSettlementSearchQuery.trim().toLowerCase();
    list = list.filter(s => {
      const title = (s.title || '').toLowerCase();
      const date = (s.settlement_date || '').toLowerCase();
      return title.includes(q) || date.includes(q);
    });
  }

  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 24px 12px;">
        <div class="empty-icon">📑</div>
        <div class="empty-text">تسویه‌حسابی در تاریخچه یافت نشد.</div>
      </div>`;
    return;
  }

  container.innerHTML = list.map(s => {
    const balance = s.final_balance || 0;
    const isCredit = balance >= 0;
    return `
      <div class="item-card" style="margin-bottom: 8px; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px;">
        <div class="card-top" style="margin-bottom: 6px;">
          <div class="card-title" style="font-size: 13px; font-weight: 800;">
            <span>📑</span>
            <span>${s.title}</span>
          </div>
          <span class="badge-tag badge-settled" style="font-size: 11px;">${s.settlement_date}</span>
        </div>
        <div class="card-body-row" style="font-size: 12px; margin-bottom: 4px;">
          <span>تعداد سفر: <strong>${s.total_trips_count} بار</strong></span>
          <span>مانده تسویه: <strong style="color: ${isCredit ? '#16a34a' : '#dc2626'};">${formatToman(Math.abs(balance))} ت</strong></span>
        </div>
        <div style="display: flex; gap: 6px; margin-top: 8px;">
          <button type="button" class="btn-sm-action" style="flex: 1; text-align: center; padding: 6px 8px; font-size: 11.5px;" onclick="showSettlementDetail(${s.id})">
            👁️ مشاهده این صورت‌حساب
          </button>
          <button type="button" class="btn-sm-action" style="background: #f1f5f9; color: #334155; padding: 6px 10px; font-size: 11.5px;" onclick="copySettlementTextById(${s.id})">
            📋 کپی متن
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function copySettlementTextById(id) {
  const s = appState.settlements.find(item => item.id === id);
  if (!s) return;
  const prevActive = appState.activeSettlement;
  appState.activeSettlement = s;
  const text = generateInvoiceText();
  appState.activeSettlement = prevActive;
  navigator.clipboard.writeText(text).then(() => {
    showToast('متن صورت‌حساب این دوره با موفقیت کپی شد!');
  }).catch(() => {
    prompt('متن صورت‌حساب را کپی کنید:', text);
  });
}

function shareSettlementWhatsAppById(id) {
  const s = appState.settlements.find(item => item.id === id);
  if (!s) return;
  const prevActive = appState.activeSettlement;
  appState.activeSettlement = s;
  const text = generateInvoiceText();
  appState.activeSettlement = prevActive;
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

async function confirmRollbackSettlement(id) {
  if (appState.role !== 'owner') {
    alert('فقط مالک مجاز به لغو تسویه حساب است.');
    return;
  }
  const s = appState.settlements.find(item => item.id === id);
  const title = s ? s.title : `شماره ${id}`;
  if (!confirm(`آیا از لغو تسویه حساب «${title}» اطمینان دارید؟\nتمام بارها، هزینه‌ها و مساعده‌های این دوره دوباره به وضعیت «تسویه نشده» بازمی‌گردند تا بتوانید اصلاحات لازم را انجام دهید.`)) {
    return;
  }

  showToast('در حال لغو تسویه حساب...');

  // 1. Immediately update LocalDB
  const allTrips = LocalDB.get(LocalDB.KEYS.TRIPS);
  allTrips.forEach(t => {
    if (t.settlement_id === id) {
      t.is_settled = false;
      t.settlement_id = null;
    }
  });
  LocalDB.set(LocalDB.KEYS.TRIPS, allTrips);

  const allExpenses = LocalDB.get(LocalDB.KEYS.EXPENSES);
  allExpenses.forEach(e => {
    if (e.settlement_id === id) {
      e.is_settled = false;
      e.settlement_id = null;
    }
  });
  LocalDB.set(LocalDB.KEYS.EXPENSES, allExpenses);

  const allPayments = LocalDB.get(LocalDB.KEYS.PAYMENTS);
  allPayments.forEach(p => {
    if (p.settlement_id === id) {
      p.is_settled = false;
      p.settlement_id = null;
    }
  });
  LocalDB.set(LocalDB.KEYS.PAYMENTS, allPayments);

  const allSettlements = LocalDB.get(LocalDB.KEYS.SETTLEMENTS).filter(set => set.id !== id);
  LocalDB.set(LocalDB.KEYS.SETTLEMENTS, allSettlements);

  closeModal('modalSettlement');
  await loadAllData();
  showToast('تسویه حساب لغو شد و بارها و خرج‌ها به دوره جاری بازگردانده شدند.');

  // 2. Background sync
  if (!isStaticHost()) {
    fetch(`/api/settlements/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-Role': 'owner'
      }
    }).catch(() => {});
  }
}

function handleActiveSettlementRollback() {
  if (!appState.activeSettlement) return;
  confirmRollbackSettlement(appState.activeSettlement.id);
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
    if (titleEl) titleEl.textContent = '💳 ثبت واریز وجه به کارت صاحب‌ماشین (مالک)';
    if (noticeEl) noticeEl.style.display = 'block';
    if (ownerSelector) ownerSelector.style.display = 'none';
    if (submitBtn) submitBtn.textContent = 'ثبت و ارسال فیش برای مالک';
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

// --- Authentic Iranian Truck License Plate Widget ---
function handlePlateInput(inputEl, nextFocusId) {
  const val = normalizeDigits(inputEl.value).replace(/[^0-9]/g, '');
  inputEl.value = val;
  syncPlateToHiddenInput();

  if (val.length >= inputEl.maxLength && nextFocusId) {
    const nextEl = document.getElementById(nextFocusId);
    if (nextEl) nextEl.focus();
  }
}

function syncPlateToHiddenInput() {
  const p1 = normalizeDigits(document.getElementById('platePart1')?.value || '').trim();
  const letter = (document.getElementById('plateLetter')?.value || 'ع').trim();
  const p2 = normalizeDigits(document.getElementById('platePart2')?.value || '').trim();
  const p3 = normalizeDigits(document.getElementById('platePart3')?.value || '').trim();

  const hiddenInput = document.getElementById('settingPlate');
  if (hiddenInput) {
    hiddenInput.value = `${p1} ${letter} ${p2} ایران ${p3}`;
  }
}

function syncPlateFromValue(plateStr) {
  if (!plateStr) plateStr = '۱۲ ع ۳۴۵ ایران ۲۱';
  const clean = normalizeDigits(plateStr).trim();
  
  const tokens = clean.split(/\s+/);
  let p1 = '12', letter = 'ع', p2 = '345', p3 = '21';

  if (tokens.length >= 4) {
    p1 = tokens[0].replace(/[^0-9]/g, '');
    letter = tokens[1];
    p2 = tokens[2].replace(/[^0-9]/g, '');
    p3 = tokens[tokens.length - 1].replace(/[^0-9]/g, '');
  } else {
    const match = clean.match(/(\d{2})\s*([^\d\s]+)\s*(\d{3})\s*(?:ایران)?\s*(\d{2})/);
    if (match) {
      p1 = match[1];
      letter = match[2];
      p2 = match[3];
      p3 = match[4];
    }
  }

  const p1El = document.getElementById('platePart1');
  const letEl = document.getElementById('plateLetter');
  const p2El = document.getElementById('platePart2');
  const p3El = document.getElementById('platePart3');
  const hiddenEl = document.getElementById('settingPlate');

  if (p1El) p1El.value = p1;
  if (letEl) {
    let hasOption = false;
    for (let opt of letEl.options) {
      if (opt.value === letter) {
        hasOption = true;
        break;
      }
    }
    letEl.value = hasOption ? letter : 'ع';
  }
  if (p2El) p2El.value = p2;
  if (p3El) p3El.value = p3;
  if (hiddenEl) hiddenEl.value = `${p1} ${letter} ${p2} ایران ${p3}`;
}

function openSettingsModal() {
  const s = appState.settings || {};
  document.getElementById('settingOwner').value = s.owner_name || '';
  document.getElementById('settingDriver').value = s.driver_name || '';
  document.getElementById('settingPlate').value = s.plate_number || '';
  syncPlateFromValue(s.plate_number || '۱۲ ع ۳۴۵ ایران ۲۱');
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

// --- Submissions With Double-Click & Duplicate Protection & Local-First Offline Sync ---
async function handleTripSubmit(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.classList.add('btn-loading');
    submitBtn.textContent = 'در حال ذخیره...';
  }

  try {
    const data = {
      id: Date.now(),
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

    const pct = (appState.settings && appState.settings.driver_share_percent) || 20.0;
    const basis = (appState.settings && appState.settings.driver_share_basis) || 'net';
    const netFreight = Math.max(0, data.total_freight - data.commission_fee);
    const driverShareAmount = basis === 'gross'
      ? Math.round((data.total_freight * pct) / 100)
      : Math.round((netFreight * pct) / 100);

    data.net_freight = netFreight;
    data.driver_share_percent = pct;
    data.driver_share_amount = driverShareAmount;
    data.owner_share_amount = Math.max(0, netFreight - driverShareAmount);
    data.is_settled = false;
    data.created_at = getTodayShamsi();

    // 1. Save to LocalDB immediately - Guaranteed offline persistence!
    const trips = LocalDB.get(LocalDB.KEYS.TRIPS);
    trips.unshift(data);
    LocalDB.set(LocalDB.KEYS.TRIPS, trips);

    closeModal('modalTrip');
    await loadAllData();
    showToast('بارنامه با موفقیت ثبت شد!');

    // 2. Non-blocking background API sync
    fetch('/api/trips', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Role': appState.role
      },
      body: JSON.stringify(data)
    }).then(r => r.json()).then(respData => {
      if (respData && respData.trip && respData.trip.id) {
        data.server_id = respData.trip.id;
      }
    }).catch(() => {});
  } catch (err) {
    console.error('Error in handleTripSubmit:', err);
    alert('خطا در ذخیره بارنامه: ' + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('btn-loading');
      submitBtn.textContent = 'ذخیره بارنامه';
    }
  }
}

async function handleExpenseSubmit(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.classList.add('btn-loading');
    submitBtn.textContent = 'در حال ذخیره...';
  }

  try {
    let receiptImage = null;
    const fileInput = document.getElementById('expReceiptFile');
    if (fileInput && fileInput.files.length > 0) {
      try {
        const compressedBlob = await compressImageClientSide(fileInput.files[0]);
        receiptImage = await blobToBase64(compressedBlob);
      } catch (err) {
        console.warn('Image processing notice:', err);
      }
    }

    const paidBy = appState.role === 'driver' ? 'driver' : (document.querySelector('input[name="expPaidBy"]:checked')?.value || 'driver');
    const data = {
      id: Date.now(),
      trip_id: document.getElementById('expTripId').value || null,
      category: document.getElementById('expCategory').value,
      amount: parseCleanInt(document.getElementById('expAmount').value),
      paid_by: paidBy,
      liability: 'owner_machine',
      expense_date: normalizeDigits(document.getElementById('expDate').value) || getTodayShamsi(),
      description: document.getElementById('expDesc').value.trim(),
      receipt_image: receiptImage,
      is_settled: false,
      created_at: getTodayShamsi()
    };

    // 1. Immediately save to LocalDB - Guaranteed persistence!
    const expenses = LocalDB.get(LocalDB.KEYS.EXPENSES);
    expenses.unshift(data);
    LocalDB.set(LocalDB.KEYS.EXPENSES, expenses);

    closeModal('modalExpense');
    await loadAllData();
    showToast('هزینه با موفقیت در حافظه گوشی ذخیره شد!');

    // 2. Non-blocking background sync only if backend available
    if (!isStaticHost()) {
      fetch('/api/expenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Role': appState.role
        },
        body: JSON.stringify(data)
      }).catch(() => {});
    }
  } catch (err) {
    console.error('Error in handleExpenseSubmit:', err);
    alert('خطا در ثبت هزینه: ' + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('btn-loading');
      submitBtn.textContent = 'ثبت هزینه';
    }
  }
}

async function handlePaymentSubmit(e, isDuplicateConfirmed = false) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.classList.add('btn-loading');
    submitBtn.textContent = 'در حال ثبت...';
  }

  try {
    let receiptImage = null;
    const fileInput = document.getElementById('payReceiptFile');
    if (fileInput && fileInput.files.length > 0) {
      try {
        const compressedBlob = await compressImageClientSide(fileInput.files[0]);
        receiptImage = await blobToBase64(compressedBlob);
      } catch (err) {
        console.warn('Receipt upload notice:', err);
      }
    }

    let payer = 'driver';
    let isApproved = false;
    if (appState.role === 'owner') {
      const radio = document.querySelector('input[name="payPayerRadio"]:checked');
      payer = radio ? radio.value : 'owner';
      isApproved = true;
    }

    const trackingCode = normalizeDigits(document.getElementById('payTracking').value);

    // Duplicate tracking code check
    if (trackingCode && !isDuplicateConfirmed) {
      const existing = LocalDB.get(LocalDB.KEYS.PAYMENTS).find(p => p.tracking_code === trackingCode);
      if (existing) {
        if (!confirm(`هشدار: کد پیگیری «${trackingCode}» قبلاً برای واریزی مبلغ ${formatToman(existing.amount)} تومان ثبت شده است.\nآیا مطمئن هستید که این یک تراکنش مجدد است؟`)) {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('btn-loading');
            submitBtn.textContent = 'ثبت واریزی';
          }
          return;
        }
      }
    }

    const data = {
      id: Date.now(),
      payer: payer,
      amount: parseCleanInt(document.getElementById('payAmount').value),
      payment_date: normalizeDigits(document.getElementById('payDate').value) || getTodayShamsi(),
      payment_method: document.getElementById('payMethod').value,
      tracking_code: trackingCode,
      description: document.getElementById('payDesc').value.trim(),
      receipt_image: receiptImage,
      is_approved: isApproved,
      is_settled: false,
      confirm_duplicate: isDuplicateConfirmed,
      created_at: getTodayShamsi()
    };

    // 1. Immediately save to LocalDB
    const payments = LocalDB.get(LocalDB.KEYS.PAYMENTS);
    payments.unshift(data);
    LocalDB.set(LocalDB.KEYS.PAYMENTS, payments);

    closeModal('modalPayment');
    await loadAllData();
    showToast(isApproved ? 'واریزی با موفقیت در حافظه گوشی ثبت شد!' : 'واریزی ثبت شد و پس از تایید مالک در حساب اعمال خواهد شد.');

    // 2. Non-blocking background API sync only if backend available
    if (!isStaticHost()) {
      fetch('/api/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Role': appState.role
        },
        body: JSON.stringify(data)
      }).catch(() => {});
    }
  } catch (err) {
    console.error('Error in handlePaymentSubmit:', err);
    alert('خطا در ثبت واریزی: ' + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('btn-loading');
      submitBtn.textContent = 'ثبت واریزی';
    }
  }
}

// --- Payment Verification Actions for Owner ---
async function approvePayment(id) {
  if (appState.role !== 'owner') return;

  const payments = LocalDB.get(LocalDB.KEYS.PAYMENTS);
  const p = payments.find(item => String(item.id) === String(id));
  if (p) p.is_approved = true;
  LocalDB.set(LocalDB.KEYS.PAYMENTS, payments);

  await loadAllData();
  showToast('واریزی راننده با موفقیت تایید شد و به عنوان طلب او در حساب اعمال گردید.');

  if (!isStaticHost()) {
    fetch(`/api/payments/${id}/approve`, {
      method: 'POST',
      headers: { 'X-Role': 'owner' }
    }).catch(() => {});
  }
}

async function rejectPayment(id) {
  if (appState.role !== 'owner') return;
  if (!confirm('آیا مطمئن هستید که این واریزی به حسابتان نیامده و می‌خواهید آن را رد و حذف کنید؟')) return;

  const payments = LocalDB.get(LocalDB.KEYS.PAYMENTS).filter(item => String(item.id) !== String(id));
  LocalDB.set(LocalDB.KEYS.PAYMENTS, payments);

  await loadAllData();
  showToast('واریزی رد و از سیستم حذف گردید.');

  if (!isStaticHost()) {
    fetch(`/api/payments/${id}/reject`, {
      method: 'POST',
      headers: { 'X-Role': 'owner' }
    }).catch(() => {});
  }
}

async function handleSettingsSubmit(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;

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
  else data.owner_pin = (appState.settings && appState.settings.owner_pin) || '1234';

  // 1. Immediately save to LocalDB
  LocalDB.set(LocalDB.KEYS.SETTINGS, data);
  appState.settings = data;

  closeModal('modalSettings');
  await loadAllData();
  showToast('تنظیمات با موفقیت در حافظه گوشی ذخیره شد!');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'ذخیره تنظیمات';
  }

  // 2. Background sync
  if (!isStaticHost()) {
    fetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Role': appState.role
      },
      body: JSON.stringify(data)
    }).catch(() => {});
  }
}

// --- Deletions ---
async function deleteTrip(id) {
  if (appState.role !== 'owner') return;
  if (!confirm('آیا از حذف این بارنامه مطمئن هستید؟')) return;
  const trips = LocalDB.get(LocalDB.KEYS.TRIPS).filter(t => String(t.id) !== String(id));
  LocalDB.set(LocalDB.KEYS.TRIPS, trips);
  await loadAllData();
  showToast('بارنامه حذف گردید.');
  if (!isStaticHost()) {
    fetch(`/api/trips/${id}`, { method: 'DELETE', headers: { 'X-Role': 'owner' } }).catch(() => {});
  }
}

async function deleteExpense(id) {
  if (appState.role !== 'owner') return;
  if (!confirm('آیا از حذف این هزینه مطمئن هستید؟')) return;
  const expenses = LocalDB.get(LocalDB.KEYS.EXPENSES).filter(e => String(e.id) !== String(id));
  LocalDB.set(LocalDB.KEYS.EXPENSES, expenses);
  await loadAllData();
  showToast('هزینه حذف گردید.');
  if (!isStaticHost()) {
    fetch(`/api/expenses/${id}`, { method: 'DELETE', headers: { 'X-Role': 'owner' } }).catch(() => {});
  }
}

async function deletePayment(id) {
  if (appState.role !== 'owner') return;
  if (!confirm('آیا از حذف این واریزی مطمئن هستید؟')) return;
  const payments = LocalDB.get(LocalDB.KEYS.PAYMENTS).filter(p => String(p.id) !== String(id));
  LocalDB.set(LocalDB.KEYS.PAYMENTS, payments);
  await loadAllData();
  showToast('واریزی حذف گردید.');
  if (!isStaticHost()) {
    fetch(`/api/payments/${id}`, { method: 'DELETE', headers: { 'X-Role': 'owner' } }).catch(() => {});
  }
}

// --- Service & Workshop Maintenance Management ---
const SERVICE_TYPE_CONFIGS = {
  'تعویض روغن موتور و فیلترها': {
    category: 'service',
    interval: 35000,
    suggestLabel: '+ ۳۵,۰۰۰ کیلومتر پیشنهاد روغن دیزل',
    hint: 'فاصله استاندارد روغن توربو دیزل معمولاً ۳۰ تا ۳۵ هزار کیلومتر است.',
    modalTitle: '🛢️ ثبت تعویض روغن موتور و فیلترها',
    specLabel: 'برند و مشخصات روغن مصرفی *',
    specPlaceholder: 'مثلاً بهران توربو دیزل 15W-40، ایرانول D-40000 یا توتال',
    specHint: 'نام برند و گرید ویسکوزیته روغن را وارد کنید.',
    checkboxLabel: 'فیلترهای تعویض شده:',
    checkboxes: [
      { id: 'chk_filter_oil', label: 'فیلتر روغن', checked: true },
      { id: 'chk_filter_fuel', label: 'فیلتر گازوئیل', checked: true },
      { id: 'chk_filter_air', label: 'فیلتر هوا', checked: true },
      { id: 'chk_filter_water', label: 'فیلتر آبگیر گازوئیل', checked: false }
    ],
    shopLabel: 'نام تعویض روغنی و آدرس',
    shopPlaceholder: 'مثلاً تعویض روغنی پایانه بندرعباس',
    receiptLabel: 'عکس فاکتور تعویض روغنی',
    btnText: 'ذخیره در دفترچه سرویس روغن',
    btnBg: '#0284c7',
    icon: '🛢️'
  },

  'واسکازین گیربکس و دیفرانسیل': {
    category: 'service',
    interval: 80000,
    suggestLabel: '+ ۸۰,۰۰۰ کیلومتر پیشنهاد واسکازین',
    hint: 'واسکازین باکیفیت گیربکس و دف معمولاً هر ۸۰ تا ۱۰۰ هزار کیلومتر تعویض می‌شود.',
    modalTitle: '⚙️ ثبت تعویض واسکازین گیربکس و دیفرانسیل',
    specLabel: 'برند و گرید واسکازین *',
    specPlaceholder: 'مثلاً توتال 75W-80، شل اسپیرکس، بهران سمند 85W-140',
    specHint: 'سطح گرانروی و استانداردهای EP را درج نمایید.',
    checkboxLabel: 'اقدامات تعویض واسکازین:',
    checkboxes: [
      { id: 'chk_vask_gearbox', label: 'واسکازین گیربکس', checked: true },
      { id: 'chk_vask_diff', label: 'واسکازین کله دیفرانسیل', checked: true },
      { id: 'chk_vask_filter', label: 'فیلتر هیدرولیک گیربکس', checked: true },
      { id: 'chk_vask_gasket', label: 'واشر پیچ تخلیه و تمیزکاری مگنت', checked: true }
    ],
    shopLabel: 'نام تعویض روغنی یا مکانیکی',
    shopPlaceholder: 'مثلاً تعویض روغنی تخصصی گیربکس پایانه',
    receiptLabel: 'عکس فاکتور واسکازین',
    btnText: 'ذخیره سابقه واسکازین',
    btnBg: '#0284c7',
    icon: '⚙️'
  },

  'گریس‌کاری کامل چرخ‌ها و شاسی': {
    category: 'service',
    interval: 15000,
    suggestLabel: '+ ۱۵,۰۰۰ کیلومتر پیشنهاد گریس‌کاری',
    hint: 'گریس‌کاری کلیه گریس‌خورها هر ۱۰ تا ۱۵ هزار کیلومتر از فرسایش قطعات جلوگیری می‌کند.',
    modalTitle: '🧈 ثبت گریس‌کاری کامل چرخ‌ها و شاسی',
    specLabel: 'نوع و برند گریس مصرفی *',
    specPlaceholder: 'مثلاً گریس نسوز پایه لیتیم کمپلکس آبی/قرمز بهران یا SKF',
    specHint: 'گریس نسوز برای بلبرینگ‌ها و شاسی تریلی توصیه می‌شود.',
    checkboxLabel: 'نقاط گریس‌کاری شده:',
    checkboxes: [
      { id: 'chk_grease_cardan', label: 'چهارشاخ گاردان و شفت', checked: true },
      { id: 'chk_grease_steering', label: 'سیبک‌ها و شغال‌دست فرمان', checked: true },
      { id: 'chk_grease_5thwheel', label: 'ریش تریلی (چرخ پنجم)', checked: true },
      { id: 'chk_grease_brakes', label: 'جغجغه‌ها و میل ترمز', checked: true },
      { id: 'chk_grease_kingpin', label: 'شاه‌پین، قامه و مندل', checked: true }
    ],
    shopLabel: 'نام مرکز گریس‌کاری / آپاراتی',
    shopPlaceholder: 'مثلاً گریس‌کاری پایانه سیرجان',
    receiptLabel: 'عکس فیش یا فاکتور گریس‌کاری',
    btnText: 'ذخیره سابقه گریس‌کاری',
    btnBg: '#0284c7',
    icon: '🧈'
  },

  'فیلتر خشک‌کن باد و رطوبت‌گیر': {
    category: 'service',
    interval: 50000,
    suggestLabel: '+ ۵۰,۰۰۰ کیلومتر پیشنهاد خشک‌کن',
    hint: 'کارتریج خشک‌کن باد تریلی باید سالیانه یا هر ۵۰ هزار کیلومتر تعویض شود.',
    modalTitle: '💨 ثبت تعویض فیلتر خشک‌کن باد (APU)',
    specLabel: 'برند و مدل کارتریج خشک‌کن *',
    specPlaceholder: 'مثلاً کارتریج وابکو (WABCO) اصلی با روغن‌گیر یا کنور Knorr',
    specHint: 'کارتریج اصلی مانع از نفوذ رطوبت و روغن به بوسترهای ترمز می‌شود.',
    checkboxLabel: 'اقدامات سیستم باد:',
    checkboxes: [
      { id: 'chk_apu_dryer', label: 'تعویض کارتریج خشک‌کن باد', checked: true },
      { id: 'chk_apu_valve', label: 'تست سوپاپ چهارمداره', checked: true },
      { id: 'chk_apu_tanks', label: 'تخلیه آب و روغن مخازن باد', checked: true },
      { id: 'chk_apu_oring', label: 'تعویض اورینگ و واشر آب‌بندی', checked: true }
    ],
    shopLabel: 'تعمیرگاه سیستم باد و ترمز',
    shopPlaceholder: 'مثلاً تعمیرگاه باد و ترمز تخصصی ولوو',
    receiptLabel: 'عکس فاکتور فیلتر خشک‌کن',
    btnText: 'ذخیره سرویس خشک‌کن باد',
    btnBg: '#0284c7',
    icon: '💨'
  },

  'تعویض فیلترها': {
    category: 'service',
    interval: 20000,
    suggestLabel: '+ ۲۰,۰۰۰ کیلومتر پیشنهاد فیلتر',
    hint: 'تعویض زودهنگام فیلتر هوا و گازوئیل برای جاده‌های پرگردوغبار توصیه می‌شود.',
    modalTitle: '🔄 ثبت تعویض فیلترهای تریلی',
    specLabel: 'برند و مارک فیلترها *',
    specPlaceholder: 'مثلاً فیلتر مان (MANN)، بالدوین یا کاج',
    specHint: 'مارک و مدل فیلترهای جایگزین شده را بنویسید.',
    checkboxLabel: 'فیلترهای تعویض شده:',
    checkboxes: [
      { id: 'chk_f_oil', label: 'فیلتر روغن اصلی', checked: false },
      { id: 'chk_f_fuel', label: 'فیلتر اولیه و ثانویه گازوئیل', checked: true },
      { id: 'chk_f_air', label: 'فیلتر هوای اصلی و ایمنی', checked: true },
      { id: 'chk_f_water', label: 'فیلتر آبگیر سوخت (سپراتور)', checked: true }
    ],
    shopLabel: 'فروشگاه فیلتر یا تعویض روغنی',
    shopPlaceholder: 'مثلاً فیلترسرای پایانه تهران',
    receiptLabel: 'عکس فاکتور فیلترها',
    btnText: 'ذخیره فیلترهای تعویض شده',
    btnBg: '#0284c7',
    icon: '🔄'
  },

  'سرویس دوره‌ای کامل': {
    category: 'service',
    interval: 35000,
    suggestLabel: '+ ۳۵,۰۰۰ کیلومتر سرویس جامع',
    hint: 'سرویس آچارکشی، تعویض روغن، فیلترها و بررسی چرخ‌ها و مایعات.',
    modalTitle: '🔧 ثبت سرویس دوره‌ای و آچارکشی کامل',
    specLabel: 'شرح موارد مصرفی سرویس *',
    specPlaceholder: 'مثلاً روغن موتور + کلیه فیلترها + گریس‌کاری + ضدیخ',
    specHint: 'اقلام مصرفی را قید فرمایید.',
    checkboxLabel: 'چک‌لیست سرویس دوره‌ای:',
    checkboxes: [
      { id: 'chk_all_oil', label: 'تعویض روغن و تمام فیلترها', checked: true },
      { id: 'chk_all_grease', label: 'گریس‌کاری کامل اتصالات', checked: true },
      { id: 'chk_all_tight', label: 'آچارکشی پیچ‌های چرخ و کرپی', checked: true },
      { id: 'chk_all_fluid', label: 'بازدید آب رادیاتور و روغن هیدرولیک', checked: true }
    ],
    shopLabel: 'تعمیرگاه یا پایانه سرویس',
    shopPlaceholder: 'مثلاً مرکز سرویس دیزل خلیج فارس',
    receiptLabel: 'عکس فاکتور سرویس جامع',
    btnText: 'ذخیره سرویس دوره‌ای جامع',
    btnBg: '#0284c7',
    icon: '🔧'
  },

  // ----------------- Workshop & Repairs (تعمیرگاه و قطعات) -----------------
  'سرویس کامل چرخ‌ها (بلبرینگ، کاسه‌نمد و رینگ)': {
    category: 'repair',
    interval: 40000,
    suggestLabel: '+ ۴۰,۰۰۰ کیلومتر پیشنهاد سرویس چرخ',
    hint: 'سرویس چرخ تریلی شامل شستشوی بلبرینگ‌ها با گازوئیل، گریس نسوز تخصصی، تعویض کاسه‌نمد و آچارکشی مهره‌هاست.',
    modalTitle: '🛞 ثبت سرویس تخصصی چرخ‌ها و بلبرینگ‌ها',
    specLabel: 'مارک بلبرینگ، کاسه‌نمد و گریس مصرفی *',
    specPlaceholder: 'مثلاً بلبرینگ SKF/تیمکن، کاسه‌نمد کورتیکو، گریس نسوز چرخ پارس یا توتال',
    specHint: 'برند بلبرینگ و کاسه‌نمد چرخ‌ها و گریس نسوز را بنویسید.',
    checkboxLabel: 'اقدامات سرویس کامل چرخ‌ها:',
    checkboxes: [
      { id: 'chk_wh_wash', label: 'شستشوی کامل بلبرینگ‌ها با گازوئیل و بادگیری', checked: true },
      { id: 'chk_wh_grease', label: 'گریس‌کاری با گریس نسوز تخصصی چرخ سنگین', checked: true },
      { id: 'chk_wh_seals', label: 'تعویض کاسه‌نمدهای نو چرخ‌ها', checked: true },
      { id: 'chk_wh_bearing', label: 'تعویض بلبرینگ معیوب / لب‌پریده / سوخته', checked: false },
      { id: 'chk_wh_torque', label: 'آچارکشی و تورک‌کشی مهره‌های چرخ و رینگ', checked: true },
      { id: 'chk_wh_drum', label: 'بازدید سلامت کاسه‌چرخ، لنت و دیسک ترمز', checked: true }
    ],
    shopLabel: 'نام چرخ‌ساز یا مکانیکی چرخ تریلی',
    shopPlaceholder: 'مثلاً چرخ‌سازی و بلبرینگ استاد اصغر - پایانه',
    receiptLabel: 'عکس فاکتور قطعات چرخ و دستمزد',
    btnText: 'ثبت در دفترچه سرویس چرخ‌ها',
    btnBg: '#0284c7',
    icon: '🛞'
  },

  'سرویس و تعویض لنت ترمز و چرخ‌ها': {
    category: 'repair',
    interval: 60000,
    suggestLabel: '+ ۶۰,۰۰۰ کیلومتر پیشنهاد لنت',
    hint: 'لنت باکیفیت و تراش استاندارد دیسک/کاسه برای ایمنی تریلی در گردنه‌ها حیاتی است.',
    modalTitle: '🛑 ثبت تعمیرگاه: سرویس و تعویض لنت ترمز',
    specLabel: 'مارک لنت و مشخصات دیسک/کاسه *',
    specPlaceholder: 'مثلاً لنت تکستار اصلی آلمانی، پارس، رنو/ولوو',
    specHint: 'مارک لنت و محورهایی که لنت آنها تعویض شده را بنویسید.',
    checkboxLabel: 'اقدامات چرخ و ترمز:',
    checkboxes: [
      { id: 'chk_brk_front', label: 'لنت چرخ‌های فرمان (جلو)', checked: true },
      { id: 'chk_brk_drive', label: 'لنت محور محرک (دیفرانسیل)', checked: true },
      { id: 'chk_brk_trailer', label: 'لنت چرخ‌های تریلر (کفی/کمپرسی)', checked: false },
      { id: 'chk_brk_drum', label: 'تراشکاری دیسک / کاسه‌چرخ', checked: true },
      { id: 'chk_brk_bearing', label: 'بازدید بلبرینگ و تعویض کاسه‌نمد', checked: true }
    ],
    shopLabel: 'نام لنت‌کوبی / مکانیکی چرخ تریلی',
    shopPlaceholder: 'مثلاً لنت‌کوبی استاد داوود - پایانه',
    receiptLabel: 'عکس فاکتور لنت و دستمزد',
    btnText: 'ثبت در سوابق تعمیرگاه ترمز',
    btnBg: '#ea580c',
    icon: '🛑'
  },

  'تعمیرگاه تخصصی موتور و سرسیلندر': {
    category: 'repair',
    interval: 150000,
    suggestLabel: '+ ۱۵۰,۰۰۰ کیلومتر بازدید بعدی',
    hint: 'تعمیرات موتور شامل یاتاقان، سوپاپ، سرسیلندر، واترپمپ و کیت‌های اورهال.',
    modalTitle: '🔧 ثبت تعمیرگاه: تعمیرات تخصصی موتور و سیلندر',
    specLabel: 'قطعات تعویضی و شرح تعمیر موتور *',
    specPlaceholder: 'مثلاً تعویض یاتاقان ثابت و متحرک، واشر سرسیلندر، بوش و پیستون، واترپمپ',
    specHint: 'قطعات خریداری شده و اقدامات مکانیک را قید کنید.',
    checkboxLabel: 'تاییدیه قطعات و تضمین کار:',
    checkboxes: [
      { id: 'chk_eng_genuine', label: 'قطعات اصلی و اورجینال نصب شد', checked: true },
      { id: 'chk_eng_scrap', label: 'داغی قطعات کهنه تحویل گرفته شد', checked: true },
      { id: 'chk_eng_gasket', label: 'واشر سرسیلندر و ترموستات نو', checked: true },
      { id: 'chk_eng_warranty', label: 'دارای ضمانت کارکرد و مهلت تست مکانیک', checked: true }
    ],
    shopLabel: 'نام تعمیرگاه و استادکار مکانیک',
    shopPlaceholder: 'مثلاً تعمیرگاه تخصصی دیزل استاد رضا - پایانه',
    receiptLabel: 'عکس فاکتور قطعات یدکی و دستمزد مکانیک',
    btnText: 'ثبت در سوابق تعمیرگاه موتور',
    btnBg: '#ea580c',
    icon: '🔧'
  },

  'تعمیرگاه گیربکس، دیسک و صفحه کلاچ': {
    category: 'repair',
    interval: 120000,
    suggestLabel: '+ ۱۲۰,۰۰۰ کیلومتر پیشنهاد کلاچ',
    hint: 'دیسک و صفحه، بلبرینگ کلاچ، دوشاخه، ماهک و چرخ‌دنده‌های گیربکس.',
    modalTitle: '⚙️ ثبت تعمیرگاه: گیربکس، دیسک و صفحه کلاچ',
    specLabel: 'مارک کیت کلاچ و قطعات تعویضی *',
    specPlaceholder: 'مثلاً کیت کلاچ کامل ساچ (SACHS) یا والئو، بلبرینگ کلاچ، پمپ کلاچ',
    specHint: 'برند دیسک و صفحه و شماره فنی قطعات را وارد کنید.',
    checkboxLabel: 'اقدامات تعویض کلاچ و گیربکس:',
    checkboxes: [
      { id: 'chk_clutch_kit', label: 'تعویض دیسک و صفحه کلاچ نو', checked: true },
      { id: 'chk_clutch_bearing', label: 'تعویض بلبرینگ کلاچ و دوشاخه', checked: true },
      { id: 'chk_clutch_flywheel', label: 'تراشکاری و تنظیم فلایویل', checked: true },
      { id: 'chk_clutch_pump', label: 'تعویض یا تعمیر پمپ کلاچ بالا/پایین', checked: false },
      { id: 'chk_clutch_test', label: 'تست در سربالایی با بار کامل', checked: true }
    ],
    shopLabel: 'نام تعمیرگاه تخصصی گیربکس',
    shopPlaceholder: 'مثلاً گیربکس‌سازی برادران اکبری - پایانه',
    receiptLabel: 'عکس فاکتور کیت کلاچ و دستمزد',
    btnText: 'ثبت در سوابق تعمیرگاه کلاچ',
    btnBg: '#ea580c',
    icon: '⚙️'
  },

  'پمپ و انژکتور، سوپرشارژر و توربو': {
    category: 'repair',
    interval: 100000,
    suggestLabel: '+ ۱۰۰,۰۰۰ کیلومتر پیشنهاد سوخت/توربو',
    hint: 'تنظیم پمپ انژکتور، کالیبراسیون سوزن‌ها و سلامت توربوشارژر راندمان مصرف سوخت را تضمین می‌کند.',
    modalTitle: '💨 ثبت تعمیرگاه: پمپ، سوزن انژکتور و سوپرشارژر',
    specLabel: 'شرح قطعات پمپ و انژکتور / توربو *',
    specPlaceholder: 'مثلاً تعویض ۶ عدد سوزن انژکتور بوش اصلی، تعمیر واترکولر، کارتریج توربو',
    specHint: 'کد سوزن‌ها یا قطعات سوپرشارژ را بنویسید.',
    checkboxLabel: 'اقدامات پمپ‌سازی و سوخت‌رسانی:',
    checkboxes: [
      { id: 'chk_inj_needles', label: 'تعویض سوزن‌های انژکتور', checked: true },
      { id: 'chk_inj_bench', label: 'تست و تنظیم روی دستگاه کالیبراسیون', checked: true },
      { id: 'chk_inj_turbo', label: 'تعویض کارتریج یا بالانس پره سوپرشارژر', checked: false },
      { id: 'chk_inj_diag', label: 'دیاگ کامل و رفع خطای سیستم انژکتور', checked: true }
    ],
    shopLabel: 'نام مرکز پمپ‌سازی و دیاگ دیزل',
    shopPlaceholder: 'مثلاً پمپ‌سازی دیزل خاورمیانه',
    receiptLabel: 'عکس فاکتور پمپ‌سازی و تست دستگاه',
    btnText: 'ثبت در سوابق پمپ و توربو',
    btnBg: '#ea580c',
    icon: '💨'
  },

  'باطری‌سازی، دینام، استارت و برق': {
    category: 'repair',
    interval: 80000,
    suggestLabel: '+ ۸۰,۰۰۰ کیلومتر بازدید باطری/دینام',
    hint: 'باطری‌های ۲۲۰ آمپر سنگین، آفتامات و دیود دینام، رله‌ها و سیستم روشنایی تریلی.',
    modalTitle: '⚡ ثبت تعمیرگاه: باطری، دینام، استارت و برق',
    specLabel: 'مشخصات باطری و قطعات برقی تعویض شده *',
    specPlaceholder: 'مثلاً ۲ عدد باطری ۲۲۰ آمپر صبا/اوربیتال با ۱ سال گارانتی، آفتامات دینام',
    specHint: 'آمپراژ باطری و قطعات برقی نصب شده را یادداشت کنید.',
    checkboxLabel: 'اقدامات باطری‌سازی و برق:',
    checkboxes: [
      { id: 'chk_elec_battery', label: 'باطری اتمی نو با برگه گارانتی معتبر', checked: true },
      { id: 'chk_elec_alt', label: 'سرویس دینام و تعویض زغال/آفتامات', checked: false },
      { id: 'chk_elec_start', label: 'سرویس استارت و تعویض اتوماتیک', checked: false },
      { id: 'chk_elec_volt', label: 'تست ولتاژ دینام (۲۸ ولت استاندارد)', checked: true }
    ],
    shopLabel: 'نام باطری‌سازی یا برق خودرو سنگین',
    shopPlaceholder: 'مثلاً باطری‌سازی و برق تخصصی پایانه',
    receiptLabel: 'عکس فاکتور باطری و کارت ضمانت‌نامه',
    btnText: 'ثبت در سوابق برق و باطری',
    btnBg: '#ea580c',
    icon: '⚡'
  },

  'آهنگری، زیربندی، مندل و فنرها': {
    category: 'repair',
    interval: 70000,
    suggestLabel: '+ ۷۰,۰۰۰ کیلومتر پیشنهاد زیربندی',
    hint: 'شاه‌فنرها، قامه و بوش‌های برنجی، کمک‌فنرها، بالن‌های باد و مندل تریلی.',
    modalTitle: '🔩 ثبت تعمیرگاه: آهنگری، زیربندی، مندل و فنرها',
    specLabel: 'شرح لایه‌های فنر و قطعات زیربندی *',
    specPlaceholder: 'مثلاً تعویض لایه ۱ و ۲ شاه‌فنر کله، بوش قامه برنجی، بازویی مندل، بالن باد',
    specHint: 'قطعات آهنگری و زیربندی تعویض شده را بنویسید.',
    checkboxLabel: 'اقدامات آهنگری و زیربندی:',
    checkboxes: [
      { id: 'chk_susp_springs', label: 'بادگیری و تقویت لایه‌های فنر', checked: true },
      { id: 'chk_susp_bushings', label: 'تعویض بوش‌ها و مهره‌های کرپی', checked: true },
      { id: 'chk_susp_mandrel', label: 'تنظیم مندل و هم‌راستایی اکسل‌ها', checked: true },
      { id: 'chk_susp_shocks', label: 'تعویض کمک‌فنرها یا بالن کیسه باد', checked: false }
    ],
    shopLabel: 'نام آهنگری و فنرسازی سنگین',
    shopPlaceholder: 'مثلاً آهنگری و فنرسازی پایانه',
    receiptLabel: 'عکس فاکتور فنر و دستمزد آهنگری',
    btnText: 'ثبت در سوابق زیربندی و فنر',
    btnBg: '#ea580c',
    icon: '🔩'
  },

  'لاستیک، رینگ، بالانس و پنچری': {
    category: 'repair',
    interval: 100000,
    suggestLabel: '+ ۱۰۰,۰۰۰ کیلومتر پیشنهاد تایر',
    hint: 'لاستیک‌های فرمان (نو باکیفیت)، دیفرانسیل و تریلر، بالانس و جابجایی ضربدری.',
    modalTitle: '🛞 ثبت لاستیک، رینگ و پنچری سنگین',
    specLabel: 'سایز، برند و مشخصات لاستیک *',
    specPlaceholder: 'مثلاً یک جفت ۳۱۵/۸۰R۲۲.۵ میشلن یا بارز سیمی، ۱۸ لایه',
    specHint: 'سایز، برند، کشور سازنده یا شماره سریال را بنویسید.',
    checkboxLabel: 'موقعیت و اقدامات لاستیک:',
    checkboxes: [
      { id: 'chk_tire_steer', label: 'محور فرمان (جلو کله)', checked: false },
      { id: 'chk_tire_drive', label: 'محور محرک (دیفرانسیل کله)', checked: true },
      { id: 'chk_tire_trailer', label: 'محورهای تریلر (سه محور کفی)', checked: false },
      { id: 'chk_tire_balance', label: 'بالانس چرخ و تعویض والف نو', checked: true }
    ],
    shopLabel: 'فروشگاه لاستیک / آپاراتی سنگین',
    shopPlaceholder: 'مثلاً لاستیک‌فروشی برادران رضایی - پایانه',
    receiptLabel: 'عکس فاکتور خرید لاستیک',
    btnText: 'ثبت در دفترچه لاستیک و چرخ',
    btnBg: '#ea580c',
    icon: '🛞'
  },

  'تعمیرگاه عمومی و متفرقه تریلی': {
    category: 'repair',
    interval: 30000,
    suggestLabel: '+ ۳۰,۰۰۰ کیلومتر بازدید عمومی',
    hint: 'تعمیرات بدنه، جوشکاری شاسی، رادیاتور و بخاری، باک گازوئیل، اتاق و متفرقه.',
    modalTitle: '🛠️ ثبت تعمیرگاه عمومی و متفرقه تریلی',
    specLabel: 'شرح کار و قطعات خریداری شده *',
    specPlaceholder: 'مثلاً جوشکاری شاسی، تعمیر و شستشوی رادیاتور آب، تعویض تسمه پروانه',
    specHint: 'جزئیات تعمیرات صورت گرفته را درج نمایید.',
    checkboxLabel: 'تاییدیه قطعات و اجرت:',
    checkboxes: [
      { id: 'chk_gen_parts', label: 'قطعات یدکی نو خریداری شد', checked: true },
      { id: 'chk_gen_scrap', label: 'داغی قطعه کهنه تحویل گرفته شد', checked: true },
      { id: 'chk_gen_test', label: 'تست جاده و تایید عملکرد توسط راننده', checked: true }
    ],
    shopLabel: 'نام تعمیرگاه یا مکانیک و شهر',
    shopPlaceholder: 'مثلاً مکانیکی شهرک کامیون‌داران',
    receiptLabel: 'عکس فاکتور تعمیرگاه',
    btnText: 'ثبت در سوابق تعمیرگاه عمومی',
    btnBg: '#ea580c',
    icon: '🛠️'
  }
};

function setModalServiceMode(mode) {
  const isRepair = mode === 'repair';
  const categoryInput = document.getElementById('serviceCategory');
  if (categoryInput) categoryInput.value = isRepair ? 'repair' : 'service';

  const tabService = document.getElementById('tabModalModeService');
  const tabRepair = document.getElementById('tabModalModeRepair');
  if (tabService) tabService.className = `mode-tab-btn ${isRepair ? '' : 'active-service'}`;
  if (tabRepair) tabRepair.className = `mode-tab-btn ${isRepair ? 'active-repair' : ''}`;

  const select = document.getElementById('serviceType');
  if (select) {
    if (isRepair) {
      if (!SERVICE_TYPE_CONFIGS[select.value] || SERVICE_TYPE_CONFIGS[select.value].category !== 'repair') {
        select.value = 'سرویس و تعویض لنت ترمز و چرخ‌ها';
      }
    } else {
      if (!SERVICE_TYPE_CONFIGS[select.value] || SERVICE_TYPE_CONFIGS[select.value].category !== 'service') {
        select.value = 'تعویض روغن موتور و فیلترها';
      }
    }
    handleServiceTypeChange(select.value);
  }
}

function openServiceModal(mode = 'service') {
  const form = document.getElementById('formService');
  if (form) form.reset();
  const hintCost = document.getElementById('hintServiceCost');
  if (hintCost) hintCost.textContent = '';
  const fileInput = document.getElementById('serviceReceiptFile');
  if (fileInput) fileInput.value = '';

  const today = getTodayShamsi();
  if (document.getElementById('serviceDate')) document.getElementById('serviceDate').value = today;
  
  const services = LocalDB.get(LocalDB.KEYS.SERVICES);
  if (services.length > 0 && services[0].next_km) {
    const lastNext = services[0].next_km;
    const curInput = document.getElementById('serviceCurrentKm');
    if (curInput) {
      curInput.value = lastNext.toLocaleString('en-US');
    }
  }

  setModalServiceMode(mode);
  openModal('modalService');
}

function handleKmInput(inputEl) {
  const raw = normalizeDigits(inputEl.value).replace(/[^0-9]/g, '');
  if (!raw) {
    inputEl.value = '';
    return;
  }
  const intVal = parseInt(raw, 10);
  inputEl.value = intVal.toLocaleString('en-US');
}

function handleServiceTypeChange(type) {
  const cfg = SERVICE_TYPE_CONFIGS[type] || SERVICE_TYPE_CONFIGS['تعویض روغن موتور و فیلترها'];
  const isRepair = cfg.category === 'repair';

  // Set category hidden input
  const categoryInput = document.getElementById('serviceCategory');
  if (categoryInput) categoryInput.value = cfg.category;

  // Toggle modal mode tabs
  const tabService = document.getElementById('tabModalModeService');
  const tabRepair = document.getElementById('tabModalModeRepair');
  if (tabService) tabService.className = `mode-tab-btn ${isRepair ? '' : 'active-service'}`;
  if (tabRepair) tabRepair.className = `mode-tab-btn ${isRepair ? 'active-repair' : ''}`;

  // Update modal title
  const titleEl = document.getElementById('modalServiceTitle');
  if (titleEl) titleEl.textContent = cfg.modalTitle || 'ثبت سرویس و تعمیرگاه تریلی';

  // Update interval suggestion button
  const btnSuggest = document.getElementById('btnAutoKmSuggest');
  if (btnSuggest) {
    btnSuggest.textContent = cfg.suggestLabel;
    btnSuggest.style.color = isRepair ? '#ea580c' : '#0284c7';
    btnSuggest.onclick = () => applyKmInterval(cfg.interval);
  }

  // Update hint text
  const hintKm = document.getElementById('hintKmInterval');
  if (hintKm) hintKm.textContent = cfg.hint;

  // Apply interval
  applyKmInterval(cfg.interval);

  // Update Dynamic Specification Field
  const lblSpec = document.getElementById('lblDynamicSpec');
  if (lblSpec) lblSpec.textContent = cfg.specLabel;

  const inputSpec = document.getElementById('serviceOilBrand');
  if (inputSpec) inputSpec.placeholder = cfg.specPlaceholder;

  const hintSpec = document.getElementById('hintDynamicSpec');
  if (hintSpec) hintSpec.textContent = cfg.specHint;

  // Update Dynamic Checkboxes
  const lblCheckboxes = document.getElementById('lblDynamicCheckboxes');
  if (lblCheckboxes) lblCheckboxes.textContent = cfg.checkboxLabel;

  const containerCheckboxes = document.getElementById('containerDynamicCheckboxes');
  if (containerCheckboxes) {
    containerCheckboxes.innerHTML = cfg.checkboxes.map(cb => `
      <label class="checkbox-pill-label">
        <input type="checkbox" id="${cb.id}" value="${cb.label}" ${cb.checked ? 'checked' : ''}>
        <span>${cb.label}</span>
      </label>
    `).join('');
  }

  // Update Shop/Mechanic Field
  const lblShop = document.getElementById('lblServiceShop');
  if (lblShop) lblShop.textContent = cfg.shopLabel;

  const inputShop = document.getElementById('serviceShopName');
  if (inputShop) inputShop.placeholder = cfg.shopPlaceholder;

  // Update Receipt Label
  const lblReceipt = document.getElementById('lblServiceReceipt');
  if (lblReceipt) lblReceipt.textContent = cfg.receiptLabel;

  // Update Submit Button
  const btnSubmit = document.getElementById('btnSubmitService');
  const btnSubmitText = document.getElementById('btnSubmitServiceText');
  const btnSubmitIcon = document.getElementById('btnSubmitServiceIcon');
  if (btnSubmit) btnSubmit.style.background = cfg.btnBg || (isRepair ? '#ea580c' : '#0284c7');
  if (btnSubmitText) btnSubmitText.textContent = cfg.btnText || 'ذخیره در دفترچه سرویس تریلی';
  if (btnSubmitIcon) btnSubmitIcon.textContent = cfg.icon || '💾';
}

function applyKmInterval(interval) {
  const curKm = parseCleanInt(document.getElementById('serviceCurrentKm').value);
  if (curKm > 0) {
    const nextKm = curKm + interval;
    document.getElementById('serviceNextKm').value = nextKm.toLocaleString('en-US');
  }
}

function autoSuggestNextKm() {
  const type = document.getElementById('serviceType')?.value || 'تعویض روغن موتور و فیلترها';
  const cfg = SERVICE_TYPE_CONFIGS[type] || { interval: 35000 };
  applyKmInterval(cfg.interval);
}

async function handleServiceSubmit(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.classList.add('btn-loading');
    submitBtn.textContent = 'در حال ذخیره...';
  }

  try {
    const serviceType = document.getElementById('serviceType').value;
    const cfg = SERVICE_TYPE_CONFIGS[serviceType] || {};
    const serviceCategory = document.getElementById('serviceCategory')?.value || cfg.category || 'service';
    const isRepair = serviceCategory === 'repair';

    const checkedBoxes = Array.from(document.querySelectorAll('#containerDynamicCheckboxes input[type="checkbox"]:checked'))
      .map(cb => cb.value);

    let receiptImage = null;
    const fileInput = document.getElementById('serviceReceiptFile');
    if (fileInput && fileInput.files.length > 0) {
      try {
        const compressedBlob = await compressImageClientSide(fileInput.files[0]);
        receiptImage = await blobToBase64(compressedBlob);
      } catch (err) {
        console.warn('Image notice:', err);
      }
    }

    const currentKm = parseCleanInt(document.getElementById('serviceCurrentKm').value);
    const nextKm = parseCleanInt(document.getElementById('serviceNextKm').value);
    const cost = parseCleanInt(document.getElementById('serviceCost').value);
    const paidBy = document.querySelector('input[name="servicePaidBy"]:checked')?.value || 'owner';
    const serviceDate = normalizeDigits(document.getElementById('serviceDate').value) || getTodayShamsi();
    const oilBrand = (document.getElementById('serviceOilBrand')?.value || '').trim();
    const shopName = (document.getElementById('serviceShopName')?.value || '').trim();
    const desc = (document.getElementById('serviceDesc')?.value || '').trim();

    const data = {
      id: Date.now(),
      service_type: serviceType,
      service_category: serviceCategory,
      service_date: serviceDate,
      current_km: currentKm,
      next_km: nextKm,
      remaining_km: Math.max(0, nextKm - currentKm),
      oil_brand: oilBrand,
      filters_replaced: checkedBoxes.join('، '),
      shop_name: shopName,
      cost: cost,
      paid_by: paidBy,
      description: desc,
      receipt_image: receiptImage,
      created_at: serviceDate
    };

    // 1. Save to LocalDB immediately
    const services = LocalDB.get(LocalDB.KEYS.SERVICES);
    services.unshift(data);
    LocalDB.set(LocalDB.KEYS.SERVICES, services);

    // If paid by driver, automatically create corresponding expense for driver credit!
    if (paidBy === 'driver' && cost > 0) {
      let expDesc = `${isRepair ? 'تعمیرگاه' : 'سرویس'} ${serviceType} در کیلومتر ${currentKm.toLocaleString('fa-IR')}`;
      if (shopName) expDesc += ` (${shopName})`;
      else if (oilBrand) expDesc += ` (${oilBrand})`;

      const expCategory = isRepair || serviceType.includes('تعمیر') || serviceType.includes('لنت') ? 'تعمیرات' : 'روغن';
      const expItem = {
        id: Date.now() + 1,
        trip_id: null,
        category: expCategory,
        amount: cost,
        paid_by: 'driver',
        liability: 'owner_machine',
        expense_date: serviceDate,
        description: expDesc,
        receipt_image: receiptImage,
        is_settled: false,
        created_at: serviceDate
      };
      const expenses = LocalDB.get(LocalDB.KEYS.EXPENSES);
      expenses.unshift(expItem);
      LocalDB.set(LocalDB.KEYS.EXPENSES, expenses);
    }

    closeModal('modalService');
    await loadAllData();
    showToast(isRepair ? 'سوابق تعمیرگاه با موفقیت در گوشی ثبت شد!' : 'تعویض روغن با موفقیت در دفترچه ثبت شد!');

    // 2. Non-blocking background API sync only if backend available
    if (!isStaticHost()) {
      fetch('/api/services', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Role': appState.role
        },
        body: JSON.stringify(data)
      }).catch(() => {});
    }
  } catch (err) {
    console.error('Error in handleServiceSubmit:', err);
    alert('خطا در ثبت سرویس: ' + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('btn-loading');
      const cfg = SERVICE_TYPE_CONFIGS[document.getElementById('serviceType')?.value] || {};
      submitBtn.textContent = cfg.btnText || 'ذخیره در دفترچه سرویس تریلی';
    }
  }
}

async function deleteService(id) {
  if (appState.role !== 'owner') {
    alert('فقط مالک مجاز به حذف سوابق سرویس است.');
    return;
  }
  if (!confirm('آیا از حذف این سابقه سرویس اطمینان دارید؟')) return;

  const services = LocalDB.get(LocalDB.KEYS.SERVICES).filter(s => String(s.id) !== String(id));
  LocalDB.set(LocalDB.KEYS.SERVICES, services);
  await loadAllData();
  showToast('سابقه سرویس حذف گردید.');
  if (!isStaticHost()) {
    fetch(`/api/services/${id}`, { method: 'DELETE', headers: { 'X-Role': 'owner' } }).catch(() => {});
  }
}

// --- iPhone JSON Backup & Restore ---
function exportLocalBackup() {
  try {
    const jsonStr = LocalDB.exportBackup();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const today = getTodayShamsi().replace(/\//g, '-');
    a.href = url;
    a.download = `trili_offline_backup_${today}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('فایل پشتیبان با موفقیت روی آیفون ذخیره شد!');
  } catch (err) {
    alert('خطا در پشتیبان‌گیری: ' + err.message);
  }
}

function triggerRestoreBackup() {
  const fileInput = document.getElementById('inputLocalRestore');
  if (fileInput) fileInput.click();
}

function importLocalBackupFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (!confirm('آیا مطمئن هستید که می‌خواهید اطلاعات را از این فایل پشتیبان بازیابی کنید؟ اطلاعات قبلی با این فایل جایگزین خواهند شد.')) {
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      LocalDB.importBackup(e.target.result);
      await loadAllData();
      showToast('اطلاعات با موفقیت از فایل پشتیبان بازگردانی شد!');
      closeModal('modalSettings');
    } catch (err) {
      alert('خطا در خواندن فایل پشتیبان: ' + err.message);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}


function viewReceiptById(type, id) {
  let item = null;
  if (type === 'expense') item = LocalDB.get(LocalDB.KEYS.EXPENSES).find(x => String(x.id) === String(id));
  else if (type === 'payment') item = LocalDB.get(LocalDB.KEYS.PAYMENTS).find(x => String(x.id) === String(id));
  else if (type === 'service') item = LocalDB.get(LocalDB.KEYS.SERVICES).find(x => String(x.id) === String(id));
  if (item && item.receipt_image) {
    viewReceiptImage(item.receipt_image);
  }
}

function viewReceiptImage(filename) {
  const img = document.getElementById('viewerImg');
  if (!img) return;
  img.src = filename.startsWith('data:') ? filename : `/uploads/${filename}`;
  openModal('modalImage');
}

// --- Audit Log Viewer Modal ---
async function openAuditModal() {
  if (appState.role !== 'owner') return;
  openModal('modalAuditLogs');
  const container = document.getElementById('auditLogContent');
  container.innerHTML = `<div class="empty-state">در حال فراخوانی لاگ‌ها...</div>`;
  
  function renderLogs(logs) {
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
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const res = await fetch('/api/audit-logs?role=owner', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const logs = await res.json();
      renderLogs(logs);
      return;
    }
    throw new Error('Server response not ok');
  } catch (err) {
    // BUG-06 FIX: LocalDB fallback for audit logs when offline
    const localLogs = LocalDB.get(LocalDB.KEYS.AUDIT) || [];
    if (localLogs.length > 0) {
      renderLogs(localLogs);
    } else {
      container.innerHTML = `<div class="empty-state">هیچ رویدادی در حافظه آفلاین ثبت نشده است.</div>`;
    }
  }
}

// --- Settlements & WhatsApp / Clipboard Invoice ---
function handleAdjTypeChange() {
  const radio = document.querySelector('input[name="adjTypeRadio"]:checked');
  const type = radio ? radio.value : 'none';
  const inputsRow = document.getElementById('adjInputsRow');
  if (inputsRow) {
    inputsRow.style.display = (type === 'none') ? 'none' : 'flex';
  }
  if (type === 'none') {
    const amtInput = document.getElementById('settlementAdjAmount');
    if (amtInput) amtInput.value = '';
    const hint = document.getElementById('hintAdjAmount');
    if (hint) hint.textContent = '';
  }
  calcSettlementLive();
}

function toggleItemizedDetails() {
  const container = document.getElementById('itemizedContainer');
  const btn = document.getElementById('btnToggleItemized');
  if (!container || !btn) return;
  const isHidden = container.style.display === 'none' || !container.style.display;
  container.style.display = isHidden ? 'flex' : 'none';
  btn.textContent = isHidden ? 'بستن جزئیات ▲' : 'مشاهده جزئیات ▼';
}

function renderItemizedBreakdown(trips, expenses, payments) {
  const countBadge = document.getElementById('invItemizedCountBadge');
  if (countBadge) {
    countBadge.textContent = `${trips.length + expenses.length + payments.length} قلم`;
  }

  // 1. Trips
  const tripsContainer = document.getElementById('invItemizedTripsList');
  const tripsTotalEl = document.getElementById('invItemizedTripsTotal');
  const totalNet = trips.reduce((sum, t) => sum + (t.net_freight || 0), 0);
  if (tripsTotalEl) tripsTotalEl.textContent = formatToman(totalNet) + ' تومان';

  if (tripsContainer) {
    if (trips.length === 0) {
      tripsContainer.innerHTML = '<div style="color:#94a3b8; font-size:11px; padding:4px 0;">هیچ باری در این دوره ثبت نشده است.</div>';
    } else {
      tripsContainer.innerHTML = trips.map((t, idx) => `
        <div style="background:white; border:1px solid #f1f5f9; border-radius:8px; padding:6px 8px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-weight:700; color:#0f172a; font-size:11.5px;">${idx + 1}. ${t.origin || 'مبدأ'} به ${t.destination || 'مقصد'}</div>
            <div style="color:#64748b; font-size:10px; margin-top:2px;">بارنامه ${t.bill_number || '---'} • ${t.loading_date || ''} • نقد راننده: ${formatToman(t.cash_received_by_driver || 0)} ت</div>
          </div>
          <div style="text-align:left;">
            <div style="font-weight:800; color:#0284c7; font-size:11.5px;">صافی: ${formatToman(t.net_freight || 0)} ت</div>
            <div style="font-size:10px; color:#16a34a; font-weight:700;">سهم: ${formatToman(t.driver_share_amount || 0)} ت</div>
          </div>
        </div>
      `).join('');
    }
  }

  // 2. Expenses
  const expContainer = document.getElementById('invItemizedExpensesList');
  const expTotalEl = document.getElementById('invItemizedExpensesTotal');
  const totalExp = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  if (expTotalEl) expTotalEl.textContent = formatToman(totalExp) + ' تومان';

  if (expContainer) {
    if (expenses.length === 0) {
      expContainer.innerHTML = '<div style="color:#94a3b8; font-size:11px; padding:4px 0;">هیچ هزینه‌ای در این دوره ثبت نشده است.</div>';
    } else {
      expContainer.innerHTML = expenses.map((e, idx) => {
        const isDriverPaid = e.paid_by === 'driver';
        return `
          <div style="background:white; border:1px solid #f1f5f9; border-radius:8px; padding:6px 8px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-weight:700; color:#0f172a; font-size:11.5px;">${idx + 1}. ${e.category || 'هزینه'}: ${e.description || 'بدون شرح'}</div>
              <div style="font-size:10px; color:${isDriverPaid ? '#2563eb' : '#475569'}; margin-top:2px;">
                ${isDriverPaid ? '🧢 پرداخت از جیب راننده' : '👑 پرداخت مستقیم توسط مالک'} • ${e.expense_date || ''}
              </div>
            </div>
            <div style="font-weight:800; color:${isDriverPaid ? '#2563eb' : '#0f172a'}; font-size:11.5px;">
              ${formatToman(e.amount || 0)} ت
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 3. Payments
  const payContainer = document.getElementById('invItemizedPaymentsList');
  const payTotalEl = document.getElementById('invItemizedPaymentsTotal');
  const totalPay = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  if (payTotalEl) payTotalEl.textContent = formatToman(totalPay) + ' تومان';

  if (payContainer) {
    if (payments.length === 0) {
      payContainer.innerHTML = '<div style="color:#94a3b8; font-size:11px; padding:4px 0;">هیچ واریزی یا مساعده‌ای در این دوره ثبت نشده است.</div>';
    } else {
      payContainer.innerHTML = payments.map((p, idx) => {
        const isDriverTransfer = p.payer === 'driver';
        return `
          <div style="background:white; border:1px solid #f1f5f9; border-radius:8px; padding:6px 8px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-weight:700; color:#0f172a; font-size:11.5px;">${idx + 1}. ${isDriverTransfer ? '🟢 واریز راننده به کارت مالک' : '🔴 مساعده مالک به راننده'}</div>
              <div style="font-size:10px; color:#64748b; margin-top:2px;">
                ${p.payment_method || 'کارت'} • ${p.payment_date || ''} ${p.tracking_code ? `(پیگیری: ${p.tracking_code})` : ''}
              </div>
            </div>
            <div style="font-weight:800; color:${isDriverTransfer ? '#16a34a' : '#dc2626'}; font-size:11.5px;">
              ${formatToman(p.amount || 0)} ت
            </div>
          </div>
        `;
      }).join('');
    }
  }
}

function calcSettlementLive() {
  if (appState.activeSettlement) return; // Read-only for past settlements
  const sum = appState.summary || {};
  const radio = document.querySelector('input[name="adjTypeRadio"]:checked');
  const type = radio ? radio.value : 'none';
  const amtInput = document.getElementById('settlementAdjAmount');
  const descInput = document.getElementById('settlementAdjDesc');
  const adjAmt = parseCleanInt(amtInput ? amtInput.value : '0');
  const adjDesc = descInput ? descInput.value.trim() : '';

  const rowBonus = document.getElementById('invRowBonus');
  const rowPenalty = document.getElementById('invRowPenalty');
  const bonusEl = document.getElementById('invBonusAmount');
  const penaltyEl = document.getElementById('invPenaltyAmount');
  const noteEl = document.getElementById('invAdjustmentNote');

  let baseCredit = (sum.driver_share_unsettled || 0) + (sum.driver_paid_expenses || 0) + (sum.driver_transfers_to_owner || 0);
  let baseDebit = (sum.driver_cash_collected || 0) + (sum.advances_paid || 0);

  let finalCredit = baseCredit;
  let finalDebit = baseDebit;
  let ownerProfitAdj = 0;

  if (type === 'bonus' && adjAmt > 0) {
    finalCredit += adjAmt;
    ownerProfitAdj = -adjAmt;
    if (rowBonus) rowBonus.style.display = 'flex';
    if (bonusEl) bonusEl.textContent = `+${formatToman(adjAmt)} تومان`;
    if (rowPenalty) rowPenalty.style.display = 'none';
    if (noteEl) {
      noteEl.style.display = 'block';
      noteEl.innerHTML = `🌟 <strong>پاداش و تشویقی:</strong> مبلغ ${formatToman(adjAmt)} تومان ${adjDesc ? `(بابت: ${adjDesc})` : ''} به طلب راننده اضافه شد.`;
    }
  } else if (type === 'penalty' && adjAmt > 0) {
    finalDebit += adjAmt;
    ownerProfitAdj = adjAmt;
    if (rowPenalty) rowPenalty.style.display = 'flex';
    if (penaltyEl) penaltyEl.textContent = `-${formatToman(adjAmt)} تومان`;
    if (rowBonus) rowBonus.style.display = 'none';
    if (noteEl) {
      noteEl.style.display = 'block';
      noteEl.innerHTML = `⚠️ <strong>کسورات / خسارت:</strong> مبلغ ${formatToman(adjAmt)} تومان ${adjDesc ? `(علت: ${adjDesc})` : ''} از طلب راننده کسر گردید.`;
    }
  } else {
    if (rowBonus) rowBonus.style.display = 'none';
    if (rowPenalty) rowPenalty.style.display = 'none';
    if (noteEl) noteEl.style.display = 'none';
  }

  const finalBal = finalCredit - finalDebit;
  document.getElementById('invTotalCredit').textContent = formatToman(finalCredit) + ' تومان';
  document.getElementById('invTotalDebit').textContent = formatToman(finalDebit) + ' تومان';

  const balanceEl = document.getElementById('invFinalBalance');
  const labelEl = document.getElementById('invBalanceLabel');
  const concEl = document.getElementById('invConclusionText');

  balanceEl.textContent = formatToman(Math.abs(finalBal)) + ' تومان';

  if (finalBal > 0) {
    labelEl.textContent = 'مبلغ قابل پرداخت توسط مالک به راننده:';
    balanceEl.style.color = '#16a34a';
    concEl.textContent = `با پرداخت این مبلغ (${formatToman(finalBal)} تومان) به حساب راننده، حساب این دوره کاملاً تسویه و صفر می‌شود.`;
  } else if (finalBal < 0) {
    labelEl.textContent = 'مبلغ اضافه دست راننده (قابل بازگشت به مالک):';
    balanceEl.style.color = '#dc2626';
    concEl.textContent = `راننده مبلغ (${formatToman(Math.abs(finalBal))} تومان) بیشتر از سهم و مخارجش در دست دارد و باید به مالک پرداخت نماید.`;
  } else {
    labelEl.textContent = 'مانده نهایی تسویه:';
    balanceEl.style.color = '#2563eb';
    concEl.textContent = 'حساب دو طرف کاملاً تراز و صفر است.';
  }

  // Calculate and display Owner Net Profit:
  const totalNet = sum.total_net_freight_unsettled || 0;
  const driverShare = sum.driver_share_unsettled || 0;
  const allExpenses = sum.total_expenses_unsettled || (sum.driver_paid_expenses + sum.owner_paid_expenses) || 0;
  const ownerProfit = (totalNet - driverShare) - allExpenses + ownerProfitAdj;

  document.getElementById('invTotalNetFreight').textContent = formatToman(totalNet) + ' تومان';
  document.getElementById('invTotalMachineExpenses').textContent = formatToman(allExpenses) + ' تومان';
  const ownerProfitEl = document.getElementById('invOwnerNetProfit');
  if (ownerProfitEl) {
    ownerProfitEl.textContent = formatToman(ownerProfit) + ' تومان';
    ownerProfitEl.style.color = ownerProfit >= 0 ? '#15803d' : '#dc2626';
  }
}

function openSettlementPreviewModal() {
  appState.activeSettlement = null;
  const sum = LocalDB.calculateSummary('owner');
  appState.summary = sum;
  const s = appState.settings || {};
  const today = getTodayShamsi();

  // Reset adjustment controls
  const radioNone = document.getElementById('adjTypeNone');
  if (radioNone) radioNone.checked = true;
  const adjRow = document.getElementById('adjInputsRow');
  if (adjRow) adjRow.style.display = 'none';
  const adjAmt = document.getElementById('settlementAdjAmount');
  if (adjAmt) adjAmt.value = '';
  const adjDesc = document.getElementById('settlementAdjDesc');
  if (adjDesc) adjDesc.value = '';
  const adjBox = document.getElementById('settlementAdjustmentBox');
  if (adjBox) adjBox.style.display = (appState.role === 'owner') ? 'block' : 'none';

  // Pending Transfers Warning (BUG-03 fix)
  const pendingCount = sum.pending_transfers_count || 0;
  const pendingAmount = sum.pending_driver_transfers || 0;
  const warnEl = document.getElementById('invPendingWarning');
  const warnTextEl = document.getElementById('invPendingWarningText');
  if (warnEl && warnTextEl) {
    if (pendingCount > 0) {
      warnEl.style.display = 'block';
      warnTextEl.textContent = `تعداد ${pendingCount} واریزی راننده به مبلغ ${formatToman(pendingAmount)} تومان هنوز تایید نشده است و در این تسویه حساب منظور نشده است. در صورت تمایل ابتدا از منوی واریزی‌ها آن را تایید کنید.`;
    } else {
      warnEl.style.display = 'none';
    }
  }

  document.getElementById('invTruckInfo').textContent = `پلاک: ${s.plate_number || '---'} | مالک: ${s.owner_name || ''} | راننده: ${s.driver_name || ''}`;
  document.getElementById('invDate').textContent = `تاریخ تسویه: ${today}`;
  document.getElementById('invSharePercent').textContent = `${s.driver_share_percent || 20}٪`;

  document.getElementById('invDriverShare').textContent = formatToman(sum.driver_share_unsettled) + ' تومان';
  document.getElementById('invDriverExpenses').textContent = formatToman(sum.driver_paid_expenses) + ' تومان';
  document.getElementById('invDriverTransfers').textContent = formatToman(sum.driver_transfers_to_owner || 0) + ' تومان';
  document.getElementById('invCashCollected').textContent = formatToman(sum.driver_cash_collected) + ' تومان';
  document.getElementById('invAdvancesPaid').textContent = formatToman(sum.advances_paid) + ' تومان';

  // Populate itemized breakdown
  const unsettledTrips = LocalDB.get(LocalDB.KEYS.TRIPS).filter(t => !t.is_settled);
  const unsettledExpenses = LocalDB.get(LocalDB.KEYS.EXPENSES).filter(e => !e.is_settled);
  const unsettledPayments = LocalDB.get(LocalDB.KEYS.PAYMENTS).filter(p => !p.is_settled && p.is_approved);
  renderItemizedBreakdown(unsettledTrips, unsettledExpenses, unsettledPayments);

  calcSettlementLive();

  // Show confirm settlement button if owner
  const confirmBtn = document.getElementById('btnConfirmSettlement');
  if (confirmBtn) confirmBtn.style.display = (appState.role === 'owner') ? 'flex' : 'none';

  const headTitle = document.getElementById('modalSettlementHeaderTitle');
  if (headTitle) headTitle.textContent = '📑 صورت‌حساب رسمی تسویه با راننده (دوره باز)';

  const backBtn = document.getElementById('btnBackToCurrentSettlement');
  if (backBtn) backBtn.style.display = 'none';

  const rollbackBtn = document.getElementById('btnRollbackSettlement');
  if (rollbackBtn) rollbackBtn.style.display = 'none';

  switchModalSettlementTab('current');

  openModal('modalSettlement');
}

function showSettlementDetail(id) {
  const s = appState.settlements.find(item => item.id === id);
  if (!s) return;

  appState.activeSettlement = s;
  const cfg = appState.settings || {};

  // Hide adjustment box for past settlements (already finalized)
  const adjBox = document.getElementById('settlementAdjustmentBox');
  if (adjBox) adjBox.style.display = 'none';

  const warnEl = document.getElementById('invPendingWarning');
  if (warnEl) warnEl.style.display = 'none';

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

  // Adjustment Display
  const rowBonus = document.getElementById('invRowBonus');
  const rowPenalty = document.getElementById('invRowPenalty');
  const bonusEl = document.getElementById('invBonusAmount');
  const penaltyEl = document.getElementById('invPenaltyAmount');
  const noteEl = document.getElementById('invAdjustmentNote');
  const adjAmt = s.adjustment_amount || 0;
  const adjDesc = s.adjustment_desc || '';

  if (adjAmt > 0) {
    if (rowBonus) rowBonus.style.display = 'flex';
    if (bonusEl) bonusEl.textContent = `+${formatToman(adjAmt)} تومان`;
    if (rowPenalty) rowPenalty.style.display = 'none';
    if (noteEl) {
      noteEl.style.display = 'block';
      noteEl.innerHTML = `🌟 <strong>پاداش و تشویقی:</strong> مبلغ ${formatToman(adjAmt)} تومان ${adjDesc ? `(بابت: ${adjDesc})` : ''} اعمال شده است.`;
    }
  } else if (adjAmt < 0) {
    if (rowPenalty) rowPenalty.style.display = 'flex';
    if (penaltyEl) penaltyEl.textContent = `-${formatToman(Math.abs(adjAmt))} تومان`;
    if (rowBonus) rowBonus.style.display = 'none';
    if (noteEl) {
      noteEl.style.display = 'block';
      noteEl.innerHTML = `⚠️ <strong>کسورات / خسارت:</strong> مبلغ ${formatToman(Math.abs(adjAmt))} تومان ${adjDesc ? `(علت: ${adjDesc})` : ''} کسر گردیده است.`;
    }
  } else {
    if (rowBonus) rowBonus.style.display = 'none';
    if (rowPenalty) rowPenalty.style.display = 'none';
    if (noteEl) noteEl.style.display = 'none';
  }

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

  // Display Total Net & Owner Profit
  document.getElementById('invTotalNetFreight').textContent = formatToman(s.total_net_freight || 0) + ' تومان';
  const ownerProfitEl = document.getElementById('invOwnerNetProfit');
  if (ownerProfitEl) {
    ownerProfitEl.textContent = formatToman(s.owner_net_profit || 0) + ' تومان';
    ownerProfitEl.style.color = (s.owner_net_profit || 0) >= 0 ? '#15803d' : '#dc2626';
  }

  // Unpack itemized snapshot from DB or LocalDB
  let itemized = s.itemized;
  if (!itemized && s.itemized_json) {
    try {
      itemized = JSON.parse(s.itemized_json);
    } catch (e) {
      itemized = null;
    }
  }
  const trips = (itemized && itemized.trips) || [];
  const expenses = (itemized && itemized.expenses) || [];
  const payments = (itemized && itemized.payments) || [];
  renderItemizedBreakdown(trips, expenses, payments);

  // Hide confirm settlement button because it's already settled!
  const confirmBtn = document.getElementById('btnConfirmSettlement');
  if (confirmBtn) confirmBtn.style.display = 'none';

  const headTitle = document.getElementById('modalSettlementHeaderTitle');
  if (headTitle) headTitle.textContent = `📑 صورت‌حساب قطعی تسویه (مورخ ${s.settlement_date})`;

  const backBtn = document.getElementById('btnBackToCurrentSettlement');
  if (backBtn) backBtn.style.display = 'block';

  const rollbackBtn = document.getElementById('btnRollbackSettlement');
  if (rollbackBtn) rollbackBtn.style.display = (appState.role === 'owner') ? 'block' : 'none';

  switchModalSettlementTab('current');

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
  let adjAmount = 0;
  let adjDesc = '';
  let ownerNetProfit = 0;
  let tripsList = [];
  let driverExpList = [];
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
    adjAmount = act.adjustment_amount || 0;
    adjDesc = act.adjustment_desc || '';
    ownerNetProfit = act.owner_net_profit || 0;
    settlementDate = act.settlement_date || getTodayShamsi();

    let itemized = act.itemized;
    if (!itemized && act.itemized_json) {
      try { itemized = JSON.parse(act.itemized_json); } catch (e) {}
    }
    tripsList = (itemized && itemized.trips) || [];
    driverExpList = (itemized && itemized.expenses && itemized.expenses.filter(e => e.paid_by === 'driver')) || [];
  } else {
    const sum = appState.summary || {};
    shareAmount = sum.driver_share_unsettled || 0;
    driverExpenses = sum.driver_paid_expenses || 0;
    driverTransfers = sum.driver_transfers_to_owner || 0;
    cashCollected = sum.driver_cash_collected || 0;
    advancesPaid = sum.advances_paid || 0;

    const radio = document.querySelector('input[name="adjTypeRadio"]:checked');
    const adjType = radio ? radio.value : 'none';
    const amtInput = document.getElementById('settlementAdjAmount');
    const descInput = document.getElementById('settlementAdjDesc');
    const rawAdj = parseCleanInt(amtInput ? amtInput.value : '0');
    adjDesc = descInput ? descInput.value.trim() : '';

    if (adjType === 'bonus') adjAmount = rawAdj;
    else if (adjType === 'penalty') adjAmount = -Math.abs(rawAdj);
    else adjAmount = 0;

    totalCredit = shareAmount + driverExpenses + driverTransfers + (adjAmount > 0 ? adjAmount : 0);
    totalDebit = cashCollected + advancesPaid + (adjAmount < 0 ? Math.abs(adjAmount) : 0);
    balance = totalCredit - totalDebit;

    const totalNet = sum.total_net_freight_unsettled || 0;
    const allExp = sum.total_expenses_unsettled || (driverExpenses + (sum.owner_paid_expenses || 0));
    ownerNetProfit = (totalNet - shareAmount) - allExp - adjAmount;

    tripsList = LocalDB.get(LocalDB.KEYS.TRIPS).filter(t => !t.is_settled);
    driverExpList = LocalDB.get(LocalDB.KEYS.EXPENSES).filter(e => !e.is_settled && e.paid_by === 'driver');
  }

  let balanceMessage = '';
  if (balance > 0) {
    balanceMessage = `✅ مانده نهایی جهت تسویه:\nمبلغ قابل پرداخت توسط مالک به راننده: ${formatToman(balance)} تومان\n(${numberToPersianWords(balance)})`;
  } else if (balance < 0) {
    balanceMessage = `⚠️ مانده نهایی جهت تسویه:\nمبلغ اضافه دست راننده که باید بازگردانده شود: ${formatToman(Math.abs(balance))} تومان\n(${numberToPersianWords(Math.abs(balance))})`;
  } else {
    balanceMessage = `✅ حساب طرفین کاملاً تراز و صفر است (بدون مانده).`;
  }

  let adjustmentSection = '';
  if (adjAmount > 0) {
    adjustmentSection = `\n🌟 پاداش و تشویقی راننده: +${formatToman(adjAmount)} تومان ${adjDesc ? `(${adjDesc})` : ''}`;
  } else if (adjAmount < 0) {
    adjustmentSection = `\n⚠️ کسورات و جریمه/خسارت: -${formatToman(Math.abs(adjAmount))} تومان ${adjDesc ? `(${adjDesc})` : ''}`;
  }

  let tripsSection = '';
  if (tripsList.length > 0) {
    tripsSection = `\n🚛 ریز بارنامه‌های این دوره (${tripsList.length} سفر):\n` +
      tripsList.map((t, idx) => `  ${idx + 1}. ${t.origin || 'مبدأ'} به ${t.destination || 'مقصد'} (بارنامه ${t.bill_number || '---'}): صافی ${formatToman(t.net_freight || 0)} ت | سهم راننده: ${formatToman(t.driver_share_amount || 0)} ت`).join('\n');
  }

  let expSection = '';
  if (driverExpList.length > 0) {
    expSection = `\n⛽ مخارج پرداخت شده از جیب راننده (${driverExpList.length} مورد):\n` +
      driverExpList.map((e, idx) => `  ${idx + 1}. ${e.category || 'هزینه'}: ${formatToman(e.amount || 0)} ت ${e.description ? `(${e.description})` : ''}`).join('\n');
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
۳. واریزی‌های راننده به کارت مالک: ${formatToman(driverTransfers)} تومان${adjAmount > 0 ? `\n۴. پاداش و تشویقی: +${formatToman(adjAmount)} تومان` : ''}
➕ جمع کل طلب راننده: ${formatToman(totalCredit)} تومان

🔴 بخش دوم: بدهکاری راننده (دریافتی‌های راننده)
۱. پیش‌کرایه‌های نقدی دست راننده: ${formatToman(cashCollected)} تومان
۲. مساعده‌ها و واریزی‌های مالک به راننده: ${formatToman(advancesPaid)} تومان${adjAmount < 0 ? `\n۳. کسورات و خسارت: -${formatToman(Math.abs(adjAmount))} تومان` : ''}
➖ جمع کل بدهی راننده: ${formatToman(totalDebit)} تومان
${adjustmentSection}${tripsSection}${expSection}
━━━━━━━━━━━━━━━━━━━━
⚖️ نتیجه نهایی:
${balanceMessage}
━━━━━━━━━━━━━━━━━━━━
👑 سود خالص مالک تریلی: ${formatToman(ownerNetProfit)} تومان
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
  const sum = LocalDB.calculateSummary('owner');
  const unsettledTrips = LocalDB.get(LocalDB.KEYS.TRIPS).filter(t => !t.is_settled);
  const unsettledExpenses = LocalDB.get(LocalDB.KEYS.EXPENSES).filter(e => !e.is_settled);
  const unsettledPayments = LocalDB.get(LocalDB.KEYS.PAYMENTS).filter(p => !p.is_settled && p.is_approved);

  const radio = document.querySelector('input[name="adjTypeRadio"]:checked');
  const adjType = radio ? radio.value : 'none';
  const adjAmtInput = document.getElementById('settlementAdjAmount');
  const adjDescInput = document.getElementById('settlementAdjDesc');
  const adjAmt = parseCleanInt(adjAmtInput ? adjAmtInput.value : '0');
  const adjDesc = adjDescInput ? adjDescInput.value.trim() : '';

  let adjValSigned = 0;
  if (adjType === 'bonus') adjValSigned = adjAmt;
  else if (adjType === 'penalty') adjValSigned = -Math.abs(adjAmt);

  const totalCredit = sum.driver_total_credit + (adjValSigned > 0 ? adjValSigned : 0);
  const totalDebit = sum.driver_total_debit + (adjValSigned < 0 ? Math.abs(adjValSigned) : 0);
  const finalBalance = totalCredit - totalDebit;

  const totalNet = sum.total_net_freight_unsettled || unsettledTrips.reduce((a, b) => a + (b.net_freight || 0), 0);
  const totalExp = sum.total_expenses_unsettled || unsettledExpenses.reduce((a, b) => a + (b.amount || 0), 0);
  const ownerProfit = (totalNet - sum.driver_share_unsettled) - totalExp - adjValSigned;

  // Itemized snapshot for permanent record
  const itemizedSnapshot = {
    trips: unsettledTrips.map(t => ({ ...t })),
    expenses: unsettledExpenses.map(e => ({ ...e })),
    payments: unsettledPayments.map(p => ({ ...p })),
    adjustment_type: adjType,
    adjustment_amount: adjValSigned,
    adjustment_desc: adjDesc,
    owner_net_profit: ownerProfit,
    summary: {
      total_net_freight: totalNet,
      driver_earned_share: sum.driver_share_unsettled,
      driver_paid_expenses: sum.driver_paid_expenses,
      driver_transfers_to_owner: sum.driver_transfers_to_owner,
      advances_paid_by_owner: sum.advances_paid,
      driver_cash_collected: sum.driver_cash_collected,
      final_balance: finalBalance
    }
  };

  const settlementObj = {
    id: Date.now(),
    title: `تسویه حساب مورخ ${today}`,
    settlement_date: today,
    total_trips_count: unsettledTrips.length,
    total_net_freight: totalNet,
    driver_earned_share: sum.driver_share_unsettled,
    driver_paid_expenses: sum.driver_paid_expenses,
    driver_transfers_to_owner: sum.driver_transfers_to_owner,
    total_driver_credit: totalCredit,
    driver_cash_collected: sum.driver_cash_collected,
    advances_paid_by_owner: sum.advances_paid,
    total_driver_debit: totalDebit,
    adjustment_amount: adjValSigned,
    adjustment_desc: adjDesc,
    owner_net_profit: ownerProfit,
    itemized: itemizedSnapshot,
    itemized_json: JSON.stringify(itemizedSnapshot),
    final_balance: finalBalance,
    status: 'تسویه شده'
  };

  // 1. Mark all unsettled items as settled in LocalDB immediately
  const allTrips = LocalDB.get(LocalDB.KEYS.TRIPS);
  allTrips.forEach(t => { if (!t.is_settled) { t.is_settled = true; t.settlement_id = settlementObj.id; } });
  LocalDB.set(LocalDB.KEYS.TRIPS, allTrips);

  const allExpenses = LocalDB.get(LocalDB.KEYS.EXPENSES);
  allExpenses.forEach(e => { if (!e.is_settled) { e.is_settled = true; e.settlement_id = settlementObj.id; } });
  LocalDB.set(LocalDB.KEYS.EXPENSES, allExpenses);

  const allPayments = LocalDB.get(LocalDB.KEYS.PAYMENTS);
  allPayments.forEach(p => { if (!p.is_settled && p.is_approved) { p.is_settled = true; p.settlement_id = settlementObj.id; } });
  LocalDB.set(LocalDB.KEYS.PAYMENTS, allPayments);

  const settlements = LocalDB.get(LocalDB.KEYS.SETTLEMENTS);
  settlements.unshift(settlementObj);
  LocalDB.set(LocalDB.KEYS.SETTLEMENTS, settlements);

  closeModal('modalSettlement');
  await loadAllData();
  showToast('تسویه حساب با موفقیت ثبت شد و فاکتور در تاریخچه ذخیره گردید!');
  switchNav('settlements');

  // 2. Background sync
  if (!isStaticHost()) {
    fetch('/api/settlements', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Role': 'owner'
      },
      body: JSON.stringify({
        title: `تسویه حساب مورخ ${today}`,
        settlement_date: today,
        adjustment_type: adjType,
        adjustment_amount: adjAmt,
        adjustment_desc: adjDesc
      })
    }).catch(() => {});
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

// =================================================================
// موتور تقویم و انتخابگر تاریخ شمسی (Shamsi Touch Date Picker)
// بدون نیاز به تایپ دستی روی گوشی آیفون با رابط کاربری لمسی و سریع
// =================================================================
let datePickerTargetInputId = null;
let datePickerCurrentYear = 1405;
let datePickerCurrentMonth = 2;
let datePickerCurrentDay = 15;

const SHAMSI_MONTH_NAMES = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
];

function isShamsiLeapYear(y) {
  return [1403, 1408, 1412, 1416, 1420].includes(y);
}

function getDaysInShamsiMonth(year, month) {
  if (month <= 6) return 31;
  if (month <= 11) return 30;
  return isShamsiLeapYear(year) ? 30 : 29;
}

function openDatePicker(targetId) {
  datePickerTargetInputId = targetId;
  const inputEl = document.getElementById(targetId);
  const currentVal = inputEl ? normalizeDigits(inputEl.value).trim() : '';

  if (currentVal && currentVal.includes('/')) {
    const parts = currentVal.split('/');
    if (parts.length === 3) {
      datePickerCurrentYear = parseInt(parts[0], 10) || 1405;
      datePickerCurrentMonth = parseInt(parts[1], 10) || 1;
      datePickerCurrentDay = parseInt(parts[2], 10) || 1;
    }
  } else {
    parseTodayToPicker();
  }

  const yrSelect = document.getElementById('pickerYearSelect');
  if (yrSelect) {
    yrSelect.value = String(datePickerCurrentYear);
    if (!yrSelect.value) {
      const opt = document.createElement('option');
      opt.value = String(datePickerCurrentYear);
      opt.textContent = String(datePickerCurrentYear);
      yrSelect.appendChild(opt);
      yrSelect.value = String(datePickerCurrentYear);
    }
  }

  const moSelect = document.getElementById('pickerMonthSelect');
  if (moSelect) moSelect.value = String(datePickerCurrentMonth);

  renderDayPickerElements();
  openModal('modalDatePicker');
}

function parseTodayToPicker() {
  try {
    const todayStr = getTodayShamsi();
    const parts = todayStr.split('/');
    datePickerCurrentYear = parseInt(parts[0], 10);
    datePickerCurrentMonth = parseInt(parts[1], 10);
    datePickerCurrentDay = parseInt(parts[2], 10);
  } catch (e) {
    datePickerCurrentYear = 1405;
    datePickerCurrentMonth = 2;
    datePickerCurrentDay = 15;
  }
}

function setQuickDate(offsetDays) {
  try {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const formatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const formatted = normalizeDigits(formatter.format(d));
    const parts = formatted.split('/');
    datePickerCurrentYear = parseInt(parts[0], 10);
    datePickerCurrentMonth = parseInt(parts[1], 10);
    datePickerCurrentDay = parseInt(parts[2], 10);

    const yrSelect = document.getElementById('pickerYearSelect');
    if (yrSelect) yrSelect.value = String(datePickerCurrentYear);
    const moSelect = document.getElementById('pickerMonthSelect');
    if (moSelect) moSelect.value = String(datePickerCurrentMonth);

    renderDayPickerElements();
  } catch (e) {
    console.warn('Quick date notice:', e);
  }
}

function onPickerDropdownChange() {
  const yrSelect = document.getElementById('pickerYearSelect');
  const moSelect = document.getElementById('pickerMonthSelect');
  if (yrSelect) datePickerCurrentYear = parseInt(yrSelect.value, 10);
  if (moSelect) datePickerCurrentMonth = parseInt(moSelect.value, 10);

  const maxDays = getDaysInShamsiMonth(datePickerCurrentYear, datePickerCurrentMonth);
  if (datePickerCurrentDay > maxDays) datePickerCurrentDay = maxDays;

  renderDayPickerElements();
}

function onPickerDayDropdownChange() {
  const daySelect = document.getElementById('pickerDaySelect');
  if (daySelect) {
    datePickerCurrentDay = parseInt(daySelect.value, 10);
    renderCalendarGrid();
    updatePickerBanner();
  }
}

function selectPickerDay(day) {
  datePickerCurrentDay = day;
  const daySelect = document.getElementById('pickerDaySelect');
  if (daySelect) daySelect.value = String(day);
  renderCalendarGrid();
  updatePickerBanner();
}

function renderDayPickerElements() {
  const maxDays = getDaysInShamsiMonth(datePickerCurrentYear, datePickerCurrentMonth);
  if (datePickerCurrentDay > maxDays) datePickerCurrentDay = maxDays;

  const daySelect = document.getElementById('pickerDaySelect');
  if (daySelect) {
    daySelect.innerHTML = '';
    for (let i = 1; i <= maxDays; i++) {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = String(i).padStart(2, '۰');
      if (i === datePickerCurrentDay) opt.selected = true;
      daySelect.appendChild(opt);
    }
  }

  renderCalendarGrid();
  updatePickerBanner();
}

function renderCalendarGrid() {
  const grid = document.getElementById('pickerCalendarGrid');
  if (!grid) return;
  const maxDays = getDaysInShamsiMonth(datePickerCurrentYear, datePickerCurrentMonth);

  const todayStr = getTodayShamsi();
  const [tY, tM, tD] = todayStr.split('/').map(v => parseInt(v, 10));

  let html = '';
  for (let i = 1; i <= 31; i++) {
    const isOutOfMonth = i > maxDays;
    const isSelected = i === datePickerCurrentDay;
    const isToday = (datePickerCurrentYear === tY && datePickerCurrentMonth === tM && i === tD);

    if (isOutOfMonth) {
      html += `<button type="button" class="date-grid-day-btn" disabled>--</button>`;
    } else {
      html += `
        <button type="button" 
          class="date-grid-day-btn ${isSelected ? 'selected' : ''} ${isToday ? 'today-highlight' : ''}" 
          onclick="selectPickerDay(${i})">
          ${i}
        </button>
      `;
    }
  }
  grid.innerHTML = html;
}

function updatePickerBanner() {
  const banner = document.getElementById('pickerSelectedBanner');
  if (!banner) return;
  const moName = SHAMSI_MONTH_NAMES[datePickerCurrentMonth - 1] || '';
  const yStr = String(datePickerCurrentYear);
  const mStr = String(datePickerCurrentMonth).padStart(2, '0');
  const dStr = String(datePickerCurrentDay).padStart(2, '0');

  banner.innerHTML = `
    <span>تاریخ انتخابی: </span>
    <strong style="color:#0284c7; font-size:14px;">${datePickerCurrentDay} ${moName} ${datePickerCurrentYear}</strong>
    <span style="color:#64748b; font-size:12px; margin-right:6px;">(${yStr}/${mStr}/${dStr})</span>
  `;
}

function confirmDatePickerSelection() {
  if (!datePickerTargetInputId) return;
  const yStr = String(datePickerCurrentYear);
  const mStr = String(datePickerCurrentMonth).padStart(2, '0');
  const dStr = String(datePickerCurrentDay).padStart(2, '0');
  const finalDate = `${yStr}/${mStr}/${dStr}`;

  const targetInput = document.getElementById(datePickerTargetInputId);
  if (targetInput) {
    targetInput.value = finalDate;
    targetInput.dispatchEvent(new Event('input', { bubbles: true }));
    targetInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  closeModal('modalDatePicker');
  showToast(`تاریخ ${finalDate} انتخاب شد.`);
}

// =================================================================
// خروجی اکسل و فاکتور چاپی PDF واریزی‌ها (Payments Export Engine)
// کارکرد ۱۰۰٪ آفلاین روی آیفون با استاندارد UTF-8 BOM بدون بهم‌ریختگی
// =================================================================
function exportPaymentsExcel() {
  let list = appState.payments || [];
  if (appState.paymentsFilter === 'pending') {
    list = list.filter(p => !p.is_settled && p.is_approved === false);
  } else if (appState.paymentsFilter === 'driver') {
    list = list.filter(p => p.payer === 'driver');
  } else if (appState.paymentsFilter === 'owner') {
    list = list.filter(p => p.payer !== 'driver');
  }

  if (list.length === 0) {
    alert('هیچ واریزی برای خروجی اکسل در این دسته‌بندی وجود ندارد.');
    return;
  }

  // UTF-8 BOM ensures Persian text opens properly in Microsoft Excel & Apple Numbers
  const BOM = "\uFEFF";
  let csv = BOM + "ردیف,تاریخ واریز,نوع تراکنش,مبلغ (تومان),روش پرداخت,کد پیگیری / ارجاع,وضعیت تایید,وضعیت دوره,بابت / توضیحات\r\n";

  list.forEach((p, idx) => {
    const isDriver = p.payer === 'driver';
    const type = isDriver ? 'واریز راننده به کارت مالک' : 'مساعده مالک به راننده';
    const amount = p.amount || 0;
    const method = p.payment_method || 'کارت به کارت';
    const tracking = p.tracking_code ? `"${String(p.tracking_code).replace(/"/g, '""')}"` : '---';
    const approval = p.is_approved ? 'تایید شده' : 'در انتظار تایید';
    const settled = p.is_settled ? 'تسویه شده' : 'جاری (تسویه نشده)';
    const desc = p.description ? `"${String(p.description).replace(/"/g, '""')}"` : '---';
    const date = p.payment_date || '---';

    csv += `${idx + 1},${date},${type},${amount},${method},${tracking},${approval},${settled},${desc}\r\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const filename = `gozaresh_variziha_${getTodayShamsi().replace(/\//g, '-')}.csv`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast('📊 فایل اکسل واریزی‌ها با موفقیت دانلود شد.');
}

function openPaymentsReportModal() {
  let list = appState.payments || [];
  if (appState.paymentsFilter === 'pending') {
    list = list.filter(p => !p.is_settled && p.is_approved === false);
  } else if (appState.paymentsFilter === 'driver') {
    list = list.filter(p => p.payer === 'driver');
  } else if (appState.paymentsFilter === 'owner') {
    list = list.filter(p => p.payer !== 'driver');
  }

  const s = appState.settings || {};
  const today = getTodayShamsi();

  const rptTruck = document.getElementById('rptTruckInfo');
  if (rptTruck) {
    rptTruck.textContent = `تریلی: ${s.truck_model || '---'} (پلاک ${s.plate_number || '---'}) | مالک: ${s.owner_name || '---'} | راننده: ${s.driver_name || '---'}`;
  }
  const rptDate = document.getElementById('rptGeneratedDate');
  if (rptDate) {
    rptDate.textContent = `تاریخ گزارش: ${today}`;
  }

  const totalDriverTransfers = list
    .filter(p => p.payer === 'driver' && p.is_approved !== false)
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalAdvances = list
    .filter(p => p.payer !== 'driver')
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const rptTransfersEl = document.getElementById('rptTotalDriverTransfers');
  if (rptTransfersEl) rptTransfersEl.textContent = formatToman(totalDriverTransfers) + ' تومان';
  const rptAdvancesEl = document.getElementById('rptTotalAdvances');
  if (rptAdvancesEl) rptAdvancesEl.textContent = formatToman(totalAdvances) + ' تومان';
  const rptCountEl = document.getElementById('rptTotalCount');
  if (rptCountEl) rptCountEl.textContent = `${list.length} فقره`;

  const tbody = document.getElementById('rptTableBody');
  if (tbody) {
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="color:#94a3b8; padding:16px;">هیچ واریزی در این فیلتر ثبت نشده است.</td></tr>`;
    } else {
      tbody.innerHTML = list.map((p, idx) => {
        const isDriver = p.payer === 'driver';
        const typeBadge = isDriver 
          ? '<span style="color:#15803d; font-weight:700;">واریز راننده به کارت من</span>'
          : '<span style="color:#b91c1c; font-weight:700;">مساعده به راننده</span>';
        const statusBadge = p.is_settled
          ? '<span style="color:#475569;">تسویه شده</span>'
          : (p.is_approved ? '<span style="color:#16a34a;">تایید شده</span>' : '<span style="color:#d97706;">در انتظار تایید</span>');

        return `
          <tr>
            <td>${idx + 1}</td>
            <td>${p.payment_date || '---'}</td>
            <td>${typeBadge}</td>
            <td style="font-weight:800;">${formatToman(p.amount || 0)}</td>
            <td>${p.payment_method || 'کارت'}</td>
            <td style="font-size:10px;">${p.tracking_code || '---'}</td>
            <td>${statusBadge}</td>
          </tr>
        `;
      }).join('');
    }
  }

  openModal('modalPaymentsReport');
}

function triggerPrintPaymentsReport() {
  window.print();
}
