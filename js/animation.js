// =========================================================
// Closet de Erimar — Orquestación de la animación del sobre
// =========================================================

(function () {
  function playSound(src) {
    if (!src) return;
    try {
      const audio = new Audio(src);
      audio.volume = 0.6;
      const p = audio.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          /* Autoplay bloqueado o archivo ausente: la app sigue sin sonido. */
        });
      }
    } catch (err) {
      /* El archivo no existe o el navegador lo bloquea: no rompe nada. */
    }
  }

  function vibrate(pattern) {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (err) {
      /* Dispositivo sin soporte: se ignora silenciosamente. */
    }
  }

  /**
   * Ejecuta la secuencia: sello reacciona -> solapa se abre ->
   * tarjeta sale -> destello de celebración. Cada paso está en
   * su propio timeout para poder orquestar sonido/vibración en
   * el instante correcto, sin depender de animaciones CSS
   * encadenadas de forma frágil.
   */
  function openEnvelope(elements, cfg, onRevealed) {
    const { envelope, seal, card, sparkles } = elements;

    envelope.classList.add("is-opening");
    playSound(cfg.SOUND_ENVELOPE_OPEN);
    vibrate(15);

    seal.classList.add("seal-pop");

    setTimeout(() => {
      envelope.classList.add("flap-open");
    }, 200);

    setTimeout(() => {
      card.classList.add("card-out");
    }, 650);

    setTimeout(() => {
      sparkles.classList.add("sparkle-burst");
      playSound(cfg.SOUND_SUCCESS);
      vibrate([10, 40, 10]);
    }, 1050);

    setTimeout(() => {
      onRevealed();
    }, 1450);
  }

  window.ErimarAnimation = { openEnvelope, playSound, vibrate };
})();
