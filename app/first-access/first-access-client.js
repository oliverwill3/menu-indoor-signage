"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, updatePassword, updateProfile } from "firebase/auth";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseFirestore } from "../../src/lib/firebase.js";

const TENANT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

export default function FirstAccessClient({ tenantId }) {
  const router = useRouter();
  const [auth, setAuth] = useState(null);
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [membershipReady, setMembershipReady] = useState(false);
  const [requiresFirstAccess, setRequiresFirstAccess] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const validTenantId = TENANT_ID_PATTERN.test(tenantId);

  useEffect(() => {
    if (!validTenantId) {
      setError("O identificador da loja não é válido.");
      setReady(true);
      return undefined;
    }

    try {
      const firebaseAuth = getFirebaseAuth();
      setAuth(firebaseAuth);
      return onAuthStateChanged(firebaseAuth, (currentUser) => {
        setUser(currentUser);
        setReady(true);
        if (!currentUser) {
          router.replace(`/login?tenantId=${encodeURIComponent(tenantId)}`);
        }
      }, (authError) => {
        setError(`Falha na autenticação: ${authError.message}`);
        setReady(true);
      });
    } catch (firebaseError) {
      setError(firebaseError instanceof Error ? firebaseError.message : "Falha ao iniciar o Firebase.");
      setReady(true);
      return undefined;
    }
  }, [router, tenantId, validTenantId]);

  useEffect(() => {
    if (!user || !validTenantId) return undefined;
    let active = true;

    async function checkMembership() {
      try {
        const membership = await getDoc(doc(getFirebaseFirestore(), "tenant_admins", tenantId, "users", user.uid));
        if (!active) return;
        if (!membership.exists() || membership.data()?.ativo === false) {
          setError("Esta conta não tem acesso ativo a essa loja.");
          setMembershipReady(true);
          return;
        }
        const membershipData = membership.data();
        if (membershipData?.isFirstAccess !== true) {
          router.replace(`/admin/${encodeURIComponent(tenantId)}`);
          return;
        }
        if (typeof membershipData.invitedAt?.toDate !== "function") {
          setError("O convite desta conta está incompleto. Solicite um novo link ao suporte.");
          setMembershipReady(true);
          return;
        }
        setRequiresFirstAccess(true);
        setMembershipReady(true);
      } catch (membershipError) {
        if (active) {
          setError(`Não foi possível validar o acesso: ${membershipError.message}`);
          setMembershipReady(true);
        }
      }
    }

    checkMembership();
    return () => {
      active = false;
    };
  }, [router, tenantId, user, validTenantId]);

  async function handleCompleteFirstAccess(event) {
    event.preventDefault();
    if (!auth || !user || !validTenantId) return;

    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 80) {
      setError("Informe seu nome (até 80 caracteres).");
      return;
    }
    if (password.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== passwordConfirmation) {
      setError("As senhas não conferem.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      await updatePassword(user, password);
      await updateProfile(user, { displayName: cleanName });
      await updateDoc(doc(getFirebaseFirestore(), "tenant_admins", tenantId, "users", user.uid), {
        isFirstAccess: false,
        displayName: cleanName,
        firstAccessCompletedAt: serverTimestamp(),
      });
      router.replace(`/admin/${encodeURIComponent(tenantId)}`);
    } catch (completionError) {
      setError(`Não foi possível concluir o primeiro acesso: ${completionError.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    if (!auth) return;
    try {
      await signOut(auth);
      router.replace(`/login?tenantId=${encodeURIComponent(tenantId)}`);
    } catch (logoutError) {
      setError(`Não foi possível sair: ${logoutError.message}`);
    }
  }

  return (
    <main className="admin-shell">
      <section className="login-card">
        <span className="eyebrow">PRIMEIRO ACESSO</span>
        <h1>Proteja sua conta</h1>
        <p>Defina uma senha pessoal e informe o nome do administrador para continuar.</p>
        {ready && user && membershipReady && requiresFirstAccess ? (
          <form className="form-stack" onSubmit={handleCompleteFirstAccess}>
            <label className="field">
              <span>Nome do administrador</span>
              <input
                autoComplete="name"
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Nova senha</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Confirme a nova senha</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={6}
                value={passwordConfirmation}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
                required
              />
            </label>
            {error ? <p className="notice notice-error" role="alert">{error}</p> : null}
            <button className="button button-primary button-wide" disabled={busy} type="submit">
              {busy ? "Salvando…" : "Definir senha e continuar"}
            </button>
          </form>
        ) : (
          <p>{error || "Validando sua sessão e permissão…"}</p>
        )}
        {user ? <button className="text-button" onClick={handleLogout} type="button">Sair</button> : null}
      </section>
    </main>
  );
}
