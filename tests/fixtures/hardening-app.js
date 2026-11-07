import { createServer } from 'node:http';
export const MARKER = 'Synthetic025Marker';
export function startHardeningApp() {
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/redirect') return res.writeHead(302, { location: `/page?token=${MARKER}#${MARKER}`, 'x-unexpected': MARKER }).end();
    if (path === '/abort') return req.socket.destroy();
    if (path === '/hang') return;
    if (path === '/inflight') return res.end('<!doctype html><script>fetch("/hang")</script>');
    if (path === '/slow') return setTimeout(() => res.writeHead(204).end(), 100);
    if (path === '/consent') return res.end(`<!doctype html><button id="reject">Reject</button><button id="accept">Accept</button><script>window.fresh = !localStorage.getItem('consent'); reject.onclick=()=>{localStorage.setItem('consent','reject');fetch('/rejected')};accept.onclick=()=>{localStorage.setItem('consent','accept');fetch('/accepted')};</script>`);
    if (path === '/page' || path === '/second') {
      res.writeHead(200, { 'content-type': 'text/html', 'x-unexpected': MARKER, 'content-security-policy': `script-src 'unsafe-inline' 'nonce-${MARKER}'` });
      return res.end(`<!doctype html><title>Controlled hardening fixture</title><a href="/second">Second page</a><form action="/never-submit"><button>Submit</button></form><script nonce="${MARKER}">
      console.error('Diagnostic http://name:${MARKER}@127.0.0.1/path?token=${MARKER}#${MARKER}');
      localStorage.setItem('${MARKER}@example.test', 'value');
      indexedDB.open('${MARKER}@example.test', 1);
      document.cookie='plain=value; path=/';
      fetch('/slow'); fetch('/abort').catch(()=>{});
      setTimeout(()=>{throw new Error('Failure http://127.0.0.1/token/${MARKER}?x=${MARKER}#${MARKER}')}, 10);
      </script>`);
    }
    res.writeHead(204).end();
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) }));
  });
}
