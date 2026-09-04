/* ==========================================================================
   motion.js — revelado al scroll, parallax, glow de cursor, contadores,
   acordeón y marquee. Sin dependencias. ~4 KB.
   Todo se reinicializa solo cuando el editor de temas inyecta secciones.
   ========================================================================== */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia('(hover: none)').matches;

  /* ---------------------------------------------------------------
     1. Revelado al entrar en viewport (+ stagger automático)
     --------------------------------------------------------------- */
  var revealIO = null;

  function initReveal(root) {
    var items = (root || document).querySelectorAll('[data-reveal]:not(.is-in)');
    if (!items.length) return;

    if (reduced) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }

    if (!revealIO) {
      revealIO = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-in');
            revealIO.unobserve(entry.target);
          });
        },
        { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
      );
    }
    items.forEach(function (el) { revealIO.observe(el); });
  }

  /* Aplica delays escalonados a los hijos de [data-stagger] */
  function initStagger(root) {
    (root || document).querySelectorAll('[data-stagger]').forEach(function (group) {
      var step = parseInt(group.dataset.stagger, 10) || 70;
      var max = parseInt(group.dataset.staggerMax, 10) || 8;
      var kids = group.querySelectorAll(':scope > [data-reveal], :scope > * > [data-reveal]');
      kids.forEach(function (kid, i) {
        if (kid.style.getPropertyValue('--reveal-delay')) return;
        kid.style.setProperty('--reveal-delay', Math.min(i, max) * step + 'ms');
      });
    });
  }

  /* Líneas que se dibujan (mismo observer, distinta clase) */
  var drawIO = null;
  function initDraw(root) {
    var items = (root || document).querySelectorAll('[data-draw]:not(.is-in)');
    if (!items.length) return;
    if (reduced) { items.forEach(function (el) { el.classList.add('is-in'); }); return; }
    if (!drawIO) {
      drawIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          e.target.classList.add('is-in');
          drawIO.unobserve(e.target);
        });
      }, { rootMargin: '0px 0px -15% 0px', threshold: 0.1 });
    }
    items.forEach(function (el) { drawIO.observe(el); });
  }

  /* ---------------------------------------------------------------
     2. Parallax ligero — un solo rAF para todos los elementos
     --------------------------------------------------------------- */
  var pxItems = [];
  var pxTicking = false;
  var pxIO = null;

  function initParallax(root) {
    if (reduced || coarse) return;

    if (!pxIO) {
      pxIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var item = pxItems.find(function (i) { return i.el === entry.target; });
          if (item) item.visible = entry.isIntersecting;
        });
        schedulePx();
      }, { rootMargin: '20% 0px 20% 0px' });
    }

    (root || document).querySelectorAll('[data-parallax]').forEach(function (el) {
      if (el.__px) return;
      el.__px = true;
      pxItems.push({
        el: el,
        depth: parseFloat(el.dataset.parallax) || 0.12,
        visible: false
      });
      pxIO.observe(el);
    });

    if (pxItems.length && !window.__pxBound) {
      window.__pxBound = true;
      window.addEventListener('scroll', schedulePx, { passive: true });
      window.addEventListener('resize', schedulePx, { passive: true });
    }
    schedulePx();
  }

  function schedulePx() {
    if (pxTicking) return;
    pxTicking = true;
    requestAnimationFrame(runPx);
  }

  function runPx() {
    pxTicking = false;
    var vh = window.innerHeight;
    for (var i = 0; i < pxItems.length; i++) {
      var item = pxItems[i];
      if (!item.visible) continue;
      var rect = item.el.getBoundingClientRect();
      // -1 (elemento saliendo por arriba) → 1 (entrando por abajo)
      var progress = (rect.top + rect.height / 2 - vh / 2) / (vh / 2 + rect.height / 2);
      var shift = progress * item.depth * 100;
      item.el.style.setProperty('--py', shift.toFixed(2) + 'px');
    }
  }

  /* ---------------------------------------------------------------
     3. Glow que sigue al cursor en las cards
     --------------------------------------------------------------- */
  function initGlow(root) {
    if (coarse || reduced) return;
    (root || document).querySelectorAll('.card--glow').forEach(function (card) {
      if (card.__glow) return;
      card.__glow = true;
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', ((e.clientX - r.left) / r.width) * 100 + '%');
        card.style.setProperty('--my', ((e.clientY - r.top) / r.height) * 100 + '%');
      });
    });
  }

  /* ---------------------------------------------------------------
     4. Contadores animados — [data-count-to="7.4"] data-count-decimals="1"
     --------------------------------------------------------------- */
  var countIO = null;
  function initCounters(root) {
    var els = (root || document).querySelectorAll('[data-count-to]:not(.counted)');
    if (!els.length) return;

    if (reduced) {
      els.forEach(function (el) {
        el.classList.add('counted');
        el.textContent = formatNum(parseFloat(el.dataset.countTo), el);
      });
      return;
    }

    if (!countIO) {
      countIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          runCount(e.target);
          countIO.unobserve(e.target);
        });
      }, { threshold: 0.4 });
    }
    els.forEach(function (el) { countIO.observe(el); });
  }

  function formatNum(value, el) {
    var dec = parseInt(el.dataset.countDecimals, 10) || 0;
    var locale = document.documentElement.lang || 'en';
    return value.toLocaleString(locale, { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  function runCount(el) {
    el.classList.add('counted');
    var target = parseFloat(el.dataset.countTo);
    if (isNaN(target)) return;
    var dur = parseInt(el.dataset.countDuration, 10) || 1400;
    var start = performance.now();

    function tick(now) {
      var t = Math.min((now - start) / dur, 1);
      var eased = 1 - Math.pow(1 - t, 4); // ease-out quart
      el.textContent = formatNum(target * eased, el);
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = formatNum(target, el);
    }
    requestAnimationFrame(tick);
  }

  /* ---------------------------------------------------------------
     5. Acordeón accesible
     --------------------------------------------------------------- */
  function initAccordion(root) {
    (root || document).querySelectorAll('[data-acc]').forEach(function (acc) {
      if (acc.__acc) return;
      acc.__acc = true;
      var single = acc.dataset.acc === 'single';

      acc.querySelectorAll('.acc__trigger').forEach(function (trigger) {
        trigger.addEventListener('click', function () {
          var item = trigger.closest('.acc__item');
          var open = item.classList.contains('is-open');

          if (single && !open) {
            acc.querySelectorAll('.acc__item.is-open').forEach(function (other) {
              other.classList.remove('is-open');
              other.querySelector('.acc__trigger').setAttribute('aria-expanded', 'false');
            });
          }
          item.classList.toggle('is-open', !open);
          trigger.setAttribute('aria-expanded', String(!open));
        });
      });
    });
  }

  /* ---------------------------------------------------------------
     6. Marquee — duplica el contenido para el bucle sin costura
     --------------------------------------------------------------- */
  function initMarquee(root) {
    (root || document).querySelectorAll('.marquee__track:not(.is-cloned)').forEach(function (track) {
      track.classList.add('is-cloned');
      track.setAttribute('aria-hidden', 'false');
      var clone = track.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clone.querySelectorAll('a, button').forEach(function (el) { el.setAttribute('tabindex', '-1'); });
      // Se mueven ambos dentro del mismo track para que translateX(-50%) cierre el bucle
      while (clone.firstChild) track.appendChild(clone.firstChild);
    });
  }

  /* ---------------------------------------------------------------
     7. Header: estado "scrolled" + ocultar al bajar
     --------------------------------------------------------------- */
  function initHeader() {
    var header = document.querySelector('[data-header]');
    if (!header || header.__hdr) return;
    header.__hdr = true;
    var lastY = window.scrollY;
    var ticking = false;

    function update() {
      ticking = false;
      var y = window.scrollY;
      header.classList.toggle('is-scrolled', y > 12);
      var hideable = !header.hasAttribute('data-header-static');
      if (hideable) {
        var goingDown = y > lastY && y > 320;
        header.classList.toggle('is-hidden', goingDown && !header.contains(document.activeElement));
      }
      lastY = y;
    }
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }, { passive: true });
    update();
  }

  /* ---------------------------------------------------------------
     Bootstrap
     --------------------------------------------------------------- */
  function initAll(root) {
    initStagger(root);
    initReveal(root);
    initDraw(root);
    initParallax(root);
    initGlow(root);
    initCounters(root);
    initAccordion(root);
    initMarquee(root);
    initHeader();
  }

  window.ThemeMotion = { init: initAll };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initAll(document); });
  } else {
    initAll(document);
  }

  // Editor de temas: reinicializa la sección que se acaba de cargar
  document.addEventListener('shopify:section:load', function (e) { initAll(e.target); });
  document.addEventListener('shopify:block:select', function (e) { initAll(e.target); });
})();
