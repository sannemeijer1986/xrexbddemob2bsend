// Mobile state switching via URL param `view` = 'menu' | 'content'
(function() {
  'use strict';

  var updateMenuIcons = function () {
    try {
      var currentPage = getPage();
      var isDesk = isDesktop();
      var items = document.querySelectorAll('.menu-item[data-page]');
      items.forEach(function (item) {
        var page = item.getAttribute('data-page');
        var img = item.querySelector('.menu-item-icon img');
        if (!img) return;
        var neutral = img.getAttribute('data-icon-neutral') || img.getAttribute('src');
        var activeSrc = img.getAttribute('data-icon-active') || neutral;
        var useActive = isDesk && page === currentPage && !!img.getAttribute('data-icon-active');
        img.setAttribute('src', useActive ? activeSrc : neutral);
      });
    } catch (_) {}
  };

  try {
    var mqDesktop = window.matchMedia('(min-width: 1280px)');
    var isDesktop = function(){ return mqDesktop.matches; };
    var getView = function(){ return new URLSearchParams(window.location.search).get('view'); };
    var getPage = function(){ return new URLSearchParams(window.location.search).get('page') || 'account'; };
    
    var applyMobileState = function(){
      if (isDesktop()) {
        document.body.classList.remove('state-menu');
        document.body.classList.remove('state-content');
        return;
      }
      var viewNow = getView();
      if (viewNow === 'menu') {
        document.body.classList.add('state-menu');
        document.body.classList.remove('state-content');
      } else {
        document.body.classList.add('state-content');
        document.body.classList.remove('state-menu');
      }
    };

    // Initial apply and on viewport changes
    applyMobileState();
    updateMenuIcons();
    mqDesktop.addEventListener('change', function () {
      applyMobileState();
      updateMenuIcons();
    });

    // Dynamic account chip link target based on viewport
    var chip = document.getElementById('accountChipLink');
    var setChipHref = function(){
      if (!chip) return;
      chip.setAttribute('href', isDesktop() ? 'settings.html?view=content&page=account' : 'settings.html?view=menu');
    };
    setChipHref();
    mqDesktop.addEventListener('change', setChipHref);

    // Back link should go to menu state on mobile
    var backLinkEl = document.getElementById('backLink');
    if (backLinkEl) {
      backLinkEl.addEventListener('click', function(e){
        if (!isDesktop()) {
          e.preventDefault();
          // Only keep view=menu; drop other params like page
          var base = window.location.origin + window.location.pathname + '?view=menu';
          window.location.replace(base);
        }
      });
    }

    // Close menu link – on mobile, return to the page where Settings was opened
    var closeMenuLink = document.getElementById('closeMenuLink');
    if (closeMenuLink) {
      closeMenuLink.addEventListener('click', function(e){
        if (!isDesktop()) {
          e.preventDefault();
          var target = null;
          try {
            if (window.sessionStorage) {
              target = window.sessionStorage.getItem('xrexb2b.settingsReturnUrl');
            }
          } catch (_) {}

          // Fallback to home if nothing stored or it points back to settings
          if (!target || /settings\.html/i.test(target)) {
            target = 'index.html';
          }

          window.location.href = target;
        }
      });
    }
  } catch (_) {}

  // Menu item navigation
  try {
    var menuItems = document.querySelectorAll('.menu-item[data-link]');
    var submenuItems = document.querySelectorAll('.submenu-item[data-link]');
    
    var navigateToPage = function(pageName) {
      var base = window.location.origin + window.location.pathname;
      var newUrl = isDesktop() 
        ? base + '?view=content&page=' + pageName
        : base + '?view=content&page=' + pageName;
      window.location.href = newUrl;
    };

    var handleMenuItemClick = function(e) {
      var item = e.currentTarget;
      var link = item.getAttribute('data-link');
      var page = item.getAttribute('data-page');
      
      if (link && page) {
        e.preventDefault();
        navigateToPage(page);
      }
    };

    menuItems.forEach(function(item) {
      item.addEventListener('click', handleMenuItemClick);
      item.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleMenuItemClick(e);
        }
      });
    });

    submenuItems.forEach(function(item) {
      item.addEventListener('click', handleMenuItemClick);
      item.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleMenuItemClick(e);
        }
      });
    });
  } catch (_) {}

  // Submenu toggle
  try {
    var chevrons = document.querySelectorAll('.menu-chevron');

    var toggleSubmenuForItem = function (item) {
      if (!item) return;
      var chevron = item.querySelector('.menu-chevron');
      var targetId = chevron ? chevron.getAttribute('data-target') : null;
      if (!targetId) return;
      var submenu = document.querySelector(targetId);
      if (!submenu) return;

      var isHidden = submenu.hasAttribute('hidden');
      if (isHidden) {
        submenu.removeAttribute('hidden');
        if (chevron) chevron.setAttribute('aria-expanded', 'true');
        item.classList.add('open');
      } else {
        submenu.setAttribute('hidden', '');
        if (chevron) chevron.setAttribute('aria-expanded', 'false');
        item.classList.remove('open');
      }
    };

    // Chevron click (all breakpoints)
    chevrons.forEach(function(chevron) {
      chevron.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleSubmenuForItem(chevron.closest('.menu-item'));
      });
    });

    // Row click to expand/collapse on all breakpoints
    chevrons.forEach(function(chevron) {
      var parentItem = chevron.closest('.menu-item');
      if (!parentItem) return;
      parentItem.addEventListener('click', function(e) {
        // Ignore clicks coming from chevron button or inside submenu links
        if (e.target.closest('.menu-chevron') || e.target.closest('.submenu')) return;
        e.preventDefault();
        toggleSubmenuForItem(parentItem);
      });
    });

    // On mobile/tablet, keep submenus expanded by default (can be collapsed by user)
    var expandAllSubmenusMobile = function () {
      if (isDesktop()) return;
      document.querySelectorAll('.submenu').forEach(function(submenu) {
        var targetId = '#' + submenu.id;
        var chevron = document.querySelector('.menu-chevron[data-target="' + targetId + '"]');
        var item = chevron ? chevron.closest('.menu-item') : null;
        if (!item) return;
        submenu.removeAttribute('hidden');
        chevron.setAttribute('aria-expanded', 'true');
        item.classList.add('open');
      });
    };

    expandAllSubmenusMobile();
    mqDesktop.addEventListener('change', expandAllSubmenusMobile);
  } catch (_) {}

  // Helper: toggle mobile sticky CTA for banks page (state >= 2)
  var updateBanksSticky = function () {
    try {
      var banksStickyEl = document.getElementById('banksSticky');
      if (!banksStickyEl) return;
      var current = getPage();
      var canShow = current === 'banks';
      // Hide sticky when the Add USD bank modal is open
      try {
        var addUsdModalEl = document.getElementById('addUsdBankModal');
        if (addUsdModalEl && addUsdModalEl.getAttribute('aria-hidden') === 'false') {
          canShow = false;
        }
      } catch (_) {}
      try {
        if (typeof getPrototypeState === 'function') {
          canShow = canShow && getPrototypeState() >= 2;
        }
      } catch (_) {}
      if (canShow) {
        banksStickyEl.removeAttribute('hidden');
      } else {
        banksStickyEl.setAttribute('hidden', '');
      }
    } catch (_) {}
  };

  // Show/hide panels based on page param
  try {
    var currentPage = getPage();
    var panels = {
      'account': document.getElementById('panel-account'),
      'banks': document.getElementById('panel-banks')
    };

    // Update active menu + submenu items
    var allMenuItems = document.querySelectorAll('.menu-item[data-page]');
    allMenuItems.forEach(function(item) {
      var page = item.getAttribute('data-page');
      var isActiveItem = page === currentPage;
      item.classList.toggle('active', isActiveItem);

      // On desktop, also mark the first submenu child as active when its parent page is active
      var submenuId = null;
      var chevron = item.querySelector('.menu-chevron');
      if (chevron) {
        submenuId = chevron.getAttribute('data-target');
      }
      if (submenuId) {
        var submenuEl = document.querySelector(submenuId);
        if (submenuEl) {
          var children = submenuEl.querySelectorAll('.submenu-item');
          children.forEach(function (child, idx) {
            var shouldBeActive = isDesktop() && isActiveItem && idx === 0;
            child.classList.toggle('is-active', shouldBeActive);
          });

          // On desktop, keep the collapsible group open for the active page
          if (isDesktop() && isActiveItem) {
            submenuEl.removeAttribute('hidden');
            if (chevron) chevron.setAttribute('aria-expanded', 'true');
            item.classList.add('open');
          }
        }
      }
    });

    // Show/hide panels
    Object.keys(panels).forEach(function(page) {
      var panel = panels[page];
      if (panel) {
        if (page === currentPage) {
          panel.removeAttribute('hidden');
          panel.setAttribute('role', 'tabpanel');
        } else {
          panel.setAttribute('hidden', '');
        }
      }
    });

    // Update page title
    var pageTitle = document.getElementById('pageTitle');
    if (pageTitle) {
      if (currentPage === 'banks') {
        pageTitle.textContent = 'USD bank accounts';
      } else {
        pageTitle.textContent = 'Account';
      }
    }

    // Initial sticky state
    updateBanksSticky();

    updateMenuIcons();
  } catch (_) {}

  // Banks panel content driven by prototype state (mirror select-counterparty)
  try {
    var banksPanel = document.getElementById('panel-banks');
    if (banksPanel && typeof getPrototypeState === 'function') {
      var BANK_STATE_ITEMS = {
        2: {
          company: [
            { title: 'AGP account SG', bank: 'DBS Bank', account: '012-345678-9', status: 'verified' }
          ],
          counterparties: [
            { title: 'Delta Electronics, Inc.', bank: 'CIMB', account: '03543546458', status: 'review' }
          ]
        },
        3: {
          company: [
            { title: 'AGP account SG', bank: 'DBS Bank', account: '012-345678-9', status: 'verified' }
          ],
          counterparties: [
            { title: 'Delta Electronics, Inc.', bank: 'CIMB', account: '03543546458', status: 'verified' },
            { title: 'Counterparty X', bank: 'CIMB', account: '012-345678-9', status: 'review' },
            { title: 'Counterparty Y', bank: 'CIMB', account: '012-345678-9', status: 'review' },
            { title: 'Counterparty Z', bank: 'CIMB', account: '012-345678-9', status: 'danger' }
          ]
        }
      };

      var mapStatus = function (code) {
        if (code === 'verified') return { label: 'Verified', className: 'status-verified' };
        if (code === 'review') return { label: 'Under review', className: 'status-under-review' };
        if (code === 'danger') return { label: 'Rejected', className: 'status-rejected' };
        return { label: 'Under review', className: 'status-under-review' };
      };

      var getBanksStateData = function (state) {
        if (state <= 1) return { company: [], counterparties: [] };
        if (state === 2) return BANK_STATE_ITEMS[2];
        return BANK_STATE_ITEMS[3];
      };

      var renderBanksEmpty = function () {
        banksPanel.innerHTML = ''
          + '<div class=\"banks-empty\">'
          + '  <img src=\"assets/illu_nobank.svg\" alt=\"\" width=\"124\" height=\"100\">'
          + '  <p class=\"banks-empty__title\">No bank accounts found</p>'
          + '  <p class=\"banks-empty__text\">Add a USD bank account and complete verification to start using USD services.</p>'
          + '  <button type=\"button\" class=\"btn btn--primary btn--lg banks-empty__btn js-open-usd-modal\">Add bank account</button>'
          + '</div>';
        // In empty state (state 1), always hide sticky CTA
        try {
          var sticky = document.getElementById('banksSticky');
          if (sticky) sticky.setAttribute('hidden', '');
        } catch (_) {}
      };

      var renderBanksPanel = function () {
        var state = getPrototypeState();
        var data = getBanksStateData(state);

        // Prototype: hide "Your company accounts" section entirely on this page
        data.company = [];

        // If there are no counterparty accounts at all, show the empty state
        if ((!data.counterparties || !data.counterparties.length)) {
          renderBanksEmpty();
          return;
        }

        // Preserve previous filter states (per section)
        var prevCompanyFilter = banksPanel.querySelector('[data-filter=\"company-verified\"]');
        var prevCpFilter = banksPanel.querySelector('[data-filter=\"cp-verified\"]');
        var prevCompanyChecked = prevCompanyFilter ? !!prevCompanyFilter.checked : false;
        var prevCpChecked = prevCpFilter ? !!prevCpFilter.checked : false;

        var hasVerifiedCompany = data.company && data.company.some(function (item) { return item.status === 'verified'; });
        var hasVerifiedCp = data.counterparties && data.counterparties.some(function (item) { return item.status === 'verified'; });

        var companyFilterChecked = hasVerifiedCompany && prevCompanyChecked;
        var cpFilterChecked = hasVerifiedCp && prevCpChecked;

        var companyItems = data.company ? (companyFilterChecked ? data.company.filter(function (item) { return item.status === 'verified'; }) : data.company.slice()) : [];
        var cpItems = data.counterparties ? (cpFilterChecked ? data.counterparties.filter(function (item) { return item.status === 'verified'; }) : data.counterparties.slice()) : [];

        var html = '';
        html += ''
          + '<div class=\"banks-header\">'
          + '  <h2 class=\"banks-subtitle\">Manage and view counterparty accounts</h2>'
          + '  <button type=\"button\" class=\"btn btn--primary btn--md js-open-usd-modal\">Add new bank account</button>'
          + '</div>';

        if (companyItems && companyItems.length) {
          var companyFilterClass = 'banks-filter' + (hasVerifiedCompany ? '' : ' is-disabled');
          var companyFilterAttrs = 'class=\"banks-filter-checkbox\" data-filter=\"company-verified\"';
          if (hasVerifiedCompany && companyFilterChecked) {
            companyFilterAttrs += ' checked';
          }
          if (!hasVerifiedCompany) {
            companyFilterAttrs += ' disabled';
          }

          html += ''
            + '<div class=\"banks-section banks-section--company\">'
            + '  <div class=\"banks-section-header\">'
            + '    <h3 class=\"banks-section-title\">Your company accounts</h3>'
            + '    <label class=\"' + companyFilterClass + '\">'
            + '      <input type=\"checkbox\" ' + companyFilterAttrs + '>'
            + '      <span class=\"banks-filter-label\">Verified accounts</span>'
            + '    </label>'
            + '  </div>'
            + '  <div class=\"banks-list\">';

          companyItems.forEach(function (item) {
            var meta = mapStatus(item.status || 'verified');
            var isProtoError = item.title === 'AGP account SG';
            html += ''
              + '<div class=\"bank-card\"' + (isProtoError ? ' data-prototype-error=\"1\"' : '') + '>'
              + '  <div class=\"bank-card-icon\">'
              + '    <img src=\"assets/icon_bankaccount_grey.svg\" alt=\"\" width=\"24\" height=\"24\">'
              + '  </div>'
              + '  <div class=\"bank-card-content\">'
              + '    <div class=\"bank-card-name\">' + item.title + '</div>'
              + '    <div class=\"bank-card-status ' + meta.className + '\">' + meta.label + '</div>'
              + '  </div>'
              + '  <div class=\"bank-card-details\">'
              + '    <span class=\"bank-card-code\">(' + item.bank + ')</span>'
              + '    <span class=\"bank-card-number\">' + item.account + '</span>'
              + '  </div>'
              + '  <img src=\"assets/icon_chevron_right.svg\" alt=\"\" class=\"bank-card-chevron\" width=\"24\" height=\"24\">'
              + '</div>';
          });

          html += '  </div></div>';
        }

        if (cpItems && cpItems.length) {
          var cpFilterClass = 'banks-filter' + (hasVerifiedCp ? '' : ' is-disabled');
          var cpFilterAttrs = 'class=\"banks-filter-checkbox\" data-filter=\"cp-verified\"';
          if (hasVerifiedCp && cpFilterChecked) {
            cpFilterAttrs += ' checked';
          }
          if (!hasVerifiedCp) {
            cpFilterAttrs += ' disabled';
          }

          html += ''
            + '<div class=\"banks-section banks-section--counterparty\">'
            + '  <div class=\"banks-section-header\">'
            + '    <h3 class=\"banks-section-title\">Counterparty accounts</h3>'
            + '    <label class=\"' + cpFilterClass + '\">'
            + '      <input type=\"checkbox\" ' + cpFilterAttrs + '>'
            + '      <span class=\"banks-filter-label\">Verified accounts</span>'
            + '    </label>'
            + '  </div>'
            + '  <div class=\"banks-list\">';

          cpItems.forEach(function (item) {
            var meta = mapStatus(item.status || 'review');
            var isNova = item.title === 'Delta Electronics, Inc.';
            var isProtoError = !isNova;
            html += ''
              + '<div class=\"bank-card\"'
              + (isProtoError ? ' data-prototype-error=\"1\"' : '')
              + (isNova ? ' data-novaquill=\"1\"' : '')
              + '>'
              + '  <div class=\"bank-card-icon\">'
              + '    <img src=\"assets/icon_bank_cp.svg\" alt=\"\" width=\"24\" height=\"24\">'
              + '  </div>'
              + '  <div class=\"bank-card-content\">'
              + '    <div class=\"bank-card-name\">' + item.title + '</div>'
              + '    <div class=\"bank-card-status ' + meta.className + '\">' + meta.label + '</div>'
              + '  </div>'
              + '  <div class=\"bank-card-details\">'
              + '    <span class=\"bank-card-code\">(' + item.bank + ')</span>'
              + '    <span class=\"bank-card-number\">' + item.account + '</span>'
              + '  </div>'
              + '  <img src=\"assets/icon_chevron_right.svg\" alt=\"\" class=\"bank-card-chevron\" width=\"24\" height=\"24\">'
              + '</div>';
          });

          html += '  </div></div>';
        }

        banksPanel.innerHTML = html;

        // Wire up filters to re-render on change (like select-counterparty)
        var companyFilterInput = banksPanel.querySelector('[data-filter=\"company-verified\"]');
        if (companyFilterInput && !companyFilterInput.disabled) {
          companyFilterInput.addEventListener('change', function () { renderBanksPanel(); });
        }
        var cpFilterInput = banksPanel.querySelector('[data-filter=\"cp-verified\"]');
        if (cpFilterInput && !cpFilterInput.disabled) {
          cpFilterInput.addEventListener('change', function () { renderBanksPanel(); });
        }

        // After (re)rendering, bind modal openers inside the panel
        if (typeof bindUsdModalOpeners === 'function') {
          bindUsdModalOpeners();
        }

        // Bind prototype-only cards to show error snackbar when clicked
        try {
          var protoCards = banksPanel.querySelectorAll('.bank-card[data-prototype-error=\"1\"]');
          protoCards.forEach(function (card) {
            if (card.dataset.protoBound === '1') return;
            card.dataset.protoBound = '1';
            card.addEventListener('click', function (e) {
              e.preventDefault();
              if (typeof window.showSnackbar === 'function') {
                window.showSnackbar('Not supported in prototype', 2000, 'error');
              }
            });
          });
        } catch (_) {}

        // Bind demo counterparty card to navigate to details page
        try {
          var novaCard = banksPanel.querySelector('.bank-card[data-novaquill=\"1\"]');
          if (novaCard && !novaCard.dataset.novaBound) {
            novaCard.dataset.novaBound = '1';
            novaCard.addEventListener('click', function (e) {
              e.preventDefault();
              window.location.href = 'counterparty-bank-details.html';
            });
          }
        } catch (_) {}
      };

      document.addEventListener('prototypeStateChange', function () {
        renderBanksPanel();
        updateBanksSticky();
      });
      renderBanksPanel();
    }
  } catch (_) {}

  // Add USD bank account modal wiring
  var bindUsdModalOpeners;
  try {
    var addUsdModal = document.getElementById('addUsdBankModal');

    var openUsdModal = function () {
      if (!addUsdModal) return;
      addUsdModal.setAttribute('aria-hidden', 'false');
      document.documentElement.classList.add('modal-open');
      document.body.classList.add('modal-open');
      // Re-evaluate sticky visibility (hide while modal is open)
      if (typeof updateBanksSticky === 'function') {
        updateBanksSticky();
      }
    };

    bindUsdModalOpeners = function () {
      try {
        var triggers = Array.prototype.slice.call(
          document.querySelectorAll('.js-open-usd-modal, #openAddUsdBankModalSticky')
        );
        triggers.forEach(function (btn) {
          if (btn.dataset.usdModalBound === '1') return;
          btn.dataset.usdModalBound = '1';
          btn.addEventListener('click', function (e) {
            e.preventDefault();
            openUsdModal();
          });
        });
      } catch (_) {}
    };

    // Initial bind (for sticky + any static triggers)
    bindUsdModalOpeners();

    if (addUsdModal) {
      addUsdModal.addEventListener('click', function (e) {
        if (e.target === addUsdModal) {
          addUsdModal.setAttribute('aria-hidden', 'true');
          document.documentElement.classList.remove('modal-open');
          document.body.classList.remove('modal-open');
          if (typeof updateBanksSticky === 'function') {
            updateBanksSticky();
          }
        }
      });
      var closeBtn = addUsdModal.querySelector('[data-modal-close]');
      if (closeBtn) {
        closeBtn.addEventListener('click', function () {
          addUsdModal.setAttribute('aria-hidden', 'true');
          document.documentElement.classList.remove('modal-open');
          document.body.classList.remove('modal-open');
          if (typeof updateBanksSticky === 'function') {
            updateBanksSticky();
          }
        });
      }
      // Disabled company account CTA -> show prototype snackbar
      var companyBtn = addUsdModal.querySelector('#addUsdCompanyBtn');
      if (companyBtn) {
        companyBtn.addEventListener('click', function (e) {
          e.preventDefault();
          if (typeof window.showSnackbar === 'function') {
            window.showSnackbar('Not supported in prototype', 2000, 'error');
          }
        });
      }
    }
  } catch (_) {}
})();
