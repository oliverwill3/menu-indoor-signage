import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminFirestore, parseTenantId } from "../../../../../scripts/firebase-admin.js";

export const runtime = "nodejs";

const COLLECTIONS = ["produtos", "promocoes", "eventos", "avaliacoes", "anuncios_terceiros", "telas"];
const STRUCTURAL_FIELDS = [
  "nome",
  "logo",
  "logo_secundario",
  "titulo_promocoes",
  "cor_primaria",
  "cor_fundo",
  "cor_texto",
  "layout",
  "avisos_rodape",
  "nota_google",
  "intervalo_slides",
];
const DEFAULT_SETTINGS = {
  nome: "",
  logo: "",
  logo_secundario: "",
  cor_primaria: "#6B7280",
  avisos_rodape: [],
  nota_google: { nota: 0, total: 0 },
  slogan: "",
  slogan_secundario: "",
  titulo_promocoes: "",
  cor_fundo: "#111827",
  cor_texto: "#F9FAFB",
  layout: "l",
  intervalo_slides: 8,
};
const MAX_DOCUMENT_BYTES = 900_000;

class RouteError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value, maxLength = 500) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function safeId(value) {
  const id = text(value, 128);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw new RouteError("Um item contém identificador inválido.", 400);
  }
  return id;
}

function normalizeSettings(value) {
  const input = isRecord(value) ? value : {};
  const rating = isRecord(input.nota_google) ? input.nota_google : {};
  const notices = Array.isArray(input.avisos_rodape) ? input.avisos_rodape : [];

  return {
    nome: text(input.nome, 80),
    logo: text(input.logo, 2048),
    logo_secundario: text(input.logo_secundario, 2048),
    cor_primaria: text(input.cor_primaria, 32) || DEFAULT_SETTINGS.cor_primaria,
    avisos_rodape: notices.slice(0, 50).map((notice) => text(notice, 250)).filter(Boolean),
    nota_google: {
      nota: Number.isFinite(Number(rating.nota)) ? Math.min(5, Math.max(0, Number(rating.nota))) : 0,
      total: Number.isFinite(Number(rating.total)) ? Math.max(0, Number(rating.total)) : 0,
    },
    slogan: text(input.slogan, 120),
    slogan_secundario: text(input.slogan_secundario, 120),
    titulo_promocoes: text(input.titulo_promocoes, 80),
    cor_fundo: text(input.cor_fundo, 32) || DEFAULT_SETTINGS.cor_fundo,
    cor_texto: text(input.cor_texto, 32) || DEFAULT_SETTINGS.cor_texto,
    layout: input.layout === "l" ? "l" : DEFAULT_SETTINGS.layout,
    intervalo_slides: Number.isFinite(Number(input.intervalo_slides))
      ? Math.min(60, Math.max(3, Number(input.intervalo_slides)))
      : DEFAULT_SETTINGS.intervalo_slides,
  };
}

function normalizeCollection(collectionName, value) {
  const entries = Array.isArray(value) ? value : [];
  if (entries.length > 500) {
    throw new RouteError(`A lista ${collectionName} excede o limite de 500 itens.`, 400);
  }

  return entries.map((entry) => {
    if (!isRecord(entry)) throw new RouteError(`Há um item inválido em ${collectionName}.`, 400);
    const normalized = { id: safeId(entry.id), ordem: Number.isFinite(Number(entry.ordem)) ? Number(entry.ordem) : 0 };
    const copyText = (key, maxLength = 500) => {
      if (entry[key] !== undefined) normalized[key] = text(entry[key], maxLength);
    };
    const copyBoolean = (key, defaultValue = false) => {
      normalized[key] = entry[key] === undefined ? defaultValue : entry[key] === true;
    };

    if (collectionName === "produtos") {
      for (const key of ["nome", "descricao", "categoria", "preco", "preco_anterior", "imagem", "selo"]) copyText(key, key === "descricao" ? 500 : 2048);
      copyBoolean("ativo", true);
      copyBoolean("destaque");
      copyBoolean("promocional");
      normalized.tempo_exibicao = Number.isFinite(Number(entry.tempo_exibicao))
        ? Math.min(60, Math.max(3, Number(entry.tempo_exibicao)))
        : 8;
    } else if (collectionName === "promocoes") {
      copyText("nome", 100);
      copyText("preco", 30);
      copyBoolean("ativo", true);
    } else if (collectionName === "eventos") {
      copyText("titulo", 120);
      copyText("data", 10);
      copyText("imagem", 2048);
      copyBoolean("ativo", true);
    } else if (collectionName === "avaliacoes") {
      copyText("autor", 80);
      copyText("texto", 500);
      normalized.nota = Number.isFinite(Number(entry.nota)) ? Math.min(5, Math.max(1, Number(entry.nota))) : 5;
    } else if (collectionName === "anuncios_terceiros") {
      copyText("imagem", 2048);
      copyText("link", 2048);
      copyText("data_inicio", 10);
      copyText("data_fim", 10);
      copyBoolean("ativo", true);
      normalized.tempo_exibicao = Number.isFinite(Number(entry.tempo_exibicao))
        ? Math.min(60, Math.max(3, Number(entry.tempo_exibicao)))
        : 8;
    } else if (collectionName === "telas") {
      for (const key of ["titulo", "descricao", "imagem", "preco", "produtoId"]) copyText(key, key === "descricao" ? 500 : 2048);
      copyBoolean("ativo", true);
      normalized.tempo_exibicao = Number.isFinite(Number(entry.tempo_exibicao))
        ? Math.min(60, Math.max(3, Number(entry.tempo_exibicao)))
        : 8;
    }

    return normalized;
  });
}

function normalizeDraft(input) {
  if (!isRecord(input)) throw new RouteError("O rascunho enviado é inválido.", 400);
  const draft = { configuracoes: normalizeSettings(input.configuracoes) };
  for (const collectionName of COLLECTIONS) {
    draft[collectionName] = normalizeCollection(collectionName, input[collectionName]);
  }
  if (Buffer.byteLength(JSON.stringify(draft), "utf8") > MAX_DOCUMENT_BYTES) {
    throw new RouteError("O rascunho ultrapassa o limite seguro para uma playlist.", 400);
  }
  return draft;
}

function validatePublishableContent(draft) {
  if (draft.produtos.some((product) => product.ativo && !product.nome.trim())) {
    throw new RouteError("Todos os produtos ativos precisam ter nome antes da publicação.", 400);
  }

  const productsById = new Map(draft.produtos.map((product) => [product.id, product]));
  for (const screen of draft.telas.filter((item) => item.ativo)) {
    const linkedProduct = screen.produtoId ? productsById.get(screen.produtoId) : null;
    if (screen.produtoId && !linkedProduct) {
      throw new RouteError(`A tela "${screen.titulo || screen.id}" referencia um produto inexistente.`, 400);
    }
    if (screen.produtoId && linkedProduct.ativo !== true) {
      throw new RouteError(`O produto vinculado à tela "${screen.titulo || screen.id}" precisa estar ativo.`, 400);
    }
    if (!screen.titulo.trim() && !linkedProduct?.nome?.trim()) {
      throw new RouteError("Toda tela ativa precisa de título ou de um produto do catálogo.", 400);
    }
  }
}

function structuralSettings(settings) {
  return Object.fromEntries(STRUCTURAL_FIELDS.map((key) => [key, settings[key]]));
}

function hasInitialFrame(input) {
  const requiredText = ["nome", "slogan", "slogan_secundario", "titulo_promocoes"];
  if (requiredText.some((key) => !input.configuracoes[key]?.trim())) return false;
  if (!input.configuracoes.avisos_rodape.length) return false;
  for (const key of ["logo", "logo_secundario"]) {
    try {
      const url = new URL(input.configuracoes[key]);
      if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    } catch {
      return false;
    }
  }
  return true;
}

function toIsoDate(value) {
  return value?.toDate instanceof Function ? value.toDate().toISOString() : null;
}

async function authorize(request, tenantId, requireEditor = false) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!token) return { response: Response.json({ error: "Autenticação necessária." }, { status: 401 }) };

  const auth = getAdminAuth();
  const db = getAdminFirestore();
  let decoded;
  try {
    decoded = await auth.verifyIdToken(token, true);
  } catch {
    return { response: Response.json({ error: "Sessão inválida ou expirada." }, { status: 401 }) };
  }

  const [tenant, membership] = await Promise.all([
    db.doc(`tenants/${tenantId}`).get(),
    db.doc(`tenant_admins/${tenantId}/users/${decoded.uid}`).get(),
  ]);
  if (!tenant.exists || !membership.exists || membership.data()?.ativo === false || membership.data()?.isFirstAccess === true) {
    return { response: Response.json({ error: "Acesso não autorizado para esta loja." }, { status: 403 }) };
  }

  const role = membership.data()?.role ?? "owner";
  if (requireEditor && !["owner", "admin", "editor"].includes(role)) {
    return { response: Response.json({ error: "Seu perfil não pode alterar a playlist." }, { status: 403 }) };
  }
  return { db, uid: decoded.uid, tenant };
}

async function loadDraft(db, tenantId, tenant) {
  const draftRef = db.doc(`tenant_drafts/${tenantId}`);
  const playlistRef = db.doc(`playlists/${tenantId}`);
  const [draftSnapshot, playlistSnapshot] = await Promise.all([draftRef.get(), playlistRef.get()]);

  if (draftSnapshot.exists) {
    const data = draftSnapshot.data();
    return {
      draft: Object.fromEntries([
        "configuracoes",
        ...COLLECTIONS,
      ].map((key) => [key, data[key] ?? (key === "configuracoes" ? DEFAULT_SETTINGS : [])])),
      layoutConfigurado: data.layoutConfigurado === true,
      publishedAt: toIsoDate(playlistSnapshot.data()?.publishedAt),
      hasPublishedPlaylist: playlistSnapshot.exists,
    };
  }

  if (playlistSnapshot.exists) {
    const data = playlistSnapshot.data();
    return {
      draft: Object.fromEntries(["configuracoes", ...COLLECTIONS].map((key) => [
        key,
        data[key] ?? (key === "configuracoes" ? DEFAULT_SETTINGS : []),
      ])),
      layoutConfigurado: true,
      publishedAt: toIsoDate(data.publishedAt),
      hasPublishedPlaylist: true,
    };
  }

  const legacyCollections = await Promise.all(COLLECTIONS.filter((name) => name !== "telas").map(async (name) => {
    const result = await db.collection(`tenants/${tenantId}/${name}`).get();
    return [name, result.docs.map((entry) => ({ id: entry.id, ...entry.data() }))];
  }));
  const legacyData = tenant.data();
  const legacySettings = normalizeSettings(legacyData.configuracoes);

  return {
    draft: {
      configuracoes: legacySettings,
      ...Object.fromEntries(legacyCollections.map(([name, entries]) => [
        name,
        normalizeCollection(name, entries),
      ])),
      telas: [],
    },
    layoutConfigurado: false,
    publishedAt: null,
    hasPublishedPlaylist: false,
  };
}

function immutableFrameMatches(previousSettings, nextSettings) {
  return JSON.stringify(structuralSettings(previousSettings)) === JSON.stringify(structuralSettings(nextSettings));
}

export async function GET(request, { params }) {
  try {
    const { tenantId: routeTenantId } = await params;
    const tenantId = parseTenantId(routeTenantId);
    const authorization = await authorize(request, tenantId);
    if (authorization.response) return authorization.response;
    return Response.json(await loadDraft(authorization.db, tenantId, authorization.tenant));
  } catch (error) {
    if (error.message?.includes("tenantId inválido")) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("Falha ao carregar rascunho da playlist.", error);
    return Response.json({ error: "Não foi possível carregar o rascunho." }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const { tenantId: routeTenantId } = await params;
    const tenantId = parseTenantId(routeTenantId);
    const authorization = await authorize(request, tenantId, true);
    if (authorization.response) return authorization.response;

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_DOCUMENT_BYTES + 20_000) {
      return Response.json({ error: "O rascunho enviado é grande demais." }, { status: 413 });
    }

    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return Response.json({ error: "O corpo da solicitação precisa ser JSON válido." }, { status: 400 });
    }
    if (!isRecord(body) || !["saveDraft", "publish"].includes(body.action)) {
      return Response.json({ error: "Ação de playlist inválida." }, { status: 400 });
    }
    const draft = normalizeDraft(body.draft);
    if (body.action === "publish") validatePublishableContent(draft);
    const db = authorization.db;
    const draftRef = db.doc(`tenant_drafts/${tenantId}`);
    const playlistRef = db.doc(`playlists/${tenantId}`);
    const tenantRef = db.doc(`tenants/${tenantId}`);
    const result = await db.runTransaction(async (transaction) => {
      const existingDraft = await transaction.get(draftRef);
      const publishedPlaylist = await transaction.get(playlistRef);
      const tenant = await transaction.get(tenantRef);
      if (!tenant.exists) throw new RouteError("Tenant não encontrado.", 409);

      const previousDraft = existingDraft.exists ? existingDraft.data() : null;
      const previousPublished = publishedPlaylist.exists ? publishedPlaylist.data() : null;
      const previousTenantSettings = tenant.data()?.configuracoes ?? {};
      const layoutConfigurado = previousDraft
        ? previousDraft.layoutConfigurado === true
        : publishedPlaylist.exists || previousTenantSettings.layoutConfigurado === true;
      const immutableSettings = previousDraft?.configuracoes
        ?? previousPublished?.configuracoes
        ?? normalizeSettings(previousTenantSettings);

      if (layoutConfigurado && !immutableFrameMatches(immutableSettings, draft.configuracoes)) {
        throw new RouteError("A estrutura da moldura em L já foi salva e não pode mais ser alterada.", 409);
      }
      if (!layoutConfigurado && !hasInitialFrame(draft)) {
        throw new RouteError("Preencha nome, os dois logos, os dois slogans, título de destaques e pelo menos um aviso antes do primeiro salvamento.", 400);
      }

      const savedDraft = {
        ...draft,
        layoutConfigurado: true,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: authorization.uid,
      };
      transaction.set(draftRef, savedDraft);

      if (body.action === "publish") {
        transaction.set(playlistRef, {
          ...draft,
          tenantId,
          publishedAt: FieldValue.serverTimestamp(),
          version: 1,
        });
      }
      return { layoutConfigurado: true, draft };
    });

    const playlist = body.action === "publish" ? await playlistRef.get() : null;
    return Response.json({
      ...result,
      published: body.action === "publish",
      publishedAt: playlist ? toIsoDate(playlist.data()?.publishedAt) : null,
    });
  } catch (error) {
    if (error instanceof RouteError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error.message?.includes("tenantId inválido")) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("Falha ao salvar/publicar playlist.", error);
    return Response.json({ error: "Não foi possível salvar a playlist." }, { status: 500 });
  }
}
