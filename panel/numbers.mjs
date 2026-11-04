// « Mono Numbers Rule » of DESIGN.md: every number (#33, 2 tâches, 3 min, 14:32) is set in Geist Mono.
const NUMBER = /#?\d+(?:[:.,]\d+)*(?:\s?(?:min|h|s|j)(?![\p{L}\d]))?/gu;

// Splits a text into plain and number parts.
export function splitNumbers(text) {
  const parts = [];
  let last = 0;
  for (const m of String(text).matchAll(NUMBER)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ text: m[0], num: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

// Message bodies, fields and code keep their own font: only the surrounding figures are mono.
const SKIP = 'script, style, textarea, input, select, option, code, pre, .num, .bubble, .intro-title, .muted.chat-empty';

// Wraps the numbers found in the text nodes under `root` in <span class="num">.
export function monoNumbers(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (/\d/.test(n.nodeValue) && !n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const parts = splitNumbers(node.nodeValue);
    if (!parts.some((p) => p.num)) continue;
    node.replaceWith(...parts.map((p) => {
      if (!p.num) return document.createTextNode(p.text);
      const s = document.createElement('span');
      s.className = 'num';
      s.textContent = p.text;
      return s;
    }));
  }
}

// Keeps every figure of the page mono, whichever part redraws it.
export function watchNumbers(root) {
  let queued = false;
  const run = () => { queued = false; monoNumbers(root); };
  new MutationObserver(() => { if (!queued) { queued = true; queueMicrotask(run); } }).observe(root, { childList: true, subtree: true, characterData: true });
  monoNumbers(root);
}
