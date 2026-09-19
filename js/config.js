// =========================================================
// Closet de Erimar — Configuración pública del frontend
// =========================================================
// Estos valores NO son secretos: la anon key de Supabase está
// diseñada para vivir en el navegador siempre que las políticas
// RLS y las funciones RPC estén bien configuradas (lo están,
// ver supabase/schema.sql y supabase/functions.sql).
//
// Lo que NUNCA debe ir aquí ni en ningún archivo del repositorio:
// la "service_role key" de Supabase, contraseñas de admin, o
// datos reales de clientas.
//
// Para producción en GitHub Pages, este archivo se sube tal cual
// con los valores reales de TU proyecto Supabase (URL + anon key
// son públicas por diseño). Si prefieres no tenerlas ni siquiera
// en texto plano en el repo, usa GitHub Actions con "secrets" para
// generar este archivo en tiempo de build (se explica en el README
// raíz, sección de despliegue).

window.ERIMAR_CONFIG = {
  SUPABASE_URL: "https://ktibiovzrnlocgobtxuk.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_jSGJEtDNSqPQsmDtXyZC6A_-Pi4o1na", // clave publicable, nunca service_role

  // Marca / textos editables sin tocar el resto del código.
  BRAND_NAME: "Closet de Erimar",
  GREETING_TITLE: "Tenemos una sorpresa\nespecialmente para ti 💕",
  GREETING_SUBTITLE: "Gracias por elegirnos.",
  ENVELOPE_HINT: "Toca para descubrir\ntu sorpresa",

  // Botón final "Quiero volver a comprar": abre WhatsApp con el número
  // de la tienda y un mensaje que ya incluye el cupón de la clienta,
  // para que puedan validarlo directamente en la conversación.
  // Formato: solo números, con código de país (57 = Colombia), sin
  // espacios, signos ni el "+".
  RETURN_CTA_LABEL: "Quiero volver a comprar",
  WHATSAPP_NUMBER: "573136751022",

  // Si prefieres enviar a otro lugar (tu tienda online, por ejemplo)
  // en vez de WhatsApp, pon aquí esa URL completa y tendrá prioridad
  // sobre WHATSAPP_NUMBER. Déjalo vacío para usar WhatsApp.
  RETURN_CTA_URL: "",

  // Sonidos opcionales; si el archivo no existe, la app sigue
  // funcionando en silencio (ver js/animation.js).
  SOUND_ENVELOPE_OPEN: "assets/sounds/envelope-open.mp3",
  SOUND_SUCCESS: "assets/sounds/success.mp3",
};
