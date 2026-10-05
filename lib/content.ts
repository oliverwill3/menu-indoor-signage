// Estrutura do conteúdo da TV e validação dos dados recebidos do painel

export interface Destaque {
  id: string;
  nome: string;
  descricao: string;
  preco: string;
  imagemUrl: string;
}

export interface Promocao {
  id: string;
  nome: string;
  preco: string;
}

export interface TenantContent {
  nomeEmpresa: string;
  logoUrl: string;
  slogan1: string;
  slogan2: string;
  destaques: Destaque[];
  slideInterval: number;
  promocoes: Promocao[];
  textoRodape: string;
}

export const TENANT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function defaultContent(): TenantContent {
  return {
    nomeEmpresa: "Gutemberg Lounge",
    logoUrl: "",
    slogan1: "Do Café da Manhã ao Happy Hour",
    slogan2: "Galeria Primavera",
    destaques: [
      {
        id: "d1",
        nome: "Café Especial Gutemberg",
        descricao: "Grãos selecionados, torra média, servido com pão de queijo.",
        preco: "12,90",
        imagemUrl: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=1600",
      },
      {
        id: "d2",
        nome: "Porção de Coxinhas",
        descricao: "12 unidades crocantes com molho da casa.",
        preco: "49,90",
        imagemUrl: "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=1600",
      },
    ],
    slideInterval: 8,
    promocoes: [
      { id: "p1", nome: "Chopp Brahma", preco: "14,90" },
      { id: "p2", nome: "Coxinhas Gutenberg", preco: "49,90" },
    ],
    textoRodape: "Do Café da Manhã ao Happy Hour | Galeria Primavera | Aceitamos Pix",
  };
}

function str(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function url(value: unknown) {
  const v = str(value, 2000);
  return v === "" || /^https?:\/\//i.test(v) ? v : "";
}

function id(value: unknown) {
  const v = str(value, 40);
  return v || Math.random().toString(36).slice(2, 10);
}

// Mantém apenas campos conhecidos, com limites de tamanho e quantidade
export function normalizeContent(input: any): TenantContent {
  const src = input && typeof input === "object" ? input : {};
  const interval = Number(src.slideInterval);
  return {
    nomeEmpresa: str(src.nomeEmpresa, 80),
    logoUrl: url(src.logoUrl),
    slogan1: str(src.slogan1, 120),
    slogan2: str(src.slogan2, 120),
    destaques: (Array.isArray(src.destaques) ? src.destaques : []).slice(0, 30).map((d: any) => ({
      id: id(d?.id),
      nome: str(d?.nome, 80),
      descricao: str(d?.descricao, 240),
      preco: str(d?.preco, 20),
      imagemUrl: url(d?.imagemUrl),
    })),
    slideInterval: Number.isFinite(interval) ? Math.min(60, Math.max(3, Math.round(interval))) : 8,
    promocoes: (Array.isArray(src.promocoes) ? src.promocoes : []).slice(0, 30).map((p: any) => ({
      id: id(p?.id),
      nome: str(p?.nome, 80),
      preco: str(p?.preco, 20),
    })),
    textoRodape: str(src.textoRodape, 500),
  };
}
