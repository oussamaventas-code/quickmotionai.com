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
     Observer: dentro del viewport → carga y reproduce; fuera → pausa
     --------------------------------------------------------------- */
  var io = null;

  function observer() {
    if (io) return io;
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var video = entry.target;
        if (entry.isIntersecting) {
          hydrate(video);
          if (video.dataset.autoplay !== 'false') play(video);
        } else if (!video.paused) {
          video.pause();
        }
      });
    }, { rootMargin: '200px 0px', threshold: 0.15 });
    return io;
  }

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
