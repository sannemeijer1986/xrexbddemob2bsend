// Helper function to calculate fees with minimum fee logic (global scope)
function calculateFees(amount, payerRate, receiverRate) {
  const feeRate = 0.005; // 0.5%
  const MIN_SERVICE_FEE = 25;
  const calculatedServiceFee = amount * feeRate;
  const actualServiceFee = (amount === 0 || (calculatedServiceFee > 0 && calculatedServiceFee < MIN_SERVICE_FEE)) 
    ? MIN_SERVICE_FEE 
    : calculatedServiceFee;
  const isBelowMinimum = amount === 0 || (calculatedServiceFee > 0 && calculatedServiceFee < MIN_SERVICE_FEE);
  
  // Distribute the actual service fee according to fee distribution rates
  // payerRate and receiverRate are proportions of the feeRate (e.g., 0.01, 0.005, 0)
  // The total of payerRate + receiverRate always equals feeRate (0.01)
  let payerFee, receiverFee;
  if (payerRate === 0 && receiverRate === 0) {
    payerFee = 0;
    receiverFee = 0;
  } else {
    // Distribute proportionally based on the ratio of each rate to the total feeRate
    payerFee = actualServiceFee * (payerRate / feeRate);
    receiverFee = actualServiceFee * (receiverRate / feeRate);
  }
  
  return { payerFee, receiverFee, isBelowMinimum, actualServiceFee };
}

const PROTOTYPE_STATE_KEY = 'xrexb2b.state.v1';
const ADD_BANK_RETURN_KEY = 'xrexb2b.addBankReturnUrl';
const SEND_PAYMENT_RETURN_KEY = 'xrexb2b.sendPaymentReturnUrl';
const PROTOTYPE_STATE_MIN = 1;
const PROTOTYPE_STATE_MAX = 5;
const PROTOTYPE_STATE_LABELS = {
  1: 'No counterparty',
  2: 'Under review',
  3: 'Approved',
  4: 'Payment submitted',
  5: 'Payment sent',
};

const REVIEW_SUPPORT_LINK_HTML = '<a href="#" target="_blank" rel="noopener noreferrer">Contact Support</a>';
const REVIEW_INLINE_ERROR_DEFAULT = `Go back and try again, or ${REVIEW_SUPPORT_LINK_HTML} for further assistance.`;
const REVIEW_SNACKBAR_FALLBACK = 'Payment failed: No charge applied';
const REVIEW_ERROR_SCENARIOS_CONFIG = [
  {
    key: 'create-unexpected',
    title: '10001 Unexpected error (Connection timed out)',
    badgeLabel: 'Unexpected error',
    disablePrimary: true,
    snackbar: 'Payment failed: No charge applied',
  },
  {
    key: 'api-general',
    title: '10015 API error (API timed out)',
    badgeLabel: 'General API error',
    disablePrimary: true,
    snackbar: 'Payment failed: No charge applied',
  },
  {
    key: 'kyc-status',
    title: '202512 KYC status error',
    badgeLabel: 'KYC blocked',
    snackbar: 'Payment failed: No charge applied',
    disablePrimary: true,
    alertMessage: 'Your KYC status is not approved. Please complete verification before using payments.',
  },
  {
    key: 'cp-bank-invalid',
    title: '202512 Payout create failed (Receiver bank account is not valid)',
    badgeLabel: 'Bank invalid',
    snackbar: 'Payment failed: No charge applied',
    disablePrimary: true,
  },
  {
    key: 'cp-invalid',
    title: '202512 Payout create failed (Counterparty is not valid)',
    badgeLabel: 'Counterparty invalid',
    snackbar: 'Payment failed: No charge applied',
    disablePrimary: true,
  },
  {
    key: 'doc-not-found',
    title: '202512 Payout create failed (Document not found for documentUploadId: XXX)',
    badgeLabel: 'Document missing',
    snackbar: 'Payment failed: No charge applied',
    disablePrimary: true,
  },
  {
    key: 'doc-pre-required',
    title: '202512 Payout create failed (pre-shipment requires file PROFORMA_INVOICE or PURCHASE_ORDER)',
    badgeLabel: 'Pre-shipment doc',
    snackbar: 'Payment failed: No charge applied',
    disablePrimary: true,
  },
  {
    key: 'doc-post-ci',
    title: '202512 Payout create failed (post-shipment requires file COMMERCIAL_INVOICE)',
    badgeLabel: 'Commercial invoice',
    snackbar: 'Payment failed: No charge applied',
    disablePrimary: true,
  },
  {
    key: 'doc-post-transport',
    title: '202512 Payout create failed (post-shipment requires file TRANSPORT_DOCUMENT)',
    badgeLabel: 'Transport document',
    snackbar: 'Payment failed: No charge applied',
    disablePrimary: true,
  },
  {
    key: 'doc-post-packing',
    title: '202512 Payout create failed (post-shipment requires file PACKING_LIST)',
    badgeLabel: 'Packing list',
    snackbar: 'Payment failed: No charge applied',
    disablePrimary: true,
  },
  {
    key: 'order-preview-amount',
    title: '202512 Payout create failed (preview amount is not correct)',
    badgeLabel: 'Preview amount',
    snackbar: 'Payment failed: No charge applied',
    disablePrimary: true,
  },
  {
    key: 'order-preview-fee',
    title: '202512 Payout create failed (preview fee amount is not correct)',
    badgeLabel: 'Preview fee',
    snackbar: 'Payment failed: No charge applied',
    disablePrimary: true,
  },
  {
    key: 'order-payable-range',
    title: '202512 Payout create failed (payable amount should between min/max limit)',
    badgeLabel: 'Out of range',
    snackbar: 'Payment failed: No charge applied',
    disablePrimary: true,
  },
  {
    key: 'order-fee-rate',
    title: '202512 Payout create failed (fee rate is not correct)',
    badgeLabel: 'Fee rate mismatch',
    snackbar: 'Payment failed: No charge applied',
    disablePrimary: true,
  },
];

try { window.REVIEW_ERROR_SCENARIOS = REVIEW_ERROR_SCENARIOS_CONFIG; } catch (_) {}

const clampPrototypeState = (value) => {
  const safe = parseInt(value, 10);
  if (Number.isNaN(safe)) return PROTOTYPE_STATE_MIN;
  return Math.min(PROTOTYPE_STATE_MAX, Math.max(PROTOTYPE_STATE_MIN, safe));
};

let prototypeState = (() => {
  try {
    const stored = window.localStorage ? window.localStorage.getItem(PROTOTYPE_STATE_KEY) : null;
    if (stored !== null) return clampPrototypeState(stored);
  } catch (_) {}
  return PROTOTYPE_STATE_MIN;
})();

document.documentElement.dataset.prototypeState = `state-${prototypeState}`;

const prototypeStateListeners = new Set();

const notifyPrototypeStateChange = () => {
  prototypeStateListeners.forEach((listener) => {
    try { listener(prototypeState); } catch (err) { console.error(err); }
  });
  try {
    document.dispatchEvent(new CustomEvent('prototypeStateChange', { detail: { state: prototypeState } }));
  } catch (_) {}
};

function getPrototypeState() {
  return prototypeState;
}

function setPrototypeState(next, opts = {}) {
  const clamped = clampPrototypeState(next);
  if (!opts.force && clamped === prototypeState) return clamped;
  prototypeState = clamped;
  try {
    if (window.localStorage) window.localStorage.setItem(PROTOTYPE_STATE_KEY, String(clamped));
  } catch (_) {}
  document.documentElement.dataset.prototypeState = `state-${clamped}`;
  notifyPrototypeStateChange();
  return clamped;
}

function changePrototypeState(delta) {
  return setPrototypeState(getPrototypeState() + (delta || 0));
}

function onPrototypeStateChange(listener) {
  if (typeof listener !== 'function') return () => {};
  prototypeStateListeners.add(listener);
  try { listener(prototypeState); } catch (err) { console.error(err); }
  return () => prototypeStateListeners.delete(listener);
}

function getPrototypeStateLabel(value) {
  return PROTOTYPE_STATE_LABELS[value] || '';
}

try {
  window.getPrototypeState = getPrototypeState;
  window.setPrototypeState = setPrototypeState;
  window.changePrototypeState = changePrototypeState;
  window.onPrototypeStateChange = onPrototypeStateChange;
  window.getPrototypeStateLabel = getPrototypeStateLabel;
} catch (_) {}

// Global header account-chip behaviour (for all pages)
(function initAccountChipLink() {
  try {
    var chip = document.getElementById('accountChipLink');
    if (!chip) return;
    var mqDesktop = window.matchMedia('(min-width: 1280px)');
    var isDesktop = function () { return mqDesktop.matches; };
    var RETURN_KEY = 'xrexb2b.settingsReturnUrl';
    var setChipHref = function () {
      if (!chip) return;
      // Desktop: go directly to Account content, Mobile/Tablet: go to Settings menu
      chip.setAttribute('href', isDesktop() ? 'settings.html?view=content&page=account' : 'settings.html?view=menu');
    };
    setChipHref();
    mqDesktop.addEventListener('change', setChipHref);

    // Remember the page we came from so Settings can return there on Close menu
    chip.addEventListener('click', function () {
      try {
        var path = window.location.pathname || '/index.html';
        var search = window.location.search || '';
        var from = path + search;
        if (window.sessionStorage) {
          window.sessionStorage.setItem(RETURN_KEY, from);
        }
      } catch (_) {}
    });
  } catch (_) {}
})();

function initSendPayment() {
  // Mobile quick menu toggle
  const tabMenu = document.getElementById('tab-menu');
  const tabHome = document.getElementById('tab-home');
  const tabConvert = document.getElementById('tab-convert');
  const tabOTC = document.getElementById('tab-otc');
  const tabTrans = document.getElementById('tab-transactions');
  const homeView = document.getElementById('homeView');
  const quickView = document.getElementById('quickView');
  const transactionsView = document.getElementById('transactionsView');

  const setActiveTab = (btn) => {
    document.querySelectorAll('.tabbar__btn').forEach(b => {
      const icon = b.querySelector('.tabbar__icon');
      const activeSrc = icon && icon.getAttribute('data-icon-active');
      const inactiveSrc = icon && icon.getAttribute('data-icon-inactive');
      if (b === btn) {
        b.classList.add('is-active');
        if (icon && activeSrc) icon.setAttribute('src', activeSrc);
      } else {
        b.classList.remove('is-active');
        if (icon && inactiveSrc) icon.setAttribute('src', inactiveSrc);
      }
    });
  };

  const showHome = () => {
    if (homeView) homeView.hidden = false;
    if (quickView) quickView.hidden = true;
    if (transactionsView) transactionsView.hidden = true;
  };
  const showQuick = () => {
    if (homeView) homeView.hidden = true;
    if (transactionsView) transactionsView.hidden = true;
    if (quickView) quickView.hidden = false;
  };
  const showTransactions = () => {
    if (homeView) homeView.hidden = true;
    if (quickView) quickView.hidden = true;
    if (transactionsView) transactionsView.hidden = false;
  };

  // Render shared quick actions from template into all targets
  const qaTpl = document.getElementById('quickActionsTemplate');
  const qaHeaderTpl = document.getElementById('quickActionsHeaderTemplate');
  if (qaTpl) {
    document.querySelectorAll('[data-qa-target]').forEach((host) => {
      host.innerHTML = '';
      const frag = qaTpl.content.cloneNode(true);
      host.appendChild(frag);
    });
  }
  if (qaHeaderTpl) {
    document.querySelectorAll('[data-qa-header-target]').forEach((host) => {
      host.innerHTML = '';
      const frag = qaHeaderTpl.content.cloneNode(true);
      host.appendChild(frag);
    });
  }

  // Ensure correct view when crossing responsive breakpoints
  const transactionsTemplate = document.getElementById('transactionsTemplate');

  const initTransactionsSection = (section) => {
    if (!section) return;
    const tabs = Array.from(section.querySelectorAll('.transactions__tab'));
    const panels = Array.from(section.querySelectorAll('.transactions__panel'));

    let activeTabName = 'deposit';

    const activateTab = (name) => {
      if (!name) return;
      activeTabName = name;
      tabs.forEach((btn) => {
        const tabName = btn.getAttribute('data-tab');
        btn.classList.toggle('is-active', tabName === name);
      });
      panels.forEach((panel) => {
        panel.classList.toggle('is-active', panel.getAttribute('data-panel') === name);
      });
    };

    tabs.forEach((btn) => {
      const tabName = btn.getAttribute('data-tab');
      const isDisabled = btn.hasAttribute('data-disabled');
      btn.addEventListener('click', () => {
        if (isDisabled) return;
        if (tabName) {
          activateTab(tabName);
          try {
            if (window.sessionStorage) {
              window.sessionStorage.setItem('transactionsActiveTab', tabName);
            }
          } catch (_) {}
        }
      });
    });

    // Restore last selected tab, defaulting to deposit
    let initialTab = 'deposit';
    try {
      if (window.sessionStorage) {
        const saved = window.sessionStorage.getItem('transactionsActiveTab');
        if (saved === 'payment' || saved === 'deposit') {
          initialTab = saved;
        }
      }
    } catch (_) {}
    activateTab(initialTab);

    section.querySelectorAll('.transactions__item').forEach((item) => {
      const action = item.getAttribute('data-action');
      if (action === 'deposit') {
        item.addEventListener('click', () => {
          if (window.showSnackbar) window.showSnackbar('Not in prototype', 2000);
        });
      } else if (action === 'payment') {
        item.addEventListener('click', () => {
          try {
            if (window.sessionStorage) {
              window.sessionStorage.setItem('transactionsActiveTab', 'payment');
              window.sessionStorage.setItem('openTransactions', '1');
              // Ensure the Payment details page "Back" crumb returns to Home
              window.sessionStorage.setItem('xrexb2b.paymentDetailsReturnUrl', 'index.html');
            }
          } catch (_) {}
          const href = item.getAttribute('data-href') || 'payment-details.html';
          window.location.href = href;
        });
      }
    });
  };

  const renderTransactions = () => {
    if (!transactionsTemplate) return;
    document.querySelectorAll('[data-transactions-target]').forEach((target) => {
      const frag = transactionsTemplate.content.cloneNode(true);
      target.innerHTML = '';
      target.appendChild(frag);
      const section = target.querySelector('.transactions');
      hydrateTransactionsFromState(section);
      initTransactionsSection(section);
    });
    if (transactionsView) {
      const frag = transactionsTemplate.content.cloneNode(true);
      transactionsView.innerHTML = '';
      transactionsView.appendChild(frag);
      const section = transactionsView.querySelector('.transactions');
      if (section) section.classList.add('transactions--full');
      hydrateTransactionsFromState(section);
      initTransactionsSection(section);
    }
  };

  const hydrateTransactionsFromState = (section) => {
    if (!section) return;
    let state = 1;
    try {
      if (typeof getPrototypeState === 'function') {
        state = getPrototypeState();
      }
    } catch (_) {}

    const paymentPanel = section.querySelector('[data-panel="payment"]');
    const paymentList = paymentPanel && paymentPanel.querySelector('.transactions__list');

    if (!paymentList) return;
    const li = paymentList.querySelector('.transactions__item');
    if (!li) return;

    const titleEl = li.querySelector('.transactions__item-title');
    const amountEl = li.querySelector('.transactions__cell--amount');
    const purposeEl = li.querySelector('.transactions__item-purpose');
    const purposeSubEl = li.querySelector('.transactions__item-purpose-sub');
    const statusEls = li.querySelectorAll('.transactions__item-status');
    const dateEl = li.querySelector('.transactions__cell--date');

    // States 1-3: single row showing "No data"
    if (state <= 3) {
      if (titleEl) {
        titleEl.textContent = 'No data';
        titleEl.style.color = '#797A7B';
      }
      if (amountEl) amountEl.textContent = '';
      if (purposeEl) purposeEl.textContent = '';
      if (purposeSubEl) purposeSubEl.textContent = '';
      if (dateEl) dateEl.textContent = '';
      statusEls.forEach((el) => { if (el) el.textContent = ''; el && el.classList.remove('transactions__item-status--processing', 'transactions__item-status--completed'); });
      return;
    }

    // States 4-5: show payment row with data from receiptData
    let data = null;
    try {
      const raw = window.sessionStorage && window.sessionStorage.getItem('receiptData');
      if (raw) data = JSON.parse(raw);
    } catch (_) {}

    if (data) {
      if (titleEl) titleEl.textContent = data.receiverName || 'Delta Electronics, Inc.';
      if (amountEl) amountEl.textContent = data.amountPayableFmt || '50,000.00 USD';
      if (purposeEl) purposeEl.textContent = data.nature || 'Goods purchase';
      if (purposeSubEl) purposeSubEl.textContent = data.docNumber || 'PI-001234';
      if (dateEl) dateEl.textContent = data.dateTime || '25/11/2025, 15:19:09';
    }

    statusEls.forEach((el) => {
      if (!el) return;
      el.textContent = state >= 5 ? 'Sent' : 'Processing';
      el.classList.remove('transactions__item-status--processing', 'transactions__item-status--completed');
      el.classList.add(state >= 5 ? 'transactions__item-status--completed' : 'transactions__item-status--processing');
    });
  };

  renderTransactions();

  const DESKTOP_BP = 1280;
  const syncResponsiveState = () => {
    if (!homeView || !quickView) return;
    if (window.innerWidth >= DESKTOP_BP) {
      // On desktop, always show the home layout (with sidebar) and mark Assets active
      showHome();
      if (tabHome) setActiveTab(tabHome);
    }
    // Below desktop we keep the current view (assets / quick / transactions)
  };
  window.addEventListener('resize', syncResponsiveState);
  // Run once on load to guarantee a consistent state
  syncResponsiveState();

  if (tabHome) tabHome.addEventListener('click', () => { showHome(); setActiveTab(tabHome); });
  if (tabMenu) tabMenu.addEventListener('click', () => { showQuick(); setActiveTab(tabMenu); });

  // Prototype only supports Assets, Transactions, and Quick menu tabs.
  // Keep Convert / OTC clickable but do not change active state or content.
  if (tabConvert) tabConvert.addEventListener('click', (e) => { e.preventDefault(); });
  if (tabOTC) tabOTC.addEventListener('click', (e) => { e.preventDefault(); });

  if (tabTrans) tabTrans.addEventListener('click', () => { showTransactions(); setActiveTab(tabTrans); });

  // Initialize icons based on default active tab
  setActiveTab(document.querySelector('.tabbar__btn.is-active') || tabHome);
  document.addEventListener('prototypeStateChange', () => {
    renderTransactions();
  });
  // If coming back with request to open quick menu on mobile/tablet, honor it
  const shouldOpenQuick =
    window.innerWidth < DESKTOP_BP &&
    (window.location.hash === '#quick' || sessionStorage.getItem('openQuick') === '1');
  if (shouldOpenQuick && tabMenu) {
    showQuick();
    setActiveTab(tabMenu);
    sessionStorage.removeItem('openQuick');
  }

  // If coming back from payment details via Transactions entrypoint,
  // only handle this on the home page (where the Transactions UI exists).
  const hasOpenTransactionsFlag = sessionStorage.getItem('openTransactions') === '1';
  if (hasOpenTransactionsFlag && homeView) {
    if (window.innerWidth < DESKTOP_BP && tabTrans) {
      // Mobile/tablet: reopen the Transactions view
      showTransactions();
      setActiveTab(tabTrans);
    } else if (window.innerWidth >= DESKTOP_BP) {
      // Desktop: scroll back to the Transactions section on the home layout (no animation)
      try {
        const homeTransactionsSection = document.querySelector('.home-transactions');
        if (homeTransactionsSection && typeof homeTransactionsSection.scrollIntoView === 'function') {
          homeTransactionsSection.scrollIntoView({ behavior: 'auto', block: 'start' });
        } else if (homeTransactionsSection) {
          window.scrollTo(0, homeTransactionsSection.offsetTop || 0);
        }
      } catch (_) {}
    }
    sessionStorage.removeItem('openTransactions');
  }

  const form = document.querySelector('.form');
  if (!form) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    hasTriedSubmit = true;
    if (typeof validateSendForm === 'function') validateSendForm();
    const primaryBtn = confirmBtn || document.getElementById('confirm-send');
    // Only allow open when valid (based on aria-disabled managed by validateSendForm)
    const isDisabled = primaryBtn ? primaryBtn.getAttribute('aria-disabled') === 'true' : true;
    if (isDisabled) {
      setConfirmErrorVisible(true);
      return;
    }
    const modal = document.getElementById('confirmPaymentModal');
    if (modal) {
      modal.setAttribute('aria-hidden', 'false');
      document.documentElement.classList.add('modal-open');
      document.body.classList.add('modal-open');
    }
  });

  // ---- Live summary calculations (Amount + Fees) ----
  const amountInput = document.getElementById('amount');
  const feeRadios = document.querySelectorAll('input[type="radio"][name="fee"]');
  const deductRadios = document.querySelectorAll('input[type="radio"][name="deduct"]');
  const natureSelect = document.getElementById('nature');
  const purposeSelect = document.getElementById('purpose');
  let lastNatureVal = natureSelect ? natureSelect.value : '';

  const summaryContainer = document.querySelector('.card--summary');
  const findSummaryRow = (labelText) => {
    let row = null;
    const scope = summaryContainer || document;
    scope.querySelectorAll('.summary-pair, .summary-pair.summary-pair--large').forEach((pair) => {
      const labelEl = pair.querySelector('.muted');
      if (labelEl && labelEl.textContent.trim().toLowerCase() === labelText.toLowerCase()) {
        row = pair;
      }
    });
    return row;
  };
  const findSummaryRowStartsWith = (prefixText) => {
    let row = null;
    const scope = summaryContainer || document;
    scope.querySelectorAll('.summary-pair').forEach((pair) => {
      const labelEl = pair.querySelector('.muted');
      if (labelEl && labelEl.textContent.trim().toLowerCase().startsWith(prefixText.toLowerCase())) {
        row = pair;
      }
    });
    return row;
  };

  const summaryRows = {
    subtotal: findSummaryRow('Your subtotal'),
    serviceTitle: (summaryContainer || document).querySelector('.summary-pair[data-summary="service-title"]'),
    servicePayer: (summaryContainer || document).querySelector('[data-summary="service-payer"]'),
    servicePayee: (summaryContainer || document).querySelector('[data-summary="service-payee"]'),
    amountPayable: findSummaryRow('Payment amount'),
    deductFrom: findSummaryRow('Deduct from'),
    nature: findSummaryRow('Nature'),
    purpose: findSummaryRow('Purpose'),
    youPay: findSummaryRow('You pay'),
    payeeReceives: findSummaryRow('Send to receiver'),
    // Conversion row label starts with \"Conversion\" (e.g. \"Conversion rate\")
    conversion: findSummaryRowStartsWith('Conversion'),
  };

  const getPayerCurrency = () => {
    const selected = Array.from(deductRadios).find(r => r.checked);
    return selected ? selected.value : 'USD';
  };
  const payeeCurrency = 'USD';

  const formatAmount = (value, suffix) => {
    const formatted = Number(value || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${formatted} ${suffix}`;
  };

  const syncAccountDisplay = () => {};

  // Mobile summary fixed fallback: pin when near "Amount and fees"
  (function initMobileSummaryPin() {
    const root = document.querySelector('main.page--send');
    if (!root) return;
    const summaryCard = document.querySelector('.card--summary');
    if (!summaryCard) return;
    const getHeaderH = () => {
      const h = document.querySelector('.site-header .header__content');
      return h ? h.offsetHeight : 64;
    };
    const getAmtTitle = () => {
      const nodes = Array.from(document.querySelectorAll('h2.card__title'));
      return nodes.find(n => (n.textContent || '').trim().toLowerCase().includes('amount and fees'));
    };
    const onScroll = () => {
      const isMobile = window.innerWidth < DESKTOP_BP;
      if (!isMobile) {
        summaryCard.classList.remove('is-fixed-mobile');
        return;
      }
      const t = getAmtTitle();
      if (!t) return;
      const headerH = getHeaderH();
      const top = t.getBoundingClientRect().top;
      // If the section header has reached the viewport (under the header), fix it
      if (top <= headerH + 8) {
        summaryCard.classList.add('is-fixed-mobile');
        summaryCard.style.top = `${headerH}px`;
    } else {
        summaryCard.classList.remove('is-fixed-mobile');
        summaryCard.style.top = '';
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
  })();

  // Add-bank back link: return to captured entrypoint (index, select-counterparty, settings)
  (function initAddBankBackLink() {
    try {
      var backLink = document.getElementById('abBackLink');
      if (!backLink) return;
      var key = ADD_BANK_RETURN_KEY;
      var target = null;
      if (window.sessionStorage) {
        target = window.sessionStorage.getItem(key);
      }
      var href = 'select-counterparty.html';
      if (target === 'index') href = 'index.html';
      if (target === 'settings') href = 'settings.html?view=content&page=banks';
      backLink.setAttribute('href', href);
    } catch (_) {}
  })();

  // ---- Enable/disable Confirm send based on filled inputs/selects ----
  const confirmBtn = document.getElementById('confirm-send');
  const confirmBtnSticky = document.getElementById('confirm-send-sticky');
  const REQUIRED_ERROR_TEXT = 'This field is required';
  let hasTriedSubmit = false;
  let amountRequiredActive = false;
  const setConfirmErrorVisible = (visible) => {
    document.body.classList.toggle('has-cta-error', !!visible);
    [document.getElementById('confirm-error'), document.getElementById('confirm-error-mobile')].forEach((node) => {
      if (!node) return;
      node.hidden = !visible;
      if (visible) {
        node.textContent = 'Please check all required fields/errors';
      }
    });
  };
  const isElementVisible = (el) => {
    if (!el) return false;
    if (el.hidden) return false;
    if (el.closest('[hidden]')) return false;
    const rect = el.getBoundingClientRect();
    return !(rect.width === 0 && rect.height === 0);
  };
  const setConfirmDisabled = (disabled) => {
    // Keep buttons clickable; reflect state via aria attributes only
    [confirmBtn, confirmBtnSticky].forEach((btn) => {
      if (!btn) return;
      btn.disabled = false;
      btn.removeAttribute('disabled');
      btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    });
  };
  setConfirmDisabled(true);
  const validateSendForm = () => {
    const natureEl = document.getElementById('nature');
    const purposeEl = document.getElementById('purpose');
    const amountEl = document.getElementById('amount');
    const pre = document.getElementById('docs-pre');
    const post = document.getElementById('docs-post');

    const isFilledText = (el) => !!(el && String(el.value || '').trim().length >= 1);
    const isFilledSelect = (el) => !!(el && String(el.value || '') !== '');

    const natureOk = isFilledSelect(natureEl);
    const purposeElValue = purposeEl ? purposeEl.value : '';
    const purposeOthersEl = document.getElementById('purposeOthers');
    // Purpose is valid if it's selected
    // If "others" is selected, the purposeOthers field becomes required and must be filled
    const purposeBaseOk = isFilledSelect(purposeEl);
    let purposeOk = purposeBaseOk;
    if (purposeOk && purposeElValue === 'others') {
      // When "Others" is selected, the purposeOthers field is required
      purposeOk = purposeOthersEl && isFilledText(purposeOthersEl);
    }
    // Amount must be a positive number; treat empty or 0 as not filled
    let amountOk = false;
    if (amountEl) {
      const amtRaw = String(amountEl.value || '').replace(/,/g, '').trim();
      const amtNum = parseFloat(amtRaw);
      amountOk = Number.isFinite(amtNum) && amtNum > 0;
    }

    const shouldShowErrors = hasTriedSubmit;

    // Inline error helpers
    const setError = (id, active) => {
      const el = document.getElementById(id);
      if (!el) return;
      // Toggle helper class on the surrounding doc-miss-row to control spacing on mobile
      const missRow = el.closest('.doc-miss-row');
      if (missRow) {
        if (active) {
          missRow.classList.remove('no-error');
        } else {
          missRow.classList.add('no-error');
        }
      }
      if (!active) {
        el.hidden = true;
        return;
      }
      el.hidden = false;
      el.textContent = REQUIRED_ERROR_TEXT;
    };

    let docsOk = true;
    const postDocErrorIds = ['doc-post-error-ci', 'doc-post-error-transport', 'doc-post-error-packing'];
    const hideAllDocErrors = () => {
      setError('doc-type-error', false);
      setError('doc-upload-error', false);
      postDocErrorIds.forEach((id) => setError(id, false));
    };
    if (natureOk) {
      if (pre && !pre.hidden) {
        const docType = document.getElementById('docType');
        const uploads = document.querySelectorAll('#docs-pre .upload-item');
        const docTypeOk = isFilledSelect(docType);
        const uploadsOk = Array.from(uploads).every(item => item.classList.contains('is-uploaded'));
        docsOk = docTypeOk && uploadsOk;
        setError('doc-type-error', shouldShowErrors && !docTypeOk);
        setError('doc-upload-error', shouldShowErrors && !uploadsOk);
        postDocErrorIds.forEach((id) => setError(id, false));
      } else if (post && !post.hidden) {
        const uploads = document.querySelectorAll('#docs-post .upload-item');
        let uploadsOk = true;
        uploads.forEach((item) => {
          const uploaded = item.classList.contains('is-uploaded');
          // Treat the adjacent \"I don't have this document\" checkbox as a valid alternative
          let missedOk = false;
          const maybeMissRow = item.nextElementSibling;
          if (maybeMissRow && maybeMissRow.classList && maybeMissRow.classList.contains('doc-miss-row')) {
            const missChk = maybeMissRow.querySelector('input[type=\"checkbox\"]');
            if (missChk) missedOk = !!missChk.checked;
          }
          const valid = uploaded || missedOk;
          uploadsOk = uploadsOk && valid;
          const key = item.getAttribute('data-doc-key');
          if (key) {
            setError(`doc-post-error-${key}`, shouldShowErrors && !valid);
          }
        });
        docsOk = uploadsOk;
        setError('doc-type-error', false);
        setError('doc-upload-error', false);
      } else {
        hideAllDocErrors();
      }
    } else {
      docsOk = false;
      hideAllDocErrors();
    }

    // Inline errors present?
    const amountWrap = document.querySelector('.amount-input');
    const domAmountError = document.getElementById('amount-error');

    // Nature
    setError('nature-error', shouldShowErrors && !natureOk);

    // Purpose + purpose-others
    const purposeMissing = !purposeBaseOk;
    const purposeOthersMissing = purposeBaseOk && purposeElValue === 'others' && !(purposeOthersEl && isFilledText(purposeOthersEl));
    setError('purpose-error', shouldShowErrors && purposeMissing);
    setError('purpose-others-error', shouldShowErrors && purposeOthersMissing);

    // Amount required (only when user attempted submit)
    amountRequiredActive = shouldShowErrors && !amountOk;

    // Conversion terms checkbox validation (required when USDT is selected)
    const payerCurrency = getPayerCurrency();
    const conversionTermsCheckbox = document.getElementById('conversionTermsCheckbox');
    const conversionTermsOk = payerCurrency !== 'USDT' || (conversionTermsCheckbox && conversionTermsCheckbox.checked);
    setError('conversion-terms-error', shouldShowErrors && !conversionTermsOk);

    const hasInlineError =
      amountRequiredActive ||
      (amountWrap && amountWrap.classList.contains('is-error')) ||
      (domAmountError && domAmountError.hidden === false);

    const allValid = natureOk && purposeOk && amountOk && docsOk && !hasInlineError && conversionTermsOk;

    setConfirmDisabled(!allValid);
    if (allValid) {
      setConfirmErrorVisible(false);
    } else if (hasTriedSubmit) {
      // If user has previously tried to submit, keep CTA error visible
      setConfirmErrorVisible(true);
    }
    updateSummary();
  };

  const getFeeMode = () => {
    const selected = Array.from(feeRadios).find(r => r.checked);
    return selected ? selected.value : 'you';
  };

  const setServiceBreakdown = (_payerPctAbs, _payeePctAbs, _hidePercentage = false) => {
    // Re-query elements to ensure we have fresh references
    const payerRow = (summaryContainer || document).querySelector('[data-summary="service-payer"]');
    const payeeRow = (summaryContainer || document).querySelector('[data-summary="service-payee"]');
    const payerLabel = payerRow && payerRow.querySelector('.muted');
    const payeeLabel = payeeRow && payeeRow.querySelector('.muted');
    if (payerLabel) {
      payerLabel.textContent = '• Paid by you';
    }
    if (payeeLabel) {
      payeeLabel.textContent = '• Paid by receiver';
    }
  };

  const updateSummary = () => {
    if (!amountInput) return;
    const raw = (amountInput.value || '').toString().replace(/,/g, '');
    const amount = parseFloat(raw) || 0;
    const mode = getFeeMode();

    // Determine fee shares
    const feeRate = 0.005; // 0.5%
    let payerRate = 0, receiverRate = 0;
    if (mode === 'you') { payerRate = feeRate; receiverRate = 0; }
    else if (mode === 'receiver') { payerRate = 0; receiverRate = feeRate; }
    else { payerRate = feeRate / 2; receiverRate = feeRate / 2; }

    // Calculate fees with minimum fee logic
    const { payerFee, receiverFee, isBelowMinimum } = calculateFees(amount, payerRate, receiverRate);

    const youPay = amount + payerFee;
    const payeeGets = amount - receiverFee;
    const subtotal = amount; // before fees

    // Update labels and values
    setServiceBreakdown();

    const payerCurrency = getPayerCurrency();
    const showConversion = payerCurrency !== payeeCurrency;
    // Keep the select display in sync with currency
    syncAccountDisplay();
    // Toggle USDT rate helper
    const deductRate = document.getElementById('deduct-rate');
    if (deductRate) {
      deductRate.hidden = payerCurrency !== 'USDT';
    }
    // Toggle conversion terms checkbox section
    const conversionTerms = document.getElementById('conversion-terms');
    if (conversionTerms) {
      conversionTerms.hidden = payerCurrency !== 'USDT';
      // Reset checkbox when hidden
      if (payerCurrency !== 'USDT') {
        const checkbox = document.getElementById('conversionTermsCheckbox');
        if (checkbox) {
          checkbox.checked = false;
        }
      }
    }
    // Amount per-tx limit inline error + input underline color
    const MIN_TX_LIMIT = 50;
    const PER_TX_LIMIT = 1000000;
    const amountBelowMinTx = amount > 0 && amount < MIN_TX_LIMIT;
    const amountOverPerTx = amount >= PER_TX_LIMIT;
    const amountMeta = document.querySelector('.amount-meta');
    const amountMetaText = amountMeta?.querySelector('.amount-meta__text');
    const amountInputWrap = document.querySelector('.amount-input');
    const amountMetaHasLimitError = amountBelowMinTx || amountOverPerTx;
    if (amountMeta) {
      amountMeta.classList.toggle('is-error', amountRequiredActive || amountMetaHasLimitError);
    }
    if (amountMetaText) {
      const formatLimit = (value) => Number(value || 0).toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
      if (amountRequiredActive) {
        amountMetaText.textContent = REQUIRED_ERROR_TEXT;
      } else if (amountBelowMinTx) {
        amountMetaText.textContent = `Amount is below ${formatLimit(MIN_TX_LIMIT)} minimum per transaction`;
      } else if (amountOverPerTx) {
        amountMetaText.textContent = `Amount exceeds ${formatLimit(PER_TX_LIMIT)} maximum per transaction`;
      } else {
        amountMetaText.textContent = `Min/max per transaction ${formatLimit(MIN_TX_LIMIT)} - ${formatLimit(PER_TX_LIMIT)}`;
      }
    }
    // Inline error for amount exceeding selected account balance (consider payer fee share)
    const amountError = document.getElementById('amount-error');
    const selectedRadio = Array.from(document.querySelectorAll('.fee-options--deduct input[type="radio"]')).find(r => r.checked);
    const balanceText = selectedRadio?.closest('.fee-option')?.querySelector('.fee-option__content .muted')?.textContent || '';
    const balanceNum = (() => {
      const m = balanceText.replace(/[^0-9.]/g, '');
      return parseFloat(m || '0') || 0;
    })();
    const overBalance = youPay > balanceNum;
    if (amountError) {
      amountError.hidden = !overBalance;
      if (overBalance) {
        // Compose message: show Amount + fee (computed total) exceeds balance
        const totalStr = Number(youPay || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        amountError.textContent = `Amount + fee (${totalStr}) exceeds balance`;
      }
    }
    // Clear previous error highlights, then mark selected
    document.querySelectorAll('.fee-options--deduct .fee-option .fee-option__content .muted').forEach(el => el.classList.remove('is-error'));
    if (overBalance && selectedRadio) {
      const small = selectedRadio.closest('.fee-option')?.querySelector('.fee-option__content .muted');
      if (small) small.classList.add('is-error');
    }
    // Amount input red underline if any error active
    const anyAmountError = amountRequiredActive || amountMetaHasLimitError || overBalance;
    if (amountInputWrap) {
      amountInputWrap.classList.toggle('is-error', anyAmountError);
    }

    if (summaryRows.subtotal) {
      const v = summaryRows.subtotal.querySelector('strong');
      if (v) v.textContent = formatAmount(subtotal, payerCurrency);
    }
    if (summaryRows.serviceTitle) {
      // Only show the label; totals are displayed in the breakdown rows.
      // Styling is handled via CSS using the `.service-fee--min` class.
      const row = summaryRows.serviceTitle;
      const pctEl = row.querySelector('.service-fee__percentage');
      const minEl = row.querySelector('.service-fee__minimum');

      if (pctEl && minEl) {
        if (isBelowMinimum) {
          row.classList.add('service-fee--min');
          pctEl.textContent = `${(feeRate * 100).toFixed(2)}%`;
          // Use the fixed minimum service fee amount for display
          minEl.textContent = `${formatAmount(25, 'USD')}`;
        } else {
          row.classList.remove('service-fee--min');
          pctEl.textContent = `${(feeRate * 100).toFixed(2)}%`;
        }
      }
    }
    // Re-query elements to ensure we have fresh references
    const payerRow = (summaryContainer || document).querySelector('[data-summary="service-payer"]');
    const payeeRow = (summaryContainer || document).querySelector('[data-summary="service-payee"]');
    if (payerRow) {
      const v = payerRow.querySelector('strong');
      if (v) v.textContent = formatAmount(payerFee, payerCurrency);
    }
    if (payeeRow) {
      const v = payeeRow.querySelector('strong');
      if (v) v.textContent = formatAmount(receiverFee, payeeCurrency);
    }
    if (summaryRows.amountPayable) {
      const v = summaryRows.amountPayable.querySelector('strong');
      if (v) v.textContent = formatAmount(amount, payeeCurrency); // always USD
    }
    if (summaryRows.youPay) {
      const v = summaryRows.youPay.querySelector('strong');
      if (v) {
        const payerCurrency = getPayerCurrency();
        v.textContent = formatAmount(youPay, payerCurrency);
      }
    }
    if (summaryRows.deductFrom) {
      const v = summaryRows.deductFrom.querySelector('strong');
      if (v) v.textContent = `${getPayerCurrency()} account`;
      // Show/hide "See convert details" button based on USDT selection
      const convertDetailsBtn = document.getElementById('fees-details-open');
      if (convertDetailsBtn) {
        convertDetailsBtn.style.display = showConversion ? '' : 'none';
      }
    }
    if (summaryRows.payeeReceives) {
      const v = summaryRows.payeeReceives.querySelector('strong');
      if (v) v.textContent = formatAmount(payeeGets, payeeCurrency);
    }
    // Update mobile sticky amount
    const stickyAmt = document.getElementById('mobileStickyAmount');
    if (stickyAmt) {
      // Preserve the chevron image if it exists
      const chevron = stickyAmt.querySelector('.ms-chevron');
      const chevronClone = chevron ? chevron.cloneNode(true) : null;
      stickyAmt.textContent = formatAmount(payeeGets, payeeCurrency);
      if (chevronClone) {
        stickyAmt.appendChild(chevronClone);
      }
    }
    if (summaryRows.conversion) {
      // Show only if payer currency differs from payee currency
      if (showConversion) {
        summaryRows.conversion.style.display = '';
        const v = summaryRows.conversion.querySelector('strong');
        if (v) v.textContent = `1 ${payerCurrency} = 1 ${payeeCurrency}`;
      } else {
        summaryRows.conversion.style.display = 'none';
      }
    }
    // Populate Convert details modal (populate whatever fields exist)
    (function populateConvertModal() {
      const cvFromEl = document.getElementById('cv-from');
      const cvFeePctEl = document.getElementById('cv-fee-pct');
      const cvFeeAmtEl = document.getElementById('cv-fee-amt');
      const cvNetEl = document.getElementById('cv-net');
      const cvRateEl = document.getElementById('cv-rate');
      const cvToEl = document.getElementById('cv-to');
      // Currently 0% conversion fee and 1:1 rate
      const convertFeePct = 0.00;
      const convertFeeAmt = 0.00;
      const convertFrom = amount; // amount is in payeeCurrency; rate is 1:1
      if (cvFromEl) cvFromEl.textContent = formatAmount(convertFrom, payerCurrency);
      if (cvFeePctEl) cvFeePctEl.textContent = `${convertFeePct.toFixed(2)}%`;
      if (cvFeeAmtEl) cvFeeAmtEl.textContent = convertFeeAmt ? formatAmount(convertFeeAmt, payerCurrency) : '--';
      if (cvNetEl) cvNetEl.textContent = formatAmount(convertFrom - convertFeeAmt, payerCurrency);
      if (cvRateEl) cvRateEl.textContent = `1 ${payerCurrency} = 1 ${payeeCurrency}`;
      if (cvToEl) cvToEl.textContent = formatAmount(amount, payeeCurrency);
    })();
    // Update Fees Details modal fields when present
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setText('fd-subtotal', formatAmount(subtotal, payeeCurrency)); // subtotal is in USD
    setText('fd-payer', formatAmount(payerFee, payerCurrency));
    setText('fd-receiver', formatAmount(receiverFee, payeeCurrency));
    setText('fd-youpay', formatAmount(youPay, payerCurrency));
    setText('fd-getspaid', formatAmount(payeeGets, payeeCurrency));
    setText('fd-payer-label', '• Paid by you');
    setText('fd-receiver-label', '• Paid by receiver');
  };

  const updateNaturePurpose = () => {
    if (summaryRows.nature && natureSelect) {
      const v = summaryRows.nature.querySelector('strong');
      const label = natureSelect.selectedOptions?.[0]?.textContent?.trim() || '';
      const filled = !!(natureSelect.value);
      if (v) v.textContent = filled ? label : '- -';
      natureSelect.classList.toggle('is-filled', !!natureSelect.value);
    }
    if (summaryRows.purpose && purposeSelect) {
      const v = summaryRows.purpose.querySelector('strong');
      const label = purposeSelect.selectedOptions?.[0]?.textContent?.trim() || '';
      const filled = !!(purposeSelect.value);
      if (v) v.textContent = filled ? label : '- -';
      purposeSelect.classList.toggle('is-filled', !!purposeSelect.value);
    }

    // Toggle supporting docs section based on nature selection
    const docsTitle = document.getElementById('docs-title');
    const docsWrap = document.getElementById('docs');
    const spanNature = docsTitle?.querySelector('[data-docs-nature]');
    const pre = document.getElementById('docs-pre');
    const post = document.getElementById('docs-post');
    if (!natureSelect || !docsTitle || !docsWrap || !pre || !post) return;
    const natureVal = natureSelect.value;
    const natureTxt = natureSelect.selectedOptions?.[0]?.textContent?.trim() || '';
    const isChosen = !!natureVal;
    docsTitle.hidden = !isChosen;
    docsWrap.hidden = !isChosen;
    if (!isChosen) return;
    if (spanNature) spanNature.textContent = natureTxt.toLowerCase();
    const isPre = natureVal === 'pre_shipment';
    const isNatureChanged = natureVal !== lastNatureVal;
    pre.hidden = !isPre;
    post.hidden = isPre;

    // Reset and sync doc-type card
    const docTypeSelect = document.getElementById('docType');
    const card = document.querySelector('.doc-type-card');
    const badge = card?.querySelector('.doc-type__badge');
    const title = card?.querySelector('.doc-type__title');
    const desc = card?.querySelector('.doc-type__texts small');
    const syncDocCard = () => {
      if (!docTypeSelect || !card) return;
      const val = docTypeSelect.value;
      const numField   = document.getElementById('docNumberField');
      const numLabel   = document.getElementById('docNumberLabel');
      const uploadBlock = document.getElementById('docUploadBlock');
      const upTitle    = document.getElementById('docUploadTitle');
      const upDesc     = document.getElementById('docUploadDesc');
      const upBadge    = document.getElementById('docUploadBadge');
      const upIcon     = document.getElementById('docUploadIcon');

      if (!val) {
        if (badge) badge.classList.add('is-hidden');
        if (title) { title.textContent = 'Select'; title.classList.add('is-placeholder'); }
        card.classList.add('is-placeholder');
        if (desc) desc.textContent = '';
        if (numField) numField.hidden = true;
        if (uploadBlock) uploadBlock.hidden = true;
      } else if (val === 'PI') {
        if (badge) { badge.classList.remove('is-hidden'); }
        if (title) { title.textContent = 'Proforma invoice (PI)'; title.classList.remove('is-placeholder'); }
        card.classList.remove('is-placeholder');
        if (desc) desc.textContent = 'A preliminary invoice issued by the seller before delivery';
        if (numField) numField.hidden = false;
        if (numLabel) numLabel.textContent = 'Proforma invoice number';
        if (uploadBlock) uploadBlock.hidden = false;
        if (upTitle) upTitle.textContent = 'Proforma invoice (PI)';
        if (upDesc)  upDesc.textContent  = 'Must include Proforma Invoice (PI) number';
        if (upIcon)  upIcon.src = 'assets/icon_upload_1.svg';
      } else if (val === 'PO') {
        if (badge) { badge.classList.remove('is-hidden'); }
        if (title) { title.textContent = 'Purchase order (PO)'; title.classList.remove('is-placeholder'); }
        card.classList.remove('is-placeholder');
        if (desc) desc.textContent = 'A buyer-issued document requesting goods or services';
        if (numField) numField.hidden = false;
        if (numLabel) numLabel.textContent = 'Purchase order number';
        if (uploadBlock) uploadBlock.hidden = false;
        if (upTitle) upTitle.textContent = 'Purchase order (PO)';
        if (upDesc)  upDesc.textContent  = 'Must include Purchase order (PO) number';
        if (upIcon)  upIcon.src = 'assets/icon_upload_1.svg';
      } else if (val === 'CC') {
        if (badge) { badge.classList.remove('is-hidden'); }
        if (title) { title.textContent = 'Commercial contract (CC)'; title.classList.remove('is-placeholder'); }
        card.classList.remove('is-placeholder');
        if (desc) desc.textContent = 'A written agreement outlining the terms of a business deal';
        if (numField) numField.hidden = false;
        if (numLabel) numLabel.textContent = 'Commercial contract number';
        if (uploadBlock) uploadBlock.hidden = false;
        if (upTitle) upTitle.textContent = 'Commercial contract (CC)';
        if (upDesc)  upDesc.textContent  = '';
        if (upIcon)  upIcon.src = 'assets/icon_upload_1.svg';
      }
    };
    if (docTypeSelect) {
      // set default to placeholder on show
      if (isPre && isNatureChanged) docTypeSelect.value = '';
      docTypeSelect.addEventListener('change', () => {
        // Reset any existing upload state for the pre-shipment document when type changes
        const preUploadItem = document.querySelector('#docs-pre .upload-item');
        if (preUploadItem) {
          preUploadItem.classList.remove('is-uploaded');
          // Reset badge icon
          const badgeImg = preUploadItem.querySelector('.upload-item__badge img');
          if (badgeImg) badgeImg.src = 'assets/icon_upload_1.svg';
          // Reset main button appearance/text
          const actions = preUploadItem.querySelector('.upload-item__actions');
          const mainBtn = actions ? actions.querySelector('.btn') : null;
          if (mainBtn) {
            mainBtn.classList.add('btn--primary');
            mainBtn.classList.remove('btn--secondary');
            mainBtn.textContent = 'Upload';
          }
          // Clear any uploaded filename subtitle; new instructions will be set by syncDocCard
          const subEl = preUploadItem.querySelector('.upload-item__meta small');
          if (subEl) subEl.textContent = '';
        }

        // Sync the card UI for the newly selected document type
        syncDocCard();

        // Clear the document number whenever the document type changes
        // (e.g. switching between PI, PO, and CC should reset `piNumber`).
        if (typeof piNumber !== 'undefined' && piNumber) {
          piNumber.value = '';
        }
        if (typeof updateDocNumberCounters === 'function') {
          updateDocNumberCounters();
        }

        if (typeof validateSendForm === 'function') validateSendForm();
      });
    }
    syncDocCard();
    if (typeof validateSendForm === 'function') validateSendForm();
    lastNatureVal = natureVal;

    // Attach validation to docs inputs so changing them re-validates immediately
    const piNumber = document.getElementById('piNumber');
    const piNumberCounter = document.getElementById('piNumberCounter');
    const ciNumber = document.getElementById('ciNumber');
    const ciNumberCounter = document.getElementById('ciNumberCounter');
    const docNotes = document.getElementById('docNotes');
    const notesCounter = document.getElementById('docNotesCounter');
    const docNotesPost = document.getElementById('docNotesPost');
    const notesCounterPost = document.getElementById('docNotesPostCounter');
    const updateNotesCounter = () => {
      if (docNotes && notesCounter) {
        const len = String(docNotes.value || '').length;
        const capped = Math.min(40, len);
        notesCounter.textContent = `${capped}/40`;
        docNotes.classList.toggle('is-filled', capped > 0);
      }
      if (docNotesPost && notesCounterPost) {
        const len2 = String(docNotesPost.value || '').length;
        const capped2 = Math.min(40, len2);
        notesCounterPost.textContent = `${capped2}/40`;
        docNotesPost.classList.toggle('is-filled', capped2 > 0);
      }
    };
    const updateDocNumberCounters = () => {
      if (piNumber && piNumberCounter) {
        const len = String(piNumber.value || '').length;
        const capped = Math.min(50, len);
        piNumberCounter.textContent = `${capped}/50`;
        piNumber.classList.toggle('is-filled', capped > 0);
      } else if (piNumberCounter) {
        piNumberCounter.textContent = '0/50';
      }
      if (ciNumber && ciNumberCounter) {
        const len2 = String(ciNumber.value || '').length;
        const capped2 = Math.min(50, len2);
        ciNumberCounter.textContent = `${capped2}/50`;
        ciNumber.classList.toggle('is-filled', capped2 > 0);
      } else if (ciNumberCounter) {
        ciNumberCounter.textContent = '0/50';
      }
    };
    if (piNumber) {
      piNumber.addEventListener('input', () => {
        updateDocNumberCounters();
        if (typeof validateSendForm === 'function') validateSendForm();
      }, { passive: true });
      piNumber.addEventListener('change', () => {
        updateDocNumberCounters();
        if (typeof validateSendForm === 'function') validateSendForm();
      });
      updateDocNumberCounters();
    } else if (piNumberCounter) {
      piNumberCounter.textContent = '0/50';
    }
    if (ciNumber) {
      ciNumber.addEventListener('input', () => {
        updateDocNumberCounters();
        if (typeof validateSendForm === 'function') validateSendForm();
      }, { passive: true });
      ciNumber.addEventListener('change', () => {
        updateDocNumberCounters();
        if (typeof validateSendForm === 'function') validateSendForm();
      });
      updateDocNumberCounters();
    } else if (ciNumberCounter) {
      ciNumberCounter.textContent = '0/50';
    }
    if (docNotes) {
      docNotes.addEventListener('input', () => { updateNotesCounter(); if (typeof validateSendForm === 'function') validateSendForm(); }, { passive: true });
      docNotes.addEventListener('change', () => { updateNotesCounter(); if (typeof validateSendForm === 'function') validateSendForm(); });
      updateNotesCounter();
    } else if (notesCounter) {
      notesCounter.textContent = '0/25';
    }
    if (docNotesPost) {
      docNotesPost.addEventListener('input', () => { updateNotesCounter(); if (typeof validateSendForm === 'function') validateSendForm(); }, { passive: true });
      docNotesPost.addEventListener('change', () => { updateNotesCounter(); if (typeof validateSendForm === 'function') validateSendForm(); });
      updateNotesCounter();
    } else if (notesCounterPost) {
      notesCounterPost.textContent = '0/25';
    }
  };

  // Ensure purpose select gets filled styling and summary even when selected first
  const updatePurposeOnly = () => {
    if (!purposeSelect || !summaryRows.purpose) return;
    const v = summaryRows.purpose.querySelector('strong');
    const label = purposeSelect.selectedOptions?.[0]?.textContent?.trim() || '';
    const filled = !!purposeSelect.value;
    if (v) v.textContent = filled ? label : '- -';
    purposeSelect.classList.toggle('is-filled', filled);
  };

  if (amountInput) {
    const formatCurrencyInput = (e) => {
      const input = e.target;
      const prev = input.value || '';
      // Allow only digits, comma, and dot
      let raw = prev.replace(/[^\d.,]/g, '');
      const hadTrailingDot = /\.\s*$/.test(prev);
      // Remove thousands separators
      raw = raw.replace(/,/g, '');
      // Keep only first dot as decimal separator
      const firstDot = raw.indexOf('.');
      if (firstDot !== -1) {
        const head = raw.slice(0, firstDot);
        const tail = raw.slice(firstDot + 1).replace(/\./g, '');
        raw = `${head}.${tail}`;
      }
      // Cap to maximum allowed numeric value (1,000,000)
      const MAX_CAP = 1000000;
      if (raw !== '' && !isNaN(parseFloat(raw)) && parseFloat(raw) > MAX_CAP) {
        raw = String(MAX_CAP);
      }
      if (raw === '') {
        input.value = '';
        updateSummary();
        if (typeof validateSendForm === 'function') validateSendForm();
        return;
      }
      // Track number of digits before caret to restore position after formatting
      const selStart = input.selectionStart || 0;
      const digitsBefore = prev.slice(0, selStart).replace(/[^\d]/g, '').length;
      // Split integer/fraction and insert thousands separators
      const [intRaw, fracRaw = ''] = raw.split('.');
      const intStr = intRaw.replace(/^0+(?=\d)/, '') || '0';
      const intFormatted = Number(intStr).toLocaleString('en-US');
      const fracStr = fracRaw.slice(0, 2);
      let next = fracStr ? `${intFormatted}.${fracStr}` : intFormatted;
      if (!fracStr && hadTrailingDot) next = `${intFormatted}.`;
      if (next !== prev) {
        input.value = next;
        // Restore caret position based on digit count
        try {
          let count = 0, pos = 0;
          while (pos < next.length) {
            if (/\d/.test(next[pos])) {
              count++;
              if (count > digitsBefore) break;
            }
            pos++;
          }
          input.setSelectionRange(pos, pos);
        } catch (err) { /* ignore */ }
      }
      updateSummary();
      if (typeof validateSendForm === 'function') validateSendForm();
    };
    amountInput.addEventListener('input', formatCurrencyInput, { passive: true });
    amountInput.addEventListener('change', formatCurrencyInput);
  }
  feeRadios.forEach(r => r.addEventListener('change', () => { updateSummary(); if (typeof validateSendForm === 'function') validateSendForm(); }));
  deductRadios.forEach(r => r.addEventListener('change', () => { updateSummary(); if (typeof validateSendForm === 'function') validateSendForm(); }));
  const conversionTermsCheckbox = document.getElementById('conversionTermsCheckbox');
  if (conversionTermsCheckbox) {
    conversionTermsCheckbox.addEventListener('change', () => { if (typeof validateSendForm === 'function') validateSendForm(); });
  }
  if (natureSelect) natureSelect.addEventListener('change', () => { updateNaturePurpose(); if (typeof validateSendForm === 'function') validateSendForm(); });
  const purposeOthersField = document.getElementById('purpose-others-field');
  const purposeOthersInput = document.getElementById('purposeOthers');
  if (purposeSelect) {
    purposeSelect.addEventListener('change', () => { 
      const isOthers = purposeSelect.value === 'others';
      if (purposeOthersField) {
        purposeOthersField.style.display = isOthers ? '' : 'none';
      }
      if (isOthers && purposeOthersInput) {
        // Auto-focus when "Others" is selected
        setTimeout(() => {
          purposeOthersInput.focus();
        }, 10);
      } else if (purposeOthersInput) {
        // Clear the field when switching away from "Others"
        purposeOthersInput.value = '';
        purposeOthersInput.classList.remove('is-filled');
      }
      if (typeof updatePurposeOnly === 'function') updatePurposeOnly(); 
      if (typeof validateSendForm === 'function') validateSendForm(); 
    });
  }
  // Handle input styling for purposeOthers field
  if (purposeOthersInput) {
    purposeOthersInput.addEventListener('input', () => {
      const hasValue = purposeOthersInput.value.trim().length > 0;
      purposeOthersInput.classList.toggle('is-filled', hasValue);
      if (typeof validateSendForm === 'function') validateSendForm();
    }, { passive: true });
    purposeOthersInput.addEventListener('change', () => {
      if (typeof validateSendForm === 'function') validateSendForm();
    });
  }
  // Initialize purposeOthers field visibility on page load
  if (purposeSelect && purposeOthersField) {
    const isOthers = purposeSelect.value === 'others';
    purposeOthersField.style.display = isOthers ? '' : 'none';
  }
  // Generic listeners so clearing any field re-validates immediately
  const attachValidationListeners = () => {
    const formRoot = document.querySelector('.form');
    if (!formRoot) return;
    formRoot.querySelectorAll('input[type="text"], input[type="email"], textarea').forEach((el) => {
      el.addEventListener('input', () => { if (typeof validateSendForm === 'function') validateSendForm(); }, { passive: true });
      el.addEventListener('change', () => { if (typeof validateSendForm === 'function') validateSendForm(); });
    });
    formRoot.querySelectorAll('select').forEach((el) => {
      el.addEventListener('change', () => { if (typeof validateSendForm === 'function') validateSendForm(); });
    });
  };
  attachValidationListeners();
  // Initial compute
  updateSummary();
  updateNaturePurpose();
  if (typeof updatePurposeOnly === 'function') updatePurposeOnly();
  syncAccountDisplay();
  if (typeof validateSendForm === 'function') validateSendForm();

  // ---- Upload item interactions ----
  const initUploadItems = () => {
    const ensureActions = (item) => {
      let actions = item.querySelector('.upload-item__actions');
      if (!actions) {
        actions = document.createElement('div');
        actions.className = 'upload-item__actions';
        const btn = item.querySelector('.btn');
        if (btn) {
          item.replaceChild(actions, btn);
          actions.appendChild(btn);
        } else {
          item.appendChild(actions);
        }
      }
      return actions;
    };
    // Update doc-miss-row disabled state based on upload-item state
    const updateDocMissRowState = (item) => {
      const nextSibling = item.nextElementSibling;
      const missRow = nextSibling && nextSibling.classList.contains('doc-miss-row') ? nextSibling : null;
      if (missRow) {
        const checkbox = missRow.querySelector('input[type="checkbox"]');
        const isUploaded = item.classList.contains('is-uploaded');
        if (checkbox) {
          checkbox.disabled = isUploaded;
          if (isUploaded) {
            checkbox.checked = false; // Uncheck if uploaded
            missRow.classList.add('is-disabled');
          } else {
            missRow.classList.remove('is-disabled');
          }
        }
      }
    };
    const setNotUploaded = (item) => {
      item.classList.remove('is-uploaded');
      const badgeImg = item.querySelector('.upload-item__badge img');
      if (badgeImg) badgeImg.src = 'assets/icon_upload_1.svg';
      const subEl = item.querySelector('.upload-item__meta small');
      const inPre = !!item.closest('#docs-pre');
      const inPost = !!item.closest('#docs-post');
      if (subEl) {
        if (inPre) {
          // Keep instructional subtitle based on selected doc type for pre-shipment
          const docTypeSel = document.getElementById('docType');
          const val = docTypeSel ? docTypeSel.value : '';
          if (val === 'PI') {
            subEl.textContent = 'Must include Proforma Invoice (PI) number';
          } else if (val === 'PO') {
            subEl.textContent = 'Must include Purchase order (PO) number';
          } else if (val === 'CC') {
            subEl.textContent = '';
          } else {
            subEl.textContent = '';
          }
        } else if (inPost) {
          const titleTxt = (item.querySelector('.upload-item__title')?.textContent || '').toLowerCase();
          let desc = '';
          if (titleTxt.includes('commercial invoice')) {
            desc = 'The official invoice issued by the seller after shipment';
          } else if (titleTxt.includes('transport')) {
            desc = 'Proof of shipment e.g., bill of lading, airway bill, or courier waybill';
          } else if (titleTxt.includes('packing')) {
            desc = 'Detailed list of goods included in the shipment';
          }
          subEl.textContent = desc;
        } else {
          subEl.textContent = '';
        }
      }
      const actions = ensureActions(item);
      const mainBtn = actions.querySelector('.btn');
      if (mainBtn) {
        mainBtn.classList.add('btn--primary');
        mainBtn.classList.remove('btn--secondary');
        mainBtn.textContent = 'Upload';
      }
      const resetBtn = actions.querySelector('.upload-reset');
      if (resetBtn) resetBtn.remove();
      // Re-enable doc-miss-row when not uploaded
      updateDocMissRowState(item);
      if (typeof validateSendForm === 'function') validateSendForm();
    };
    // Open a native file picker and then mark as uploaded (prototype)
    const ensureNativePicker = () => {
      // One shared hidden input for the whole page
      let input = document.getElementById('sp-native-upload-input');
      if (input) return input;
      input = document.createElement('input');
      input.id = 'sp-native-upload-input';
      input.type = 'file';
      input.accept = '.pdf,.png,.jpg,.jpeg';
      input.style.display = 'none';
      input.setAttribute('aria-hidden', 'true');
      document.body.appendChild(input);
      return input;
    };

    const setUploaded = (item) => {
      item.classList.add('is-uploaded');
      const actions = ensureActions(item);
      // Subtitle per context
      const subEl = item.querySelector('.upload-item__meta small');
      const inPre = !!item.closest('#docs-pre');
      const inPost = !!item.closest('#docs-post');
      if (subEl) {
        let filename = '';
        if (inPre) {
          // For pre-shipment "Proforma invoice (PI)" upload, always use a fixed filename
          const docTypeSel = document.getElementById('docType');
          const docType = docTypeSel ? (docTypeSel.value || '') : '';
          filename = docType === 'PI' ? 'ProformaInvoice21022026.pdf' : 'Invoice123.pdf';
        } else if (inPost) {
          const list = Array.from(item.parentElement?.querySelectorAll('.upload-item') || []);
          const idx = Math.max(0, list.indexOf(item));
          const labels = ['AInvoice123.pdf', 'BInvoice123.pdf', 'CInvoice123.pdf'];
          filename = labels[idx] || 'Document123.pdf';
        } else {
          filename = 'Document123.pdf';
        }
        // Wrap filename in a link for prototype realism
        subEl.innerHTML = `<a href="#" target="_blank">${filename}</a>`;
      }
      // Badge icon success
      const badgeImg = item.querySelector('.upload-item__badge img');
      if (badgeImg) badgeImg.src = 'assets/icon_snackbar_success.svg';
      // Main button shows "Remove file" while uploaded
      let mainBtn = actions.querySelector('.btn');
      if (mainBtn) {
        mainBtn.classList.remove('btn--primary');
        mainBtn.classList.add('btn--secondary');
        mainBtn.textContent = 'Remove file';
      }
      // Disable doc-miss-row when uploaded
      updateDocMissRowState(item);
      if (typeof validateSendForm === 'function') validateSendForm();
    };
    // Ensure initial structure and default subtitles per context
    document.querySelectorAll('.upload-item').forEach((item) => {
      ensureActions(item);
      setNotUploaded(item);
    });
    // Wire main buttons: toggle state on click
    document.querySelectorAll('.upload-item .upload-item__actions .btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const item = btn.closest('.upload-item');
        if (!item) return;
        if (item.classList.contains('is-uploaded')) {
          setNotUploaded(item);
          // Snackbar: File removed
          if (typeof window.showSnackbar === 'function') {
            window.showSnackbar('File removed');
          } else {
            // fallback
            const el = document.createElement('div');
            el.className = 'snackbar snackbar--success';
            el.innerHTML = '<img class="snackbar__icon" src="assets/icon_snackbar_success.svg" alt=""/><span>File removed</span>';
            document.body.appendChild(el);
            requestAnimationFrame(() => el.classList.add('is-visible'));
            setTimeout(() => {
              el.classList.remove('is-visible');
              setTimeout(() => el.remove(), 250);
            }, 2000);
          }
        } else {
          const inPre = !!item.closest('#docs-pre');
          const docTypeSel = document.getElementById('docType');
          const docType = docTypeSel ? (docTypeSel.value || '') : '';

          // Pre-shipment Proforma invoice: open native picker, then mark uploaded with fixed filename
          // But: if triggered programmatically (e.g. by "Fill"), bypass the picker and upload directly.
          const isUserAction = !!(e && e.isTrusted === true);
          if (inPre && docType === 'PI' && isUserAction) {
            const input = ensureNativePicker();
            const onChange = () => {
              input.removeEventListener('change', onChange);
              setUploaded(item);
              // allow re-selecting same file
              try { input.value = ''; } catch (_) {}
            };
            input.addEventListener('change', onChange);
            try {
              input.click();
            } catch (_) {
              // Fallback: still mark uploaded even if picker is blocked
              setUploaded(item);
            }
            return;
          }

          setUploaded(item);
        }
      }, { passive: true });
    });
  };
  initUploadItems();
  
  // Prevent default link behavior for uploaded file name links (prototype only)
  document.addEventListener('click', (e) => {
    const link = e.target.closest('.upload-item.is-uploaded .upload-item__meta .muted a');
    if (link) {
      e.preventDefault();
    }
  }, { passive: false });

  // Revalidate + UI when post-shipment missing-document checkboxes change
  const updateMissingDocsUI = () => {
    const post = document.getElementById('docs-post');
    if (!post) return;
    const declare = post.querySelector('#docsDeclare');
    const missRows = Array.from(post.querySelectorAll('.doc-miss-row'));
    const missingTypes = [];
    missRows.forEach((row) => {
      const cb = row.querySelector('input[type="checkbox"]');
      const prev = row.previousElementSibling;
      const item = (prev && prev.classList && prev.classList.contains('upload-item')) ? prev : null;
      if (!cb || !item) return;
      const titleEl = item.querySelector('.upload-item__title');
      const title = (titleEl && titleEl.textContent || '').trim();
      const isTransport = /transport/i.test(title);
      const isPacking = /pack/i.test(title);
      if (cb.checked) {
        // Mark as missing and reset to default
        item.classList.add('is-missing');
        // reset upload state
        item.classList.remove('is-uploaded');
        const badgeImg = item.querySelector('.upload-item__badge img');
        if (badgeImg) badgeImg.src = 'assets/icon_upload_1.svg';
        const subEl = item.querySelector('.upload-item__meta small');
        if (subEl) {
          const lower = title.toLowerCase();
          if (lower.includes('commercial invoice')) {
            subEl.textContent = 'The official invoice issued by the seller after shipment';
          } else if (isTransport) {
            subEl.textContent = 'Proof of shipment e.g., bill of lading, airway bill, or courier waybill';
          } else if (isPacking) {
            subEl.textContent = 'Detailed list of goods included in the shipment';
          } else {
            subEl.textContent = '';
          }
        }
        // disable actions and normalize main button
        const actions = item.querySelector('.upload-item__actions');
        if (actions) {
          const mainBtn = actions.querySelector('.btn:not(.upload-reset)');
          if (mainBtn) {
            mainBtn.classList.add('btn--primary');
            mainBtn.classList.remove('btn--secondary');
            mainBtn.textContent = 'Upload';
            mainBtn.disabled = true;
          }
          const resetBtn = actions.querySelector('.upload-reset');
          if (resetBtn) resetBtn.remove();
        }
        // Remove disabled state from doc-miss-row since item is now not uploaded
        row.classList.remove('is-disabled');
        cb.disabled = false;
        if (isTransport) missingTypes.push('transport document');
        if (isPacking) missingTypes.push('packing list');
      } else {
        // unmark missing and re-enable actions
        item.classList.remove('is-missing');
        const actions = item.querySelector('.upload-item__actions');
        if (actions) {
          actions.querySelectorAll('button').forEach(b => { b.disabled = false; });
        }
        // Update disabled state of doc-miss-row based on upload state
        const nextSibling = item.nextElementSibling;
        const missRow = nextSibling && nextSibling.classList.contains('doc-miss-row') ? nextSibling : null;
        if (missRow) {
          const missCb = missRow.querySelector('input[type="checkbox"]');
          const isUploaded = item.classList.contains('is-uploaded');
          if (missCb) {
            missCb.disabled = isUploaded;
            if (isUploaded) {
              missCb.checked = false;
              missRow.classList.add('is-disabled');
            } else {
              missRow.classList.remove('is-disabled');
            }
          }
        }
      }
    });
    const unique = Array.from(new Set(missingTypes));
    if (declare) {
      if (unique.length > 0) {
        // Singular label for legacy span (as originally designed)
        const singularText = unique.length === 1 ? unique[0] : unique.slice(0, 2).join(' or ');
        // Pluralize each type for title sentence variant
        const pluralized = unique.map(t => t.endsWith('s') ? t : `${t}s`);
        const pluralText = pluralized.length === 1 ? pluralized[0] : pluralized.slice(0, 2).join(' or ');
        const span = declare.querySelector('#docsDeclareTypes');
        if (span) span.textContent = singularText;
        const titleEl = declare.querySelector('.docs-declare__title');
        if (titleEl) {
          titleEl.textContent = `By proceeding, I confirm that this payment does not involve any ${pluralText}`;
        }
        declare.hidden = false;
      } else {
        declare.hidden = true;
      }
    }
    if (typeof validateSendForm === 'function') validateSendForm();
  };
  document.querySelectorAll('#docs-post .doc-miss-row input[type=\"checkbox\"]').forEach((chk) => {
    chk.addEventListener('change', updateMissingDocsUI, { passive: true });
    // Prevent clicks on disabled checkboxes
    chk.addEventListener('click', (e) => {
      if (chk.disabled) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, { passive: false });
    // Also prevent clicks on the label when checkbox is disabled
    const label = chk.closest('.doc-miss');
    if (label) {
      label.addEventListener('click', (e) => {
        if (chk.disabled) {
          e.preventDefault();
          e.stopPropagation();
        }
      }, { passive: false });
    }
  });
  // run once on init
  updateMissingDocsUI();

  // Open convert/fees details modal
  // const feesOpen = document.getElementById('fees-details-open');
  // if (feesOpen) {
  //   feesOpen.addEventListener('click', (e) => {
  //     e.preventDefault();
  //     const modal = document.getElementById('convertDetailsModal') || document.getElementById('feesDetailsModal');
  //     if (!modal) return;
  //     modal.setAttribute('aria-hidden', 'false');
  //     document.documentElement.classList.add('modal-open');
  //     document.body.classList.add('modal-open');
  //     try {
  //       const y = window.scrollY || window.pageYOffset || 0;
  //       document.body.dataset.scrollY = String(y);
  //       document.body.style.top = `-${y}px`;
  //       document.body.classList.add('modal-locked');
  //     } catch (_) {}
  //   });
  // }
  // Mobile summary modal open
  const mobileSummaryOpen = document.getElementById('mobileSummaryOpen');
  if (mobileSummaryOpen) {
    mobileSummaryOpen.addEventListener('click', (e) => {
      e.preventDefault();
      // Ensure summary is up to date before cloning
      updateSummary();
      // Small delay to ensure DOM updates
      setTimeout(() => {
        const host = document.getElementById('mobileSummaryContent');
        const card = document.querySelector('.card--summary');
        const recip = document.querySelector('.summary-recipient');
        const modal = document.getElementById('mobileSummaryModal');
        if (host && card) {
          const sectionHead = card.querySelector('.summary-section-head');
          // Prefer the amount & fees box; fall back to second summary-box, then any
          let box = card.querySelector('#summaryBoxAmount');
          if (!box) {
            const allBoxes = card.querySelectorAll('.summary-box');
            if (allBoxes.length > 1) {
              box = allBoxes[1];
            } else {
              box = allBoxes[0] || null;
            }
          }
          host.innerHTML = '';
          // Outer wrapper for modal layout
          const wrap = document.createElement('div');
          wrap.className = 'summary-modal-copy';
          // Card wrapper that mimics desktop summary card but without .card--summary
          const modalCard = document.createElement('div');
          modalCard.className = 'card card--section summary-modal-card';
          // Clone recipient chip
          if (recip) {
            const r = recip.cloneNode(true);
            modalCard.appendChild(r);
          }
          // Clone section head if it exists - force it visible
          if (sectionHead) {
            const sh = sectionHead.cloneNode(true);
            sh.style.cssText = 'display: flex !important; visibility: visible !important; opacity: 1 !important;';
            modalCard.appendChild(sh);
          }
          if (box) {
            const b = box.cloneNode(true);
            // Ensure the box itself is visible
            b.style.display = 'block';
            b.style.visibility = 'visible';
            b.style.opacity = '1';
            // Remove any inline styles that hide items
            b.querySelectorAll('[style]').forEach(el => {
              const style = el.getAttribute('style');
              if (style && (style.includes('display:none') || style.includes('display: none'))) {
                el.removeAttribute('style');
              }
            });
            // Force ALL summary pairs and content to be visible with inline styles
            const pairs = b.querySelectorAll('.summary-pair');
            pairs.forEach(el => {
              el.style.cssText = 'display: flex !important; visibility: visible !important; opacity: 1 !important;';
              el.classList.remove('is-hidden');
              // Make all children visible too
              el.querySelectorAll('*').forEach(child => {
                child.style.cssText += 'visibility: visible !important; opacity: 1 !important;';
              });
            });
            b.querySelectorAll('.summary-separator').forEach(el => {
              el.style.cssText = 'display: block !important; visibility: visible !important; opacity: 1 !important;';
            });
            b.querySelectorAll('.summary-note').forEach(el => {
              el.style.cssText = 'display: block !important; visibility: visible !important; opacity: 1 !important;';
            });
            // Hide conversion rate element if USD is selected (after cloning, check current state)
            const payerCurrency = getPayerCurrency();
            const showConversion = payerCurrency !== payeeCurrency;
            const clonedConvertDetails = b.querySelector('#fees-details-open');
            if (clonedConvertDetails) {
              clonedConvertDetails.style.display = showConversion ? '' : 'none';
            }
            modalCard.appendChild(b);
          } else {
            console.warn('Summary box not found for cloning');
          }
          // Clone summary-note if it exists (it's outside the summary-box)
          const summaryNote = card.querySelector('.summary-note');
          if (summaryNote) {
            const noteClone = summaryNote.cloneNode(true);
            noteClone.style.cssText = 'display: block !important; visibility: visible !important; opacity: 1 !important;';
            modalCard.appendChild(noteClone);
          }
          wrap.appendChild(modalCard);
          host.appendChild(wrap);
        
        if (modal) {
          modal.setAttribute('aria-hidden', 'false');
          document.documentElement.classList.add('modal-open');
          document.body.classList.add('modal-open');
          try {
            const y = window.scrollY || window.pageYOffset || 0;
            document.body.dataset.scrollY = String(y);
            document.body.style.top = `-${y}px`;
            document.body.classList.add('modal-locked');
          } catch (_) {}
        }
      }
      }, 10); // Small delay to ensure DOM updates
    });
  }
  const proceedToReview = () => {
    try {
      const getText = (sel) => (document.querySelector(sel)?.textContent || '').trim();
      const amountInput = document.getElementById('amount');
      const rawAmt = (amountInput?.value || '').replace(/,/g, '');
      const amount = parseFloat(rawAmt) || 0;
      const feeRate = 0.005;
      // Fee mode
      const feeSel = Array.from(document.querySelectorAll('input[type="radio"][name="fee"]')).find(r => r.checked)?.value || 'you';
      let payerRate = 0, receiverRate = 0;
      if (feeSel === 'you') { payerRate = feeRate; receiverRate = 0; }
      else if (feeSel === 'receiver') { payerRate = 0; receiverRate = feeRate; }
      else { payerRate = feeRate/2; receiverRate = feeRate/2; }
      // Payer currency
      const payerCurrency = Array.from(document.querySelectorAll('input[type="radio"][name="deduct"]')).find(r => r.checked)?.value || 'USD';
      const payeeCurrency = 'USD';
      // Calculate fees with minimum fee logic
      const { payerFee, receiverFee, isBelowMinimum, actualServiceFee } = calculateFees(amount, payerRate, receiverRate);
      const youPay = amount + payerFee;
      const payeeGets = amount - receiverFee;
      const fmt = (v, cur) => `${Number(v||0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;
      // Nature/Purpose labels
      const natureSel = document.getElementById('nature');
      const purposeSel = document.getElementById('purpose');
      const natureLabel = natureSel?.selectedOptions?.[0]?.textContent?.trim() || '';
      const purposeLabel = purposeSel?.selectedOptions?.[0]?.textContent?.trim() || '';
      // Doc numbers and attached docs (vary by nature)
      const piNumber = document.getElementById('piNumber')?.value || '';
      const ciNumber = document.getElementById('ciNumber')?.value || '';
      const docNotes = document.getElementById('docNotes')?.value || document.getElementById('docNotesPost')?.value || '';
      let docNumber = '';
      let docNumLabel = '';
      let attached = [];
      let docsDetail = [];
      const natureVal = natureSel?.value || '';
      if (natureVal === 'pre_shipment') {
        const docTypeSel = document.getElementById('docType');
        const docTypeVal = docTypeSel ? docTypeSel.value : '';
        if (docTypeVal === 'PI') {
          attached = ['Proforma invoice (PI)'];
          docsDetail = [{ title: 'Proforma invoice (PI)', declared: false }];
          docNumLabel = 'Proforma invoice number';
          docNumber = piNumber || '';
        } else if (docTypeVal === 'PO') {
          attached = ['Purchase order (PO)'];
          docsDetail = [{ title: 'Purchase order (PO)', declared: false }];
          docNumLabel = 'Purchase order number';
          docNumber = piNumber || '';
        } else if (docTypeVal === 'CC') {
          attached = ['Commercial contract (CC)'];
          docsDetail = [{ title: 'Commercial contract (CC)', declared: false }];
          docNumLabel = 'Commercial contract number';
          docNumber = piNumber || '';
        } else {
          attached = [];
          docsDetail = [];
          docNumLabel = '';
          docNumber = '';
        }
      } else {
        // Post-shipment: list uploaded or declared-missing docs
        document.querySelectorAll('#docs-post .upload-item').forEach((it) => {
          const title = it.querySelector('.upload-item__title')?.textContent?.trim();
          if (!title) return;
          const uploaded = it.classList.contains('is-uploaded');
          let missedOk = false;
          const maybeMissRow = it.nextElementSibling;
          if (maybeMissRow && maybeMissRow.classList && maybeMissRow.classList.contains('doc-miss-row')) {
            const missChk = maybeMissRow.querySelector('input[type="checkbox"]');
            if (missChk) missedOk = !!missChk.checked;
          }
          if (uploaded || missedOk) {
            attached.push(title);
            docsDetail.push({ title, declared: !uploaded && !!missedOk });
          }
        });
        docNumLabel = 'Commercial invoice number';
        docNumber = ciNumber || '';
      }
      const paymentId = "PYT-20251118-f2d3fa4e";
      const data = {
        receiverName: (getText('.summary-recipient .recipient-select__title') || '').replace(/^To\s+/i,''),
        receiverBank: getText('.summary-recipient .recipient-select__subtitle'),
        amountPayableFmt: fmt(amount, payeeCurrency),
        deductedFrom: `${payerCurrency} account`,
        feePct: `${(feeRate*100).toFixed(2)}%`,
        payerShareLabel: '• Paid by you',
        payerShareAmt: fmt(payerFee, payerCurrency),
        receiverShareLabel: '• Paid by receiver',
        receiverShareAmt: fmt(receiverFee, payeeCurrency),
        toBeDeducted: fmt(youPay, payerCurrency),
        receiverGets: fmt(payeeGets, payeeCurrency),
        serviceMinApplied: !!isBelowMinimum,
        serviceMinAmount: actualServiceFee,
        conversion: payerCurrency !== payeeCurrency ? `1 ${payerCurrency} = 1 ${payeeCurrency}` : '',
        nature: natureLabel,
        purpose: purposeLabel,
        docNumLabel,
        docNumber,
        docNotes,
        attachedDocs: attached.join(', '),
        docsDetail,
        paymentId,
        dateTime: new Date().toLocaleString('en-GB', { hour12: false }),
        status: 'Processing',
      };
      sessionStorage.setItem('receiptData', JSON.stringify(data));
    } catch (_) {}
    // Show loading then navigate to review page
    const loading = document.getElementById('loadingModal');
    if (loading) {
      loading.setAttribute('aria-hidden', 'false');
      document.documentElement.classList.add('modal-open');
      document.body.classList.add('modal-open');
      try {
        const y = window.scrollY || window.pageYOffset || 0;
        document.body.dataset.scrollY = String(y);
        document.body.style.top = `-${y}px`;
        document.body.classList.add('modal-locked');
      } catch (_) {}
    }
    setTimeout(() => { window.location.href = 'review-payment.html'; }, 600);
  };
  // Review payment navigation (button is outside <form>)
  const confirmTrigger = document.getElementById('confirm-send');
  if (confirmTrigger) {
    confirmTrigger.addEventListener('click', (e) => {
      e.preventDefault();
      hasTriedSubmit = true;
      // Re-validate on click so inline errors and aria-disabled are up to date
      if (typeof validateSendForm === 'function') validateSendForm();

      const isValid = confirmTrigger.getAttribute('aria-disabled') === 'false';
      if (!isValid) {
        setConfirmErrorVisible(true);
        return;
      }
      setConfirmErrorVisible(false);
      proceedToReview();
    });
  }

// Mobile sticky confirm ("Review") button
const confirmTriggerInline = document.getElementById('confirm-send-sticky');
if (confirmTriggerInline) {
  confirmTriggerInline.addEventListener('click', (e) => {
    e.preventDefault();
    hasTriedSubmit = true;
    if (typeof validateSendForm === 'function') validateSendForm();
    const isValidInline = confirmTriggerInline.getAttribute('aria-disabled') === 'false';
    if (!isValidInline) {
      setConfirmErrorVisible(true);
      return;
    }
    setConfirmErrorVisible(false);
    proceedToReview();
  });
}
  // Send Payment: dev tools (Fill / Clear) in build-badge
  (function initSendDevTools() {
    const root = document.querySelector('main.page--send');
    if (!root) return;
    const fillBtn = document.getElementById('sp-fill');
    const clearBtn = document.getElementById('sp-clear');
    if (!fillBtn || !clearBtn) return;

    const amountEl = document.getElementById('amount');
    const natureEl = document.getElementById('nature');
    const purposeEl = document.getElementById('purpose');
    const docTypeEl = document.getElementById('docType');
    const piNumberEl = document.getElementById('piNumber');
    const ciNumberEl = document.getElementById('ciNumber');
    const deductUSD = root.querySelector('input[type="radio"][name="deduct"][value="USD"]');
    const deductUSDT = root.querySelector('input[type="radio"][name="deduct"][value="USDT"]');
    const preUpload = root.querySelector('#docs-pre .upload-item');
    const postUploads = Array.from(root.querySelectorAll('#docs-post .upload-item'));

    const trigger = (el) => { if (!el) return; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    const clickMainUploadBtn = (item) => {
      const btn = item?.querySelector('.upload-item__actions .btn') || item?.querySelector('.btn');
      if (btn) btn.click();
    };
    const clickResetBtn = (item) => {
      const btn = item?.querySelector('.upload-item__actions .upload-reset');
      if (btn) btn.click();
    };

    fillBtn.addEventListener('click', (e) => {
      e.preventDefault();
      // Basic fields
      if (natureEl) { natureEl.value = 'pre_shipment'; trigger(natureEl); }
      if (purposeEl) { purposeEl.value = 'goods_purchase'; trigger(purposeEl); }
      if (amountEl) { amountEl.value = '50000'; trigger(amountEl); }
      if (deductUSD) { deductUSD.checked = true; trigger(deductUSD); }
      // Docs (pre-shipment)
      if (docTypeEl) { docTypeEl.value = 'PI'; trigger(docTypeEl); }
      if (piNumberEl) { piNumberEl.value = 'PI-001234'; trigger(piNumberEl); }
      // Upload PI in pre-shipment group
      if (preUpload) {
        // toggle to uploaded via main button
        if (!preUpload.classList.contains('is-uploaded')) clickMainUploadBtn(preUpload);
        // ensure display name with link (after setUploaded creates the link structure)
        setTimeout(() => {
          const sub = preUpload.querySelector('.upload-item__meta small');
          if (sub && preUpload.classList.contains('is-uploaded')) {
            sub.innerHTML = `<a href="#" target="_blank">PI-001234.pdf</a>`;
          }
        }, 10);
      }
      // For demo, also upload all post-shipment documents with A/B/C names
      postUploads.forEach((it) => {
        if (!it.classList.contains('is-uploaded')) clickMainUploadBtn(it);
      });
      // Ensure validation runs
      if (typeof validateSendForm === 'function') validateSendForm();
    });

    clearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (amountEl) { amountEl.value = ''; trigger(amountEl); }
      if (natureEl) { natureEl.value = ''; trigger(natureEl); }
      if (purposeEl) { purposeEl.value = ''; trigger(purposeEl); }
      const purposeOthersEl = document.getElementById('purposeOthers');
      if (purposeOthersEl) { purposeOthersEl.value = ''; trigger(purposeOthersEl); }
      if (deductUSD) { deductUSD.checked = true; trigger(deductUSD); }
      if (docTypeEl) { docTypeEl.value = ''; trigger(docTypeEl); }
      if (piNumberEl) { piNumberEl.value = ''; trigger(piNumberEl); }
      if (ciNumberEl) { ciNumberEl.value = ''; trigger(ciNumberEl); }
      // Reset uploads to 'not uploaded' state via reset button if present
      if (preUpload && preUpload.classList.contains('is-uploaded')) clickResetBtn(preUpload);
      postUploads.forEach((it) => { if (it.classList.contains('is-uploaded')) clickResetBtn(it); });
      // Clear inline errors if any
      const amountError = document.getElementById('amount-error');
      if (amountError) amountError.hidden = true;
      const amountWrap = document.querySelector('.amount-input');
      if (amountWrap) amountWrap.classList.remove('is-error');
      document.querySelectorAll('.fee-options--deduct .fee-option .fee-option__content .muted').forEach(el => el.classList.remove('is-error'));
      if (typeof validateSendForm === 'function') validateSendForm();
    });
  })();

  // Close mobile summary modal when resizing from mobile to desktop
  let previousWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    const currentWidth = window.innerWidth;
    const wasMobile = previousWidth < DESKTOP_BP;
    const isDesktop = currentWidth >= DESKTOP_BP;
    
    // If transitioning from mobile to desktop, close the modal
    if (wasMobile && isDesktop) {
      const modal = document.getElementById('mobileSummaryModal');
      if (modal && modal.getAttribute('aria-hidden') === 'false') {
        const close = (el) => {
          if (!el) return;
          el.setAttribute('aria-hidden', 'true');
          document.documentElement.classList.remove('modal-open');
          document.body.classList.remove('modal-open');
          try {
            const y = parseInt(document.body.dataset.scrollY || '0', 10) || 0;
            document.body.classList.remove('modal-locked');
            document.body.style.top = '';
            delete document.body.dataset.scrollY;
            window.scrollTo(0, y);
          } catch (_) {}
        };
        close(modal);
      }
    }
    previousWidth = currentWidth;
  });
}

// Run immediately if DOM is already parsed (defer), otherwise wait
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSendPayment);
} else {
  initSendPayment();
}

// Send payment: demo autofill on focus (PI number + message to beneficiary)
(function initSendPaymentDocAutofillOnPress() {
  const root = document.querySelector('main.page--send');
  if (!root) return;

  const piNumber = document.getElementById('piNumber');
  const docNotes = document.getElementById('docNotes');

  const typeIfEmpty = (el, value) => {
    if (!el) return;
    const current = (el.value || '').toString().trim();
    if (current) return;
    const v = (value == null) ? '' : String(value);
    if (typeof window.__xrexTypeIntoInput === 'function') {
      window.__xrexTypeIntoInput(el, v, { onlyIfEmpty: true, resumeFromExisting: true });
    } else {
      el.value = v;
      try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
      try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
    }
  };

  const bind = (el, fn) => {
    if (!el) return;
    if (el.dataset.autofillBound === '1') return;
    el.dataset.autofillBound = '1';
    el.addEventListener('focus', fn, { passive: true });
    el.addEventListener('click', fn, { passive: true });
  };

  bind(piNumber, () => typeIfEmpty(piNumber, 'PI-21022026-001'));
  bind(docNotes, () => typeIfEmpty(docNotes, 'Payment for goods'));
})();

// Confirm modal actions
(function initConfirmModalActions() {
  const modal = document.getElementById('confirmPaymentModal');
  if (!modal) return;
  const confirm = document.getElementById('unlinkConfirm');
  const input = document.getElementById('unlinkCodeInput');
  const clearBtn = document.getElementById('unlinkClearBtn');
  const err = document.getElementById('unlinkCodeError');
  const DEMO_2FA = '123456';
  function syncAuthState() {
    const v = (input && input.value || '').trim();
    const ok = /^\d{6}$/.test(v);
    if (confirm) confirm.disabled = !ok;
    if (err) err.hidden = ok;
    if (clearBtn) clearBtn.classList.toggle('is-hidden', v.length === 0);
  }
  if (input) {
    input.addEventListener('input', syncAuthState, { passive: true });
    input.addEventListener('change', syncAuthState);
    // Demo: auto-type a static 2FA code on focus/click (only if empty)
    const maybeAutofill = (e) => {
      try {
        // Exception: only trigger when the user actually clicks/taps (not on autofocus)
        if (!e || e.isTrusted !== true) return;
        const v = (input.value || '').trim();
        if (v) return;
        if (typeof window.__xrexTypeIntoInput === 'function') {
          window.__xrexTypeIntoInput(input, DEMO_2FA, { onlyIfEmpty: true, resumeFromExisting: true });
        } else {
          input.value = DEMO_2FA;
          syncAuthState();
        }
      } catch (_) {}
    };
    input.addEventListener('pointerdown', maybeAutofill, { passive: true });
    input.addEventListener('click', maybeAutofill, { passive: true });
  }
  if (clearBtn && input) {
    clearBtn.addEventListener('click', () => { input.value = ''; syncAuthState(); input.focus(); });
  }
  if (confirm) {
    confirm.addEventListener('click', () => {
      // Capture or preserve receipt data before leaving
      try {
        const isSendPage = !!document.querySelector('main.page--send');
        const isReviewPage = !!document.querySelector('main.page--review');
        if (isSendPage) {
          const getText = (sel) => (document.querySelector(sel)?.textContent || '').trim();
          const amountInput = document.getElementById('amount');
          const rawAmt = (amountInput?.value || '').replace(/,/g, '');
          const amount = parseFloat(rawAmt) || 0;
          const feeRate = 0.005;
          // Fee mode
          const feeSel = Array.from(document.querySelectorAll('input[type="radio"][name="fee"]')).find(r => r.checked)?.value || 'you';
          let payerRate = 0, receiverRate = 0;
          if (feeSel === 'you') { payerRate = feeRate; receiverRate = 0; }
          else if (feeSel === 'receiver') { payerRate = 0; receiverRate = feeRate; }
          else { payerRate = feeRate/2; receiverRate = feeRate/2; }
          // Payer currency
          const payerCurrency = Array.from(document.querySelectorAll('input[type="radio"][name="deduct"]')).find(r => r.checked)?.value || 'USD';
          const payeeCurrency = 'USD';
          // Calculate fees with minimum fee logic
          const { payerFee, receiverFee, isBelowMinimum, actualServiceFee } = calculateFees(amount, payerRate, receiverRate);
          const youPay = amount + payerFee;
          const payeeGets = amount - receiverFee;
          const fmt = (v, cur) => `${Number(v||0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;
      const data = {
            receiverName: (getText('.summary-recipient .recipient-select__title') || '').replace(/^To\s+/i,''),
            receiverBank: getText('.summary-recipient .recipient-select__subtitle'),
            amountPayableFmt: fmt(amount, payeeCurrency),
            deductedFrom: `${payerCurrency} account`,
            feePct: `${(feeRate*100).toFixed(2)}%`,
            payerShareLabel: '• Paid by you',
            payerShareAmt: fmt(payerFee, payerCurrency),
            receiverShareLabel: '• Paid by receiver',
            receiverShareAmt: fmt(receiverFee, payeeCurrency),
            toBeDeducted: fmt(youPay, payerCurrency),
            receiverGets: fmt(payeeGets, payeeCurrency),
        serviceMinApplied: !!isBelowMinimum,
        serviceMinAmount: actualServiceFee,
            conversion: payerCurrency !== payeeCurrency ? `1 ${payerCurrency} = 1 ${payeeCurrency}` : '',
            dateTime: new Date().toLocaleString('en-GB', { hour12: false }),
            status: 'Processing',
          };
          sessionStorage.setItem('receiptData', JSON.stringify(data));
        } else if (isReviewPage) {
          // Preserve existing review data; only refresh timestamp
          const raw = sessionStorage.getItem('receiptData');
          const d = raw ? JSON.parse(raw) : {};
          d.dateTime = new Date().toLocaleString('en-GB', { hour12: false });
          sessionStorage.setItem('receiptData', JSON.stringify(d));
        }
      } catch (_) {}
    try {
      if (typeof window.getPrototypeState === 'function' && typeof window.setPrototypeState === 'function') {
        if (window.getPrototypeState() < 4) window.setPrototypeState(4);
      }
    } catch (_) {}
      // Close confirm modal
      modal.setAttribute('aria-hidden', 'true');
      document.documentElement.classList.remove('modal-open');
      document.body.classList.remove('modal-open');
      // Show loading modal for 2s then redirect
      const loading = document.getElementById('loadingModal');
      if (loading) {
        loading.setAttribute('aria-hidden', 'false');
        document.documentElement.classList.add('modal-open');
        document.body.classList.add('modal-open');
        try {
          const y = window.scrollY || window.pageYOffset || 0;
          document.body.dataset.scrollY = String(y);
          document.body.style.top = `-${y}px`;
          document.body.classList.add('modal-locked');
        } catch (_) {}
      }
      setTimeout(() => {
        window.location.href = 'payment-submitted.html';
      }, 2000);
    });
  }
  // Ensure initial visibility of clear matches content
  syncAuthState();
})();

// Select Counterparty page behavior (state-aware)
(function initSelectCounterparty() {
  const page = document.querySelector('main.page--cp');
  if (!page) return;
  const list = page.querySelector('.cp-list');
  const filter = document.getElementById('filter-verified');
  const toolbar = page.querySelector('.cp-toolbar');
  if (!list) return;

  const STATUS_META = {
    verified: { className: 'cp-status--ok', label: 'Verified' },
    review: { className: 'cp-status--review', label: 'Under review' },
    danger: { className: 'cp-status--danger', label: 'Rejected' },
  };

  const STATE_ITEMS = {
    2: [
      { title: 'Delta Electronics, Inc.', bank: 'CIMB', account: '03543546458', status: 'review', href: '#' },
    ],
    3: [
      { title: 'Delta Electronics, Inc.', bank: 'CIMB', account: '03543546458', status: 'verified', href: 'send-payment.html' },
    ],
  };

  const getItemsForState = (state) => {
    if (state <= 1) return [];
    if (state === 2) return STATE_ITEMS[2];
    if (state >= 3) return STATE_ITEMS[3];
    return [];
  };

  const renderEmpty = () => {
    if (toolbar) toolbar.classList.add('is-hidden');
    list.innerHTML = `
      <li class="cp-empty">
        <img src="assets/icon_bankaccount_blue.svg" alt="" width="48" height="48" />
        <p class="cp-empty__title">No counterparty accounts yet</p>
        <p class="cp-empty__text">Add a counterparty bank account before sending a payment.</p>
        <a class="btn btn--primary btn--md" href="add-bank.html">
          <img class="btn-icon" src="assets/icon_plus.svg" alt="" width="16" height="16" />
          Add counterparty account
        </a>
      </li>`;
  };

  const renderNoVerified = () => {
    list.innerHTML = `
      <li class="cp-empty">
        <p class="cp-empty__title">No verified accounts</p>
        <p class="cp-empty__text">Remove the filter or wait for the review to complete.</p>
      </li>`;
  };

  const renderList = () => {
    const state = typeof getPrototypeState === 'function' ? getPrototypeState() : PROTOTYPE_STATE_MIN;
    const baseItems = getItemsForState(state);
    if (!baseItems.length) {
      if (filter) {
        filter.checked = false;
        filter.disabled = true;
        filter.closest('.cp-filter')?.classList.add('is-disabled');
      }
      renderEmpty();
      return;
    }

    const hasVerified = baseItems.some((item) => item.status === 'verified');
    if (filter) {
      filter.disabled = !hasVerified;
      const label = filter.closest('.cp-filter');
      if (filter.disabled) {
        filter.checked = false;
        if (label) label.classList.add('is-disabled');
      } else if (label) {
        label.classList.remove('is-disabled');
      }
    }

    if (toolbar) toolbar.classList.remove('is-hidden');

    const onlyVerified = !!(filter && filter.checked);
    const items = onlyVerified ? baseItems.filter((item) => item.status === 'verified') : baseItems.slice();

    if (!items.length) {
      renderNoVerified();
      return;
    }

    const html = items.map((item) => {
      const meta = STATUS_META[item.status] || STATUS_META.review;
      const isVerified = item.status === 'verified';
      const classes = ['cp-item', isVerified ? 'is-verified' : 'is-unverified'];
      const href = isVerified ? (item.href || 'send-payment.html') : '#';
      const mobileLabel = [`(${item.bank})`, item.account].filter(Boolean).join(' ');
      return `
        <li>
          <a class="${classes.join(' ')}" href="${href}" data-status="${item.status}" ${isVerified ? '' : 'aria-disabled="true"'}>
            <span class="cp-item__icon"><img src="assets/icon_bank_cp.svg" alt="" /></span>
            <span class="cp-item__content">
              <strong class="cp-item__title">${item.title}</strong>
              <small class="cp-status ${meta.className}" ${mobileLabel ? `data-mobile-label="${mobileLabel}"` : ''}>${meta.label}</small>
            </span>
            <span class="cp-item__metablack">(${item.bank})</span>
            <span class="cp-item__meta">${item.account}</span>
            <img class="cp-item__chev" src="assets/icon_chevron_right.svg" width="20" height="20" alt="" />
          </a>
        </li>`;
    }).join('');
    list.innerHTML = html;
  };

  if (filter) {
    filter.addEventListener('change', () => renderList());
  }

  document.addEventListener('prototypeStateChange', renderList);
  renderList();
})();

// Home: when in state 2, hovering the "Send payment" quick action advances state to 3 and shows a snackbar
(function initHomeSendPaymentHoverAdvance() {
  const page = document.querySelector('main.page--home');
  if (!page) return;
  const link = page.querySelector('.qa__item[data-send-payment-entry]');
  if (!link) return;

  // Re-arm whenever we return to state 2 (e.g. via build-badge controls)
  let armed = true;
  try {
    if (typeof window.onPrototypeStateChange === 'function') {
      window.onPrototypeStateChange((state) => {
        armed = state === 2;
      });
    }
  } catch (_) {}

  const handler = () => {
    if (!armed) return;
    try {
      const state = typeof window.getPrototypeState === 'function' ? window.getPrototypeState() : null;
      if (state !== 2) return;
      armed = false;
      if (typeof window.setPrototypeState === 'function') {
        window.setPrototypeState(3);
      }
      if (typeof window.showSnackbar === 'function') {
        window.showSnackbar('Counterparty account verified', 2000, 'success');
      }
    } catch (_) {}
  };

  // Mouse hover (desktop)
  link.addEventListener('mouseenter', handler, { passive: true });
})();

// Payment details: when in state 4, hovering the status badge advances state to 5 and shows a snackbar
(function initPaymentDetailsHoverAdvance() {
  const page = document.querySelector('main.page--payment-detail');
  if (!page) return;
  const badge = document.getElementById('pdStatusBadge');
  if (!badge) return;

  // Re-arm whenever we return to state 4 (e.g. via build-badge controls)
  let armed = true;
  try {
    if (typeof window.onPrototypeStateChange === 'function') {
      window.onPrototypeStateChange((state) => {
        armed = state === 4;
      });
    }
  } catch (_) {}

  const handler = () => {
    if (!armed) return;
    try {
      const state = typeof window.getPrototypeState === 'function' ? window.getPrototypeState() : null;
      if (state !== 4) return;
      armed = false;
      if (typeof window.setPrototypeState === 'function') {
        window.setPrototypeState(5);
      }
      if (typeof window.showSnackbar === 'function') {
        window.showSnackbar('Payment sent succesfully', 2000, 'success');
      }
    } catch (_) {}
  };

  badge.addEventListener('mouseenter', handler, { passive: true });
})();

// Modal helpers (reused lightweight pattern)
(function initModalLogic() {
  const open = (el) => {
    if (!el) return;
    el.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('modal-open');
    document.body.classList.add('modal-open');
    // Lock scroll (iOS safe)
    try {
      const y = window.scrollY || window.pageYOffset || 0;
      document.body.dataset.scrollY = String(y);
      document.body.style.top = `-${y}px`;
      document.body.classList.add('modal-locked');
    } catch (_) {}
  };
  const close = (el) => {
    if (!el) return;
    el.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('modal-open');
    document.body.classList.remove('modal-open');
    // Unlock scroll
    try {
      const y = parseInt(document.body.dataset.scrollY || '0', 10) || 0;
      document.body.classList.remove('modal-locked');
      document.body.style.top = '';
      delete document.body.dataset.scrollY;
      window.scrollTo(0, y);
    } catch (_) {}
  };

  // Wire close buttons and overlay click
  document.querySelectorAll('.modal').forEach((modal) => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close(modal);
    });
    modal.querySelectorAll('[data-modal-close]').forEach((btn) => {
      btn.addEventListener('click', () => close(modal));
    });
  });

  window.__openModal = open;
  window.__closeModal = close;

  // Global snackbar helper (idempotent)
  // type: 'success' | 'error' (default: 'success')
  window.showSnackbar = function(message, durationMs = 2000, type) {
    try {
      let el = document.getElementById('app-snackbar');
      if (!el) {
        el = document.createElement('div');
        el.id = 'app-snackbar';
        el.className = 'snackbar';
        el.innerHTML = '<img class="snackbar__icon" alt=""/><span class="snackbar__text"></span>';
        document.body.appendChild(el);
      }
      var variant = type === 'error' ? 'error' : 'success';
      el.className = 'snackbar snackbar--' + variant;
      var iconEl = el.querySelector('.snackbar__icon');
      if (iconEl) {
        iconEl.setAttribute('src', variant === 'error' ? 'assets/icon_snackbar_error.svg' : 'assets/icon_snackbar_success.svg');
      }
      const text = el.querySelector('.snackbar__text');
      if (text) text.textContent = message || '';
      // Show (always restart animation)
      el.classList.remove('is-visible');
      // Force reflow so transitions retrigger reliably
      void el.offsetWidth;
      requestAnimationFrame(() => el.classList.add('is-visible'));
      // hide after duration
      clearTimeout(el._hideTimer);
      el._hideTimer = setTimeout(() => {
        el.classList.remove('is-visible');
      }, durationMs);
    } catch (_) { /* noop */ }
  };

  // Select-counterparty: block unverified items via delegation
  document.addEventListener('click', (e) => {
    const link = e.target.closest('.cp-item');
    if (!link || !link.closest('.cp-list')) return;
    if (!document.querySelector('main.page--cp')) return;
    const modal = document.getElementById('accountNotVerifiedModal');
    if (!modal) return;
    const statusAttr = link.getAttribute('data-status') || '';
    const isVerified = statusAttr === 'verified' || link.classList.contains('is-verified');
    if (!isVerified) {
      e.preventDefault();
      open(modal);
      return;
    }

    // For verified items that navigate to send-payment, remember entrypoint
    try {
      const href = link.getAttribute('href') || '';
      if (href.indexOf('send-payment.html') !== -1 && window.sessionStorage && typeof SEND_PAYMENT_RETURN_KEY !== 'undefined') {
        window.sessionStorage.setItem(SEND_PAYMENT_RETURN_KEY, 'select-counterparty');
      }
    } catch (_) {
      // ignore
    }
  });
})();

// Select Counterparty: back crumb routes to quick menu on tablet and below
(function initCpBackNavigation() {
  const isCpPage = document.querySelector('main.page--cp');
  if (!isCpPage) return;
  const crumb = document.querySelector('.page__header--crumb .crumb');
  const title = document.getElementById('cp-back-title');
  if (!crumb) return;
  const handleBack = (e) => {
    const DESKTOP_BP = 1280;
    if (window.innerWidth < DESKTOP_BP) {
      e.preventDefault();
      // Use session flag; index.js will switch to quick tab
      try { sessionStorage.setItem('openQuick', '1'); } catch (_) {}
      window.location.href = 'index.html#quick';
    }
  };
  crumb.addEventListener('click', handleBack);
  if (title) {
    title.addEventListener('click', handleBack);
    title.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') handleBack(e);
    });
  }
})();

// Send Payment: back crumb/link target based on entrypoint + mobile behavior
(function initSendBackNavigation() {
  const isSendPage = document.querySelector('main.page--send');
  if (!isSendPage) return;
  const crumb = document.querySelector('.page__header--crumb .crumb');
  const title = document.getElementById('sp-back-title');
  if (!crumb) return;

  // Determine back target from stored entrypoint (default: select-counterparty)
  (function initSendBackLink() {
    try {
      var href = 'select-counterparty.html';
      if (window.sessionStorage && typeof SEND_PAYMENT_RETURN_KEY !== 'undefined') {
        var from = window.sessionStorage.getItem(SEND_PAYMENT_RETURN_KEY);
        if (from === 'cp-detail') href = 'counterparty-bank-details.html';
        else if (from === 'select-counterparty') href = 'select-counterparty.html';
      }
      crumb.setAttribute('href', href);
    } catch (_) {}
  })();

  const handleBack = (e) => {
    const DESKTOP_BP = 1280;
    if (window.innerWidth < DESKTOP_BP) {
      e.preventDefault();
      const target = crumb.getAttribute('href') || 'select-counterparty.html';
      window.location.href = target;
    }
  };
  crumb.addEventListener('click', handleBack);
  if (title) {
    title.addEventListener('click', handleBack);
    title.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') handleBack(e);
    });
  }
})();

// Add Bank: back crumb and title go to Select counterparty on tablet and below
(function initAddBankBackNavigation() {
  const isAddBank = document.querySelector('main.page--addbank');
  if (!isAddBank) return;
  const crumb = document.querySelector('.page__header--crumb .crumb');
  const title = document.getElementById('ab-back-title');
  if (!crumb) return;
  
  // Back navigation is now handled by initAddBankSteps for step management
  // This handler only manages mobile title click
  const handleBack = (e) => {
    const DESKTOP_BP = 1280;
    if (window.innerWidth < DESKTOP_BP) {
      // On mobile, check if we're on step 2+ via the steps handler
      const step2Form = document.getElementById('step2-form');
      if (step2Form && !step2Form.hasAttribute('hidden')) {
        e.preventDefault();
        // Trigger the modal via the steps handler
        const cancelModal = document.getElementById('cancelConfirmModal');
        if (cancelModal) {
          cancelModal.setAttribute('aria-hidden', 'false');
          document.documentElement.classList.add('modal-open');
          document.body.classList.add('modal-open');
          try {
            const y = window.scrollY || window.pageYOffset || 0;
            document.body.dataset.scrollY = String(y);
            document.body.style.top = `-${y}px`;
            document.body.classList.add('modal-locked');
          } catch (_) {}
        }
      }
    }
  };
  
  // Crumb is handled by initAddBankSteps, only handle title on mobile
  if (title) {
    title.addEventListener('click', handleBack);
    title.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') handleBack(e);
    });
  }
})();

// Review Payment: back crumb and title go to Send payment on tablet and below
(function initReviewBackNavigation() {
  const isReview = document.querySelector('main.page--review');
  if (!isReview) return;
  const crumb = document.querySelector('.page__header--crumb .crumb');
  const title = document.getElementById('rv-back-title');
  if (!crumb) return;
  const handleBack = (e) => {
    const DESKTOP_BP = 1280;
    if (window.innerWidth < DESKTOP_BP) {
      e.preventDefault();
      window.location.href = 'send-payment.html';
    }
  };
  crumb.addEventListener('click', handleBack);
  if (title) {
    title.addEventListener('click', handleBack);
    title.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') handleBack(e);
    });
  }
})();

(function initReviewErrorSimulation() {
  const page = document.querySelector('main.page--review');
  if (!page) return;

  const controls = document.getElementById('reviewErrorControls');
  const simulateLink = document.getElementById('reviewSimulateTrigger');
  const resetLink = document.getElementById('reviewResetErrors');
  if (!controls || !simulateLink || !resetLink) return;

  const scenariosSource = Array.isArray(window.REVIEW_ERROR_SCENARIOS) && window.REVIEW_ERROR_SCENARIOS.length
    ? window.REVIEW_ERROR_SCENARIOS
    : REVIEW_ERROR_SCENARIOS_CONFIG;
  const scenarios = Array.isArray(scenariosSource) ? scenariosSource.filter(Boolean) : [];
  if (!scenarios.length) {
    simulateLink.classList.add('is-disabled');
    simulateLink.setAttribute('aria-disabled', 'true');
    return;
  }

  const valueEl = controls.querySelector('[data-error-value]');
  const nameEl = controls.querySelector('[data-error-name]');
  const downBtn = controls.querySelector('[data-error-action="down"]');
  const upBtn = controls.querySelector('[data-error-action="up"]');
  const panel = document.getElementById('reviewErrorPanel');
  const titleEl = document.getElementById('reviewErrorTitle');
  const messageEl = document.getElementById('reviewErrorMessage');
  const primaryBtn = document.getElementById('review-confirm');

  let index = 0;
  let isBusy = false;

  const setPrimaryDisabled = (disabled) => {
    if (!primaryBtn) return;
    const state = !!disabled;
    primaryBtn.disabled = state;
    primaryBtn.setAttribute('aria-disabled', state ? 'true' : 'false');
    primaryBtn.classList.toggle('is-disabled', state);
  };

  const scrollPanelIntoView = () => {
    if (!panel || panel.hidden) return;
    try {
      const rect = panel.getBoundingClientRect();
      const top = Math.max((rect.top + window.scrollY) - 80, 0);
      window.scrollTo({ top, behavior: 'auto' });
    } catch (_) {}
  };

  const resetInlineError = () => {
    if (!panel) return;
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('has-review-inline-error');
    document.body.removeAttribute('data-review-error-key');
  };

  const applyInlineError = (scenario) => {
    if (!panel) return;
    panel.hidden = false;
    panel.removeAttribute('aria-hidden');
    document.body.classList.add('has-review-inline-error');
    if (scenario && scenario.key) {
      document.body.setAttribute('data-review-error-key', scenario.key);
    } else {
      document.body.removeAttribute('data-review-error-key');
    }
    const label = scenario && scenario.title ? scenario.title : 'Unknown error';
    if (titleEl) {
      titleEl.textContent = 'Payment failed: No charge applied';
    }
    if (messageEl) {
      const baseMessage = (scenario && scenario.inlineMessage) || REVIEW_INLINE_ERROR_DEFAULT;
      const prefix = label ? `${label}. ` : '';
      messageEl.innerHTML = prefix + baseMessage;
    }
  };

  const syncControls = () => {
    if (valueEl) valueEl.textContent = String(index + 1);
    const scenario = scenarios[index];
    if (nameEl) {
      nameEl.textContent = scenario && (scenario.badgeLabel || scenario.title)
        ? (scenario.badgeLabel || scenario.title)
        : '';
    }
    if (downBtn) downBtn.disabled = index <= 0;
    if (upBtn) upBtn.disabled = index >= (scenarios.length - 1);
  };

  const openLoadingModal = () => {
    const modal = document.getElementById('loadingModal');
    if (!modal) return () => {};
    if (typeof window.__openModal === 'function' && typeof window.__closeModal === 'function') {
      window.__openModal(modal);
      return () => window.__closeModal(modal);
    }
    modal.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('modal-open');
    document.body.classList.add('modal-open');
    return () => {
      modal.setAttribute('aria-hidden', 'true');
      document.documentElement.classList.remove('modal-open');
      document.body.classList.remove('modal-open');
    };
  };

  const applyScenario = (scenario) => {
    if (!scenario) return;
    applyInlineError(scenario);
    setPrimaryDisabled(!!scenario.disablePrimary);
    const snackbarText = scenario.snackbar || REVIEW_SNACKBAR_FALLBACK;
    if (typeof window.showSnackbar === 'function') {
      window.showSnackbar(snackbarText, 4000, 'error');
    }
    if (scenario.alertMessage && scenario.key !== 'kyc-status') {
      try {
        window.alert(scenario.alertMessage);
      } catch (_) {}
    }
  };

  const toggleLinkDisabled = (link, disabled) => {
    if (!link) return;
    link.classList.toggle('is-disabled', disabled);
    link.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  };

  const setControlsBusy = (state) => {
    isBusy = state;
    toggleLinkDisabled(simulateLink, state);
    toggleLinkDisabled(resetLink, state);
  };

  const clearErrorState = () => {
    resetInlineError();
    setPrimaryDisabled(false);
  };

  controls.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-error-action]');
    if (!btn) return;
    e.preventDefault();
    if (isBusy) return;
    const action = btn.getAttribute('data-error-action');
    if (action === 'up' && index < scenarios.length - 1) {
      index += 1;
    } else if (action === 'down' && index > 0) {
      index -= 1;
    }
    syncControls();
  });

  simulateLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (isBusy) return;
    setControlsBusy(true);
    const closeLoading = openLoadingModal();
    setTimeout(() => {
      closeLoading();
      applyScenario(scenarios[index]);
      scrollPanelIntoView();
      setControlsBusy(false);
    }, 1200);
  });

  resetLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (isBusy) return;
    clearErrorState();
  });

  clearErrorState();
  syncControls();
  setControlsBusy(false);
})();

// Add Bank: Step navigation and state management
(function initAddBankSteps() {
  const root = document.querySelector('main.page--addbank');
  if (!root) return;
  
  let currentStep = 1;
  const stepData = { step1: {}, step2: {} };
  
  const step1Form = document.getElementById('step1-form');
  const step2Form = document.getElementById('step2-form');
  const step3Summary = document.getElementById('step3-summary');
  const nextBtn = document.getElementById('ab-next');
  const nextBtnStep2 = document.getElementById('ab-next-step2');
  const backBtnStep2 = document.getElementById('ab-back');
  const cancelModal = document.getElementById('cancelConfirmModal');
  const cancelContinueBtn = document.getElementById('cancelConfirmContinue');
  const cancelCancelBtn = document.getElementById('cancelConfirmCancel');
  const crumb = document.querySelector('.page__header--crumb .crumb');
  const cancelBtnStep3 = document.getElementById('ab-cancel-step3');
  const submitBtnStep3 = document.getElementById('ab-submit-step3');
  const editStep1Btn = document.getElementById('ab-edit-step1');
  const editStep2Btn = document.getElementById('ab-edit-step2');
  
  if (!step1Form || !step2Form || !step3Summary) return;

  // Scroll to top instantly when changing steps (no smooth animation)
  const scrollToTopInstant = () => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.scrollBehavior;
    const prevBody = body.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    body.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    // Restore any previous inline scroll-behavior
    html.style.scrollBehavior = prevHtml;
    body.style.scrollBehavior = prevBody;
  };
  
  // Store step 1 data
  const storeStep1Data = () => {
    stepData.step1 = {
      companyName: document.getElementById('companyName')?.value || '',
      regDate: document.getElementById('regDate')?.value || '',
      regNum: document.getElementById('regNum')?.value || '',
      businessAddress: document.getElementById('businessAddress')?.value || '',
      operationCountry: document.getElementById('operationCountry')?.value || '',
      email: document.getElementById('email')?.value || ''
    };
  };

  // Store step 2 data
  const storeStep2Data = () => {
    const bankCountryEl = document.getElementById('bankCountry');
    const bankNameEl = document.getElementById('bankName');
    const bankCityEl = document.getElementById('bankCity');
    const swiftCodeEl = document.getElementById('swiftCode');
    const accountNumberEl = document.getElementById('accountNumber');
    const ibanNumberEl = document.getElementById('ibanNumber');
    const nickIbanEl = document.getElementById('accountNickname');
    const nickSwiftEl = document.getElementById('accountNicknameSwift');
    const accountHolderNameEl = document.getElementById('accountHolderName');

    const accountUsedForEl = document.getElementById('accountUsedFor');
    const declarationPurposeEl = document.getElementById('declarationPurpose');
    const avgTransactionsEl = document.getElementById('avgTransactions');
    const avgVolumeEl = document.getElementById('avgVolume');

    const getUploadedName = () => {
      if (typeof window.getBankProofUploaded === 'function') {
        return window.getBankProofUploaded();
      }
      return null;
    };

    stepData.step2 = {
      bankCountry: bankCountryEl?.value || '',
      bankName: bankNameEl?.value || '',
      bankCity: bankCityEl?.value || '',
      swiftCode: swiftCodeEl?.value || '',
      accountNumber: accountNumberEl?.value || '',
      ibanNumber: ibanNumberEl?.value || '',
      accountNickname: nickIbanEl?.value || nickSwiftEl?.value || '',
      accountHolderName: accountHolderNameEl?.value || '',
      accountUsedFor: accountUsedForEl?.value || '',
      declarationPurpose: declarationPurposeEl?.value || '',
      avgTransactions: avgTransactionsEl?.value || '',
      avgVolume: avgVolumeEl?.value || '',
      bankProofFileName: getUploadedName(),
    };
  };

  const getAccountUsedForLabel = (value) => {
    const map = {
      incoming: 'Send payments to this account',
      outgoing: 'Receive payments from this account',
      both: 'Both send and receive payments',
    };
    return map[value] || '';
  };

  const formatOrDash = (value) => {
    const v = (value || '').toString().trim();
    return v ? v : '—';
  };

  const renderStep3Summary = () => {
    const s1 = stepData.step1 || {};
    const s2 = stepData.step2 || {};

    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = formatOrDash(value);
    };

    const setVisibility = (id, visible) => {
      const rowId = `${id}-row`;
      const row = document.getElementById(rowId);
      if (row) {
        row.style.display = visible ? '' : 'none';
      }
    };

    // Format date to DD/MM/YYYY
    const formatDate = (dateStr) => {
      if (!dateStr) return '';
      const s = String(dateStr).trim();
      // YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const parts = s.split('-');
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      // YYYY/MM/DD
      if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) {
        const parts = s.split('/');
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      // DD/MM/YYYY (already desired)
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
        return s;
      }
      // Already in DD/MM/YYYY or partial input; return as-is
      return s;
    };

    // Format number with thousand separators for summary display
    const formatVolume = (value) => {
      if (!value) return '';
      const normalized = value.toString().replace(/,/g, '');
      const num = parseFloat(normalized);
      if (isNaN(num)) return value;
      return num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    };

    // Step 1 fields
    setText('ab-summary-companyName', s1.companyName);
    setText('ab-summary-regDate', formatDate(s1.regDate));
    setText('ab-summary-regNum', s1.regNum);
    setText('ab-summary-businessAddress', s1.businessAddress);
    setText('ab-summary-operationCountry', s1.operationCountry);
    setText('ab-summary-email', s1.email);

    // Step 2 - bank details
    setText('ab-summary-accountNickname', s2.accountNickname || s2.accountNicknameSwift);
    setText('ab-summary-bankName', s2.bankName);
    setText('ab-summary-bankCountry', s2.bankCountry);
    setText('ab-summary-bankCity', s2.bankCity);
    setText('ab-summary-accountHolderName', s2.accountHolderName);

    // Determine country type and show/hide IBAN vs SWIFT fields
    const IBAN_COUNTRIES = [
      'Albania', 'Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Czech Republic',
      'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary',
      'Iceland', 'Ireland', 'Italy', 'Latvia', 'Liechtenstein', 'Lithuania',
      'Luxembourg', 'Malta', 'Netherlands', 'Norway', 'Poland', 'Portugal',
      'Romania', 'Slovakia', 'Slovenia', 'Spain', 'Sweden', 'Switzerland',
      'United Kingdom'
    ];
    const isIBAN = s2.bankCountry && IBAN_COUNTRIES.includes(s2.bankCountry);
    
    if (isIBAN) {
      setText('ab-summary-ibanNumber', s2.ibanNumber);
      setVisibility('ab-summary-ibanNumber', true);
      setVisibility('ab-summary-swiftCode', false);
      setVisibility('ab-summary-accountNumber', false);
    } else {
      setText('ab-summary-swiftCode', s2.swiftCode);
      setText('ab-summary-accountNumber', s2.accountNumber);
      setVisibility('ab-summary-ibanNumber', false);
      setVisibility('ab-summary-swiftCode', true);
      setVisibility('ab-summary-accountNumber', true);
    }

    // Document proof
    const docProofEl = document.getElementById('ab-summary-docProof');
    if (docProofEl) {
      if (s2.bankProofFileName) {
        docProofEl.textContent = 'Uploaded';
        docProofEl.classList.add('step3-kv__value--uploaded');
      } else {
        docProofEl.textContent = 'Not uploaded';
        docProofEl.classList.remove('step3-kv__value--uploaded');
      }
    }

    // Declaration / transaction information
    const usedForLabel = getAccountUsedForLabel(s2.accountUsedFor);
    setText('ab-summary-accountUsedFor', usedForLabel || s2.accountUsedFor);
    setText('ab-summary-declarationPurpose', s2.declarationPurpose || '');
    setText('ab-summary-avgTransactions', s2.avgTransactions ? `${s2.avgTransactions} Transactions / month` : '');
    if (s2.avgVolume) {
      const formattedVolume = formatVolume(s2.avgVolume);
      setText('ab-summary-avgVolume', `${formattedVolume} USD / month`);
    } else {
      setText('ab-summary-avgVolume', '');
    }
  };
  
  // Update step indicator
  const updateStepIndicator = (step) => {
    [1, 2, 3].forEach((s) => {
      const indicator = document.getElementById(`step-indicator-${s}`);
      if (!indicator) return;
      const dot = indicator.querySelector('.ab-dot');
      const title = indicator.querySelector('.ab-step__title');
      const label = indicator.querySelector('.ab-step__label');
      
      if (s === step) {
        // Current/Active step - green and primary colors
        indicator.classList.add('is-active');
        if (dot) dot.style.background = '#3FAE64';
        if (title) {
          title.classList.remove('is-muted');
          title.style.fontWeight = '700';
          title.style.color = '#2D2F2F';
        }
        if (label) label.style.color = '#3FAE64';
      } else {
        // Completed or future step - placeholder colors
        indicator.classList.remove('is-active');
        if (dot) dot.style.background = '#DBDBDC';
        if (title) {
          title.classList.add('is-muted');
          title.style.fontWeight = '';
          title.style.color = '#BCBDBD';
        }
        if (label) label.style.color = '#BCBDBD';
      }
    });
  };
  
  // Show step
  const showStep = (step) => {
    if (step === 1) {
      step1Form.removeAttribute('hidden');
      step1Form.style.display = '';
      step2Form.setAttribute('hidden', '');
      step2Form.style.display = 'none';
      step3Summary.setAttribute('hidden', '');
      step3Summary.style.display = 'none';
    } else if (step === 2) {
      step1Form.setAttribute('hidden', '');
      step1Form.style.display = 'none';
      step2Form.removeAttribute('hidden');
      step2Form.style.display = '';
      step3Summary.setAttribute('hidden', '');
      step3Summary.style.display = 'none';
    } else if (step === 3) {
      step1Form.setAttribute('hidden', '');
      step1Form.style.display = 'none';
      step2Form.setAttribute('hidden', '');
      step2Form.style.display = 'none';
      step3Summary.removeAttribute('hidden');
      step3Summary.style.display = '';
    }
    currentStep = step;
    updateStepIndicator(step);
    scrollToTopInstant();
  };
  
  // Navigate to step 2
  const goToStep2 = () => {
    storeStep1Data();
    showStep(2);
  };

  // Navigate to step 3
  const goToStep3 = () => {
    storeStep1Data();
    storeStep2Data();
    renderStep3Summary();
    showStep(3);
  };
  
  // Navigate back to step 1
  const goToStep1 = () => {
    showStep(1);
  };
  
  // Handle header back button
  const handleHeaderBack = (e) => {
    if (currentStep > 1) {
      e.preventDefault();
      if (cancelModal) {
        cancelModal.setAttribute('aria-hidden', 'false');
        document.documentElement.classList.add('modal-open');
        document.body.classList.add('modal-open');
        try {
          const y = window.scrollY || window.pageYOffset || 0;
          document.body.dataset.scrollY = String(y);
          document.body.style.top = `-${y}px`;
          document.body.classList.add('modal-locked');
        } catch (_) {}
      }
    }
  };
  
  // Next button step 1
  if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      e.preventDefault();
      goToStep2();
    });
  }

  // Next button step 2
  if (nextBtnStep2) {
    nextBtnStep2.addEventListener('click', (e) => {
      e.preventDefault();
      goToStep3();
    });
  }
  
  // Back button step 2
  if (backBtnStep2) {
    backBtnStep2.addEventListener('click', (e) => {
      e.preventDefault();
      goToStep1();
    });
  }

  // Edit buttons in step 3
  if (editStep1Btn) {
    editStep1Btn.addEventListener('click', (e) => {
      e.preventDefault();
      showStep(1);
    });
  }
  if (editStep2Btn) {
    editStep2Btn.addEventListener('click', (e) => {
      e.preventDefault();
      showStep(2);
    });
  }

  // Cancel button in step 3 opens the same cancel confirmation dialog
  if (cancelBtnStep3) {
    cancelBtnStep3.addEventListener('click', (e) => {
      e.preventDefault();
      if (cancelModal) {
        cancelModal.setAttribute('aria-hidden', 'false');
        document.documentElement.classList.add('modal-open');
        document.body.classList.add('modal-open');
        try {
          const y = window.scrollY || window.pageYOffset || 0;
          document.body.dataset.scrollY = String(y);
          document.body.style.top = `-${y}px`;
          document.body.classList.add('modal-locked');
        } catch (_) {}
      }
    });
  }

  // Submit button in step 3 – go to application submitted page
  if (submitBtnStep3) {
    submitBtnStep3.addEventListener('click', (e) => {
      e.preventDefault();
      try {
        if (typeof window.getPrototypeState === 'function' && typeof window.setPrototypeState === 'function') {
          const current = window.getPrototypeState();
          if (current < 2) window.setPrototypeState(2);
        }
      } catch (_) {}
      
      // Show loading modal for 1.5s then redirect
      const loading = document.getElementById('loadingModal');
      if (loading) {
        loading.setAttribute('aria-hidden', 'false');
        document.documentElement.classList.add('modal-open');
        document.body.classList.add('modal-open');
        try {
          const y = window.scrollY || window.pageYOffset || 0;
          document.body.dataset.scrollY = String(y);
          document.body.style.top = `-${y}px`;
          document.body.classList.add('modal-locked');
        } catch (_) {}
      }
      setTimeout(() => {
        window.location.href = 'add-bank-submitted.html';
      }, 1500);
    });
  }
  
  // Cancel modal handlers
  if (cancelContinueBtn) {
    cancelContinueBtn.addEventListener('click', () => {
      if (cancelModal) {
        cancelModal.setAttribute('aria-hidden', 'true');
        document.documentElement.classList.remove('modal-open');
        document.body.classList.remove('modal-open');
        try {
          const y = parseInt(document.body.dataset.scrollY || '0', 10) || 0;
          document.body.classList.remove('modal-locked');
          document.body.style.top = '';
          delete document.body.dataset.scrollY;
          window.scrollTo(0, y);
        } catch (_) {}
      }
    });
  }
  
  if (cancelCancelBtn) {
    cancelCancelBtn.addEventListener('click', () => {
      window.location.href = 'select-counterparty.html';
    });
  }
  
  // Close modal on backdrop click
  if (cancelModal) {
    cancelModal.addEventListener('click', (e) => {
      if (e.target === cancelModal) {
        cancelModal.setAttribute('aria-hidden', 'true');
        document.documentElement.classList.remove('modal-open');
        document.body.classList.remove('modal-open');
        try {
          const y = parseInt(document.body.dataset.scrollY || '0', 10) || 0;
          document.body.classList.remove('modal-locked');
          document.body.style.top = '';
          delete document.body.dataset.scrollY;
          window.scrollTo(0, y);
        } catch (_) {}
      }
    });
    
    cancelModal.querySelectorAll('[data-modal-close]').forEach((btn) => {
      btn.addEventListener('click', () => {
        cancelModal.setAttribute('aria-hidden', 'true');
        document.documentElement.classList.remove('modal-open');
        document.body.classList.remove('modal-open');
        try {
          const y = parseInt(document.body.dataset.scrollY || '0', 10) || 0;
          document.body.classList.remove('modal-locked');
          document.body.style.top = '';
          delete document.body.dataset.scrollY;
          window.scrollTo(0, y);
        } catch (_) {}
      });
    });
  }
  
  // Update header back button handler
  if (crumb) {
    crumb.addEventListener('click', handleHeaderBack);
  }
  
  // Initialize step indicator and ensure step 1 is visible
  updateStepIndicator(1);
  showStep(1); // Ensure step 1 is visible on load
  
  // Step 2 form validation
  const accountHolderName = document.getElementById('accountHolderName');
  if (nextBtnStep2 && accountHolderName) {
    const validateStep2 = () => {
      const hasName = accountHolderName.value && accountHolderName.value.trim() !== '';
      const bankDetailsFilled = document.getElementById('bankDetailsDisplay')?.style.display !== 'none';
      const accountDeclarationFilled = document.getElementById('accountDeclarationDisplay')?.style.display !== 'none';
      const uploadFilled = typeof window.getBankProofUploaded === 'function' && window.getBankProofUploaded() !== null;
      
      const isValid = hasName && bankDetailsFilled && accountDeclarationFilled && uploadFilled;
      nextBtnStep2.disabled = !isValid;
      nextBtnStep2.setAttribute('aria-disabled', String(!isValid));
    };
    
    // Expose globally for upload handler
    window.validateStep2Form = validateStep2;
    
    accountHolderName.addEventListener('input', validateStep2);
    accountHolderName.addEventListener('change', validateStep2);
    
    // Watch for bank details and account declaration changes
    const bankDetailsInput = document.getElementById('bankDetails');
    const accountDeclarationInput = document.getElementById('accountDeclaration');
    if (bankDetailsInput) {
      bankDetailsInput.addEventListener('input', validateStep2);
      bankDetailsInput.addEventListener('change', validateStep2);
    }
    if (accountDeclarationInput) {
      accountDeclarationInput.addEventListener('input', validateStep2);
      accountDeclarationInput.addEventListener('change', validateStep2);
    }
    
    validateStep2();
  }
})();

// Add Bank: enable Next when all fields are filled (reusable helper)
(function initAddBankFormState() {
  const root = document.querySelector('main.page--addbank');
  if (!root) return;
  const form = document.getElementById('step1-form');
  const nextBtn = document.getElementById('ab-next');
  if (!form || !nextBtn) return;

  const getFields = () => ([
    form.querySelector('#companyName'),
    form.querySelector('#regDate'),
    form.querySelector('#regNum'),
    form.querySelector('#businessAddress'),
    form.querySelector('#operationCountry'),
    form.querySelector('#email'),
  ]);

  const setDisabled = (btn, disabled) => {
    btn.disabled = !!disabled;
    if (disabled) btn.setAttribute('aria-disabled', 'true');
    else btn.removeAttribute('aria-disabled');
  };

  const isFilled = (el) => {
    if (!el) return false;
    const v = (el.value || '').trim();
    if (el.type === 'email') {
      // simple validity; rely on browser validation for complex cases
      return el.validity.valid && v.length > 0;
    }
    return v.length > 0;
  };

  const update = () => {
    const fields = getFields();
    const allOk = fields.every(isFilled);
    setDisabled(nextBtn, !allOk);
    // toggle filled style for operation country select
    const opCountrySel = form.querySelector('#operationCountry');
    if (opCountrySel) {
      opCountrySel.classList.toggle('is-filled', !!opCountrySel.value);
    }
  };

  // Listen for changes
  getFields().forEach((el) => {
    if (!el) return;
    el.addEventListener('input', update, { passive: true });
    el.addEventListener('change', update);
  });
  // Initial
  update();
})();

// Add Bank: registration date mask (DD/MM/YYYY) to keep 00/00/0000 structure while typing
(function initAddBankRegDateMask() {
  const root = document.querySelector('main.page--addbank');
  if (!root) return;
  const el = document.getElementById('regDate');
  if (!el) return;

  const format = (raw) => {
    const digits = (raw || '').toString().replace(/\D/g, '').slice(0, 8);
    const d = digits.slice(0, 2);
    const m = digits.slice(2, 4);
    const y = digits.slice(4, 8);
    let out = d;
    if (digits.length > 2) out += '/' + m;
    if (digits.length > 4) out += '/' + y;
    return out;
  };

  const apply = () => {
    const next = format(el.value);
    if (el.value !== next) {
      el.value = next;
    }
  };

  // Keep caret simple: always jump to end (fine for demo + typewriter)
  el.addEventListener('input', apply);
  el.addEventListener('change', apply);
})();

// Reusable helper: animate an input's value as if a user is typing
// - Cancels automatically if user types/changes focus
// - Dispatches input/change events so existing validation reacts live
(function initTypewriterHelper() {
  if (window.__xrexTypeIntoInput) return;

  window.__xrexTypeIntoInput = function (el, fullValue, opts) {
    try {
      if (!el) return { cancel: function () {} };
      const options = opts || {};
      const target = (fullValue == null) ? '' : String(fullValue);

      const onlyIfEmpty = options.onlyIfEmpty !== false; // default true
      const resumeFromExisting = options.resumeFromExisting !== false; // default true
      const current = (el.value || '').toString();
      if (onlyIfEmpty && current.trim().length > 0) return { cancel: function () {} };

      // Cancel any in-flight animation on this element
      try {
        if (el.__xrexTypewriter && typeof el.__xrexTypewriter.cancel === 'function') {
          el.__xrexTypewriter.cancel();
        }
      } catch (_) {}

      let timer = null;
      let cancelled = false;
      let i = 0;
      let docPointerHandler = null;

      const charDelay = typeof options.charDelay === 'number' ? options.charDelay : 32;
      const jitter = typeof options.jitter === 'number' ? options.jitter : 18;
      const initialDelay = typeof options.initialDelay === 'number' ? options.initialDelay : 0;

      const triggerInput = () => {
        try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
      };
      const triggerChange = () => {
        try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
      };

      const cleanup = () => {
        try { if (timer) clearTimeout(timer); } catch (_) {}
        timer = null;
        try {
          el.removeEventListener('keydown', cancelIfTrusted, true);
          el.removeEventListener('paste', cancelIfTrusted, true);
          el.removeEventListener('beforeinput', cancelIfTrusted, true);
          el.removeEventListener('blur', cancelIfTrusted, true);
          if (docPointerHandler) document.removeEventListener('pointerdown', docPointerHandler, true);
        } catch (_) {}
        try { el.__xrexTypewriter = null; } catch (_) {}
      };

      function cancel() {
        cancelled = true;
        cleanup();
      }

      function cancelIfTrusted(e) {
        // Only cancel for *real* user actions; we emit synthetic events while typing.
        try {
          if (e && e.isTrusted === false) return;
        } catch (_) {}
        cancel();
      }

      const nextDelay = () => {
        const rand = (Math.random() * 2 - 1) * jitter;
        return Math.max(0, Math.round(charDelay + rand));
      };

      const step = () => {
        if (cancelled) return;
        if (i >= target.length) {
          triggerChange();
          cleanup();
          return;
        }
        el.value = target.slice(0, i + 1);
        triggerInput();
        i += 1;
        timer = setTimeout(step, nextDelay());
      };

      // Start either from empty, or resume from an existing prefix (useful if the user clicked once and it partially filled)
      const existing = (el.value || '').toString();
      if (resumeFromExisting && existing && target.indexOf(existing) === 0 && existing.length < target.length) {
        i = existing.length;
      } else {
        el.value = '';
        triggerInput();
      }

      // Cancel animation if user takes control
      el.addEventListener('keydown', cancelIfTrusted, true);
      el.addEventListener('paste', cancelIfTrusted, true);
      el.addEventListener('beforeinput', cancelIfTrusted, true);
      el.addEventListener('blur', cancelIfTrusted, true);
      // Click/tap elsewhere cancels (clicking inside the same input should not)
      docPointerHandler = function (e) {
        try {
          if (!e || e.isTrusted === false) return;
          const t = e.target;
          if (t === el) return;
          if (t && typeof el.contains === 'function' && el.contains(t)) return;
        } catch (_) {}
        cancel();
      };
      document.addEventListener('pointerdown', docPointerHandler, true);

      el.__xrexTypewriter = { cancel: cancel };
      timer = setTimeout(step, initialDelay);

      return { cancel: cancel };
    } catch (_) {
      return { cancel: function () {} };
    }
  };
})();

// Add Bank: field-by-field demo autofill on focus/click (Step 1)
(function initAddBankAutofillOnFieldPress() {
  const root = document.querySelector('main.page--addbank');
  if (!root) return;
  const step1Form = document.getElementById('step1-form');
  if (!step1Form) return;

  const DEMO = {
    companyName: 'Delta Electronics, Inc.',
    // Masked input (DD/MM/YYYY)
    regDate: '10/09/2000',
    regNum: '0606976',
    operationCountry: 'Singapore',
    email: 'thebest@abc.com',
    // Match the Business Address modal formatter output: line1 + city + postal + country
    businessAddress: 'Asia Square Tower 2, 12 Marina View, #10-23, Singapore, 018961, Singapore',
    // Best-effort split for the "Add registered address" modal (optional, but keeps UI consistent)
    businessAddressModal: {
      addressCountry: 'Singapore',
      addressState: '',
      addressCity: 'Singapore',
      addressLine1: 'Asia Square Tower 2, 12 Marina View, #10-23',
      addressLine2: '',
      addressPostal: '018961',
    },
    // Step 2
    accountHolderName: 'Delta Electronics, Inc.',
    bankDetailsModal: {
      accountNicknameSwift: 'Delta electronics - CIMB',
      bankName: 'CIMB',
      bankCountry: 'Singapore',
      bankCity: 'Singapore',
      swiftCode: 'CIBBSGSG',
      accountNumber: '03543546458',
    },
    accountDeclarationModal: {
      accountUsedFor: 'incoming', // "Send payments to this account"
      declarationPurpose: 'Payments',
      avgTransactionsDigits: '2',
      avgVolumeDigits: '100000',
    },
    bankProofFileName: 'bank-statement.pdf',
  };

  // Single source of truth for dev tools + click-to-fill.
  // (Using window so other IIFEs can reuse it without duplicating constants.)
  try {
    window.__ADD_BANK_DEMO = DEMO;
  } catch (_) {}

  const trigger = (el) => {
    if (!el) return;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const isEmpty = (el) => {
    if (!el) return true;
    const v = (el.value || '').toString().trim();
    return v.length === 0;
  };

  const setIfEmpty = (el, value) => {
    if (!el) return;
    if (!isEmpty(el)) return;
    el.value = value;
    trigger(el);
  };

  const typeIfEmpty = (el, value) => {
    if (!el) return;
    const target = (value == null) ? '' : String(value);
    const existing = (el.value || '').toString();
    const existingTrimmed = existing.trim();

    // If there's already a partial prefix (e.g. "De"), resume typing the remainder.
    if (existingTrimmed && target && target.indexOf(existing) === 0 && existing.length < target.length) {
      if (typeof window.__xrexTypeIntoInput === 'function') {
        window.__xrexTypeIntoInput(el, target, { onlyIfEmpty: false, resumeFromExisting: true });
      } else {
        // Fallback: just set full value
        el.value = target;
        trigger(el);
      }
      return;
    }

    if (!isEmpty(el)) return;

    if (typeof window.__xrexTypeIntoInput === 'function') {
      window.__xrexTypeIntoInput(el, target, { onlyIfEmpty: true, resumeFromExisting: true });
      return;
    }
    // Fallback (no animation)
    setIfEmpty(el, target);
  };

  const promoteSelectOption = (el, value) => {
    if (!el) return;
    if (!value) return;
    try {
      const opts = Array.prototype.slice.call(el.options || []);
      if (!opts.length) return;
      const idx = opts.findIndex((opt) => opt && opt.value === value);
      if (idx < 0) return;

      // Keep placeholder (index 0) first. Move desired option to index 1.
      const desiredPos = 1;
      if (idx === desiredPos) return;
      const opt = opts[idx];
      const ref = el.options[desiredPos] || null;
      // If the option is currently selected, preserve selection after moving
      const wasSelected = opt.selected;
      el.removeChild(opt);
      el.insertBefore(opt, ref);
      if (wasSelected) {
        opt.selected = true;
      }
    } catch (_) {}
  };

  const setSelectValue = (el, value) => {
    if (!el) return;
    if (!value) return;
    try {
      const hasOption = Array.prototype.slice.call(el.options || []).some((opt) => opt && opt.value === value);
      if (!hasOption) return;
      el.value = value;
      trigger(el);
    } catch (_) {}
  };

  const typeDigitsIntoEnhancedField = (el, digits, opts) => {
    if (!el) return;
    const s = (digits == null) ? '' : String(digits);
    const onlyIfEmpty = !(opts && opts.onlyIfEmpty === false);
    if (onlyIfEmpty && (el.value || '').toString().trim().length > 0) return;

    // Cancel any previous digit-typing on this element
    try {
      if (el.__xrexDigitsTyper && typeof el.__xrexDigitsTyper.cancel === 'function') {
        el.__xrexDigitsTyper.cancel();
      }
    } catch (_) {}

    let cancelled = false;
    let idx = 0;
    const delay = (opts && typeof opts.charDelay === 'number') ? opts.charDelay : 40;

    const cancel = () => { cancelled = true; };
    el.__xrexDigitsTyper = { cancel };

    const tick = () => {
      if (cancelled) return;
      if (idx >= s.length) {
        try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
        return;
      }
      const ch = s[idx++];
      if (!/^\d$/.test(ch)) {
        setTimeout(tick, delay);
        return;
      }
      try {
        const ev = new KeyboardEvent('keydown', { key: ch, bubbles: true });
        el.dispatchEvent(ev);
      } catch (_) {
        // Fallback: set value (may be reformatted by existing listeners)
        el.value = ((el.value || '') + ch);
        trigger(el);
      }
      setTimeout(tick, delay);
    };

    setTimeout(tick, delay);
  };

  const fillBusinessAddress = () => {
    const businessAddress = document.getElementById('businessAddress');
    if (businessAddress && isEmpty(businessAddress)) {
      businessAddress.value = DEMO.businessAddress;
      // Update icon after setting value (matches existing devtools behavior)
      const businessAddressIcon = document.getElementById('businessAddressIcon');
      if (businessAddressIcon) businessAddressIcon.src = 'assets/icon_edit.svg';
      trigger(businessAddress);
    }
  };

  // Add registered address modal: apply same demo autofill behavior
  // - Text inputs: typewriter animation (only if empty)
  // - Country select: promote demo country to the first real option (no auto-select)
  const initBusinessAddressModalDemo = () => {
    const modal = document.getElementById('businessAddressModal');
    if (!modal) return;
    const map = DEMO.businessAddressModal || {};

    const addressCountry = modal.querySelector('#addressCountry');
    const addressState = modal.querySelector('#addressState');
    const addressCity = modal.querySelector('#addressCity');
    const addressLine1 = modal.querySelector('#addressLine1');
    const addressLine2 = modal.querySelector('#addressLine2');
    const addressPostal = modal.querySelector('#addressPostal');

    // Bind select: promote option to top for easy picking
    bind(addressCountry, () => promoteSelectOption(addressCountry, map.addressCountry || ''));

    // Bind inputs: type on focus/click
    bind(addressState, () => typeIfEmpty(addressState, map.addressState || ''));
    bind(addressCity, () => typeIfEmpty(addressCity, map.addressCity || ''));
    bind(addressLine1, () => typeIfEmpty(addressLine1, map.addressLine1 || ''));
    bind(addressLine2, () => typeIfEmpty(addressLine2, map.addressLine2 || ''));
    bind(addressPostal, () => typeIfEmpty(addressPostal, map.addressPostal || ''));
  };

  const initBankDetailsModalDemo = () => {
    const modal = document.getElementById('bankDetailsModal');
    if (!modal) return;
    const map = DEMO.bankDetailsModal || {};

    const bankCountry = modal.querySelector('#bankCountry');
    const bankName = modal.querySelector('#bankName');
    const bankCity = modal.querySelector('#bankCity');
    const swiftCode = modal.querySelector('#swiftCode');
    const accountNumber = modal.querySelector('#accountNumber');
    const accountNicknameSwift = modal.querySelector('#accountNicknameSwift');

    const ensureCountry = () => {
      // For step 2 we select the value so SWIFT fields appear.
      if (bankCountry && !(bankCountry.value || '').trim()) {
        setSelectValue(bankCountry, map.bankCountry || '');
      }
    };

    bind(bankCountry, () => setSelectValue(bankCountry, map.bankCountry || ''));
    bind(bankName, () => { ensureCountry(); typeIfEmpty(bankName, map.bankName || ''); });
    bind(bankCity, () => { ensureCountry(); typeIfEmpty(bankCity, map.bankCity || ''); });
    bind(swiftCode, () => { ensureCountry(); typeIfEmpty(swiftCode, map.swiftCode || ''); });
    bind(accountNumber, () => { ensureCountry(); typeIfEmpty(accountNumber, map.accountNumber || ''); });
    bind(accountNicknameSwift, () => { ensureCountry(); typeIfEmpty(accountNicknameSwift, map.accountNicknameSwift || ''); });
  };

  const initAccountDeclarationModalDemo = () => {
    const modal = document.getElementById('accountDeclarationModal');
    if (!modal) return;
    const map = DEMO.accountDeclarationModal || {};

    const accountUsedFor = modal.querySelector('#accountUsedFor');
    const declarationPurpose = modal.querySelector('#declarationPurpose');
    const avgTransactions = modal.querySelector('#avgTransactions');
    const avgVolume = modal.querySelector('#avgVolume');

    bind(accountUsedFor, () => setSelectValue(accountUsedFor, map.accountUsedFor || ''));
    bind(declarationPurpose, () => setSelectValue(declarationPurpose, map.declarationPurpose || ''));

    // These fields are enhanced by keydown handlers; type digits via key events for best effect.
    bind(avgTransactions, () => typeDigitsIntoEnhancedField(avgTransactions, map.avgTransactionsDigits || ''));
    bind(avgVolume, () => typeDigitsIntoEnhancedField(avgVolume, map.avgVolumeDigits || ''));
  };

  // Wire individual fields: on "press" (focus/click), fill with fixed demo values
  const companyName = document.getElementById('companyName');
  const regDate = document.getElementById('regDate');
  const regNum = document.getElementById('regNum');
  const operationCountry = document.getElementById('operationCountry');
  const email = document.getElementById('email');
  const accountHolderName = document.getElementById('accountHolderName');

  const bind = (el, fn) => {
    if (!el) return;
    if (el.dataset.autofillBound === '1') return;
    el.dataset.autofillBound = '1';
    el.addEventListener('focus', fn, { passive: true });
    el.addEventListener('click', fn, { passive: true });
  };

  bind(companyName, () => typeIfEmpty(companyName, DEMO.companyName));
  bind(regDate, () => typeIfEmpty(regDate, DEMO.regDate));
  bind(regNum, () => typeIfEmpty(regNum, DEMO.regNum));
  // For selects: don't prefill; just promote the demo value to the top for easy selection in videos.
  bind(operationCountry, () => promoteSelectOption(operationCountry, DEMO.operationCountry));
  bind(email, () => typeIfEmpty(email, DEMO.email));

  // Prepare modal bindings (safe even if modal never opens)
  initBusinessAddressModalDemo();
  initBankDetailsModalDemo();
  initAccountDeclarationModalDemo();

  // Step 2: Account holder name
  bind(accountHolderName, () => typeIfEmpty(accountHolderName, DEMO.accountHolderName));

  // Registered address is readonly; bind the wrapper/button so a tap fills it.
  const businessAddressWrapper = document.getElementById('businessAddressWrapper');
  const businessAddressBtn = document.getElementById('businessAddressBtn');
  [businessAddressWrapper, businessAddressBtn].forEach((el) => {
    if (!el) return;
    if (el.dataset.autofillBound === '1') return;
    el.dataset.autofillBound = '1';
    el.addEventListener('click', (e) => {
      // Don’t block existing modal behavior; just prefill before it opens.
      fillBusinessAddress();
    });
  });
})();

// Add Bank: dev tools (Fill / Clear) in build-badge
(function initAddBankDevTools() {
  const root = document.querySelector('main.page--addbank');
  if (!root) return;
  const fillBtn = document.getElementById('ab-fill');
  const clearBtn = document.getElementById('ab-clear');
  if (!fillBtn || !clearBtn) return;

  // Get current active step
  const getCurrentStep = () => {
    const step1Form = document.getElementById('step1-form');
    const step2Form = document.getElementById('step2-form');
    if (step1Form && !step1Form.hasAttribute('hidden') && step1Form.style.display !== 'none') {
      return 1;
    }
    if (step2Form && !step2Form.hasAttribute('hidden') && step2Form.style.display !== 'none') {
      return 2;
    }
    return 1; // Default to step 1
  };

  // Get step 1 fields
  const getStep1Fields = () => ({
    companyName: document.getElementById('companyName'),
    regDate: document.getElementById('regDate'),
    regNum: document.getElementById('regNum'),
    businessAddress: document.getElementById('businessAddress'),
    operationCountry: document.getElementById('operationCountry'),
    email: document.getElementById('email'),
  });

  // Get step 2 fields
  const getStep2Fields = () => ({
    accountHolderName: document.getElementById('accountHolderName'),
    bankDetails: document.getElementById('bankDetails'),
    accountDeclaration: document.getElementById('accountDeclaration'),
  });

  const trigger = (el) => {
    if (!el) return;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  fillBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const currentStep = getCurrentStep();
    const demo = (typeof window !== 'undefined' && window.__ADD_BANK_DEMO) ? window.__ADD_BANK_DEMO : null;
    
    if (currentStep === 1) {
      // Fill step 1 fields
      const f = getStep1Fields();
      if (f.companyName) f.companyName.value = (demo && demo.companyName) || 'Delta Electronics, Inc.';
      if (f.regDate) f.regDate.value = (demo && demo.regDate) || '10/09/2000';
      if (f.regNum) f.regNum.value = (demo && demo.regNum) || '0606976';
      if (f.businessAddress) {
        f.businessAddress.value = (demo && demo.businessAddress) || 'Asia Square Tower 2, 12 Marina View, #10-23, Singapore, 018961, Singapore';
        // Update icon after setting value
        const businessAddressIcon = document.getElementById('businessAddressIcon');
        if (businessAddressIcon) businessAddressIcon.src = 'assets/icon_edit.svg';
      }
      if (f.operationCountry) f.operationCountry.value = (demo && demo.operationCountry) || 'Singapore';
      if (f.email) f.email.value = (demo && demo.email) || 'thebest@abc.com';
      Object.values(f).forEach(trigger);
      
      // Also fill modal fields
      const modal = document.getElementById('businessAddressModal');
      if (modal) {
        const map = (demo && demo.businessAddressModal) ? demo.businessAddressModal : {};
        const addressCountry = modal.querySelector('#addressCountry');
        const addressState = modal.querySelector('#addressState');
        const addressCity = modal.querySelector('#addressCity');
        const addressLine1 = modal.querySelector('#addressLine1');
        const addressLine2 = modal.querySelector('#addressLine2');
        const addressPostal = modal.querySelector('#addressPostal');
        
        if (addressCountry) addressCountry.value = map.addressCountry || 'Singapore';
        if (addressState) addressState.value = map.addressState || '';
        if (addressCity) addressCity.value = map.addressCity || 'Singapore';
        if (addressLine1) addressLine1.value = map.addressLine1 || 'Asia Square Tower 2, 12 Marina View, #10-23';
        if (addressLine2) addressLine2.value = map.addressLine2 || '';
        if (addressPostal) addressPostal.value = map.addressPostal || '018961';
        
        // Trigger change events to update is-filled classes and validate
        [addressCountry, addressState, addressCity, addressLine1, addressLine2, addressPostal].forEach((el) => {
          if (el) {
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
        
        // Trigger validation for save button after a short delay to ensure events have fired
        setTimeout(() => {
          if (typeof window.updateBusinessAddressSaveButton === 'function') {
            window.updateBusinessAddressSaveButton();
          }
        }, 10);
      }
    } else if (currentStep === 2) {
      // Fill step 2 fields
      const f = getStep2Fields();
      if (f.accountHolderName) f.accountHolderName.value = (demo && demo.accountHolderName) || 'Delta Electronics, Inc.';
      Object.values(f).forEach(trigger);
      
      // Fill bank details modal fields and trigger save
      const bankDetailsModal = document.getElementById('bankDetailsModal');
      if (bankDetailsModal) {
        const map = (demo && demo.bankDetailsModal) ? demo.bankDetailsModal : {};
        const bankCountry = bankDetailsModal.querySelector('#bankCountry');
        const bankName = bankDetailsModal.querySelector('#bankName');
        const bankCity = bankDetailsModal.querySelector('#bankCity');
        const swiftCode = bankDetailsModal.querySelector('#swiftCode');
        const accountNumber = bankDetailsModal.querySelector('#accountNumber');
        const accountNicknameSwift = bankDetailsModal.querySelector('#accountNicknameSwift');
        const ibanNumber = bankDetailsModal.querySelector('#ibanNumber');
        const accountNickname = bankDetailsModal.querySelector('#accountNickname');
        
        // Fill with SWIFT/BIC example (demo map)
        if (bankCountry) {
          bankCountry.value = map.bankCountry || 'Singapore';
          // Trigger change first to update field visibility
          bankCountry.dispatchEvent(new Event('change', { bubbles: true }));
        }
        
        // Wait a bit for field visibility to update, then fill other fields
        setTimeout(() => {
          if (bankName) bankName.value = map.bankName || 'CIMB';
          if (bankCity) bankCity.value = map.bankCity || 'Singapore';
          if (swiftCode) swiftCode.value = map.swiftCode || 'CIBBSGSG';
          if (accountNumber) accountNumber.value = map.accountNumber || '03543546458';
          if (accountNicknameSwift) accountNicknameSwift.value = map.accountNicknameSwift || 'Delta electronics - CIMB';
          
          // Trigger change events for all fields
          [bankName, bankCity, swiftCode, accountNumber, accountNicknameSwift, ibanNumber, accountNickname].forEach((el) => {
            if (el) {
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          });
          
          // Trigger save to update filled state UI
          setTimeout(() => {
            const saveBtn = document.getElementById('saveBankDetails');
            if (saveBtn && !saveBtn.disabled) {
              saveBtn.click();
            }
          }, 50);
        }, 50);
      }
      
      // Fill account declaration modal fields and trigger save
      const accountDeclarationModal = document.getElementById('accountDeclarationModal');
      if (accountDeclarationModal) {
        const map = (demo && demo.accountDeclarationModal) ? demo.accountDeclarationModal : {};
        const accountUsedFor = accountDeclarationModal.querySelector('#accountUsedFor');
        const declarationPurpose = accountDeclarationModal.querySelector('#declarationPurpose');
        const avgTransactions = accountDeclarationModal.querySelector('#avgTransactions');
        const avgVolume = accountDeclarationModal.querySelector('#avgVolume');
        
        if (accountUsedFor) accountUsedFor.value = map.accountUsedFor || 'incoming';
        if (declarationPurpose) declarationPurpose.value = map.declarationPurpose || 'Payments';
        if (avgTransactions) avgTransactions.value = map.avgTransactionsDigits || '2';
        if (avgVolume) avgVolume.value = map.avgVolumeDigits || '100000';
        
        // Trigger change events so validation and filled-state update
        [accountUsedFor, declarationPurpose, avgTransactions, avgVolume].forEach((el) => {
          if (el) {
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
        
        // Trigger save to update filled state UI
        setTimeout(() => {
          const saveBtn = document.getElementById('saveAccountDeclaration');
          if (saveBtn && !saveBtn.disabled) {
            saveBtn.click();
          }
        }, 100);
      }
      
      // Fill upload
      setTimeout(() => {
        if (typeof window.setBankProofUploaded === 'function') {
          window.setBankProofUploaded((demo && demo.bankProofFileName) || 'bank-statement.pdf');
        }
      }, 150);
    }
  });

  clearBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const currentStep = getCurrentStep();
    
    if (currentStep === 1) {
      // Clear step 1 fields
      const f = getStep1Fields();
      Object.values(f).forEach((el) => { if (el) el.value = ''; trigger(el); });
      // Also clear business address and reset icon
      const businessAddress = document.getElementById('businessAddress');
      const businessAddressIcon = document.getElementById('businessAddressIcon');
      if (businessAddress) businessAddress.value = '';
      if (businessAddressIcon) businessAddressIcon.src = 'assets/icon_add.svg';
      
      // Also clear modal fields
      const modal = document.getElementById('businessAddressModal');
      if (modal) {
        const addressCountry = modal.querySelector('#addressCountry');
        const addressState = modal.querySelector('#addressState');
        const addressCity = modal.querySelector('#addressCity');
        const addressLine1 = modal.querySelector('#addressLine1');
        const addressLine2 = modal.querySelector('#addressLine2');
        const addressPostal = modal.querySelector('#addressPostal');
        
        if (addressCountry) addressCountry.value = '';
        if (addressState) addressState.value = '';
        if (addressCity) addressCity.value = '';
        if (addressLine1) addressLine1.value = '';
        if (addressLine2) addressLine2.value = '';
        if (addressPostal) addressPostal.value = '';
        
        // Trigger change events to update is-filled classes and validate
        [addressCountry, addressState, addressCity, addressLine1, addressLine2, addressPostal].forEach((el) => {
          if (el) {
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
        
        // Trigger validation for save button after a short delay to ensure events have fired
        setTimeout(() => {
          if (typeof window.updateBusinessAddressSaveButton === 'function') {
            window.updateBusinessAddressSaveButton();
          }
        }, 10);
      }
    } else if (currentStep === 2) {
      // Clear step 2 fields
      const f = getStep2Fields();
      Object.values(f).forEach((el) => { if (el) el.value = ''; trigger(el); });
      
      // Clear bank details filled state UI
      const bankDetailsDisplay = document.getElementById('bankDetailsDisplay');
      const bankDetailsEmpty = document.getElementById('bankDetailsEmpty');
      if (bankDetailsDisplay) bankDetailsDisplay.style.display = 'none';
      if (bankDetailsEmpty) bankDetailsEmpty.style.display = 'flex';
      
      // Clear account declaration filled state UI
      const accountDeclarationDisplay = document.getElementById('accountDeclarationDisplay');
      const accountDeclarationEmpty = document.getElementById('accountDeclarationEmpty');
      if (accountDeclarationDisplay) accountDeclarationDisplay.style.display = 'none';
      if (accountDeclarationEmpty) accountDeclarationEmpty.style.display = 'flex';
      
      // Also clear bank details modal fields
      const bankDetailsModal = document.getElementById('bankDetailsModal');
      if (bankDetailsModal) {
        const bankCountry = bankDetailsModal.querySelector('#bankCountry');
        const bankName = bankDetailsModal.querySelector('#bankName');
        const bankCity = bankDetailsModal.querySelector('#bankCity');
        const swiftCode = bankDetailsModal.querySelector('#swiftCode');
        const accountNumber = bankDetailsModal.querySelector('#accountNumber');
        const accountNicknameSwift = bankDetailsModal.querySelector('#accountNicknameSwift');
        const ibanNumber = bankDetailsModal.querySelector('#ibanNumber');
        const accountNickname = bankDetailsModal.querySelector('#accountNickname');
        
        // Reset country to default (Singapore) to match the modal default selection
        if (bankCountry) {
          bankCountry.value = 'Singapore';
          bankCountry.dispatchEvent(new Event('change', { bubbles: true }));
        }
        
        // Clear other fields
        if (bankName) bankName.value = '';
        if (bankCity) bankCity.value = '';
        if (swiftCode) swiftCode.value = '';
        if (accountNumber) accountNumber.value = '';
        if (accountNicknameSwift) accountNicknameSwift.value = '';
        if (ibanNumber) ibanNumber.value = '';
        if (accountNickname) accountNickname.value = '';
        
        // Trigger change events for all fields
        [bankName, bankCity, swiftCode, accountNumber, accountNicknameSwift, ibanNumber, accountNickname].forEach((el) => {
          if (el) {
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      }
      
      // Also clear account declaration modal fields
      const accountDeclarationModal = document.getElementById('accountDeclarationModal');
      if (accountDeclarationModal) {
        const accountUsedFor = accountDeclarationModal.querySelector('#accountUsedFor');
        const declarationPurpose = accountDeclarationModal.querySelector('#declarationPurpose');
        const avgTransactions = accountDeclarationModal.querySelector('#avgTransactions');
        const avgVolume = accountDeclarationModal.querySelector('#avgVolume');
        
        if (accountUsedFor) accountUsedFor.value = '';
        if (declarationPurpose) declarationPurpose.value = 'Remittance';
        if (avgTransactions) avgTransactions.value = '';
        if (avgVolume) avgVolume.value = '';
        
        // Trigger change events
        [accountUsedFor, declarationPurpose, avgTransactions, avgVolume].forEach((el) => {
          if (el) {
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      }
      
      // Clear upload
      if (typeof window.setBankProofNotUploaded === 'function') {
        window.setBankProofNotUploaded();
      }
    }
  });
})();

// Track entrypoint for add-bank page (index, select-counterparty, settings)
(function initAddBankEntrypointTracking() {
  try {
    var links = document.querySelectorAll('a[href="add-bank.html"], a[href="add-bank.html"]');
    if (!links.length) return;
    links.forEach(function (link) {
      link.addEventListener('click', function () {
        try {
          if (!window.sessionStorage) return;
          var from = (window.location.pathname || '').toLowerCase();
          var name = 'index';
          if (from.indexOf('settings.html') !== -1) name = 'settings';
          else if (from.indexOf('select-counterparty.html') !== -1) name = 'select-counterparty';
          else if (from.indexOf('index.html') !== -1) name = 'index';
          window.sessionStorage.setItem(ADD_BANK_RETURN_KEY, name);
        } catch (_) {}
      }, { capture: true });
    });
  } catch (_) {}
})();

// Add Bank: Bank details modal handler
(function initBankDetailsModal() {
  const root = document.querySelector('main.page--addbank');
  if (!root) return;
  
  const bankDetailsInput = document.getElementById('bankDetails');
  const bankDetailsBtn = document.getElementById('bankDetailsBtn');
  const bankDetailsIcon = document.getElementById('bankDetailsIcon');
  const bankDetailsWrapper = document.getElementById('bankDetailsWrapper');
  const bankDetailsDisplay = document.getElementById('bankDetailsDisplay');
  const bankDetailsEmpty = document.getElementById('bankDetailsEmpty');
  const bankDetailsTitle = document.getElementById('bankDetailsTitle');
  const bankDetailsDetails = document.getElementById('bankDetailsDetails');
  const modal = document.getElementById('bankDetailsModal');
  
  if (!bankDetailsInput || !bankDetailsWrapper || !modal) return;
  
  // Store bank details data
  let bankDetailsData = null;
  
  // Countries that use IBAN (European countries and some others)
  const IBAN_COUNTRIES = [
    'Albania', 'Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Czech Republic',
    'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary',
    'Iceland', 'Ireland', 'Italy', 'Latvia', 'Liechtenstein', 'Lithuania',
    'Luxembourg', 'Malta', 'Netherlands', 'Norway', 'Poland', 'Portugal',
    'Romania', 'Slovakia', 'Slovenia', 'Spain', 'Sweden', 'Switzerland',
    'United Kingdom'
  ];
  
  // Get country type (IBAN or SWIFT)
  const getCountryType = (country) => {
    if (!country) return null;
    return IBAN_COUNTRIES.includes(country) ? 'IBAN' : 'SWIFT';
  };
  
  // Show/hide fields based on country selection
  const updateFieldsVisibility = () => {
    const bankCountry = document.getElementById('bankCountry')?.value || '';
    const countryType = getCountryType(bankCountry);
    const swiftFields = document.getElementById('swiftFields');
    const ibanFields = document.getElementById('ibanFields');
    const swiftNicknameRow = document.getElementById('swiftNicknameRow');
    
    if (!swiftFields || !ibanFields || !swiftNicknameRow) return;
    
    if (!bankCountry || bankCountry === '') {
      // Default to SWIFT fields (e.g. Taiwan-style) even when country is not selected
      // This makes the modal feel less "empty" while keeping the dropdown unselected.
      swiftFields.style.display = 'grid';
      ibanFields.style.display = 'none';
      swiftNicknameRow.style.display = 'grid';
    } else if (countryType === 'IBAN') {
      // Show IBAN fields
      swiftFields.style.display = 'none';
      ibanFields.style.display = 'grid';
      swiftNicknameRow.style.display = 'none';
    } else {
      // Show SWIFT/BIC fields
      swiftFields.style.display = 'grid';
      ibanFields.style.display = 'none';
      swiftNicknameRow.style.display = 'grid';
    }
  };
  
  // Format bank details from modal fields
  const formatBankDetails = (data) => {
    bankDetailsData = data;
    const parts = [];
    if (data.bankName) parts.push(data.bankName);
    
    const countryType = getCountryType(data.bankCountry);
    if (countryType === 'IBAN') {
      if (data.ibanNumber) parts.push(`IBAN: ${data.ibanNumber}`);
    } else {
      if (data.accountNumber) parts.push(`Account: ${data.accountNumber}`);
      if (data.swiftCode) parts.push(`SWIFT: ${data.swiftCode}`);
    }
    
    if (data.bankCity && data.bankCountry) {
      parts.push(`${data.bankCity}, ${data.bankCountry}`);
    }
    return parts.join(' • ') || '';
  };
  
  // Render filled state UI
  const renderFilledState = () => {
    if (!bankDetailsData) return;
    
    const countryType = getCountryType(bankDetailsData.bankCountry);
    const nickname = countryType === 'IBAN' 
      ? (bankDetailsData.accountNickname || bankDetailsData.bankName || 'Bank Account')
      : (bankDetailsData.accountNicknameSwift || bankDetailsData.bankName || 'Bank Account');
    
    const title = nickname;
    const details = [];
    if (bankDetailsData.bankName) details.push(`Bank: ${bankDetailsData.bankName}`);
    if (bankDetailsData.bankCountry) details.push(`Country : ${bankDetailsData.bankCountry}`);
    if (bankDetailsData.bankCity) details.push(`City: ${bankDetailsData.bankCity}`);
    
    if (countryType === 'IBAN') {
      if (bankDetailsData.ibanNumber) details.push(`IBAN : ${bankDetailsData.ibanNumber}`);
    } else {
      if (bankDetailsData.swiftCode) details.push(`SWIFT : ${bankDetailsData.swiftCode}`);
      if (bankDetailsData.accountNumber) details.push(`Account number : ${bankDetailsData.accountNumber}`);
    }
    
    if (bankDetailsTitle) bankDetailsTitle.textContent = title;
    if (bankDetailsDetails) {
      bankDetailsDetails.innerHTML = details.map(d => `<p style="margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${d}</p>`).join('');
    }
    
    if (bankDetailsDisplay) bankDetailsDisplay.style.display = 'flex';
    if (bankDetailsEmpty) bankDetailsEmpty.style.display = 'none';
    if (bankDetailsInput) bankDetailsInput.value = formatBankDetails(bankDetailsData);
  };
  
  // Render empty state UI
  const renderEmptyState = () => {
    bankDetailsData = null;
    if (bankDetailsDisplay) bankDetailsDisplay.style.display = 'none';
    if (bankDetailsEmpty) bankDetailsEmpty.style.display = 'flex';
    if (bankDetailsInput) bankDetailsInput.value = '';
  };
  
  // Open modal
  const openModal = () => {
    modal.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('modal-open');
    document.body.classList.add('modal-open');
    try {
      const y = window.scrollY || window.pageYOffset || 0;
      document.body.dataset.scrollY = String(y);
      document.body.style.top = `-${y}px`;
      document.body.classList.add('modal-locked');
    } catch (_) {}
    // Ensure field visibility is updated when modal opens (e.g., if Singapore is default)
    updateFieldsVisibility();
    updateSaveButton();
  };
  
  // Close modal
  const closeModal = () => {
    modal.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('modal-open');
    document.body.classList.remove('modal-open');
    try {
      const y = parseInt(document.body.dataset.scrollY || '0', 10) || 0;
      document.body.classList.remove('modal-locked');
      document.body.style.top = '';
      delete document.body.dataset.scrollY;
      window.scrollTo(0, y);
    } catch (_) {}
  };
  
  // Save bank details
  const saveBankDetails = () => {
    const bankCountry = document.getElementById('bankCountry')?.value || '';
    const bankName = document.getElementById('bankName')?.value || '';
    const bankCity = document.getElementById('bankCity')?.value || '';
    const countryType = getCountryType(bankCountry);
    
    let data = { bankCountry, bankName, bankCity };
    
    if (countryType === 'IBAN') {
      const ibanNumber = document.getElementById('ibanNumber')?.value || '';
      const accountNickname = document.getElementById('accountNickname')?.value || '';
      
      // Validate required fields for IBAN
      if (!bankCountry || !bankName || !ibanNumber) {
        return;
      }
      
      data.ibanNumber = ibanNumber;
      data.accountNickname = accountNickname;
    } else {
      const swiftCode = document.getElementById('swiftCode')?.value || '';
      const accountNumber = document.getElementById('accountNumber')?.value || '';
      const accountNicknameSwift = document.getElementById('accountNicknameSwift')?.value || '';
      
      // Validate required fields for SWIFT/BIC
      if (!bankCountry || !bankName || !accountNumber) {
        return;
      }
      
      data.swiftCode = swiftCode;
      data.accountNumber = accountNumber;
      data.accountNicknameSwift = accountNicknameSwift;
    }
    
    // Format and set bank details
    formatBankDetails(data);
    renderFilledState();
    
    // Trigger change event
    bankDetailsInput.dispatchEvent(new Event('input', { bubbles: true }));
    bankDetailsInput.dispatchEvent(new Event('change', { bubbles: true }));
    
    closeModal();
  };
  
  // Event listeners
  if (bankDetailsBtn) {
    bankDetailsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openModal();
    });
  }
  
  if (bankDetailsWrapper) {
    bankDetailsWrapper.style.cursor = 'pointer';
    bankDetailsWrapper.addEventListener('click', (e) => {
      // Don't open if clicking the edit icon (it has its own handler)
      if (e.target === bankDetailsBtn || e.target.closest('#bankDetailsBtn')) {
        return;
      }
      // Open modal when clicking anywhere on the wrapper, display, or empty state
      if (e.target === bankDetailsWrapper || 
          e.target.closest('.clickable-input__empty') || 
          e.target.closest('.clickable-input__display') ||
          e.target.closest('.clickable-input__display-content')) {
        openModal();
      }
    });
  }
  
  // Also make the display content clickable
  if (bankDetailsDisplay) {
    bankDetailsDisplay.style.cursor = 'pointer';
    bankDetailsDisplay.addEventListener('click', (e) => {
      // Don't open if clicking the edit icon (it has its own handler)
      if (e.target === bankDetailsBtn || e.target.closest('#bankDetailsBtn')) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      openModal();
    });
  }
  
  // Initialize state
  if (bankDetailsInput.value && bankDetailsInput.value.trim()) {
    // If there's existing data, try to parse it (for Fill/Clear)
    renderFilledState();
  } else {
    renderEmptyState();
  }
  
  // Validation function
  const validateBankDetailsForm = () => {
    const bankCountry = document.getElementById('bankCountry')?.value || '';
    const bankName = document.getElementById('bankName')?.value || '';
    
    if (!bankCountry || bankCountry.trim() === '' || !bankName || bankName.trim() === '') {
      return false;
    }
    
    const countryType = getCountryType(bankCountry);
    
    if (countryType === 'IBAN') {
      const ibanNumber = document.getElementById('ibanNumber')?.value || '';
      return ibanNumber && ibanNumber.trim() !== '';
    } else {
      const accountNumber = document.getElementById('accountNumber')?.value || '';
      return accountNumber && accountNumber.trim() !== '';
    }
  };
  
  // Update save button state
  const updateSaveButton = () => {
    const saveBtn = document.getElementById('saveBankDetails');
    if (!saveBtn) return;
    const isValid = validateBankDetailsForm();
    saveBtn.disabled = !isValid;
    saveBtn.setAttribute('aria-disabled', String(!isValid));
  };
  
  // Save button
  const saveBtn = document.getElementById('saveBankDetails');
  if (saveBtn) {
    // Initially disable
    saveBtn.disabled = true;
    saveBtn.setAttribute('aria-disabled', 'true');
    
    saveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!validateBankDetailsForm()) return;
      saveBankDetails();
    });
    
    // Add validation listeners to all relevant fields
    const allFields = ['bankCountry', 'bankName', 'bankCity', 'swiftCode', 'accountNumber', 'ibanNumber', 'accountNickname', 'accountNicknameSwift'];
    allFields.forEach((fieldId) => {
      const field = document.getElementById(fieldId);
      if (field) {
        field.addEventListener('input', () => {
          updateFieldsVisibility();
          updateSaveButton();
        });
        field.addEventListener('change', () => {
          updateFieldsVisibility();
          updateSaveButton();
        });
      }
    });
    
    // Watch for country changes specifically
    const bankCountryField = document.getElementById('bankCountry');
    if (bankCountryField) {
      bankCountryField.addEventListener('change', () => {
        updateFieldsVisibility();
        updateSaveButton();
        // Clear fields when country changes
        const swiftCode = document.getElementById('swiftCode');
        const accountNumber = document.getElementById('accountNumber');
        const ibanNumber = document.getElementById('ibanNumber');
        if (swiftCode) swiftCode.value = '';
        if (accountNumber) accountNumber.value = '';
        if (ibanNumber) ibanNumber.value = '';
      });
    }
    
    // Initial validation and field visibility
    updateFieldsVisibility();
    updateSaveButton();
  }
  
  // Close button handlers
  modal.querySelectorAll('[data-modal-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal());
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  
  // Toggle is-filled class on modal inputs and selects when they have values
  const toggleFilled = (el) => {
    if (!el) return;
    if (el.tagName === 'SELECT') {
      const hasValue = el.value && el.value !== '';
      el.classList.toggle('is-filled', hasValue);
    } else {
      el.classList.toggle('is-filled', el.value && el.value.trim() !== '');
    }
  };
  
  // Get all inputs and selects in the modal
  const modalInputs = modal.querySelectorAll('input[type="text"], input[type="number"], select');
  modalInputs.forEach((input) => {
    toggleFilled(input);
    const updateField = () => {
      toggleFilled(input);
      updateFieldsVisibility();
      updateSaveButton();
    };
    input.addEventListener('input', updateField);
    input.addEventListener('change', updateField);
  });
})();

// Add Bank: Account declaration modal handler
(function initAccountDeclarationModal() {
  const root = document.querySelector('main.page--addbank');
  if (!root) return;
  
  const accountDeclarationInput = document.getElementById('accountDeclaration');
  const accountDeclarationBtn = document.getElementById('accountDeclarationBtn');
  const accountDeclarationIcon = document.getElementById('accountDeclarationIcon');
  const accountDeclarationWrapper = document.getElementById('accountDeclarationWrapper');
  const accountDeclarationDisplay = document.getElementById('accountDeclarationDisplay');
  const accountDeclarationEmpty = document.getElementById('accountDeclarationEmpty');
  const accountDeclarationTitle = document.getElementById('accountDeclarationTitle');
  const accountDeclarationDetails = document.getElementById('accountDeclarationDetails');
  const modal = document.getElementById('accountDeclarationModal');
  
  if (!accountDeclarationInput || !accountDeclarationWrapper || !modal) return;
  
  // Store account declaration data
  let accountDeclarationData = null;
  
  // Map account used for values to display text
  const getAccountUsedForText = (value) => {
    const map = {
      'incoming': 'Send payments to this account',
      'outgoing': 'Receive payments from this account',
      'both': 'Both send and receive payments'
    };
    return map[value] || value;
  };
  
  // Format account declaration from modal fields
  const formatAccountDeclaration = (data) => {
    accountDeclarationData = data;
    const parts = [];
    if (data.accountUsedFor) parts.push(`Used for: ${getAccountUsedForText(data.accountUsedFor)}`);
    if (data.purpose) parts.push(`Purpose: ${data.purpose}`);
    if (data.avgTransactions) parts.push(`Avg transactions: ${data.avgTransactions}/month`);
    if (data.avgVolume) parts.push(`Avg volume: ${data.avgVolume} USD/month`);
    return parts.join(' • ') || '';
  };
  
  // Render filled state UI
  const renderFilledState = () => {
    if (!accountDeclarationData) return;
    
    const title = getAccountUsedForText(accountDeclarationData.accountUsedFor) || 'Account Declaration';
    const details = [];
    if (accountDeclarationData.purpose) details.push(accountDeclarationData.purpose);
    if (accountDeclarationData.avgTransactions) details.push(`${accountDeclarationData.avgTransactions} Transactions / month`);
    if (accountDeclarationData.avgVolume) {
      const volumeNum = parseFloat(accountDeclarationData.avgVolume);
      if (!isNaN(volumeNum)) {
        details.push(`${volumeNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD / month`);
      }
    }
    
    if (accountDeclarationTitle) accountDeclarationTitle.textContent = title;
    if (accountDeclarationDetails) {
      accountDeclarationDetails.innerHTML = details.map(d => `<p style="margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${d}</p>`).join('');
    }
    
    if (accountDeclarationDisplay) accountDeclarationDisplay.style.display = 'flex';
    if (accountDeclarationEmpty) accountDeclarationEmpty.style.display = 'none';
    if (accountDeclarationInput) accountDeclarationInput.value = formatAccountDeclaration(accountDeclarationData);
  };
  
  // Render empty state UI
  const renderEmptyState = () => {
    accountDeclarationData = null;
    if (accountDeclarationDisplay) accountDeclarationDisplay.style.display = 'none';
    if (accountDeclarationEmpty) accountDeclarationEmpty.style.display = 'flex';
    if (accountDeclarationInput) accountDeclarationInput.value = '';
  };
  
  // Format number with thousand separators and .00 decimals
  const formatNumber = (value) => {
    if (!value || value === '') return '';
    const cleaned = value.toString().replace(/[^\d]/g, '');
    if (!cleaned) return '';
    const num = parseInt(cleaned, 10);
    if (isNaN(num)) return '';
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };
  
  // Parse formatted number for storage/validation:
  // - remove thousands separators
  // - ignore any decimal part and keep only the integer portion
  const parseNumber = (value) => {
    if (!value || value === '') return '';
    const normalized = value.toString().replace(/,/g, '');
    const dotIndex = normalized.indexOf('.');
    const integerPart = dotIndex >= 0 ? normalized.slice(0, dotIndex) : normalized;
    return integerPart.replace(/[^\d]/g, '');
  };
  
  // Live thousand-separator formatting directly in the avgVolume input
  const setupAvgVolumeFormatting = () => {
    const field = document.getElementById('avgVolume');
    if (!field) return;
    if (field.dataset.enhanced === 'true') return;
    field.dataset.enhanced = 'true';
  
    let rawDigits = parseNumber(field.value); // underlying integer value as string
  
    const render = () => {
      if (!rawDigits) {
        field.value = '';
        toggleFilled(field);
        updateSaveButton();
        return;
      }
      const formatted = formatNumber(rawDigits);
      field.value = formatted;
  
      // Place caret just before the decimal point
      const dotIndex = formatted.indexOf('.');
      const caretPos = dotIndex >= 0 ? dotIndex : formatted.length;
      requestAnimationFrame(() => {
        field.setSelectionRange(caretPos, caretPos);
      });
  
      toggleFilled(field);
      updateSaveButton();
    };
  
    const insertDigit = (digit) => {
      rawDigits = (rawDigits || '') + digit;
      render();
    };
  
    const backspaceDigit = () => {
      if (!rawDigits) return;
      rawDigits = rawDigits.slice(0, -1);
      render();
    };
  
    // Handle keydown to fully control the value
    field.addEventListener('keydown', (e) => {
      const { key } = e;
  
      // Allow navigation keys / tab / escape
      if (['Tab', 'Escape', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) {
        return;
      }
  
      // Digits
      if (/^\d$/.test(key)) {
        e.preventDefault();
        insertDigit(key);
        return;
      }
  
      // Backspace
      if (key === 'Backspace') {
        e.preventDefault();
        backspaceDigit();
        return;
      }
  
      // Delete clears everything for simplicity
      if (key === 'Delete') {
        e.preventDefault();
        rawDigits = '';
        render();
        return;
      }
  
      // Block any other character (no minus, no letters, etc.)
      e.preventDefault();
    });
  
    // Keep formatting stable if any non-keyboard change happens
    field.addEventListener('input', () => {
      // Re-derive digits from current value for safety
      rawDigits = parseNumber(field.value);
      render();
    });
  
    // Initial render if there is a pre-filled value (e.g. from Fill shortcut)
    if (rawDigits) {
      render();
    }
  };

  // Live thousand-separator formatting for avgTransactions (integer only)
  const setupAvgTransactionsFormatting = () => {
    const field = document.getElementById('avgTransactions');
    if (!field) return;
    if (field.dataset.enhanced === 'true') return;
    field.dataset.enhanced = 'true';

    let rawDigits = parseNumber(field.value);

    const render = () => {
      if (!rawDigits) {
        field.value = '';
        toggleFilled(field);
        updateSaveButton();
        return;
      }
      const cleaned = rawDigits.replace(/[^\d]/g, '');
      const num = cleaned ? parseInt(cleaned, 10) : NaN;
      if (isNaN(num)) {
        field.value = '';
      } else {
        field.value = num.toLocaleString('en-US', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        });
      }
      toggleFilled(field);
      updateSaveButton();
    };

    const insertDigit = (digit) => {
      rawDigits = (rawDigits || '') + digit;
      render();
    };

    const backspaceDigit = () => {
      if (!rawDigits) return;
      rawDigits = rawDigits.slice(0, -1);
      render();
    };

    field.addEventListener('keydown', (e) => {
      const { key } = e;

      // Allow navigation keys / tab / escape
      if (['Tab', 'Escape', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) {
        return;
      }

      // Digits
      if (/^\d$/.test(key)) {
        e.preventDefault();
        insertDigit(key);
        return;
      }

      // Backspace
      if (key === 'Backspace') {
        e.preventDefault();
        backspaceDigit();
        return;
      }

      // Delete clears everything for simplicity
      if (key === 'Delete') {
        e.preventDefault();
        rawDigits = '';
        render();
        return;
      }

      // Block any other character
      e.preventDefault();
    });

    // Keep formatting stable if any non-keyboard change happens
    field.addEventListener('input', () => {
      // Re-derive digits from current value for safety
      rawDigits = parseNumber(field.value);
      render();
    });

    if (rawDigits) {
      render();
    }
  };
  
  // Open modal
  const openModal = () => {
    // Setup formatting for avgVolume and avgTransactions fields
    setupAvgVolumeFormatting();
    setupAvgTransactionsFormatting();
    
    // Populate fields if there's existing data
    if (accountDeclarationData) {
      const accountUsedForField = document.getElementById('accountUsedFor');
      const declarationPurposeField = document.getElementById('declarationPurpose');
      const avgTransactionsField = document.getElementById('avgTransactions');
      const avgVolumeField = document.getElementById('avgVolume');
      
      if (accountUsedForField) accountUsedForField.value = accountDeclarationData.accountUsedFor || '';
      if (declarationPurposeField) declarationPurposeField.value = accountDeclarationData.purpose || '';
      if (avgTransactionsField) avgTransactionsField.value = accountDeclarationData.avgTransactions || '';
      if (avgVolumeField && accountDeclarationData.avgVolume) {
        // Format the volume value when populating
        const volumeNum = parseFloat(accountDeclarationData.avgVolume);
        if (!isNaN(volumeNum)) {
          avgVolumeField.value = volumeNum.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          });
        } else {
          avgVolumeField.value = '';
        }
      }
      
      // Trigger filled state updates
      if (accountUsedForField) toggleFilled(accountUsedForField);
      if (declarationPurposeField) toggleFilled(declarationPurposeField);
      if (avgTransactionsField) toggleFilled(avgTransactionsField);
      if (avgVolumeField) toggleFilled(avgVolumeField);
      updateSaveButton();
    }
    
    modal.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('modal-open');
    document.body.classList.add('modal-open');
    try {
      const y = window.scrollY || window.pageYOffset || 0;
      document.body.dataset.scrollY = String(y);
      document.body.style.top = `-${y}px`;
      document.body.classList.add('modal-locked');
    } catch (_) {}
  };
  
  // Close modal
  const closeModal = () => {
    modal.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('modal-open');
    document.body.classList.remove('modal-open');
    try {
      const y = parseInt(document.body.dataset.scrollY || '0', 10) || 0;
      document.body.classList.remove('modal-locked');
      document.body.style.top = '';
      delete document.body.dataset.scrollY;
      window.scrollTo(0, y);
    } catch (_) {}
  };
  
  // Save account declaration
  const saveAccountDeclaration = () => {
    const accountUsedFor = document.getElementById('accountUsedFor')?.value || '';
    const purpose = document.getElementById('declarationPurpose')?.value || '';
    const avgTransactions = document.getElementById('avgTransactions')?.value || '';
    const avgVolumeField = document.getElementById('avgVolume');
    let avgVolume = '';
    if (avgVolumeField) {
      const raw = avgVolumeField.value || '';
      const normalized = raw.toString().replace(/,/g, '');
      const num = parseFloat(normalized);
      if (!isNaN(num)) {
        avgVolume = String(num);
      }
    }
    
    // Validate required fields
    if (!accountUsedFor || !purpose) {
      // In a real app, show validation errors
      return;
    }
    
    // Format and set account declaration (use numeric value for storage, formatted for display)
    formatAccountDeclaration({ accountUsedFor, purpose, avgTransactions, avgVolume });
    renderFilledState();
    
    // Trigger change event
    accountDeclarationInput.dispatchEvent(new Event('input', { bubbles: true }));
    accountDeclarationInput.dispatchEvent(new Event('change', { bubbles: true }));
    
    closeModal();
  };
  
  // Event listeners
  if (accountDeclarationBtn) {
    accountDeclarationBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openModal();
    });
  }
  
  if (accountDeclarationWrapper) {
    accountDeclarationWrapper.style.cursor = 'pointer';
    accountDeclarationWrapper.addEventListener('click', (e) => {
      // Don't open if clicking the edit icon (it has its own handler)
      if (e.target === accountDeclarationBtn || e.target.closest('#accountDeclarationBtn')) {
        return;
      }
      // Open modal when clicking anywhere on the wrapper, display, or empty state
      if (e.target === accountDeclarationWrapper || 
          e.target.closest('.clickable-input__empty') || 
          e.target.closest('.clickable-input__display') ||
          e.target.closest('.clickable-input__display-content')) {
        openModal();
      }
    });
  }
  
  // Also make the display content clickable
  if (accountDeclarationDisplay) {
    accountDeclarationDisplay.style.cursor = 'pointer';
    accountDeclarationDisplay.addEventListener('click', (e) => {
      // Don't open if clicking the edit icon (it has its own handler)
      if (e.target === accountDeclarationBtn || e.target.closest('#accountDeclarationBtn')) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      openModal();
    });
  }
  
  // Initialize state
  if (accountDeclarationInput.value && accountDeclarationInput.value.trim()) {
    // If there's existing data, try to parse it (for Fill/Clear)
    renderFilledState();
  } else {
    renderEmptyState();
  }
  
  // Validation function
  const validateAccountDeclarationForm = () => {
    const accountUsedFor = document.getElementById('accountUsedFor')?.value || '';
    const purpose = document.getElementById('declarationPurpose')?.value || '';
    return accountUsedFor && accountUsedFor.trim() !== '' &&
           purpose && purpose.trim() !== '';
  };
  
  // Update save button state
  const updateSaveButton = () => {
    const saveBtn = document.getElementById('saveAccountDeclaration');
    if (!saveBtn) return;
    const isValid = validateAccountDeclarationForm();
    saveBtn.disabled = !isValid;
    saveBtn.setAttribute('aria-disabled', String(!isValid));
  };
  
  // Save button
  const saveBtn = document.getElementById('saveAccountDeclaration');
  if (saveBtn) {
    // Initially disable
    saveBtn.disabled = true;
    saveBtn.setAttribute('aria-disabled', 'true');
    
    saveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!validateAccountDeclarationForm()) return;
      saveAccountDeclaration();
    });
    
    // Add validation listeners to required fields
    const requiredFields = ['accountUsedFor', 'declarationPurpose'];
    requiredFields.forEach((fieldId) => {
      const field = document.getElementById(fieldId);
      if (field) {
        field.addEventListener('input', updateSaveButton);
        field.addEventListener('change', updateSaveButton);
      }
    });
    
    // Initial validation
    updateSaveButton();
  }
  
  // Close button handlers
  modal.querySelectorAll('[data-modal-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal());
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  
  // Toggle is-filled class on modal inputs and selects when they have values
  const toggleFilled = (el) => {
    if (!el) return;
    if (el.tagName === 'SELECT') {
      const hasValue = el.value && el.value !== '';
      el.classList.toggle('is-filled', hasValue);
    } else {
      el.classList.toggle('is-filled', el.value && el.value.trim() !== '');
    }
  };
  
  // Get all inputs and selects in the modal (excluding avgVolume which has custom handler)
  const modalInputs = modal.querySelectorAll('input[type="text"]:not(#avgVolume), input[type="number"], select');
  modalInputs.forEach((input) => {
    toggleFilled(input);
    const updateField = () => {
      toggleFilled(input);
      updateSaveButton();
    };
    input.addEventListener('input', updateField);
    input.addEventListener('change', updateField);
  });
})();

// Add Bank: Bank proof upload handler
(function initBankProofUpload() {
  const root = document.querySelector('main.page--addbank');
  if (!root) return;
  
  const uploadArea = document.getElementById('bankProofUpload');
  const uploadEmpty = document.getElementById('bankProofUploadEmpty');
  const uploadFilled = document.getElementById('bankProofUploadFilled');
  const uploadBtn = document.getElementById('bankProofUploadBtn');
  const removeBtn = document.getElementById('bankProofRemoveBtn');
  const fileNameEl = document.getElementById('bankProofFileName');
  
  if (!uploadArea || !uploadEmpty || !uploadFilled || !uploadBtn || !removeBtn || !fileNameEl) return;
  
  let uploadedFileName = null;
  
  // Set uploaded state
  const setUploaded = (fileName = 'bank-statement.pdf') => {
    uploadedFileName = fileName;
    fileNameEl.textContent = fileName;
    uploadEmpty.style.display = 'none';
    uploadFilled.style.display = 'flex';
    
    // Trigger validation update
    const nextBtn = document.getElementById('ab-next-step2');
    if (nextBtn && typeof window.validateStep2Form === 'function') {
      window.validateStep2Form();
    }
  };
  
  // Set not uploaded state
  const setNotUploaded = () => {
    uploadedFileName = null;
    uploadEmpty.style.display = 'flex';
    uploadFilled.style.display = 'none';
    
    // Show snackbar
    if (typeof window.showSnackbar === 'function') {
      window.showSnackbar('File removed');
    } else {
      const el = document.createElement('div');
      el.className = 'snackbar snackbar--success';
      el.innerHTML = '<img class="snackbar__icon" src="assets/icon_snackbar_success.svg" alt=""/><span>File removed</span>';
      document.body.appendChild(el);
      requestAnimationFrame(() => el.classList.add('is-visible'));
      setTimeout(() => {
        el.classList.remove('is-visible');
        setTimeout(() => el.remove(), 250);
      }, 2000);
    }
    
    // Trigger validation update
    const nextBtn = document.getElementById('ab-next-step2');
    if (nextBtn && typeof window.validateStep2Form === 'function') {
      window.validateStep2Form();
    }
  };
  
  // Hidden file input used to open the system picker
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.jpg,.jpeg,.png,.pdf';
  fileInput.style.display = 'none';
  fileInput.setAttribute('aria-hidden', 'true');
  document.body.appendChild(fileInput);

  fileInput.addEventListener('change', () => {
    // No matter what the user selected, always show a fixed filename for video/demo
    setUploaded('bank-statement.pdf');
    // Reset so selecting the same file again still triggers change
    try { fileInput.value = ''; } catch (_) {}
  });

  // Upload button handler
  uploadBtn.addEventListener('click', (e) => {
    e.preventDefault();
    try { fileInput.click(); } catch (_) { setUploaded('bank-statement.pdf'); }
  });
  
  // Remove button handler
  removeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    setNotUploaded();
  });
  
  // Expose functions for Fill/Clear
  window.setBankProofUploaded = setUploaded;
  window.setBankProofNotUploaded = setNotUploaded;
  window.getBankProofUploaded = () => uploadedFileName;
})();

// Add Bank: Business address modal handler
(function initBusinessAddressModal() {
  const root = document.querySelector('main.page--addbank');
  if (!root) {
    console.log('Business address modal: page--addbank not found');
    return;
  }
  
  console.log('Business address modal: Initializing...');
  
  const businessAddressInput = document.getElementById('businessAddress');
  const businessAddressBtn = document.getElementById('businessAddressBtn');
  const businessAddressIcon = document.getElementById('businessAddressIcon');
  const businessAddressWrapper = document.getElementById('businessAddressWrapper');
  const modal = document.getElementById('businessAddressModal');
  
  // Debug: log which elements are missing
  if (!businessAddressInput) console.warn('businessAddressInput not found');
  if (!businessAddressBtn) console.warn('businessAddressBtn not found');
  if (!businessAddressIcon) console.warn('businessAddressIcon not found');
  if (!modal) console.warn('businessAddressModal not found');
  
  if (!businessAddressInput || !businessAddressBtn || !businessAddressIcon || !modal) {
    console.warn('Business address modal initialization failed - missing elements');
    return;
  }
  
  console.log('Business address modal: All elements found, setting up event listeners');
  
  // Format address from modal fields
  const formatAddress = (data) => {
    const parts = [];
    if (data.line1) parts.push(data.line1);
    if (data.line2) parts.push(data.line2);
    if (data.city) parts.push(data.city);
    if (data.state) parts.push(data.state);
    if (data.postal) parts.push(data.postal);
    if (data.country) parts.push(data.country);
    return parts.join(', ');
  };
  
  // Update icon based on field state
  const updateIcon = () => {
    if (businessAddressInput.value && businessAddressInput.value.trim()) {
      businessAddressIcon.src = 'assets/icon_edit.svg';
    } else {
      businessAddressIcon.src = 'assets/icon_add.svg';
    }
  };
  
  // Open modal
  const openModal = () => {
    console.log('openModal called, modal element:', modal);
    // Pre-fill modal if address exists
    const currentValue = businessAddressInput.value;
    if (currentValue) {
      // Try to parse existing address (simple approach - in real app would need better parsing)
      // For now, just clear and let user re-enter
    }
    console.log('Setting modal aria-hidden to false');
    modal.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('modal-open');
    document.body.classList.add('modal-open');
    console.log('Modal classes added, checking if modal is visible');
    try {
      const y = window.scrollY || window.pageYOffset || 0;
      document.body.dataset.scrollY = String(y);
      document.body.style.top = `-${y}px`;
      document.body.classList.add('modal-locked');
    } catch (_) {}
    console.log('Modal should now be visible. aria-hidden:', modal.getAttribute('aria-hidden'));
  };
  
  // Close modal
  const closeModal = () => {
    modal.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('modal-open');
    document.body.classList.remove('modal-open');
    try {
      const y = parseInt(document.body.dataset.scrollY || '0', 10) || 0;
      document.body.classList.remove('modal-locked');
      document.body.style.top = '';
      delete document.body.dataset.scrollY;
      window.scrollTo(0, y);
    } catch (_) {}
  };
  
  // Save address
  const saveAddress = () => {
    const country = document.getElementById('addressCountry')?.value || '';
    const state = document.getElementById('addressState')?.value || '';
    const city = document.getElementById('addressCity')?.value || '';
    const line1 = document.getElementById('addressLine1')?.value || '';
    const line2 = document.getElementById('addressLine2')?.value || '';
    const postal = document.getElementById('addressPostal')?.value || '';
    
    // Validate required fields
    if (!country || !city || !line1 || !postal) {
      // In a real app, show validation errors
      return;
    }
    
    // Format and set address
    const formatted = formatAddress({ country, state, city, line1, line2, postal });
    businessAddressInput.value = formatted;
    updateIcon();
    
    // Trigger change event for form validation
    businessAddressInput.dispatchEvent(new Event('input', { bubbles: true }));
    businessAddressInput.dispatchEvent(new Event('change', { bubbles: true }));
    
    closeModal();
  };
  
  // Event listeners - make the entire field clickable
  businessAddressBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Business address button clicked, opening modal');
    openModal();
  });
  
  businessAddressInput.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Business address input clicked, opening modal');
    openModal();
  });
  
  // Also handle pointer events on the wrapper
  if (businessAddressWrapper) {
    businessAddressWrapper.style.cursor = 'pointer';
    businessAddressWrapper.addEventListener('click', (e) => {
      // Only handle if click is directly on wrapper, not on children
      if (e.target === businessAddressWrapper) {
        console.log('Business address wrapper clicked, opening modal');
        openModal();
      }
    });
  }
  
  // Validation function to check if all required fields are filled
  const validateModalForm = () => {
    const country = document.getElementById('addressCountry')?.value || '';
    const city = document.getElementById('addressCity')?.value || '';
    const line1 = document.getElementById('addressLine1')?.value || '';
    const postal = document.getElementById('addressPostal')?.value || '';
    
    // All required fields must have values
    const isValid = country && country.trim() !== '' &&
                    city && city.trim() !== '' &&
                    line1 && line1.trim() !== '' &&
                    postal && postal.trim() !== '';
    
    return isValid;
  };
  
  // Update save button state (expose globally so Fill/Clear can call it)
  window.updateBusinessAddressSaveButton = () => {
    const saveBtn = document.getElementById('saveBusinessAddress');
    if (!saveBtn) return;
    
    const isValid = validateModalForm();
    saveBtn.disabled = !isValid;
    saveBtn.setAttribute('aria-disabled', String(!isValid));
  };
  
  const updateSaveButton = window.updateBusinessAddressSaveButton;
  
  // Save button
  const saveBtn = document.getElementById('saveBusinessAddress');
  if (saveBtn) {
    // Initially disable the button
    saveBtn.disabled = true;
    saveBtn.setAttribute('aria-disabled', 'true');
    
    saveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!validateModalForm()) return; // Double-check before saving
      saveAddress();
    });
  }
  
  // Close button handlers (using existing modal close logic)
  modal.querySelectorAll('[data-modal-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal());
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  
  // Initialize icon state
  updateIcon();
  
  // Watch for external changes (e.g., from Fill/Clear buttons)
  businessAddressInput.addEventListener('input', updateIcon);
  businessAddressInput.addEventListener('change', updateIcon);
  
  // Toggle is-filled class on modal inputs and selects when they have values
  const toggleFilled = (el) => {
    if (!el) return;
    if (el.tagName === 'SELECT') {
      // For selects, only mark as filled if value exists and is not empty string (placeholder)
      const hasValue = el.value && el.value !== '';
      el.classList.toggle('is-filled', hasValue);
    } else {
      el.classList.toggle('is-filled', el.value && el.value.trim() !== '');
    }
  };
  
  // Get all inputs and selects in the modal
  const modalInputs = modal.querySelectorAll('input[type="text"], select');
  modalInputs.forEach((input) => {
    // Initialize state
    toggleFilled(input);
    // Update on change
    const updateField = () => {
      toggleFilled(input);
      updateSaveButton(); // Also validate form when field changes
    };
    input.addEventListener('input', updateField);
    input.addEventListener('change', updateField);
  });
  
  // Initial validation when modal opens
  updateSaveButton();
})();

(function initPrototypeStateBadge() {
  const badge = document.querySelector('.build-badge');
  if (!badge || badge.querySelector('.build-badge__state')) return;
  const tool = document.createElement('div');
  tool.className = 'build-badge__state';
  tool.innerHTML = `
    <span class="build-badge__state-label">State</span>
    <button type="button" class="build-badge__state-btn" data-state-action="down" aria-label="Previous state">−</button>
    <span class="build-badge__state-value" data-state-value></span>
    <button type="button" class="build-badge__state-btn" data-state-action="up" aria-label="Next state">+</button>
    <span class="build-badge__state-name" data-state-name></span>
  `;
  badge.prepend(tool);

  const valueEl = tool.querySelector('[data-state-value]');
  const nameEl = tool.querySelector('[data-state-name]');
  const downBtn = tool.querySelector('[data-state-action="down"]');
  const upBtn = tool.querySelector('[data-state-action="up"]');

  const update = (state) => {
    if (valueEl) valueEl.textContent = state;
    if (nameEl) nameEl.textContent = typeof getPrototypeStateLabel === 'function' ? getPrototypeStateLabel(state) : '';
    if (downBtn) downBtn.disabled = state <= PROTOTYPE_STATE_MIN;
    if (upBtn) upBtn.disabled = state >= PROTOTYPE_STATE_MAX;
  };

  if (downBtn) {
    downBtn.addEventListener('click', () => {
      try { changePrototypeState(-1); } catch (_) {}
    });
  }
  if (upBtn) {
    upBtn.addEventListener('click', () => {
      try { changePrototypeState(1); } catch (_) {}
    });
  }

  update(typeof getPrototypeState === 'function' ? getPrototypeState() : PROTOTYPE_STATE_MIN);
  if (typeof onPrototypeStateChange === 'function') onPrototypeStateChange(update);
})();

(function initSendPaymentEntryGate() {
  const modal = document.getElementById('needCounterpartyModal');
  const openModal = () => {
    if (!modal) return;
    if (typeof window.__openModal === 'function') {
      window.__openModal(modal);
    } else {
      modal.setAttribute('aria-hidden', 'false');
      document.documentElement.classList.add('modal-open');
      document.body.classList.add('modal-open');
    }
  };

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-send-payment-entry]');
    if (!trigger) return;
    const state = typeof getPrototypeState === 'function' ? getPrototypeState() : PROTOTYPE_STATE_MIN;
    if (state <= 1) {
      e.preventDefault();
      openModal();
    }
  });
})();


