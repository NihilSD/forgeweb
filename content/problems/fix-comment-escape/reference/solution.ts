function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function renderComment(author: string, text: string): string {
  return `<p class="comment" title="Comment by ${escape(author)}"><b>${escape(author)}</b>: ${escape(text)}</p>`;
}
