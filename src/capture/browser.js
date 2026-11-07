/**
 * Browser resolution.
 *
 * The tool depends on playwright-core and deliberately does not download a
 * browser. It uses a browser that is already present on the machine, in this
 * order: explicit path, PLAYWRIGHT_BROWSERS_PATH, installed Chrome or Edge
 * channel, Playwright default. This keeps the install small and local-first.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { scrubText } from '../redact.js';
import { chromium } from 'playwright-core';

const CHANNEL_CANDIDATES = ['chrome', 'chromium', 'msedge'];

function scanBrowsersPath(root) {
  if (!root || !existsSync(root)) return null;
  const candidates = [];
  for (const entry of readdirSync(root)) {
    for (const rel of [
      join(root, entry, 'chrome-linux', 'chrome'),
      join(root, entry, 'chrome-linux', 'headless_shell'),
      join(root, entry, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
      join(root, entry, 'chrome-win', 'chrome.exe')
    ]) {
      if (existsSync(rel)) candidates.push(rel);
    }
  }
  candidates.sort();
  return candidates.length ? candidates[candidates.length - 1] : null;
}

const COMMON_PATHS = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];

export async function launchBrowser({ browserPath, headless = true, timeout = 30000, proxy = null } = {}) {
  const attempts = [];
  const explicit = browserPath || process.env.DR_BROWSER_PATH;
  if (explicit) attempts.push({ how: 'explicit path', options: { executablePath: explicit, headless } });

  const scanned = scanBrowsersPath(process.env.PLAYWRIGHT_BROWSERS_PATH);
  if (scanned) attempts.push({ how: `PLAYWRIGHT_BROWSERS_PATH (${scanned})`, options: { executablePath: scanned, headless } });

  for (const path of COMMON_PATHS) {
    if (existsSync(path)) attempts.push({ how: `system browser (${path})`, options: { executablePath: path, headless } });
  }
  for (const channel of CHANNEL_CANDIDATES) {
    attempts.push({ how: `channel ${channel}`, options: { channel, headless } });
  }
  attempts.push({ how: 'playwright default chromium', options: { headless } });

  const errors = [];
  for (const attempt of attempts) {
    try {
      const launchOptions = { ...attempt.options, timeout, chromiumSandbox: true, args: ['--disable-dev-shm-usage', '--disable-background-networking', '--disable-component-update'] };
      if (proxy) launchOptions.proxy = { server: proxy };
      const browser = await chromium.launch(launchOptions);
      return { browser, launchedVia: attempt.how };
    } catch (error) {
      errors.push(`${attempt.how}: ${scrubText(error.message.split('\n')[0]).text}`);
    }
  }
  const detail = errors.map((e) => `  - ${e}`).join('\n');
  throw new Error(
    `No usable Chromium-based browser was found.\nTried:\n${detail}\n` +
      'Install Google Chrome, or pass --browser-path /path/to/chrome, or run "npx playwright install chromium".'
  );
}
