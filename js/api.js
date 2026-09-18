// =========================================================
// Closet de Erimar — Capa de acceso a Supabase (frontend público)
// =========================================================
// Esta capa NUNCA decide descuentos, vigencias ni inventario.
// Solo llama a las funciones RPC del backend y devuelve lo que
// el servidor responde. Toda decisión real vive en
// supabase/functions.sql.

(function () {
  const cfg = window.ERIMAR_CONFIG;

  if (
    !cfg ||
    !cfg.SUPABASE_URL ||
    cfg.SUPABASE_URL === "SUPABASE_URL" ||
    !cfg.SUPABASE_ANON_KEY ||
    cfg.SUPABASE_ANON_KEY === "SUPABASE_ANON_KEY"
  ) {
    console.warn(
      "[Closet de Erimar] Falta configurar SUPABASE_URL / SUPABASE_ANON_KEY en js/config.js"
    );
  }

  const client =
    window.supabase && cfg
      ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
      : null;

  /**
   * Revela (o recupera) el cupón asociado a un token de QR.
   * Devuelve siempre { ok, ... } — nunca lanza para errores de
   * negocio esperados (tarjeta inválida, campaña agotada, etc.).
   */
  async function revealCoupon(token) {
    if (!client) {
      return { ok: false, error: "client_not_configured" };
    }
    try {
      const { data, error } = await client.rpc("reveal_coupon", {
        p_token: token,
      });
      if (error) {
        console.error(error);
        return { ok: false, error: "network_error" };
      }
      return data;
    } catch (err) {
      console.error(err);
      return { ok: false, error: "network_error" };
    }
  }

  async function getTerms() {
    if (!client) return null;
    try {
      const { data, error } = await client.rpc("get_terms");
      if (error) {
        console.error(error);
        return null;
      }
      return data;
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  window.ErimarAPI = { revealCoupon, getTerms };
})();
