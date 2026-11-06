// The project's stack sheet (STACK.md, written by the agent): pure helpers, tested in test/panel-stack.test.mjs.
// The sheet's `##` headings are its sections, in the order below; `###` are sub-headings (« Bibliothèques »).
export const STACK_SECTIONS = ['Interface', 'Moteur / serveur', 'Autres services', 'Données', 'Bibliothèques', 'Services nécessaires'];
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
