'use client';
import Editor, { type OnMount } from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';
import { monaco } from './monaco-setup';

export type Keybindings = 'default' | 'vim' | 'emacs';

export interface EditorSettings {
  fontSize: number;
  keybindings: Keybindings;
}

const MONACO_LANGUAGE: Record<string, string> = {
  python: 'python',
  javascript: 'javascript',
  typescript: 'typescript',
  sql: 'sql',
};

export type StandaloneEditor = Parameters<OnMount>[0];

/**
 * A small Emacs keymap (movement, kill-line, delete, search). The only maintained-looking Emacs
 * package for Monaco was last released in 2022 and doesn't support the ESM build.
 */
function enableEmacs(editor: StandaloneEditor): () => void {
  const { KeyMod, KeyCode } = monaco;
  const run = (id: string) => () => editor.trigger('emacs', id, null);
  const bindings: [number, () => void][] = [
    [KeyMod.WinCtrl | KeyCode.KeyA, run('cursorLineStart')],
    [KeyMod.WinCtrl | KeyCode.KeyE, run('cursorLineEnd')],
    [KeyMod.WinCtrl | KeyCode.KeyF, run('cursorRight')],
    [KeyMod.WinCtrl | KeyCode.KeyB, run('cursorLeft')],
    [KeyMod.WinCtrl | KeyCode.KeyN, run('cursorDown')],
    [KeyMod.WinCtrl | KeyCode.KeyP, run('cursorUp')],
    [KeyMod.WinCtrl | KeyCode.KeyD, run('deleteRight')],
    [KeyMod.WinCtrl | KeyCode.KeyK, run('deleteAllRight')],
    [KeyMod.WinCtrl | KeyCode.KeyS, run('actions.find')],
    [KeyMod.Alt | KeyCode.KeyF, run('cursorWordEndRight')],
    [KeyMod.Alt | KeyCode.KeyB, run('cursorWordStartLeft')],
  ];
  const disposables = bindings.map(([key, handler]) =>
    editor.addAction({
      id: `emacs-${key}`,
      label: `Emacs ${key}`,
      keybindings: [key],
      run: handler,
    }),
  );
  return () => disposables.forEach((d) => d.dispose());
}

export function CodeEditor({
  value,
  onChange,
  language,
  theme,
  settings,
  onRun,
  onSubmit,
  label,
  onEditorMount,
}: {
  value: string;
  onChange: (value: string) => void;
  language: string;
  theme: 'dark' | 'light';
  settings: EditorSettings;
  onRun?: () => void;
  onSubmit?: () => void;
  label: string;
  /** Gives callers the Monaco instance (e.g. the verified-attempt event recorder). */
  onEditorMount?: (editor: StandaloneEditor) => void;
}) {
  const [editor, setEditor] = useState<StandaloneEditor | null>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);
  const handlers = useRef({ onRun, onSubmit });
  handlers.current = { onRun, onSubmit };

  const onMount: OnMount = (mounted) => {
    const { KeyMod, KeyCode } = monaco;
    mounted.addCommand(KeyMod.CtrlCmd | KeyCode.Enter, () => handlers.current.onRun?.());
    mounted.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter, () =>
      handlers.current.onSubmit?.(),
    );
    setEditor(mounted);
    onEditorMount?.(mounted);
  };

  useEffect(() => {
    if (!editor) return;
    if (settings.keybindings === 'emacs') return enableEmacs(editor);
    if (settings.keybindings === 'vim' && statusRef.current) {
      let disposed = false;
      let vim: { dispose(): void } | null = null;
      void import('monaco-vim').then(({ initVimMode }) => {
        if (!disposed && statusRef.current) vim = initVimMode(editor, statusRef.current);
      });
      return () => {
        disposed = true;
        vim?.dispose();
      };
    }
    return undefined;
  }, [settings.keybindings, editor]);

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1" data-testid="code-editor">
        <Editor
          value={value}
          onChange={(v) => onChange(v ?? '')}
          language={MONACO_LANGUAGE[language] ?? 'plaintext'}
          theme={theme === 'dark' ? 'forge-dark' : 'forge-light'}
          onMount={onMount}
          loading={<div className="p-4 text-sm text-muted-foreground">Loading editor…</div>}
          options={{
            fontSize: settings.fontSize,
            fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: language === 'python' ? 4 : 2,
            ariaLabel: label,
            accessibilitySupport: 'auto',
            padding: { top: 12 },
          }}
        />
      </div>
      <div
        ref={statusRef}
        className={
          settings.keybindings === 'vim'
            ? 'border-t px-3 py-1 font-mono text-xs text-muted-foreground'
            : 'hidden'
        }
        aria-live="polite"
      />
    </div>
  );
}
