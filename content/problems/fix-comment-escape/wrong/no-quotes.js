// Escapes the element content but not quotes, so the title attribute can still be broken out of.
function escape(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderComment(author, text) {
  return `<p class="comment" title="Comment by ${escape(author)}"><b>${escape(author)}</b>: ${escape(text)}</p>`;
}
