"use client";

import { useState } from "react";

export default function HomePage() {
  const [tenantId, setTenantId] = useState("");
  const normalizedId = tenantId.trim().toLowerCase();

  function goTo(path) {
    if (/^[a-z0-9][a-z0-9-]{0,62}$/.test(normalizedId)) {
      window.location.assign(`/${path}/${encodeURIComponent(normalizedId)}`);
    }
  }

  return (
    <main className="home-shell">
      <section className="home-card">
        <span className="eyebrow">MÍDIA INDOOR</span>
        <h1>Entre no painel ou abra a TV</h1>
        <p>Informe o identificador do estabelecimento.</p>
        <label className="field">
          <span>Identificador do tenant</span>
          <input
            autoComplete="off"
            value={tenantId}
            onChange={(event) => setTenantId(event.target.value)}
            placeholder="ex.: minha-empresa"
          />
        </label>
        <div className="home-actions">
          <button className="button button-primary" onClick={() => goTo("tv")} type="button">
            Abrir TV
          </button>
          <button className="button button-secondary" onClick={() => goTo("admin")} type="button">
            Painel mobile
          </button>
        </div>
      </section>
    </main>
  );
}
