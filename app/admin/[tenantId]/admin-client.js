"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseFirestore } from "../../../src/lib/firebase.js";

const TENANT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;
const COLLECTIONS = {
  produtos: {
    title: "Produtos",
    add: () => ({
      nome: "",
      descricao: "",
      categoria: "",
      preco: "",
      preco_anterior: "",
      imagem: "",
      selo: "",
      ativo: true,
      destaque: true,
      promocional: false,
      ordem: 1,
      tempo_exibicao: 8,
    }),
  },
  promocoes: {
    title: "Promoções",
    add: () => ({ nome: "", preco: "", ativo: true, ordem: 1 }),
  },
  eventos: {
    title: "Eventos",
    add: () => ({ titulo: "", data: "", imagem: "", ativo: true, ordem: 1 }),
  },
  avaliacoes: {
    title: "Avaliações",
    add: () => ({ autor: "", nota: 5, texto: "" }),
  },
  anuncios_terceiros: {
    title: "Anúncios de terceiros",
    add: () => ({
      imagem: "",
      link: "",
      tempo_exibicao: 8,
      data_inicio: "",
      data_fim: "",
      ativo: true,
      ordem: 1,
    }),
  },
  telas: {
    title: "Telas",
    add: () => ({
      titulo: "",
      descricao: "",
      imagem: "",
      preco: "",
      produtoId: "",
      tempo_exibicao: 8,
      ativo: true,
      ordem: 1,
    }),
  },
};

function makeId() {
  return crypto.randomUUID();
}

function entryKey(collectionName, id) {
  return `${collectionName}/${id}`;
}

function TextField({ label, value, onChange, type = "text", ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        {...props}
      />
    </label>
  );
}

function SwitchField({ label, checked, onChange }) {
  return (
    <label className="switch-field">
      <input
        type="checkbox"
        checked={checked !== false}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

export default function AdminClient({ tenantId }) {
  const router = useRouter();
  const [auth, setAuth] = useState(null);
  const [db, setDb] = useState(null);
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [tenantExists, setTenantExists] = useState(false);
  const [tenantLoaded, setTenantLoaded] = useState(false);
  const [layoutConfigured, setLayoutConfigured] = useState(false);
  const [publishedAt, setPublishedAt] = useState(null);
  const [hasPublishedPlaylist, setHasPublishedPlaylist] = useState(false);
  const [settings, setSettings] = useState({});
  const [settingsDraft, setSettingsDraft] = useState({});
  const [entries, setEntries] = useState({});
  const [drafts, setDrafts] = useState({});
  const [tab, setTab] = useState("configuracoes");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const validTenantId = TENANT_ID_PATTERN.test(tenantId);

  useEffect(() => {
    if (!validTenantId) {
      setError("O identificador do tenant não é válido.");
      return undefined;
    }
    try {
      const firebaseAuth = getFirebaseAuth();
      setAuth(firebaseAuth);
      setDb(getFirebaseFirestore());
      return onAuthStateChanged(firebaseAuth, (currentUser) => {
        setUser(currentUser);
        setAuthReady(true);
        setAuthorized(false);
        setCanEdit(false);
        setError("");
        setMessage("");
      }, (authError) => {
        setError(`Falha na autenticação: ${authError.message}`);
        setAuthReady(true);
      });
    } catch (firebaseError) {
      setError(firebaseError instanceof Error ? firebaseError.message : "Falha ao iniciar o Firebase.");
      return undefined;
    }
  }, [validTenantId]);

  useEffect(() => {
    if (authReady && !user && validTenantId) {
      router.replace(`/login?tenantId=${encodeURIComponent(tenantId)}`);
    }
  }, [authReady, router, tenantId, user, validTenantId]);

  useEffect(() => {
    if (!db || !user || !validTenantId) return undefined;
    let active = true;
    let unsubscribe;

    async function authorizeUser() {
      try {
        const token = await user.getIdTokenResult();
        const isSuperAdmin = token.claims.role === "superAdmin"
          && token.claims.email_verified === true
          && token.claims.firebase?.sign_in_provider === "google.com";
        if (!active) return;
        if (isSuperAdmin) {
          setAuthorized(true);
          setCanEdit(true);
          setError("");
          return;
        }

        unsubscribe = onSnapshot(
          doc(db, "tenant_admins", tenantId, "users", user.uid),
          (snapshot) => {
            const membership = snapshot.data();
            const memberIsActive = snapshot.exists() && membership?.ativo === true;
            if (memberIsActive && membership?.isFirstAccess === true) {
              router.replace(`/first-access?tenantId=${encodeURIComponent(tenantId)}`);
              setAuthorized(false);
              return;
            }
            setAuthorized(memberIsActive);
            setCanEdit(["owner", "admin", "editor"].includes(membership?.role ?? "owner"));
            if (!snapshot.exists()) {
              setError("Esta conta ainda não tem permissão para administrar este tenant.");
            } else if (!memberIsActive) {
              setError("O acesso desta conta foi desativado.");
            } else {
              setError("");
            }
          },
          (snapshotError) => setError(`Falha ao verificar a permissão: ${snapshotError.message}`)
        );
      } catch (authError) {
        if (active) {
          setAuthorized(false);
          setCanEdit(false);
          setError(`Falha ao verificar a permissão: ${authError.message}`);
        }
      }
    }

    authorizeUser();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [db, router, tenantId, user, validTenantId]);

  useEffect(() => {
    if (!user || !authorized || !validTenantId) return undefined;
    let active = true;
    setTenantLoaded(false);

    async function loadDraft() {
      try {
        const token = await user.getIdToken();
        const response = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}/playlist`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Falha ao carregar o tenant.");
        if (!active) return;

        const draftSettings = result.draft?.configuracoes ?? {};
        setTenantExists(true);
        setTenantLoaded(true);
        setLayoutConfigured(result.layoutConfigurado === true);
        setHasPublishedPlaylist(result.hasPublishedPlaylist === true);
        setPublishedAt(result.publishedAt ?? null);
        setSettings(draftSettings);
        setSettingsDraft({
          ...draftSettings,
          avisos_rodape_texto: (draftSettings.avisos_rodape ?? []).join("\n"),
        });
        setEntries(Object.fromEntries(Object.keys(COLLECTIONS).map((name) => [name, result.draft?.[name] ?? []])));
        setDrafts({});
      } catch (loadError) {
        if (active) {
          setTenantLoaded(true);
          setError(`Falha ao carregar o rascunho: ${loadError.message}`);
        }
      }
    }

    loadDraft();
    return () => {
      active = false;
    };
  }, [authorized, tenantId, user, validTenantId]);

  const visibleEntries = [
    ...(entries[tab] ?? []),
    ...Object.entries(drafts)
      .filter(([key]) => key.startsWith(`${tab}/`))
      .map(([, entry]) => entry)
      .filter((entry) => !(entries[tab] ?? []).some((saved) => saved.id === entry.id)),
  ];

  async function handleLogout() {
    if (!auth) return;
    try {
      await signOut(auth);
      setAuthorized(false);
    } catch (logoutError) {
      setError(`Não foi possível sair: ${logoutError.message}`);
    }
  }

  function updateDraftSettings(key, value) {
    setSettingsDraft((current) => ({ ...current, [key]: value }));
  }

  function saveSettings(event) {
    event.preventDefault();
    setError("");
    setMessage("Alterações da moldura aplicadas ao rascunho local. Salve o rascunho para persistir.");
  }

  function addEntry(collectionName) {
    const id = makeId();
    const currentEntries = entries[collectionName] ?? [];
    const data = { id, ...COLLECTIONS[collectionName].add(), ordem: currentEntries.length + 1 };
    setDrafts((current) => ({ ...current, [entryKey(collectionName, id)]: data }));
    setTab(collectionName);
  }

  function updateEntry(collectionName, entry, field, value) {
    const key = entryKey(collectionName, entry.id);
    setDrafts((current) => ({
      ...current,
      [key]: { ...entry, ...current[key], [field]: value },
    }));
  }

  function saveEntry(collectionName, entry) {
    const key = entryKey(collectionName, entry.id);
    const data = drafts[key] ?? entry;
    setEntries((current) => ({
      ...current,
      [collectionName]: [
        ...(current[collectionName] ?? []).filter((saved) => saved.id !== entry.id),
        data,
      ].sort((left, right) => Number(left.ordem || 0) - Number(right.ordem || 0)),
    }));
    setDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setMessage(`${COLLECTIONS[collectionName].title} atualizado no rascunho local. Salve o rascunho para persistir.`);
  }

  function removeEntry(collectionName, id) {
    if (!window.confirm("Remover este item do rascunho?")) return;
    setEntries((current) => ({
      ...current,
      [collectionName]: (current[collectionName] ?? []).filter((entry) => entry.id !== id),
    }));
    setDrafts((current) => {
      const next = { ...current };
      delete next[entryKey(collectionName, id)];
      return next;
    });
    setMessage("Item removido do rascunho local. Salve o rascunho para persistir.");
  }

  function makeDraftPayload() {
    const notices = String(settingsDraft.avisos_rodape_texto ?? "")
      .split(/\r?\n/)
      .map((notice) => notice.trim())
      .filter(Boolean);
    const { avisos_rodape_texto: ignored, ativo: ignoredStatus, ...otherSettings } = settingsDraft;
    const draft = {
      configuracoes: { ...otherSettings, avisos_rodape: notices },
    };

    for (const collectionName of Object.keys(COLLECTIONS)) {
      const items = new Map((entries[collectionName] ?? []).map((entry) => [entry.id, entry]));
      Object.entries(drafts)
        .filter(([key]) => key.startsWith(`${collectionName}/`))
        .forEach(([, entry]) => items.set(entry.id, entry));
      draft[collectionName] = [...items.values()]
        .filter((entry) => entry._deleted !== true)
        .map(({ _deleted, ...entry }) => entry)
        .sort((left, right) => Number(left.ordem || 0) - Number(right.ordem || 0));
    }
    return draft;
  }

  async function persistPlaylist(action) {
    if (!user || !canEdit || !tenantLoaded) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}/playlist`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, draft: makeDraftPayload() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Falha ao salvar a playlist.");

      const savedDraft = result.draft;
      setSettings(savedDraft.configuracoes);
      setSettingsDraft({
        ...savedDraft.configuracoes,
        avisos_rodape_texto: (savedDraft.configuracoes.avisos_rodape ?? []).join("\n"),
      });
      setEntries(Object.fromEntries(Object.keys(COLLECTIONS).map((name) => [name, savedDraft[name] ?? []])));
      setDrafts({});
      setLayoutConfigured(result.layoutConfigurado === true);
      if (result.published) {
        setHasPublishedPlaylist(true);
        setPublishedAt(result.publishedAt);
        setMessage("Playlist publicada. A TV receberá a atualização pelo documento único.");
      } else {
        setMessage("Rascunho salvo sem alterar o conteúdo que está na TV.");
      }
    } catch (saveError) {
      setError(`Não foi possível ${action === "publish" ? "publicar" : "salvar o rascunho"}: ${saveError.message}`);
    } finally {
      setBusy(false);
    }
  }

  if (!validTenantId) {
    return <main className="admin-shell"><p className="notice notice-error">O identificador do tenant não é válido.</p></main>;
  }

  if (!user) {
    return (
      <main className="admin-shell">
        <section className="login-card">
          <h1>Redirecionando para o login</h1>
          <p>Aguarde enquanto abrimos o acesso seguro.</p>
        </section>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="admin-shell">
        <section className="login-card">
          <span className="eyebrow">PAINEL MOBILE</span>
          <h1>Verificando acesso</h1>
          <p>{error || `Validando a permissão de ${user.email || "sua conta"}…`}</p>
          {error ? <button className="button button-secondary" onClick={handleLogout} type="button">Sair</button> : null}
        </section>
      </main>
    );
  }

  if (!tenantLoaded) {
    return (
      <main className="admin-shell">
        <section className="login-card">
          <h1>Carregando o painel</h1>
          <p>Buscando o rascunho e a playlist publicada…</p>
        </section>
      </main>
    );
  }

  if (!tenantExists) {
    return (
      <main className="admin-shell">
        <section className="login-card">
          <h1>{error ? "Não foi possível carregar a loja" : "Tenant não encontrado"}</h1>
          <p>{error || "Crie primeiro este tenant no Firestore usando o script de provisionamento."}</p>
          <button className="button button-secondary" onClick={handleLogout} type="button">Sair</button>
        </section>
      </main>
    );
  }

  const tabs = [
    ["configuracoes", "Moldura em L"],
    ["produtos", "Catálogo"],
    ["telas", "Telas"],
    ["promocoes", "Promoções"],
    ["eventos", "Eventos"],
    ["avaliacoes", "Avaliações"],
    ["anuncios_terceiros", "Anúncios"],
  ];

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <span className="eyebrow">PAINEL MOBILE</span>
          <h1>{settings.nome || "Seu estabelecimento"}</h1>
          <p>Tenant: {tenantId}</p>
        </div>
        <button className="button button-secondary" onClick={handleLogout} type="button">Sair</button>
      </header>

      <section className="publish-bar" aria-label="Estado da playlist">
        <div>
          <strong>{hasPublishedPlaylist ? "Playlist publicada" : "Ainda não publicada"}</strong>
          <span>
            {publishedAt
              ? `Última publicação: ${new Date(publishedAt).toLocaleString("pt-BR")}`
              : "As alterações ficam privadas até publicar."}
          </span>
        </div>
        {canEdit ? (
          <div className="publish-actions">
            <button className="button button-secondary" disabled={busy || !tenantLoaded} onClick={() => persistPlaylist("saveDraft")} type="button">
              {busy ? "Salvando…" : "Salvar rascunho"}
            </button>
            <button className="button button-primary" disabled={busy || !tenantLoaded} onClick={() => persistPlaylist("publish")} type="button">
              {busy ? "Processando…" : "Publicar"}
            </button>
          </div>
        ) : null}
      </section>

      <nav className="admin-tabs" aria-label="Seções do painel">
        {tabs.map(([id, label]) => (
          <button
            aria-current={tab === id ? "page" : undefined}
            className={`admin-tab${tab === id ? " active" : ""}`}
            key={id}
            onClick={() => setTab(id)}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>

      {error ? <p className="notice notice-error">{error}</p> : null}
      {!canEdit ? <p className="notice">Acesso somente para visualização.</p> : null}
      {message ? <p className="notice notice-success" role="status">{message}</p> : null}
      {!tenantLoaded ? <p className="notice">Carregando dados e rascunho…</p> : null}

      {tab === "configuracoes" ? (
        <form className="editor-card form-stack" onSubmit={saveSettings}>
          <div className="section-title">
            <div>
              <h2>Configuração inicial da moldura em L</h2>
              <p>{layoutConfigured ? "Estrutura bloqueada após o primeiro salvamento. Slogans e destaques continuam editáveis." : "Preencha a identidade fixa antes de salvar o primeiro rascunho."}</p>
            </div>
          </div>
          <TextField label="Nome do estabelecimento" value={settingsDraft.nome} onChange={(value) => updateDraftSettings("nome", value)} maxLength={80} required disabled={!canEdit || layoutConfigured} />
          <div className="field-grid">
            <TextField label="URL do logo 1" type="url" value={settingsDraft.logo} onChange={(value) => updateDraftSettings("logo", value)} placeholder="https://" required disabled={!canEdit || layoutConfigured} />
            <TextField label="URL do logo 2" type="url" value={settingsDraft.logo_secundario} onChange={(value) => updateDraftSettings("logo_secundario", value)} placeholder="https://" required disabled={!canEdit || layoutConfigured} />
          </div>
          <div className="field-grid">
            <TextField label="Slogan principal" value={settingsDraft.slogan} onChange={(value) => updateDraftSettings("slogan", value)} maxLength={120} required disabled={!canEdit} />
            <TextField label="Slogan secundário" value={settingsDraft.slogan_secundario} onChange={(value) => updateDraftSettings("slogan_secundario", value)} maxLength={120} required disabled={!canEdit} />
          </div>
          <TextField label="Título da área lateral" value={settingsDraft.titulo_promocoes} onChange={(value) => updateDraftSettings("titulo_promocoes", value)} maxLength={80} required disabled={!canEdit || layoutConfigured} />
          <label className="field">
            <span>Cor primária</span>
            <input
              className="color-input"
              type="color"
              value={settingsDraft.cor_primaria || "#6B7280"}
              onChange={(event) => updateDraftSettings("cor_primaria", event.target.value)}
              disabled={!canEdit || layoutConfigured}
            />
          </label>
          <div className="field-grid">
            <TextField label="Nota do Google" type="number" min="0" max="5" step="0.1" value={settingsDraft.nota_google?.nota} onChange={(value) => updateDraftSettings("nota_google", { ...settingsDraft.nota_google, nota: Number(value) })} disabled={!canEdit || layoutConfigured} />
            <TextField label="Total de avaliações" type="number" min="0" value={settingsDraft.nota_google?.total} onChange={(value) => updateDraftSettings("nota_google", { ...settingsDraft.nota_google, total: Number(value) })} disabled={!canEdit || layoutConfigured} />
          </div>
          <label className="field">
            <span>Avisos do rodapé (um por linha)</span>
            <textarea
              rows="4"
              value={settingsDraft.avisos_rodape_texto ?? (settingsDraft.avisos_rodape ?? []).join("\n")}
              onChange={(event) => updateDraftSettings("avisos_rodape_texto", event.target.value)}
              maxLength={2000}
              required={!layoutConfigured}
              disabled={!canEdit || layoutConfigured}
            />
          </label>
          {canEdit ? (
            <button className="button button-secondary button-wide" disabled={busy || layoutConfigured} type="submit">
              Aplicar configuração inicial
            </button>
          ) : null}
        </form>
      ) : (
        <section className="editor-card">
          <div className="section-title">
            <div><h2>{COLLECTIONS[tab].title}</h2><p>Edite o conteúdo e salve como rascunho; a TV muda somente após publicar.</p></div>
            {canEdit ? <button className="button button-secondary" onClick={() => addEntry(tab)} type="button">＋ Adicionar</button> : null}
          </div>
          <div className="entry-list">
            {visibleEntries.map((entry) => {
              const key = entryKey(tab, entry.id);
              const current = { ...entry, ...drafts[key] };
              return (
                <article className="entry-card" key={entry.id}>
                  <div className="entry-card-heading">
                    <h3>{current.nome || current.titulo || current.autor || "Novo item"}</h3>
                    {canEdit ? <button className="text-button danger-text" onClick={() => removeEntry(tab, entry.id)} type="button">Remover</button> : null}
                  </div>
                  <fieldset className="admin-entry-fields" disabled={!canEdit}>
                  {tab === "produtos" ? (
                    <div className="form-stack">
                      <TextField label="Nome" value={current.nome} onChange={(value) => updateEntry(tab, current, "nome", value)} maxLength={100} />
                      <TextField label="Descrição" value={current.descricao} onChange={(value) => updateEntry(tab, current, "descricao", value)} maxLength={500} />
                      <div className="field-grid">
                        <TextField label="Categoria" value={current.categoria} onChange={(value) => updateEntry(tab, current, "categoria", value)} maxLength={80} />
                        <TextField label="Preço" value={current.preco} onChange={(value) => updateEntry(tab, current, "preco", value)} maxLength={30} />
                      </div>
                      <div className="field-grid">
                        <TextField label="Preço anterior" value={current.preco_anterior} onChange={(value) => updateEntry(tab, current, "preco_anterior", value)} maxLength={30} />
                        <TextField label="Selo" value={current.selo} onChange={(value) => updateEntry(tab, current, "selo", value)} maxLength={40} />
                      </div>
                      <TextField label="URL da imagem" type="url" value={current.imagem} onChange={(value) => updateEntry(tab, current, "imagem", value)} placeholder="https://" />
                      <TextField label="Ordem" type="number" min="0" value={current.ordem} onChange={(value) => updateEntry(tab, current, "ordem", Number(value))} />
                      <div className="switch-grid">
                        <SwitchField label="Ativo" checked={current.ativo} onChange={(value) => updateEntry(tab, current, "ativo", value)} />
                        <SwitchField label="Destaque" checked={current.destaque} onChange={(value) => updateEntry(tab, current, "destaque", value)} />
                        <SwitchField label="Promoção lateral" checked={current.promocional} onChange={(value) => updateEntry(tab, current, "promocional", value)} />
                      </div>
                    </div>
                  ) : null}
                  {tab === "promocoes" ? (
                    <div className="form-stack">
                      <div className="field-grid">
                        <TextField label="Nome" value={current.nome} onChange={(value) => updateEntry(tab, current, "nome", value)} maxLength={100} />
                        <TextField label="Preço" value={current.preco} onChange={(value) => updateEntry(tab, current, "preco", value)} maxLength={30} />
                      </div>
                      <TextField label="Ordem" type="number" min="0" value={current.ordem} onChange={(value) => updateEntry(tab, current, "ordem", Number(value))} />
                      <SwitchField label="Ativa" checked={current.ativo} onChange={(value) => updateEntry(tab, current, "ativo", value)} />
                    </div>
                  ) : null}
                  {tab === "eventos" ? (
                    <div className="form-stack">
                      <TextField label="Título" value={current.titulo} onChange={(value) => updateEntry(tab, current, "titulo", value)} maxLength={120} />
                      <div className="field-grid">
                        <TextField label="Data" type="date" value={current.data} onChange={(value) => updateEntry(tab, current, "data", value)} />
                        <TextField label="URL da imagem" type="url" value={current.imagem} onChange={(value) => updateEntry(tab, current, "imagem", value)} placeholder="https://" />
                      </div>
                      <SwitchField label="Ativo" checked={current.ativo} onChange={(value) => updateEntry(tab, current, "ativo", value)} />
                    </div>
                  ) : null}
                  {tab === "avaliacoes" ? (
                    <div className="form-stack">
                      <TextField label="Autor" value={current.autor} onChange={(value) => updateEntry(tab, current, "autor", value)} maxLength={80} />
                      <TextField label="Nota (1 a 5)" type="number" min="1" max="5" value={current.nota} onChange={(value) => updateEntry(tab, current, "nota", Number(value))} />
                      <label className="field">
                        <span>Texto</span>
                        <textarea rows="3" value={current.texto ?? ""} onChange={(event) => updateEntry(tab, current, "texto", event.target.value)} maxLength={500} />
                      </label>
                    </div>
                  ) : null}
                  {tab === "anuncios_terceiros" ? (
                    <div className="form-stack">
                      <TextField label="URL da imagem" type="url" value={current.imagem} onChange={(value) => updateEntry(tab, current, "imagem", value)} placeholder="https://" />
                      <TextField label="Link do anúncio" type="url" value={current.link} onChange={(value) => updateEntry(tab, current, "link", value)} placeholder="https://" />
                      <div className="field-grid">
                        <TextField label="Início" type="date" value={current.data_inicio} onChange={(value) => updateEntry(tab, current, "data_inicio", value)} />
                        <TextField label="Fim" type="date" value={current.data_fim} onChange={(value) => updateEntry(tab, current, "data_fim", value)} />
                      </div>
                      <div className="field-grid">
                        <TextField label="Exibição (segundos)" type="number" min="3" max="60" value={current.tempo_exibicao} onChange={(value) => updateEntry(tab, current, "tempo_exibicao", Number(value))} />
                        <TextField label="Ordem" type="number" min="0" value={current.ordem} onChange={(value) => updateEntry(tab, current, "ordem", Number(value))} />
                      </div>
                      <SwitchField label="Ativo" checked={current.ativo} onChange={(value) => updateEntry(tab, current, "ativo", value)} />
                    </div>
                  ) : null}
                  {tab === "telas" ? (
                    <div className="form-stack">
                      <label className="field">
                        <span>Produto do catálogo (opcional)</span>
                        <select
                          value={current.produtoId ?? ""}
                          onChange={(event) => updateEntry(tab, current, "produtoId", event.target.value)}
                        >
                          <option value="">Tela independente</option>
                          {(entries.produtos ?? []).map((product) => (
                            <option key={product.id} value={product.id}>{product.nome || product.id}</option>
                          ))}
                        </select>
                      </label>
                      <TextField label="Título" value={current.titulo} onChange={(value) => updateEntry(tab, current, "titulo", value)} maxLength={120} />
                      <TextField label="Descrição" value={current.descricao} onChange={(value) => updateEntry(tab, current, "descricao", value)} maxLength={500} />
                      <div className="field-grid">
                        <TextField label="URL da imagem" type="url" value={current.imagem} onChange={(value) => updateEntry(tab, current, "imagem", value)} placeholder="https://" />
                        <TextField label="Preço ou chamada" value={current.preco} onChange={(value) => updateEntry(tab, current, "preco", value)} maxLength={40} />
                      </div>
                      <div className="field-grid">
                        <TextField label="Duração (segundos)" type="number" min="3" max="60" value={current.tempo_exibicao} onChange={(value) => updateEntry(tab, current, "tempo_exibicao", Number(value))} />
                        <TextField label="Ordem" type="number" min="0" value={current.ordem} onChange={(value) => updateEntry(tab, current, "ordem", Number(value))} />
                      </div>
                      <SwitchField label="Ativa" checked={current.ativo} onChange={(value) => updateEntry(tab, current, "ativo", value)} />
                    </div>
                  ) : null}
                  </fieldset>
                  {canEdit ? <button className="button button-primary button-wide" disabled={busy} onClick={() => saveEntry(tab, current)} type="button">Aplicar ao rascunho</button> : null}
                </article>
              );
            })}
            {visibleEntries.length === 0 ? (
              <div className="empty-state">
                <p>Nenhum item cadastrado.</p>
                {canEdit ? <button className="text-button" onClick={() => addEntry(tab)} type="button">Adicionar o primeiro</button> : null}
              </div>
            ) : null}
          </div>
        </section>
      )}
    </main>
  );
}
