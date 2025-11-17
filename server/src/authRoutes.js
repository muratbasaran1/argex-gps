import express from 'express';

const revocationEndpoint = process.env.OIDC_REVOCATION_URL;
const clientId = process.env.OIDC_CLIENT_ID;
const clientSecret = process.env.OIDC_CLIENT_SECRET;

const router = express.Router();

router.post('/logout', async (req, res) => {
  if (!revocationEndpoint) {
    return res.status(500).json({ message: 'revocation endpoint is not configured' });
  }

  const { token, token_type_hint: tokenTypeHint } = req.body || {};
  if (!token) {
    return res.status(400).json({ message: 'token is required' });
  }

  const params = new URLSearchParams();
  params.set('token', token);
  params.set('token_type_hint', tokenTypeHint || 'refresh_token');
  if (clientId) params.set('client_id', clientId);
  if (clientSecret) params.set('client_secret', clientSecret);

  try {
    const response = await fetch(revocationEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const responseText = await response.text();
    if (!response.ok) {
      return res.status(502).json({
        message: 'token revocation failed',
        status: response.status,
        detail: responseText || response.statusText,
      });
    }
    return res.json({ message: 'token revoked', detail: responseText || undefined });
  } catch (error) {
    console.error('revocation request failed', error);
    return res.status(500).json({ message: 'revocation request failed', error: error.message });
  }
});

export default router;
