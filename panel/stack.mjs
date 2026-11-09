// The project's stack sheet (STACK.md, written by the agent): pure helpers, tested in test/panel-stack.test.mjs.
// The sheet's `##` headings are its sections, in the order below; `###` are sub-headings (« Bibliothèques »).
export const STACK_SECTIONS = ['Interface', 'Moteur / serveur', 'Autres services', 'Données', 'Bibliothèques', 'Services nécessaires', 'Mise en production'];
// The section that says whether a merge puts the project in production by itself (read by the relay and the panel).
export const DELIVERY_SECTION = 'Mise en production';
export const STACK_FILE = 'STACK.md';

// { intro: [paragraphs before the first section], sections: [{ title, blocks: [{ type: 'p'|'h'|'ul', … }] }] }.
// The `#` title is dropped: the dialog has its own.
export function parseStack(md) {
  const intro = [];
  const sections = [];
  let blocks = null;
  let para = [];
  const flush = () => {
    if (!para.length) return;
    const text = para.join(' ');
    if (blocks) blocks.push({ type: 'p', text }); else intro.push(text);
    para = [];
  };
  for (const raw of String(md || '').replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (/^#\s/.test(line) || !line || /^(-{3,}|\*{3,})$/.test(line)) { flush(); continue; }
    const h2 = /^##\s+(.*)$/.exec(line);
    if (h2) { flush(); blocks = []; sections.push({ title: h2[1].trim(), blocks }); continue; }
    const h3 = /^#{3,6}\s+(.*)$/.exec(line);
    if (h3) { flush(); (blocks || (blocks = [])).push({ type: 'h', text: h3[1].trim() }); continue; }
    const item = /^[-*+]\s+(.*)$/.exec(line);
    if (item && blocks) {
      flush();
      const prev = blocks.at(-1);
      if (prev?.type === 'ul') prev.items.push(item[1]); else blocks.push({ type: 'ul', items: [item[1]] });
      continue;
    }
    para.push(line);
  }
  flush();
  return { intro, sections };
}

// How the project goes to production, as its sheet says in « ## Mise en production »: its first item starts with
// « **Automatique** » (the host publishes every merge by itself) or « **Manuelle** » (a merge publishes nothing: the
// owner does it, as the rest of the line says). { mode: 'auto'|'manual', how } — null when the sheet says neither
// (an older sheet without the section, or a line the agent wrote otherwise): the factory then keeps its former ways.
export function deliveryOf(md) {
  const section = parseStack(md).sections.find((s) => s.title.toLowerCase() === DELIVERY_SECTION.toLowerCase());
  const first = section?.blocks.find((b) => b.type === 'ul')?.items[0] || '';
  const m = /^\*\*\s*(automatique|manuelle)\b[^*]*\*\*\s*(?:[:—–-]\s*)?(.*)$/i.exec(first.trim());
  if (!m) return null;
  return { mode: m[1].toLowerCase() === 'manuelle' ? 'manual' : 'auto', how: m[2].trim() };
}

// « **Node.js 22** — moteur » → bold and plain parts, for display without innerHTML.
export function inlineParts(text) {
  return String(text || '').split(/\*\*(.+?)\*\*/).map((t, i) => ({ bold: i % 2 === 1, text: t })).filter((p) => p.text);
}

// « Mise à jour le 6 novembre 2026 », from the date of the last commit that changed the sheet.
export function stackDate(iso) {
  const t = Date.parse(iso || '');
  if (Number.isNaN(t)) return '';
  return `Mise à jour le ${new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })}`;
}

// French typography: a non-breaking space before « : ; ! ? » and inside « », so no punctuation starts a line.
export function frenchSpaces(text) {
  return String(text || '').replace(/ ([:;!?»])/g, '\u00a0$1').replace(/« /g, '«\u00a0');
}
