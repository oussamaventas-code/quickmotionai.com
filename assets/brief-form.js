/* ==========================================================================
   brief-form.js — formulario por pasos del brief.

   · Un solo <form>: los pasos son fieldsets que se muestran y ocultan, así que
     al enviar viaja todo junto y Shopify lo recibe como un contacto normal.
   · Validación por paso con la API nativa de restricciones (required, type=email
     y type=url ya validan solos): no hay expresiones regulares propias.
   · Autoguardado en localStorage mientras se escribe. Se borra al enviar.
   ========================================================================== */
(function () {
  'use strict';

  function init(root) {
    (root || document).querySelectorAll('[data-brief]').forEach(function (shell) {
      if (shell.__brief) return;
      shell.__brief = true;
      new Brief(shell);
    });
  }

  function Brief(shell) {
    this.shell = shell;
    this.form = shell.closest('form');
    this.steps = Array.prototype.slice.call(shell.querySelectorAll('[data-brief-step]'));
    this.prevBtn = shell.querySelector('[data-brief-prev]');
    this.nextBtn = shell.querySelector('[data-brief-next]');
    this.submitBtn = shell.querySelector('[data-brief-submit]');
    this.bar = shell.querySelector('[data-brief-bar]');
    this.currentOut = shell.querySelector('[data-brief-current]');
    this.storageKey = shell.dataset.storageKey || 'brief';
    this.index = 0;

    if (!this.steps.length) return;

    this.restore();
    this.bind();
    this.render();
  }

  Brief.prototype.bind = function () {
    var self = this;

    if (this.nextBtn) {
      this.nextBtn.addEventListener('click', function () {
        if (!self.validateStep(self.index)) return;
        self.go(self.index + 1);
      });
    }
    if (this.prevBtn) {
      this.prevBtn.addEventListener('click', function () { self.go(self.index - 1); });
    }

    // Enter avanza de paso en vez de enviar a medias
    this.shell.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      if (e.target.tagName === 'TEXTAREA') return;
      if (self.index < self.steps.length - 1) {
        e.preventDefault();
        if (self.validateStep(self.index)) self.go(self.index + 1);
      }
    });

    // Autoguardado
    this.shell.addEventListener('input', function () { self.save(); });
    this.shell.addEventListener('change', function () { self.save(); });

    // Al enviar de verdad ya no hace falta el borrador
    if (this.form) {
      this.form.addEventListener('submit', function (e) {
        if (!self.validateStep(self.index)) {
          e.preventDefault();
          return;
        }
        try { localStorage.removeItem(self.storageKey); } catch (err) { /* modo privado */ }
      });
    }
  };

  Brief.prototype.go = function (index) {
    if (index < 0 || index >= this.steps.length) return;
    this.index = index;
    this.render();

    // Coloca el paso bajo la cabecera fija, sin saltos bruscos
    var top = this.shell.getBoundingClientRect().top + window.scrollY - 110;
    window.scrollTo({ top: top, behavior: 'smooth' });

    var focusable = this.steps[index].querySelector('input, textarea, select');
    if (focusable) setTimeout(function () { focusable.focus({ preventScroll: true }); }, 220);
  };

  Brief.prototype.render = function () {
    var self = this;
    this.steps.forEach(function (step, i) { step.hidden = i !== self.index; });

    var last = this.index === this.steps.length - 1;
    if (this.prevBtn) this.prevBtn.hidden = this.index === 0;
    if (this.nextBtn) this.nextBtn.hidden = last;
    if (this.submitBtn) this.submitBtn.hidden = !last;
    if (this.currentOut) this.currentOut.textContent = String(this.index + 1);
    if (this.bar) this.bar.style.transform = 'scaleX(' + (this.index + 1) / this.steps.length + ')';
  };

  Brief.prototype.validateStep = function (index) {
    var step = this.steps[index];
    var fields = step.querySelectorAll('input, textarea, select');
    var firstBad = null;

    fields.forEach(function (field) {
      var wrapper = field.closest('[data-brief-field]');
      var ok = field.checkValidity();
      if (wrapper) wrapper.classList.toggle('has-error', !ok);
      if (!ok && !firstBad) firstBad = field;
    });

    if (firstBad) {
      firstBad.focus();
      firstBad.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return false;
    }
    return true;
  };

  Brief.prototype.save = function () {
    if (!this.form) return;
    var data = {};
    this.form.querySelectorAll('input, textarea, select').forEach(function (field) {
      if (!field.name || field.type === 'hidden') return;
      if (field.type === 'radio' || field.type === 'checkbox') {
        if (field.checked) data[field.name] = field.value;
      } else {
        data[field.name] = field.value;
      }
    });
    try { localStorage.setItem(this.storageKey, JSON.stringify(data)); } catch (e) { /* cuota o modo privado */ }
  };

  Brief.prototype.restore = function () {
    var raw;
    try { raw = localStorage.getItem(this.storageKey); } catch (e) { return; }
    if (!raw) return;

    var data;
    try { data = JSON.parse(raw); } catch (e) { return; }
    if (!data || typeof data !== 'object') return;

    var form = this.form;
    if (!form) return;

    Object.keys(data).forEach(function (name) {
      var nodes = form.querySelectorAll('[name="' + CSS.escape(name) + '"]');
      nodes.forEach(function (field) {
        if (field.type === 'radio' || field.type === 'checkbox') {
          if (field.value === data[name]) field.checked = true;
        } else if (!field.value) {
          field.value = data[name];
        }
      });
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(document); });
  } else {
    init(document);
  }
  document.addEventListener('shopify:section:load', function (e) { init(e.target); });
})();
