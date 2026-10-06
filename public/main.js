const appContainer = document.getElementById("app");
const initialLoader = document.getElementById("initial-loader");
const DEFAULT_TENANT = "gutemberg";
const TOKEN_KEY = "menu-indoor-admin-token";
const REMEMBERED_TOKEN_KEY = "menu-indoor-admin-remembered-token";
const TOKEN_EXPIRY_KEY = "menu-indoor-admin-token-expires";

function defaultContent() {
  return {
    nomeEmpresa: "Gutemberg Lounge",
    logoUrl: "",
    slogan1: "Do Café da Manhã ao Happy Hour",
    slogan2: "Galeria Primavera",
    destaques: [
      {
        id: "d1",
        nome: "Café Especial Gutemberg",
        descricao: "Grãos selecionados, torra média, servido com pão de queijo.",
        preco: "12,90",
        imagemUrl: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=1600",
      },
      {
        id: "d2",
        nome: "Porção de Coxinhas",
        descricao: "12 unidades crocantes com molho da casa.",
        preco: "49,90",
        imagemUrl: "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=1600",
      },
    ],
    slideInterval: 8,
    promocoes: [
      { id: "p1", nome: "Chopp Brahma", preco: "14,90" },
      { id: "p2", nome: "Coxinhas Gutenberg", preco: "49,90" },
    ],
    textoRodape: "Do Café da Manhã ao Happy Hour | Galeria Primavera | Aceitamos Pix",
  };
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function validHttpUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function normalizeContent(value) {
  const defaults = defaultContent();
  const input = value && typeof value === "object" ? value : {};
  const items = (Array.isArray(input.destaques) ? input.destaques : defaults.destaques).slice(0, 30);
  const promos = (Array.isArray(input.promocoes) ? input.promocoes : defaults.promocoes).slice(0, 30);
  const interval = Number(input.slideInterval);
  return {
    nomeEmpresa: String(input.nomeEmpresa ?? defaults.nomeEmpresa).slice(0, 80),
    logoUrl: validHttpUrl(input.logoUrl),
    slogan1: String(input.slogan1 ?? defaults.slogan1).slice(0, 120),
    slogan2: String(input.slogan2 ?? defaults.slogan2).slice(0, 120),
    destaques: items.map((item) => ({
      id: String(item?.id || crypto.randomUUID()),
      nome: String(item?.nome ?? "").slice(0, 80),
      descricao: String(item?.descricao ?? "").slice(0, 240),
      preco: String(item?.preco ?? "").slice(0, 20),
      imagemUrl: validHttpUrl(item?.imagemUrl),
    })),
    slideInterval: Number.isFinite(interval) ? Math.min(60, Math.max(3, Math.round(interval))) : 8,
    promocoes: promos.map((item) => ({
      id: String(item?.id || crypto.randomUUID()),
      nome: String(item?.nome ?? "").slice(0, 80),
      preco: String(item?.preco ?? "").slice(0, 20),
    })),
    textoRodape: String(input.textoRodape ?? defaults.textoRodape).slice(0, 500),
  };
}

const pathSegments = window.location.pathname.split("/").filter(Boolean);
const tenantId = (pathSegments[0] || DEFAULT_TENANT).toLowerCase();
const isAdmin = new URLSearchParams(window.location.search).get("admin") === "1";
const storageKey = `menu-indoor-content:${tenantId}`;
const channel = "BroadcastChannel" in window ? new BroadcastChannel(`menu-indoor:${tenantId}`) : null;
let currentContent = defaultContent();
let stateVersion = 0;
let activeSlide = 0;
let slideTimer;
let pollTimer;
let cloudWarningShown = false;

function getSavedToken() {
  return localStorage.getItem(REMEMBERED_TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

function hasValidSavedToken() {
  const storage = localStorage.getItem(REMEMBERED_TOKEN_KEY) ? localStorage : sessionStorage;
  const token = storage.getItem(REMEMBERED_TOKEN_KEY) || storage.getItem(TOKEN_KEY);
  const expiresAt = Number(storage.getItem(TOKEN_EXPIRY_KEY));
  if (token && Number.isFinite(expiresAt) && expiresAt > Date.now()) return true;
  clearToken();
  return false;
}

function saveToken(token, remember, expiresAt) {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
  localStorage.removeItem(REMEMBERED_TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem(remember ? REMEMBERED_TOKEN_KEY : TOKEN_KEY, token);
  storage.setItem(TOKEN_EXPIRY_KEY, String(expiresAt));
}

function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
  localStorage.removeItem(REMEMBERED_TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
}

function readLocalContent() {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? normalizeContent(JSON.parse(raw)) : null;
  } catch (error) {
    console.warn("Não foi possível ler o conteúdo local salvo.", error);
    return null;
  }
}

function saveLocalContent(content) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(content));
  } catch (error) {
    throw new Error("Não foi possível salvar os dados neste dispositivo.", { cause: error });
  }
}

function adminUrl() {
  return `${window.location.origin}${window.location.pathname}?admin=1`;
}

function qrCodeUrl(size) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(adminUrl())}`;
}

function applyContent(content, { persist = false } = {}) {
  currentContent = normalizeContent(content);
  activeSlide = currentContent.destaques.length
    ? activeSlide % currentContent.destaques.length
    : 0;
  if (persist) saveLocalContent(currentContent);
  if (!isAdmin) renderTVContent();
}

function broadcastContent(content) {
  if (channel) channel.postMessage({ type: "content-updated", data: content });
}

async function fetchCloudState() {
  const knownVersion = stateVersion ? `?v=${stateVersion}` : "";
  const response = await fetch(`/api/state/${encodeURIComponent(tenantId)}${knownVersion}`, {
    cache: "no-store",
  });
  if (response.status === 204) return;
  if (!response.ok) throw new Error(`Falha ao sincronizar com o servidor (HTTP ${response.status}).`);
  const payload = await response.json();
  if (Number(payload.version) !== stateVersion) {
    stateVersion = Number(payload.version) || 0;
    applyContent(payload.data, { persist: true });
    broadcastContent(currentContent);
  }
}

function startCloudPolling() {
  const poll = () => {
    fetchCloudState().then(() => {
      cloudWarningShown = false;
    }).catch((error) => {
      if (!cloudWarningShown) {
        console.warn("Sincronização em nuvem indisponível; usando o conteúdo deste dispositivo.", error);
        cloudWarningShown = true;
      }
    });
  };
  poll();
  pollTimer = window.setInterval(poll, 3000);
}

async function saveToCloud(content) {
  const token = getSavedToken();
  if (!token) throw new Error("Sua sessão expirou. Entre novamente no painel.");
  const response = await fetch(`/api/state/${encodeURIComponent(tenantId)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify({ data: content }),
  });
  if (response.status === 401) {
    clearToken();
    throw new Error("Sua sessão expirou. Entre novamente no painel.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Falha ao salvar na nuvem (HTTP ${response.status}).`);
  }
  const payload = await response.json();
  stateVersion = Number(payload.version) || stateVersion;
  applyContent(payload.data, { persist: true });
  broadcastContent(currentContent);
}

function initApp() {
  if (isAdmin) {
    document.body.classList.add("admin-mode");
    if (hasValidSavedToken()) {
      currentContent = readLocalContent() || defaultContent();
      renderAdminPanel();
      fetch(`/api/state/${encodeURIComponent(tenantId)}`, { cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error(`Falha ao carregar dados da TV (HTTP ${response.status}).`);
          return response.json();
        })
        .then((payload) => {
          stateVersion = Number(payload.version) || 0;
          applyContent(payload.data);
          saveLocalContent(currentContent);
          renderAdminPanel();
        })
        .catch((error) => console.warn("Não foi possível atualizar o painel com dados da nuvem.", error));
    } else {
      renderAdminLogin();
    }
  } else {
    applyContent(readLocalContent() || currentContent);
    renderTVPlayer();
    startCloudPolling();
  }
  if (initialLoader) {
    initialLoader.style.opacity = "0";
    window.setTimeout(() => initialLoader.remove(), 500);
  }
}

function renderTVPlayer() {
  appContainer.innerHTML = `
    <div id="tv-player-container" class="tv-layout">
      <header class="tv-header">
        <div class="brand-info">
          <div class="logo-placeholder" id="tv-header-logo">GL</div>
          <h1 id="tv-company-name"></h1>
        </div>
        <div class="slogans">
          <span id="tv-slogan-1"></span>
          <span id="tv-slogan-2"></span>
        </div>
      </header>
      <main class="tv-body">
        <section class="tv-main-display" id="tv-main-display"></section>
        <aside class="tv-sidebar">
          <div class="sidebar-logo"><div class="logo-box" id="tv-sidebar-logo">LOGO DA EMPRESA</div></div>
          <div class="sidebar-qr-panel">
            <h3>PAINEL ADMIN</h3>
            <div class="qr-code-panel"><img src="${qrCodeUrl(220)}" alt="QR Code para abrir o painel administrativo" class="qr-code" /></div>
            <p>Escaneie para abrir o painel.</p>
          </div>
          <div class="sidebar-promo">
            <h3>PROMO / DESTAQUE</h3>
            <ul id="tv-promo-list"></ul>
          </div>
        </aside>
      </main>
      <footer class="tv-footer"><div class="marquee-wrapper"><p class="marquee-text" id="tv-footer-text"></p></div></footer>
    </div>
  `;
  renderTVContent();
}

function renderTVContent() {
  const company = document.getElementById("tv-company-name");
  if (!company) return;
  company.textContent = currentContent.nomeEmpresa;
  document.getElementById("tv-slogan-1").textContent = currentContent.slogan1;
  document.getElementById("tv-slogan-2").textContent = currentContent.slogan2;
  document.getElementById("tv-footer-text").textContent = currentContent.textoRodape;

  const headerLogo = document.getElementById("tv-header-logo");
  const sidebarLogo = document.getElementById("tv-sidebar-logo");
  if (currentContent.logoUrl) {
    headerLogo.innerHTML = `<img src="${escapeHTML(currentContent.logoUrl)}" alt="" />`;
    sidebarLogo.innerHTML = `<img src="${escapeHTML(currentContent.logoUrl)}" alt="Logo ${escapeHTML(currentContent.nomeEmpresa)}" />`;
  } else {
    headerLogo.textContent = "GL";
    sidebarLogo.textContent = "LOGO DA EMPRESA";
  }

  const list = document.getElementById("tv-promo-list");
  list.replaceChildren(...currentContent.promocoes.map((item) => {
    const row = document.createElement("li");
    row.textContent = item.preco ? `${item.nome} R$ ${item.preco}` : item.nome;
    return row;
  }));

  renderCurrentSlide();
  window.clearInterval(slideTimer);
  if (currentContent.destaques.length > 1) {
    slideTimer = window.setInterval(() => {
      activeSlide = (activeSlide + 1) % currentContent.destaques.length;
      renderCurrentSlide();
    }, currentContent.slideInterval * 1000);
  }
}

function renderCurrentSlide() {
  const display = document.getElementById("tv-main-display");
  if (!display) return;
  const item = currentContent.destaques[activeSlide];
  if (!item) {
    display.innerHTML = '<div class="product-card-active"><h2 class="product-title">Adicione um destaque pelo painel</h2></div>';
    return;
  }
  display.replaceChildren();
  if (item.imagemUrl) {
    const image = document.createElement("img");
    image.className = "slide-background";
    image.src = item.imagemUrl;
    image.alt = "";
    display.append(image);
  }
  display.insertAdjacentHTML("beforeend", `
    <div class="product-card-active">
      <h2 class="product-title">${escapeHTML(item.nome)}</h2>
      <p class="product-desc">${escapeHTML(item.descricao)}</p>
      <p class="product-price">R$ ${escapeHTML(item.preco)}</p>
      <div class="slide-dots" aria-label="Destaque ${activeSlide + 1} de ${currentContent.destaques.length}">
        ${currentContent.destaques.map((_, index) => `<span class="${index === activeSlide ? "active" : ""}"></span>`).join("")}
      </div>
    </div>
  `);
}

function renderAdminLogin(errorMessage = "") {
  appContainer.innerHTML = `
    <main class="admin-login-layout">
      <section class="admin-login-card">
        <div class="login-header">
          <span class="login-badge">GUTEMBERG LOUNGE</span>
          <h1>Painel administrativo</h1>
          <p>Entre para atualizar o conteúdo da sua TV.</p>
        </div>
        <form id="admin-login-form">
          <div class="form-group">
            <label for="admin-username">Usuário</label>
            <input id="admin-username" name="username" autocomplete="username" required placeholder="Seu usuário" />
          </div>
          <div class="form-group">
            <label for="admin-password">Senha</label>
            <input id="admin-password" name="password" type="password" autocomplete="current-password" required placeholder="Sua senha" />
          </div>
          <label class="remember-option"><input type="checkbox" name="remember" /> <span>Lembrar neste dispositivo</span></label>
          <p id="admin-login-feedback" class="login-feedback" role="status">${escapeHTML(errorMessage)}</p>
          <button class="btn-primary login-submit" type="submit">Entrar no painel</button>
        </form>
      </section>
    </main>
  `;

  const form = document.getElementById("admin-login-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const feedback = document.getElementById("admin-login-feedback");
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    feedback.textContent = "Validando acesso...";
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.elements.username.value.trim(),
          password: form.elements.password.value,
          remember: form.elements.remember.checked,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível entrar.");
      saveToken(payload.token, form.elements.remember.checked, payload.expiresAt);
      currentContent = readLocalContent() || defaultContent();
      try {
        const state = await fetch(`/api/state/${encodeURIComponent(tenantId)}`, { cache: "no-store" });
        if (!state.ok) throw new Error(`Falha ao carregar dados da TV (HTTP ${state.status}).`);
        const statePayload = await state.json();
        stateVersion = Number(statePayload.version) || 0;
        currentContent = normalizeContent(statePayload.data);
        saveLocalContent(currentContent);
      } catch (error) {
        console.warn("Não foi possível carregar os dados na nuvem; conteúdo local carregado.", error);
      }
      renderAdminPanel();
    } catch (error) {
      feedback.textContent = error.message || "Erro ao validar o acesso.";
      button.disabled = false;
    }
  });
}

function renderAdminPanel() {
  appContainer.innerHTML = `
    <main class="admin-layout">
      <header class="admin-header admin-header-row">
        <div><span class="setup-badge">PAINEL DA TV</span><h1>Controle de conteúdo</h1><p class="tenant-tag">${escapeHTML(currentContent.nomeEmpresa)}</p></div>
        <button type="button" class="logout-btn" id="admin-logout-btn">Sair</button>
      </header>
      <nav class="admin-tabs" aria-label="Seções do painel">
        <button type="button" class="tab-btn active" data-tab="identidade">Identidade</button>
        <button type="button" class="tab-btn" data-tab="destaques">Vitrine</button>
        <button type="button" class="tab-btn" data-tab="promocoes">Promoções</button>
      </nav>
      <form id="admin-content-form">
        <section class="admin-section tab-content active" id="tab-identidade">
          <h2>Cabeçalho e rodapé</h2>
          <div class="form-group"><label for="company-name">Nome da empresa</label><input id="company-name" name="nomeEmpresa" maxlength="80" value="${escapeHTML(currentContent.nomeEmpresa)}" /></div>
          <div class="form-group"><label for="logo-url">URL da logo (opcional)</label><input id="logo-url" name="logoUrl" inputmode="url" placeholder="https://..." value="${escapeHTML(currentContent.logoUrl)}" /></div>
          <div class="form-group"><label for="slogan-one">Slogan 1</label><input id="slogan-one" name="slogan1" maxlength="120" value="${escapeHTML(currentContent.slogan1)}" /></div>
          <div class="form-group"><label for="slogan-two">Slogan 2</label><input id="slogan-two" name="slogan2" maxlength="120" value="${escapeHTML(currentContent.slogan2)}" /></div>
          <div class="form-group"><label for="footer-text">Letreiro do rodapé</label><textarea id="footer-text" name="textoRodape" maxlength="500" rows="3">${escapeHTML(currentContent.textoRodape)}</textarea></div>
        </section>
        <section class="admin-section tab-content" id="tab-destaques" hidden>
          <div class="section-heading"><div><h2>Vitrine rotativa</h2><p>Até 30 produtos em destaque.</p></div><button type="button" class="btn-secondary" id="add-highlight">＋ Adicionar</button></div>
          <div class="form-group"><label for="slide-interval">Tempo de cada destaque (segundos)</label><input id="slide-interval" type="number" min="3" max="60" value="${currentContent.slideInterval}" /></div>
          <div id="highlight-list" class="editor-list"></div>
        </section>
        <section class="admin-section tab-content" id="tab-promocoes" hidden>
          <div class="section-heading"><div><h2>Promoções laterais</h2><p>Organize os itens mostrados na TV.</p></div><button type="button" class="btn-secondary" id="add-promotion">＋ Adicionar</button></div>
          <div id="promotion-list" class="editor-list"></div>
        </section>
        <div class="save-dock">
          <p id="save-feedback" role="status">As alterações só aparecem na TV depois de salvar.</p>
          <button type="submit" class="btn-save">🚀 Salvar e Atualizar TV em Tempo Real</button>
        </div>
      </form>
    </main>
  `;
  renderEditors();
  setupAdminTabs();
  document.getElementById("admin-logout-btn").addEventListener("click", () => {
    clearToken();
    renderAdminLogin();
  });
  document.getElementById("add-highlight").addEventListener("click", () => {
    const list = document.getElementById("highlight-list");
    if (list.children.length >= 30) return setSaveFeedback("Limite de 30 destaques atingido.", true);
    list.insertAdjacentHTML("beforeend", highlightEditor({ id: crypto.randomUUID(), nome: "", descricao: "", preco: "", imagemUrl: "" }, list.children.length));
  });
  document.getElementById("add-promotion").addEventListener("click", () => {
    const list = document.getElementById("promotion-list");
    if (list.children.length >= 30) return setSaveFeedback("Limite de 30 promoções atingido.", true);
    list.insertAdjacentHTML("beforeend", promotionEditor({ id: crypto.randomUUID(), nome: "", preco: "" }, list.children.length));
  });
  document.getElementById("admin-content-form").addEventListener("submit", saveAdminContent);
}

function highlightEditor(item, index) {
  return `
    <article class="editor-card highlight-editor" data-id="${escapeHTML(item.id)}">
      <div class="editor-card-heading"><strong>Destaque ${index + 1}</strong><div class="editor-actions">
        <button type="button" class="icon-btn move-up" aria-label="Mover para cima" ${index === 0 ? "disabled" : ""}>↑</button>
        <button type="button" class="icon-btn move-down" aria-label="Mover para baixo">↓</button>
        <button type="button" class="icon-btn danger remove-item" aria-label="Remover destaque">Remover</button>
      </div></div>
      <div class="form-group"><label>Nome do produto</label><input data-field="nome" maxlength="80" value="${escapeHTML(item.nome)}" /></div>
      <div class="form-group"><label>Descrição curta</label><textarea data-field="descricao" maxlength="240" rows="2">${escapeHTML(item.descricao)}</textarea></div>
      <div class="editor-two-columns">
        <div class="form-group"><label>Preço (R$)</label><input data-field="preco" inputmode="decimal" maxlength="20" placeholder="12,90" value="${escapeHTML(item.preco)}" /></div>
        <div class="form-group"><label>URL da imagem</label><input data-field="imagemUrl" inputmode="url" placeholder="https://..." value="${escapeHTML(item.imagemUrl)}" /></div>
      </div>
    </article>
  `;
}

function promotionEditor(item, index) {
  return `
    <article class="editor-card promotion-editor" data-id="${escapeHTML(item.id)}">
      <div class="editor-card-heading"><strong>Promoção ${index + 1}</strong><div class="editor-actions">
        <button type="button" class="icon-btn move-up" aria-label="Mover para cima" ${index === 0 ? "disabled" : ""}>↑</button>
        <button type="button" class="icon-btn move-down" aria-label="Mover para baixo">↓</button>
        <button type="button" class="icon-btn danger remove-item" aria-label="Remover promoção">Remover</button>
      </div></div>
      <div class="editor-two-columns">
        <div class="form-group"><label>Nome</label><input data-field="nome" maxlength="80" value="${escapeHTML(item.nome)}" /></div>
        <div class="form-group"><label>Preço (R$)</label><input data-field="preco" inputmode="decimal" maxlength="20" placeholder="14,90" value="${escapeHTML(item.preco)}" /></div>
      </div>
    </article>
  `;
}

function renderEditors() {
  document.getElementById("highlight-list").innerHTML = currentContent.destaques
    .map(highlightEditor).join("");
  document.getElementById("promotion-list").innerHTML = currentContent.promocoes
    .map(promotionEditor).join("");

  document.querySelectorAll(".editor-list").forEach((list) => {
    list.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      const card = button.closest(".editor-card");
      if (button.classList.contains("remove-item")) {
        card.remove();
      } else if (button.classList.contains("move-up") && card.previousElementSibling) {
        list.insertBefore(card, card.previousElementSibling);
      } else if (button.classList.contains("move-down") && card.nextElementSibling) {
        list.insertBefore(card.nextElementSibling, card);
      }
      updateEditorPositions(list);
    });
  });
}

function updateEditorPositions(list) {
  [...list.children].forEach((card, index) => {
    card.querySelector(".editor-card-heading strong").textContent =
      `${card.classList.contains("highlight-editor") ? "Destaque" : "Promoção"} ${index + 1}`;
    card.querySelector(".move-up").disabled = index === 0;
    card.querySelector(".move-down").disabled = index === list.children.length - 1;
  });
}

function setupAdminTabs() {
  document.querySelectorAll(".tab-btn").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((tab) => tab.classList.toggle("active", tab === button));
      document.querySelectorAll(".tab-content").forEach((section) => {
        const selected = section.id === `tab-${button.dataset.tab}`;
        section.hidden = !selected;
        section.classList.toggle("active", selected);
      });
    });
  });
}

function readEditorList(selector, fields) {
  return [...document.querySelectorAll(selector)].map((card) => {
    const item = { id: card.dataset.id };
    fields.forEach((field) => {
      item[field] = card.querySelector(`[data-field="${field}"]`).value.trim();
    });
    return item;
  });
}

function setSaveFeedback(message, isError = false) {
  const feedback = document.getElementById("save-feedback");
  if (feedback) {
    feedback.textContent = message;
    feedback.classList.toggle("error", isError);
  }
}

async function saveAdminContent(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector(".btn-save");
  const companyName = form.elements.nomeEmpresa.value.trim();
  const emptyHighlight = [...document.querySelectorAll(".highlight-editor [data-field='nome']")]
    .find((input) => !input.value.trim());
  const emptyPromotion = [...document.querySelectorAll(".promotion-editor [data-field='nome']")]
    .find((input) => !input.value.trim());
  if (!companyName) {
    document.querySelector('.tab-btn[data-tab="identidade"]').click();
    form.elements.nomeEmpresa.focus();
    return setSaveFeedback("Informe o nome da empresa.", true);
  }
  if (emptyHighlight) {
    document.querySelector('.tab-btn[data-tab="destaques"]').click();
    emptyHighlight.focus();
    return setSaveFeedback("Informe o nome de todos os destaques.", true);
  }
  if (emptyPromotion) {
    document.querySelector('.tab-btn[data-tab="promocoes"]').click();
    emptyPromotion.focus();
    return setSaveFeedback("Informe o nome de todas as promoções.", true);
  }
  const nextContent = normalizeContent({
    nomeEmpresa: companyName,
    logoUrl: form.elements.logoUrl.value.trim(),
    slogan1: form.elements.slogan1.value.trim(),
    slogan2: form.elements.slogan2.value.trim(),
    textoRodape: form.elements.textoRodape.value.trim(),
    destaques: readEditorList(".highlight-editor", ["nome", "descricao", "preco", "imagemUrl"]),
    promocoes: readEditorList(".promotion-editor", ["nome", "preco"]),
    slideInterval: document.getElementById("slide-interval").value,
  });

  const badUrl = [...form.querySelectorAll("#logo-url, .highlight-editor [data-field='imagemUrl']")]
    .find((input) => input.value && !validHttpUrl(input.value));
  if (badUrl) {
    const section = badUrl.closest("#tab-identidade, #tab-destaques");
    document.querySelector(`.tab-btn[data-tab="${section.id.replace("tab-", "")}"]`).click();
    badUrl.focus();
    return setSaveFeedback("Informe uma URL válida começando com http:// ou https://.", true);
  }

  button.disabled = true;
  setSaveFeedback("Salvando conteúdo e sincronizando com a TV...");
  try {
    saveLocalContent(nextContent);
    broadcastContent(nextContent);
    await saveToCloud(nextContent);
    setSaveFeedback("Conteúdo salvo. A TV será atualizada automaticamente.");
  } catch (error) {
    setSaveFeedback(`${error.message} Os dados ficaram salvos neste dispositivo; a TV em outra rede só atualizará após a sincronização em nuvem.`, true);
  } finally {
    button.disabled = false;
  }
}

if (channel) {
  channel.addEventListener("message", (event) => {
    if (event.data?.type === "content-updated") applyContent(event.data.data, { persist: true });
  });
}

window.addEventListener("storage", (event) => {
  if (event.key === storageKey && event.newValue && !isAdmin) {
    try {
      applyContent(JSON.parse(event.newValue));
    } catch (error) {
      console.warn("Atualização local recebida em formato inválido.", error);
    }
  }
});

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
