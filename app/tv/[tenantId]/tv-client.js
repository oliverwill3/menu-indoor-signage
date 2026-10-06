"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { createDefaultTenant } from "../../../lib/defaultSchema.js";
import { getFirebaseFirestore } from "../../../src/lib/firebase.js";

const COLLECTIONS = ["produtos", "promocoes", "eventos", "avaliacoes", "anuncios_terceiros"];
const TENANT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

function sortByOrder(entries) {
  return [...entries].sort((left, right) =>
    Number(left.ordem ?? 0) - Number(right.ordem ?? 0)
  );
}

function safeWebUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function isAdInDateRange(ad) {
  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  return (!ad.data_inicio || ad.data_inicio <= today) && (!ad.data_fim || ad.data_fim >= today);
}

function TickerItem({ children }) {
  return <span className="ticker-item">{children}</span>;
}

function TvLayout({ dadosTv, children }) {
  const settings = dadosTv.configuracoes;
  return (
    <main
      className="tv-screen"
      style={{
        "--tenant-primary": settings.cor_primaria || "#6B7280",
        "--tenant-bg": settings.cor_fundo || "#111827",
        "--tenant-text": settings.cor_texto || "#F9FAFB",
      }}
    >
      {children}
    </main>
  );
}

export default function TvClient({ tenantId }) {
  const [tenant, setTenant] = useState(createDefaultTenant);
  const [loading, setLoading] = useState(true);
  const [exists, setExists] = useState(false);
  const [error, setError] = useState("");
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    if (!TENANT_ID_PATTERN.test(tenantId)) {
      setError("O identificador deste tenant não é válido.");
      setLoading(false);
      return undefined;
    }

    let active = true;
    let childUnsubscribers = [];
    setLoading(true);
    setError("");

    try {
      const db = getFirebaseFirestore();
      const tenantRef = doc(db, "tenants", tenantId);
      const unsubscribeTenant = onSnapshot(tenantRef, (snapshot) => {
        if (!active) return;
        if (!snapshot.exists()) {
          childUnsubscribers.forEach((unsubscribe) => unsubscribe());
          childUnsubscribers = [];
          setExists(false);
          setTenant(createDefaultTenant());
          setLoading(false);
          return;
        }

        setExists(true);
        const data = snapshot.data();
        setTenant((current) => ({
          ...current,
          ...data,
          configuracoes: {
            ...createDefaultTenant().configuracoes,
            ...(data?.configuracoes ?? {}),
          },
        }));

        if (childUnsubscribers.length === 0) {
          const pendingCollections = new Set(COLLECTIONS);
          childUnsubscribers = COLLECTIONS.map((name) =>
            onSnapshot(collection(db, "tenants", tenantId, name), (result) => {
              if (!active) return;
              const records = result.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
              setTenant((current) => ({ ...current, [name]: sortByOrder(records) }));
              pendingCollections.delete(name);
              if (pendingCollections.size === 0) setLoading(false);
            }, (snapshotError) => {
              if (!active) return;
              setError(`Não foi possível carregar ${name}: ${snapshotError.message}`);
              setLoading(false);
            })
          );
        }
      }, (snapshotError) => {
        if (!active) return;
        setError(`Não foi possível conectar ao tenant: ${snapshotError.message}`);
        setLoading(false);
      });

      return () => {
        active = false;
        unsubscribeTenant();
        childUnsubscribers.forEach((unsubscribe) => unsubscribe());
      };
    } catch (firebaseError) {
      setError(firebaseError instanceof Error ? firebaseError.message : "Falha ao iniciar o Firebase.");
      setLoading(false);
      return undefined;
    }
  }, [tenantId]);

  const settings = tenant.configuracoes;
  const products = useMemo(
    () => sortByOrder(tenant.produtos.filter((entry) => entry.ativo !== false)),
    [tenant.produtos]
  );
  const promos = sortByOrder(tenant.promocoes.filter((entry) => entry.ativo !== false));
  const ads = tenant.anuncios_terceiros
    .filter((entry) => entry.ativo !== false && isAdInDateRange(entry));
  const tickerParts = useMemo(() => {
    const notices = Array.isArray(settings.avisos_rodape) ? settings.avisos_rodape : [];
    const reviews = tenant.avaliacoes.map((entry) =>
      `${entry.autor || "Cliente"}${entry.nota ? ` · ${entry.nota}★` : ""}${entry.texto ? `: ${entry.texto}` : ""}`
    );
    const events = tenant.eventos
      .filter((entry) => entry.ativo !== false)
      .map((entry) => `${entry.titulo || "Evento"}${entry.data ? ` · ${entry.data}` : ""}`);
    const rating = settings.nota_google?.total
      ? [`Google ${settings.nota_google.nota || 0}★ · ${settings.nota_google.total} avaliações`]
      : [];
    return [...notices, ...reviews, ...events, ...rating].filter(Boolean);
  }, [settings.avisos_rodape, settings.nota_google, tenant.avaliacoes, tenant.eventos]);

  useEffect(() => {
    setSlideIndex(0);
    if (products.length < 2) return undefined;
    const interval = Math.min(60, Math.max(3, Number(settings.intervalo_slides) || 8)) * 1000;
    const timer = window.setInterval(() => {
      setSlideIndex((current) => (current + 1) % products.length);
    }, interval);
    return () => window.clearInterval(timer);
  }, [products.length, settings.intervalo_slides]);

  if (loading) {
    return (
      <main className="tv-loading" aria-live="polite">
        <span className="loading-dot" />
        <span>Conectando à TV…</span>
      </main>
    );
  }

  if (error || !exists) {
    return (
      <main className="tv-message">
        <section className="tv-message-card">
          <span className="eyebrow">MÍDIA INDOOR</span>
          <h1>{error ? "Não foi possível abrir esta TV" : "Este tenant ainda não existe"}</h1>
          <p>{error || "Crie o tenant no Firestore e volte a abrir este endereço."}</p>
          <a className="button button-secondary" href="/">Voltar</a>
        </section>
      </main>
    );
  }

  const currentProduct = products[slideIndex];
  const logo = safeWebUrl(settings.logo);
  const tickerEntries = [
    ...(tickerParts.length ? tickerParts.map((text, index) => ({ id: `text-${index}`, text })) : [
      { id: "empty", text: "Avisos, eventos e avaliações aparecerão aqui" },
    ]),
    ...ads.map((ad) => ({ id: ad.id, ad })),
  ];
  const currentMedia = safeWebUrl(currentProduct?.imagem);

  return (
    <TvLayout dadosTv={tenant}>
      <div className="tv-safe-frame">
        <header className="tv-header">
          <div className="tv-brand">
            {logo ? <img className="tv-brand-logo" src={logo} alt="" /> : null}
            <div>
              <h1>{settings.nome || "Seu estabelecimento"}</h1>
              {settings.slogan ? <p>{settings.slogan}</p> : null}
            </div>
          </div>
          {settings.slogan_secundario ? <p className="tv-header-note">{settings.slogan_secundario}</p> : null}
        </header>

        <section className="tv-body">
          <div
            className={`tv-feature${currentMedia ? " has-image" : ""}`}
            style={currentMedia ? { backgroundImage: `linear-gradient(90deg, rgba(0,0,0,.82), rgba(0,0,0,.2)), url("${currentMedia}")` } : undefined}
            aria-live="polite"
          >
            {currentProduct ? (
              <article className="tv-product-card">
                {currentProduct.selo ? <span className="tv-product-badge">{currentProduct.selo}</span> : null}
                <span className="eyebrow">{currentProduct.categoria || "CARDÁPIO"}</span>
                <h2>{currentProduct.nome || "Produto sem nome"}</h2>
                {currentProduct.descricao ? <p>{currentProduct.descricao}</p> : null}
                <strong className="tv-price">{currentProduct.preco || "Consulte o preço"}</strong>
              </article>
            ) : (
              <article className="tv-product-card tv-placeholder">
                <span className="eyebrow">CARDÁPIO</span>
                <h2>Seu cardápio aparecerá aqui</h2>
                <p>Adicione produtos pelo painel mobile para preencher esta área.</p>
              </article>
            )}
            {products.length > 1 ? (
              <div className="tv-slide-count" aria-label={`Produto ${slideIndex + 1} de ${products.length}`}>
                {String(slideIndex + 1).padStart(2, "0")} / {String(products.length).padStart(2, "0")}
              </div>
            ) : null}
          </div>

          <aside className="tv-sidebar">
            <div className="tv-sidebar-brand">
              {logo ? <img src={logo} alt={`Logo de ${settings.nome || "estabelecimento"}`} /> : <span className="tv-logo-placeholder">LOGO</span>}
            </div>
            <div className="tv-sidebar-content">
              <h2>{settings.titulo_promocoes || "Destaques"}</h2>
              {promos.length ? (
                <ul className="tv-promo-list">
                  {promos.slice(0, 6).map((item) => (
                    <li key={item.id}>
                      <span>{item.nome || "Promoção"}</span>
                      <strong>{item.preco || ""}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="tv-promo-empty">Sua promoção aqui</div>
              )}
              {settings.nota_google?.total ? (
                <div className="tv-google-rating">
                  <strong>{settings.nota_google.nota || 0} ★</strong>
                  <span>{settings.nota_google.total} avaliações</span>
                </div>
              ) : null}
            </div>
          </aside>
        </section>

        <footer className="tv-footer">
          <span className="tv-footer-label">AVISOS</span>
          <div className="ticker-window">
            <div className="ticker-track">
              {[0, 1].map((copy) => (
                <div aria-hidden={copy === 1 ? "true" : undefined} className="ticker-group" key={copy}>
                  {tickerEntries.map((entry) => {
                    if (!entry.ad) {
                      return <TickerItem key={entry.id}>{entry.text}</TickerItem>;
                    }
                    const adImage = safeWebUrl(entry.ad.imagem);
                    const link = safeWebUrl(entry.ad.link);
                    return (
                      <TickerItem key={entry.id}>
                        {link ? (
                          <a href={link} target="_blank" rel="noreferrer">
                            {adImage ? <img src={adImage} alt="" /> : null}
                            Anúncio parceiro
                          </a>
                        ) : (
                          <>
                            {adImage ? <img src={adImage} alt="" /> : null}
                            Anúncio parceiro
                          </>
                        )}
                      </TickerItem>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </TvLayout>
  );
}
