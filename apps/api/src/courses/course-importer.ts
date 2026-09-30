import type { PrismaClient } from '@forge/db';
import { findCourses, loadCourse } from '@forge/problem-kit';

/**
 * Imports content/courses. Idempotent: courses and lessons are upserted by slug; lessons removed
 * from disk are deleted. `publishDrafts` is for development only, like problems.
 */
export async function importCourses(
  prisma: PrismaClient,
  root: string,
  opts: { publishDrafts?: boolean } = {},
) {
  if (opts.publishDrafts && process.env.NODE_ENV === 'production') {
    throw new Error('--publish-drafts is for development only.');
  }
  const imported: string[] = [];
  for (const dir of await findCourses(root)) {
    const c = await loadCourse(dir);
    const review = c.review === 'approved' ? ('approved' as const) : ('needs_review' as const);
    const publish = opts.publishDrafts || review === 'approved';
    const course = await prisma.course.upsert({
      where: { slug: c.slug },
      create: {
        slug: c.slug,
        title: c.title,
        description: c.description,
        topic: c.topic,
        order: c.order,
        kind: c.kind,
        reviewStatus: review,
        status: publish ? 'published' : 'draft',
      },
      update: {
        title: c.title,
        description: c.description,
        topic: c.topic,
        order: c.order,
        kind: c.kind,
        reviewStatus: review,
        ...(publish ? { status: 'published' as const } : {}),
      },
    });
    for (const l of c.lessons) {
      const data = {
        title: l.title,
        order: l.order,
        concepts: l.concepts,
        body: l.body,
        reviewStatus: l.status === 'approved' ? ('approved' as const) : ('needs_review' as const),
      };
      await prisma.lesson.upsert({
        where: { courseId_slug: { courseId: course.id, slug: l.slug } },
        create: { courseId: course.id, slug: l.slug, ...data },
        update: data,
      });
    }
    await prisma.lesson.deleteMany({
      where: { courseId: course.id, slug: { notIn: c.lessons.map((l) => l.slug) } },
    });
    imported.push(c.slug);
  }
  return imported;
}
