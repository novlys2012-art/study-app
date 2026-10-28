// The small part of Markdown the summaries use (## headings, - bullets, **bold**), built as DOM nodes
// with textContent, so AI text can never inject markup.
function inline(parent, text) {
  text.split(/(\*\*[^*]+\*\*)/g).forEach((part) => {
    if (!part) return;
    if (/^\*\*[^*]+\*\*$/.test(part)) { const b = document.createElement("strong"); b.textContent = part.slice(2, -2); parent.appendChild(b); }
    else parent.appendChild(document.createTextNode(part));
  });
  return parent;
}

export function renderMarkdown(src) {
  const box = document.createElement("div");
  box.className = "md";
  let ul = null;
  for (const raw of String(src).split("\n")) {
    const line = raw.trim();
    if (!line) { ul = null; continue; }
    const h = line.match(/^#{1,6}\s+(.*)$/);
    const li = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (h) { ul = null; box.appendChild(inline(document.createElement("h3"), h[1])); }
    else if (li) {
      if (!ul) { ul = document.createElement("ul"); box.appendChild(ul); }
      ul.appendChild(inline(document.createElement("li"), li[1]));
    } else { ul = null; box.appendChild(inline(document.createElement("p"), line)); }
  }
  return box;
}
