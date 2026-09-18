// =========================================================
// Closet de Erimar — Lógica de presentación del cupón
// =========================================================
// Formatea lo que ya decidió el backend. No calcula
// descuentos, vigencias ni disponibilidad: solo los muestra.

(function () {
  const MESES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];

  function formatDateEs(isoString) {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "";
    const dia = String(d.getDate()).padStart(2, "0");
    const mes = MESES[d.getMonth()];
    const anio = d.getFullYear();
    return `${dia} de ${mes} de ${anio}`;
  }

  function errorMessage(code) {
    switch (code) {
      case "invalid_card":
        return "Esta tarjeta no es válida o ya no está activa.";
      case "campaign_exhausted":
        return "Las sorpresas de esta campaña se han agotado 💕";
      case "campaign_inactive":
        return "Esta campaña ya no está activa.";
      case "client_not_configured":
        return "La tienda está terminando de preparar esta sorpresa. Vuelve a intentarlo en un momento.";
      default:
        return "Algo salió mal al abrir tu sorpresa. Por favor inténtalo de nuevo.";
    }
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      // Fallback para navegadores/webviews sin permiso de portapapeles.
      try {
        const el = document.createElement("textarea");
        el.value = text;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
        return true;
      } catch (err2) {
        console.error(err2);
        return false;
      }
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  window.ErimarCoupon = { formatDateEs, errorMessage, copyToClipboard, escapeHtml };
})();
