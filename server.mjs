import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildClient } from './scripts/build.mjs';

const publicRoot = path.resolve(fileURLToPath(new URL('./public/', import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.map': 'application/json' };

export function createServer() {
  return http.createServer(async (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const filename = pathname === '/' ? 'index.html' : pathname.slice(1);
      const resolved = path.resolve(publicRoot, filename);
      if (!resolved.startsWith(publicRoot + path.sep) || filename.startsWith('.')) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      const data = await readFile(resolved);
      res.writeHead(200, {
        'Content-Type': types[path.extname(resolved)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      res.writeHead(error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 400).end('File not found');
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await buildClient();
  const port = Number(process.env.PORT || 3000);
  const server = createServer();
  server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE' ? `Port ${port} is busy. Try PORT=${port + 1} npm start.` : error.message);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => console.log(`Comic Studio is ready at http://127.0.0.1:${port}`));
}
