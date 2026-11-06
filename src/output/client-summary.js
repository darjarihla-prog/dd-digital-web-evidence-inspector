/**
 * Client summary.
 *
 * Plain language, one to two pages, for the person who pays for the review and
 * does not read a technical report. It is rendered as HTML and printed to PDF
 * by the same browser the tool already uses, so there is no extra dependency.
 */
import { launchBrowser } from '../capture/browser.js';
import { sortFindings, PASS_MEANING } from '../assess.js';

const STRINGS = {
  nl: {
    title: 'Website review: samenvatting',
    subtitle: 'Wat er tijdens een gecontroleerd bezoek aan uw website is waargenomen',
    scope: 'Onderzochte pagina',
    date: 'Datum van waarneming',
    verdict: 'Totaalbeeld',
    verdictLead: {
      PASS: 'Binnen de uitgevoerde controles is geen relevante bevinding waargenomen.',
      REVIEW: 'Er zijn punten waargenomen die beoordeling vragen.',
      FAIL: 'Er zijn punten waargenomen die in vrijwel elke situatie onjuist zijn.'
    },
    observed: 'In het kort',
    priorities: 'Wat we u adviseren op te pakken',
    noPriorities: 'Binnen de uitgevoerde controles zijn geen actiepunten waargenomen.',
    checked: 'Wat er is gecontroleerd',
    notSaid: 'Wat dit rapport niet zegt',
    privacyNote:
      'Bij dit onderzoek zijn bewust geen inhoud van verzoeken en antwoorden, cookiewaarden, opgeslagen waarden, queryparameterwaarden of inloggegevens vastgelegd.',
    metrics: {
      thirdParty: 'Externe domeinen',
      trackers: 'Trackers',
      storage: 'Opgeslagen sleutels in de browser',
      headers: 'Ontbrekende beveiligingsheaders',
      scripts: 'Externe scripts',
      console: 'Fouten in de console'
    },
    severity: { high: 'hoog', medium: 'midden', low: 'laag', info: 'informatief' },
    priority: 'Prioriteit',
    footer: 'Opgesteld met de Darja Rihla Web Evidence Inspector. De technische onderbouwing is beschikbaar in het consultantrapport.'
  },
  en: {
    title: 'Website review: summary',
    subtitle: 'What was observed during a controlled visit to your website',
    scope: 'Page examined',
    date: 'Observed on',
    verdict: 'Overall picture',
    verdictLead: {
      PASS: 'No relevant finding was observed within the checks performed.',
      REVIEW: 'Points were observed that need a judgement.',
      FAIL: 'Points were observed that are wrong in almost any situation.'
    },
    observed: 'In short',
    priorities: 'What we advise you to address',
    noPriorities: 'No action points were observed within the checks performed.',
    checked: 'What was checked',
    notSaid: 'What this report does not say',
    privacyNote:
      'This review deliberately did not record request or response content, cookie values, stored values, query parameter values or credentials.',
    metrics: {
      thirdParty: 'External domains',
      trackers: 'Trackers',
      storage: 'Browser storage keys',
      headers: 'Missing security headers',
      scripts: 'External scripts',
      console: 'Console errors'
    },
    severity: { high: 'high', medium: 'medium', low: 'low', info: 'info' },
    priority: 'Priority',
    footer: 'Produced with the Darja Rihla Web Evidence Inspector. The technical basis is available in the consultant report.'
  }
};

const STATUS_COLOR = { PASS: '#1f7a4d', REVIEW: '#9a6700', FAIL: '#a3262c' };

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderClientHtml(evidence, assessment, options = {}) {
  const lang = STRINGS[options.lang] ? options.lang : 'nl';
  const t = STRINGS[lang];
  const s = evidence.summary;
  const target = evidence.scan.target.finalUrl || evidence.scan.target.inputUrl;
  const date = new Date(evidence.scan.startedAt).toLocaleDateString(lang === 'nl' ? 'nl-NL' : 'en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const priorities = sortFindings(assessment.findings.filter((f) => f.status !== 'PASS')).slice(0, 5);

  const metrics = [
    [t.metrics.thirdParty, s.thirdPartyDomains],
    [t.metrics.trackers, s.trackersDetected],
    [t.metrics.storage, s.browserStorageKeys],
    [t.metrics.headers, s.securityHeadersMissing],
    [t.metrics.scripts, s.thirdPartyScripts],
    [t.metrics.console, s.consoleErrorsAttributable]
  ];

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(t.title)} ${escapeHtml(target)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "Helvetica Neue", Arial, sans-serif; color: #16181d; font-size: 10.5pt; line-height: 1.5; margin: 0; }
  h1 { font-size: 20pt; margin: 0 0 4px; letter-spacing: -0.01em; }
  h2 { font-size: 12pt; margin: 22px 0 8px; text-transform: uppercase; letter-spacing: 0.08em; color: #5b6472; }
  p { margin: 0 0 8px; }
  .sub { color: #5b6472; margin-bottom: 18px; }
  .meta { border-top: 1px solid #d9dee5; border-bottom: 1px solid #d9dee5; padding: 10px 0; display: flex; gap: 32px; margin-bottom: 4px; }
  .meta div { font-size: 9.5pt; }
  .meta span { display: block; color: #5b6472; text-transform: uppercase; letter-spacing: 0.06em; font-size: 8pt; margin-bottom: 2px; }
  .verdict { display: flex; align-items: center; gap: 14px; margin: 14px 0 6px; }
  .badge { display: inline-block; padding: 6px 16px; border-radius: 3px; color: #fff; font-weight: 700; letter-spacing: 0.08em; font-size: 13pt; background: ${STATUS_COLOR[assessment.overall]}; }
  .metrics { display: flex; flex-wrap: wrap; gap: 10px; margin: 10px 0 4px; }
  .metric { border: 1px solid #d9dee5; border-radius: 3px; padding: 8px 12px; min-width: 120px; flex: 1 1 120px; }
  .metric b { display: block; font-size: 17pt; line-height: 1.1; }
  .metric span { font-size: 8.5pt; color: #5b6472; }
  ol { padding-left: 18px; margin: 0; }
  li { margin-bottom: 10px; }
  li b { display: block; }
  .tag { display: inline-block; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.06em; padding: 1px 6px; border-radius: 2px; border: 1px solid #c4ccd6; color: #5b6472; margin-left: 6px; }
  .note { background: #f4f6f9; border-left: 3px solid #c4ccd6; padding: 10px 12px; font-size: 9.5pt; margin-top: 8px; }
  ul.plain { padding-left: 18px; margin: 0; font-size: 9.5pt; color: #3c4450; }
  footer { margin-top: 26px; border-top: 1px solid #d9dee5; padding-top: 8px; font-size: 8.5pt; color: #5b6472; }
</style>
</head>
<body>
  <h1>${escapeHtml(t.title)}</h1>
  <p class="sub">${escapeHtml(t.subtitle)}</p>
  <div class="meta">
    <div><span>${escapeHtml(t.scope)}</span>${escapeHtml(target)}</div>
    <div><span>${escapeHtml(t.date)}</span>${escapeHtml(date)}</div>
  </div>

  <h2>${escapeHtml(t.verdict)}</h2>
  <div class="verdict">
    <span class="badge">${assessment.overall}</span>
    <span>${escapeHtml(t.verdictLead[assessment.overall])}</span>
  </div>

  <h2>${escapeHtml(t.observed)}</h2>
  <div class="metrics">
    ${metrics.map(([label, value]) => `<div class="metric"><b>${value}</b><span>${escapeHtml(label)}</span></div>`).join('\n    ')}
  </div>

  <h2>${escapeHtml(t.priorities)}</h2>
  ${
    priorities.length
      ? `<ol>${priorities
          .map(
            (f) => `<li><b>${escapeHtml(f.check)}<span class="tag">${escapeHtml(t.priority)}: ${escapeHtml(
              t.severity[f.severity] || f.severity
            )}</span></b>${escapeHtml(f.observedResult)} ${f.recommendedAction ? escapeHtml(f.recommendedAction) : ''}</li>`
          )
          .join('\n')}</ol>`
      : `<p>${escapeHtml(t.noPriorities)}</p>`
  }

  <h2>${escapeHtml(t.checked)}</h2>
  <ul class="plain">
    ${assessment.findings.map((f) => `<li>${escapeHtml(f.check)} (${f.status})</li>`).join('\n    ')}
  </ul>

  <h2>${escapeHtml(t.notSaid)}</h2>
  <div class="note">${escapeHtml(PASS_MEANING[lang] || PASS_MEANING.en)}</div>
  <ul class="plain" style="margin-top:8px">
    ${assessment.limitations.map((l) => `<li>${escapeHtml(l)}</li>`).join('\n    ')}
  </ul>
  <div class="note">${escapeHtml(t.privacyNote)}</div>

  <footer>${escapeHtml(t.footer)} Scan ID: ${escapeHtml(evidence.scan.scanId)}</footer>
</body>
</html>`;
}

export async function writeClientPdf(html, outputPath, { browserPath = null } = {}) {
  const { browser } = await launchBrowser({ browserPath, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({ path: outputPath, format: 'A4', printBackground: true });
  } finally {
    await browser.close().catch(() => {});
  }
  return outputPath;
}
