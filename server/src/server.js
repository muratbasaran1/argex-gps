import { WebSocketServer, WebSocket } from 'ws';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { corsMiddleware, requireAdmin, validateAdminToken } from './authMiddleware.js';
import { allowedOriginsConfig, corsMessages } from './config.js';
import authRoutes from './authRoutes.js';
import settingsRoutes, { publicSettingsRouter } from './settingsRoutes.js';
import mapsRoutes, { publicMapsRouter } from './mapsRoutes.js';
import syncRoutes from './syncRoutes.js';
import teamsRoutes from './teamsRoutes.js';

const app = express();
app.use(helmet());
app.use(express.json());
app.use(morgan('dev'));
if (!allowedOriginsConfig.set) {
  const message = allowedOriginsConfig.error || corsMessages.missingEnv;
  console.error(`[startup] ${message}`);
  throw new Error(message);
}

app.use(corsMiddleware);

app.use('/api/settings/public', publicSettingsRouter);
app.use('/api/maps/public', publicMapsRouter);
app.use('/api/auth', requireAdmin, authRoutes);
app.use('/api/settings', requireAdmin, settingsRoutes);
app.use('/api/maps', requireAdmin, mapsRoutes);
app.use('/api/sync', requireAdmin, syncRoutes);
app.use('/api/teams', requireAdmin, teamsRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'internal error', error: err.message });
});

function resolveWebsocketPath(rawUrl) {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    return parsed.pathname || '/';
  } catch (error) {
    console.error(`[startup] invalid API_WEBSOCKET_URL: ${error.message}`);
    return null;
  }
}

function setupWebsocketServer(httpServer, path) {
  if (!path) {
    console.log('[startup] API_WEBSOCKET_URL missing; websocket server not started');
    return null;
  }

  const websocketServer = new WebSocketServer({ noServer: true });
  const peers = new Set();

  const closeWithStatus = (socket, statusLine) => {
    try {
      socket.write(`HTTP/1.1 ${statusLine}\r\n\r\n`);
    } catch (err) {
      console.error('[ws] failed to write upgrade rejection', err);
    }
    socket.destroy();
  };

  httpServer.on('upgrade', async (request, socket, head) => {
    let requestPath;
    try {
      requestPath = new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname;
    } catch (error) {
      console.error('[ws] failed to parse upgrade url', error);
      closeWithStatus(socket, '400 Bad Request');
      return;
    }

    if (requestPath !== path) return;

    const origin = request.headers.origin;
    if (origin && allowedOriginsConfig.set && !allowedOriginsConfig.set.has(origin)) {
      console.error(`[ws] blocked upgrade from origin ${origin}`);
      closeWithStatus(socket, '403 Forbidden');
      return;
    }

    let user;
    try {
      user = await validateAdminToken(request.headers.authorization);
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 401;
      const reason = status === 403 ? 'Forbidden' : 'Unauthorized';
      console.error('[ws] auth failed', error);
      closeWithStatus(socket, `${status} ${reason}`);
      return;
    }

    websocketServer.handleUpgrade(request, socket, head, (ws) => {
      ws.user = user;
      websocketServer.emit('connection', ws, request);
    });
  });

  function broadcast(message, sender) {
    const payload = JSON.stringify(message);
    for (const peer of peers) {
      if (peer !== sender && peer.readyState === WebSocket.OPEN) {
        peer.send(payload);
      }
    }
  }

  websocketServer.on('connection', (ws) => {
    peers.add(ws);
    ws.send(
      JSON.stringify({
        type: 'connected',
        message: 'websocket live channel ready for location and telemetry',
        connectedAt: new Date().toISOString(),
      })
    );

    ws.on('message', (data) => {
      let parsed;
      try {
        parsed = JSON.parse(data.toString());
      } catch (error) {
        ws.send(JSON.stringify({ type: 'error', message: 'invalid JSON payload' }));
        return;
      }

      const { type, payload } = parsed || {};
      const envelope = {
        actor: ws.user?.sub || ws.user?.email || ws.user?.preferred_username || 'unknown',
        receivedAt: new Date().toISOString(),
      };

      if (type === 'location:update') {
        const update = { ...envelope, ...payload };
        broadcast({ type: 'location:update', payload: update }, ws);
        ws.send(JSON.stringify({ type: 'ack', event: 'location:update', receivedAt: update.receivedAt }));
        return;
      }

      if (type === 'telemetry:update') {
        const update = { ...envelope, ...payload };
        broadcast({ type: 'telemetry:update', payload: update }, ws);
        ws.send(JSON.stringify({ type: 'ack', event: 'telemetry:update', receivedAt: update.receivedAt }));
        return;
      }

      ws.send(JSON.stringify({ type: 'error', message: 'unsupported message type' }));
    });

    ws.on('close', () => {
      peers.delete(ws);
    });
  });

  console.log(`[startup] websocket server listening on path ${path}`);
  return websocketServer;
}

const port = process.env.PORT || 4000;
const websocketPath = resolveWebsocketPath(process.env.API_WEBSOCKET_URL);
const server = app.listen(port, () => {
  console.log(`settings service listening on ${port}`);
});
setupWebsocketServer(server, websocketPath);
