import sanitizeHtml from 'sanitize-html';

export function importText(html = '') {
  const text = sanitizeHtml(String(html).replace(/<\/(?:p|div|h[1-6]|li|blockquote)>/gi, ' '), {
    allowedTags: [], allowedAttributes: {},
  });
  return text.replace(/&#(x[\da-f]+|\d+);/gi, (match, value) => {
    const code = value[0].toLowerCase() === 'x' ? parseInt(value.slice(1), 16) : Number(value);
    return code <= 0x10ffff ? String.fromCodePoint(code) : match;
  }).replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, name) => ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[name])
    .replace(/\[(?:\/?(?:caption|gallery|vc_[\w-]*|embed))\b[^\]]*\]/gi, '')
    .replace(/\s+/g, ' ').trim();
}
export function importExcerpt(html) {
  const text = importText(html);
  if (text.length <= 280) return text;
  const end = text.lastIndexOf(' ', 277);
  return text.slice(0, end > 160 ? end : 277).trimEnd() + '…';
}
