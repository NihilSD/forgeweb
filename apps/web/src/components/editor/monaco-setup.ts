'use client';
/**
 * Loads the ESM build of Monaco with only the languages Forge uses, wires its web workers to
 * bundled files on our origin, and hands the instance to @monaco-editor/react (which otherwise
 * fetches Monaco from a CDN — blocked by our CSP and against the self-hosting rule).
 */
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/languages/definitions/python/register';
import 'monaco-editor/languages/definitions/sql/register';
import 'monaco-editor/languages/definitions/javascript/register';
import 'monaco-editor/languages/definitions/typescript/register';
import 'monaco-editor/language/typescript/monaco.contribution';

declare global {
  interface Window {
    MonacoEnvironment?: { getWorker(workerId: string, label: string): Worker };
    /** Exposed for end-to-end tests that need to set editor content deterministically. */
    monaco?: typeof monaco;
  }
}

self.MonacoEnvironment = {
  getWorker(_id, label) {
    if (label === 'typescript' || label === 'javascript') {
      return new Worker(new URL('./ts.worker.ts', import.meta.url), { type: 'module' });
    }
    return new Worker(new URL('./editor.worker.ts', import.meta.url), { type: 'module' });
  },
};

monaco.editor.defineTheme('forge-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: { 'editor.background': '#0b0f17', 'editorGutter.background': '#0b0f17' },
});
monaco.editor.defineTheme('forge-light', { base: 'vs', inherit: true, rules: [], colors: {} });

loader.config({ monaco });
window.monaco = monaco;

export { monaco };
