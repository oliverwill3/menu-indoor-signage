import { createDefaultPublishedPlaylist, createDefaultTenant, createDefaultTenantDraft } from "../lib/defaultSchema.js";
import {
  ensurePlatformMediaPlaylist,
  getAdminFirestore,
  grantTenantAdmin,
  parseAdminUid,
  parseTenantId,
} from "../lib/server/firebase-admin.js";

async function main() {
  const tenantId = parseTenantId(process.argv[2]);
  const adminUid = parseAdminUid(process.argv.slice(3));
  const db = getAdminFirestore();
  const now = new Date();
  await ensurePlatformMediaPlaylist(db);

  const tenant = createDefaultTenant({
    tenantId,
    ativo: true,
    status: "active",
    subscriptionStatus: "active",
    adsEvery: 4,
    adsEveryGrace: 2,
    gracePeriodDays: 7,
    createdAt: now,
    updatedAt: now,
    configuracoes: {
      ativo: true,
      nome: "",
      slogan: "",
      slogan_secundario: "",
      titulo_promocoes: "",
      avisos_rodape: [],
      logo: "",
      logo_secundario: "",
      cor_primaria: "#6B7280",
      cor_fundo: "#111827",
      cor_texto: "#F9FAFB",
      layout: "l",
      intervalo_slides: 8,
      nota_google: { nota: 0, total: 0 },
    },
  });

  const draft = createDefaultTenantDraft({
    tenantId,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });

  const playlist = createDefaultPublishedPlaylist({
    tenantId,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    isPublished: false,
  });

  const tenantReference = db.doc(`tenants/${tenantId}`);
  await tenantReference.set({
    ...tenant,
    criado_em: now,
    atualizado_em: now,
  }, { merge: true });

  await db.doc(`tenant_drafts/${tenantId}`).set({
    ...draft,
    criado_em: now,
    atualizado_em: now,
  }, { merge: true });

  await db.doc(`playlists/${tenantId}`).set({
    ...playlist,
    criado_em: now,
    atualizado_em: now,
  }, { merge: true });

  await grantTenantAdmin(db, tenantId, adminUid);

  console.log(`Tenant "${tenantId}" criado em branco.`);
  console.log(adminUid
    ? `UID ${adminUid} autorizado no painel com papel tenantAdmin.`
    : "Nenhum administrador foi vinculado. Passe --admin-uid=<UID> para autorizar o painel.");
}

main().catch((error) => {
  console.error(`Falha ao criar tenant: ${error.message}`);
  process.exitCode = 1;
});
