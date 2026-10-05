// Escapa valores dinâmicos antes de os injetar no HTML (evita quebra de layout e XSS)
export function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Aceita "14,9", "14.90" ou "R$ 14,90" e devolve "R$ 14,90"
export function formatPrice(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const cleaned = raw.replace(/^R\$\s*/i, '');
  const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned;
  const number = Number(normalized);
  if (!Number.isFinite(number)) return raw;
  return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value ?? '').trim());
}

// CSS url() seguro para uso em style inline
export function cssUrl(value) {
  return isHttpUrl(value) ? `url("${encodeURI(String(value).trim()).replace(/"/g, '%22')}")` : 'none';
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
