/* ==========================================================================
   video-player.js — vídeo perezoso y barato.

   · Nada se descarga hasta que el marco se acerca al viewport (preload="none"
     + src en data-src): el hero es lo único que carga de inmediato.
   · Reproduce sólo lo que está visible; al salir del viewport, pausa.
   · Si el ahorro de datos está activo o la conexión es 2g, se queda en póster.
   · Lightbox con sonido para ver el creativo entero.
   ========================================================================== */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var conn = navigator.connection || {};
  var saveData = conn.saveData === true || /^(slow-)?2g$/.test(conn.effectiveType || '');

  /* ---------------------------------------------------------------
     Carga perezosa de fuentes
     --------------------------------------------------------------- */
  function hydrate(video) {
    if (video.dataset.hydrated) return;
    video.dataset.hydrated = '1';

    var frame = video.closest('.vframe');
    if (frame) frame.classList.add('is-loading');

    video.querySelectorAll('source[data-src]').forEach(function (source) {
      source.src = source.dataset.src;
      source.removeAttribute('data-src');
    });
    if (video.dataset.src) {
      video.src = video.dataset.src;
      video.removeAttribute('data-src');
    }
    video.load();
  }

  function markPlaying(video) {
    var frame = video.closest('.vframe');
    if (!frame) return;
    frame.classList.remove('is-loading');
    frame.classList.add('is-playing');
  }

  function play(video) {
    if (saveData || reduced) return;
    var p = video.play();
    if (p && p.catch) p.catch(function () { /* autoplay bloqueado: se queda el póster */ });
  }

  /* ---------------------------------------------------------------
     Presupuesto de reproducción simultánea

     Un móvil no aguanta varios 9:16 decodificando a la vez: se calienta,
     tira de datos y acaba dejando los vídeos congelados. Así que no se
     reproduce "todo lo visible", sino sólo los N más visibles; el resto
     espera en póster. En móvil N = 1 (el vídeo que el usuario está
     mirando de verdad), en escritorio N = 4.
     --------------------------------------------------------------- */
  function budget() {
    return window.innerWidth < 750 ? 1 : 4;
  }

  var visible = new Map(); // video -> ratio de visibilidad
  var rebalanceQueued = false;

  function queueRebalance() {
    if (rebalanceQueued) return;
    rebalanceQueued = true;
    requestAnimationFrame(function () {
      rebalanceQueued = false;
      rebalance();
    });
  }

  function rebalance() {
    if (document.hidden) {
      visible.forEach(function (ratio, video) { if (!video.paused) video.pause(); });
      return;
    }

    // Los más visibles primero: el que ocupa más pantalla es el que interesa.
    var ranked = Array.from(visible.entries())
      .filter(function (entry) { return entry[1] > 0; })
      .sort(function (a, b) { return b[1] - a[1]; })
      .map(function (entry) { return entry[0]; });

    var slots = budget();

    ranked.forEach(function (video, i) {
      if (video.dataset.autoplay === 'false') return;

      if (i < slots) {
        // Dentro del presupuesto: carga y reproduce.
        hydrate(video);
        if (video.paused) play(video);
      } else if (i === slots) {
        // El siguiente en la cola se precarga, pero no se reproduce: al
        // seguir bajando el scroll ya está listo y no se ve el póster.
        hydrate(video);
        if (!video.paused) video.pause();
      } else if (!video.paused) {
        video.pause();
      }
    });

    // Todo lo que ya no está visible, parado.
    visible.forEach(function (ratio, video) {
      if (ratio === 0 && !video.paused) video.pause();
    });
  }

  /* ---------------------------------------------------------------
     Observer: alimenta el mapa de visibilidad y deja decidir al reparto
     --------------------------------------------------------------- */
  var io = null;

  function observer() {
    if (io) return io;
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        visible.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0);
      });
      queueRebalance();
    }, { rootMargin: '150px 0px', threshold: [0, 0.25, 0.5, 0.75, 1] });
    return io;
  }

  /* ---------------------------------------------------------------
     Rescate del autoplay

     Safari/iOS y algunos Android bloquean el primer play() hasta que hay
     una interacción, aunque el vídeo esté silenciado. En cuanto el usuario
     toca, hace scroll o pulsa una tecla, se reintenta una sola vez.
     --------------------------------------------------------------- */
  var rescued = false;
  function rescueAutoplay() {
    if (rescued) return;
    rescued = true;
    queueRebalance();
  }

  ['touchstart', 'pointerdown', 'keydown', 'scroll'].forEach(function (evt) {
    window.addEventListener(evt, rescueAutoplay, { once: true, passive: true });
  });

  document.addEventListener('visibilitychange', queueRebalance);
  window.addEventListener('resize', queueRebalance, { passive: true });

  function initVideos(root) {
    (root || document).querySelectorAll('video[data-lazy-video]').forEach(function (video) {
      if (video.__lazy) return;
      video.__lazy = true;

      video.muted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');

      video.addEventListener('loadeddata', function () { markPlaying(video); }, { once: true });
      video.addEventListener('playing', function () { markPlaying(video); });
      video.addEventListener('error', function () {
        var frame = video.closest('.vframe');
        if (frame) frame.classList.remove('is-loading');
      });

      if (video.dataset.eager === 'true') {
        hydrate(video);
        if (video.dataset.autoplay !== 'false') play(video);
      }
      observer().observe(video);
    });
  }

  /* ---------------------------------------------------------------
     Lightbox
     --------------------------------------------------------------- */
  var lb, lbVideo, lastFocus;

  function ensureLightbox() {
    if (lb) return lb;
    lb = document.getElementById('video-lightbox');
    if (!lb) return null;
    lbVideo = lb.querySelector('.lightbox__video');

    lb.addEventListener('click', function (e) {
      if (e.target === lb || e.target.closest('[data-lightbox-close]')) closeLightbox();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && lb.classList.contains('is-open')) closeLightbox();
      if (e.key === 'Tab' && lb.classList.contains('is-open')) trapFocus(e);
    });
    return lb;
  }

  function trapFocus(e) {
    var focusables = lb.querySelectorAll('button, [href], video[controls]');
    if (!focusables.length) return;
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function openLightbox(src, poster) {
    if (!ensureLightbox() || !src) return;
    lastFocus = document.activeElement;
    lbVideo.src = src;
    if (poster) lbVideo.poster = poster;
    lbVideo.currentTime = 0;
    lbVideo.muted = false;
    lbVideo.controls = true;
    lb.classList.add('is-open');
    lb.removeAttribute('aria-hidden');
    document.body.style.overflow = 'hidden';
    var p = lbVideo.play();
    if (p && p.catch) p.catch(function () {});
    var closeBtn = lb.querySelector('[data-lightbox-close]');
    if (closeBtn) closeBtn.focus();
  }

  function closeLightbox() {
    if (!lb) return;
    lb.classList.remove('is-open');
    lb.setAttribute('aria-hidden', 'true');
    lbVideo.pause();
    lbVideo.removeAttribute('src');
    lbVideo.load();
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function initTriggers(root) {
    (root || document).querySelectorAll('[data-video-open]').forEach(function (btn) {
      if (btn.__lb) return;
      btn.__lb = true;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openLightbox(btn.dataset.videoOpen, btn.dataset.videoPoster);
      });
    });
  }

  /* ---------------------------------------------------------------
     Botón de sonido en tarjeta (sin abrir el lightbox)
     --------------------------------------------------------------- */
  function initSoundToggles(root) {
    (root || document).querySelectorAll('[data-video-sound]').forEach(function (btn) {
      if (btn.__snd) return;
      btn.__snd = true;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var frame = btn.closest('.vframe');
        var video = frame && frame.querySelector('video');
        if (!video) return;

        var turningOn = video.muted;
        if (turningOn) {
          // Sólo un vídeo con sonido a la vez
          document.querySelectorAll('.vframe video').forEach(function (other) {
            if (other !== video) { other.muted = true; syncBtn(other); }
          });
        }
        video.muted = !video.muted;
        if (video.paused) play(video);
        syncBtn(video);
      });
    });
  }

  function syncBtn(video) {
    var frame = video.closest('.vframe');
    var btn = frame && frame.querySelector('[data-video-sound]');
    if (!btn) return;
    var on = !video.muted;
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', String(on));
    var onIcon = btn.querySelector('[data-icon-on]');
    var offIcon = btn.querySelector('[data-icon-off]');
    if (onIcon) onIcon.classList.toggle('hidden', !on);
    if (offIcon) offIcon.classList.toggle('hidden', on);
  }

  function initAll(root) {
    initVideos(root);
    initTriggers(root);
    initSoundToggles(root);
  }

  window.ThemeVideo = { init: initAll, open: openLightbox, close: closeLightbox };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initAll(document); });
  } else {
    initAll(document);
  }
  document.addEventListener('shopify:section:load', function (e) { initAll(e.target); });
})();
