#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const args = process.argv.slice(2);
let directoryArg = args.find((arg) => !arg.startsWith('--'));
let directory = directoryArg || 'dist';
let port = 4173;

for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--port' && args[i + 1]) {
    const parsed = Number(args[i + 1]);
    if (!Number.isNaN(parsed)) {
      port = parsed;
    }
    i += 1;
  }
}

directory = path.resolve(process.cwd(), directory);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

function sendNotFound(res) {
  res.statusCode = 404;
  res.end('Not found');
}

function getFilePath(requestedPath) {
  const decodedPath = decodeURIComponent(requestedPath || '/');
  const safePath = decodedPath.replace(/\\\\/g, '/');
  const joinedPath = path.join(directory, safePath);
  const normalizedPath = path.normalize(joinedPath);

  if (!normalizedPath.startsWith(directory)) {
    return null;
  }

  let candidatePath = normalizedPath;
  if (candidatePath.endsWith('/')) {
    candidatePath = path.join(candidatePath, 'index.html');
  }

  if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isDirectory()) {
    return path.join(candidatePath, 'index.html');
  }

  return candidatePath;
}

function serveFile(filePath, res) {
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      sendNotFound(res);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      res.statusCode = 500;
      res.end('Internal server error');
    });
    stream.pipe(res);
  });
}

if (!fs.existsSync(directory)) {
  console.error(`Directory not found: ${directory}`);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const requestUrl = url.parse(req.url || '').pathname || '/';
  const filePath = getFilePath(requestUrl);

  if (!filePath) {
    sendNotFound(res);
    return;
  }

  serveFile(filePath, res);
});

server.listen(port, () => {
  console.log(`Serving ${directory} at http://localhost:${port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
