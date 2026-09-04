/* ==========================================================================
   cart.js — carrito con AJAX ligero. Sólo se carga en /cart.

   Cambios de cantidad y eliminar línea van por fetch a /cart/change.js;
   la respuesta re-renderiza la sección entera pidiendo su HTML a Shopify
   (?sections=cart-items), así que los totales y el estado de "vacío" nunca
   se desincronizan a mano.
   ========================================================================== */
(function () {
  'use strict';

  var SECTION_ID = 'main-cart';
  var root = document.getElementById('CartItems');
  if (!root) return;

  function setBusy(busy) {
    root.classList.toggle('is-updating', busy);
  }

  function renderError(message) {
    var box = root.querySelector('[data-cart-error]');
    if (!box) return;
    box.textContent = message || window.cartStrings.error;
    box.hidden = false;
  }

  function change(line, quantity) {
    setBusy(true);
    fetch(window.routes.cart_change_url + '.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ line: line, quantity: quantity, sections: [SECTION_ID], sections_url: window.location.pathname })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.errors) {
          renderError(typeof data.errors === 'string' ? data.errors : window.cartStrings.error);
          setBusy(false);
          return;
        }
        replaceSection(data);
        updateCartCount(data.item_count);
      })
      .catch(function () {
        renderError();
        setBusy(false);
      });
  }

  function replaceSection(data) {
    var html = data.sections && data.sections[SECTION_ID];
    if (!html) { setBusy(false); return; }
    var next = new DOMParser().parseFromString(html, 'text/html').getElementById('CartItems');
    if (next) {
      root.innerHTML = next.innerHTML;
      bind(root);
    }
    setBusy(false);
  }

  function updateCartCount(count) {
    document.querySelectorAll('.cart-link__count').forEach(function (el) {
      el.textContent = count;
      el.hidden = count === 0;
    });
  }

  function bind(scope) {
    scope.querySelectorAll('[data-qty-decrease]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var input = btn.parentElement.querySelector('[data-qty-input]');
        var next = Math.max(0, parseInt(input.value, 10) - 1);
        change(btn.dataset.line, next);
      });
    });
    scope.querySelectorAll('[data-qty-increase]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var input = btn.parentElement.querySelector('[data-qty-input]');
        var next = parseInt(input.value, 10) + 1;
        change(btn.dataset.line, next);
      });
    });
    scope.querySelectorAll('[data-qty-input]').forEach(function (input) {
      input.addEventListener('change', function () {
        var next = Math.max(0, parseInt(input.value, 10) || 0);
        change(input.dataset.line, next);
      });
    });
    scope.querySelectorAll('[data-line-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () { change(btn.dataset.line, 0); });
    });
  }

  bind(root);
})();
