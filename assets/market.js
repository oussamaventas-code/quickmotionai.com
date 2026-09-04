/* ==========================================================================
   market.js — comportamiento del selector de mercado (<details>).

   El envío real lo hace el form `localization` nativo de Shopify; esto sólo
   cierra el panel al elegir, al hacer click fuera o con Escape, para que no
   se quede abierto durante la recarga.
   ========================================================================== */
(function () {
  'use strict';

  function closeOthers(except) {
    document.querySelectorAll('.market__details[open]').forEach(function (d) {
      if (d !== except) d.removeAttribute('open');
    });
  }

  function init(root) {
    (root || document).querySelectorAll('.market__details').forEach(function (details) {
      if (details.__market) return;
      details.__market = true;

      details.addEventListener('toggle', function () {
        if (details.open) closeOthers(details);
      });
    });
  }

  document.addEventListener('click', function (e) {
    document.querySelectorAll('.market__details[open]').forEach(function (details) {
      if (!details.contains(e.target)) details.removeAttribute('open');
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var open = document.querySelector('.market__details[open]');
    if (!open) return;
    open.removeAttribute('open');
    var summary = open.querySelector('summary');
    if (summary) summary.focus();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(document); });
  } else {
    init(document);
  }
  document.addEventListener('shopify:section:load', function (e) { init(e.target); });
})();
