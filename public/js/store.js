import { clone } from './utils.js';

// Conteúdo padrão usado enquanto não há dados salvos na nuvem
export function defaultContent() {
  return {
    nomeEmpresa: 'Gutemberg Lounge',
    logoUrl: '',
    slogan1: 'Do Café da Manhã ao Happy Hour',
    slogan2: 'Galeria Primavera',
    destaques: [
      {
        id: 'd1',
        nome: 'Café Especial Gutemberg',
        descricao: 'Grãos selecionados, torra média, servido com pão de queijo.',
        preco: '12,90',
        imagemUrl: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=1600',
      },
      {
        id: 'd2',
        nome: 'Porção de Coxinhas',
        descricao: '12 unidades crocantes com molho da casa.',
        preco: '49,90',
        imagemUrl: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=1600',
      },
    ],
    slideInterval: 8,
    promocoes: [
      { id: 'p1', nome: 'Chopp Brahma', preco: '14,90' },
      { id: 'p2', nome: 'Coxinhas Gutenberg', preco: '49,90' },
    ],
    textoRodape: 'Do Café da Manhã ao Happy Hour | Galeria Primavera | Aceitamos Pix',
  };
}

const POLL_INTERVAL_MS = 4000;

// Sincronização em três camadas:
// 1. BroadcastChannel  -> abas/janelas abertas no mesmo navegador (instantâneo)
// 2. localStorage      -> cache offline e evento "storage" entre abas
// 3. Netlify Database  -> nuvem, para a TV e o telemóvel em dispositivos diferentes
export function createStore(tenantId, { onChange } = {}) {
  const cacheKey = `signage:${tenantId}:state`;
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel(`signage:${tenantId}`) : null;
  let state = readCache() || { data: defaultContent(), version: -1 };
  let pollTimer = null;

  function readCache() {
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey));
      return cached && cached.data ? cached : null;
    } catch {
      return null;
    }
  }

  function writeCache(next) {
    try {
      localStorage.setItem(cacheKey, JSON.stringify(next));
    } catch {
      // Armazenamento cheio ou bloqueado: a sincronização em nuvem continua a funcionar
    }
  }

  function apply(next, { broadcast = false } = {}) {
    if (!next || !next.data) return;
    // Ignora versões mais antigas, exceto alterações locais enviadas sem ligação à nuvem
    if (!next.local && next.version < state.version) return;
    state = { data: next.data, version: next.version, local: Boolean(next.local) };
    writeCache(state);
    if (broadcast && channel) channel.postMessage(state);
    onChange?.(clone(state.data), state);
  }

  async function fetchRemote() {
    const known = state.local ? '' : `?v=${state.version}`;
    const res = await fetch(`/api/state/${encodeURIComponent(tenantId)}${known}`, { cache: 'no-store' });
    if (res.status === 204) return false;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const remote = await res.json();
    if (state.local && remote.version <= state.version) return false;
    apply({ data: remote.data, version: remote.version });
    return true;
  }

  async function save(data, token) {
    const res = await fetch(`/api/state/${encodeURIComponent(tenantId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ data }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(body.error || `Erro ${res.status} ao salvar.`);
      error.status = res.status;
      throw error;
    }
    apply({ data: body.data, version: body.version }, { broadcast: true });
    return body;
  }

  // Sem nuvem: entrega a alteração pelo menos às TVs abertas neste navegador
  function saveLocalOnly(data) {
    apply({ data, version: state.version, local: true }, { broadcast: true });
  }

  function startLiveUpdates() {
    channel?.addEventListener('message', (event) => apply(event.data));
    window.addEventListener('storage', (event) => {
      if (event.key !== cacheKey || !event.newValue) return;
      try {
        apply(JSON.parse(event.newValue));
      } catch {
        // Valor corrompido no cache; ignorado
      }
    });

    const tick = async () => {
      if (!document.hidden) {
        try {
          await fetchRemote();
        } catch (err) {
          console.warn('[Sync] Falha ao consultar a nuvem:', err.message);
        }
      }
      pollTimer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();
  }

  return {
    get data() {
      return clone(state.data);
    },
    get version() {
      return state.version;
    },
    fetchRemote,
    save,
    saveLocalOnly,
    startLiveUpdates,
    stop() {
      clearTimeout(pollTimer);
      channel?.close();
    },
  };
}

// Sessão do painel: localStorage com "Lembrar neste dispositivo", senão sessionStorage
const AUTH_KEY = 'signage:auth';

export const session = {
  get() {
    for (const storage of [localStorage, sessionStorage]) {
      try {
        const auth = JSON.parse(storage.getItem(AUTH_KEY));
        if (auth?.token && auth.expiresAt > Date.now()) return auth;
        storage.removeItem(AUTH_KEY);
      } catch {
        storage.removeItem(AUTH_KEY);
      }
    }
    return null;
  },
  set(auth, remember) {
    this.clear();
    (remember ? localStorage : sessionStorage).setItem(AUTH_KEY, JSON.stringify(auth));
  },
  clear() {
    localStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(AUTH_KEY);
  },
};

export async function login(username, password, remember) {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, remember }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Não foi possível entrar.');
  session.set(body, remember);
  return body;
}
