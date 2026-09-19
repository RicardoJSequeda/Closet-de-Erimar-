// =========================================================
// Closet de Erimar — Panel administrativo (admin/admin.js)
// =========================================================
// Todo lo sensible pasa por RPC SECURITY DEFINER o por tablas
// protegidas con RLS que solo un usuario en la tabla `admins`
// puede leer/escribir. Este archivo NUNCA decide descuentos,
// vigencias ni inventario: solo llama al backend y pinta el
// resultado.

(function () {
  const cfg = window.ERIMAR_CONFIG;
  const client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const el = (id) => document.getElementById(id);

  const loginScreen = el("login-screen");
  const adminApp = el("admin-app");

  // ---------------------------------------------------------
  // Autenticación
  // ---------------------------------------------------------
  async function checkIsAdmin(userId) {
    if (!userId) return false;
    const { data, error } = await client
      .from("admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.error("[v0] No se pudo verificar el rol administrativo", error);
      return false;
    }
    return Boolean(data && data.user_id === userId);
  }

  async function boot() {
    const { data: sessionData } = await client.auth.getSession();
    if (sessionData && sessionData.session) {
      const isAdmin = await checkIsAdmin(sessionData.session.user.id);
      if (isAdmin) {
        loginScreen.hidden = true;
        adminApp.hidden = false;
        initAdminApp();
        return;
      } else {
        await client.auth.signOut();
      }
    }
    loginScreen.hidden = false;
    adminApp.hidden = true;
  }

  el("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = el("login-email").value.trim();
    const password = el("login-password").value;
    const errorEl = el("login-error");
    const submitBtn = el("login-submit");
    errorEl.hidden = true;
    submitBtn.disabled = true;
    submitBtn.setAttribute("aria-busy", "true");
    submitBtn.setAttribute("aria-label", "Verificando acceso");

    const { error } = await client.auth.signInWithPassword({ email, password });
    submitBtn.disabled = false;
    submitBtn.removeAttribute("aria-busy");
    submitBtn.removeAttribute("aria-label");
    if (error) {
      errorEl.textContent = "Correo o contraseña incorrectos.";
      errorEl.hidden = false;
      return;
    }
    const { data: currentSession } = await client.auth.getSession();
    const isAdmin = await checkIsAdmin(currentSession.session?.user.id);
    if (!isAdmin) {
      await client.auth.signOut();
      errorEl.textContent = "Esta cuenta no tiene acceso al panel administrativo.";
      errorEl.hidden = false;
      return;
    }
    loginScreen.hidden = true;
    adminApp.hidden = false;
    initAdminApp();
  });

  el("logout-btn").addEventListener("click", async () => {
    await client.auth.signOut();
    window.location.reload();
  });

  // ---------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------
  function setupTabs() {
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach((b) => {
          b.classList.remove("is-active");
          b.setAttribute("aria-selected", "false");
        });
        document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("is-active"));
        btn.classList.add("is-active");
        btn.setAttribute("aria-selected", "true");
        document.getElementById("tab-" + btn.dataset.tab).classList.add("is-active");
      });
    });
  }

  let appInitialized = false;

  function initAdminApp() {
    if (appInitialized) return;
    appInitialized = true;
    const today = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
    if (el("admin-date")) el("admin-date").textContent = today;
    setupTabs();
    setupCustomerModal();
    loadCustomers();
    loadCampaignsEverywhere();
    setupCustomerForm();
    setupQrForm();
    setupQrList();
    loadQrCards();
    setupCampaignForm();
    setupValidateForm();
    setupStatsCampaignSelect();
    loadCouponsTable();
  }

  // ---------------------------------------------------------
  // Clientes
  // ---------------------------------------------------------
  let customersCache = [];

  async function loadCustomers() {
    const { data, error } = await client
      .from("customers")
      .select("id, full_name, phone, notes, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      return;
    }
    customersCache = data || [];
    const countLabel = el("customer-count-label");
    const countBadge = el("customer-count");
    if (countLabel) countLabel.textContent = `${customersCache.length} clientas registradas`;
    if (countBadge) countBadge.textContent = customersCache.length;
    renderCustomerList(customersCache);
    fillCustomerSelect(customersCache);
  }

  function renderCustomerList(list) {
    const container = el("customer-list");
    if (!list.length) {
      container.innerHTML = '<p class="empty-state">Todavía no hay clientas registradas.</p>';
      return;
    }
    container.innerHTML = list
      .map(
        (c) => `
        <div class="list-row" data-customer-id="${c.id}">
          <div>
            <p class="list-row-title">${escapeHtml(c.full_name)}</p>
            <p class="list-row-sub">${escapeHtml(c.phone || "Sin teléfono")}</p>
            ${c.notes ? `<p class="list-row-sub">${escapeHtml(c.notes)}</p>` : ""}
          </div>
          <div class="list-row-actions">
            <button type="button" class="btn btn--ghost btn--small" data-customer-edit>Editar</button>
            <button type="button" class="btn btn--danger btn--small" data-customer-delete>Eliminar</button>
          </div>
        </div>`
      )
      .join("");

    container.querySelectorAll("[data-customer-edit]").forEach((button) => button.addEventListener("click", async () => {
      const row = button.closest("[data-customer-id]");
      const customer = customersCache.find((item) => item.id === row.dataset.customerId);
      if (!customer) return;
      const full_name = window.prompt("Nombre completo", customer.full_name);
      if (full_name === null || !full_name.trim()) return;
      const phone = window.prompt("WhatsApp / teléfono", customer.phone || "");
      const notes = window.prompt("Notas", customer.notes || "");
      const { error } = await client.from("customers").update({ full_name: full_name.trim(), phone: phone?.trim() || null, notes: notes?.trim() || null }).eq("id", customer.id);
      if (error) return alert("No se pudo actualizar la clienta.");
      loadCustomers();
    }));
    container.querySelectorAll("[data-customer-delete]").forEach((button) => button.addEventListener("click", async () => {
      const row = button.closest("[data-customer-id]");
      if (!window.confirm("¿Eliminar esta clienta y sus QR/cupones asociados?")) return;
      const { error } = await client.from("customers").delete().eq("id", row.dataset.customerId);
      if (error) return alert("No se pudo eliminar la clienta.");
      loadCustomers(); loadQrCards(); loadCouponsTable();
    }));
  }

  el("customer-search").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    const filtered = customersCache.filter((c) => c.full_name.toLowerCase().includes(q));
    renderCustomerList(filtered);
  });

  function setupCustomerModal() {
    const modal = el("customer-modal");
    el("open-customer-modal")?.addEventListener("click", () => modal?.showModal());
    el("close-customer-modal")?.addEventListener("click", () => modal?.close());
    modal?.addEventListener("click", (event) => { if (event.target === modal) modal.close(); });
  }

  function setupCustomerForm() {
    el("customer-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const full_name = el("customer-name").value.trim();
      if (!full_name) return;

      const { error } = await client.from("customers").insert({ full_name });
      if (error) {
        alert("No se pudo guardar la clienta.");
        console.error(error);
        return;
      }
      el("customer-form").reset();
      el("customer-modal")?.close();
      loadCustomers();
    });
  }

  function fillCustomerSelect(list) {
    const select = el("qr-customer");
    select.innerHTML = '<option value="">Selecciona una clienta</option>' + list
      .map((c) => `<option value="${c.id}">${escapeHtml(c.full_name)}</option>`)
      .join("");
    select.disabled = !list.length;
  }

  // ---------------------------------------------------------
  // Campañas
  // ---------------------------------------------------------
  let campaignsCache = [];

  async function loadCampaignsEverywhere() {
    const { data, error } = await client
      .from("campaigns")
      .select("id, name, active, max_coupons, duration_days, expires_on, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      return;
    }
    campaignsCache = data || [];
    fillCampaignSelects(campaignsCache);
    renderCampaignList(campaignsCache);
  }

  function fillCampaignSelects(list) {
    const activeCampaigns = list.filter((c) => c.active);
    const qrOptions = '<option value="">Selecciona una campaña activa</option>' + activeCampaigns
      .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}${c.active ? "" : " (inactiva)"}</option>`)
      .join("");
    const statsOptions = '<option value="">Selecciona una campaña</option>' + list
      .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}${c.active ? "" : " (inactiva)"}</option>`)
      .join("");
    el("qr-campaign").innerHTML = qrOptions;
    el("qr-campaign").disabled = !activeCampaigns.length;
    el("stats-campaign").innerHTML = statsOptions;
    el("stats-campaign").disabled = !list.length;
  }

  function renderCampaignList(list) {
    const container = el("campaign-list");
    if (!list.length) {
      container.innerHTML = '<p class="empty-state">Aún no has creado ninguna campaña.</p>';
      return;
    }
    container.innerHTML = list
      .map(
        (c) => `
        <div class="list-row">
          <div>
            <p class="list-row-title">${escapeHtml(c.name)} ${c.active ? "" : "· inactiva"}</p>
            <p class="list-row-sub">${c.max_coupons} cupones · hasta ${c.expires_on ? new Date(`${c.expires_on}T23:59:59`).toLocaleDateString("es-CO") : `${c.duration_days} días`}</p>
          </div>
          <div class="list-row-actions">
            <select data-campaign-id="${c.id}" class="duration-select">
              <option value="15" ${c.duration_days === 15 ? "selected" : ""}>15 días</option>
              <option value="20" ${c.duration_days === 20 ? "selected" : ""}>20 días</option>
              <option value="30" ${c.duration_days === 30 ? "selected" : ""}>30 días</option>
            </select>
            <button type="button" class="btn btn--ghost btn--small" data-campaign-toggle="${c.id}">${c.active ? "Desactivar" : "Activar"}</button>
          </div>
        </div>`
      )
      .join("");

    container.querySelectorAll("[data-campaign-toggle]").forEach((button) => button.addEventListener("click", async () => {
      const campaign = campaignsCache.find((item) => item.id === button.dataset.campaignToggle);
      if (!campaign) return;
      const { error } = await client.from("campaigns").update({ active: !campaign.active }).eq("id", campaign.id);
      if (error) return alert("No se pudo cambiar el estado de la campaña.");
      loadCampaignsEverywhere();
    }));

    container.querySelectorAll(".duration-select").forEach((sel) => {
      sel.addEventListener("change", async () => {
        const campaignId = sel.dataset.campaignId;
        const { error } = await client.rpc("update_campaign_duration", {
          p_campaign_id: campaignId,
          p_duration_days: parseInt(sel.value, 10),
        });
        if (error) {
          alert("No se pudo actualizar la vigencia.");
          console.error(error);
        }
      });
    });
  }

  function setupCampaignForm() {
    el("campaign-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = el("campaign-name").value.trim();
      const expiresOn = el("campaign-expires-on").value;
      const today = new Date();
      const expiry = new Date(`${expiresOn}T23:59:59`);
      const duration = Math.max(1, Math.ceil((expiry - today) / 86400000));
const t10 = parseInt(el("tier-10").value || "0", 10);
 const t15 = parseInt(el("tier-15").value || "0", 10);
 const t20 = parseInt(el("tier-20").value || "0", 10);
 const maxCoupons = t10 + t15 + t20;

      if (!name || !expiresOn || Number.isNaN(expiry.getTime()) || expiry <= today || maxCoupons <= 0) {
        alert("Revisa el nombre, la fecha de vencimiento y la distribución de cupones.");
        return;
      }

const tiers = [
 { discount_percent: 10, total: t10 },
 { discount_percent: 15, total: t15 },
 { discount_percent: 20, total: t20 },
 ].filter((t) => t.total > 0);

      const { data, error } = await client.rpc("create_campaign", {
        p_name: name,
        p_max_coupons: maxCoupons,
        p_duration_days: duration,
        p_tiers: tiers,
      });

      if (error || !data || !data.ok) {
        alert("No se pudo crear la campaña.");
        console.error(error || data);
        return;
      }

      if (data.campaign_id) {
        await client.from("campaigns").update({ expires_on: expiresOn }).eq("id", data.campaign_id);
      }
      el("campaign-form").reset();
el("tier-10").value = 6;
el("tier-15").value = 3;
el("tier-20").value = 1;
      loadCampaignsEverywhere();
    });
  }

  // ---------------------------------------------------------
  // Crear QR
  // ---------------------------------------------------------
  async function createQrDataUrl(data) {
    if (!window.QRCode) throw new Error("qr_generator_not_loaded");
    return window.QRCode.toDataURL(data, {
      width: 600,
      margin: 2,
      errorCorrectionLevel: "M",
    });
  }

  async function dataUrlToBlob(dataUrl) {
    const response = await fetch(dataUrl);
    if (!response.ok) throw new Error("qr_data_url_failed");
    return response.blob();
  }

  function showQrNote(message) {
    const note = el("qr-action-note");
    note.textContent = message;
    note.hidden = false;
  }

  function setupQrForm() {
    el("qr-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const customerId = el("qr-customer").value;
      const campaignId = el("qr-campaign").value;
      if (!customerId || !campaignId) return;

      const submitBtn = e.target.querySelector("button[type='submit']");
      submitBtn.disabled = true;
      submitBtn.textContent = "Generando…";

      const { data, error } = await client.rpc("create_qr_card", {
        p_customer_id: customerId,
        p_campaign_id: campaignId,
      });

      submitBtn.disabled = false;
      submitBtn.textContent = "Generar QR";

      if (error || !data || !data.ok) {
        alert("No se pudo generar el QR. Revisa la consola para más detalle.");
        console.error(error || data);
        return;
      }

      const customer = customersCache.find((c) => c.id === customerId);
      const campaign = campaignsCache.find((c) => c.id === campaignId);
      const customerName = customer ? customer.full_name : "clienta";

      const baseUrl = new URL("../", window.location.href).toString();
      const qrUrl = `${baseUrl}?qr=${encodeURIComponent(data.token)}`;
      let qrImageUrl;
      try {
        qrImageUrl = await createQrDataUrl(qrUrl);
      } catch (err) {
        console.error(err);
        el("qr-result-customer").textContent = customerName;
        el("qr-result-campaign").textContent = campaign ? campaign.name : "";
        el("qr-url").textContent = qrUrl;
        el("qr-canvas-holder").replaceChildren();
        el("qr-result").hidden = false;
        showQrNote("No se pudo dibujar el QR, pero este enlace es válido. Cópialo y vuelve a intentarlo antes de cerrar esta página.");
        return;
      }

      el("qr-result-customer").textContent = customerName;
      el("qr-result-campaign").textContent = campaign ? campaign.name : "";
      el("qr-url").textContent = qrUrl;
      el("qr-result").hidden = false;
      el("qr-action-note").hidden = true;

      const holder = el("qr-canvas-holder");
      holder.innerHTML = `<img src="${qrImageUrl}" alt="Código QR de ${escapeHtml(customerName)}" width="220" height="220" />`;

      const fileName = `qr-${customerName.replace(/\s+/g, "-").toLowerCase()}.png`;

      el("qr-download").onclick = async () => {
        try {
          const link = document.createElement("a");
          link.href = qrImageUrl;
          link.download = fileName;
          link.rel = "noopener";
          document.body.appendChild(link);
          link.click();
          link.remove();
        } catch (err) {
          console.error(err);
          // El QR vive localmente en una URL data:, por lo que se puede
          // guardar manualmente incluso si falla la descarga automática.
          window.open(qrImageUrl, "_blank");
          showQrNote("Se abrió el QR en una pestaña nueva: mantén presionada la imagen (o clic derecho) para guardarla.");
        }
      };

      await loadQrCards();

      el("qr-share").onclick = async () => {
        try {
          const blob = await dataUrlToBlob(qrImageUrl);
          const file = new File([blob], fileName, { type: blob.type || "image/png" });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: "Closet de Erimar",
              text: `Tarjeta QR de ${customerName}`,
            });
            return;
          }
          if (navigator.share) {
            await navigator.share({ title: "Closet de Erimar", text: `Tarjeta QR de ${customerName}`, url: qrUrl });
            return;
          }
          await navigator.clipboard.writeText(qrUrl);
          showQrNote("Enlace del cupón copiado. Puedes pegarlo para compartirlo.");
        } catch (err) {
          console.error(err);
          window.open(qrImageUrl, "_blank", "noopener");
          showQrNote("Se abrió el QR en una pestaña nueva para compartirlo manualmente.");
        }
      };
    });
  }

  // ---------------------------------------------------------
  // QR existentes: mostrar, descargar, compartir y eliminar
  // ---------------------------------------------------------
  let qrCardsCache = [];

  function qrPublicUrl(token) {
    return `${new URL("../", window.location.href).toString()}?qr=${encodeURIComponent(token)}`;
  }

  async function buildQrImage(token) {
    return createQrDataUrl(qrPublicUrl(token));
  }

  function bindQrActions(card, qrImageUrl, customerName) {
    const fileName = `qr-${customerName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
    card.querySelector("[data-qr-download]")?.addEventListener("click", async () => {
      const link = document.createElement("a");
  link.href = qrImageUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
    });
    card.querySelector("[data-qr-share]")?.addEventListener("click", async () => {
      try {
        const blob = await dataUrlToBlob(qrImageUrl);
        const file = new File([blob], fileName, { type: "image/png" });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: "Closet de Erimar", text: `QR de ${customerName}` });
        } else if (navigator.share) {
          await navigator.share({ title: "Closet de Erimar", url: qrPublicUrl(card.dataset.token) });
        } else {
          await navigator.clipboard.writeText(qrPublicUrl(card.dataset.token));
          showQrNote("Enlace del cupón copiado.");
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          window.open(qrImageUrl, "_blank", "noopener");
          showQrNote("Se abrió el QR para compartirlo manualmente.");
        }
      }
    });
    card.querySelector("[data-qr-delete]")?.addEventListener("click", async () => {
      if (!window.confirm("¿Eliminar este QR? También se eliminará su cupón asociado.")) return;
      const { error } = await client.rpc("delete_qr_card", { p_qr_card_id: card.dataset.id });
      if (error) { alert("No se pudo eliminar el QR."); return; }
      loadQrCards();
      loadCouponsTable();
    });
    card.querySelector("[data-qr-deactivate]")?.addEventListener("click", async () => {
      const { error } = await client.rpc("deactivate_qr_card", { p_qr_card_id: card.dataset.id });
      if (error) { alert("No se pudo desactivar el QR."); return; }
      loadQrCards();
    });
  }

  async function loadQrCards() {
    const container = el("qr-list");
    if (!container) return;
    const { data, error } = await client
      .from("qr_cards")
      .select("id, token_value, active, created_at, customers(full_name), campaigns(name), coupons(id, code, status, expires_at)")
      .order("created_at", { ascending: false });
    if (error) { console.error(error); container.innerHTML = '<p class="empty-state">No se pudieron cargar los QR.</p>'; return; }
    qrCardsCache = data || [];
    if (!qrCardsCache.length) { container.innerHTML = '<p class="empty-state">Aún no hay QR creados.</p>'; return; }
    container.replaceChildren();
    for (const row of qrCardsCache) {
      const customerName = row.customers?.full_name || "Clienta";
      const card = document.createElement("article");
      card.className = `qr-list-card${row.active ? "" : " is-inactive"}`;
      card.dataset.id = row.id;
      const coupon = Array.isArray(row.coupons) ? row.coupons[0] : row.coupons;
      card.dataset.token = row.token_value || "";
      const image = document.createElement("div");
      image.className = "qr-list-card__image";
      card.innerHTML = `<div class="qr-list-card__info"><p class="qr-list-card__title"></p><p class="qr-list-card__meta"></p><p class="qr-list-card__meta"></p></div><div class="qr-list-card__actions"><button type="button" class="btn btn--ghost btn--small" data-qr-show>Mostrar</button><button type="button" class="btn btn--ghost btn--small" data-qr-download>Descargar</button><button type="button" class="btn btn--ghost btn--small" data-qr-share>Compartir</button><button type="button" class="btn btn--ghost btn--small" data-qr-deactivate ${row.active ? "" : "disabled"}>Desactivar</button><button type="button" class="btn btn--danger btn--small" data-qr-delete>Eliminar</button></div>`;
      card.querySelector(".qr-list-card__title").textContent = customerName;
      card.querySelector(".qr-list-card__meta").textContent = `${row.campaigns?.name || "Campaña"} · Cupón ${coupon?.code || "sin código"} · ${coupon?.status || "sin estado"}`;
      card.querySelectorAll(".qr-list-card__meta")[1].textContent = `Creado ${new Date(row.created_at).toLocaleDateString("es-CO")}`;
      card.prepend(image);
      container.append(card);
      if (!row.token_value) {
        image.classList.add("qr-list-card__image--missing");
        image.textContent = coupon ? `QR asociado\nCupón ${coupon.code}` : "QR sin cupón";
        card.querySelector("[data-qr-show]").disabled = true;
        card.querySelector("[data-qr-download]").disabled = true;
        card.querySelector("[data-qr-share]").disabled = true;
        continue;
      }
      let qrImageUrl;
      try {
        qrImageUrl = await buildQrImage(row.token_value);
      } catch (error) {
        console.error("[v0] No se pudo dibujar el QR guardado", error);
        image.classList.add("qr-list-card__image--missing");
        image.textContent = "QR no disponible";
        continue;
      }
      image.innerHTML = `<img src="${qrImageUrl}" alt="Código QR de ${escapeHtml(customerName)}" width="84" height="84">`;
      card.querySelector("[data-qr-show]").addEventListener("click", () => {
        el("qr-result-customer").textContent = customerName;
        el("qr-result-campaign").textContent = row.campaigns?.name || "";
        el("qr-url").textContent = qrPublicUrl(row.token_value);
        el("qr-canvas-holder").innerHTML = `<img src="${qrImageUrl}" alt="Código QR de ${escapeHtml(customerName)}" width="220" height="220">`;
        el("qr-result").hidden = false;
      });
      bindQrActions(card, qrImageUrl, customerName);
    }
  }

  function setupQrList() {
    el("refresh-qr-list")?.addEventListener("click", loadQrCards);
  }

  // ---------------------------------------------------------
  // Estadísticas
  // ---------------------------------------------------------
  function setupStatsCampaignSelect() {
    el("stats-campaign").addEventListener("change", loadStats);
  }

  async function loadStats() {
    const campaignId = el("stats-campaign").value;
    if (!campaignId) return;
    const { data, error } = await client.rpc("get_campaign_stats", {
      p_campaign_id: campaignId,
    });
    if (error) {
      console.error(error);
      return;
    }
    const s = data.stats;
    el("stats-summary").innerHTML = `
      <div class="stat-box"><p class="stat-num">${s.total_slots}</p><p class="stat-label">Cupones totales</p></div>
      <div class="stat-box"><p class="stat-num">${s.assigned}</p><p class="stat-label">Asignados</p></div>
      <div class="stat-box"><p class="stat-num">${s.available}</p><p class="stat-label">Disponibles</p></div>
      <div class="stat-box"><p class="stat-num">${s.used}</p><p class="stat-label">Utilizados</p></div>
      <div class="stat-box"><p class="stat-num">${s.expired}</p><p class="stat-label">Vencidos</p></div>
    `;
    const inv = data.inventory || [];
    el("stats-inventory").innerHTML = inv
      .map(
        (t) => `
        <div class="stat-box">
          <p class="stat-num">${t.remaining}/${t.total}</p>
          <p class="stat-label">${t.discount_percent}% disponibles</p>
        </div>`
      )
      .join("");
  }

  // Cargar stats automáticamente cuando ya haya campañas listadas.
  const originalFillCampaignSelects = fillCampaignSelects;
  fillCampaignSelects = function (list) {
    originalFillCampaignSelects(list);
    if (list.length) loadStats();
  };

  // ---------------------------------------------------------
  // Validar cupón
  // ---------------------------------------------------------
  function setupValidateForm() {
    el("validate-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const code = el("validate-code").value.trim();
      if (!code) return;

      const { data, error } = await client.rpc("validate_coupon", { p_code: code });
      const resultEl = el("validate-result");

      if (error || !data || !data.ok) {
        resultEl.hidden = false;
        resultEl.innerHTML = `<p class="empty-state">No se encontró ese cupón.</p>`;
        return;
      }

      resultEl.hidden = false;
      resultEl.innerHTML = `
        <p><strong>Cliente:</strong> ${escapeHtml(data.customer_name)}</p>
        <p><strong>Descuento:</strong> ${data.discount_percent}%</p>
        <p><strong>Estado:</strong> ${translateStatus(data.status)}</p>
        <p><strong>Vence:</strong> ${new Date(data.expires_at).toLocaleDateString("es-CO")}</p>
        ${
          data.status === "available"
            ? `<button class="btn btn--primary" id="mark-used-btn">✓ Marcar como utilizado</button>`
            : ""
        }
      `;

      const markBtn = document.getElementById("mark-used-btn");
      if (markBtn) {
        markBtn.addEventListener("click", async () => {
          const { data: markData, error: markError } = await client.rpc("mark_coupon_used", {
            p_coupon_id: data.id,
          });
          if (markError || !markData || !markData.ok) {
            alert("No se pudo marcar el cupón como utilizado.");
            return;
          }
          el("validate-form").dispatchEvent(new Event("submit"));
          loadCouponsTable();
        });
      }
    });
  }

  function translateStatus(status) {
    return { available: "Disponible", used: "Utilizado", expired: "Vencido" }[status] || status;
  }

  // ---------------------------------------------------------
  // Tabla de cupones
  // ---------------------------------------------------------
  async function loadCouponsTable() {
    const { data, error } = await client
      .from("coupons")
      .select("id, code, discount_percent, status, issued_at, expires_at, customers(full_name), qr_cards(token_value)")
      .order("issued_at", { ascending: false })
      .limit(300);

    if (error) {
      console.error(error);
      return;
    }

    const tbody = document.querySelector("#coupons-table tbody");
    tbody.innerHTML = (data || [])
      .map(
        (row) => `
        <tr>
          <td>${escapeHtml(row.customers ? row.customers.full_name : "")}</td>
          <td>${escapeHtml(row.code)}</td>
          <td>${row.discount_percent}%</td>
          <td>${new Date(row.issued_at).toLocaleDateString("es-CO")}</td>
          <td>${new Date(row.expires_at).toLocaleDateString("es-CO")}</td>
          <td><span class="status-pill status-${row.status}">${translateStatus(row.status)}</span></td>
          <td class="table-actions">
            ${row.status === "available" ? `<button class="btn btn--ghost btn--small" data-mark-id="${row.id}">Marcar usado</button>` : ""}
            ${row.qr_cards?.[0]?.token_value ? `<button class="btn btn--ghost btn--small" data-coupon-view="${row.qr_cards[0].token_value}">Ver QR</button><button class="btn btn--ghost btn--small" data-coupon-share="${row.qr_cards[0].token_value}">Compartir</button>` : ""}
            <button class="btn btn--danger btn--small" data-coupon-delete="${row.id}">Eliminar</button>
          </td>
        </tr>`
      )
      .join("");

    tbody.querySelectorAll("[data-coupon-view]").forEach((btn) => btn.addEventListener("click", () => {
      const url = `${new URL("../", window.location.href).toString()}?qr=${encodeURIComponent(btn.dataset.couponView)}`;
      window.open(url, "_blank", "noopener");
    }));
    tbody.querySelectorAll("[data-coupon-share]").forEach((btn) => btn.addEventListener("click", async () => {
      const url = `${new URL("../", window.location.href).toString()}?qr=${encodeURIComponent(btn.dataset.couponShare)}`;
      if (navigator.share) await navigator.share({ title: "Cupón Closet de Erimar", url }); else await navigator.clipboard.writeText(url);
    }));
    tbody.querySelectorAll("[data-coupon-delete]").forEach((btn) => btn.addEventListener("click", async () => {
      if (!confirm("¿Eliminar este cupón?")) return;
      const { error: deleteError } = await client.from("coupons").delete().eq("id", btn.dataset.couponDelete);
      if (deleteError) { alert("No se pudo eliminar el cupón."); return; }
      loadCouponsTable(); loadQrCards();
    }));
    tbody.querySelectorAll("[data-mark-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const { error: markError } = await client.rpc("mark_coupon_used", {
          p_coupon_id: btn.dataset.markId,
        });
        if (markError) {
          alert("No se pudo marcar el cupón como utilizado.");
          return;
        }
        loadCouponsTable();
      });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  boot();
})();
