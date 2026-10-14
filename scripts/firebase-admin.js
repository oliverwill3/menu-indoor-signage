import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error("Defina NEXT_PUBLIC_FIREBASE_PROJECT_ID no ambiente.");
  }

  const existingApp = getApps()[0];
  if (existingApp) return existingApp;

  const serializedCredentials = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  let credential = applicationDefault();
  if (serializedCredentials) {
    try {
      credential = cert(JSON.parse(serializedCredentials));
    } catch (error) {
      throw new Error(`FIREBASE_SERVICE_ACCOUNT_JSON inválida: ${error.message}`);
    }
  }

  return initializeApp({ credential, projectId });
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminFirestore() {
  return getFirestore(getAdminApp());
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
      role: "owner",
      isFirstAccess: false,
      criado_em: new Date(),
    }, { merge: true });
  }
}
