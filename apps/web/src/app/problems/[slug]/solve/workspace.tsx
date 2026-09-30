'use client';
import { LANGUAGE_LABELS, type Language, type ProblemDetail, type Submission } from '@forge/shared';
import {
  Alert,
  Button,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@forge/ui';
import { Play, Send, Settings2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels';
import type { EditorSettings, Keybindings } from '@/components/editor/code-editor';
import { DifficultyBadge } from '@/components/difficulty-badge';
import { Markdown } from '@/components/markdown';
import { api, ApiClientError } from '@/lib/api-client';
import { pollSubmission } from '@/lib/submissions';
import { ResultsPanel } from './results-panel';
import {
  BookmarkToggle,
  EditorialPanel,
  HintsPanel,
  NotesPanel,
  useProgress,
} from './practice-panels';
import { FlagPanel, HistoryPanel, parseSchema, SchemaBrowser } from './side-panels';

const CodeEditor = dynamic(
  () => import('@/components/editor/code-editor').then((m) => m.CodeEditor),
  {
    ssr: false,
    loading: () => <div className="p-4 text-sm text-muted-foreground">Loading editor…</div>,
  },
);

const SETTINGS_KEY = 'forge:editor-settings';
const LANG_KEY = 'forge:last-language';
const DEFAULT_SETTINGS: EditorSettings = { fontSize: 14, keybindings: 'default' };

/** Renders one layout only: the resizable IDE on wide screens, a reading view on phones. */
function useWide(): boolean {
  const query = '(min-width: 768px)';
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch {
    return fallback;
  }
}

const selectClass =
  'h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring';

export function Workspace({
  problem,
  drafts,
  theme,
}: {
  problem: ProblemDetail;
  drafts: Partial<Record<Language, string>>;
  theme: 'dark' | 'light';
}) {
  const isFlag = problem.format === 'flag';
  const languages = problem.languages as Language[];
  const [language, setLanguage] = useState<Language>(() => {
    const last =
      typeof window !== 'undefined' ? (localStorage.getItem(LANG_KEY) as Language | null) : null;
    return last && languages.includes(last) ? last : languages[0]!;
  });
  const [code, setCode] = useState<Partial<Record<Language, string>>>(() =>
    Object.fromEntries(languages.map((l) => [l, drafts[l] ?? problem.starters[l] ?? ''])),
  );
  const [settings, setSettings] = useState<EditorSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const [pending, setPending] = useState<'run' | 'submit' | null>(null);
  const [result, setResult] = useState<Submission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState('');
  const [bottomTab, setBottomTab] = useState('results');
  const [historyKey, setHistoryKey] = useState(0);
  const [solved, setSolved] = useState(problem.solved);
  const wide = useWide();
  const { progress, reload: reloadProgress } = useProgress(problem.slug);
  const abort = useRef<AbortController | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const horizontal = useDefaultLayout({ id: 'forge-workspace-h', storage: localStorage });
  const vertical = useDefaultLayout({ id: 'forge-workspace-v', storage: localStorage });
  const schema = useMemo(
    () => parseSchema(problem.visibleTests[0]?.setupSql),
    [problem.visibleTests],
  );

  useEffect(() => {
    setSettings(readLocal(SETTINGS_KEY, DEFAULT_SETTINGS));
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      localStorage.setItem(LANG_KEY, language);
    } catch {
      // Storage can be unavailable (private mode); settings then last for this visit only.
    }
  }, [settings, language]);

  const current = code[language] ?? '';

  const saveDraft = useCallback(
    async (lang: Language, value: string) => {
      setSaveState('saving');
      try {
        await api(`/problems/${problem.slug}/drafts/${lang}`, {
          method: 'PUT',
          body: { code: value },
        });
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    },
    [problem.slug],
  );

  function onCodeChange(value: string) {
    setCode((c) => ({ ...c, [language]: value }));
    setSaveState('unsaved');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveDraft(language, value), 800);
  }

  const execute = useCallback(
    async (kind: 'run' | 'submit') => {
      if (pending) return;
      setError(null);
      let customArgs: unknown[] | undefined;
      if (kind === 'run' && bottomTab === 'custom' && customInput.trim()) {
        try {
          const parsed = JSON.parse(customInput) as unknown;
          if (!Array.isArray(parsed)) throw new Error('not an array');
          customArgs = parsed;
        } catch {
          setError('Custom input must be a JSON array of arguments, for example [[1, 2, 3], 5].');
          return;
        }
      }
      abort.current?.abort();
      abort.current = new AbortController();
      setPending(kind);
      setBottomTab((t) => (t === 'custom' && customArgs ? t : 'results'));
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        void saveDraft(language, current);
      }
      try {
        const started = await api<Submission>(`/problems/${problem.slug}/${kind}`, {
          method: 'POST',
          body: { language, code: current, ...(customArgs ? { customArgs } : {}) },
        });
        const done = await pollSubmission(started.id, abort.current.signal);
        setResult(done);
        if (kind === 'submit' && done.verdict === 'accepted') {
          setSolved(true);
          void reloadProgress();
        }
        setHistoryKey((k) => k + 1);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError(
            err instanceof ApiClientError ? err.message : 'Something went wrong. Please try again.',
          );
        }
      } finally {
        setPending(null);
      }
    },
    [pending, bottomTab, customInput, language, current, problem.slug, saveDraft, reloadProgress],
  );

  // Global shortcuts (the editor registers the same keys while focused).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'Enter' || isFlag) return;
      e.preventDefault();
      void execute(e.shiftKey ? 'submit' : 'run');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [execute, isFlag]);

  useEffect(() => () => abort.current?.abort(), []);

  const statement = (
    <Tabs defaultValue="statement" className="flex h-full flex-col">
      <TabsList className="mx-3 mt-3 w-fit">
        <TabsTrigger value="statement">Statement</TabsTrigger>
        <TabsTrigger value="hints">Hints</TabsTrigger>
        <TabsTrigger value="editorial">Editorial</TabsTrigger>
        <TabsTrigger value="notes">Notes</TabsTrigger>
        {!isFlag ? <TabsTrigger value="history">Submissions</TabsTrigger> : null}
      </TabsList>
      <TabsContent value="statement" className="min-h-0 flex-1 overflow-y-auto px-5 pb-8">
        <div className="flex items-center gap-2 pt-2 text-sm text-muted-foreground">
          <span className="capitalize">{problem.track}</span>
          <DifficultyBadge difficulty={problem.difficulty} />
          {solved ? <span className="text-success">Solved</span> : null}
          <span className="ml-auto">
            <BookmarkToggle
              slug={problem.slug}
              progress={progress}
              onChange={() => void reloadProgress()}
            />
          </span>
        </div>
        <h1 className="mt-2 text-xl font-semibold">{problem.title}</h1>
        <div className="mt-4">
          <Markdown>{problem.statement}</Markdown>
        </div>
        {language === 'sql' && schema.length ? (
          <div className="mt-6">
            <SchemaBrowser tables={schema} />
          </div>
        ) : null}
      </TabsContent>
      <TabsContent value="hints" className="min-h-0 flex-1 overflow-y-auto">
        <HintsPanel slug={problem.slug} onRevealed={() => void reloadProgress()} />
      </TabsContent>
      <TabsContent value="editorial" className="min-h-0 flex-1 overflow-y-auto">
        <EditorialPanel
          slug={problem.slug}
          progress={progress}
          onGaveUp={() => void reloadProgress()}
        />
      </TabsContent>
      <TabsContent value="notes" className="min-h-0 flex-1 overflow-y-auto">
        <NotesPanel slug={problem.slug} initial={progress?.note ?? ''} />
      </TabsContent>
      {!isFlag ? (
        <TabsContent value="history" className="min-h-0 flex-1 overflow-y-auto">
          <HistoryPanel
            slug={problem.slug}
            refreshKey={historyKey}
            onLoad={(item) => {
              const lang = item.language as Language;
              setLanguage(lang);
              setCode((c) => ({ ...c, [lang]: item.code }));
              void saveDraft(lang, item.code);
            }}
          />
        </TabsContent>
      ) : null}
    </Tabs>
  );

  const editorPane = (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <Label htmlFor="language" className="sr-only">
          Language
        </Label>
        <select
          id="language"
          className={selectClass}
          value={language}
          onChange={(e) => setLanguage(e.target.value as Language)}
        >
          {languages.map((l) => (
            <option key={l} value={l}>
              {LANGUAGE_LABELS[l]}
            </option>
          ))}
        </select>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Editor settings"
          aria-expanded={showSettings}
          onClick={() => setShowSettings((v) => !v)}
        >
          <Settings2 className="h-4 w-4" aria-hidden />
        </Button>
        <span className="text-xs text-muted-foreground" aria-live="polite" data-testid="save-state">
          {saveState === 'saving'
            ? 'Saving…'
            : saveState === 'saved'
              ? 'Draft saved'
              : saveState === 'error'
                ? 'Not saved'
                : ''}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void execute('run')}
            disabled={pending !== null}
            title="Ctrl/⌘ + Enter"
          >
            <Play className="h-4 w-4" aria-hidden /> Run
          </Button>
          <Button
            size="sm"
            onClick={() => void execute('submit')}
            disabled={pending !== null}
            title="Ctrl/⌘ + Shift + Enter"
          >
            <Send className="h-4 w-4" aria-hidden /> Submit
          </Button>
        </div>
      </div>
      {showSettings ? (
        <div
          className="flex flex-wrap items-center gap-4 border-b bg-muted/40 px-3 py-2 text-sm"
          role="group"
          aria-label="Editor settings"
        >
          <label className="flex items-center gap-2">
            Font size
            <select
              className={selectClass}
              value={settings.fontSize}
              onChange={(e) => setSettings((s) => ({ ...s, fontSize: Number(e.target.value) }))}
            >
              {[12, 13, 14, 16, 18, 20].map((n) => (
                <option key={n} value={n}>
                  {n}px
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Keybindings
            <select
              className={selectClass}
              value={settings.keybindings}
              onChange={(e) =>
                setSettings((s) => ({ ...s, keybindings: e.target.value as Keybindings }))
              }
            >
              <option value="default">Default</option>
              <option value="vim">Vim</option>
              <option value="emacs">Emacs</option>
            </select>
          </label>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const starter = problem.starters[language] ?? '';
              setCode((c) => ({ ...c, [language]: starter }));
              void saveDraft(language, starter);
            }}
          >
            Reset to starter code
          </Button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <CodeEditor
          value={current}
          onChange={onCodeChange}
          language={language}
          theme={theme}
          settings={settings}
          onRun={() => void execute('run')}
          onSubmit={() => void execute('submit')}
          label={`${LANGUAGE_LABELS[language]} code editor`}
        />
      </div>
    </div>
  );

  const bottomPane = (
    <Tabs value={bottomTab} onValueChange={setBottomTab} className="flex h-full flex-col">
      <TabsList className="mx-3 mt-2 w-fit">
        <TabsTrigger value="results">Results</TabsTrigger>
        {language !== 'sql' ? <TabsTrigger value="custom">Custom input</TabsTrigger> : null}
      </TabsList>
      {error ? (
        <Alert variant="destructive" className="mx-3 mt-2">
          {error}
        </Alert>
      ) : null}
      <TabsContent value="results" className="min-h-0 flex-1 overflow-y-auto">
        <ResultsPanel result={result} pending={pending} isSql={language === 'sql'} />
      </TabsContent>
      <TabsContent value="custom" className="min-h-0 flex-1 overflow-y-auto p-3">
        <Label htmlFor="custom-input">Arguments as a JSON array</Label>
        <Textarea
          id="custom-input"
          className="mt-1 font-mono"
          placeholder={JSON.stringify(problem.visibleTests[0]?.args ?? [])}
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Press Run to call your function with these arguments.
        </p>
        {result?.customOutput ? (
          <ResultsPanel result={result} pending={null} isSql={false} />
        ) : null}
      </TabsContent>
    </Tabs>
  );

  if (isFlag) {
    return (
      <div className="grid md:h-[calc(100vh-3.5rem)] md:grid-cols-2">
        <div className="overflow-y-auto border-r">{statement}</div>
        <div className="overflow-y-auto">
          <FlagPanel slug={problem.slug} onSolved={() => setSolved(true)} />
        </div>
      </div>
    );
  }

  if (!wide) {
    return (
      <>
        <Alert className="m-3">
          The workspace works best on a larger screen. You can read the problem here and solve it on
          a laptop or desktop.{' '}
          <Link href={`/problems/${problem.slug}`} className="underline">
            Back to the problem
          </Link>
        </Alert>
        {statement}
      </>
    );
  }

  return (
    <>
      <div className="h-[calc(100vh-3.5rem)]">
        <Group orientation="horizontal" id="forge-workspace-h" {...horizontal}>
          <Panel id="statement" defaultSize="40" minSize="20">
            {statement}
          </Panel>
          <Separator className="w-1 bg-border transition-colors hover:bg-primary/50 focus-visible:bg-primary" />
          <Panel id="work" defaultSize="60" minSize="30">
            <Group orientation="vertical" id="forge-workspace-v" {...vertical}>
              <Panel id="editor" defaultSize="60" minSize="20">
                {editorPane}
              </Panel>
              <Separator className="h-1 bg-border transition-colors hover:bg-primary/50 focus-visible:bg-primary" />
              <Panel id="console" defaultSize="40" minSize="15">
                {bottomPane}
              </Panel>
            </Group>
          </Panel>
        </Group>
      </div>
    </>
  );
}
