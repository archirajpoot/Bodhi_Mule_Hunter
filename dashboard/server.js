/**
 * BODHI MULE HUNTER AI — Render frontend server with reverse proxy.
 *
 * The dashboard HTML/CSS/JS uses relative paths like /api/overview.
 * This server proxies those requests to the AWS-hosted backend so the
 * browser sees everything as same-origin — no CORS changes needed on
 * the backend at all.
 */

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const BACKEND_URL = 'http://16.16.26.80:8000';

// ---- Serve dashboard assets at /static (matches the backend mount path) ----
app.use('/static', express.static(path.join(__dirname)));

// ---- Proxy /api/* and remaining /static/* to the AWS backend ----
// CSS/JS are served locally above; /static/samples/* falls through to proxy
app.use(
  ['/api', '/static'],
  createProxyMiddleware({
    target: BACKEND_URL,
    changeOrigin: true,
    proxyTimeout: 30000,
    timeout: 30000,
  })
);

// ---- Also serve dashboard files at root ----
app.use(express.static(path.join(__dirname)));

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`BODHI Dashboard on port ${PORT} → proxying API to ${BACKEND_URL}`);
});
