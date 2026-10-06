import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildClient } from './scripts/build.mjs';
import { discoverFonts, fontStylesheet } from './scripts/fonts.mjs';

const publicRoot = path.resolve(fileURLToPath(new URL('./public/', import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.map': 'application/json', '.json': 'application/json', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };

export function createServer({ fontsRoot = path.join(publicRoot, 'fonts') } = {}) {
  return http.createServer(async (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname === '/fonts/catalog.json' || pathname === '/fonts/fonts.css') {
        const fonts = await discoverFonts(fontsRoot), css = pathname.endsWith('.css');
        res.writeHead(200, { 'Content-Type': css ? types['.css'] : types['.json'], 'Cache-Control': 'no-store' });
        res.end(req.method === 'HEAD' ? undefined : css ? fontStylesheet(fonts) : JSON.stringify({ fonts }));
        return;
      }
      const filename = pathname === '/' ? 'index.html' : pathname.slice(1);
      const fontRequest = pathname.startsWith('/fonts/'), root = fontRequest ? path.resolve(fontsRoot) : publicRoot;
      const relative = fontRequest ? pathname.slice('/fonts/'.length) : filename;
      const resolved = path.resolve(root, relative);
      if (!resolved.startsWith(root + path.sep) || relative.split('/').some(part => part.startsWith('.'))) {
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
