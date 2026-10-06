export const defaultTenant = {
  configuracoes: {
    nome: "",
    logo: "",
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
  },
  produtos: [],
  promocoes: [],
  eventos: [],
  avaliacoes: [],
  anuncios_terceiros: [],
};

export function createDefaultTenant() {
  return {
    ...defaultTenant,
    configuracoes: {
      ...defaultTenant.configuracoes,
      nota_google: { ...defaultTenant.configuracoes.nota_google },
      avisos_rodape: [],
    },
    produtos: [],
    promocoes: [],
    eventos: [],
    avaliacoes: [],
    anuncios_terceiros: [],
  };
}
