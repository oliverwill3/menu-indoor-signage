import assert from "node:assert/strict";
import { test } from "node:test";
import { createPostHandler } from "../../app/api/auth/super-admin/bootstrap/route.js";
import { assertAdminEnvironment, assertNoProductionEmulators } from "../../lib/server/firebase-admin.js";
import { createRequireAuth } from "../../lib/server/requireAuth.js";
import { ApiError, AuthError, handleRouteError } from "../../lib/server/route-errors.js";

const tenantId = "tenant-a";
const memberPath = `tenant_admins/${tenantId}/users/user-a`;
const tenantPath = `tenants/${tenantId}`;

function request(token = "") {
  return new Request("http://localhost/api/test", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

function snapshot(value) {
  return {
    exists: value !== undefined,
    data: () => value,
  };
}

function createHarness({ user, verifyError, documents = {}, initializeError } = {}) {
  const authCalls = [];
  const firestorePaths = [];
  const requireAuth = createRequireAuth({
    getAdminAuth() {
      if (initializeError) throw initializeError;
      return {
        async verifyIdToken(token, checkRevoked) {
          authCalls.push({ token, checkRevoked });
          if (verifyError) throw verifyError;
          return user;
        },
      };
    },
    getAdminFirestore() {
      return {
        doc(path) {
          firestorePaths.push(path);
          return { get: async () => snapshot(documents[path]) };
        },
      };
    },
  });
  return { requireAuth, authCalls, firestorePaths };
}

const tenantAdminClaims = {
  uid: "user-a",
  email: "user-a@example.test",
  role: "tenantAdmin",
  tenantId,
};

function activeTenantDocuments(overrides = {}) {
  return {
    [memberPath]: { ativo: true, isFirstAccess: false },
    [tenantPath]: { ativo: true },
    ...overrides,
  };
}

test("requireAuth rejeita requisição sem token antes de inicializar Auth", async () => {
  const harness = createHarness({ initializeError: new Error("deve permanecer sem chamada") });
  await assert.rejects(
    harness.requireAuth(request(), { roles: ["tenantAdmin"], tenantId }),
    (error) => error instanceof AuthError && error.status === 401
  );
});

test("requireAuth distingue token revogado e usuário desativado", async (t) => {
  for (const code of ["auth/id-token-revoked", "auth/user-disabled"]) {
    await t.test(code, async () => {
      const harness = createHarness({ verifyError: Object.assign(new Error("invalid"), { code }) });
      await assert.rejects(
        harness.requireAuth(request("fake-token"), { roles: ["tenantAdmin"], tenantId }),
        (error) => error instanceof AuthError && error.status === 403
      );
      assert.equal(harness.authCalls[0].checkRevoked, true);
    });
  }
});

test("requireAuth converte apenas erros conhecidos de token e deixa falhas do Admin chegarem ao 500", async (t) => {
  await t.test("token inválido", async () => {
    const harness = createHarness({
      verifyError: Object.assign(new Error("invalid token"), { code: "auth/invalid-id-token" }),
    });
    await assert.rejects(
      harness.requireAuth(request("fake-token"), { roles: ["tenantAdmin"], tenantId }),
      (error) => error instanceof AuthError && error.status === 401
    );
  });

  await t.test("erro inesperado na verificação", async () => {
    const harness = createHarness({ verifyError: new Error("Auth service unavailable") });
    await assert.rejects(
      harness.requireAuth(request("fake-token"), { roles: ["tenantAdmin"], tenantId }),
      /Auth service unavailable/
    );
  });
});

test("requireAuth rejeita claims sem papel e tenantId divergente", async (t) => {
  await t.test("papel ausente", async () => {
    const harness = createHarness({
      user: { uid: "user-a", tenantId },
      documents: activeTenantDocuments(),
    });
    await assert.rejects(
      harness.requireAuth(request("valid-token"), { roles: ["tenantAdmin"], tenantId }),
      (error) => error instanceof AuthError && error.status === 403
    );
    assert.deepEqual(harness.firestorePaths, []);
  });

  await t.test("tenant diferente do token", async () => {
    const harness = createHarness({
      user: { ...tenantAdminClaims, tenantId: "tenant-b" },
      documents: activeTenantDocuments(),
    });
    await assert.rejects(
      harness.requireAuth(request("valid-token"), { roles: ["tenantAdmin"], tenantId }),
      (error) => error instanceof AuthError && error.status === 403
    );
    assert.deepEqual(harness.firestorePaths, []);
  });
});

test("requireAuth só permite bootstrap SuperAdmin para Google verificado na allowlist", async (t) => {
  const previousAllowlist = process.env.SUPER_ADMIN_EMAILS;
  process.env.SUPER_ADMIN_EMAILS = "srt.wiltonoliveira@gmail.com";
  const baseUser = {
    uid: "super-admin",
    email: "srt.wiltonoliveira@gmail.com",
    email_verified: true,
    firebase: { sign_in_provider: "google.com" },
  };
  try {
    await t.test("Google verificado e allowlisted pode bootstrap", async () => {
      const harness = createHarness({ user: baseUser });
      const principal = await harness.requireAuth(request("valid-token"), {
        roles: ["superAdmin"],
        allowSuperAdminBootstrap: true,
      });
      assert.equal(principal.uid, "super-admin");
      assert.equal(principal.role, null);
    });

    for (const [label, overrides] of [
      ["provedor diferente", { firebase: { sign_in_provider: "password" } }],
      ["e-mail não verificado", { email_verified: false }],
      ["e-mail fora da allowlist", { email: "outra-pessoa@example.test" }],
    ]) {
      await t.test(`recusa ${label}`, async () => {
        const harness = createHarness({ user: { ...baseUser, ...overrides } });
        await assert.rejects(
          harness.requireAuth(request("valid-token"), {
            roles: ["superAdmin"],
            allowSuperAdminBootstrap: true,
          }),
          (error) => error instanceof AuthError && error.status === 403
        );
      });
    }
  } finally {
    if (previousAllowlist === undefined) delete process.env.SUPER_ADMIN_EMAILS;
    else process.env.SUPER_ADMIN_EMAILS = previousAllowlist;
  }
});

test("bootstrap SuperAdmin atualiza claims sem remover claims não relacionadas e é idempotente", async (t) => {
  await t.test("promove e remove vínculo antigo do tenant", async () => {
    const savedClaims = [];
    const authOptions = [];
    const handler = createPostHandler({
      async requireAuth(_request, options) {
        authOptions.push(options);
        return { uid: "super-admin", email: "srt.wiltonoliveira@gmail.com" };
      },
      getAdminAuth() {
        return {
          async getUser() {
            return {
              email: "srt.wiltonoliveira@gmail.com",
              emailVerified: true,
              providerData: [{
                providerId: "google.com",
                email: "srt.wiltonoliveira@gmail.com",
              }],
              customClaims: { role: "tenantAdmin", tenantId: "tenant-a", featureFlag: true },
            };
          },
          async setCustomUserClaims(uid, claims) {
            savedClaims.push({ uid, claims });
          },
        };
      },
    });

    const response = await handler(new Request("http://localhost/api/auth/super-admin/bootstrap", { method: "POST" }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.deepEqual(authOptions, [{ roles: ["superAdmin"], allowSuperAdminBootstrap: true }]);
    assert.deepEqual(savedClaims, [{
      uid: "super-admin",
      claims: { featureFlag: true, role: "superAdmin" },
    }]);
  });

  await t.test("não grava claims novamente quando já está configurado", async () => {
    let writes = 0;
    const handler = createPostHandler({
      async requireAuth() {
        return { uid: "super-admin", email: "srt.wiltonoliveira@gmail.com" };
      },
      getAdminAuth() {
        return {
          async getUser() {
            return {
              email: "srt.wiltonoliveira@gmail.com",
              emailVerified: true,
              providerData: [{
                providerId: "google.com",
                email: "srt.wiltonoliveira@gmail.com",
              }],
              customClaims: { role: "superAdmin" },
            };
          },
          async setCustomUserClaims() {
            writes += 1;
          },
        };
      },
    });

    const response = await handler(new Request("http://localhost/api/auth/super-admin/bootstrap", { method: "POST" }));
    assert.equal(response.status, 200);
    assert.equal(writes, 0);
  });

  await t.test("recusa Google vinculado com e-mail diferente", async () => {
    let writes = 0;
    const handler = createPostHandler({
      async requireAuth() {
        return { uid: "super-admin", email: "srt.wiltonoliveira@gmail.com" };
      },
      getAdminAuth() {
        return {
          async getUser() {
            return {
              email: "srt.wiltonoliveira@gmail.com",
              emailVerified: true,
              providerData: [{ providerId: "google.com", email: "attacker@example.test" }],
              customClaims: {},
            };
          },
          async setCustomUserClaims() {
            writes += 1;
          },
        };
      },
    });
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      const response = await handler(new Request("http://localhost/api/auth/super-admin/bootstrap", { method: "POST" }));
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), {
        error: "A Conta Google verificada precisa corresponder ao e-mail autorizado.",
      });
      assert.equal(writes, 0);
    } finally {
      console.error = originalConsoleError;
    }
  });
});

test("requireAuth exige membro ativo e primeiro acesso concluído", async (t) => {
  for (const member of [
    { ativo: false, isFirstAccess: false },
    { ativo: true, isFirstAccess: true },
  ]) {
    await t.test(JSON.stringify(member), async () => {
      const harness = createHarness({
        user: tenantAdminClaims,
        documents: activeTenantDocuments({ [memberPath]: member }),
      });
      await assert.rejects(
        harness.requireAuth(request("valid-token"), { roles: ["tenantAdmin"], tenantId }),
        (error) => error instanceof AuthError && error.status === 403
      );
    });
  }
});

test("requireAuth exige tenant ativo, salvo opção explícita de leitura", async (t) => {
  const documents = activeTenantDocuments({ [tenantPath]: { ativo: false } });
  const harness = createHarness({ user: tenantAdminClaims, documents });
  await assert.rejects(
    harness.requireAuth(request("valid-token"), { roles: ["tenantAdmin"], tenantId }),
    (error) => error instanceof AuthError && error.status === 403
  );

  const readOnlyPrincipal = await harness.requireAuth(request("valid-token"), {
    roles: ["tenantAdmin"],
    tenantId,
    requireActiveTenant: false,
  });
  assert.equal(readOnlyPrincipal.uid, "user-a");
  assert.equal(readOnlyPrincipal.role, "tenantAdmin");
});

test("requireAuth limita SuperAdmin a Google verificado e allowlist", async (t) => {
  const previousAllowlist = process.env.SUPER_ADMIN_EMAILS;
  process.env.SUPER_ADMIN_EMAILS = "allowed@example.test";
  try {
    for (const user of [
      {
        uid: "admin",
        role: "superAdmin",
        email: "other@example.test",
        email_verified: true,
        firebase: { sign_in_provider: "google.com" },
      },
      {
        uid: "admin",
        role: "superAdmin",
        email: "allowed@example.test",
        email_verified: true,
        firebase: { sign_in_provider: "password" },
      },
    ]) {
      const harness = createHarness({ user });
      await assert.rejects(
        harness.requireAuth(request("valid-token"), { roles: ["superAdmin"] }),
        (error) => error instanceof AuthError && error.status === 403
      );
    }

    const harness = createHarness({
      user: {
        uid: "admin",
        email: "ALLOWED@example.test",
        role: "superAdmin",
        email_verified: true,
        firebase: { sign_in_provider: "google.com" },
        unrelatedClaim: "not returned",
      },
    });
    const principal = await harness.requireAuth(request("valid-token"), { roles: ["superAdmin"] });
    assert.deepEqual(principal, {
      uid: "admin",
      email: "ALLOWED@example.test",
      role: "superAdmin",
      tenantId: null,
    });
    assert.equal("claims" in principal, false);
  } finally {
    if (previousAllowlist === undefined) delete process.env.SUPER_ADMIN_EMAILS;
    else process.env.SUPER_ADMIN_EMAILS = previousAllowlist;
  }
});

test("erro de inicialização do Admin resulta em 500 genérico, não 401", async () => {
  const harness = createHarness({ initializeError: new Error("admin credentials missing") });
  let response;
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(
      harness.requireAuth(request("valid-token"), { roles: ["tenantAdmin"], tenantId }),
      /admin credentials missing/
    );
    response = handleRouteError(new Error("admin credentials missing"), "test");
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Ocorreu um erro interno do servidor." });
});

test("handleRouteError preserva ApiError/AuthError e mascara erros inesperados", async (t) => {
  await t.test("AuthError", async () => {
    const response = handleRouteError(new AuthError("negado", 403), "test");
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "negado" });
  });
  await t.test("ApiError", async () => {
    const response = handleRouteError(new ApiError("inválido", 400), "test");
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "inválido" });
  });
  await t.test("erro genérico", async () => {
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      const response = handleRouteError(new Error("detalhe interno"), "test");
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: "Ocorreu um erro interno do servidor." });
    } finally {
      console.error = originalConsoleError;
    }
  });
});

test("Admin SDK exige credenciais em produção e rejeita emuladores", () => {
  assert.throws(
    () => assertAdminEnvironment({
      NODE_ENV: "production",
      GOOGLE_CLOUD_PROJECT: "demo-production",
    }),
    /Credenciais do Firebase Admin obrigatórias/
  );
  assert.throws(
    () => assertAdminEnvironment({
      VERCEL_ENV: "production",
      GOOGLE_CLOUD_PROJECT: "production-project",
      FIREBASE_SERVICE_ACCOUNT_JSON: "{}",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
    }),
    /not allowed in production/
  );
  assert.throws(
    () => assertNoProductionEmulators({
      NODE_ENV: "production",
      STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
    }),
    /STORAGE_EMULATOR_HOST/
  );
  assert.throws(
    () => assertNoProductionEmulators({
      VERCEL_ENV: "production",
      FIRESTORE_EMULATOR_HOST: "",
    }),
    /not allowed in production/
  );
  assert.deepEqual(assertAdminEnvironment({
    NODE_ENV: "test",
    GOOGLE_CLOUD_PROJECT: "demo-menu-indoor",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
    FIREBASE_ADMIN_ALLOW_EMULATOR_NO_CREDENTIALS: "true",
  }), {
    projectId: "demo-menu-indoor",
    allowNoCredentialsForEmulators: true,
  });
});
