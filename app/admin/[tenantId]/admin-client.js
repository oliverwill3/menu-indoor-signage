"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
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
  const [auth, setAuth] = useState(null);
  const [db, setDb] = useState(null);
  const [user, setUser] = useState(null);
  const [authorized, setAuthorized] = useState(false);
  const [tenantExists, setTenantExists] = useState(false);
  const [settings, setSettings] = useState({});
  const [settingsDraft, setSettingsDraft] = useState({});
  const [entries, setEntries] = useState({});
  const [drafts, setDrafts] = useState({});
  const [tab, setTab] = useState("configuracoes");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      const firestore = getFirebaseFirestore();
      setAuth(firebaseAuth);
      setDb(firestore);
      return onAuthStateChanged(firebaseAuth, (currentUser) => {
        setUser(currentUser);
        setAuthorized(false);
        setError("");
        setMessage("");
      }, (authError) => setError(`Falha na autenticação: ${authError.message}`));
    } catch (firebaseError) {
      setError(firebaseError instanceof Error ? firebaseError.message : "Falha ao iniciar o Firebase.");
      return undefined;
    }
  }, [validTenantId]);

  useEffect(() => {
    if (!db || !user || !validTenantId) return undefined;
    return onSnapshot(
      doc(db, "tenant_admins", tenantId, "users", user.uid),
      (snapshot) => {
        setAuthorized(snapshot.exists() && snapshot.data()?.ativo !== false);
        if (!snapshot.exists()) {
          setError("Esta conta ainda não tem permissão para administrar este tenant.");
        } else {
          setError("");
        }
      },
      (snapshotError) => setError(`Falha ao verificar a permissão: ${snapshotError.message}`)
    );
  }, [db, tenantId, user, validTenantId]);

  useEffect(() => {
    if (!db || !user || !authorized || !validTenantId) return undefined;
    let active = true;
    const unsubscribers = [];

    unsubscribers.push(onSnapshot(doc(db, "tenants", tenantId), (snapshot) => {
      if (!active) return;
      setTenantExists(snapshot.exists());
      if (snapshot.exists()) {
        const nextSettings = snapshot.data()?.configuracoes ?? {};
        setSettings(nextSettings);
        setSettingsDraft(nextSettings);
      }
    }, (snapshotError) => {
      if (active) setError(`Falha ao ler as configurações: ${snapshotError.message}`);
    }));

    Object.keys(COLLECTIONS).forEach((name) => {
      unsubscribers.push(onSnapshot(collection(db, "tenants", tenantId, name), (snapshot) => {
        if (!active) return;
        setEntries((current) => ({
          ...current,
          [name]: snapshot.docs
            .map((entry) => ({ id: entry.id, ...entry.data() }))
            .sort((left, right) => Number(left.ordem || 0) - Number(right.ordem || 0)),
        }));
      }, (snapshotError) => {
        if (active) setError(`Falha ao ler ${COLLECTIONS[name].title}: ${snapshotError.message}`);
      }));
    });

    return () => {
      active = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [authorized, db, tenantId, user, validTenantId]);

  const emailIsValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), [email]);
  const visibleEntries = [
    ...(entries[tab] ?? []),
    ...Object.entries(drafts)
      .filter(([key]) => key.startsWith(`${tab}/`))
      .map(([, entry]) => entry)
      .filter((entry) => !(entries[tab] ?? []).some((saved) => saved.id === entry.id)),
  ];

  async function handleLogin(event) {
    event.preventDefault();
    if (!auth) return;
    setBusy(true);
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      setPassword("");
    } catch (loginError) {
      setError(`Não foi possível entrar: ${loginError.message}`);
    } finally {
      setBusy(false);
    }
  }

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

  async function saveSettings(event) {
    event.preventDefault();
    if (!db) return;
    setBusy(true);
    setError("");
    try {
      const notices = String(settingsDraft.avisos_rodape_texto ?? "")
        .split(/\r?\n/)
        .map((notice) => notice.trim())
        .filter(Boolean);
      const { avisos_rodape_texto: ignored, ...otherSettings } = settingsDraft;
      await setDoc(doc(db, "tenants", tenantId), {
        configuracoes: { ...otherSettings, avisos_rodape: notices },
      }, { merge: true });
      setMessage("Configurações salvas. A TV será atualizada automaticamente.");
    } catch (saveError) {
      setError(`Não foi possível salvar as configurações: ${saveError.message}`);
    } finally {
      setBusy(false);
    }
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

  async function saveEntry(collectionName, entry) {
    if (!db) return;
    const key = entryKey(collectionName, entry.id);
    const data = drafts[key] ?? entry;
    setBusy(true);
    setError("");
    try {
      await setDoc(doc(db, "tenants", tenantId, collectionName, entry.id), data);
      setDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      setMessage(`${COLLECTIONS[collectionName].title} salvo. A TV está sincronizando.`);
    } catch (saveError) {
      setError(`Não foi possível salvar: ${saveError.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function removeEntry(collectionName, id) {
    if (!db || !window.confirm("Remover este item?")) return;
    setBusy(true);
    setError("");
    try {
      await deleteDoc(doc(db, "tenants", tenantId, collectionName, id));
      setDrafts((current) => {
        const next = { ...current };
        delete next[entryKey(collectionName, id)];
        return next;
      });
      setMessage("Item removido.");
    } catch (deleteError) {
      setError(`Não foi possível remover: ${deleteError.message}`);
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
          <span className="eyebrow">PAINEL MOBILE</span>
          <h1>Acesse sua mídia indoor</h1>
          <p>Entre com a conta autorizada para o tenant <strong>{tenantId}</strong>.</p>
          <form className="form-stack" onSubmit={handleLogin}>
            <TextField label="E-mail" type="email" autoComplete="username" value={email} onChange={setEmail} required />
            <TextField label="Senha" type="password" autoComplete="current-password" value={password} onChange={setPassword} required />
            {error ? <p className="notice notice-error">{error}</p> : null}
            <button className="button button-primary button-wide" disabled={busy || !emailIsValid} type="submit">
              {busy ? "Entrando…" : "Entrar"}
            </button>
          </form>
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

  if (!tenantExists) {
    return (
      <main className="admin-shell">
        <section className="login-card">
          <h1>Tenant não encontrado</h1>
          <p>Crie primeiro este tenant no Firestore usando o script de provisionamento.</p>
          <button className="button button-secondary" onClick={handleLogout} type="button">Sair</button>
        </section>
      </main>
    );
  }

  const tabs = [
    ["configuracoes", "Identidade"],
    ["produtos", "Produtos"],
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
      {message ? <p className="notice notice-success" role="status">{message}</p> : null}

      {tab === "configuracoes" ? (
        <form className="editor-card form-stack" onSubmit={saveSettings}>
          <div className="section-title">
            <div><h2>Identidade e rodapé</h2><p>Esses dados atualizam a tela da TV em tempo real.</p></div>
          </div>
          <TextField label="Nome do estabelecimento" value={settingsDraft.nome} onChange={(value) => updateDraftSettings("nome", value)} maxLength={80} />
          <TextField label="URL do logo" type="url" value={settingsDraft.logo} onChange={(value) => updateDraftSettings("logo", value)} placeholder="https://" />
          <div className="field-grid">
            <TextField label="Slogan principal" value={settingsDraft.slogan} onChange={(value) => updateDraftSettings("slogan", value)} maxLength={120} />
            <TextField label="Slogan secundário" value={settingsDraft.slogan_secundario} onChange={(value) => updateDraftSettings("slogan_secundario", value)} maxLength={120} />
          </div>
          <TextField label="Título da área lateral" value={settingsDraft.titulo_promocoes} onChange={(value) => updateDraftSettings("titulo_promocoes", value)} maxLength={80} />
          <label className="field">
            <span>Cor primária</span>
            <input
              className="color-input"
              type="color"
              value={settingsDraft.cor_primaria || "#6B7280"}
              onChange={(event) => updateDraftSettings("cor_primaria", event.target.value)}
            />
          </label>
          <div className="field-grid">
            <TextField label="Nota do Google" type="number" min="0" max="5" step="0.1" value={settingsDraft.nota_google?.nota} onChange={(value) => updateDraftSettings("nota_google", { ...settingsDraft.nota_google, nota: Number(value) })} />
            <TextField label="Total de avaliações" type="number" min="0" value={settingsDraft.nota_google?.total} onChange={(value) => updateDraftSettings("nota_google", { ...settingsDraft.nota_google, total: Number(value) })} />
          </div>
          <label className="field">
            <span>Avisos do rodapé (um por linha)</span>
            <textarea
              rows="4"
              value={settingsDraft.avisos_rodape_texto ?? (settingsDraft.avisos_rodape ?? []).join("\n")}
              onChange={(event) => updateDraftSettings("avisos_rodape_texto", event.target.value)}
              maxLength={2000}
            />
          </label>
          <SwitchField label="TV ativa" checked={settingsDraft.ativo} onChange={(value) => updateDraftSettings("ativo", value)} />
          <button className="button button-primary button-wide" disabled={busy} type="submit">
            {busy ? "Salvando…" : "🚀 Salvar e atualizar TV"}
          </button>
        </form>
      ) : (
        <section className="editor-card">
          <div className="section-title">
            <div><h2>{COLLECTIONS[tab].title}</h2><p>Salve cada item para sincronizar com a TV.</p></div>
            <button className="button button-secondary" onClick={() => addEntry(tab)} type="button">＋ Adicionar</button>
          </div>
          <div className="entry-list">
            {visibleEntries.map((entry) => {
              const key = entryKey(tab, entry.id);
              const current = { ...entry, ...drafts[key] };
              return (
                <article className="entry-card" key={entry.id}>
                  <div className="entry-card-heading">
                    <h3>{current.nome || current.titulo || current.autor || "Novo item"}</h3>
                    <button className="text-button danger-text" onClick={() => removeEntry(tab, entry.id)} type="button">Remover</button>
                  </div>
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
                  <button className="button button-primary button-wide" disabled={busy} onClick={() => saveEntry(tab, current)} type="button">Salvar item</button>
                </article>
              );
            })}
            {visibleEntries.length === 0 ? (
              <div className="empty-state">
                <p>Nenhum item cadastrado.</p>
                <button className="text-button" onClick={() => addEntry(tab)} type="button">Adicionar o primeiro</button>
              </div>
            ) : null}
          </div>
        </section>
      )}
    </main>
  );
}
