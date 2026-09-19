// =========================================================
// Closet de Erimar — Orquestador principal de la página
// =========================================================

(function () {
  const cfg = window.ERIMAR_CONFIG;
  const { formatDateEs, errorMessage, copyToClipboard, escapeHtml } = window.ErimarCoupon;

  const screens = {
    noQr: document.getElementById("screen-no-qr"),
    loading: document.getElementById("screen-loading"),
    error: document.getElementById("screen-error"),
    intro: document.getElementById("screen-intro"),
    envelope: document.getElementById("screen-envelope"),
    reveal: document.getElementById("screen-reveal"),
    returning: document.getElementById("screen-returning"),
  };

  function showScreen(name) {
    Object.values(screens).forEach((el) => el && el.classList.remove("is-active"));
    if (screens[name]) screens[name].classList.add("is-active");
  }

  function getTokenFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("qr");
  }

  function fillReveal(root, data) {
    root.querySelector("[data-field='greeting-name']").textContent = data.customer_name || "";
    root.querySelector("[data-field='discount']").textContent = `${data.discount_percent}%`;
    root.querySelector("[data-field='code']").textContent = data.code;
    root.querySelector("[data-field='expires']").textContent = formatDateEs(data.expires_at);
  root.querySelectorAll("[data-field='countdown']").forEach((field) => {
    const update = () => {
      const remaining = new Date(data.expires_at).getTime() - Date.now();
      if (remaining <= 0) { field.textContent = "Cupón vencido"; return; }
      const days = Math.floor(remaining / 86400000);
      const hours = Math.floor((remaining % 86400000) / 3600000);
      field.textContent = `Quedan ${days} días y ${hours} horas`;
    };
    update();
    window.setInterval(update, 3600000);
  });

    const statusNote = root.querySelector("[data-field='status-note']");
    if (statusNote) {
      if (data.status === "used") {
        statusNote.textContent = "Este cupón ya fue utilizado.";
        statusNote.hidden = false;
      } else if (data.status === "expired") {
        statusNote.textContent = "Este cupón ha expirado.";
        statusNote.hidden = false;
      } else {
        statusNote.hidden = true;
      }
    }

    const returnBtn = root.querySelector("[data-field='return-cta']");
    if (returnBtn) {
      const waUrl = buildReturnUrl(data);
      if (waUrl) {
        returnBtn.href = waUrl;
        returnBtn.textContent = cfg.RETURN_CTA_LABEL || "Quiero volver a comprar";
        returnBtn.target = "_blank";
        returnBtn.rel = "noopener";
        returnBtn.hidden = false;
      } else {
        returnBtn.hidden = true;
      }
    }

    const shareHint = root.querySelector("[data-field='share-hint']");
    if (shareHint) shareHint.hidden = false;
  }

  function buildReturnUrl(data) {
    if (cfg.RETURN_CTA_URL) return cfg.RETURN_CTA_URL;
    if (!cfg.WHATSAPP_NUMBER) return "";
    const mensaje =
      `Hola, soy ${data.customer_name} 💕 Quiero usar mi cupón de Closet de Erimar:\n\n` +
      `Cupón: ${data.code}\n` +
      `Descuento: ${data.discount_percent}%`;
    return `https://wa.me/${cfg.WHATSAPP_NUMBER}?text=${encodeURIComponent(mensaje)}`;
  }

  function setupCopyButton(root, code) {
    const btn = root.querySelector("[data-action='copy-coupon']");
    if (!btn) return;
    const originalLabel = btn.textContent;
    btn.addEventListener("click", async () => {
      const success = await copyToClipboard(code);
      btn.textContent = success ? "✓ Copiado" : "No se pudo copiar";
      setTimeout(() => {
        btn.textContent = originalLabel;
      }, 2000);
    });
  }

  function setupTerms() {
    const openBtns = document.querySelectorAll("[data-action='open-terms']");
    const modal = document.getElementById("terms-modal");
    const closeBtn = modal ? modal.querySelector("[data-action='close-terms']") : null;
    const body = modal ? modal.querySelector("[data-field='terms-body']") : null;
    let loaded = false;
    let trigger = null;

    async function open(event) {
      if (!modal) return;
      trigger = event && event.currentTarget ? event.currentTarget : document.activeElement;
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      if (closeBtn) closeBtn.focus();
      if (!loaded && body) {
        const terms = await window.ErimarAPI.getTerms();
        body.textContent =
          terms ||
          "• Cupón personal e intransferible.\n• Válido para una sola compra.\n• No es canjeable por dinero en efectivo.";
        loaded = true;
      }
    }

    function close() {
      if (!modal) return;
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      if (trigger && typeof trigger.focus === "function") trigger.focus();
    }

    openBtns.forEach((btn) => btn.addEventListener("click", open));
    if (closeBtn) closeBtn.addEventListener("click", close);
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) close();
      });
    }
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
  }

  async function init() {
    setupTerms();

    const token = getTokenFromUrl();
    if (!token) {
      showScreen("noQr");
      return;
    }

    showScreen("loading");
    const result = await window.ErimarAPI.revealCoupon(token);

    if (!result || !result.ok) {
      const msg = errorMessage(result ? result.error : null);
      document.getElementById("error-message").textContent = msg;
      showScreen("error");
      return;
    }

    if (result.is_new) {
      // Primera vez: experiencia completa con sobre animado.
      fillReveal(screens.envelope, result);
      setupCopyButton(screens.envelope, result.code);
      showScreen("intro");

      setTimeout(() => {
        showScreen("envelope");

        const envelope = document.getElementById("envelope");
        const seal = document.getElementById("envelope-seal");
        const card = document.getElementById("envelope-card");
        const sparkles = document.getElementById("envelope-sparkles");
        const revealPanel = document.getElementById("envelope-reveal-panel");
        const tapHint = document.getElementById("envelope-tap-hint");

        function handleOpen() {
          envelope.removeEventListener("click", handleOpen);
          envelope.removeEventListener("keydown", handleKey);
          tapHint.style.opacity = "0";
          window.ErimarAnimation.openEnvelope(
            { envelope, seal, card, sparkles },
            cfg,
            () => {
              revealPanel.classList.add("is-visible");
            }
          );
        }
        function handleKey(e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleOpen();
          }
        }

        envelope.addEventListener("click", handleOpen);
        envelope.addEventListener("keydown", handleKey);
      }, 2600);
    } else {
      // Ya había abierto su sorpresa antes: mostramos el mismo
      // cupón directamente, sin repetir la animación de regalo.
      fillReveal(screens.returning, result);
      setupCopyButton(screens.returning, result.code);
      showScreen("returning");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
