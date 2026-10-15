export const tenantConfigDefaults = {
  nome: "",
  logo: "",
  logo_secundario: "",
  cor_primaria: "#6B7280",
  avisos_rodape: [],
  nota_google: {
    nota: 0,
    total: 0,
  },
  ativo: true,
  slogan: "",
  slogan_secundario: "",
  titulo_promocoes: "",
  cor_fundo: "#111827",
  cor_texto: "#F9FAFB",
  layout: "l",
  intervalo_slides: 8,
};

export const tenantCollections = [
  "produtos",
  "promocoes",
  "eventos",
  "avaliacoes",
  "anuncios_terceiros",
  "telas",
];

export const defaultTenant = {
  tenantId: "",
  ativo: true,
  status: "active",
  subscriptionStatus: "active",
  adsEvery: 4,
  adsEveryGrace: 2,
  gracePeriodDays: 7,
  graceStartedAt: null,
  empresa: {
    nomeFantasia: "",
    razaoSocial: "",
    cnpj: "",
    emailContato: "",
  },
  createdAt: null,
  updatedAt: null,
  configuracoes: {
    ...tenantConfigDefaults,
    nota_google: { ...tenantConfigDefaults.nota_google },
    avisos_rodape: [],
  },
  produtos: [],
  promocoes: [],
  eventos: [],
  avaliacoes: [],
  anuncios_terceiros: [],
  telas: [],
};

export function createDefaultTenant(overrides = {}) {
  const tenant = {
    ...defaultTenant,
    ...overrides,
    empresa: {
      ...defaultTenant.empresa,
      ...((overrides.empresa ?? {}) || {}),
    },
    configuracoes: {
      ...defaultTenant.configuracoes,
      ...((overrides.configuracoes ?? {}) || {}),
      nota_google: {
        ...defaultTenant.configuracoes.nota_google,
        ...((overrides.configuracoes?.nota_google ?? {}) || {}),
      },
      avisos_rodape: Array.isArray(overrides.configuracoes?.avisos_rodape)
        ? [...overrides.configuracoes.avisos_rodape]
        : [...defaultTenant.configuracoes.avisos_rodape],
    },
    produtos: Array.isArray(overrides.produtos) ? [...overrides.produtos] : [...defaultTenant.produtos],
    promocoes: Array.isArray(overrides.promocoes) ? [...overrides.promocoes] : [...defaultTenant.promocoes],
    eventos: Array.isArray(overrides.eventos) ? [...overrides.eventos] : [...defaultTenant.eventos],
    avaliacoes: Array.isArray(overrides.avaliacoes) ? [...overrides.avaliacoes] : [...defaultTenant.avaliacoes],
    anuncios_terceiros: Array.isArray(overrides.anuncios_terceiros)
      ? [...overrides.anuncios_terceiros]
      : [...defaultTenant.anuncios_terceiros],
    telas: Array.isArray(overrides.telas) ? [...overrides.telas] : [...defaultTenant.telas],
  };

  return tenant;
}

export function createDefaultTenantDraft(overrides = {}) {
  return {
    ...createDefaultTenant(overrides),
    version: overrides.version ?? 1,
    publishedAt: overrides.publishedAt ?? null,
    updatedAt: overrides.updatedAt ?? null,
  };
}

export function createDefaultPublishedPlaylist(overrides = {}) {
  return {
    ...createDefaultTenantDraft(overrides),
    isPublished: overrides.isPublished ?? true,
    publishedAt: overrides.publishedAt ?? null,
  };
}

export function createDefaultDevice(overrides = {}) {
  return {
    deviceId: "",
    pairingCode: "",
    pairingCodeExpiresAt: null,
    tenantId: null,
    status: "unpaired",
    lastSeenAt: null,
    createdAt: null,
    ...overrides,
  };
}

export function createDefaultTenantUser(overrides = {}) {
  return {
    uid: "",
    tenantId: "",
    email: "",
    displayName: "",
    role: "tenantAdmin",
    ativo: true,
    isFirstAccess: true,
    invitedAt: null,
    firstAccessCompletedAt: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

export function createDefaultPlatformMediaPlaylist(overrides = {}) {
  return {
    slides: [],
    updatedAt: null,
    ...overrides,
  };
}

export function createDefaultAuditLog(overrides = {}) {
  return {
    actorUid: "",
    actorEmail: "",
    action: "",
    entityType: "",
    entityId: "",
    tenantId: null,
    before: null,
    after: null,
    createdAt: null,
    ...overrides,
  };
}
