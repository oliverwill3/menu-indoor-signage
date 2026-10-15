import { getAdminAuth } from "../../../../../lib/server/firebase-admin.js";
import { requireAuth } from "../../../../../lib/server/requireAuth.js";
import { AuthError, handleRouteError } from "../../../../../lib/server/route-errors.js";

export function createPostHandler({ requireAuth: authorize, getAdminAuth: resolveAdminAuth }) {
  return async function POST(request) {
    try {
      const principal = await authorize(request, {
        roles: ["superAdmin"],
        allowSuperAdminBootstrap: true,
      });
      const auth = resolveAdminAuth();
      const user = await auth.getUser(principal.uid);
      const email = principal.email.trim().toLowerCase();
      const googleEmail = user.providerData
        .find(({ providerId }) => providerId === "google.com")
        ?.email?.trim().toLowerCase();
      if (
        user.emailVerified !== true
        || user.email?.trim().toLowerCase() !== email
        || googleEmail !== email
      ) {
        throw new AuthError("A Conta Google verificada precisa corresponder ao e-mail autorizado.", 403);
      }

      const claims = { ...(user.customClaims ?? {}) };
      delete claims.role;
      delete claims.tenantId;
      claims.role = "superAdmin";

      if (user.customClaims?.role !== "superAdmin" || user.customClaims?.tenantId) {
        await auth.setCustomUserClaims(principal.uid, claims);
      }

      return Response.json({ ok: true });
    } catch (error) {
      return handleRouteError(error, "Falha ao habilitar acesso SuperAdmin.");
    }
  };
}

export const POST = createPostHandler({ requireAuth, getAdminAuth });
