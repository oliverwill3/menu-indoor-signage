import { getAdminAuth, getAdminFirestore, TENANT_ID_PATTERN } from "./firebase-admin.js";
import { AuthError } from "./route-errors.js";

function readBearerToken(request) {
  const value = request.headers.get("authorization") ?? "";
  return value.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "";
}

function superAdminEmailAllowlist() {
  return new Set(
    (process.env.SUPER_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function createRequireAuth({ getAdminAuth: resolveAdminAuth, getAdminFirestore: resolveAdminFirestore }) {
  return async function requireAuth(
    request,
    { roles, tenantId, requireActiveTenant = true, allowSuperAdminBootstrap = false } = {}
  ) {
    if (tenantId !== undefined && (typeof tenantId !== "string" || !TENANT_ID_PATTERN.test(tenantId))) {
      throw new AuthError("tenantId inválido.", 400);
    }

    const token = readBearerToken(request);
    if (!token) throw new AuthError("Autenticação necessária.", 401);

    const auth = resolveAdminAuth();
    let user;
    try {
      user = await auth.verifyIdToken(token, true);
    } catch (error) {
      if (error?.code === "auth/id-token-revoked" || error?.code === "auth/user-disabled") {
        throw new AuthError("A conta ou sessão foi desativada.", 403);
      }
      if (["auth/argument-error", "auth/invalid-id-token", "auth/id-token-expired"].includes(error?.code)) {
        throw new AuthError("Sessão inválida ou expirada.", 401);
      }
      throw error;
    }

    const role = user.role ?? null;
    const canBootstrapSuperAdmin = allowSuperAdminBootstrap
      && Array.isArray(roles)
      && roles.includes("superAdmin")
      && user.firebase?.sign_in_provider === "google.com"
      && user.email_verified === true
      && !!user.email?.trim()
      && superAdminEmailAllowlist().has(user.email.trim().toLowerCase());
    if ((!Array.isArray(roles) || !roles.includes(role)) && !canBootstrapSuperAdmin) {
      throw new AuthError("Seu perfil não pode executar esta ação.", 403);
    }

    if (role === "tenantAdmin") {
      if (!tenantId || user.tenantId !== tenantId) {
        throw new AuthError("Acesso não autorizado para esta loja.", 403);
      }

      const db = resolveAdminFirestore();
      const member = await db.doc(`tenant_admins/${tenantId}/users/${user.uid}`).get();
      if (!member.exists || member.data()?.ativo !== true || member.data()?.isFirstAccess === true) {
        throw new AuthError("Acesso não autorizado para esta loja.", 403);
      }

      if (requireActiveTenant) {
        const tenant = await db.doc(`tenants/${tenantId}`).get();
        if (!tenant.exists || tenant.data()?.ativo !== true) {
          throw new AuthError("Esta loja está desativada.", 403);
        }
      }
    }

    if (role === "superAdmin" || canBootstrapSuperAdmin) {
      const email = user.email?.trim().toLowerCase() ?? "";
      if (
        user.firebase?.sign_in_provider !== "google.com"
        || user.email_verified !== true
        || !email
        || !superAdminEmailAllowlist().has(email)
      ) {
        throw new AuthError("Esta conta não está autorizada como SuperAdmin.", 403);
      }
    }

    return {
      uid: user.uid,
      email: user.email ?? "",
      role,
      tenantId: user.tenantId ?? null,
    };
  };
}

export const requireAuth = createRequireAuth({ getAdminAuth, getAdminFirestore });
