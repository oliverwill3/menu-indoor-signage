"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseFirestore } from "../../src/lib/firebase.js";

const TENANT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

export default function LoginClient({ initialTenantId }) {
  const router = useRouter();
  const [tenantId, setTenantId] = useState(initialTenantId);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const emailIsValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), [email]);
  const tenantIdIsValid = TENANT_ID_PATTERN.test(tenantId.trim());

  async function handleLogin(event) {
    event.preventDefault();
    if (!tenantIdIsValid) {
      setError("Informe um identificador de loja válido.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    let auth;

    try {
      auth = getFirebaseAuth();
      const db = getFirebaseFirestore();
      const credentials = await signInWithEmailAndPassword(auth, email.trim(), password);
      const membership = await getDoc(doc(db, "tenant_admins", tenantId.trim(), "users", credentials.user.uid));

      if (!membership.exists() || membership.data()?.ativo === false) {
        await signOut(auth);
        setError("Esta conta não tem acesso ativo a essa loja.");
        return;
      }

      setPassword("");
      const destination = membership.data()?.isFirstAccess === true
        ? `/first-access?tenantId=${encodeURIComponent(tenantId.trim())}`
        : `/admin/${encodeURIComponent(tenantId.trim())}`;
      router.replace(destination);
    } catch (loginError) {
      setError(`Não foi possível entrar: ${loginError.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordReset() {
    setError("");
    setMessage("");
    if (!emailIsValid) {
      setError("Informe um e-mail válido para receber o link de redefinição.");
      return;
    }

    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      const continueUrl = new URL("/login", window.location.origin);
      if (tenantIdIsValid) continueUrl.searchParams.set("tenantId", tenantId.trim());
      await sendPasswordResetEmail(auth, email.trim(), { url: continueUrl.toString() });
      setMessage("Se houver uma conta para esse e-mail, o Firebase enviará as instruções de redefinição.");
    } catch (resetError) {
      setError(`Não foi possível solicitar a redefinição: ${resetError.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-shell">
      <section className="login-card">
        <span className="eyebrow">MÍDIA INDOOR</span>
        <h1>Acesse sua conta</h1>
        <p>Entre com o e-mail e a senha associados à sua loja.</p>
        <form className="form-stack" onSubmit={handleLogin}>
          <label className="field">
            <span>Identificador da loja</span>
            <input
              autoComplete="organization"
              value={tenantId}
              onChange={(event) => setTenantId(event.target.value.toLowerCase())}
              pattern="[a-z0-9][a-z0-9-]{0,62}"
              required
            />
          </label>
          <label className="field">
            <span>E-mail</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Senha</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error ? <p className="notice notice-error" role="alert">{error}</p> : null}
          {message ? <p className="notice notice-success" role="status">{message}</p> : null}
          <button className="button button-primary button-wide" disabled={busy || !emailIsValid || !tenantIdIsValid} type="submit">
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <button className="text-button" disabled={busy} onClick={handlePasswordReset} type="button">
          Esqueci minha senha
        </button>
      </section>
    </main>
  );
}
