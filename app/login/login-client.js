"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  GoogleAuthProvider,
  linkWithPopup,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  unlink,
} from "firebase/auth";
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

  async function handleSuperAdminLogin() {
    if (!tenantIdIsValid) {
      setError("Informe um identificador de loja válido.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const auth = getFirebaseAuth();
      const provider = new GoogleAuthProvider();
      const currentUser = auth.currentUser;
      const expectedEmail = email.trim().toLowerCase();
      provider.setCustomParameters({ prompt: "select_account" });

      if (expectedEmail && password && currentUser?.email?.toLowerCase() !== expectedEmail) {
        await signInWithEmailAndPassword(auth, expectedEmail, password);
        setPassword("");
        setMessage("Conta autenticada. Clique novamente para vinculá-la à mesma Conta Google.");
        return;
      }

      if (
        expectedEmail
        && currentUser?.email?.toLowerCase() === expectedEmail
        && !currentUser.providerData.some(({ providerId }) => providerId === "google.com")
      ) {
        const linkedCredentials = await linkWithPopup(currentUser, provider);
        const linkedGoogleEmail = linkedCredentials.user.providerData
          .find(({ providerId }) => providerId === "google.com")
          ?.email?.trim().toLowerCase();
        if (linkedGoogleEmail !== expectedEmail) {
          await unlink(linkedCredentials.user, "google.com");
          throw new Error("Selecione a Conta Google que usa o mesmo e-mail da conta autorizada.");
        }
        setMessage("Conta Google vinculada. Clique novamente para entrar como SuperAdmin.");
        return;
      }

      const credentials = await signInWithPopup(auth, provider);
      const googleEmail = credentials.user.providerData
        .find(({ providerId }) => providerId === "google.com")
        ?.email?.trim().toLowerCase() ?? "";
      if (expectedEmail && googleEmail !== expectedEmail) {
        await signOut(auth);
        throw new Error("A Conta Google selecionada não corresponde ao e-mail informado.");
      }

      const idToken = await credentials.user.getIdToken(true);
      const response = await fetch("/api/auth/super-admin/bootstrap", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Esta Conta Google não está autorizada como SuperAdmin.");
      }

      await credentials.user.getIdToken(true);
      router.replace(`/admin/${encodeURIComponent(tenantId.trim())}`);
    } catch (loginError) {
      if (loginError.code === "auth/account-exists-with-different-credential") {
        setError("Esta conta já usa e-mail e senha. Entre primeiro com ela, depois volte a esta tela para vincular a mesma Conta Google.");
      } else {
        setError(`Não foi possível entrar como SuperAdmin: ${loginError.message}`);
      }
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
              pattern="[a-z0-9][a-z0-9\-]{0,62}"
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
        <button className="button button-secondary button-wide" disabled={busy || !tenantIdIsValid} onClick={handleSuperAdminLogin} type="button">
          {busy ? "Validando…" : "Entrar como SuperAdmin com Google"}
        </button>
      </section>
    </main>
  );
}
