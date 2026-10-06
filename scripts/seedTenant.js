import { getAdminFirestore, grantTenantAdmin, parseAdminUid } from "./firebase-admin.js";

const tenantId = "gutemberg-lounge";
const settings = {
  nome: "Gutemberg Lounge",
  logo: "",
  cor_primaria: "#E5A823",
  avisos_rodape: [
    "🍺 BEM-VINDO AO GUTEMBERG LOUNGE",
    "CHOPP PILSEN GELADO R$ 14,90",
    "ALMOÇO EXECUTIVO A PARTIR DE R$ 36,90",
    "BISTRÔ • CHOPERIA • CAFÉ • PEÇA PELO IFOOD E ZAP 🥂",
  ],
  nota_google: { nota: 0, total: 0 },
  ativo: true,
  slogan: "Do Café da Manhã ao Happy Hour",
  slogan_secundario: "Galeria Primavera",
  titulo_promocoes: "Promoções e destaques",
  cor_fundo: "#111111",
  cor_texto: "#F3F4F6",
  layout: "l",
  intervalo_slides: 8,
};

const products = [
  {
    id: "chopp-pilsen-coxinhas",
    nome: "Chopp Pilsen & Coxinhas Gutemberg",
    descricao: "Chopp trincando de gelado acompanhado de coxinhas artesanais.",
    categoria: "CHOPERIA & PETISCOS",
    preco_anterior: "R$ 68,00",
    preco: "R$ 49,90",
    selo: "O MAIS PEDIDO",
    imagem: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80",
    ativo: true,
    destaque: true,
    promocional: false,
    ordem: 1,
    tempo_exibicao: 6,
  },
  {
    id: "citrus-gin-tropical",
    nome: "Gutemberg Citrus & Gin Tropical",
    descricao: "Coquetelaria autoral com frutas frescas e xaropes da casa.",
    categoria: "DRINKS & COQUETELARIA",
    preco_anterior: "R$ 45,00",
    preco: "R$ 32,90",
    selo: "HAPPY HOUR",
    imagem: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=1200&q=80",
    ativo: true,
    destaque: true,
    promocional: false,
    ordem: 2,
    tempo_exibicao: 6,
  },
  {
    id: "cappuccino-pao-de-queijo",
    nome: "Cappuccino Cremoso & Pão de Queijo",
    descricao: "Cappuccino especial com cacau e pão de queijo quentinho.",
    categoria: "CAFETERIA & MATINAIS",
    preco: "R$ 28,90",
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
  { id: "chopp-brahma", nome: "Chopp Brahma", preco: "R$ 14,90", ativo: true, ordem: 1 },
  { id: "coxinhas-gutemberg", nome: "Coxinhas Gutenberg", preco: "R$ 49,90", ativo: true, ordem: 2 },
];

async function main() {
  const adminUid = parseAdminUid(process.argv.slice(2));
  const db = getAdminFirestore();
  const batch = db.batch();

  batch.set(db.doc(`tenants/${tenantId}`), {
    configuracoes: settings,
    criado_em: new Date(),
    atualizado_em: new Date(),
  }, { merge: true });
  products.forEach((product) => {
    batch.set(db.doc(`tenants/${tenantId}/produtos/${product.id}`), product);
  });
  promotions.forEach((promotion) => {
    batch.set(db.doc(`tenants/${tenantId}/promocoes/${promotion.id}`), promotion);
  });

  await batch.commit();
  await grantTenantAdmin(db, tenantId, adminUid);
  console.log(`Conteúdo original conhecido gravado em tenants/${tenantId}.`);
  console.log(adminUid
    ? `UID ${adminUid} autorizado no painel.`
    : "Passe --admin-uid=<UID> para autorizar uma conta no painel mobile.");
}

main().catch((error) => {
  console.error(`Falha ao popular tenant: ${error.message}`);
  process.exitCode = 1;
});
