import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CONCEPT_TAGS } from '@forge/shared';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

/** Visualizer components that exist in apps/web (keep in sync with components/visualizers). */
export const VISUALIZERS = ['two-pointers', 'sliding-window', 'grid-fill', 'graph-search'] as const;

export const courseManifestSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(3),
  description: z.string().min(10),
  topic: z.string().min(2),
  order: z.number().int().min(0),
  kind: z.enum(['course', 'patterns']).default('course'),
  review: z.enum(['needs-review', 'approved']).default('needs-review'),
});

export const lessonFrontmatterSchema = z.object({
  title: z.string().min(3),
  order: z.number().int().min(1),
  concepts: z.array(z.enum(CONCEPT_TAGS)).min(1),
  status: z.enum(['needs-review', 'approved']),
});

export interface LessonFile {
  slug: string;
  title: string;
  order: number;
  concepts: string[];
  status: 'needs-review' | 'approved';
  body: string;
  exercises: string[];
  visualizers: string[];
}

export interface CourseFile extends z.infer<typeof courseManifestSchema> {
  lessons: LessonFile[];
}

const BLOCK = /```(exercise|visualizer)\s*\n\s*([a-z0-9-]+)\s*\n```/g;

/** Exercise problem slugs and visualizer kinds embedded in a lesson body. */
export function lessonBlocks(body: string): { exercises: string[]; visualizers: string[] } {
  const exercises: string[] = [];
  const visualizers: string[] = [];
  for (const m of body.matchAll(BLOCK)) (m[1] === 'exercise' ? exercises : visualizers).push(m[2]!);
  return { exercises, visualizers };
}

export async function loadCourse(dir: string): Promise<CourseFile> {
  const manifest = courseManifestSchema.parse(
    parseYaml(await readFile(join(dir, 'course.yaml'), 'utf8')),
  );
  const lessons: LessonFile[] = [];
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.mdx')).sort()) {
    const text = await readFile(join(dir, file), 'utf8');
    const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
    if (!m) throw new Error(`${file}: missing frontmatter`);
    const fm = lessonFrontmatterSchema.safeParse(parseYaml(m[1]!));
    if (!fm.success)
      throw new Error(
        `${file}: ${fm.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
      );
    const body = m[2]!.trim();
    lessons.push({
      slug: file.replace(/^\d+-/, '').replace(/\.mdx$/, ''),
      ...fm.data,
      body,
      ...lessonBlocks(body),
    });
  }
  return { ...manifest, lessons };
}

export async function findCourses(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  for (const e of await readdir(root, { withFileTypes: true })) {
    if (e.isDirectory() && existsSync(join(root, e.name, 'course.yaml')))
      out.push(join(root, e.name));
  }
  return out.sort();
}

/** Course rules: valid frontmatter, unique ordered lessons, known exercises and visualizers. */
export async function validateCourse(dir: string, problemIds: Set<string>): Promise<string[]> {
  const errors: string[] = [];
  let course: CourseFile;
  try {
    course = await loadCourse(dir);
  } catch (err) {
    return [(err as Error).message];
  }
  if (course.slug !== dir.split(/[\\/]/).filter(Boolean).pop())
    errors.push(`folder name must equal slug "${course.slug}"`);
  if (course.lessons.length === 0) errors.push('course has no lessons');
  const orders = course.lessons.map((l) => l.order);
  if (new Set(orders).size !== orders.length) errors.push('lesson orders must be unique');
  for (const l of course.lessons) {
    for (const ex of l.exercises)
      if (!problemIds.has(ex)) errors.push(`${l.slug}: exercise "${ex}" is not a problem package`);
    for (const v of l.visualizers) {
      if (!(VISUALIZERS as readonly string[]).includes(v))
        errors.push(`${l.slug}: unknown visualizer "${v}"`);
    }
  }
  return errors;
}
