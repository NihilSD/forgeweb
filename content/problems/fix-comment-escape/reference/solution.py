def escape(value):
    return (
        value.replace('&', '&amp;')
        .replace('<', '&lt;')
        .replace('>', '&gt;')
        .replace('"', '&quot;')
        .replace("'", '&#x27;')
    )


def render_comment(author, text):
    return (
        f'<p class="comment" title="Comment by {escape(author)}">'
        f'<b>{escape(author)}</b>: {escape(text)}</p>'
    )
