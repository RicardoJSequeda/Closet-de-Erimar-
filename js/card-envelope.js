(function () {
  function dataUrlToBlob(dataUrl) {
    const [meta, data] = dataUrl.split(',');
    const bytes = atob(data);
    const array = Uint8Array.from(bytes, (char) => char.charCodeAt(0));
    return new Blob([array], { type: meta.match(/:(.*?);/)[1] });
  }

  function qrUrl() {
    return `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(window.location.href)}`;
  }

  function openEnvelope(elements, cfg, onRevealed) {
    const { envelope, seal, card, sparkles } = elements;
    const wrapper = document.getElementById("valentineCard");
    wrapper.classList.add("open");
    envelope.classList.add("is-opening");
    if (seal) seal.classList.add("seal-pop");
    if (sparkles) sparkles.classList.add("sparkle-burst");
    setTimeout(() => onRevealed(), 1250);
  }

  function setupActions() {
    document.querySelectorAll('[data-action="descargar-qr"]').forEach((button) => button.addEventListener("click", async () => {
      const response = await fetch(qrUrl());
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "qr-closet-de-erimar.png";
      link.click();
      URL.revokeObjectURL(url);
    }));
    document.querySelectorAll('[data-action="compartir-qr"]').forEach((button) => button.addEventListener("click", async () => {
      if (navigator.share) await navigator.share({ title: "Mi cupón de Closet de Erimar", url: window.location.href });
      else await navigator.clipboard.writeText(window.location.href);
      const original = button.textContent;
      button.textContent = "Enlace copiado";
      setTimeout(() => { button.textContent = original; }, 1800);
    }));
  }

  window.ErimarAnimation = { openEnvelope, setupActions };
})();
