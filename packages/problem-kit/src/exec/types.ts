import type { ExecRequest, ExecResult } from '@forge/shared';

/** Anything that can run an ExecRequest: the development executor or the sandboxed runner. */
export interface Executor {
  readonly name: string;
  run(request: ExecRequest): Promise<ExecResult>;
}
