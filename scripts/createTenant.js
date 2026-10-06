import { createDefaultTenant } from "../lib/defaultSchema.js";
import { getAdminFirestore, grantTenantAdmin, parseAdminUid, parseTenantId } from "./firebase-admin.js";

async function main() {
  const tenantId = parseTenantId(process.argv[2]);
  const adminUid = parseAdminUid(process.argv.slice(3));
  const db = getAdminFirestore();
  const reference = db.doc(`tenants/${tenantId}`);
  const tenant = createDefaultTenant();

  await reference.create({
    configuracoes: tenant.configuracoes,
    criado_em: new Date(),
    atualizado_em: new Date(),
  });
  await grantTenantAdmin(db, tenantId, adminUid);

  console.log(`Tenant "${tenantId}" criado em branco.`);
  console.log(adminUid
    ? `UID ${adminUid} autorizado no painel.`
    : "Nenhum administrador foi vinculado. Passe --admin-uid=<UID> para autorizar o painel.");
}

main().catch((error) => {
  console.error(`Falha ao criar tenant: ${error.message}`);
  process.exitCode = 1;
});
