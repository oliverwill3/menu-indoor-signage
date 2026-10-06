import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export function getAdminFirestore() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error("Defina NEXT_PUBLIC_FIREBASE_PROJECT_ID no ambiente.");
  }

  const app = getApps()[0] ?? initializeApp({
    credential: applicationDefault(),
    projectId,
  });
  return getFirestore(app);
}

export function parseTenantId(value) {
  const tenantId = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(tenantId)) {
    throw new Error("tenantId inválido. Use letras minúsculas, números e hífens.");
  }
  return tenantId;
}

export function parseAdminUid(args) {
  const value = args.find((arg) => arg.startsWith("--admin-uid="))?.slice("--admin-uid=".length);
  return value?.trim() || "";
}

export async function grantTenantAdmin(db, tenantId, uid) {
  if (uid) {
    await db.doc(`tenant_admins/${tenantId}/users/${uid}`).set({
      ativo: true,
      criado_em: new Date(),
    });
  }
}
