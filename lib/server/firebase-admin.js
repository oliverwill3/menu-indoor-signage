import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createDefaultPlatformMediaPlaylist, createDefaultTenantUser } from "../defaultSchema.js";
import { ApiError } from "./route-errors.js";

export const TENANT_ID_PATTERN = /^[a-z0-9-]{3,64}$/;

export function assertNoProductionEmulators(env = process.env) {
  const isProduction = env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
  const emulatorVariables = Object.keys(env).filter(
    (key) => key.endsWith("_EMULATOR_HOST")
  );
  if (isProduction && emulatorVariables.length > 0) {
    throw new Error(
      `Firebase Emulator configuration is not allowed in production (${emulatorVariables.join(", ")}).`
    );
  }
}

assertNoProductionEmulators();

export function assertAdminEnvironment(env = process.env) {
  assertNoProductionEmulators(env);
  const projectId = env.GOOGLE_CLOUD_PROJECT || env.GCLOUD_PROJECT || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error("Defina NEXT_PUBLIC_FIREBASE_PROJECT_ID no ambiente.");
  }

  const hasServiceAccountJson = Boolean(env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim());
  const hasApplicationCredentials = Boolean(env.GOOGLE_APPLICATION_CREDENTIALS?.trim());
  const isProduction = env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
  if (isProduction && !hasServiceAccountJson && !hasApplicationCredentials) {
    throw new Error(
      "Credenciais do Firebase Admin obrigatórias em produção. Defina FIREBASE_SERVICE_ACCOUNT_JSON ou GOOGLE_APPLICATION_CREDENTIALS."
    );
  }

  const allowNoCredentialsForEmulators = env.NODE_ENV === "test"
    && env.FIREBASE_ADMIN_ALLOW_EMULATOR_NO_CREDENTIALS === "true"
    && Boolean(env.FIRESTORE_EMULATOR_HOST?.trim())
    && Boolean(env.FIREBASE_AUTH_EMULATOR_HOST?.trim());

  return { projectId, allowNoCredentialsForEmulators };
}

function getAdminApp() {
  const { projectId, allowNoCredentialsForEmulators } = assertAdminEnvironment();
  const existingApp = getApps()[0];
  if (existingApp) return existingApp;

  const serializedCredentials = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  let credential;
  if (serializedCredentials) {
    try {
      credential = cert(JSON.parse(serializedCredentials));
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON deve conter credenciais JSON válidas.");
    }
  } else if (!allowNoCredentialsForEmulators) {
    credential = applicationDefault();
  }

  return initializeApp({ ...(credential ? { credential } : {}), projectId });
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminFirestore() {
  return getFirestore(getAdminApp());
}

export async function ensurePlatformMediaPlaylist(db) {
  const playlistRef = db.doc("platform/mediaPlaylist");
  await db.runTransaction(async (transaction) => {
    const playlistSnapshot = await transaction.get(playlistRef);
    if (!playlistSnapshot.exists) {
      transaction.create(playlistRef, createDefaultPlatformMediaPlaylist({
        updatedAt: new Date(),
      }));
    }
  });
}

export function parseTenantId(value) {
  if (typeof value !== "string" || !TENANT_ID_PATTERN.test(value)) {
    throw new ApiError("tenantId inválido. Use de 3 a 64 letras minúsculas, números ou hífens.", 400);
  }
  return value;
}

export function parseAdminUid(args) {
  const value = args.find((arg) => arg.startsWith("--admin-uid="))?.slice("--admin-uid=".length);
  return value?.trim() || "";
}

export async function grantTenantAdmin(db, tenantId, uid) {
  if (!uid) return;

  const auth = getAdminAuth();
  const user = await auth.getUser(uid);
  const existingClaims = user.customClaims ?? {};
  if (existingClaims.role && existingClaims.role !== "tenantAdmin") {
    throw new Error("A conta informada já possui outro papel de sistema. Use uma conta separada para o tenant.");
  }
  if (existingClaims.tenantId && existingClaims.tenantId !== tenantId) {
    throw new Error("A conta informada já está vinculada a outro tenant.");
  }

  const now = new Date();
  const membershipRef = db.doc(`tenant_admins/${tenantId}/users/${uid}`);
  const membershipSnapshot = await membershipRef.get();
  const existingMembership = membershipSnapshot.data() ?? {};

  await auth.setCustomUserClaims(uid, {
    ...existingClaims,
    role: "tenantAdmin",
    tenantId,
  });
  await membershipRef.set(createDefaultTenantUser({
    uid,
    tenantId,
    email: user.email ?? "",
    displayName: user.displayName ?? existingMembership.displayName ?? "",
    role: "tenantAdmin",
    ativo: true,
    isFirstAccess: existingMembership.isFirstAccess ?? false,
    invitedAt: existingMembership.invitedAt ?? null,
    firstAccessCompletedAt: existingMembership.firstAccessCompletedAt ?? null,
    createdAt: existingMembership.createdAt ?? now,
    updatedAt: now,
  }), { merge: true });
}
