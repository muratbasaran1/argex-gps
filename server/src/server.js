import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { corsMiddleware, requireAdmin } from './authMiddleware.js';
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

if (allowedOriginsConfig.enforceStartupFailure && !allowedOriginsConfig.set) {
  console.error(`[cors] ${allowedOriginsConfig.error || corsMessages.missingEnv}`);
  process.exit(1);
}

if (allowedOriginsConfig.source === 'dev-default') {
  console.warn(corsMessages.devDefaultsInUse);
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

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`settings service listening on ${port}`);
});
