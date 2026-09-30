import type { GenContext, Instance } from '@forge/problem-kit';

export function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export function render(author: string, text: string): string {
  return `<p class="comment" title="Comment by ${escape(author)}"><b>${escape(author)}</b>: ${escape(text)}</p>`;
}

export default function generate({ rng }: GenContext): Instance {
  const author = `${rng.word('person')}`;
  const text = `I like ${rng.word('product')}s & <b>bold</b> ideas`;
  return {
    params: {
      site: rng.pick(['Makers Hub', 'Garden Circle', 'Retro Games Club']),
      example_author: JSON.stringify(author),
      example_text: JSON.stringify(text),
      example_result: JSON.stringify(render(author, text)),
    },
    data: { author, text },
  };
}
