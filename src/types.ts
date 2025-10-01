import type { TopicSlug } from './lessons.js';

export interface CliOptions {
  cwd: string;
  port: number;
  topic: TopicSlug;
  openBrowser: boolean;
}

export interface ServerStartOptions {
  port: number;
  cwd: string;
  topic: TopicSlug;
}

export interface ServerHandle {
  port: number;
  close(): Promise<void>;
}

export interface DiagramFileUpdate {
  content: string;
  timestamp: number;
}

export type DiagramChangeCallback = (update: DiagramFileUpdate) => void;
