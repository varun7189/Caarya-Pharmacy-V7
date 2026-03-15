(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const STORAGE_KEYS = {
    inventory: "caarya_inventory_v2",
    transactions: "caarya_transactions_v2",
    settings: "caarya_settings_v2",
    master: "caarya_master_v1",
    skus: "caarya_skus_v1",
    estimate: "caarya_estimate_v1",
  };
  const FIREBASE_COLLECTION = "pharma_v7";
  const FIREBASE_DOC_ID = "main";
  const FIREBASE_CONFIG = window.CAARYA_FIREBASE_CONFIG || null;
  const FIREBASE_READY = () => Boolean(FIREBASE_CONFIG && window.__firebase);
  const MASTER_FILE = "master.json";
  const MASTER_SAVE_LIMIT = 5000;

  const MASTER_FIELDS = [
    "brand_name",
    "manufacturer",
    "active_combined",
    "packaging_raw",
  ];

  const DEFAULT_SETTINGS = {
    hospitalName: "CAARYA Pharmacy",
    defaultUser: "Pharmacy",
    expWindow: 60,
  };

  const state = {
    items: [],
    skus: [],
    tx: [],
    settings: { ...DEFAULT_SETTINGS },
    master: [],
    masterFromFile: false,
    masterIndex: null,
    q: "",
    filter: "all",
    showZeroStock: false,
    skuFilter: "in",
    skuQ: "",
    sortBy: "stock_desc",
    txFilters: { type: "all", from: "", to: "" },
    txQ: "",
    estimate: [],
    estimateQ: "",
    estimateEditId: "",
  };

  const el = {
    brandName: $("#brandName"),
    brandSub: $("#brandSub"),
    dbStatus: $("#dbStatus"),
    todayDate: $("#todayDate"),
    expDaysLabel: $("#expDaysLabel"),
    expiringWindow: $("#expiringWindow"),
    lowStockList: $("#lowStockList"),
    expiringList: $("#expiringList"),
    statDrugs: $("#statDrugs"),
    statUnits: $("#statUnits"),
    statLow: $("#statLow"),
    statExpiring: $("#statExpiring"),
    invCount: $("#invCount"),
    skuCount: $("#skuCount"),
    invTableBody: $("#invTable tbody"),
    skuTableBody: $("#skuTable tbody"),
    recentTxBody: $("#recentTxTable tbody"),
    txTableBody: $("#txTable tbody"),
    txTypeFilter: $("#txTypeFilter"),
    txFrom: $("#txFrom"),
    txTo: $("#txTo"),
    txApply: $("#txApply"),
    txReset: $("#txReset"),
    txSearch: $("#txSearch"),
    estimateSearch: $("#estimateSearch"),
    estimateCount: $("#estimateCount"),
    estimateTotals: $("#estimateTotals"),
    estimateTableBody: $("#estimateTable tbody"),
    estimateListBody: $("#estimateListTable tbody"),
    estimateClearAll: $("#estimateClearAll"),
    estimateImportFile: $("#estimateImportFile"),
    estimateImportBtn: $("#estimateImportBtn"),
    sortBy: $("#sortBy"),
    showZeroStock: $("#showZeroStock"),
    skuSearch: $("#skuSearch"),
    globalSearch: $("#globalSearch"),
    clearSearch: $("#clearSearch"),
    btnNewDrug: $("#btnNewDrug"),
    btnStockIn: $("#btnStockIn"),
    btnStockOut: $("#btnStockOut"),
    gotoTransactions: $("#gotoTransactions"),
    exportInventory: $("#exportInventory"),
    exportEstimate: $("#exportEstimate"),
    exportTransactions: $("#exportTransactions"),
    exportSkus: $("#exportSkus"),
    exportBackupJson: $("#exportBackupJson"),
    exportBackupJsonNoMaster: $("#exportBackupJsonNoMaster"),
    importFile: $("#importFile"),
    importBtn: $("#importBtn"),
    skuImportFile: $("#skuImportFile"),
    skuImportBtn: $("#skuImportBtn"),
    loadMasterBtn: $("#loadMasterBtn"),
    masterFile: $("#masterFile"),
    importMasterBtn: $("#importMasterBtn"),
    clearMasterBtn: $("#clearMasterBtn"),
    wipeAll: $("#wipeAll"),
    setHospital: $("#setHospital"),
    setUser: $("#setUser"),
    setExpWindow: $("#setExpWindow"),
    saveSettings: $("#saveSettings"),
    seedDemo: $("#seedDemo"),
    authEmail: $("#authEmail"),
    authPassword: $("#authPassword"),
    authLogin: $("#authLogin"),
    authSignup: $("#authSignup"),
    authLogout: $("#authLogout"),
    authStatus: $("#authStatus"),
    authUser: $("#authUser"),
    modalBackdrop: $("#modalBackdrop"),
    modalTitle: $("#modalTitle"),
    modalSub: $("#modalSub"),
    modalForm: $("#modalForm"),
    modalClose: $("#modalClose"),
    modalCancel: $("#modalCancel"),
    modalSave: $("#modalSave"),
    modal: $(".modal"),
    toasts: $("#toasts"),
    navItems: $$(".navItem"),
    views: $$(".view"),
    filterChips: $$(".chipBtn[data-filter]"),
    skuFilterChips: $$(".chipBtn[data-sku-filter]"),
  };

  let modalState = { type: "", data: null };
  let firebaseDb = null;
  let firebaseDocRef = null;
  let firebaseSaveTimer = null;
  let firebaseAuth = null;
  let firebaseUser = null;
  let authInitialized = false;

  const nowISO = () => new Date().toISOString();
  const todayYMD = () => new Date().toISOString().slice(0, 10);

  const toNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  const uid = () =>
    (crypto?.randomUUID?.() ||
      "id_" + Math.random().toString(16).slice(2) + Date.now().toString(16));

  const fmtMoney = (n) => {
    const val = toNumber(n, 0);
    try {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
      }).format(val);
    } catch {
      return "INR " + val.toFixed(2);
    }
  };

  const formatDateTime = (iso) => {
    if (!iso) return "-";
    try {
      return new Date(iso).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return iso;
    }
  };

  const daysBetween = (aYmd, bYmd) => {
    const a = new Date(aYmd + "T00:00:00");
    const b = new Date(bYmd + "T00:00:00");
    return Math.round((b - a) / (1000 * 60 * 60 * 24));
  };

  const formatMonthYear = (expiry) => {
    const val = normalizeExpiry(expiry);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return "";
    try {
      const dt = new Date(val + "T00:00:00");
      return dt.toLocaleString("en-IN", { month: "long", year: "numeric" });
    } catch {
      return "";
    }
  };

  const buildBatchOptionsForBrand = (brand, opts = {}) => {
    const { inStockOnly = false } = opts;
    const map = new Map();
    state.items
      .filter((item) => item.brand_name === brand && item.batch)
      .filter((item) => (!inStockOnly ? true : toNumber(item.stock, 0) > 0))
      .forEach((item) => {
        const key = String(item.batch).trim();
        if (!key) return;
        const exp = normalizeExpiry(item.expiry);
        if (!map.has(key)) {
          map.set(key, { batch: key, expiry: exp, stock: toNumber(item.stock, 0) });
          return;
        }
        const existing = map.get(key);
        existing.stock = toNumber(existing.stock, 0) + toNumber(item.stock, 0);
        if (exp && (!existing.expiry || exp < existing.expiry)) {
          map.set(key, { ...existing, batch: key, expiry: exp });
        }
      });

    const list = Array.from(map.values()).map((row) => {
      const valid = /^\d{4}-\d{2}-\d{2}$/.test(row.expiry || "");
      const expired = valid ? daysBetween(todayYMD(), row.expiry) < 0 : false;
      return { ...row, valid, expired };
    });

    list.sort((a, b) => {
      if (a.valid && b.valid) return a.expiry.localeCompare(b.expiry);
      if (a.valid) return -1;
      if (b.valid) return 1;
      return a.batch.localeCompare(b.batch);
    });

    const firstUpcoming = list.find((row) => row.valid && !row.expired);
    return list.map((row) => ({
      ...row,
      isEarliestUpcoming: firstUpcoming ? row.batch === firstUpcoming.batch : false,
    }));
  };

  const csvEscape = (value) => {
    const str = String(value ?? "");
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const normalizeExpiry = (value) => {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
    if (/^\d{2}\/\d{4}$/.test(raw)) {
      const [mm, yyyy] = raw.split("/");
      return `${yyyy}-${mm}-01`;
    }
    return raw;
  };

  const expiryToMonthValue = (expiry) => {
    const val = normalizeExpiry(expiry);
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val.slice(0, 7);
    return "";
  };

  const monthValueToExpiry = (monthValue) => {
    if (!monthValue) return "";
    if (/^\d{4}-\d{2}$/.test(monthValue)) return `${monthValue}-01`;
    return normalizeExpiry(monthValue);
  };

  const normalizeItem = (item) => {
    const base = item || {};
    return {
      id: base.id || uid(),
      brand_name: String(base.brand_name ?? base.name ?? "").trim(),
      manufacturer: String(base.manufacturer ?? "").trim(),
      packaging_raw: String(base.packaging_raw ?? "").trim(),
      active_combined: String(base.active_combined ?? base.salt ?? "").trim(),
      batch: String(base.batch ?? "").trim(),
      expiry: normalizeExpiry(base.expiry),
      stock: toNumber(base.stock, 0),
      min_stock: toNumber(base.min_stock ?? base.minStock, 0),
      mrp: toNumber(base.mrp, 0),
      purchase: toNumber(base.purchase, 0),
      purchase_date: String(base.purchase_date ?? "").trim(),
      supplier: String(base.supplier ?? "").trim(),
      createdAt: base.createdAt || nowISO(),
      updatedAt: base.updatedAt || nowISO(),
    };
  };

  const normalizeSku = (sku) => {
    const base = sku || {};
    return {
      id: base.id || uid(),
      brand_name: String(base.brand_name ?? "").trim(),
      manufacturer: String(base.manufacturer ?? "").trim(),
      packaging_raw: String(base.packaging_raw ?? "").trim(),
      active_combined: String(base.active_combined ?? "").trim(),
      min_stock: toNumber(base.min_stock ?? base.minStock, 0),
      indicative_mrp: toNumber(base.indicative_mrp ?? base.indicativeMrp ?? 0, 0),
      createdAt: base.createdAt || nowISO(),
      updatedAt: base.updatedAt || nowISO(),
    };
  };

  const normalizeMasterEntry = (entry) => {
    const base = entry || {};
    return {
      brand_name: String(base.brand_name ?? "").trim(),
      manufacturer: String(base.manufacturer ?? "").trim(),
      active_combined: String(base.active_combined ?? "").trim(),
      packaging_raw: String(base.packaging_raw ?? "").trim(),
      indicative_mrp: toNumber(
        base.indicative_mrp ?? base.indicativeMrp ?? base.mrp ?? base.price_inr ?? 0,
        0
      ),
    };
  };

  const buildMasterFromItems = (items) => {
    const seen = new Set();
    const out = [];
    items.forEach((item) => {
      const entry = normalizeMasterEntry(item);
      const key = MASTER_FIELDS.map((f) => entry[f]).join("|").toLowerCase();
      if (!key.replace(/\|/g, "").trim()) return;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(entry);
    });
    return out;
  };

  const buildMasterFromSkus = (skus) => {
    const seen = new Set();
    const out = [];
    skus.forEach((sku) => {
      const entry = normalizeMasterEntry(sku);
      const key = MASTER_FIELDS.map((f) => entry[f]).join("|").toLowerCase();
      if (!key.replace(/\|/g, "").trim()) return;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(entry);
    });
    return out;
  };

  const mergeMasterEntries = (master, extraEntries) => {
    const merged = master.map(normalizeMasterEntry);
    const extra = (extraEntries || []).map(normalizeMasterEntry);
    const seen = new Set(
      merged.map((e) => MASTER_FIELDS.map((f) => e[f]).join("|").toLowerCase())
    );
    extra.forEach((entry) => {
      const key = MASTER_FIELDS.map((f) => entry[f]).join("|").toLowerCase();
      if (!key.replace(/\|/g, "").trim()) return;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(entry);
      }
    });
    return merged;
  };

  const upsertMasterEntry = (item) => {
    const entry = normalizeMasterEntry(item);
    const key = MASTER_FIELDS.map((f) => entry[f]).join("|").toLowerCase();
    if (!key.replace(/\|/g, "").trim()) return;
    const exists = state.master.some(
      (row) =>
        MASTER_FIELDS.map((f) => row[f]).join("|").toLowerCase() === key
    );
    if (!exists) {
      state.master.push(entry);
      buildMasterIndex();
    }
  };

  const propagateSkuToBatches = (oldSku, sku) => {
    if (!oldSku) return;
    const oldKey = skuKey(oldSku);
    state.items.forEach((item) => {
      if (skuKey(item) !== oldKey) return;
      item.brand_name = sku.brand_name;
      item.manufacturer = sku.manufacturer;
      item.active_combined = sku.active_combined;
      item.packaging_raw = sku.packaging_raw;
      item.min_stock = sku.min_stock;
      item.updatedAt = nowISO();
    });
  };

  const upsertSku = (data, oldSku) => {
    const sku = normalizeSku({
      id: data.get("id") || uid(),
      brand_name: data.get("brand_name").trim(),
      manufacturer: data.get("manufacturer").trim(),
      packaging_raw: data.get("packaging_raw").trim(),
      active_combined: data.get("active_combined").trim(),
      min_stock: toNumber(data.get("min_stock"), 0),
      indicative_mrp: toNumber(data.get("indicative_mrp"), 0),
      createdAt: oldSku?.createdAt || nowISO(),
      updatedAt: nowISO(),
    });

    if (!sku.brand_name) {
      showToast("Missing name", "Brand name is required.", "warn");
      return null;
    }

    const key = skuKey(sku);
    const index = state.skus.findIndex((s) => skuKey(s) === key || s.id === sku.id);
    if (index >= 0) state.skus[index] = { ...state.skus[index], ...sku };
    else state.skus.unshift(sku);

    propagateSkuToBatches(oldSku, sku);
    upsertMasterEntry(sku);
    saveState();
    renderAll();
    showToast("Saved", "SKU updated.", "good");
    return sku;
  };

  const buildMasterIndex = () => {
    const byField = {};
    const allOptions = {};
    MASTER_FIELDS.forEach((field) => {
      byField[field] = new Map();
      allOptions[field] = new Set();
    });
    state.master.forEach((entry, idx) => {
      MASTER_FIELDS.forEach((field) => {
        const val = String(entry[field] ?? "").trim();
        if (!val) return;
        allOptions[field].add(val);
        const key = val.toLowerCase();
        const map = byField[field];
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(idx);
      });
    });
    const allSorted = {};
    MASTER_FIELDS.forEach((field) => {
      allSorted[field] = Array.from(allOptions[field]).sort((a, b) => a.localeCompare(b));
    });
    state.masterIndex = { byField, allOptions: allSorted, total: state.master.length };
  };

  const buildSkusFromItems = (items) => {
    const seen = new Set();
    const out = [];
    items.forEach((item) => {
      const sku = normalizeSku(item);
      const key = [
        sku.brand_name,
        sku.manufacturer,
        sku.active_combined,
        sku.packaging_raw,
        toNumber(sku.min_stock, 0),
      ]
        .map((v) => String(v ?? "").trim())
        .join("|")
        .toLowerCase();
      if (!key.replace(/\|/g, "").trim()) return;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(sku);
    });
    return out;
  };

  const mergeSkus = (skus, items) => {
    const merged = skus.map(normalizeSku);
    const extra = buildSkusFromItems(items);
    const seen = new Set(
      merged
        .map((s) =>
          [
            s.brand_name,
            s.manufacturer,
            s.active_combined,
            s.packaging_raw,
            toNumber(s.min_stock, 0),
          ]
            .map((v) => String(v ?? "").trim())
            .join("|")
            .toLowerCase()
        )
    );
    extra.forEach((s) => {
      const key = [
        s.brand_name,
        s.manufacturer,
        s.active_combined,
        s.packaging_raw,
        toNumber(s.min_stock, 0),
      ]
        .map((v) => String(v ?? "").trim())
        .join("|")
        .toLowerCase();
      if (!key.replace(/\|/g, "").trim()) return;
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(s);
    });
    return merged;
  };

  const filterMasterEntries = (filters) => {
    const normalized = {};
    MASTER_FIELDS.forEach((field) => {
      const val = String(filters?.[field] ?? "").trim().toLowerCase();
      if (val) normalized[field] = val;
    });
    return state.master.filter((entry) =>
      Object.entries(normalized).every(
        ([field, value]) => String(entry[field] ?? "").trim().toLowerCase() === value
      )
    );
  };

  const getMasterOptions = (field, selections) => {
    const filters = { ...selections };
    delete filters[field];
    const entries = filterMasterEntries(filters);
    const values = new Set(
      entries.map((entry) => entry[field]).filter((val) => String(val ?? "").trim())
    );
    if (selections?.[field]) values.add(selections[field]);
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  };

  const parseCSV = (text) => {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      const next = text[i + 1];

      if (c === '"' && inQuotes && next === '"') {
        field += '"';
        i++;
        continue;
      }

      if (c === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      if (c === "," && !inQuotes) {
        row.push(field);
        field = "";
        continue;
      }

      if ((c === "\n" || c === "\r") && !inQuotes) {
        if (c === "\r" && next === "\n") i++;
        row.push(field);
        field = "";
        if (row.some((x) => x.trim().length > 0)) rows.push(row);
        row = [];
        continue;
      }

      field += c;
    }

    row.push(field);
    if (row.some((x) => x.trim().length > 0)) rows.push(row);
    return rows;
  };

  const loadStateFromLocal = () => {
    const rawItems = localStorage.getItem(STORAGE_KEYS.inventory);
    const rawTx = localStorage.getItem(STORAGE_KEYS.transactions);
    const rawSettings = localStorage.getItem(STORAGE_KEYS.settings);
    const rawMaster = localStorage.getItem(STORAGE_KEYS.master);
    const rawSkus = localStorage.getItem(STORAGE_KEYS.skus);
    const rawEstimate = localStorage.getItem(STORAGE_KEYS.estimate);

    try {
      state.items = rawItems ? JSON.parse(rawItems) : [];
    } catch {
      state.items = [];
    }

    try {
      state.tx = rawTx ? JSON.parse(rawTx) : [];
    } catch {
      state.tx = [];
    }

    try {
      state.settings = rawSettings
        ? { ...DEFAULT_SETTINGS, ...JSON.parse(rawSettings) }
        : { ...DEFAULT_SETTINGS };
    } catch {
      state.settings = { ...DEFAULT_SETTINGS };
    }

    try {
      state.skus = rawSkus ? JSON.parse(rawSkus) : [];
    } catch {
      state.skus = [];
    }

    try {
      state.master = rawMaster ? JSON.parse(rawMaster) : [];
    } catch {
      state.master = [];
    }

    try {
      state.estimate = rawEstimate ? JSON.parse(rawEstimate) : [];
    } catch {
      state.estimate = [];
    }

    state.items = state.items.map(normalizeItem);
    state.skus = mergeSkus(state.skus, state.items).map(normalizeSku);
    if (!Array.isArray(state.master)) state.master = [];
    state.master = mergeMasterEntries(
      state.master,
      buildMasterFromSkus(state.skus)
    );
    buildMasterIndex();
  };

  const saveStateToLocal = () => {
    localStorage.setItem(STORAGE_KEYS.inventory, JSON.stringify(state.items));
    localStorage.setItem(STORAGE_KEYS.skus, JSON.stringify(state.skus));
    localStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(state.tx));
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
    localStorage.setItem(STORAGE_KEYS.estimate, JSON.stringify(state.estimate));
    if (!state.masterFromFile || state.master.length <= MASTER_SAVE_LIMIT) {
      localStorage.setItem(STORAGE_KEYS.master, JSON.stringify(state.master));
    }
  };

  const initFirebase = () => {
    if (!FIREBASE_READY()) {
      setDbStatus("Firebase: not configured", false);
      return false;
    }
    try {
      const { initializeApp, getFirestore, doc } = window.__firebase;
      const app = initializeApp(FIREBASE_CONFIG);
      firebaseDb = getFirestore(app);
      firebaseDocRef = doc(firebaseDb, FIREBASE_COLLECTION, FIREBASE_DOC_ID);
      setDbStatus("Firebase: connected", true);
      return true;
    } catch (err) {
      console.error("Firebase init failed", err);
      setDbStatus("Firebase: init failed", false);
      return false;
    }
  };

  const updateAuthUI = () => {
    if (!el.authStatus || !el.authUser) return;
    const ready = FIREBASE_READY();
    const user = firebaseUser;

    el.authStatus.textContent = ready
      ? user
        ? "Signed in"
        : "Not signed in"
      : "Firebase not configured";

    el.authUser.textContent = user ? user.email || user.uid : "—";

    if (el.authLogin) el.authLogin.disabled = !ready;
    if (el.authSignup) el.authSignup.disabled = !ready;
    if (el.authLogout) el.authLogout.disabled = !ready || !user;
  };

  const initAuth = () =>
    new Promise((resolve) => {
      if (!FIREBASE_READY()) {
        updateAuthUI();
        resolve(false);
        return;
      }
      try {
        const { getAuth, onAuthStateChanged } = window.__firebase;
        firebaseAuth = getAuth();
        onAuthStateChanged(firebaseAuth, async (user) => {
          const first = !authInitialized;
          authInitialized = true;
          firebaseUser = user || null;
          updateAuthUI();
          if (firebaseUser) {
            await loadStateFromFirebase();
            updateSettingsUI();
            renderAll();
            if (!first) showToast("Signed in", firebaseUser.email || "User ready", "good");
          } else {
            setDbStatus("Firebase: sign in required", false);
            if (!first) showToast("Signed out", "Local-only mode", "warn");
          }
          if (first) resolve(true);
        });
      } catch (err) {
        console.error("Firebase auth init failed", err);
        updateAuthUI();
        resolve(false);
      }
    });

  const getActorLabel = () => {
    if (firebaseUser?.email) return firebaseUser.email;
    if (firebaseUser?.displayName) return firebaseUser.displayName;
    return state.settings.defaultUser || "Pharmacy";
  };

  const hydrateState = () => {
    state.items = state.items.map(normalizeItem);
    state.skus = mergeSkus(state.skus, state.items).map(normalizeSku);
    if (!Array.isArray(state.master)) state.master = [];
    state.master = mergeMasterEntries(
      state.master,
      buildMasterFromSkus(state.skus)
    );
    buildMasterIndex();
  };

  const loadStateFromFirebase = async () => {
    if (!firebaseDocRef) return false;
    setDbStatus("Firebase: syncing…", false);
    const { getDoc } = window.__firebase;
    try {
      const snap = await getDoc(firebaseDocRef);
      if (snap.exists()) {
        const data = snap.data() || {};
        state.items = Array.isArray(data.items) ? data.items : [];
        state.tx = Array.isArray(data.tx) ? data.tx : [];
        state.skus = Array.isArray(data.skus) ? data.skus : [];
        state.estimate = Array.isArray(data.estimate) ? data.estimate : [];
        state.settings = data.settings
          ? { ...DEFAULT_SETTINGS, ...data.settings }
          : { ...DEFAULT_SETTINGS };
        state.master = Array.isArray(data.master) ? data.master : [];
        state.masterFromFile = Boolean(data.masterFromFile);
      } else {
        state.items = [];
        state.tx = [];
        state.skus = [];
        state.estimate = [];
        state.settings = { ...DEFAULT_SETTINGS };
        state.master = [];
        state.masterFromFile = false;
      }
      hydrateState();
      setDbStatus("Firebase: synced", true);
      return true;
    } catch (err) {
      console.error("Firebase load failed", err);
      setDbStatus("Firebase: load failed", false);
      return false;
    }
  };

  const flushFirebaseSave = async () => {
    firebaseSaveTimer = null;
    if (!firebaseDocRef) return;
    const { setDoc, serverTimestamp } = window.__firebase;
    const payload = {
      items: state.items,
      tx: state.tx,
      skus: state.skus,
      estimate: state.estimate,
      settings: state.settings,
      masterFromFile: state.masterFromFile,
      updatedAt: serverTimestamp(),
    };
    // Keep master local-only: do not sync to Firebase.
    try {
      setDbStatus("Firebase: saving…", true);
      await setDoc(firebaseDocRef, payload, { merge: true });
      setDbStatus("Firebase: synced", true);
    } catch (err) {
      console.error("Firebase save failed", err);
      setDbStatus("Firebase: save failed", false);
      showToast("Save failed", "Could not sync to Firebase.", "bad");
    }
  };

  const saveState = () => {
    if (!firebaseDocRef) {
      saveStateToLocal();
      return;
    }
    if (firebaseSaveTimer) clearTimeout(firebaseSaveTimer);
    firebaseSaveTimer = setTimeout(flushFirebaseSave, 600);
  };

  const loadState = async () => {
    const ok = initFirebase();
    if (ok) {
      await initAuth();
      if (firebaseUser) return;
      loadStateFromLocal();
      setDbStatus("Firebase: sign in required", false);
      return;
    }
    loadStateFromLocal();
    setDbStatus("Local DB: ready", true);
  };

  const loadMasterFromFile = async () => {
    try {
      setMasterLoading(true, "Loading master.json…");
      const res = await fetch(MASTER_FILE, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data)) {
        showToast("Master load failed", "Master JSON must be an array.", "bad");
        return;
      }
      state.master = mergeMasterEntries(
        data,
        buildMasterFromSkus(state.skus)
      );
      state.masterFromFile = true;
      buildMasterIndex();
      saveState();
      showToast("Master loaded", `${state.master.length.toLocaleString()} rows ready.`, "good");
    } catch (err) {
      showToast(
        "Master load failed",
        "Could not load master.json. Use a local server (not file://).",
        "bad"
      );
    } finally {
      setMasterLoading(false);
    }
  };

  const importMasterFromUpload = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setMasterLoading(true, "Importing master…");
      try {
        const data = JSON.parse(String(reader.result || "[]"));
        if (!Array.isArray(data)) {
          showToast("Master import failed", "JSON must be an array.", "bad");
          return;
        }
        state.master = mergeMasterEntries(
          data,
          buildMasterFromSkus(state.skus)
        );
        state.masterFromFile = true;
        buildMasterIndex();
        saveState();
        showToast("Master imported", `${state.master.length.toLocaleString()} rows ready.`, "good");
      } catch {
        showToast("Master import failed", "Invalid JSON file.", "bad");
      } finally {
        setMasterLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const showToast = (title, message, kind = "info") => {
    if (!el.toasts) return;

    const toast = document.createElement("div");
    toast.className = "toast";

    const dotColor =
      kind === "good"
        ? "var(--good)"
        : kind === "warn"
        ? "var(--warn)"
        : kind === "bad"
        ? "var(--bad)"
        : "var(--primary)";

    toast.innerHTML = `
      <div class="toastRow">
        <span class="toastDot" style="background:${dotColor}"></span>
        <div class="toastMsg">
          <strong>${title}</strong>
          <span>${message}</span>
        </div>
      </div>
    `;

    el.toasts.appendChild(toast);
    setTimeout(() => toast.remove(), 2600);
  };

  const setDbStatus = (label, good = true) => {
    if (!el.dbStatus) return;
    const dot = el.dbStatus.querySelector(".dot");
    const text = el.dbStatus.querySelector("span:last-child");
    if (dot) dot.style.background = good ? "var(--good)" : "var(--warn)";
    if (text) text.textContent = label;
  };

  const updateSettingsUI = () => {
    if (el.setHospital) el.setHospital.value = state.settings.hospitalName || "";
    if (el.setUser) el.setUser.value = state.settings.defaultUser || "";
    if (el.setExpWindow) el.setExpWindow.value = String(state.settings.expWindow || 60);
    if (el.expiringWindow) el.expiringWindow.value = String(state.settings.expWindow || 60);
    if (el.expDaysLabel) el.expDaysLabel.textContent = String(state.settings.expWindow || 60);
    if (el.brandName) el.brandName.textContent = state.settings.hospitalName || "CAARYA Pharmacy";
  };

  const getExpiryInfo = (item) => {
    if (!item.expiry) return { days: null, expired: false, expiring: false };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.expiry)) {
      return { days: null, expired: false, expiring: false };
    }
    const days = daysBetween(todayYMD(), item.expiry);
    const expired = days < 0;
    const expiring = days >= 0 && days <= toNumber(state.settings.expWindow, 60);
    return { days, expired, expiring };
  };

  const isLowStock = (item) => {
    const stock = toNumber(item.stock, 0);
    const min = toNumber(item.min_stock, 0);
    return stock > 0 && min > 0 && stock <= min;
  };

  const buildSkuTotals = () => {
    const totals = new Map();
    state.items.forEach((item) => {
      const key = skuKey(item);
      totals.set(key, (totals.get(key) || 0) + toNumber(item.stock, 0));
    });
    return totals;
  };

  const matchesSearch = (item, q) => {
    if (!q) return true;
    const s = q.trim().toLowerCase();
    if (!s) return true;
    const hay = [
      item.brand_name,
      item.manufacturer,
      item.dosage_form,
      item.pack_unit,
      item.active_combined,
      item.batch,
      item.supplier,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(s);
  };

  const applyInventoryFilters = () => {
    let items = state.items.filter((it) => matchesSearch(it, state.q));

    if (state.filter === "zero") {
      items = items.filter((it) => toNumber(it.stock, 0) === 0);
    } else {
      if (!state.showZeroStock) {
        items = items.filter((it) => toNumber(it.stock, 0) > 0);
      }
      if (state.filter === "total_low") {
        const totals = buildSkuTotals();
        items = items.filter((it) => {
          const total = totals.get(skuKey(it)) || 0;
          const min = toNumber(it.min_stock, 0);
          return total > 0 && min > 0 && total <= min;
        });
      } else if (state.filter === "expiring") {
        items = items.filter((it) => getExpiryInfo(it).expiring);
      } else if (state.filter === "expired") {
        items = items.filter((it) => getExpiryInfo(it).expired);
      }
    }

    items.sort((a, b) => {
      if (state.sortBy === "name")
        return (a.brand_name || "").localeCompare(b.brand_name || "");
      if (state.sortBy === "stock_desc") return toNumber(b.stock) - toNumber(a.stock);
      if (state.sortBy === "stock_asc") return toNumber(a.stock) - toNumber(b.stock);
      if (state.sortBy === "expiry_asc") return (a.expiry || "9999-12-31").localeCompare(b.expiry || "9999-12-31");
      if (state.sortBy === "expiry_desc") return (b.expiry || "0000-01-01").localeCompare(a.expiry || "0000-01-01");
      return 0;
    });

    return items;
  };

  const skuKey = (item) =>
    [
      item.brand_name,
      item.manufacturer,
      item.active_combined,
      item.packaging_raw,
      toNumber(item.min_stock, 0),
    ]
      .map((v) => String(v ?? "").trim())
      .join("|");

  const renderInventory = () => {
    if (!el.invTableBody) return;

    const items = applyInventoryFilters();
    const brandTotals = new Map();
    state.items.forEach((it) => {
      const brand = (it.brand_name || "").trim();
      if (!brand) return;
      brandTotals.set(brand, toNumber(brandTotals.get(brand), 0) + toNumber(it.stock, 0));
    });
    const total = state.items.length;
    const count = items.length;

    el.invTableBody.innerHTML = "";

    if (count === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="13" class="emptyRow">No inventory items yet.</td>`;
      el.invTableBody.appendChild(tr);
    } else {
      items.forEach((item) => {
        const tr = document.createElement("tr");
        const brandKey = (item.brand_name || "").trim();
        const brandName = brandKey || "-";
        const brandTotal = toNumber(brandTotals.get(brandKey), 0);
        tr.innerHTML = `
          <td>
            <button class="linkBtn" data-action="viewBrandTx" data-id="${item.id}" data-brand="${escapeHtml(
          item.brand_name || ""
        )}">${brandName}</button>
            ${brandKey ? `<div class="brandSub">Total stock: ${brandTotal}</div>` : ""}
          </td>
          <td>${item.manufacturer || "-"}</td>
          <td>${item.active_combined || "-"}</td>
          <td>${item.packaging_raw || "-"}</td>
          <td class="right">${toNumber(item.min_stock, 0)}</td>
          <td class="right"><strong>${toNumber(item.stock, 0)}</strong></td>
          <td class="mono">${item.batch || "-"}</td>
          <td class="nowrap">${item.expiry || "-"}</td>
          <td class="right">${fmtMoney(item.mrp || 0)}</td>
          <td class="right">${fmtMoney(item.purchase || 0)}</td>
          <td>${item.purchase_date || "-"}</td>
          <td>${item.supplier || "-"}</td>
          <td class="right">
            <div class="tableActions">
              <button class="ghost" data-action="editBatch" data-id="${item.id}">Edit</button>
              <button class="ghost" data-action="in" data-id="${item.id}">In</button>
              <button class="ghost" data-action="out" data-id="${item.id}">Out</button>
            </div>
          </td>
        `;
        el.invTableBody.appendChild(tr);
      });
    }

    if (el.invCount) {
      el.invCount.textContent = `Showing ${count} of ${total} item(s)`;
    }
  };

  const resolveEstimateEntry = (entry) => {
    const item = state.items.find((it) => it.id === entry.item_id);
    return {
      item_id: entry.item_id,
      qty: toNumber(entry.qty, 0),
      brand_name: entry.brand_name || item?.brand_name || "-",
      manufacturer: entry.manufacturer || item?.manufacturer || "-",
      active_combined: entry.active_combined || item?.active_combined || "-",
      packaging_raw: entry.packaging_raw || item?.packaging_raw || "-",
      batch: entry.batch || item?.batch || "-",
      expiry: entry.expiry || item?.expiry || "-",
      mrp: toNumber(entry.mrp ?? item?.mrp, 0),
      purchase: toNumber(entry.purchase ?? item?.purchase, 0),
    };
  };

  const renderEstimate = () => {
    if (!el.estimateTableBody || !el.estimateListBody) return;

    const q = state.estimateQ.trim();
    const matches = state.items.filter((it) => matchesSearch(it, q));
    const totalMatches = matches.length;
    const results = matches.slice(0, 5);

    el.estimateTableBody.innerHTML = "";
    if (!results.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="10" class="emptyRow">No matches found.</td>`;
      el.estimateTableBody.appendChild(tr);
    } else {
      results.forEach((item) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${item.brand_name || "-"}</td>
          <td>${item.manufacturer || "-"}</td>
          <td>${item.active_combined || "-"}</td>
          <td>${item.packaging_raw || "-"}</td>
          <td class="right"><strong>${toNumber(item.stock, 0)}</strong></td>
          <td class="mono">${item.batch || "-"}</td>
          <td class="nowrap">${item.expiry || "-"}</td>
          <td class="right">${fmtMoney(item.mrp || 0)}</td>
          <td class="right">${fmtMoney(item.purchase || 0)}</td>
          <td class="right">
            <div class="tableActions">
              <button class="ghost" data-action="estimateAdd" data-id="${item.id}">Add</button>
            </div>
          </td>
        `;
        el.estimateTableBody.appendChild(tr);
      });
    }

    if (el.estimateCount) {
      el.estimateCount.textContent = `Showing ${results.length} of ${totalMatches} match(es)`;
    }

    el.estimateListBody.innerHTML = "";
    const addRow = document.createElement("tr");
    addRow.className = "estimateAddRow";
    addRow.innerHTML = `
      <td><input id="estimateCustomBrand" class="input" placeholder="Brand" /></td>
      <td><input id="estimateCustomBatch" class="input" placeholder="Batch" /></td>
      <td><input id="estimateCustomExpiry" class="input" placeholder="Expiry" /></td>
      <td class="right"><input id="estimateCustomMrp" class="input right" placeholder="MRP" /></td>
      <td class="right"><input id="estimateCustomPurchase" class="input right" placeholder="Purchase" /></td>
      <td class="right"><input id="estimateCustomQty" class="input right" placeholder="Qty" /></td>
      <td class="right">—</td>
      <td class="right">—</td>
      <td class="right">
        <div class="tableActions">
          <button class="ghost" data-action="estimateAddCustom">Add</button>
        </div>
      </td>
    `;
    el.estimateListBody.appendChild(addRow);

    if (!state.estimate.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="9" class="emptyRow">No items added yet.</td>`;
      el.estimateListBody.appendChild(tr);
    } else {
      state.estimate.forEach((entry) => {
        const row = resolveEstimateEntry(entry);
        const mrpTotal = row.qty * row.mrp;
        const purchaseTotal = row.qty * row.purchase;
        const tr = document.createElement("tr");
        if (state.estimateEditId === row.item_id) {
          tr.dataset.editId = row.item_id;
          tr.innerHTML = `
            <td><input class="input" data-field="brand_name" value="${escapeHtml(
              row.brand_name
            )}" /></td>
            <td><input class="input mono" data-field="batch" value="${escapeHtml(
              row.batch
            )}" /></td>
            <td><input class="input" data-field="expiry" value="${escapeHtml(
              row.expiry
            )}" /></td>
            <td class="right"><input class="input right" data-field="mrp" value="${row.mrp}" /></td>
            <td class="right"><input class="input right" data-field="purchase" value="${row.purchase}" /></td>
            <td class="right"><input class="input right" data-field="qty" value="${row.qty}" /></td>
            <td class="right">${fmtMoney(mrpTotal)}</td>
            <td class="right">${fmtMoney(purchaseTotal)}</td>
            <td class="right">
              <div class="tableActions">
                <button class="ghost" data-action="estimateSave" data-id="${row.item_id}">Save</button>
                <button class="ghost" data-action="estimateCancel" data-id="${row.item_id}">Cancel</button>
              </div>
            </td>
          `;
        } else {
          tr.innerHTML = `
            <td>${row.brand_name}</td>
            <td class="mono">${row.batch}</td>
            <td class="nowrap">${row.expiry}</td>
            <td class="right">${fmtMoney(row.mrp)}</td>
            <td class="right">${fmtMoney(row.purchase)}</td>
            <td class="right"><strong>${row.qty}</strong></td>
            <td class="right">${fmtMoney(mrpTotal)}</td>
            <td class="right">${fmtMoney(purchaseTotal)}</td>
            <td class="right">
              <div class="tableActions">
                <button class="ghost" data-action="estimateEdit" data-id="${row.item_id}">Edit</button>
                <button class="ghost" data-action="estimateRemove" data-id="${row.item_id}">Clear</button>
              </div>
            </td>
          `;
        }
        el.estimateListBody.appendChild(tr);
      });
    }

    const totals = state.estimate.reduce(
      (acc, entry) => {
        const row = resolveEstimateEntry(entry);
        acc.mrp += row.qty * row.mrp;
        acc.purchase += row.qty * row.purchase;
        return acc;
      },
      { mrp: 0, purchase: 0 }
    );

    if (el.estimateTotals) {
      el.estimateTotals.textContent = `Total MRP: ${fmtMoney(
        totals.mrp
      )} · Total Purchase: ${fmtMoney(totals.purchase)}`;
    }
  };

  const addEstimateItem = (item) => {
    if (!item) return;
    const existing = state.estimate.find((e) => e.item_id === item.id);
    if (existing) {
      existing.qty = toNumber(existing.qty, 0) + 1;
    } else {
      state.estimate.push({
        item_id: item.id,
        qty: 1,
        brand_name: item.brand_name || "",
        manufacturer: item.manufacturer || "",
        active_combined: item.active_combined || "",
        packaging_raw: item.packaging_raw || "",
        batch: item.batch || "",
        expiry: item.expiry || "",
        mrp: toNumber(item.mrp, 0),
        purchase: toNumber(item.purchase, 0),
      });
    }
    saveState();
    renderEstimate();
  };

  const addCustomEstimate = (payload) => {
    const brand = String(payload.brand || "").trim();
    const batch = String(payload.batch || "").trim();
    const expiry = String(payload.expiry || "").trim();
    const mrp = toNumber(payload.mrp, 0);
    const purchase = toNumber(payload.purchase, 0);
    const qty = toNumber(payload.qty, 0);

    if (!brand || qty <= 0) {
      showToast("Missing fields", "Brand and quantity are required.", "warn");
      return;
    }

    const key = [
      "custom",
      brand.toLowerCase(),
      batch.toLowerCase(),
      expiry.toLowerCase(),
      mrp,
      purchase,
    ].join("|");
    const existing = state.estimate.find((e) => e.custom_key === key);
    if (existing) {
      existing.qty = toNumber(existing.qty, 0) + qty;
    } else {
      state.estimate.push({
        item_id: `custom:${Date.now()}${Math.random().toString(16).slice(2)}`,
        custom_key: key,
        qty,
        brand_name: brand,
        batch,
        expiry,
        mrp,
        purchase,
      });
    }
    saveState();
    renderEstimate();
  };

  const importEstimateCSV = (text, mode) => {
    const rows = parseCSV(text);
    if (!rows.length) {
      showToast("Import failed", "CSV file is empty.", "warn");
      return;
    }
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const dataRows = rows.slice(1);
    const read = (row, key) => {
      const idx = header.indexOf(key);
      return idx >= 0 ? row[idx] ?? "" : "";
    };

    const incoming = [];
    dataRows.forEach((row) => {
      const brand = String(read(row, "brand_name") || "").trim();
      const batch = String(read(row, "batch") || "").trim();
      const expiry = String(read(row, "expiry") || "").trim();
      const mrp = toNumber(read(row, "mrp"), 0);
      const purchase = toNumber(read(row, "purchase_price"), 0);
      const qty = toNumber(read(row, "qty"), 0);
      const source = String(read(row, "source") || "").trim().toLowerCase();
      if (!brand || qty <= 0) return;
      incoming.push({
        brand_name: brand,
        batch,
        expiry,
        mrp,
        purchase,
        qty,
        source,
      });
    });

    if (!incoming.length) {
      showToast("Import failed", "No valid rows found.", "warn");
      return;
    }

    if (mode === "replace") {
      state.estimate = [];
    }

    incoming.forEach((row) => {
      const key = [
        "custom",
        row.brand_name.toLowerCase(),
        row.batch.toLowerCase(),
        row.expiry.toLowerCase(),
        row.mrp,
        row.purchase,
      ].join("|");
      const existing = state.estimate.find((e) => e.custom_key === key);
      if (existing) {
        existing.qty = toNumber(existing.qty, 0) + row.qty;
      } else {
        state.estimate.push({
          item_id: `custom:${Date.now()}${Math.random().toString(16).slice(2)}`,
          custom_key: key,
          qty: row.qty,
          brand_name: row.brand_name,
          batch: row.batch,
          expiry: row.expiry,
          mrp: row.mrp,
          purchase: row.purchase,
        });
      }
    });

    saveState();
    renderEstimate();
    showToast("Imported", `${incoming.length} row(s) processed.`, "good");
  };

  const removeEstimateItem = (id) => {
    state.estimate = state.estimate.filter((e) => e.item_id !== id);
    saveState();
    renderEstimate();
  };

  const renderSkus = () => {
    if (!el.skuTableBody) return;

    let groups = getSkuGroups();
    if (state.skuFilter === "in") {
      groups = groups.filter((g) => !g.archived && toNumber(g.total_stock, 0) > 0);
    } else if (state.skuFilter === "zero") {
      groups = groups.filter((g) => !g.archived && toNumber(g.total_stock, 0) === 0);
    } else if (state.skuFilter === "archived") {
      groups = groups.filter((g) => g.archived);
    }
    if (state.skuQ) {
      const q = state.skuQ;
      groups = groups.filter((g) => {
        const hay = [
          g.brand_name,
          g.manufacturer,
          g.active_combined,
          g.packaging_raw,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    el.skuTableBody.innerHTML = "";

    if (!groups.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="13" class="emptyRow">No SKUs yet.</td>`;
      el.skuTableBody.appendChild(tr);
    } else {
      groups.forEach((g) => {
        const latest = g.latest_item || {};
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${g.brand_name || "-"}${g.archived ? ' <span class="muted">(Archived)</span>' : ""}</td>
          <td>${g.manufacturer || "-"}</td>
          <td>${g.active_combined || "-"}</td>
          <td>${g.packaging_raw || "-"}</td>
          <td class="right">${toNumber(g.min_stock, 0)}</td>
          <td class="right"><strong>${toNumber(g.total_stock, 0)}</strong></td>
          <td class="right">${g.batch_count}</td>
          <td>${g.earliest_expiry || "-"}</td>
          <td class="right">${fmtMoney(latest.mrp || 0)}</td>
          <td class="right">${fmtMoney(latest.purchase || 0)}</td>
          <td>${latest.supplier || "-"}</td>
          <td>${g.last_stock_in ? formatDateTime(g.last_stock_in) : "-"}</td>
          <td class="right">
            <div class="tableActions">
              <button class="ghost" data-action="editSku" data-key="${escapeHtml(g.key)}">Edit</button>
              <button class="ghost" data-action="archiveSku" data-key="${escapeHtml(g.key)}">
                ${g.archived ? "Unarchive" : "Archive"}
              </button>
              <button class="ghost" data-action="deleteSku" data-key="${escapeHtml(g.key)}">Delete</button>
            </div>
          </td>
        `;
        el.skuTableBody.appendChild(tr);
      });
    }

    if (el.skuCount) {
      el.skuCount.textContent = `Showing ${groups.length} SKU(s)`;
    }
  };

  const renderDashboard = () => {
    const totalItems = state.skus.length;
    const totalUnits = state.items.reduce((sum, it) => sum + toNumber(it.stock, 0), 0);
    const skuGroups = getSkuGroups().filter((g) => !g.archived);
    const lowGroups = skuGroups.filter((g) => {
      const stock = toNumber(g.total_stock, 0);
      const min = toNumber(g.min_stock, 0);
      return stock > 0 && min > 0 && stock <= min;
    });
    const lowCount = lowGroups.length;
    const expCount = state.items.filter((it) => getExpiryInfo(it).expiring).length;

    if (el.statDrugs) el.statDrugs.textContent = String(totalItems);
    if (el.statUnits) el.statUnits.textContent = String(totalUnits);
    if (el.statLow) el.statLow.textContent = String(lowCount);
    if (el.statExpiring) el.statExpiring.textContent = String(expCount);

    if (el.todayDate) {
      el.todayDate.textContent = new Date().toLocaleDateString("en-IN", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }

    if (el.expDaysLabel) el.expDaysLabel.textContent = String(state.settings.expWindow || 60);

    if (el.lowStockList) {
      const lows = [...lowGroups]
        .sort((a, b) => toNumber(a.total_stock) - toNumber(b.total_stock))
        .slice(0, 6);
      el.lowStockList.innerHTML = "";
      if (!lows.length) {
        el.lowStockList.innerHTML = `<div class="alertItem"><strong>All good</strong><span>No low stock items</span></div>`;
      } else {
        lows.forEach((it) => {
          const row = document.createElement("div");
          row.className = "alertItem";
          row.innerHTML = `<strong>${it.brand_name || "-"}</strong><span>${toNumber(
            it.total_stock,
            0
          )} left</span>`;
          el.lowStockList.appendChild(row);
        });
      }
    }

    if (el.expiringList) {
      const expiring = state.items
        .map((it) => ({ item: it, info: getExpiryInfo(it) }))
        .filter((row) => row.info.expiring)
        .sort((a, b) => (a.item.expiry || "").localeCompare(b.item.expiry || ""))
        .slice(0, 6);
      el.expiringList.innerHTML = "";
      if (!expiring.length) {
        el.expiringList.innerHTML = `<div class="alertItem"><strong>Clear</strong><span>No expiring stock</span></div>`;
      } else {
        expiring.forEach(({ item, info }) => {
          const row = document.createElement("div");
          row.className = "alertItem";
          row.innerHTML = `<strong>${item.brand_name || "-"}</strong><span>${item.expiry} (${info.days} days)</span>`;
          el.expiringList.appendChild(row);
        });
      }
    }
  };

  const renderRecentTransactions = () => {
    if (!el.recentTxBody) return;
    const rows = state.tx.slice(0, 20);
    el.recentTxBody.innerHTML = "";

    if (!rows.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="7" class="emptyRow">No transactions yet.</td>`;
      el.recentTxBody.appendChild(tr);
      return;
    }

    rows.forEach((tx) => {
      const item = state.items.find((it) => it.id === tx.drugId);
      const brand = item?.brand_name || tx.brand_name || tx.drugName || "-";
      const batch = item?.batch || tx.batch || "-";
      const bizDate = tx.type === "IN" ? tx.purchase_date : tx.type === "OUT" ? tx.selling_date : "";
      const bizName = tx.type === "IN" ? tx.supplier : tx.type === "OUT" ? tx.customer_name : "";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatDateTime(tx.at)}</td>
        <td>${tx.type || "-"}</td>
        <td>${brand}</td>
        <td class="mono">${batch}</td>
        <td class="right">${toNumber(tx.qty, 0)}</td>
        <td>${bizDate || "-"}</td>
        <td>${bizName || "-"}</td>
      `;
      el.recentTxBody.appendChild(tr);
    });
  };

  const applyTxFilters = () => {
    const { type, from, to } = state.txFilters;
    return state.tx.filter((tx) => {
      const at = tx.at || "";
      if (type !== "all" && tx.type !== type) return false;
      if (from && at < from + "T00:00:00") return false;
      if (to && at > to + "T23:59:59") return false;
      if (state.txQ) {
        const item = state.items.find((it) => it.id === tx.drugId);
        const brand = item?.brand_name || tx.brand_name || tx.drugName || "";
        const batch = item?.batch || tx.batch || "";
        const hay = [
          tx.type,
          brand,
          batch,
          tx.note,
          tx.user,
          tx.supplier,
          tx.customer_name,
          tx.purchase_date,
          tx.selling_date,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(state.txQ)) return false;
      }
      return true;
    });
  };

  const setModalWide = (wide) => {
    if (!el.modal) return;
    el.modal.classList.toggle("wide", Boolean(wide));
  };

  const openTxDetails = (tx) => {
    if (!tx) return;
    if (!el.modalBackdrop || !el.modalForm) return;
    setModalWide(true);
    el.modalForm.classList.add("txDetails");
    if (el.modalTitle) el.modalTitle.textContent = "Transaction details";
    if (el.modalSub) el.modalSub.textContent = tx.type || "-";
    if (el.modalSave) el.modalSave.textContent = "Close";

    const item = state.items.find((it) => it.id === tx.drugId);
    const recordedBrand = tx.brand_name || tx.drugName || "-";
    const recordedBatch = tx.batch || "-";
    const currentBrand = item?.brand_name || recordedBrand;
    const currentBatch = item?.batch || recordedBatch;
    const sku = state.skus.find((s) => s.brand_name === currentBrand) || state.skus.find((s) => s.brand_name === recordedBrand);
    const skuParts = [sku?.manufacturer, sku?.active_combined, sku?.packaging_raw]
      .map((v) => String(v || "").trim())
      .filter(Boolean);
    const skuDetails = skuParts.length ? skuParts.join(" • ") : "-";

    el.modalForm.innerHTML = `
      <div class="formGrid">
        <label class="field">
          <span>Date/Time</span>
          <input class="input" value="${escapeHtml(formatDateTime(tx.at))}" readonly />
        </label>
        <label class="field">
          <span>Type</span>
          <input class="input" value="${escapeHtml(tx.type || "-")}" readonly />
        </label>
      </div>
      <div class="formGrid">
        <label class="field">
          <span>Brand ${
            currentBrand !== recordedBrand
              ? `<span class="infoHint hasTip" data-tip="Recorded as: ${escapeHtml(recordedBrand)}">i</span>`
              : ""
          }</span>
          <div class="inlineValue">
            <input class="input tooltipValue" value="${escapeHtml(currentBrand)}" readonly />
            ${
              currentBrand !== recordedBrand
                ? ""
                : ""
            }
          </div>
        </label>
        <label class="field">
          <span>SKU details</span>
          <input class="input" value="${escapeHtml(skuDetails)}" readonly />
        </label>
      </div>
      <div class="formGrid3">
        <label class="field">
          <span>Batch ${
            currentBatch !== recordedBatch
              ? `<span class="infoHint hasTip" data-tip="Recorded as: ${escapeHtml(recordedBatch)}">i</span>`
              : ""
          }</span>
          <div class="inlineValue">
            <input class="input tooltipValue" value="${escapeHtml(currentBatch)}" readonly />
            ${
              currentBatch !== recordedBatch
                ? ""
                : ""
            }
          </div>
        </label>
        <label class="field">
          <span>Expiry ${
            item?.expiry && tx.expiry && item.expiry !== tx.expiry
              ? `<span class="infoHint hasTip" data-tip="Recorded as: ${escapeHtml(tx.expiry)}">i</span>`
              : ""
          }</span>
          <div class="inlineValue">
            <input class="input tooltipValue" value="${escapeHtml(item?.expiry || tx.expiry || "-")}" readonly />
            ${
              item?.expiry && tx.expiry && item.expiry !== tx.expiry
                ? ""
                : ""
            }
          </div>
        </label>
        <label class="field">
          <span>MRP ${
            item?.mrp && tx.mrp && Number(item.mrp) !== Number(tx.mrp)
              ? `<span class="infoHint hasTip" data-tip="Recorded as: ${escapeHtml(fmtMoney(tx.mrp))}">i</span>`
              : ""
          }</span>
          <div class="inlineValue">
            <input class="input tooltipValue" value="${fmtMoney(item?.mrp || tx.mrp || 0)}" readonly />
            ${
              item?.mrp && tx.mrp && Number(item.mrp) !== Number(tx.mrp)
                ? ""
                : ""
            }
          </div>
        </label>
      </div>
      <div class="formGrid3">
        <label class="field">
          <span>Quantity</span>
          <input class="input" value="${toNumber(tx.qty, 0)}" readonly />
        </label>
        <label class="field">
          <span>Before</span>
          <input class="input" value="${toNumber(tx.before, 0)}" readonly />
        </label>
        <label class="field">
          <span>After</span>
          <input class="input" value="${toNumber(tx.after, 0)}" readonly />
        </label>
      </div>
      <div class="formGrid">
        <label class="field">
          <span>Purchase price</span>
          <input class="input" value="${fmtMoney(tx.purchase || 0)}" readonly />
        </label>
        <label class="field">
          <span>Selling price</span>
          <input class="input" value="${fmtMoney(tx.selling_price || 0)}" readonly />
        </label>
      </div>
      <div class="formGrid">
        <label class="field">
          <span>Purchase date</span>
          <input class="input" value="${escapeHtml(tx.purchase_date || "-")}" readonly />
        </label>
        <label class="field">
          <span>Selling date</span>
          <input class="input" value="${escapeHtml(tx.selling_date || "-")}" readonly />
        </label>
      </div>
      <div class="formGrid">
        <label class="field">
          <span>Supplier</span>
          <input class="input" value="${escapeHtml(tx.supplier || "-")}" readonly />
        </label>
        <label class="field">
          <span>Customer</span>
          <input class="input" value="${escapeHtml(tx.customer_name || "-")}" readonly />
        </label>
      </div>
      <div class="formGrid">
        <label class="field span2">
          <span>Notes</span>
          <input class="input" value="${escapeHtml(tx.note || "-")}" readonly />
        </label>
      </div>
    `;
    el.modalBackdrop.classList.remove("hidden");
  };

  const renderTransactions = () => {
    if (!el.txTableBody) return;

    const rows = applyTxFilters();
    el.txTableBody.innerHTML = "";

    if (!rows.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="10" class="emptyRow">No transactions found.</td>`;
      el.txTableBody.appendChild(tr);
      return;
    }

    rows.forEach((tx) => {
      const item = state.items.find((it) => it.id === tx.drugId);
      const brand = item?.brand_name || tx.brand_name || tx.drugName || "-";
      const batch = item?.batch || tx.batch || "-";
      const bizDate = tx.type === "IN" ? tx.purchase_date : tx.type === "OUT" ? tx.selling_date : "";
      const bizName = tx.type === "IN" ? tx.supplier : tx.type === "OUT" ? tx.customer_name : "";
      const alreadyReversed = state.tx.some((t) => t.reversed_of === tx.id);
      const canReverse = (tx.type === "IN" || tx.type === "OUT") && !alreadyReversed;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatDateTime(tx.at)}</td>
        <td>${tx.type || "-"}</td>
        <td>${brand}</td>
        <td class="mono">${batch}</td>
        <td class="right">${toNumber(tx.qty, 0)}</td>
        <td>${bizDate || "-"}</td>
        <td>${bizName || "-"}</td>
        <td>${tx.note || "-"}</td>
        <td>${tx.user || "-"}</td>
        <td class="right">
          <div class="tableActions">
            <button class="ghost" data-action="txDetails" data-id="${tx.id}">Details</button>
            ${
              canReverse
                ? `<button class="ghost" data-action="reverseTx" data-id="${tx.id}">Reverse</button>`
                : `<span class="ghost ghostPlaceholder" aria-hidden="true">Reverse</span>`
            }
          </div>
        </td>
      `;
      el.txTableBody.appendChild(tr);
    });
  };

  const renderAll = () => {
    renderDashboard();
    renderInventory();
    renderEstimate();
    renderSkus();
    renderRecentTransactions();
    renderTransactions();
  };

  const setMasterLoading = (loading, label) => {
    const loadBtn = el.loadMasterBtn;
    const importBtn = el.importMasterBtn;
    const fileInput = el.masterFile;
    if (loadBtn) {
      loadBtn.disabled = loading;
      loadBtn.textContent = loading ? (label || "Loading…") : "Load Master List (JSON)";
    }
    if (importBtn) {
      importBtn.disabled = loading;
      importBtn.textContent = loading ? (label || "Loading…") : "Import Master (File)";
    }
    if (fileInput) fileInput.disabled = loading;
  };

  const setView = (name) => {
    el.navItems.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === name);
    });
    el.views.forEach((view) => {
      view.classList.toggle("active", view.id === `view-${name}`);
    });
  };

    const bindMasterInputs = () => {
      const form = el.modalForm;
      if (!form) return;
      if (!state.masterIndex) buildMasterIndex();
      const maxOptions = 50;
      const normalize = (v) => String(v ?? "").trim().toLowerCase();
      let debounceTimer;
      let isAutofillPass = false;
      const autofilled = new Set();

    const getSelections = () => {
      const selections = {};
      MASTER_FIELDS.forEach((field) => {
        const input = form.querySelector(`[name="${field}"]`);
        selections[field] = String(input?.value ?? "").trim();
      });
      return selections;
    };

    const buildOptionsByField = (selections) => {
      const index = state.masterIndex;
      if (!index || !state.master.length) {
        return Object.fromEntries(MASTER_FIELDS.map((f) => [f, []]));
      }
      const optionsByField = {};

      MASTER_FIELDS.forEach((field) => {
        const others = MASTER_FIELDS.filter((f) => f !== field);
        const otherSelections = others
          .map((f) => [f, normalize(selections[f])])
          .filter(([, val]) => val);

        if (otherSelections.length === 0) {
          optionsByField[field] = index.allOptions[field] || [];
          return;
        }

        let candidateIdx = null;
        let candidateField = null;
        otherSelections.forEach(([f, val]) => {
          const list = index.byField[f].get(val) || [];
          if (candidateIdx === null || list.length < candidateIdx.length) {
            candidateIdx = list;
            candidateField = f;
          }
        });

        if (!candidateIdx || candidateIdx.length === 0) {
          optionsByField[field] = [];
          return;
        }

        const set = new Set();
        candidateIdx.forEach((idx) => {
          const entry = state.master[idx];
          let matches = true;
          for (const [f, val] of otherSelections) {
            if (f === candidateField) continue;
            if (normalize(entry[f]) !== val) {
              matches = false;
              break;
            }
          }
          if (!matches) return;
          const value = String(entry[field] ?? "").trim();
          if (value) set.add(value);
        });
        optionsByField[field] = Array.from(set).sort((a, b) => a.localeCompare(b));
      });

      return optionsByField;
    };

    const renderOptions = (field, options) => {
      const list = form.querySelector(`[data-master-list="${field}"]`);
      if (!list) return;
      const activeField = form.dataset.activeMasterField || "";
      if (field !== activeField) {
        list.classList.add("hidden");
        list.innerHTML = "";
        return;
      }
      if (!options.length) {
        list.classList.add("hidden");
        list.innerHTML = "";
        return;
      }
      list.innerHTML = options
        .slice(0, maxOptions)
        .map(
          (val) =>
            `<button type="button" class="masterOption" data-field="${field}" data-value="${escapeHtml(
              val
            )}">${escapeHtml(val)}</button>`
        )
        .join("");
      list.classList.remove("hidden");
    };

    const updateMeta = (field, count) => {
      const meta = form.querySelector(`[data-master-meta="${field}"]`);
      if (meta) meta.textContent = `Options: ${count.toLocaleString()}`;
    };

    const updateAll = () => {
      const selections = getSelections();
      const optionsByField = buildOptionsByField(selections);
      const normalizedSelections = {};
      MASTER_FIELDS.forEach((f) => {
        normalizedSelections[f] = normalize(selections[f]);
      });
      let didAutofill = false;

      MASTER_FIELDS.forEach((field) => {
        const input = form.querySelector(`[name="${field}"]`);
        const raw = normalize(input?.value);
        let options = optionsByField[field] || [];
        updateMeta(field, options.length);
        if (raw) {
          options = options.filter((val) => normalize(val).includes(raw));
        }
        if (!raw && options.length === 1 && !autofilled.has(field)) {
          input.value = options[0];
          autofilled.add(field);
          didAutofill = true;
        }
        renderOptions(field, options);
      });

      if (didAutofill && !isAutofillPass) {
        isAutofillPass = true;
        updateAll();
        isAutofillPass = false;
        return;
      }

      const mrpInput = form.querySelector('[name="indicative_mrp"]');
      if (mrpInput) {
        const key = MASTER_FIELDS.map((f) => normalizedSelections[f]).join("|");
        const lastKey = form.dataset.masterKey || "";
        if (key !== lastKey) {
          form.dataset.masterKey = key;
          if (form.dataset.mrpAuto === "1") {
            mrpInput.value = "";
          }
        }

        if (!String(mrpInput.value || "").trim()) {
          const complete = MASTER_FIELDS.every((f) => normalizedSelections[f]);
          if (complete && state.master.length) {
            const match = state.master.find((row) =>
              MASTER_FIELDS.every((f) => normalize(row[f]) === normalizedSelections[f])
            );
            const mrp = match ? toNumber(match.indicative_mrp ?? match.mrp, 0) : 0;
            if (mrp > 0) {
              mrpInput.value = String(mrp);
              form.dataset.mrpAuto = "1";
            }
          }
        }
      }
    };

    const scheduleUpdate = (field) => {
      form.dataset.activeMasterField = field;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(updateAll, 180);
    };

    MASTER_FIELDS.forEach((field) => {
      const input = form.querySelector(`[name="${field}"]`);
      if (!input) return;
      input.addEventListener("input", () => scheduleUpdate(field));
      input.addEventListener("change", () => scheduleUpdate(field));
    });
    const mrpInput = form.querySelector('[name="indicative_mrp"]');
    if (mrpInput) {
      mrpInput.addEventListener("input", () => {
        form.dataset.mrpAuto = "0";
      });
    }

    form.addEventListener("click", (e) => {
      const toggle = e.target.closest("[data-master-toggle]");
      if (toggle) {
        const field = toggle.dataset.masterToggle;
        form.dataset.activeMasterField = field;
        updateAll();
        return;
      }
      const btn = e.target.closest(".masterOption");
      if (!btn) return;
      const field = btn.dataset.field;
      const value = btn.dataset.value || "";
      const input = form.querySelector(`[name="${field}"]`);
      if (input) input.value = value;
      const list = form.querySelector(`[data-master-list="${field}"]`);
      if (list) list.classList.add("hidden");
      updateAll();
    });
    form.addEventListener("focusout", (e) => {
      if (!form.contains(e.relatedTarget)) {
        form.dataset.activeMasterField = "";
        form.querySelectorAll(".masterOptions").forEach((el) => el.classList.add("hidden"));
      }
    });

    updateAll();
  };

  const bindStockInputs = () => {
    const form = el.modalForm;
    if (!form) return;

    const brandSelect = form.querySelector('[name="brand_name"]');
    const batchInput = form.querySelector('[name="batch"]');
    const mode = form.querySelector('[name="mode"]')?.value || "IN";
    const batchList = form.querySelector("#stock_batch_list");
    const brandMeta = form.querySelector("#stockBrandMeta");
    const expiryInput = form.querySelector('[name="expiry_month"]');
    const qtyInput = form.querySelector('[name="qty"]');
    const purchaseInput = form.querySelector('[name="purchase_price"]');
    const totalInput = form.querySelector('[name="purchase_total"]');
    const sellingInput = form.querySelector('[name="selling_price"]');
    const sellingTotalInput = form.querySelector('[name="selling_total"]');
    const mrpInput = form.querySelector('[name="mrp"]');
    const supplierInput = form.querySelector('[name="supplier"]');

    const updateBatchOptions = () => {
      if (!brandSelect || !batchInput) return;
      const brand = brandSelect.value;
      if (!brand) {
        if (batchInput) {
          if (batchInput.tagName === "SELECT") {
            batchInput.innerHTML = `<option value="" disabled selected>Select batch</option>`;
          } else {
            batchInput.value = "";
          }
        }
        if (batchList) batchList.innerHTML = "";
        updateAutoFields();
        return;
      }
    const batches = buildBatchOptionsForBrand(brand, { inStockOnly: mode === "OUT" });
      const current = batchInput.value;
      if (batchList) {
        batchList.innerHTML = batches
          .map((row) => `<option value="${escapeHtml(row.batch)}"></option>`)
          .join("");
      }
      if (batchInput && batchInput.tagName === "SELECT") {
        const options = batches.map((row) => {
          const label = formatMonthYear(row.expiry);
          const suffix = label ? ` (${label})` : "";
          const stockSuffix = mode === "OUT" ? ` • Stk: ${toNumber(row.stock, 0)}` : "";
          return `<option value="${escapeHtml(row.batch)}">${escapeHtml(
            row.batch + suffix + stockSuffix
          )}</option>`;
        });
        batchInput.innerHTML = [
          `<option value="" disabled selected>Select batch</option>`,
          ...options,
        ].join("");
        if (current && batches.some((row) => row.batch === current)) batchInput.value = current;
      }
      form.dataset.expiryUserSet = "0";
      updateAutoFields();
    };

    const updatePurchaseTotal = () => {
      if (!qtyInput || !purchaseInput || !totalInput) return;
      const qty = toNumber(qtyInput.value, 0);
      const price = toNumber(purchaseInput.value, 0);
      totalInput.value = (qty * price).toFixed(2);
    };

    const updateSellingTotal = () => {
      if (!qtyInput || !sellingInput || !sellingTotalInput) return;
      const qty = toNumber(qtyInput.value, 0);
      const price = toNumber(sellingInput.value, 0);
      sellingTotalInput.value = (qty * price).toFixed(2);
    };

    const updateAutoFields = () => {
      if (!brandSelect || !batchInput) return;
      const brand = brandSelect.value;
      const batch = batchInput.value;
      const item = state.items.find(
        (it) => it.brand_name === brand && it.batch === batch
      );
      if (!item) {
        if (mode === "IN") {
          if (expiryInput) expiryInput.readOnly = false;
          if (mrpInput) mrpInput.readOnly = false;
        }
        return;
      }

      if (expiryInput && (!expiryInput.value || form.dataset.expiryUserSet !== "1")) {
        expiryInput.value = expiryToMonthValue(item.expiry);
      }
      if (mode === "IN") {
        if (expiryInput) expiryInput.readOnly = true;
        if (mrpInput) mrpInput.readOnly = true;
      }
      if (mrpInput) mrpInput.value = item.mrp ?? "";
      if (purchaseInput) purchaseInput.value = item.purchase ?? item.mrp ?? "";
      if (sellingInput) sellingInput.value = item.mrp ?? "";
      if (supplierInput) supplierInput.value = item.supplier || "";
      updatePurchaseTotal();
      updateSellingTotal();
    };

    const updateBrandMeta = () => {
      if (!brandMeta) return;
      const brand = String(brandSelect?.value || "").trim();
      if (!brand) {
        brandMeta.textContent = "";
        return;
      }
      const sku = state.skus.find((s) => s.brand_name === brand);
      if (!sku) {
        brandMeta.textContent = "";
        return;
      }
      const totalStock = state.items
        .filter((it) => it.brand_name === brand)
        .reduce((sum, it) => sum + toNumber(it.stock, 0), 0);
      const parts = [sku.manufacturer, sku.active_combined, sku.packaging_raw]
        .map((v) => String(v || "").trim())
        .filter(Boolean);
      const meta = parts.length ? parts.join(" • ") : "";
      const stockText = `Total Stock: ${totalStock}`;
      brandMeta.textContent = meta ? `${meta} • ${stockText}` : stockText;
    };

    const renderBrandOptions = (showList = false) => {
      const listEl = form.querySelector("[data-brand-list]");
      const metaEl = form.querySelector("[data-brand-meta]");
      if (!listEl) return;
      const query = String(brandSelect.value || "").trim().toLowerCase();
      const brands = Array.from(
        new Set(state.skus.map((sku) => sku.brand_name).filter(Boolean))
      )
        .sort((a, b) => a.localeCompare(b))
        .filter((b) => (query ? b.toLowerCase().includes(query) : true));

      listEl.innerHTML = brands
        .map(
          (b) =>
            `<button type="button" class="brandOption" data-brand-value="${escapeHtml(
              b
            )}">${escapeHtml(b)}</button>`
        )
        .join("");
      if (metaEl) metaEl.textContent = `Options: ${brands.length.toLocaleString()}`;
      if (showList) {
        listEl.classList.toggle("hidden", brands.length === 0);
      }
    };

    brandSelect?.addEventListener("input", () => {
      renderBrandOptions(true);
      updateBrandMeta();
    });
    brandSelect?.addEventListener("blur", () => {
      const list = form.querySelector("[data-brand-list]");
      if (list) list.classList.add("hidden");
    });
    brandSelect?.addEventListener("change", () => {
      const value = String(brandSelect.value || "").trim();
      const exists = state.skus.some((sku) => sku.brand_name === value);
      if (!exists) {
        brandSelect.value = "";
      }
      renderBrandOptions(true);
      updateBatchOptions();
      updateBrandMeta();
    });
    batchInput?.addEventListener("input", updateAutoFields);
    batchInput?.addEventListener("change", () => {
      form.dataset.expiryUserSet = "0";
      updateAutoFields();
    });
    qtyInput?.addEventListener("input", () => {
      updatePurchaseTotal();
      updateSellingTotal();
    });
    purchaseInput?.addEventListener("input", updatePurchaseTotal);
    sellingInput?.addEventListener("input", updateSellingTotal);
    expiryInput?.addEventListener("input", () => {
      form.dataset.expiryUserSet = "1";
    });
    expiryInput?.addEventListener("change", () => {
      form.dataset.expiryUserSet = "1";
    });

    form.onpointerdown = (e) => {
      const toggle = e.target.closest("[data-brand-toggle]");
      if (toggle) {
        e.preventDefault();
        e.stopPropagation();
        const list = form.querySelector("[data-brand-list]");
        if (list && list.classList.contains("hidden")) {
          renderBrandOptions(true);
          list.classList.remove("hidden");
        } else if (list) {
          list.classList.add("hidden");
        }
        return;
      }
      const btn = e.target.closest(".brandOption");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      brandSelect.value = btn.dataset.brandValue || "";
      const list = form.querySelector("[data-brand-list]");
      if (list) list.classList.add("hidden");
      updateBatchOptions();
      updateBrandMeta();
    };
    form.onfocusout = (e) => {
      if (!form.contains(e.relatedTarget)) {
        const list = form.querySelector("[data-brand-list]");
        if (list) list.classList.add("hidden");
      }
    };

    updateBatchOptions();
    renderBrandOptions(false);
    updateBrandMeta();
    updatePurchaseTotal();
    updateSellingTotal();
  };

  const bindBatchEditInputs = (item) => {
    const form = el.modalForm;
    if (!form) return;
    const qtyInput = form.querySelector('[name="adjust_qty"]');
    if (!qtyInput) return;
    form.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-adjust]");
      if (!btn) return;
      e.preventDefault();
      const delta = btn.dataset.adjust === "inc" ? 1 : -1;
      const current = toNumber(qtyInput.value, toNumber(item?.stock, 0));
      const next = Math.max(0, current + delta);
      qtyInput.value = String(next);
    });
  };

  const bindBatchRenameInputs = () => {
    const form = el.modalForm;
    if (!form) return;
    const btn = form.querySelector("#renameBatchBtn");
    const renameModeInput = form.querySelector('[name="rename_mode"]');
    const renameFields = Array.from(form.querySelectorAll("[data-rename-field]"));
    if (!btn || !renameModeInput || !renameFields.length) return;

    const setMode = (on) => {
      renameModeInput.value = on ? "1" : "0";
      renameFields.forEach((el) => {
        if (on) el.removeAttribute("readonly");
        else el.setAttribute("readonly", "");
      });
      btn.textContent = on ? "Cancel rename" : "Rename batch";
    };

    setMode(false);
    btn.addEventListener("click", () => {
      const on = renameModeInput.value !== "1";
      setMode(on);
    });
  };


  const openModal = (type, data = null) => {
    modalState = { type, data };

    if (!el.modalBackdrop || !el.modalForm) return;
    setModalWide(false);
    el.modalForm.classList.remove("txDetails");

    if (type === "drug") {
      const isEdit = Boolean(data);
      if (el.modalTitle) el.modalTitle.textContent = isEdit ? "Edit drug" : "Add new drug";
      if (el.modalSub) el.modalSub.textContent = isEdit ? "Update SKU details" : "Enter SKU details";
      if (el.modalSave) el.modalSave.textContent = isEdit ? "Update" : "Save";

      el.modalForm.innerHTML = `
        <input type="hidden" name="id" value="${data?.id || ""}" />
        <div class="formGrid">
          <label class="field">
            <span>Brand name</span>
            <div class="inputWrap">
              <input name="brand_name" class="input" autocomplete="off" required value="${escapeHtml(
              data?.brand_name || data?.name || ""
            )}" />
              <button type="button" class="iconBtn inside" data-master-toggle="brand_name" aria-label="Show brand options">▾</button>
            </div>
            <div class="masterOptions hidden" data-master-list="brand_name"></div>
            <div class="masterMeta" data-master-meta="brand_name">Options: 0</div>
          </label>
          <label class="field">
            <span>Manufacturer</span>
            <div class="inputWrap">
              <input name="manufacturer" class="input" autocomplete="off" value="${escapeHtml(
              data?.manufacturer || ""
            )}" />
              <button type="button" class="iconBtn inside" data-master-toggle="manufacturer" aria-label="Show manufacturer options">▾</button>
            </div>
            <div class="masterOptions hidden" data-master-list="manufacturer"></div>
            <div class="masterMeta" data-master-meta="manufacturer">Options: 0</div>
          </label>
          <label class="field span2">
            <span>Active combined</span>
            <div class="inputWrap">
              <input name="active_combined" class="input" autocomplete="off" value="${escapeHtml(
              data?.active_combined || data?.salt || ""
            )}" />
              <button type="button" class="iconBtn inside" data-master-toggle="active_combined" aria-label="Show active options">▾</button>
            </div>
            <div class="masterOptions hidden" data-master-list="active_combined"></div>
            <div class="masterMeta" data-master-meta="active_combined">Options: 0</div>
          </label>
        </div>
        <div class="formGrid">
          <label class="field span2">
            <span>Packaging</span>
            <div class="inputWrap">
              <input name="packaging_raw" class="input" autocomplete="off" value="${escapeHtml(
              data?.packaging_raw || ""
            )}" />
              <button type="button" class="iconBtn inside" data-master-toggle="packaging_raw" aria-label="Show packaging options">▾</button>
            </div>
            <div class="masterOptions hidden" data-master-list="packaging_raw"></div>
            <div class="masterMeta" data-master-meta="packaging_raw">Options: 0</div>
          </label>
        </div>
        <div class="formGrid">
          <label class="field">
            <span>Min stock</span>
            <input name="min_stock" class="input" type="number" min="0" step="1" value="${data?.min_stock ?? data?.minStock ?? 0}" />
          </label>
          <label class="field">
            <span>Indicative MRP</span>
            <input name="indicative_mrp" class="input" type="number" min="0" step="0.01" value="${data?.indicative_mrp ?? data?.indicativeMrp ?? ""}" />
          </label>
        </div>
      `;

      bindMasterInputs();
    }

    if (type === "stock") {
      if (el.modalTitle) el.modalTitle.textContent = data?.mode === "OUT" ? "Stock out" : "Stock in";
      if (el.modalSub) el.modalSub.textContent = "Log a stock movement";
      if (el.modalSave) el.modalSave.textContent = "Save";

      const mode = data?.mode || "IN";
      const isPrefill = Boolean(data?.itemId || data?.brand_name || data?.batch);
      const selectedItem = data?.itemId
        ? state.items.find((it) => it.id === data.itemId)
        : null;
      const isRowContext = Boolean(data?.itemId);
      const selectedBrand = data?.brand_name || selectedItem?.brand_name || "";
      const selectedBatch =
        isRowContext && mode === "IN" ? "" : data?.batch || selectedItem?.batch || "";
      const prefillItem =
        selectedItem ||
        state.items.find(
          (it) => it.brand_name === selectedBrand && it.batch === selectedBatch
        ) ||
        null;
      const isRowIn = isRowContext && mode === "IN";
      const lockBrand = isRowContext;
      const lockBatch = isRowContext && mode === "OUT";
      const lockMeta = false;
      const brandReadonly = lockBrand ? "readonly" : "";
      const brandToggleDisabled = lockBrand ? "disabled" : "";
      const batchReadonly = lockBatch ? "readonly" : "";
      const batchSelectDisabled = lockBatch ? "disabled" : "";
      const metaReadonly = lockMeta ? "readonly" : "";

      const brandOptions = [
        isPrefill ? "" : `<option value="" disabled selected>Select brand</option>`,
        ...Array.from(
        new Set(state.items.map((item) => item.brand_name).filter(Boolean))
      )
          .sort((a, b) => a.localeCompare(b))
          .map((brand) => `<option value="${escapeHtml(brand)}">${escapeHtml(brand)}</option>`)
      ].join("");

      const batchSelectOptions = Array.from(
        buildBatchOptionsForBrand(selectedBrand)
      )
        .map((row) => {
          const label = formatMonthYear(row.expiry);
          const suffix = label ? ` (${label})` : "";
          const stockSuffix = mode === "OUT" ? ` • Stk: ${toNumber(row.stock, 0)}` : "";
          const color = row.expired ? "#dc2626" : row.isEarliestUpcoming ? "#16a34a" : "";
          const style = color ? ` style="color:${color};"` : "";
          const selected = row.batch === selectedBatch ? " selected" : "";
          return `<option value="${escapeHtml(row.batch)}"${style}${selected}>${escapeHtml(
            row.batch + suffix + stockSuffix
          )}</option>`;
        })
        .join("");

      el.modalForm.innerHTML = `
        <input type="hidden" name="mode" value="${mode}" />
          <label class="field">
            <span>Brand name</span>
            <div class="inputWrap">
              <input name="brand_name" class="input" autocomplete="off" required placeholder="Select brand" value="${escapeHtml(
              selectedBrand
            )}" ${brandReadonly} />
              <button type="button" class="iconBtn inside" data-brand-toggle aria-label="Show brand options" ${brandToggleDisabled}>▾</button>
            </div>
            <div class="brandOptions hidden" data-brand-list></div>
            <div class="masterMeta" data-brand-meta>Options: 0</div>
            <div class="masterMeta" id="stockBrandMeta"></div>
          </label>
        ${
          mode === "IN"
            ? `
        <div class="formGrid3">
          <label class="field">
            <span>Batch number</span>
            <input name="batch" class="input" autocomplete="off" required value="${escapeHtml(
              isRowIn ? "" : selectedBatch
            )}" ${batchReadonly} />
          </label>
          <label class="field">
            <span>Expiry (MM/YYYY)</span>
            <input name="expiry_month" class="input" type="month" value="${
              isRowIn ? "" : prefillItem ? expiryToMonthValue(prefillItem.expiry) : ""
            }" ${metaReadonly} />
          </label>
          <label class="field">
            <span>MRP</span>
            <input name="mrp" class="input" type="number" min="0" step="0.01" value="${
              prefillItem?.mrp ?? ""
            }" ${metaReadonly} />
          </label>
        </div>
        <div class="formGrid3">
          <label class="field">
            <span>Quantity</span>
            <input name="qty" class="input" type="number" min="1" step="1" value="1" required />
          </label>
          <label class="field">
            <span>Purchase price</span>
            <input name="purchase_price" class="input" type="number" min="0" step="0.01" value="${
              prefillItem?.purchase ?? ""
            }" ${metaReadonly} />
          </label>
          <label class="field">
            <span>Total</span>
            <input name="purchase_total" class="input" value="0" readonly />
          </label>
        </div>
        <div class="formGrid">
          <label class="field">
            <span>Purchase date</span>
            <input name="purchase_date" class="input" type="date" value="${
              isRowIn ? "" : prefillItem?.purchase_date || ""
            }" ${metaReadonly} />
          </label>
          <label class="field">
            <span>Supplier</span>
            <input name="supplier" class="input" value="${escapeHtml(
              prefillItem?.supplier || ""
            )}" ${metaReadonly} />
          </label>
        </div>
        <div class="formGrid">
          <label class="field span2">
            <span>Notes/Invoice</span>
            <input name="note" class="input" value="" />
          </label>
        </div>
        `
            : `
        <div class="formGrid3">
          <label class="field">
            <span>Batch number</span>
            <select name="batch" class="select" required ${batchSelectDisabled}>${batchSelectOptions}</select>${
              lockBatch
                ? `<input type="hidden" name="batch" value="${escapeHtml(selectedBatch)}" />`
                : ""
            }
          </label>
          <label class="field">
            <span>Expiry (MM/YYYY)</span>
            <input name="expiry_month" class="input" type="month" value="${
              prefillItem ? expiryToMonthValue(prefillItem.expiry) : ""
            }" readonly />
          </label>
          <label class="field">
            <span>MRP</span>
            <input name="mrp" class="input" type="number" min="0" step="0.01" value="${
              prefillItem?.mrp ?? ""
            }" readonly />
          </label>
        </div>
        <div class="formGrid3">
          <label class="field">
            <span>Quantity</span>
            <input name="qty" class="input" type="number" min="1" step="1" value="1" required />
          </label>
          <label class="field">
            <span>Selling price</span>
            <input name="selling_price" class="input" type="number" min="0" step="0.01" value="" />
          </label>
          <label class="field">
            <span>Total</span>
            <input name="selling_total" class="input" value="0" readonly />
          </label>
        </div>
        <div class="formGrid">
          <label class="field">
            <span>Selling date</span>
            <input name="selling_date" class="input" type="date" />
          </label>
          <label class="field">
            <span>Customer name</span>
            <input name="customer_name" class="input" value="" />
          </label>
        </div>
        <div class="formGrid">
          <label class="field span2">
            <span>Notes/Invoice</span>
            <input name="note" class="input" value="" />
          </label>
        </div>
        `
        }
      `;

      bindStockInputs();
    }

    if (type === "batchEdit") {
      if (el.modalTitle) el.modalTitle.textContent = "Edit batch";
      if (el.modalSub) el.modalSub.textContent = "Update batch metadata";
      if (el.modalSave) el.modalSave.textContent = "Update";
      const item = data;
      el.modalForm.innerHTML = `
        <input type="hidden" name="id" value="${item?.id || ""}" />
        <input type="hidden" name="rename_mode" value="0" />
        <div class="formGrid">
          <label class="field span2">
            <span>Brand</span>
            <input class="input" value="${escapeHtml(item?.brand_name || "")}" readonly />
          </label>
        </div>
        <div class="formGrid3">
          <label class="field">
            <span>Batch number</span>
            <input name="batch" class="input" data-rename-field value="${escapeHtml(
              item?.batch || ""
            )}" readonly />
          </label>
          <label class="field">
            <span>Expiry (MM/YYYY)</span>
            <input name="expiry_month" class="input" type="month" data-rename-field value="${
              item ? expiryToMonthValue(item.expiry) : ""
            }" readonly />
          </label>
          <label class="field">
            <span>MRP</span>
            <input name="mrp" class="input" type="number" min="0" step="0.01" data-rename-field value="${
              item?.mrp ?? ""
            }" readonly />
          </label>
        </div>
        <div class="formGrid">
          <div class="row gap8 span2">
            <button type="button" class="btnAccent btnSmall" id="renameBatchBtn">Rename batch</button>
            <div class="masterMeta">Batch no + Expiry + MRP are a single combo.</div>
          </div>
        </div>
        <div class="formGrid">
          <label class="field">
            <span>Quantity (Adjustable)</span>
            <div class="stepper">
              <button type="button" class="stepBtn" data-adjust="dec">−</button>
              <input name="adjust_qty" class="input center" type="number" min="0" step="1" value="${toNumber(
                item?.stock,
                0
              )}" />
              <button type="button" class="stepBtn" data-adjust="inc">+</button>
            </div>
          </label>
          <label class="field">
            <span>Adjustment note (required if quantity changes)</span>
            <input name="adjust_note" class="input" placeholder="Reason for adjustment" />
          </label>
        </div>
        <div class="formGrid">
          <div class="sectionDivider sectionLabel span2">Latest batch metadata</div>
        </div>
        <div class="formGrid3">
          <label class="field">
            <span>Purchase price</span>
            <input name="purchase_price" class="input" type="number" min="0" step="0.01" value="${
              item?.purchase ?? ""
            }" />
          </label>
          <label class="field">
            <span>Purchase date</span>
            <input name="purchase_date" class="input" type="date" value="${
              item?.purchase_date || ""
            }" />
          </label>
          <label class="field">
            <span>Supplier</span>
            <input name="supplier" class="input" value="${escapeHtml(item?.supplier || "")}" />
          </label>
        </div>
      `;
      bindBatchEditInputs(item);
      bindBatchRenameInputs();

    }

    el.modalBackdrop.classList.remove("hidden");
  };

  const closeModal = () => {
    if (!el.modalBackdrop) return;
    el.modalBackdrop.classList.add("hidden");
    if (el.modalForm) el.modalForm.classList.remove("txDetails");
    modalState = { type: "", data: null };
  };

  const upsertDrug = (data, oldSku) => upsertSku(data, oldSku);

  const findLatestBrandItem = (brand) =>
    state.items.find((it) => it.brand_name === brand) || null;

  const applyStockIn = (brand, batch, formData) => {
    if (!brand || !batch) {
      showToast("Missing batch", "Brand and batch are required.", "warn");
      return;
    }

    let item = state.items.find(
      (it) => it.brand_name === brand && it.batch === batch
    );
    if (!item) {
      const sku = state.skus.find((s) => s.brand_name === brand);
      if (!sku) {
        showToast("Missing SKU", "Select an existing SKU brand.", "warn");
        return;
      }
      item = normalizeItem({
        id: uid(),
        brand_name: sku.brand_name,
        manufacturer: sku.manufacturer,
        packaging_raw: sku.packaging_raw,
        active_combined: sku.active_combined,
        min_stock: sku.min_stock,
        batch,
        stock: 0,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      });
      state.items.unshift(item);
    }

    const q = toNumber(formData.get("qty"), 0);
    if (q <= 0) {
      showToast("Invalid quantity", "Quantity must be greater than 0.", "warn");
      return;
    }

    const expiry = monthValueToExpiry(formData.get("expiry_month") || "");
    const mrpRaw = String(formData.get("mrp") ?? "").trim();
    const purchaseRaw = String(formData.get("purchase_price") ?? "").trim();
    const mrp = mrpRaw === "" ? item.mrp : toNumber(mrpRaw, item.mrp || 0);
    const purchase =
      purchaseRaw === "" ? item.purchase : toNumber(purchaseRaw, item.purchase || 0);
    const supplier = String(formData.get("supplier") || "").trim();
    const purchaseDate = String(formData.get("purchase_date") || "").trim();

    const note = String(formData.get("note") || "").trim();
    const before = toNumber(item.stock, 0);
    const after = before + q;

    item.stock = after;
    if (expiry) item.expiry = expiry;
    if (Number.isFinite(mrp)) item.mrp = mrp;
    if (Number.isFinite(purchase)) item.purchase = purchase;
    if (supplier) item.supplier = supplier;
    if (purchaseDate) item.purchase_date = purchaseDate;
    item.updatedAt = nowISO();

    state.tx.unshift({
      id: uid(),
      type: "IN",
      drugId: item.id,
      brand_name: item.brand_name,
      batch: item.batch,
      qty: q,
      user: getActorLabel(),
      note: note,
      note_raw: note,
      before,
      after,
      mrp: item.mrp,
      purchase: item.purchase,
      purchase_price: item.purchase,
      supplier: item.supplier,
      expiry: item.expiry,
      purchase_date: item.purchase_date,
      at: nowISO(),
    });

    saveState();
    renderAll();
    showToast("Stock updated", `${item.brand_name} now has ${after}`, "good");
  };

  const applyStockOut = (item, formData) => {
    if (!item) return;
    const q = toNumber(formData.get("qty"), 0);
    if (q <= 0) {
      showToast("Invalid quantity", "Quantity must be greater than 0.", "warn");
      return;
    }

    const before = toNumber(item.stock, 0);
    const after = before - q;
    if (after < 0) {
      showToast("Stock too low", "Stock out exceeds available quantity.", "bad");
      return;
    }

    const sellingRaw = String(formData.get("selling_price") ?? "").trim();
    const sellingPrice =
      sellingRaw === "" ? item.mrp || 0 : toNumber(sellingRaw, item.mrp || 0);
    const sellingDate = String(formData.get("selling_date") || "").trim();
    const customerName = String(formData.get("customer_name") || "").trim();
    const note = String(formData.get("note") || "").trim();

    item.stock = after;
    item.updatedAt = nowISO();

    state.tx.unshift({
      id: uid(),
      type: "OUT",
      drugId: item.id,
      brand_name: item.brand_name,
      batch: item.batch,
      qty: q,
      user: getActorLabel(),
      note: note,
      note_raw: note,
      before,
      after,
      mrp: item.mrp,
      selling_price: sellingPrice,
      selling_date: sellingDate,
      customer_name: customerName,
      at: nowISO(),
    });

    saveState();
    renderAll();
    showToast("Stock updated", `${item.brand_name} now has ${after}`, "good");
  };

  const deleteDrug = (itemId) => {
    const item = state.items.find((it) => it.id === itemId);
    if (!item) return;
    const ok = confirm(`Delete ${item.brand_name || "this item"}? This cannot be undone.`);
    if (!ok) return;

    state.items = state.items.filter((it) => it.id !== itemId);
    saveState();
    renderAll();
    showToast("Deleted", "Drug removed from inventory.", "bad");
  };

  const updateBatchMeta = (itemId, formData) => {
    const item = state.items.find((it) => it.id === itemId);
    if (!item) return false;

    const renameMode = String(formData.get("rename_mode") || "0") === "1";
    const newStockRaw = formData.get("adjust_qty");
    const newStock = newStockRaw === "" || newStockRaw === null ? null : toNumber(newStockRaw, 0);
    const adjNote = String(formData.get("adjust_note") || "").trim();

    const newBatch = renameMode ? String(formData.get("batch") || "").trim() : item.batch;
    const expiry = renameMode ? monthValueToExpiry(formData.get("expiry_month") || "") : item.expiry;
    const supplier = String(formData.get("supplier") || "").trim();
    const purchaseRaw = String(formData.get("purchase_price") ?? "").trim();
    const mrpRaw = renameMode ? String(formData.get("mrp") ?? "").trim() : String(item.mrp ?? "");
    const purchaseDate = String(formData.get("purchase_date") || "").trim();

    if (renameMode) {
      if (!newBatch) {
        showToast("Missing batch", "Batch number is required.", "warn");
        return false;
      }
      if (newBatch !== item.batch) {
        const dupItem = state.items.find(
          (it) => it.id !== item.id && it.brand_name === item.brand_name && it.batch === newBatch
        );
        if (dupItem) {
          const expMatch = (dupItem.expiry || "") === (expiry || "");
          const mrpMatch = Number(dupItem.mrp || 0) === Number(
            mrpRaw === "" ? 0 : toNumber(mrpRaw, 0)
          );
          if (!expMatch || !mrpMatch) {
            showToast(
              "Cannot merge",
              "Expiry and MRP must match to merge batches.",
              "warn"
            );
            return false;
          }
          openMergeModal(item, dupItem);
          return false;
        }
      }
      item.batch = newBatch;
      item.expiry = expiry || "";
      item.mrp = mrpRaw === "" ? 0 : toNumber(mrpRaw, 0);
    }
    item.supplier = supplier;
    item.purchase = purchaseRaw === "" ? 0 : toNumber(purchaseRaw, 0);
    if (!renameMode) {
      item.expiry = item.expiry || "";
      item.mrp = toNumber(item.mrp, 0);
    }
    item.purchase_date = purchaseDate;

    if (newStock !== null && Number.isFinite(newStock)) {
      const before = toNumber(item.stock, 0);
      const after = Math.max(0, newStock);
      if (after !== before) {
        if (!adjNote) {
          showToast("Note required", "Add a reason for stock adjustment.", "warn");
          return false;
        }
        item.stock = after;
        state.tx.unshift({
          id: uid(),
          type: "ADJUST",
          drugId: item.id,
          brand_name: item.brand_name,
          batch: item.batch,
          qty: Math.abs(after - before),
          user: getActorLabel(),
          note: adjNote,
          before,
          after,
          mrp: item.mrp,
          at: nowISO(),
        });
      }
    }
    item.updatedAt = nowISO();

    saveState();
    renderAll();
    showToast("Updated", "Batch details updated.", "good");
    return true;
  };

  const openMergeModal = (source, target) => {
    if (!source || !target || !el.modalBackdrop || !el.modalForm) return;
    modalState = { type: "merge", data: { sourceId: source.id, targetId: target.id } };
    setModalWide(false);
    if (el.modalTitle) el.modalTitle.textContent = "Merge batches";
    if (el.modalSub) el.modalSub.textContent = "Batch no + Expiry + MRP must match";
    if (el.modalSave) el.modalSave.textContent = "Merge";

    el.modalForm.innerHTML = `
      <input type="hidden" name="source_id" value="${source.id}" />
      <input type="hidden" name="target_id" value="${target.id}" />
      <div class="formGrid">
        <label class="field">
          <span>Source batch</span>
          <input class="input" value="${escapeHtml(source.batch)}" readonly />
        </label>
        <label class="field">
          <span>Target batch</span>
          <input class="input" value="${escapeHtml(target.batch)}" readonly />
        </label>
      </div>
      <div class="formGrid3">
        <label class="field">
          <span>Expiry (target)</span>
          <input class="input" value="${escapeHtml(target.expiry || "-")}" readonly />
        </label>
        <label class="field">
          <span>MRP (target)</span>
          <input class="input" value="${fmtMoney(target.mrp || 0)}" readonly />
        </label>
        <label class="field">
          <span>Stock move</span>
          <input class="input" value="${toNumber(source.stock, 0)} → ${toNumber(target.stock, 0)}" readonly />
        </label>
      </div>
      <div class="formGrid">
        <label class="field">
          <span>Metadata to keep</span>
          <select name="merge_pick" class="select">
            <option value="target">Target (recommended)</option>
            <option value="source">Source</option>
            <option value="latest">Latest by purchase date</option>
          </select>
        </label>
        <label class="field">
          <span>Reason</span>
          <input name="merge_reason" class="input" placeholder="Why merging?" />
        </label>
      </div>
    `;

    el.modalBackdrop.classList.remove("hidden");
  };

  const performMerge = (sourceId, targetId, pick, reason) => {
    const source = state.items.find((it) => it.id === sourceId);
    const target = state.items.find((it) => it.id === targetId);
    if (!source || !target) return;
    const expMatch = (target.expiry || "") === (source.expiry || "");
    const mrpMatch = Number(target.mrp || 0) === Number(source.mrp || 0);
    if (!expMatch || !mrpMatch) {
      showToast("Cannot merge", "Expiry and MRP must match to merge batches.", "warn");
      return;
    }

    const beforeTarget = toNumber(target.stock, 0);
    const beforeSource = toNumber(source.stock, 0);
    const mergedStock = beforeTarget + beforeSource;

    target.stock = mergedStock;
    source.stock = 0;

    if (pick === "source") {
      target.purchase = source.purchase;
      target.purchase_date = source.purchase_date;
      target.supplier = source.supplier;
    } else if (pick === "latest") {
      const tDate = target.purchase_date || "";
      const sDate = source.purchase_date || "";
      if (sDate && (!tDate || sDate > tDate)) {
        target.purchase = source.purchase;
        target.purchase_date = source.purchase_date;
        target.supplier = source.supplier;
      }
    }

    target.updatedAt = nowISO();
    source.updatedAt = nowISO();

    state.tx.unshift({
      id: uid(),
      type: "ADJUST",
      drugId: target.id,
      brand_name: target.brand_name,
      batch: target.batch,
      qty: Math.abs(mergedStock - beforeTarget),
      user: getActorLabel(),
      note: `Merge from ${source.batch}: ${reason}`,
      before: beforeTarget,
      after: mergedStock,
      mrp: target.mrp,
      at: nowISO(),
    });
    state.tx.unshift({
      id: uid(),
      type: "ADJUST",
      drugId: source.id,
      brand_name: source.brand_name,
      batch: source.batch,
      qty: Math.abs(beforeSource),
      user: getActorLabel(),
      note: `Merged into ${target.batch}: ${reason}`,
      before: beforeSource,
      after: 0,
      mrp: source.mrp,
      at: nowISO(),
    });

    saveState();
    renderAll();
    showToast("Merged", "Batches merged successfully.", "good");
  };

  const reverseTransaction = (txId) => {
    const tx = state.tx.find((t) => t.id === txId);
    if (!tx) return;
    if (tx.type !== "IN" && tx.type !== "OUT") {
      showToast("Not reversible", "Only IN/OUT can be reversed.", "warn");
      return;
    }
    if (state.tx.some((t) => t.reversed_of === tx.id)) {
      showToast("Already reversed", "This transaction is already reversed.", "warn");
      return;
    }
    const item = state.items.find((it) => it.id === tx.drugId);
    if (!item) {
      showToast("Missing batch", "Batch not found for this transaction.", "warn");
      return;
    }
    const reason = prompt("Reason for reversal?");
    if (!reason) return;

    const qty = toNumber(tx.qty, 0);
    const before = toNumber(item.stock, 0);
    const delta = tx.type === "IN" ? -qty : qty;
    const after = before + delta;
    if (after < 0) {
      showToast("Invalid reversal", "Stock cannot be negative.", "bad");
      return;
    }

    item.stock = after;
    item.updatedAt = nowISO();
    state.tx.unshift({
      id: uid(),
      type: "REVERSE",
      reversed_of: tx.id,
      drugId: item.id,
      brand_name: item.brand_name,
      batch: item.batch,
      qty,
      user: getActorLabel(),
      note: `Reversal of ${tx.type}: ${reason}`,
      before,
      after,
      mrp: item.mrp,
      at: nowISO(),
    });

    saveState();
    renderAll();
    showToast("Reversed", "Reversal recorded.", "good");
  };

  const getSkuBatchCount = (key) =>
    state.items.filter((it) => skuKey(it) === key && it.batch).length;

  const setSkuArchived = (key, archived) => {
    const sku = state.skus.find((s) => skuKey(s) === key);
    if (!sku) return;
    sku.archived = archived;
    sku.updatedAt = nowISO();
    saveState();
    renderAll();
    showToast(
      archived ? "Archived" : "Unarchived",
      archived ? "SKU hidden from list." : "SKU restored.",
      "good"
    );
  };

  const deleteSkuByKey = (key) => {
    const batchCount = getSkuBatchCount(key);
    if (batchCount > 0) {
      const ok = confirm(
        `This SKU has ${batchCount} batch(es). Delete is not allowed. Archive instead?`
      );
      if (ok) setSkuArchived(key, true);
      return;
    }
    const sku = state.skus.find((s) => skuKey(s) === key);
    if (!sku) return;
    const ok = confirm(`Delete SKU ${sku.brand_name || "this item"}? This cannot be undone.`);
    if (!ok) return;
    state.skus = state.skus.filter((s) => skuKey(s) !== key);
    saveState();
    renderAll();
    showToast("Deleted", "SKU removed.", "bad");
  };

  const exportInventoryCSV = () => {
    const headers = [
      "brand_name",
      "manufacturer",
      "active_combined",
      "packaging_raw",
      "min_stock",
      "batch",
      "expiry",
      "stock",
      "mrp",
      "purchase_price",
      "purchase_date",
      "supplier",
    ];

    const lines = [headers.join(",")];
    state.items.forEach((it) => {
      const row = headers.map((h) => {
        if (h === "purchase_price") return csvEscape(it.purchase ?? "");
        return csvEscape(it[h] ?? "");
      });
      lines.push(row.join(","));
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `batch_inventory_${todayYMD()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    showToast("Exported", "Inventory CSV downloaded.", "good");
  };

  const exportEstimateCSV = () => {
    const headers = [
      "brand_name",
      "batch",
      "expiry",
      "mrp",
      "purchase_price",
      "qty",
      "mrp_total",
      "purchase_total",
      "source",
    ];
    const lines = [headers.join(",")];
    state.estimate.forEach((entry) => {
      const row = resolveEstimateEntry(entry);
      const mrpTotal = row.qty * row.mrp;
      const purchaseTotal = row.qty * row.purchase;
      const source = String(entry.item_id || "").startsWith("custom:") ? "custom" : "batch";
      const values = [
        row.brand_name,
        row.batch,
        row.expiry,
        row.mrp,
        row.purchase,
        row.qty,
        mrpTotal,
        purchaseTotal,
        source,
      ].map((val) => csvEscape(val ?? ""));
      lines.push(values.join(","));
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `drugs_estimate_${todayYMD()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    showToast("Exported", "Drugs Estimate CSV downloaded.", "good");
  };

  const getSkuGroups = () => {
    const skuMap = new Map();
    const idToKey = new Map();

    state.skus.forEach((sku) => {
      const key = skuKey(sku);
      skuMap.set(key, {
        brand_name: sku.brand_name,
        manufacturer: sku.manufacturer,
        active_combined: sku.active_combined,
        packaging_raw: sku.packaging_raw,
        min_stock: toNumber(sku.min_stock, 0),
        total_stock: 0,
        batch_count: 0,
        earliest_expiry: "",
        latest_item: null,
        latest_updated_at: "",
        last_stock_in: "",
        archived: Boolean(sku.archived),
        key,
      });
    });

    state.items.forEach((item) => {
      const key = skuKey(item);
      idToKey.set(item.id, key);

      if (!skuMap.has(key)) {
        skuMap.set(key, {
          brand_name: item.brand_name,
          manufacturer: item.manufacturer,
          active_combined: item.active_combined,
          packaging_raw: item.packaging_raw,
          min_stock: toNumber(item.min_stock, 0),
          total_stock: 0,
          batch_count: 0,
          earliest_expiry: "",
          latest_item: null,
          latest_updated_at: "",
          last_stock_in: "",
          archived: false,
          key,
        });
      }

      const group = skuMap.get(key);
      group.total_stock += toNumber(item.stock, 0);
      if (item.batch && toNumber(item.stock, 0) > 0) group.batch_count += 1;

      if (/^\d{4}-\d{2}-\d{2}$/.test(item.expiry || "")) {
        if (!group.earliest_expiry || item.expiry < group.earliest_expiry) {
          group.earliest_expiry = item.expiry;
        }
      }

      const updatedAt = item.updatedAt || item.createdAt || "";
      if (updatedAt && updatedAt > group.latest_updated_at) {
        group.latest_updated_at = updatedAt;
        group.latest_item = item;
      }
    });

    state.tx.forEach((tx) => {
      if (tx.type !== "IN") return;
      const key = idToKey.get(tx.drugId);
      if (!key || !skuMap.has(key)) return;
      const group = skuMap.get(key);
      if (!group.last_stock_in || (tx.at && tx.at > group.last_stock_in)) {
        group.last_stock_in = tx.at;
      }
    });

    return Array.from(skuMap.values()).sort((a, b) =>
      (a.brand_name || "").localeCompare(b.brand_name || "")
    );
  };

  const exportSkusCSV = () => {
    const headers = [
      "brand_name",
      "manufacturer",
      "active_combined",
      "packaging_raw",
      "min_stock",
      "total_stock",
      "batch_count",
      "earliest_expiry",
      "latest_mrp",
      "latest_purchase",
      "supplier_latest",
      "last_stock_in",
    ];

    const lines = [headers.join(",")];
    const groups = getSkuGroups();
    groups.forEach((g) => {
      const latest = g.latest_item || {};
      const row = [
        g.brand_name,
        g.manufacturer,
        g.active_combined,
        g.packaging_raw,
        g.min_stock,
        g.total_stock,
        g.batch_count,
        g.earliest_expiry,
        latest.mrp,
        latest.purchase,
        latest.supplier,
        g.last_stock_in,
      ].map((val) => csvEscape(val ?? ""));
      lines.push(row.join(","));
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `skus_${todayYMD()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    showToast("Exported", "SKUs CSV downloaded.", "good");
  };


  const exportTransactionsCSV = () => {
    const headers = [
      "date",
      "type",
      "brand_name",
      "batch",
      "qty",
      "user",
      "notes",
      "before",
      "after",
      "mrp",
      "purchase_price",
      "purchase_date",
      "supplier",
      "selling_price",
      "selling_date",
      "customer_name",
      "expiry",
    ];

    const lines = [headers.join(",")];
    state.tx.forEach((tx) => {
      const row = [
        tx.at,
        tx.type,
        tx.brand_name || tx.drugName,
        tx.batch,
        tx.qty,
        tx.user,
        tx.note,
        tx.before,
        tx.after,
        tx.mrp,
        tx.purchase,
        tx.purchase_date,
        tx.supplier,
        tx.selling_price,
        tx.selling_date,
        tx.customer_name,
        tx.expiry,
      ].map((val) => csvEscape(val ?? ""));
      lines.push(row.join(","));
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `transactions_${todayYMD()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    showToast("Exported", "Transactions CSV downloaded.", "good");
  };

  const exportBackup = () => {
    const payload = {
      inventory: state.items,
      skus: state.skus,
      transactions: state.tx,
      settings: state.settings,
      master: state.master,
      exportedAt: nowISO(),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `caarya_backup_${todayYMD()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    showToast("Exported", "Backup JSON downloaded.", "good");
  };

  const exportBackupNoMaster = () => {
    const payload = {
      inventory: state.items,
      skus: state.skus,
      transactions: state.tx,
      settings: state.settings,
      exportedAt: nowISO(),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `caarya_backup_nomaster_${todayYMD()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    showToast("Exported", "Backup JSON (no master) downloaded.", "good");
  };

  const importInventoryCSV = (text) => {
    const rows = parseCSV(text);
    if (rows.length < 2) {
      showToast("Import failed", "CSV file is empty.", "warn");
      return;
    }

    const headers = rows[0].map((h) => h.trim());
    const idx = (name) => headers.indexOf(name);
    const idxAny = (...names) => names.map((n) => idx(n)).find((pos) => pos >= 0) ?? -1;

    const nameIdx = idxAny("brand_name", "name");
    const stockIdx = idx("stock");
    if (nameIdx === -1 || stockIdx === -1) {
      showToast("Import failed", "CSV must include brand_name (or name) and stock columns.", "warn");
      return;
    }

    const map = new Map(
      state.items.map((item) => [`${item.brand_name}|${item.batch}`, item])
    );
    let imported = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const get = (key) => {
        const pos = idx(key);
        return pos >= 0 ? String(row[pos] ?? "").trim() : "";
      };
      const getAny = (...keys) => {
        for (const key of keys) {
          const pos = idx(key);
          if (pos >= 0) return String(row[pos] ?? "").trim();
        }
        return "";
      };

      const brandName = getAny("brand_name", "name");
      if (!brandName) continue;
      const batch = get("batch");

      const item = normalizeItem({
        id: uid(),
        brand_name: brandName,
        manufacturer: get("manufacturer"),
        packaging_raw: getAny("packaging_raw", "packaging"),
        active_combined: getAny("active_combined", "salt"),
        batch,
        expiry: get("expiry"),
        stock: toNumber(get("stock"), 0),
        min_stock: toNumber(getAny("min_stock", "minStock"), 0),
        mrp: toNumber(get("mrp"), 0),
        purchase: toNumber(getAny("purchase_price", "purchase"), 0),
        purchase_date: get("purchase_date"),
        supplier: get("supplier"),
        createdAt: nowISO(),
        updatedAt: nowISO(),
      });

      const key = `${item.brand_name}|${item.batch}`;
      if (map.has(key)) {
        map.set(key, { ...map.get(key), ...item, updatedAt: nowISO() });
      } else {
        map.set(key, item);
      }
      imported++;
    }

    state.items = Array.from(map.values()).map(normalizeItem);
    state.skus = mergeSkus(state.skus, state.items);
    state.master = mergeMasterEntries(state.master, buildMasterFromSkus(state.skus));
    buildMasterIndex();
    saveState();
    renderAll();
    showToast("Imported", `${imported} row(s) processed.`, "good");
  };

  const importSkusCSV = (text) => {
    const rows = parseCSV(text);
    if (rows.length < 2) {
      showToast("Import failed", "CSV file is empty.", "warn");
      return;
    }

    const headers = rows[0].map((h) => h.trim());
    const idx = (name) => headers.indexOf(name);
    if (idx("brand_name") === -1) {
      showToast("Import failed", "SKU CSV must include brand_name column.", "warn");
      return;
    }

    const map = new Map(
      state.skus.map((sku) => [skuKey(sku), sku])
    );
    let imported = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const get = (key) => {
        const pos = idx(key);
        return pos >= 0 ? String(row[pos] ?? "").trim() : "";
      };

      const sku = normalizeSku({
        id: uid(),
        brand_name: get("brand_name"),
        manufacturer: get("manufacturer"),
        active_combined: get("active_combined"),
        packaging_raw: get("packaging_raw"),
        min_stock: toNumber(get("min_stock"), 0),
        createdAt: nowISO(),
        updatedAt: nowISO(),
      });
      if (!sku.brand_name) continue;
      const key = skuKey(sku);
      if (map.has(key)) {
        map.set(key, { ...map.get(key), ...sku, updatedAt: nowISO() });
      } else {
        map.set(key, sku);
      }
      imported++;
    }

    state.skus = Array.from(map.values()).map(normalizeSku);
    state.master = mergeMasterEntries(state.master, buildMasterFromSkus(state.skus));
    buildMasterIndex();
    saveState();
    renderAll();
    showToast("Imported", `${imported} SKU row(s) processed.`, "good");
  };

  const importSkusJSON = (text) => {
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      showToast("Import failed", "Invalid JSON file.", "bad");
      return;
    }
    const skus = Array.isArray(payload) ? payload : payload.skus || payload.sku || [];
    if (!Array.isArray(skus)) {
      showToast("Import failed", "JSON does not include SKU array.", "bad");
      return;
    }
    state.skus = skus.map(normalizeSku);
    state.master = mergeMasterEntries(state.master, buildMasterFromSkus(state.skus));
    buildMasterIndex();
    saveState();
    renderAll();
    showToast("Imported", "SKU list updated.", "good");
  };

  const importBackupJSON = (text) => {
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      showToast("Import failed", "Invalid JSON file.", "bad");
      return;
    }

    const inventory = payload.inventory || payload.items || [];
    const transactions = payload.transactions || payload.tx || [];
    const settings = payload.settings || {};
    const master = payload.master || [];
    const skus = payload.skus || payload.sku || [];

    if (!Array.isArray(inventory)) {
      showToast("Import failed", "JSON does not include inventory array.", "bad");
      return;
    }

    state.items = Array.isArray(inventory) ? inventory.map(normalizeItem) : [];
    state.skus = Array.isArray(skus) ? skus.map(normalizeSku) : [];
    state.skus = mergeSkus(state.skus, state.items);
    state.tx = Array.isArray(transactions) ? transactions : [];
    state.settings = { ...DEFAULT_SETTINGS, ...settings };
    state.master = mergeMasterEntries(
      Array.isArray(master) ? master : [],
      buildMasterFromSkus(state.skus)
    );
    buildMasterIndex();

    saveState();
    updateSettingsUI();
    renderAll();
    showToast("Imported", "Backup restored.", "good");
  };

  const handleImportFile = (file) => {
    if (!file) return;
    const reader = new FileReader();

    reader.onload = () => {
      const text = String(reader.result || "");
      if (file.name.toLowerCase().endsWith(".json")) {
        importBackupJSON(text);
      } else {
        importInventoryCSV(text);
      }
    };

    reader.readAsText(file);
  };

  const handleSkuImportFile = (file) => {
    if (!file) return;
    const reader = new FileReader();

    reader.onload = () => {
      const text = String(reader.result || "");
      if (file.name.toLowerCase().endsWith(".json")) {
        importSkusJSON(text);
      } else {
        importSkusCSV(text);
      }
    };

    reader.readAsText(file);
  };

  const seedDemoData = () => {
    state.items = [
      {
        id: uid(),
        brand_name: "Paracetamol 650",
        manufacturer: "ABC Pharma",
        packaging_raw: "strip of 10 tablets",
        active_combined: "Paracetamol (650mg)",
        batch: "BT-001",
        expiry: "2026-12-31",
        stock: 200,
        min_stock: 50,
        mrp: 35,
        purchase: 18,
        supplier: "ABC Pharma",
        createdAt: nowISO(),
        updatedAt: nowISO(),
      },
      {
        id: uid(),
        brand_name: "Pantoprazole 40",
        manufacturer: "XYZ Distributors",
        packaging_raw: "strip of 10 tablets",
        active_combined: "Pantoprazole (40mg)",
        batch: "BT-002",
        expiry: "2026-08-15",
        stock: 80,
        min_stock: 20,
        mrp: 120,
        purchase: 65,
        supplier: "XYZ Distributors",
        createdAt: nowISO(),
        updatedAt: nowISO(),
      },
      {
        id: uid(),
        brand_name: "Amoxicillin 500",
        manufacturer: "Healthline",
        packaging_raw: "strip of 10 capsules",
        active_combined: "Amoxicillin (500mg)",
        batch: "BT-003",
        expiry: "2025-06-10",
        stock: 15,
        min_stock: 25,
        mrp: 90,
        purchase: 50,
        supplier: "Healthline",
        createdAt: nowISO(),
        updatedAt: nowISO(),
      },
    ];

    state.skus = buildSkusFromItems(state.items);
    state.tx = [];
    state.master = mergeMasterEntries(state.master, buildMasterFromSkus(state.skus));
    buildMasterIndex();
    saveState();
    renderAll();
    showToast("Loaded", "Demo data added.", "good");
  };

  const bindEvents = () => {
    el.navItems.forEach((btn) => {
      btn.addEventListener("click", () => setView(btn.dataset.view));
    });

    el.gotoTransactions?.addEventListener("click", () => setView("transactions"));

    el.globalSearch?.addEventListener("input", (e) => {
      state.q = e.target.value || "";
      if (state.q.trim()) setView("inventory");
      renderInventory();
    });

    el.clearSearch?.addEventListener("click", () => {
      if (el.globalSearch) el.globalSearch.value = "";
      state.q = "";
      renderInventory();
    });

    el.filterChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        state.filter = chip.dataset.filter;
        el.filterChips.forEach((btn) => btn.classList.toggle("active", btn === chip));
        renderInventory();
      });
    });

    el.showZeroStock?.addEventListener("change", (e) => {
      state.showZeroStock = e.target.checked;
      renderInventory();
    });

    el.skuFilterChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        state.skuFilter = chip.dataset.skuFilter || "in";
        el.skuFilterChips.forEach((btn) =>
          btn.classList.toggle("active", btn === chip)
        );
        renderSkus();
      });
    });
    el.skuSearch?.addEventListener("input", (e) => {
      state.skuQ = String(e.target.value || "").trim().toLowerCase();
      renderSkus();
    });

    el.estimateSearch?.addEventListener("input", (e) => {
      state.estimateQ = String(e.target.value || "").trim().toLowerCase();
      renderEstimate();
    });
    el.estimateTableBody?.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      if (action !== "estimateAdd") return;
      const id = btn.dataset.id;
      const item = state.items.find((it) => it.id === id);
      addEstimateItem(item);
    });
    el.estimateListBody?.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === "estimateEdit") {
        state.estimateEditId = btn.dataset.id || "";
        renderEstimate();
        return;
      }
      if (action === "estimateCancel") {
        state.estimateEditId = "";
        renderEstimate();
        return;
      }
      if (action === "estimateSave") {
        const id = btn.dataset.id || "";
        const entry = state.estimate.find((e) => e.item_id === id);
        if (!entry) return;
        const rowEl = btn.closest("tr");
        const getField = (name) =>
          rowEl?.querySelector(`[data-field="${name}"]`)?.value || "";
        const brand = String(getField("brand_name") || "").trim();
        const batch = String(getField("batch") || "").trim();
        const expiry = String(getField("expiry") || "").trim();
        const mrp = toNumber(getField("mrp"), 0);
        const purchase = toNumber(getField("purchase"), 0);
        const qty = toNumber(getField("qty"), 0);

        if (!brand || qty <= 0) {
          showToast("Missing fields", "Brand and quantity are required.", "warn");
          return;
        }

        entry.brand_name = brand;
        entry.batch = batch;
        entry.expiry = expiry;
        entry.mrp = mrp;
        entry.purchase = purchase;
        entry.qty = qty;
        if (entry.custom_key) {
          entry.custom_key = [
            "custom",
            brand.toLowerCase(),
            batch.toLowerCase(),
            expiry.toLowerCase(),
            mrp,
            purchase,
          ].join("|");
        }
        state.estimateEditId = "";
        saveState();
        renderEstimate();
        return;
      }
      if (action === "estimateRemove") {
        const id = btn.dataset.id;
        removeEstimateItem(id);
        return;
      }
      if (action === "estimateAddCustom") {
        const brand = $("#estimateCustomBrand")?.value || "";
        const batch = $("#estimateCustomBatch")?.value || "";
        const expiry = $("#estimateCustomExpiry")?.value || "";
        const mrp = $("#estimateCustomMrp")?.value || "";
        const purchase = $("#estimateCustomPurchase")?.value || "";
        const qty = $("#estimateCustomQty")?.value || "";
        addCustomEstimate({ brand, batch, expiry, mrp, purchase, qty });
        const clearIds = [
          "estimateCustomBatch",
          "estimateCustomExpiry",
          "estimateCustomMrp",
          "estimateCustomPurchase",
          "estimateCustomQty",
        ];
        clearIds.forEach((id) => {
          const input = $(`#${id}`);
          if (input) input.value = "";
        });
        return;
      }
    });
    el.estimateClearAll?.addEventListener("click", () => {
      state.estimate = [];
      saveState();
      renderEstimate();
    });
    el.estimateImportBtn?.addEventListener("click", () => {
      if (el.estimateImportFile) el.estimateImportFile.click();
    });
    el.estimateImportFile?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const useMerge = confirm(
        "Import estimate CSV:\nOK = Merge quantities\nCancel = Replace existing list"
      );
      const mode = useMerge ? "merge" : "replace";
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result || "");
        importEstimateCSV(text, mode);
      };
      reader.readAsText(file);
      e.target.value = "";
    });

    el.sortBy?.addEventListener("change", (e) => {
      state.sortBy = e.target.value;
      renderInventory();
    });

    el.btnNewDrug?.addEventListener("click", () => openModal("drug"));

    el.btnStockIn?.addEventListener("click", () => {
      if (!state.skus.length) {
        showToast("No inventory", "Add a drug before stocking in.", "warn");
        return;
      }
      openModal("stock", { mode: "IN" });
    });

    el.btnStockOut?.addEventListener("click", () => {
      if (!state.skus.length) {
        showToast("No inventory", "Add a drug before stocking out.", "warn");
        return;
      }
      openModal("stock", { mode: "OUT" });
    });

    el.invTableBody?.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const item = state.items.find((it) => it.id === id);

      if (action === "editBatch") openModal("batchEdit", item);
      if (action === "in") openModal("stock", { mode: "IN", itemId: id });
      if (action === "out") openModal("stock", { mode: "OUT", itemId: id });
      if (action === "del") deleteDrug(id);
      if (action === "viewBrandTx") {
        const brand = btn.dataset.brand || "";
        setView("transactions");
        state.txQ = brand.trim().toLowerCase();
        if (el.txSearch) el.txSearch.value = brand;
        renderTransactions();
      }
    });

    el.skuTableBody?.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const key = btn.dataset.key || "";
      const action = btn.dataset.action;
      if (action === "editSku") {
        const sku = state.skus.find((s) => skuKey(s) === key);
        if (sku) openModal("drug", sku);
      }
      if (action === "archiveSku") {
        const sku = state.skus.find((s) => skuKey(s) === key);
        setSkuArchived(key, !sku?.archived);
      }
      if (action === "deleteSku") deleteSkuByKey(key);
    });

    el.modalClose?.addEventListener("click", closeModal);
    el.modalCancel?.addEventListener("click", closeModal);

    el.modalBackdrop?.addEventListener("click", (e) => {
      if (e.target === el.modalBackdrop) return;
    });

    el.modalForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = new FormData(el.modalForm);

      if (modalState.type === "drug") {
        const oldSku = state.skus.find((s) => s.id === data.get("id"));
        const result = upsertDrug(data, oldSku);
        if (result) closeModal();
      }

      if (modalState.type === "batchEdit") {
        const id = data.get("id");
        const done = updateBatchMeta(id, data);
        if (done) closeModal();
      }

      if (modalState.type === "merge") {
        const sourceId = data.get("source_id");
        const targetId = data.get("target_id");
        const pick = String(data.get("merge_pick") || "target").trim().toLowerCase();
        const reason = String(data.get("merge_reason") || "").trim();
        if (!reason) {
          showToast("Reason required", "Add a reason for merge.", "warn");
          return;
        }
        performMerge(sourceId, targetId, pick, reason);
        closeModal();
      }

      if (modalState.type === "stock") {
        const mode = data.get("mode");
        const brand = String(data.get("brand_name") || "").trim();
        const batch = String(data.get("batch") || "").trim();
        const item = state.items.find(
          (it) => it.brand_name === brand && it.batch === batch
        );
        if (mode === "IN") {
          applyStockIn(brand, batch, data);
        } else {
          if (!item) {
            showToast("Missing batch", "Select an existing brand and batch.", "warn");
            return;
          }
          applyStockOut(item, data);
        }
        closeModal();
      }
    });

    el.expiringWindow?.addEventListener("change", (e) => {
      state.settings.expWindow = toNumber(e.target.value, 60);
      saveState();
      updateSettingsUI();
      renderAll();
    });

    el.txApply?.addEventListener("click", () => {
      state.txFilters.type = el.txTypeFilter?.value || "all";
      state.txFilters.from = el.txFrom?.value || "";
      state.txFilters.to = el.txTo?.value || "";
      renderTransactions();
    });
    el.txSearch?.addEventListener("input", (e) => {
      state.txQ = String(e.target.value || "").trim().toLowerCase();
      renderTransactions();
    });

    el.txTableBody?.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (action === "reverseTx") {
        reverseTransaction(id);
        return;
      }
      if (action === "txDetails") {
        const tx = state.tx.find((t) => t.id === id);
        openTxDetails(tx);
      }
    });

    el.txReset?.addEventListener("click", () => {
      if (el.txTypeFilter) el.txTypeFilter.value = "all";
      if (el.txFrom) el.txFrom.value = "";
      if (el.txTo) el.txTo.value = "";
      state.txFilters = { type: "all", from: "", to: "" };
      renderTransactions();
    });

    el.exportInventory?.addEventListener("click", exportInventoryCSV);
    el.exportEstimate?.addEventListener("click", exportEstimateCSV);
    el.exportTransactions?.addEventListener("click", exportTransactionsCSV);
    el.exportSkus?.addEventListener("click", exportSkusCSV);
    el.exportBackupJson?.addEventListener("click", exportBackup);
    el.exportBackupJsonNoMaster?.addEventListener("click", exportBackupNoMaster);

    el.importBtn?.addEventListener("click", () => {
      if (el.importFile) el.importFile.click();
    });

    el.importFile?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      handleImportFile(file);
      e.target.value = "";
    });

    el.skuImportBtn?.addEventListener("click", () => {
      if (el.skuImportFile) el.skuImportFile.click();
    });
    el.skuImportFile?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      handleSkuImportFile(file);
      e.target.value = "";
    });

    el.loadMasterBtn?.addEventListener("click", () => {
      loadMasterFromFile();
    });
    el.importMasterBtn?.addEventListener("click", () => {
      if (el.masterFile) el.masterFile.click();
    });
    el.masterFile?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      importMasterFromUpload(file);
      e.target.value = "";
    });
    el.clearMasterBtn?.addEventListener("click", () => {
      const ok = confirm("Clear master list? This removes all master suggestions.");
      if (!ok) return;
      state.master = [];
      state.masterFromFile = false;
      buildMasterIndex();
      saveState();
      renderAll();
      showToast("Cleared", "Master list cleared.", "good");
    });

    el.wipeAll?.addEventListener("click", () => {
      const ok = confirm("Wipe all local data? This cannot be undone.");
      if (!ok) return;
      state.items = [];
      state.skus = [];
      state.tx = [];
      state.master = [];
      state.masterFromFile = false;
      buildMasterIndex();
      saveState();
      renderAll();
      showToast("Cleared", "All local data wiped.", "bad");
    });

    el.saveSettings?.addEventListener("click", () => {
      state.settings.hospitalName = el.setHospital?.value.trim() || "CAARYA Pharmacy";
      state.settings.defaultUser = el.setUser?.value.trim() || "Pharmacy";
      state.settings.expWindow = toNumber(el.setExpWindow?.value, 60);
      saveState();
      updateSettingsUI();
      renderAll();
      showToast("Saved", "Settings updated.", "good");
    });

    const getAuthCreds = () => {
      const email = el.authEmail?.value.trim() || "";
      const password = el.authPassword?.value || "";
      if (!email || !password) {
        showToast("Missing fields", "Email and password are required.", "warn");
        return null;
      }
      return { email, password };
    };

    el.authLogin?.addEventListener("click", async () => {
      if (!firebaseAuth) {
        showToast("Auth not ready", "Firebase auth is not initialized.", "warn");
        return;
      }
      const creds = getAuthCreds();
      if (!creds) return;
      try {
        await window.__firebase.signInWithEmailAndPassword(
          firebaseAuth,
          creds.email,
          creds.password
        );
      } catch (err) {
        console.error("Sign in failed", err);
        showToast("Sign in failed", "Check your email or password.", "bad");
      }
    });

    el.authSignup?.addEventListener("click", async () => {
      if (!firebaseAuth) {
        showToast("Auth not ready", "Firebase auth is not initialized.", "warn");
        return;
      }
      const creds = getAuthCreds();
      if (!creds) return;
      try {
        await window.__firebase.createUserWithEmailAndPassword(
          firebaseAuth,
          creds.email,
          creds.password
        );
        showToast("Account created", "You can now use the app.", "good");
      } catch (err) {
        console.error("Sign up failed", err);
        showToast("Sign up failed", "Email may already exist.", "bad");
      }
    });

    el.authLogout?.addEventListener("click", async () => {
      if (!firebaseAuth) return;
      try {
        await window.__firebase.signOut(firebaseAuth);
      } catch (err) {
        console.error("Sign out failed", err);
        showToast("Sign out failed", "Try again.", "bad");
      }
    });

    el.seedDemo?.addEventListener("click", seedDemoData);

    document.addEventListener("keydown", (e) => {
      const tag = e.target.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;

      if (e.key === "/") {
        e.preventDefault();
        el.globalSearch?.focus();
      }

      if (e.key.toLowerCase() === "n") {
        openModal("drug");
      }

      if (e.key.toLowerCase() === "i") {
        if (state.items.length) openModal("stock", { mode: "IN" });
      }

      if (e.key.toLowerCase() === "o") {
        if (state.items.length) openModal("stock", { mode: "OUT" });
      }
    });
  };

  const init = async () => {
    await loadState();
    updateSettingsUI();
    bindEvents();
    renderAll();
    if (el.filterChips.length) {
      el.filterChips.forEach((btn) => btn.classList.toggle("active", btn.dataset.filter === "all"));
    }
    if (el.showZeroStock) el.showZeroStock.checked = state.showZeroStock;
    if (el.skuFilterChips.length) {
      el.skuFilterChips.forEach((btn) =>
        btn.classList.toggle("active", btn.dataset.skuFilter === state.skuFilter)
      );
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void init());
  } else {
    void init();
  }
})();
