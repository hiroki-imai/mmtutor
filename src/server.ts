import express, { Request, Response } from 'express';
import { createServer, Server as HttpServer } from 'http';
import path from 'path';
import { readFile, writeFile } from 'fs/promises';
import debug from 'debug';
import { createDiagramWatcher } from './watcher.js';
import type { DiagramFileUpdate, ServerHandle, ServerStartOptions } from './types.js';
import {
  DEFAULT_TOPIC,
  getLessonMetas,
  getTemplatePath,
  getWebRoot,
  isTopicSlug,
  loadLesson,
  type TopicSlug
} from './lessons.js';

const log = debug('mmtutor:server');
const sseLog = debug('mmtutor:sse');

interface SseClient {
  id: string;
  res: Response;
}

export async function startServer(options: ServerStartOptions): Promise<ServerHandle> {
  const { port, cwd, topic } = options;
  const app = express();
  const httpServer: HttpServer = createServer(app);
  const diagramPath = path.join(cwd, 'playground.mmd');

  const clients = new Map<string, SseClient>();
  let lastUpdate: DiagramFileUpdate | undefined;
  let currentTopic: TopicSlug = topic;

  const watcher = createDiagramWatcher({
    filePath: diagramPath,
    onChange(update) {
      lastUpdate = update;
      broadcast('diagram', update);
    }
  });

  app.use(express.json({ limit: '1mb' }));

  const webRoot = getWebRoot();
  const templatesRoot = path.dirname(getTemplatePath(DEFAULT_TOPIC));

  app.get('/', (_req, res) => {
    res.sendFile(path.join(webRoot, 'index.html'));
  });

  app.use('/static', express.static(webRoot, { extensions: ['html'] }));
  app.use('/static/templates', express.static(templatesRoot));
  app.get('/api/topics', (_req, res) => {
    res.json(getLessonMetas().map(({ slug, title }) => ({ slug, title })));
  });

  app.get('/api/lesson', async (req, res) => {
    try {
      const queryTopic = typeof req.query.topic === 'string' ? req.query.topic : undefined;
      const resolved = queryTopic && isTopicSlug(queryTopic) ? queryTopic : currentTopic;
      const lesson = await loadLesson(resolved);
      res.json({ slug: lesson.slug, title: lesson.title, markdown: lesson.markdown });
    } catch (error) {
      log('failed to load lesson: %O', error);
      res.status(404).json({ error: 'Lesson not found' });
    }
  });

  app.get('/api/diagram', async (_req, res) => {
    try {
      const content = await readFile(diagramPath, 'utf8');
      res.json({ content });
    } catch (error) {
      log('failed to read diagram: %O', error);
      res.status(404).json({ error: 'Diagram not found' });
    }
  });

  app.post('/api/diagram', async (req, res) => {
    const { content } = req.body ?? {};
    if (typeof content !== 'string') {
      res.status(400).json({ error: 'Invalid payload' });
      return;
    }

    try {
      await writeFile(diagramPath, content, 'utf8');
      res.json({ ok: true });
    } catch (error) {
      log('failed to write diagram: %O', error);
      res.status(500).json({ error: 'Failed to write diagram' });
    }
  });

  app.get('/events', (req, res) => {
    req.socket.setTimeout(0);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const clientId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    clients.set(clientId, { id: clientId, res });
    sseLog('client connected %s (total=%d)', clientId, clients.size);

    res.write(`event: topic\ndata: ${JSON.stringify({ topic: currentTopic })}\n\n`);
    if (lastUpdate) {
      res.write(`event: diagram\ndata: ${JSON.stringify(lastUpdate)}\n\n`);
    } else {
      void readFile(diagramPath, 'utf8')
        .then((content) => {
          const payload: DiagramFileUpdate = { content, timestamp: Date.now() };
          res.write(`event: diagram\ndata: ${JSON.stringify(payload)}\n\n`);
        })
        .catch((error) => {
          sseLog('initial diagram read failed: %O', error);
        });
    }

    const onClose = () => {
      clients.delete(clientId);
      sseLog('client disconnected %s (total=%d)', clientId, clients.size);
    };

    req.on('close', onClose);
  });

  app.post('/api/topic', (req, res) => {
    const requested = req.body?.topic;
    if (!isTopicSlug(requested)) {
      res.status(400).json({ error: 'Unknown topic' });
      return;
    }
    currentTopic = requested;
    broadcast('topic', { topic: currentTopic });
    res.json({ ok: true });
  });

  function broadcast(event: string, payload: unknown) {
    const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of clients.values()) {
      client.res.write(data);
    }
  }

  const listenPromise = new Promise<void>((resolve) => {
    httpServer.listen(port, '127.0.0.1', () => {
      log('server listening on http://127.0.0.1:%d', port);
      resolve();
    });
  });

  await listenPromise;

  return {
    port: (httpServer.address() as { port: number }).port,
    async close() {
      const activeClients = Array.from(clients.values());
      for (const client of activeClients) {
        try {
          client.res.end();
        } catch (error) {
          sseLog('failed to end client %s: %O', client.id, error);
        }
      }

      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });

      await watcher.close();
    }
  };
}
