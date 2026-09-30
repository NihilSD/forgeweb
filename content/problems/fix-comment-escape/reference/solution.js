function escape(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function renderComment(author, text) {
  return `<p class="comment" title="Comment by ${escape(author)}"><b>${escape(author)}</b>: ${escape(text)}</p>`;
}
