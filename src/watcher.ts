import { readFile } from 'fs/promises';
import chokidar, { FSWatcher } from 'chokidar';
import debug from 'debug';
import path from 'path';
import { DiagramChangeCallback } from './types.js';

const log = debug('mmtutor:watcher');

export interface DiagramWatcher {
  close(): Promise<void>;
}

export interface DiagramWatcherOptions {
  filePath: string;
  onChange: DiagramChangeCallback;
}

export function createDiagramWatcher(options: DiagramWatcherOptions): DiagramWatcher {
  const { filePath, onChange } = options;
  const watcher: FSWatcher = chokidar.watch(filePath, {
    ignoreInitial: false,
    depth: 0,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50
    }
  });

  const emit = async () => {
    try {
      const content = await readFile(filePath, 'utf8');
      const timestamp = Date.now();
      log('detected update %s, bytes=%d', path.basename(filePath), content.length);
      onChange({ content, timestamp });
    } catch (error) {
      log('failed to read diagram file: %O', error);
    }
  };

  watcher.on('add', emit);
  watcher.on('change', emit);

  return {
    async close() {
      await watcher.close();
    }
  };
}
