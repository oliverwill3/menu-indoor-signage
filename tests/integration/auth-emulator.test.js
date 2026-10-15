import assert from "node:assert/strict";
import { test } from "node:test";
import { deleteApp, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { FieldValue } from "firebase-admin/firestore";
import { requireAuth } from "../../lib/server/requireAuth.js";

const emulatorsAvailable = Boolean(
  process.env.FIREBASE_AUTH_EMULATOR_HOST?.trim()
  && process.env.FIRESTORE_EMULATOR_HOST?.trim()
);

function bearerRequest(token) {
  return new Request("http://localhost/api/test", {
    headers: { authorization: `Bearer ${token}` },
  });
}

test("Auth Emulator valida token, revogação e claim de tenant diferente", {
  skip: !emulatorsAvailable,
}, async () => {
  process.env.NODE_ENV = "test";
  process.env.FIREBASE_ADMIN_ALLOW_EMULATOR_NO_CREDENTIALS = "true";
  process.env.GOOGLE_CLOUD_PROJECT ||= "demo-menu-indoor";
  const { getAdminAuth, getAdminFirestore } = await import("../../lib/server/firebase-admin.js");
  const adminAuth = getAdminAuth();
  const db = getAdminFirestore();
  const suffix = `${process.pid}-${Date.now()}`;
  const tenantA = `auth-a-${suffix}`;
  const tenantB = `auth-b-${suffix}`;
  const password = "Local-emulator-only-4321";
  const emailA = `tenant-a-${suffix}@example.test`;
  const emailB = `tenant-b-${suffix}@example.test`;
  const createdUids = [];
  let clientApp;
  let clientAuth;

  try {
    await db.doc(`tenants/${tenantA}`).set({
      ativo: true,
      subscriptionStatus: "active",
    });
    await db.doc(`tenants/${tenantB}`).set({ ativo: true });

    const userA = await adminAuth.createUser({ email: emailA, password, emailVerified: true });
    createdUids.push(userA.uid);
    await adminAuth.setCustomUserClaims(userA.uid, { role: "tenantAdmin", tenantId: tenantA });
    await db.doc(`tenant_admins/${tenantA}/users/${userA.uid}`).set({
      ativo: true,
      isFirstAccess: false,
    });
    const userB = await adminAuth.createUser({ email: emailB, password, emailVerified: true });
    createdUids.push(userB.uid);
    await adminAuth.setCustomUserClaims(userB.uid, { role: "tenantAdmin", tenantId: tenantB });
    await db.doc(`tenant_admins/${tenantB}/users/${userB.uid}`).set({
      ativo: true,
      isFirstAccess: false,
    });

    clientApp = initializeApp({
      apiKey: "demo-api-key",
      authDomain: "demo-menu-indoor.firebaseapp.com",
      projectId: process.env.GOOGLE_CLOUD_PROJECT,
    }, `auth-emulator-${suffix}`);
    clientAuth = getAuth(clientApp);
    connectAuthEmulator(clientAuth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, {
      disableWarnings: true,
    });

    await signInWithEmailAndPassword(clientAuth, emailA, password);
    const validToken = await clientAuth.currentUser.getIdToken(true);
    const principal = await requireAuth(bearerRequest(validToken), {
      roles: ["tenantAdmin"],
      tenantId: tenantA,
    });
    assert.equal(principal.uid, userA.uid);
    assert.equal(principal.tenantId, tenantA);

    const { POST } = await import("../../app/api/tenants/[tenantId]/playlist/route.js");
    const settings = {
      nome: "Emulator Test",
      logo: "https://example.test/logo.webp",
      logo_secundario: "https://example.test/logo-secondary.webp",
      slogan: "Primeiro slogan",
      slogan_secundario: "Segundo slogan",
      titulo_promocoes: "Destaques",
      avisos_rodape: ["Conteúdo de teste"],
    };
    const draft = {
      tenantId: tenantB,
      adsEvery: 0,
      subscriptionStatus: "overdue",
      configuracoes: settings,
      produtos: [],
      promocoes: [],
      eventos: [],
      avaliacoes: [],
      anuncios_terceiros: [],
      telas: [],
    };
    const createPublishRequest = () => new Request(`http://localhost/api/tenants/${tenantA}/playlist`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${validToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "publish",
        tenantId: tenantB,
        adsEvery: 0,
        subscriptionStatus: "overdue",
        draft,
      }),
    });
    const publishResponse = await POST(createPublishRequest(), {
      params: Promise.resolve({ tenantId: tenantA }),
    });
    assert.equal(publishResponse.status, 200);
    const published = (await db.doc(`playlists/${tenantA}`).get()).data();
    assert.equal(published.tenantId, tenantA);
    assert.equal(published.subscriptionStatus, "active");
    assert.equal(published.adsEvery, 4);
    assert.equal(published.adsEveryGrace, 2);

    await db.doc(`tenants/${tenantA}`).update({
      subscriptionStatus: FieldValue.delete(),
    });
    const missingSubscriptionResponse = await POST(createPublishRequest(), {
      params: Promise.resolve({ tenantId: tenantA }),
    });
    assert.equal(missingSubscriptionResponse.status, 409);

    await signOut(clientAuth);
    await signInWithEmailAndPassword(clientAuth, emailB, password);
    const otherTenantToken = await clientAuth.currentUser.getIdToken(true);
    await assert.rejects(
      requireAuth(bearerRequest(otherTenantToken), { roles: ["tenantAdmin"], tenantId: tenantA }),
      (error) => error.status === 403
    );

    await signOut(clientAuth);
    await signInWithEmailAndPassword(clientAuth, emailA, password);
    const tokenToRevoke = await clientAuth.currentUser.getIdToken(true);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await adminAuth.revokeRefreshTokens(userA.uid);
    await assert.rejects(
      requireAuth(bearerRequest(tokenToRevoke), { roles: ["tenantAdmin"], tenantId: tenantA }),
      (error) => error.status === 403
    );
  } finally {
    if (clientAuth) await signOut(clientAuth).catch(() => {});
    if (clientApp) await deleteApp(clientApp);
    await Promise.all(createdUids.map((uid) => adminAuth.deleteUser(uid).catch(() => {})));
    await Promise.all([
      ...createdUids.map((uid, index) =>
        db.doc(`tenant_admins/${index === 0 ? tenantA : tenantB}/users/${uid}`).delete()
      ),
      db.doc(`tenants/${tenantA}`).delete(),
      db.doc(`tenants/${tenantB}`).delete(),
      db.doc(`tenant_drafts/${tenantA}`).delete(),
      db.doc(`playlists/${tenantA}`).delete(),
    ]);
  }
});
