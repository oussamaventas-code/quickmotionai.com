/* ==========================================================================
   qm-webs.js — comportamiento de la landing /webs

   · Capa de eventos para analítica (GTM / GA4 / Meta) sin depender de ninguna
   · Enrutado de todos los CTA a un único flujo de conversión
   · Pestañas de demos por sector
   · Formulario: validación, envío y estado de confirmación
   · Barra fija inferior en móvil

   Sin dependencias. Se reinicia solo cuando el editor de temas recarga una
   sección.
   ========================================================================== */
(function () {
  'use strict';

  /* Varias secciones piden este archivo para seguir funcionando aunque se
     quite alguna de ellas del editor. El navegador lo descarga una vez pero lo
     ejecuta tantas veces como etiquetas haya: sin esta guarda cada evento se
     dispararía duplicado. */
  if (window.qmWebs && window.qmWebs.init) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------
     1. Eventos de analítica

     Un único punto de salida. Si mañana se instala GTM, Meta Pixel o
     GA4, empiezan a recibir eventos sin tocar ni una línea de la
     landing. Mientras no haya nada instalado, el evento sigue saliendo
     como CustomEvent en document, que es lo que consumen la mayoría de
     gestores de etiquetas.
     --------------------------------------------------------------- */
  function track(name, params) {
    var payload = params || {};

    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(Object.assign({ event: name }, payload));
    } catch (e) {}

    try { if (typeof window.gtag === 'function') window.gtag('event', name, payload); } catch (e) {}
    try { if (typeof window.fbq === 'function') window.fbq('trackCustom', name, payload); } catch (e) {}

    try {
      document.dispatchEvent(new CustomEvent('qm:track', { detail: { name: name, params: payload } }));
    } catch (e) {}

    // Rastro en consola sólo dentro del editor de temas, para poder
    // comprobar que cada botón dispara lo que debe.
    if (window.Shopify && window.Shopify.designMode) {
      // eslint-disable-next-line no-console
      console.info('[qm-webs] ' + name, payload);
    }
  }

  window.qmWebs = window.qmWebs || {};
  window.qmWebs.track = track;

  /* ---------------------------------------------------------------
     2. view_pricing — se dispara una vez, cuando los planes entran en pantalla
     --------------------------------------------------------------- */
  function initPricingView(root) {
    var el = (root || document).querySelector('[data-qw-pricing]:not(.qw-seen)');
    if (!el) return;

    if (!('IntersectionObserver' in window)) {
      el.classList.add('qw-seen');
      track('view_pricing', { section: 'webs_plans' });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('qw-seen');
        track('view_pricing', { section: 'webs_plans' });
        io.unobserve(entry.target);
      });
    }, { threshold: 0.25 });

    io.observe(el);
  }

  /* ---------------------------------------------------------------
     3. CTA — un único flujo de conversión

     Cada botón lleva data-qw-cta con el nombre del evento y, opcionalmente,
     data-plan con el plan que representa. Si el enlace apunta a un ancla de
     la propia página, se hace scroll suave y se preselecciona ese plan en el
     formulario. Si apunta a un producto o al carrito, se deja navegar.
     --------------------------------------------------------------- */
  function initCtas(root) {
    (root || document).querySelectorAll('[data-qw-cta]').forEach(function (el) {
      if (el.__qwCta) return;
      el.__qwCta = true;

      el.addEventListener('click', function (event) {
        var name = el.dataset.qwCta;
        var plan = el.dataset.plan || '';
        if (name) track(name, plan ? { plan: plan } : {});

        // Botón de compra directa: añade la variante real al carrito y salta
        // al checkout de Shopify sin pasos intermedios. Es la ruta principal
        // para STARTER, PRO y BUSINESS.
        var variantId = el.dataset.qwBuy;
        if (variantId) {
          event.preventDefault();
          buyNow(variantId, el.getAttribute('href'));
          return;
        }

        var href = el.getAttribute('href') || '';
        if (href.charAt(0) !== '#') return; // producto, carrito o enlace externo

        event.preventDefault();
        if (plan) preselectPlan(plan);
        scrollToId(href.slice(1));
      });
    });
  }

  /* Añade la variante al carrito por AJAX y salta directo al checkout. Si la
     petición falla (red, variante agotada, etc.) cae al enlace normal del
     botón, que sigue siendo un permalink de compra válido aunque dé un paso
     más por el carrito. */
  function buyNow(variantId, fallbackHref) {
    fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: [{ id: parseInt(variantId, 10), quantity: 1 }] })
    })
      .then(function (response) {
        if (!response.ok) throw new Error('cart/add failed');
        window.location.href = '/checkout';
      })
      .catch(function () {
        window.location.href = fallbackHref || '/cart/' + variantId + ':1';
      });
  }

  function scrollToId(id) {
    var target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }

  /* Deja el plan elegido ya marcado en el formulario y lo resalta un momento */
  function preselectPlan(plan) {
    var select = document.querySelector('[data-qw-plan-field]');
    if (!select) return;

    var matched = false;
    Array.prototype.forEach.call(select.options, function (option) {
      if (option.value === plan) { select.value = plan; matched = true; }
    });
    if (!matched) return;

    select.dispatchEvent(new Event('change', { bubbles: true }));

    var field = select.closest('.field');
    if (!field || reduced) return;
    field.animate(
      [
        { boxShadow: '0 0 0 0 rgba(123, 97, 255, 0.5)' },
        { boxShadow: '0 0 0 7px rgba(123, 97, 255, 0)' }
      ],
      { duration: 900, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
    );
  }

  /* ---------------------------------------------------------------
     4. Pestañas de demos por sector
     --------------------------------------------------------------- */
  function initDemos(root) {
    (root || document).querySelectorAll('[data-qw-demos]').forEach(function (wrap) {
      if (wrap.__qwDemos) return;
      wrap.__qwDemos = true;

      var tabs = Array.prototype.slice.call(wrap.querySelectorAll('[role="tab"]'));
      if (!tabs.length) return;

      function select(tab, focus) {
        tabs.forEach(function (other) {
          var on = other === tab;
          other.setAttribute('aria-selected', String(on));
          other.setAttribute('tabindex', on ? '0' : '-1');
          var panel = document.getElementById(other.getAttribute('aria-controls'));
          if (panel) {
            panel.classList.toggle('is-active', on);
            panel.hidden = !on;
          }
        });
        if (focus) tab.focus();
        track('view_demo', { sector: tab.dataset.sector || '' });
      }

      tabs.forEach(function (tab, index) {
        tab.addEventListener('click', function () { select(tab, false); });
        tab.addEventListener('keydown', function (event) {
          var step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
          if (step === 0) return;
          event.preventDefault();
          select(tabs[(index + step + tabs.length) % tabs.length], true);
        });
      });
    });
  }

  /* ---------------------------------------------------------------
     5. Formulario

     Destinos posibles, en este orden:
       · data-endpoint  → POST JSON (Make, n8n, Zapier, CRM, backend propio)
       · data-whatsapp  → abre WhatsApp con el mensaje ya escrito
       · ninguno        → guarda el lead en window.qmWebs.leads y avisa por
                          consola, para no perder el dato durante las pruebas
     --------------------------------------------------------------- */
  window.qmWebs.leads = window.qmWebs.leads || [];

  function initForm(root) {
    (root || document).querySelectorAll('[data-qw-form]').forEach(function (form) {
      if (form.__qwForm) return;
      form.__qwForm = true;

      var card = form.closest('.qw-form') || form;
      var started = false;

      form.addEventListener('focusin', function () {
        if (started) return;
        started = true;
        track('start_form', { form: 'webs_lead' });
      });

      form.addEventListener('submit', function (event) {
        event.preventDefault();

        // Trampa antispam: si viene rellena, es un bot. Fingimos éxito.
        var pot = form.querySelector('[name="qw_website"]');
        if (pot && pot.value) { showDone(card); return; }

        if (!validate(form)) return;

        var data = collect(form);
        track('submit_form', { form: 'webs_lead', plan: data.plan || '' });

        var endpoint = form.dataset.endpoint || '';
        var whatsapp = (form.dataset.whatsapp || '').replace(/[^0-9]/g, '');

        if (endpoint) {
          send(endpoint, data);
        }

        if (whatsapp) {
          var url = 'https://wa.me/' + whatsapp + '?text=' + encodeURIComponent(message(data, form));
          window.open(url, '_blank', 'noopener');
        }

        if (!endpoint && !whatsapp) {
          window.qmWebs.leads.push(data);
          // eslint-disable-next-line no-console
          console.warn('[qm-webs] Formulario sin destino configurado. Lead retenido en window.qmWebs.leads:', data);
        }

        showDone(card);
      });
    });
  }

  function validate(form) {
    var ok = true;
    var first = null;

    form.querySelectorAll('[required]').forEach(function (input) {
      var field = input.closest('.field');
      var valid = input.checkValidity() && String(input.value).trim() !== '';
      if (field) field.classList.toggle('has-error', !valid);
      if (!valid) {
        ok = false;
        input.setAttribute('aria-invalid', 'true');
        if (!first) first = input;
      } else {
        input.removeAttribute('aria-invalid');
      }
    });

    if (first) first.focus();
    return ok;
  }

  function collect(form) {
    var out = {};
    new FormData(form).forEach(function (value, key) {
      if (key === 'qw_website') return;
      out[key] = typeof value === 'string' ? value.trim() : value;
    });
    out.page = window.location.href;
    out.sent_at = new Date().toISOString();
    return out;
  }

  function message(data, form) {
    var lines = [form.dataset.waIntro || 'Hola, quiero mi web.'];
    var labels = {
      nombre: 'Nombre',
      negocio: 'Negocio',
      sector: 'Tipo de negocio',
      whatsapp: 'WhatsApp',
      plan: 'Web que necesito'
    };
    Object.keys(labels).forEach(function (key) {
      if (data[key]) lines.push(labels[key] + ': ' + data[key]);
    });
    return lines.join('\n');
  }

  function send(endpoint, data) {
    try {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        keepalive: true,
        mode: 'cors'
      }).catch(function () {
        window.qmWebs.leads.push(data);
      });
    } catch (e) {
      window.qmWebs.leads.push(data);
    }
  }

  function showDone(card) {
    card.classList.add('is-done');
    var done = card.querySelector('.qw-form__done');
    if (!done) return;
    done.setAttribute('tabindex', '-1');
    done.focus({ preventScroll: true });
    card.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  }

  /* ---------------------------------------------------------------
     6. WhatsApp suelto (botones fuera del formulario)
     --------------------------------------------------------------- */
  function initWhatsapp(root) {
    (root || document).querySelectorAll('[data-qw-whatsapp]').forEach(function (el) {
      if (el.__qwWa) return;
      el.__qwWa = true;
      el.addEventListener('click', function () {
        track('click_whatsapp', { from: el.dataset.qwWhatsapp || 'page' });
      });
    });
  }

  /* ---------------------------------------------------------------
     7. Barra fija inferior en móvil

     Aparece al dejar atrás el hero y se aparta cuando el usuario ya tiene
     botones reales delante (planes, oferta o formulario).
     --------------------------------------------------------------- */
  function initSticky(root) {
    var bar = (root || document).querySelector('[data-qw-sticky]');
    if (!bar || bar.__qwSticky) return;
    bar.__qwSticky = true;

    if (!('IntersectionObserver' in window)) return;

    var pastHero = false;
    var overCta = false;

    function apply() { bar.classList.toggle('is-in', pastHero && !overCta); }

    var hero = document.querySelector('[data-qw-hero]');
    if (hero) {
      new IntersectionObserver(function (entries) {
        var entry = entries[0];
        pastHero = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        apply();
      }, { threshold: 0 }).observe(hero);
    } else {
      pastHero = true;
    }

    var zones = document.querySelectorAll(bar.dataset.qwHideOver || '[data-qw-pricing], [data-qw-offer], [data-qw-close]');
    if (zones.length) {
      var visible = new Set();
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) visible.add(entry.target);
          else visible.delete(entry.target);
        });
        overCta = visible.size > 0;
        apply();
      }, { threshold: 0.12 });
      zones.forEach(function (zone) { io.observe(zone); });
    }

    apply();
  }

  /* ---------------------------------------------------------------
     Arranque

     La línea del proceso y los revelados al scroll los lleva motion.js del
     tema con data-draw y data-reveal: aquí no se duplica nada.
     --------------------------------------------------------------- */
  function initAll(root) {
    initPricingView(root);
    initCtas(root);
    initDemos(root);
    initForm(root);
    initWhatsapp(root);
    initSticky(root);
  }

  window.qmWebs.init = initAll;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initAll(document); });
  } else {
    initAll(document);
  }

  document.addEventListener('shopify:section:load', function (event) { initAll(event.target); });
})();
