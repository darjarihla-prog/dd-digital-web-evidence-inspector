/**
 * Controlled test application.
 *
 * Deliberately contains known conditions so detectors can be tested against a
 * case where the expected result is known in advance:
 *  - a redirect chain of two hops
 *  - a third-party script and a third-party pixel
 *  - a tracker endpoint that matches the bundled rule set
 *  - localStorage keys including one sensitive-looking key
 *  - a cookie without Secure and without HttpOnly
 *  - one console error
 *  - no security headers on the final document
 */
import { createServer } from 'node:http';

export const EXPECTED = {
  redirectHops: 2,
  localStorageKeys: 3,
  sensitiveStorageIndicators: 1,
  consoleErrors: 1,
  securityHeadersPresent: 0
};

const PAGE = `<!doctype html>
<html lang="nl">
<head><meta charset="utf-8"><title>DR test app</title></head>
<body>
<h1>Controlled test application</h1>
<img src="/tracker-pixel.gif" alt="">
<script>
  localStorage.setItem('dr_theme', 'dark');
  localStorage.setItem('dr_visits', '3');
  localStorage.setItem('auth_token', 'aaaabbbbccccddddeeeeffff00001111');
  sessionStorage.setItem('dr_step', '2');
  document.cookie = 'dr_pref=nl; path=/';
  console.error('Test app deliberate error: resource not available');
  fetch('/api/profile?email=someone@example.com&token=secret123').catch(function () {});
</script>
<script src="/third-party/widget.js"></script>
</body>
</html>`;

export function startTestApp(port = 0) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/') {
      res.writeHead(302, { location: '/step-1' });
      return res.end();
    }
    if (url.pathname === '/step-1') {
      res.writeHead(302, { location: '/final' });
      return res.end();
    }
    if (url.pathname === '/final') {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'set-cookie': 'dr_session=abc123; Path=/',
        server: 'dr-test-app'
      });
      return res.end(PAGE);
    }
    if (url.pathname === '/third-party/widget.js') {
      res.writeHead(200, { 'content-type': 'application/javascript' });
      return res.end("console.warn('widget loaded');");
    }
    if (url.pathname === '/tracker-pixel.gif') {
      res.writeHead(200, { 'content-type': 'image/gif' });
      return res.end(Buffer.from('R0lGODlhAQABAAAAACw=', 'base64'));
    }
    if (url.pathname === '/api/profile') {
      res.writeHead(404, { 'content-type': 'application/json' });
      return res.end('{"error":"not found"}');
    }
    res.writeHead(404).end('not found');
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, port: address.port, url: `http://127.0.0.1:${address.port}/` });
    });
  });
}

if (process.argv[1] && process.argv[1].endsWith('test-app.js')) {
  const { url } = await startTestApp(Number(process.env.PORT) || 8787);
  console.log(`test app on ${url}`);
}
