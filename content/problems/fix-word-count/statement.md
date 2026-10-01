The feedback dashboard at **{{company}}** shows which words customers use most.
`word_counts(text)` counts the words in one comment.

- Words are separated by whitespace.
- Punctuation `. , ! ? ; : "` at the start or end of a word is not part of it.
- Counting **ignores case**: `Great` and `great` are the same word, reported in lower case.
- Pieces that are only punctuation are not words.

Return a dictionary (an object in JavaScript) from each word to how often it appears.

The dashboard lists "The" and "the" as two different words. The function has **one bug**.

## Example

```
text   = {{example_text}}
result = {{example_result}}
```
