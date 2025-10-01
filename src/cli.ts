#!/usr/bin/env node
import { Command } from 'commander';
import path from 'path';
import { mkdir, copyFile, access, writeFile } from 'fs/promises';
import { constants } from 'fs';
import debug from 'debug';
import open from 'open';
import { createServer as createNetServer } from 'net';
import {
  DEFAULT_TOPIC,
  getLessonPath,
  getTemplatePath,
  isTopicSlug,
  TOPIC_SLUGS,
  type TopicSlug
} from './lessons.js';
import { startServer } from './server.js';

const log = debug('mmtutor:cli');

interface RawOptions {
  port?: string;
  cwd?: string;
  topic?: string;
  open?: boolean;
}

async function main() {
  const program = new Command();
  program
    .name('mmtutor')
    .description('Mermaid tutor with live preview')
    .argument('[topic]', 'Topic slug to start with')
    .option('--port <number>', 'Port to bind (default 5678)')
    .option('--cwd <path>', 'Workspace directory for .mmtutor')
    .option('--topic <slug>', 'Explicit topic slug override')
    .option('--no-open', 'Do not open browser automatically')
    .allowUnknownOption(false)
    .showHelpAfterError();

  program.parse(process.argv);
  const cliArgs = program.args as string[];
  const raw = program.opts<RawOptions>();

  const topicInput = cliArgs[0] ?? raw.topic;
  const topic = resolveTopic(topicInput);
  const cwd = path.resolve(raw.cwd ?? process.cwd());
  const port = await resolvePort(raw.port);
  const shouldOpenBrowser = raw.open !== false;

  const workspaceDir = path.join(cwd, '.mmtutor');
  await mkdir(workspaceDir, { recursive: true });

  await ensureWorkspaceFiles(workspaceDir, topic);

  const server = await startServer({ port, cwd: workspaceDir, topic });
  const actualPort = server.port;
  const url = new URL(`http://127.0.0.1:${actualPort}/`);
  url.searchParams.set('topic', topic);

  console.log(`mmtutor ready on ${url.toString()}`);
  console.log(`workspace: ${workspaceDir}`);

  if (shouldOpenBrowser) {
    try {
      await open(url.toString(), { wait: false });
    } catch (error) {
      console.warn('Failed to open browser automatically:', (error as Error).message);
    }
  }

  const shutdown = async () => {
    await server.close().catch((error) => {
      log('error during shutdown: %O', error);
    });
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function resolveTopic(input?: string): TopicSlug {
  if (!input) return DEFAULT_TOPIC;
  if (!isTopicSlug(input)) {
    console.error(`Invalid topic: ${input}`);
    console.error(`Available topics: ${TOPIC_SLUGS.join(', ')}`);
    process.exit(1);
  }
  return input;
}

async function resolvePort(rawPort?: string): Promise<number> {
  const base = rawPort ? parseInt(rawPort, 10) : 5678;
  if (Number.isNaN(base) || base <= 0 || base > 65535) {
    console.error(`Invalid port: ${rawPort}`);
    process.exit(1);
  }

  let candidate = base;
  for (let i = 0; i < 10; i += 1) {
    const free = await isPortAvailable(candidate);
    if (free) {
      return candidate;
    }
    candidate += 1;
  }

  console.error('No available port found in range');
  process.exit(1);
}

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.unref();
    server.on('error', () => {
      server.close(() => resolve(false));
    });
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

async function ensureWorkspaceFiles(workspaceDir: string, topic: TopicSlug): Promise<void> {
  const diagramPath = path.join(workspaceDir, 'playground.mmd');
  const lessonCopyPath = path.join(workspaceDir, 'lesson.md');
  await ensureFileFromTemplate(diagramPath, getTemplatePath(topic));
  await ensureFileFromTemplate(lessonCopyPath, getLessonPath(topic));
}

async function ensureFileFromTemplate(targetPath: string, templatePath: string): Promise<void> {
  const exists = await fileExists(targetPath);
  if (exists) {
    return;
  }

  try {
    await copyFile(templatePath, targetPath);
    log('created %s from %s', targetPath, templatePath);
  } catch (error) {
    log('copy failed, creating empty file instead: %O', error);
    await writeFile(targetPath, '', 'utf8');
  }
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
