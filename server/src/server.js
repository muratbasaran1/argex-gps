import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { corsMiddleware, requireAdmin } from './authMiddleware.js';
import settingsRoutes, { publicSettingsRouter } from './settingsRoutes.js';

const app = express();
app.use(helmet());
app.use(express.json());
app.use(morgan('dev'));
app.use(corsMiddleware);

app.use('/api/settings/public', publicSettingsRouter);
app.use('/api/settings', requireAdmin, settingsRoutes);

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
