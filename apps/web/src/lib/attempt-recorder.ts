'use client';
import {
  applyChanges,
  type AttemptEvent,
  EVENT_BATCH_MS,
  MAX_EVENTS_PER_BATCH,
  normalizeEol,
} from '@forge/shared';
import type { StandaloneEditor } from '@/components/editor/code-editor';
import { monaco } from '@/components/editor/monaco-setup';
import { api } from './api-client';
import { toLfChanges } from './edit-offsets';

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Spec 7.2: records a verified attempt and sends the events in batches every 5 seconds. Only what
 * the consent screen lists is recorded: editor changes, pastes (length, origin, hash of the first
 * 200 characters), focus, tab visibility and full-screen exits. Nothing outside the workspace.
 */
export class AttemptRecorder {
  private queue: AttemptEvent[] = [];
  private seq = 0;
  private sending: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly copied: string[] = [];
  private readonly cleanups: (() => void)[] = [];

  /** `startedAt` is the attempt start in the browser's clock (corrected for server skew). */
  constructor(
    private readonly attemptId: string,
    private readonly startedAt: number,
  ) {}

  private now() {
    return Math.max(0, Math.round(Date.now() - this.startedAt));
  }

  push(event: AttemptEvent) {
    this.queue.push(event);
  }

  attach(editor: StandaloneEditor) {
    const model = editor.getModel();
    if (!model) return;
    model.setEOL(monaco.editor.EndOfLineSequence.LF);
    // An LF copy of the document, so recorded offsets match the server's replay exactly.
    let doc = normalizeEol(model.getValue());
    const content = editor.onDidChangeModelContent((e) => {
      if (e.changes.length === 0) return;
      const changes = toLfChanges(doc, e.changes);
      doc = applyChanges(doc, changes) ?? normalizeEol(model.getValue());
      this.push({ type: 'edit', t: this.now(), changes });
    });
    this.cleanups.push(() => content.dispose());

    const node = editor.getDomNode();
    if (node) {
      const remember = () => {
        const selection = editor.getSelection();
        const text = selection ? (editor.getModel()?.getValueInRange(selection) ?? '') : '';
        if (text) {
          this.copied.push(text);
          if (this.copied.length > 20) this.copied.shift();
        }
      };
      const onPaste = (e: ClipboardEvent) => {
        const text = e.clipboardData?.getData('text/plain') ?? '';
        const t = this.now();
        const internal = this.copied.includes(text);
        void sha256Hex(text.slice(0, 200)).then((hash) =>
          this.push({ type: 'paste', t, length: text.length, internal, hash }),
        );
      };
      node.addEventListener('copy', remember, true);
      node.addEventListener('cut', remember, true);
      node.addEventListener('paste', onPaste, true);
      this.cleanups.push(() => {
        node.removeEventListener('copy', remember, true);
        node.removeEventListener('cut', remember, true);
        node.removeEventListener('paste', onPaste, true);
      });
    }
  }

  start() {
    const onBlur = () => this.push({ type: 'blur', t: this.now() });
    const onFocus = () => this.push({ type: 'focus', t: this.now() });
    const onVisibility = () =>
      this.push({
        type: 'visibility',
        t: this.now(),
        state: document.visibilityState === 'hidden' ? 'hidden' : 'visible',
      });
    const onFullscreen = () =>
      this.push({
        type: document.fullscreenElement ? 'fullscreen_enter' : 'fullscreen_exit',
        t: this.now(),
      });
    const onPageHide = () => void this.flush();
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('fullscreenchange', onFullscreen);
    window.addEventListener('pagehide', onPageHide);
    this.cleanups.push(() => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('fullscreenchange', onFullscreen);
      window.removeEventListener('pagehide', onPageHide);
    });
    this.timer = setInterval(() => void this.flush(), EVENT_BATCH_MS);
  }

  /** Sends everything recorded so far. Failed batches stay queued and are retried with the same seq. */
  flush(): Promise<void> {
    if (this.sending) return this.sending.then(() => this.flush());
    if (this.queue.length === 0) return Promise.resolve();
    this.sending = (async () => {
      while (this.queue.length) {
        const events = this.queue.slice(0, MAX_EVENTS_PER_BATCH);
        try {
          await api(`/attempts/${this.attemptId}/events`, {
            method: 'POST',
            body: { seq: this.seq, events },
          });
        } catch {
          return; // network trouble: keep the events, try again on the next tick
        }
        this.queue.splice(0, events.length);
        this.seq++;
      }
    })().finally(() => {
      this.sending = null;
    });
    return this.sending;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.cleanups.splice(0).forEach((c) => c());
  }
}
