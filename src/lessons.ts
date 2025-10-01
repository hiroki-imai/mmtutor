import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

export const TOPIC_SLUGS = [
  'flow',
  'seq',
  'class',
  'state',
  'er',
  'gantt',
  'pie',
  'git',
  'journey',
  'mind',
  'timeline',
  'quad'
] as const;

export type TopicSlug = (typeof TOPIC_SLUGS)[number];

export const DEFAULT_TOPIC: TopicSlug = 'flow';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lessonsDir = path.join(projectRoot, 'lessons');
const templatesDir = path.join(projectRoot, 'templates');
const webDir = path.join(projectRoot, 'web');

export interface LessonContent {
  slug: TopicSlug;
  title: string;
  markdown: string;
}

export interface LessonMeta {
  slug: TopicSlug;
  title: string;
  lessonPath: string;
  templatePath: string;
}

export function isTopicSlug(value: string | undefined | null): value is TopicSlug {
  if (!value) return false;
  return (TOPIC_SLUGS as readonly string[]).includes(value);
}

export function assertTopicSlug(value: string | undefined | null): TopicSlug {
  if (!isTopicSlug(value)) {
    throw new Error(`Unknown topic slug: ${value ?? '<empty>'}`);
  }
  return value;
}

export function getLessonPath(topic: TopicSlug): string {
  return path.join(lessonsDir, `${topic}.md`);
}

export function getTemplatePath(topic: TopicSlug): string {
  return path.join(templatesDir, `${topic}.mmd`);
}

export function getWebRoot(): string {
  return webDir;
}

export async function loadLesson(topic: TopicSlug): Promise<LessonContent> {
  const markdown = await readFile(getLessonPath(topic), 'utf8');
  const title = extractTitle(markdown) ?? `Lesson: ${topic}`;
  return { slug: topic, title, markdown };
}

export function extractTitle(markdown: string): string | undefined {
  const lines = markdown.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      return trimmed.replace(/^#+\s*/, '').trim();
    }
  }
  return undefined;
}

export function getLessonMetas(): LessonMeta[] {
  return TOPIC_SLUGS.map((slug) => ({
    slug,
    title: slugToTitle(slug),
    lessonPath: getLessonPath(slug),
    templatePath: getTemplatePath(slug)
  }));
}

function slugToTitle(slug: TopicSlug): string {
  switch (slug) {
    case 'flow':
      return 'フローチャート';
    case 'seq':
      return 'シーケンス図';
    case 'class':
      return 'クラス図';
    case 'state':
      return '状態遷移図';
    case 'er':
      return 'ER 図';
    case 'gantt':
      return 'ガントチャート';
    case 'pie':
      return '円グラフ';
    case 'git':
      return 'Git グラフ';
    case 'journey':
      return 'ジャーニーマップ';
    case 'mind':
      return 'マインドマップ';
    case 'timeline':
      return 'タイムライン';
    case 'quad':
      return '優先度マトリクス';
    default:
      return slug;
  }
}
