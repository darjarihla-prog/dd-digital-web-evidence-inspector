/**
 * Consultant report in Markdown.
 *
 * Structure follows the way a consultant reads: verdict first, then what was
 * observed, then the evidence behind it, then what the scan could not see.
 *
 * Language contract: evidence.json is language neutral, this report and the
 * client summary follow the chosen language. The assessment passed in here is
 * already rendered in that language.
 */
import { sortFindings, PASS_MEANING } from '../assess.js';

const T = {
  en: {
    title: (target) => `Web evidence report: ${target}`,
    scanId: 'Scan ID',
    observedAt: 'Observed at',
    tool: 'Tool',
    ruleSet: 'Tracker rule set',
    browser: 'Browser',
    verdict: (status) => `Verdict: ${status}`,
    counts: (f, r, p, t) => `${f} FAIL, ${r} REVIEW, ${p} PASS across ${t} checks.`,
    warning: 'Warning',
    didNotLoad: (error) => `The page did not load cleanly: \`${error}\`. Treat the evidence below as incomplete.`,
    openFindings: 'Findings that need attention',
    noOpenFindings: 'No findings outside PASS. See the limitations before drawing conclusions from that.',
    passedChecks: 'Checks without a finding',
    evidence: 'Evidence',
    redirectChain: 'Redirect chain',
    noRedirects: 'No navigation responses were observed.',
    trackers: 'Trackers',
    noTrackers:
      'No tracker from the bundled rule set was matched. The rule set is limited, so this is not evidence that no tracking occurs.',
    transmissionNote:
      'A transmission is a request to a tracker domain with method POST or resource type xhr, fetch, ping or beacon. Accepted means the receiver answered with a 2xx status.',
    domains: 'Domains contacted',
    headers: 'Security headers on the main document',
    storage: 'Browser storage',
    noStorage: 'No browser storage keys were observed.',
    cookies: 'Cookies',
    noCookies: 'No cookies were observed.',
    console: 'Console messages',
    noConsole: 'No console errors or warnings were observed.',
    notDone: 'What this scan did not do',
    notCollected: 'Data that was deliberately not collected',
    collectedWith: 'Collected with redaction',
    rawEvidence: (file) => `Raw evidence: \`${file}\`. Every finding above refers to an evidence ID in that file.`,
    observedLabel: 'Observed',
    whyLabel: 'Why it matters',
    actionLabel: 'Recommended action',
    fields: { field: 'field', value: 'value', category: 'Category', status: 'Status', severity: 'Severity', confidence: 'Confidence', evidence: 'Evidence' },
    refsTruncated: (shown, total) => `${shown} of ${total} shown`,
    none: 'none',
    origins: { application: 'application', 'third-party': 'third-party', browser: 'browser (not a site finding)', unclassified: 'unclassified' },
    columns: {
      id: 'ID', status: 'Status', severity: 'Severity', check: 'Check', observed: 'Observed',
      step: 'Step', url: 'URL', evidence: 'Evidence', tracker: 'Tracker', category: 'Category',
      requests: 'Requests', transmissions: 'Transmissions', accepted: 'Accepted', detectedVia: 'Detected via',
      domain: 'Domain', party: 'Party', types: 'Types', header: 'Header', state: 'State',
      store: 'Store', key: 'Key', valueLength: 'Value length', sensitive: 'Sensitive indicator',
      name: 'Name', secure: 'Secure', httpOnly: 'HttpOnly', sameSite: 'SameSite', expires: 'Expires',
      type: 'Type', message: 'Message', source: 'Source', origin: 'Origin'
    },
    present: 'present',
    missing: 'missing',
    coveredBy: (by) => `covered by ${by}`,
    session: 'session',
    dashboard: {
      privacy: 'Privacy', thirdPartyDomains: 'Third-party domains', trackers: 'Trackers',
      transmissions: 'Tracker transmissions', externalRedirects: 'External redirects', storage: 'Browser storage',
      sensitiveStorage: 'Sensitive storage', consoleErrors: 'Console errors', headers: 'Security headers',
      scripts: 'Third-party scripts', overall: 'Overall',
      detected: (n) => `${n} detected`, observedCount: (n) => `${n} observed`, keys: (n) => `${n} ${n === 1 ? 'key' : 'keys'}`,
      indicators: (n) => (n ? `${n} indicator(s)` : 'none observed'), relevant: (n) => `${n} relevant`,
      missingCount: (n) => `${n} missing`, leaves: ' (leaves first party)'
    }
  },
  nl: {
    title: (target) => `Bewijsrapport website: ${target}`,
    scanId: 'Scan-ID',
    observedAt: 'Waargenomen op',
    tool: 'Tool',
    ruleSet: 'Trackerregelset',
    browser: 'Browser',
    verdict: (status) => `Oordeel: ${status}`,
    counts: (f, r, p, t) => `${f} FAIL, ${r} REVIEW, ${p} PASS over ${t} controles.`,
    warning: 'Waarschuwing',
    didNotLoad: (error) => `De pagina laadde niet schoon: \`${error}\`. Behandel het bewijs hieronder als onvolledig.`,
    openFindings: 'Bevindingen die aandacht vragen',
    noOpenFindings: 'Geen bevindingen buiten PASS. Lees eerst de beperkingen voordat je daar conclusies aan verbindt.',
    passedChecks: 'Controles zonder bevinding',
    evidence: 'Bewijs',
    redirectChain: 'Doorverwijzingen',
    noRedirects: 'Er zijn geen navigatieantwoorden waargenomen.',
    trackers: 'Trackers',
    noTrackers:
      'Geen tracker uit de meegeleverde regelset gematcht. De regelset is beperkt, dus dit is geen bewijs dat er niet gevolgd wordt.',
    transmissionNote:
      'Een verzending is een verzoek naar een trackerdomein met methode POST of resourcetype xhr, fetch, ping of beacon. Aangenomen betekent dat de ontvanger met een 2xx-status antwoordde.',
    domains: 'Benaderde domeinen',
    headers: 'Beveiligingsheaders op het hoofddocument',
    storage: 'Browseropslag',
    noStorage: 'Er zijn geen sleutels in de browseropslag waargenomen.',
    cookies: 'Cookies',
    noCookies: 'Er zijn geen cookies waargenomen.',
    console: 'Consoleberichten',
    noConsole: 'Er zijn geen consolefouten of waarschuwingen waargenomen.',
    notDone: 'Wat deze scan niet heeft gedaan',
    notCollected: 'Gegevens die bewust niet zijn verzameld',
    collectedWith: 'Wel verzameld, met redactie',
    rawEvidence: (file) => `Ruw bewijs: \`${file}\`. Elke bevinding hierboven verwijst naar een evidence-ID in dat bestand.`,
    observedLabel: 'Waargenomen',
    whyLabel: 'Waarom dit uitmaakt',
    actionLabel: 'Aanbevolen actie',
    fields: { field: 'veld', value: 'waarde', category: 'Categorie', status: 'Status', severity: 'Ernst', confidence: 'Zekerheid', evidence: 'Bewijs' },
    refsTruncated: (shown, total) => `${shown} van ${total} getoond`,
    none: 'geen',
    origins: { application: 'applicatie', 'third-party': 'externe partij', browser: 'browser (geen sitebevinding)', unclassified: 'ongeclassificeerd' },
    columns: {
      id: 'ID', status: 'Status', severity: 'Ernst', check: 'Controle', observed: 'Waargenomen',
      step: 'Stap', url: 'URL', evidence: 'Bewijs', tracker: 'Tracker', category: 'Categorie',
      requests: 'Verzoeken', transmissions: 'Verzendingen', accepted: 'Aangenomen', detectedVia: 'Herkend via',
      domain: 'Domein', party: 'Partij', types: 'Types', header: 'Header', state: 'Staat',
      store: 'Opslag', key: 'Sleutel', valueLength: 'Lengte waarde', sensitive: 'Gevoelige aanwijzing',
      name: 'Naam', secure: 'Secure', httpOnly: 'HttpOnly', sameSite: 'SameSite', expires: 'Verloopt',
      type: 'Type', message: 'Bericht', source: 'Bron', origin: 'Herkomst'
    },
    present: 'aanwezig',
    missing: 'ontbreekt',
    coveredBy: (by) => `gedekt door ${by}`,
    session: 'sessie',
    dashboard: {
      privacy: 'Privacy', thirdPartyDomains: 'Externe domeinen', trackers: 'Trackers',
      transmissions: 'Trackerverzendingen', externalRedirects: 'Externe doorverwijzingen', storage: 'Browseropslag',
      sensitiveStorage: 'Gevoelige opslag', consoleErrors: 'Consolefouten', headers: 'Beveiligingsheaders',
      scripts: 'Externe scripts', overall: 'Totaal',
      detected: (n) => `${n} waargenomen`, observedCount: (n) => `${n} waargenomen`, keys: (n) => `${n} ${n === 1 ? 'sleutel' : 'sleutels'}`,
      indicators: (n) => (n ? `${n} aanwijzing(en)` : 'geen waargenomen'), relevant: (n) => `${n} relevant`,
      missingCount: (n) => `${n} ${n === 1 ? 'ontbreekt' : 'ontbreken'}`, leaves: ' (verlaat eigen domein)'
    }
  }
};

const pickLang = (lang) => (T[lang] ? lang : 'en');

function dashboard(evidence, assessment, t) {
  const s = evidence.summary;
  const c = assessment.byCategory;
  const d = t.dashboard;
  const rows = [
    [d.privacy, c.privacy ? c.privacy.status : 'n/a'],
    [d.thirdPartyDomains, d.detected(s.thirdPartyDomains)],
    [d.trackers, d.detected(s.trackersDetected)],
    [d.transmissions, d.observedCount(s.trackerTransmissions ?? 0)],
    [d.externalRedirects, `${s.externalRedirectsObserved ? d.observedCount(s.redirectHops) + d.leaves : d.observedCount(0)}`],
    [d.storage, d.keys(s.browserStorageKeys)],
    [d.sensitiveStorage, d.indicators(s.sensitiveStorageIndicators)],
    [d.consoleErrors, d.relevant(s.consoleErrors)],
    [d.headers, d.missingCount(s.securityHeadersMissing)],
    [d.scripts, `${s.thirdPartyScripts}`],
    [d.overall, assessment.overall]
  ];
  const width = Math.max(...rows.map((r) => r[0].length));
  return ['```text', ...rows.map(([k, v]) => `${k.padEnd(width)}  ${v}`), '```'].join('\n');
}

function refsCell(finding, t) {
  if (!finding.evidenceRefs.length) return t.none;
  const list = finding.evidenceRefs.join(', ');
  return finding.evidenceRefsTruncated
    ? `${list} (${t.refsTruncated(finding.evidenceRefs.length, finding.evidenceRefsTotal)})`
    : list;
}

function findingBlock(finding, t) {
  const f = t.fields;
  const lines = [
    `### ${finding.findingId} ${finding.status} ${finding.check}`,
    '',
    `| ${f.field} | ${f.value} |`,
    '| --- | --- |',
    `| ${f.category} | ${finding.category} |`,
    `| ${f.status} | ${finding.status} |`,
    `| ${f.severity} | ${finding.severity} |`,
    `| ${f.confidence} | ${finding.confidence} |`,
    `| ${f.evidence} | ${refsCell(finding, t)} |`,
    '',
    `**${t.observedLabel}.** ${finding.observedResult}`
  ];
  if (finding.explanation) lines.push('', `**${t.whyLabel}.** ${finding.explanation}`);
  if (finding.recommendedAction) lines.push('', `**${t.actionLabel}.** ${finding.recommendedAction}`);
  return lines.join('\n');
}

export function renderConsultantReport(evidence, assessment, options = {}) {
  const lang = pickLang(options.lang || assessment.language || 'en');
  const t = T[lang];
  const col = t.columns;
  const scan = evidence.scan;
  const target = scan.target.finalUrl || scan.target.inputUrl;
  const open = sortFindings(assessment.findings.filter((f) => f.status !== 'PASS'));
  const passed = assessment.findings.filter((f) => f.status === 'PASS');

  const out = [];
  out.push(`# ${t.title(target)}`);
  out.push('');
  out.push(`${t.scanId}: \`${scan.scanId}\`  `);
  out.push(`${t.observedAt}: ${scan.startedAt}  `);
  out.push(`${t.tool}: ${scan.tool.name} v${scan.tool.version}  `);
  out.push(`${t.ruleSet}: ${scan.rules.trackerRuleSet} v${scan.rules.trackerRuleSetVersion}  `);
  out.push(
    `${t.browser}: ${scan.browserName} ${scan.browserVersion || ''} (${scan.headless ? 'headless' : 'headed'}), viewport ${scan.viewport.width}x${scan.viewport.height}`
  );
  out.push('');
  out.push(`## ${t.verdict(assessment.overall)}`);
  out.push('');
  out.push(dashboard(evidence, assessment, t));
  out.push('');
  out.push(t.counts(assessment.counts.fail, assessment.counts.review, assessment.counts.pass, assessment.counts.total));
  out.push('');
  out.push(`> ${PASS_MEANING[lang] || PASS_MEANING.en}`);
  out.push('');

  if (scan.navigationError) {
    out.push(`## ${t.warning}`);
    out.push('');
    out.push(t.didNotLoad(scan.navigationError));
    out.push('');
  }

  out.push(`## ${t.openFindings}`);
  out.push('');
  if (!open.length) {
    out.push(t.noOpenFindings);
  } else {
    out.push(`| ${col.id} | ${col.status} | ${col.severity} | ${col.check} |`);
    out.push('| --- | --- | --- | --- |');
    for (const f of open) out.push(`| ${f.findingId} | ${f.status} | ${f.severity} | ${f.check} |`);
    out.push('');
    for (const f of open) {
      out.push(findingBlock(f, t));
      out.push('');
    }
  }

  out.push(`## ${t.passedChecks}`);
  out.push('');
  out.push(`| ${col.id} | ${col.check} | ${col.observed} |`);
  out.push('| --- | --- | --- |');
  for (const f of passed) out.push(`| ${f.findingId} | ${f.check} | ${f.observedResult} |`);
  out.push('');

  out.push(`## ${t.evidence}`);
  out.push('');
  out.push(`### ${t.redirectChain}`);
  out.push('');
  if (!evidence.evidence.redirects.chain.length) {
    out.push(t.noRedirects);
  } else {
    out.push(`| ${col.step} | ${col.status} | ${col.url} | ${col.evidence} |`);
    out.push('| --- | --- | --- | --- |');
    for (const step of evidence.evidence.redirects.chain) {
      out.push(`| ${step.step} | ${step.status} | ${step.url} | ${step.evidenceRef} |`);
    }
  }
  out.push('');

  out.push(`### ${t.trackers}`);
  out.push('');
  if (!evidence.evidence.trackers.length) {
    out.push(t.noTrackers);
  } else {
    out.push(
      `| ${col.tracker} | ${col.category} | ${col.requests} | ${col.transmissions} | ${col.accepted} | ${col.detectedVia} | ${col.evidence} |`
    );
    out.push('| --- | --- | --- | --- | --- | --- | --- |');
    for (const tracker of evidence.evidence.trackers) {
      const tx = tracker.transmissions || { count: 0, accepted: 0, evidenceRefs: [] };
      const refs = tx.evidenceRefs.length ? tx.evidenceRefs.join(', ') : tracker.evidenceRefs.join(', ');
      out.push(
        `| ${tracker.name} | ${tracker.category} | ${tracker.requestCount} | ${tx.count} | ${tx.accepted} | ${tracker.detectedVia} | ${refs} |`
      );
    }
    out.push('');
    out.push(t.transmissionNote);
  }
  out.push('');

  out.push(`### ${t.domains}`);
  out.push('');
  out.push(`| ${col.domain} | ${col.party} | ${col.requests} | ${col.types} | ${col.tracker} |`);
  out.push('| --- | --- | --- | --- | --- |');
  for (const d of evidence.evidence.domains) {
    out.push(`| ${d.domain} | ${d.party} | ${d.requestCount} | ${d.resourceTypes.join(', ')} | ${d.tracker ? d.tracker.name : ''} |`);
  }
  out.push('');

  out.push(`### ${t.headers}`);
  out.push('');
  out.push(`| ${col.header} | ${col.state} | ${t.fields.value} |`);
  out.push('| --- | --- | --- |');
  for (const h of evidence.evidence.securityHeaders.present) {
    out.push(`| ${h.header} | ${t.present} | ${h.coveredBy ? t.coveredBy(h.coveredBy) : escapePipes(truncate(h.value, 400))} |`);
  }
  for (const h of evidence.evidence.securityHeaders.missing) {
    out.push(`| ${h.header} | ${t.missing} | ${h.note || ''} |`);
  }
  out.push('');

  out.push(`### ${t.storage}`);
  out.push('');
  const storageRows = [
    ...evidence.evidence.storage.localStorage.map((s) => ({ ...s, store: 'localStorage' })),
    ...evidence.evidence.storage.sessionStorage.map((s) => ({ ...s, store: 'sessionStorage' }))
  ];
  if (!storageRows.length) {
    out.push(t.noStorage);
  } else {
    out.push(`| ${col.store} | ${col.key} | ${col.valueLength} | ${col.sensitive} | ${col.evidence} |`);
    out.push('| --- | --- | --- | --- | --- |');
    for (const s of storageRows) {
      out.push(`| ${s.store} | ${s.key} | ${s.valueLength} | ${s.sensitiveIndicator ? s.sensitiveKeyMatches.join(', ') : ''} | ${s.id} |`);
    }
  }
  out.push('');

  out.push(`### ${t.cookies}`);
  out.push('');
  if (!evidence.evidence.cookies.length) {
    out.push(t.noCookies);
  } else {
    out.push(
      `| ${col.name} | ${col.domain} | ${col.party} | ${col.secure} | ${col.httpOnly} | ${col.sameSite} | ${col.expires} | ${col.tracker} | ${col.evidence} |`
    );
    out.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const c of evidence.evidence.cookies) {
      out.push(
        `| ${c.name} | ${c.domain} | ${c.party} | ${c.secure} | ${c.httpOnly} | ${c.sameSite} | ${c.session ? t.session : c.expiresIso} | ${c.tracker ? c.tracker.name : ''} | ${c.id} |`
      );
    }
  }
  out.push('');

  out.push(`### ${t.console}`);
  out.push('');
  const consoleRows = [
    ...evidence.evidence.console.relevant,
    ...evidence.evidence.console.pageErrors.map((e) => ({ ...e, type: 'pageerror' }))
  ];
  if (!consoleRows.length) {
    out.push(t.noConsole);
  } else {
    out.push(`| ${col.id} | ${col.type} | ${col.message} | ${col.source} | ${col.origin} |`);
    out.push('| --- | --- | --- | --- | --- |');
    for (const m of consoleRows) {
      const originLabel = t.origins[m.origin] || m.origin || '';
      out.push(`| ${m.id} | ${m.type} | ${escapePipes(m.text)} | ${m.source || ''} | ${originLabel} |`);
    }
  }
  out.push('');

  out.push(`## ${t.notDone}`);
  out.push('');
  for (const limitation of assessment.limitations) out.push(`- ${limitation}`);
  out.push('');

  out.push(`## ${t.notCollected}`);
  out.push('');
  for (const item of evidence.scan.privacy.neverCollected) out.push(`- ${item}`);
  out.push('');
  out.push(`${t.collectedWith}: ${evidence.scan.privacy.collectedWithRedaction.join(', ')}.`);
  out.push('');
  out.push(t.rawEvidence('evidence.json'));
  out.push('');
  return out.join('\n');
}

function truncate(value, max) {
  if (!value) return '';
  const clean = String(value).replace(/\s+/g, ' ');
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

function escapePipes(value) {
  return String(value || '').replace(/\|/g, '\\|');
}
