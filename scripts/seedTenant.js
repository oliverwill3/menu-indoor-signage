import {
  createDefaultPublishedPlaylist,
  createDefaultTenant,
  createDefaultTenantDraft,
} from "../lib/defaultSchema.js";
import {
  ensurePlatformMediaPlaylist,
  getAdminFirestore,
  grantTenantAdmin,
  parseAdminUid,
} from "../lib/server/firebase-admin.js";

const tenantId = "gutemberg-lounge";
const settings = {
  nome: "Espaço de Bistrô",
  logo: "",
  cor_primaria: "#E5A823",
  avisos_rodape: [
    "🍽️ BEM-VINDO AO NOSSO ESPAÇO",
    "PROMOÇÃO DO DIA: PETISCOS E VINHO R$ 39,90",
    "CAFÉ E BRUNCH COM VARIEDADE DE SABORES",
    "BISTRÔ • CAFETERIA • HAPPY HOUR • ENTREGA 🥂",
  ],
  nota_google: { nota: 0, total: 0 },
  ativo: true,
  slogan: "Do café da manhã ao happy hour",
  slogan_secundario: "Ambiente acolhedor e cheio de sabor",
  titulo_promocoes: "Destaques e promoções",
  cor_fundo: "#111111",
  cor_texto: "#F3F4F6",
  layout: "l",
  intervalo_slides: 8,
};

const products = [
  {
    id: "petisco-gourmet",
    nome: "Petisco Gourmet",
    descricao: "Seleção de petiscos artesanais para compartilhar em qualquer momento.",
    categoria: "PETISCOS & BISTRÔ",
    preco_anterior: "R$ 62,00",
    preco: "R$ 46,90",
    selo: "O MAIS PEDIDO",
    imagem: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80",
    ativo: true,
    destaque: true,
    promocional: false,
    ordem: 1,
    tempo_exibicao: 6,
  },
  {
    id: "drink-do-dia",
    nome: "Drink do Dia",
    descricao: "Coquetel com fruta fresca, frutas cítricas e toque equilibrado.",
    categoria: "BEBIDAS & COQUETELARIA",
    preco_anterior: "R$ 42,00",
    preco: "R$ 29,90",
    selo: "HAPPY HOUR",
    imagem: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=1200&q=80",
    ativo: true,
    destaque: true,
    promocional: false,
    ordem: 2,
    tempo_exibicao: 6,
  },
  {
    id: "brunch-matutino",
    nome: "Brunch Matutino",
    descricao: "Café especial com pão fresco e opções de brunch para começar bem o dia.",
    categoria: "CAFETERIA & MATINAIS",
    preco: "R$ 24,90",
    selo: "CAFÉ DA MANHÃ",
    imagem: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=1200&q=80",
    ativo: true,
    destaque: true,
    promocional: false,
    ordem: 3,
    tempo_exibicao: 6,
  },
];

const promotions = [
  { id: "promo-vinho", nome: "Vinho da casa", preco: "R$ 18,90", ativo: true, ordem: 1 },
  { id: "promo-brunch", nome: "Combo brunch", preco: "R$ 34,90", ativo: true, ordem: 2 },
];

async function main() {
  const adminUid = parseAdminUid(process.argv.slice(2));
  const db = getAdminFirestore();
  const now = new Date();
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
    configuracoes: settings,
    produtos: products,
    promocoes: promotions,
  });
  const batch = db.batch();

  await ensurePlatformMediaPlaylist(db);
  batch.set(db.doc(`tenants/${tenantId}`), {
    ...tenant,
    criado_em: now,
    atualizado_em: now,
  }, { merge: true });
  batch.set(db.doc(`tenant_drafts/${tenantId}`), {
    ...createDefaultTenantDraft({
      ...tenant,
      version: 1,
      createdAt: now,
      updatedAt: now,
    }),
    criado_em: now,
    atualizado_em: now,
  }, { merge: true });
  batch.set(db.doc(`playlists/${tenantId}`), {
    ...createDefaultPublishedPlaylist({
      ...tenant,
      version: 1,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
      isPublished: true,
    }),
    criado_em: now,
    atualizado_em: now,
  }, { merge: true });
  products.forEach((product) => {
    batch.set(db.doc(`tenants/${tenantId}/produtos/${product.id}`), product);
  });
  promotions.forEach((promotion) => {
    batch.set(db.doc(`tenants/${tenantId}/promocoes/${promotion.id}`), promotion);
  });

  await batch.commit();
  await grantTenantAdmin(db, tenantId, adminUid);
  console.log(`Conteúdo inicial gravado e publicado em playlists/${tenantId}.`);
  console.log(adminUid
    ? `UID ${adminUid} autorizado no painel com papel tenantAdmin.`
    : "Passe --admin-uid=<UID> para autorizar uma conta no painel mobile.");
}

main().catch((error) => {
  console.error(`Falha ao popular tenant: ${error.message}`);
  process.exitCode = 1;
});
