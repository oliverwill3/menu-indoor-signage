// 1. Captura de elementos do DOM e estado da aplicação
const appContainer = document.getElementById('app');
const initialLoader = document.getElementById('initial-loader');

// Estrutura de dados padrão (Fallback caso não haja conexão imediata)
let currentTenantData = {
  id: 'gutemberg',
  nomeEmpresa: 'Gutemberg Lounge',
  slogan1: 'Do Café da Manhã ao Happy Hour',
  slogan2: 'Galeria Primavera',
  textoRodape: 'Do Café da Manhã ao Happy Hour | Galeria Primavera | Aceitamos Pix',
  corFundo: '#000000',
  corTexto: '#ffffff',
  corBorda: '#d4af37'
};

// 2. Detetor de Rota e Dispositivo
function initApp() {
  const urlParams = new URLSearchParams(window.location.search);
  const isAdmin = urlParams.get('admin') === '1';
  
  // Extrai o tenant_id da URL (Ex: domain.com/gutemberg -> 'gutemberg')
  const pathSegments = window.location.pathname.split('/').filter(Boolean);
  const tenantId = pathSegments[0] || 'gutemberg';

  console.log(`[App Init] Tenant: ${tenantId} | Modo Admin: ${isAdmin}`);

  // Oculta o loader inicial
  if (initialLoader) {
    initialLoader.style.opacity = '0';
    setTimeout(() => initialLoader.remove(), 500);
  }

  // Renderiza a vista correspondente
  if (isAdmin) {
    document.body.classList.add('admin-mode');
    renderAdminPanel(tenantId);
  } else {
    renderTVPlayer(tenantId);
  }
}

// 3. Renderização da Vista da TV (Player 16:9)
function renderTVPlayer(tenantId) {
  appContainer.innerHTML = `
    <div id="tv-player-container" class="tv-layout">
      <!-- Região 1: Header Top Bar -->
      <header class="tv-header">
        <div class="brand-info">
          <div class="logo-placeholder">LOGO</div>
          <h1 id="tv-company-name">${currentTenantData.nomeEmpresa}</h1>
        </div>
        <div class="slogans">
          <span id="tv-slogan-1">${currentTenantData.slogan1}</span>
          <span id="tv-slogan-2">${currentTenantData.slogan2}</span>
        </div>
      </header>

      <!-- Região Central (Main + Sidebar Destaques) -->
      <main class="tv-body">
        <!-- Região 2: Exibição Principal de Produtos -->
        <section class="tv-main-display" id="tv-main-display">
          <div class="product-card-active">
            <h2 class="product-title">Carregando cardápio...</h2>
            <p class="product-desc">Aguarde a sincronização de dados.</p>
          </div>
        </section>

        <!-- Região 3: Lateral de Branding e Destaques -->
        <aside class="tv-sidebar">
          <div class="sidebar-logo">
            <div class="logo-box">LOGO DA EMPRESA</div>
          </div>
          <div class="sidebar-promo">
            <h3>PROMO / DESTAQUE</h3>
            <ul id="tv-promo-list">
              <li>Chopp Brahma R$ 14,90</li>
              <li>Coxinhas Gutenberg R$ 49,90</li>
            </ul>
          </div>
        </aside>
      </main>

      <!-- Região 4: Faixa de Rodapé Marquee -->
      <footer class="tv-footer">
        <div class="marquee-wrapper">
          <p class="marquee-text" id="tv-footer-text">${currentTenantData.textoRodape}</p>
        </div>
      </footer>
    </div>
  `;
}

// 4. Renderização da Vista do Painel Mobile (?admin=1)
function renderAdminPanel(tenantId) {
  appContainer.innerHTML = `
    <div id="admin-panel-container" class="admin-layout">
      <header class="admin-header">
        <h2>PAINEL DE CONTROLE</h2>
        <p class="tenant-tag">${currentTenantData.nomeEmpresa}</p>
      </header>

      <!-- Navegação por Abas -->
      <nav class="admin-tabs">
        <button class="tab-btn active" data-tab="id-visual">ID VISUAL</button>
        <button class="tab-btn" data-tab="produtos">PRODUTOS</button>
        <button class="tab-btn" data-tab="plus">PLUS +</button>
      </nav>

      <!-- Conteúdo das Abas -->
      <main class="admin-content">
        <!-- Aba ID VISUAL -->
        <section id="tab-id-visual" class="tab-content active">
          <h3>CONFIGURAÇÃO DA LOJA</h3>
          <div class="form-group">
            <label>Nome da Empresa</label>
            <input type="text" value="${currentTenantData.nomeEmpresa}" />
          </div>
          <div class="form-group">
            <label>Slogan</label>
            <input type="text" value="${currentTenantData.slogan1}" />
          </div>
          <div class="form-group">
            <label>Texto do Rodapé</label>
            <input type="text" value="${currentTenantData.textoRodape}" />
          </div>
        </section>

        <!-- Aba PRODUTOS -->
        <section id="tab-produtos" class="tab-content" style="display:none;">
          <h3>PRODUTOS & CATEGORIAS</h3>
          <button class="btn-primary">+ Adicionar Categoria</button>
          <button class="btn-primary">+ Adicionar Item</button>
        </section>

        <!-- Aba PLUS + -->
        <section id="tab-plus" class="tab-content" style="display:none;">
          <div class="sub-tabs">
            <button class="sub-tab-btn active">VISUAL</button>
            <button class="sub-tab-btn">AVALIAÇÕES</button>
            <button class="sub-tab-btn">DIVULGAÇÕES</button>
            <button class="sub-tab-btn">INFORMATIVO</button>
          </div>
        </section>
      </main>
    </div>
  `;

  // Lógica de alternância de abas no painel mobile
  setupAdminTabs();
}

// Alternância de abas do celular
function setupAdminTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
      
      tab.classList.add('active');
      const target = tab.getAttribute('data-tab');
      document.getElementById(`tab-${target}`).style.display = 'block';
    });
  });
}

// Inicializa a aplicação ao carregar a página
window.addEventListener('DOMContentLoaded', initApp);