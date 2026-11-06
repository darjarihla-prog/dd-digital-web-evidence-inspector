/**
 * Assessment layer.
 *
 * Applies the deterministic rule set to an evidence document and produces
 * findings. The evidence document is never modified: interpretation is kept in
 * a separate artefact so a consultant can always go back to what was literally
 * observed.
 */
import { RULES, STATUS, worstStatus } from './rules/index.js';
import { renderMessage, renderLimitations } from './rules/messages.js';

export const ASSESSMENT_SCHEMA_VERSION = '0.1.0';

export const PASS_MEANING = {
  en: 'PASS means that no relevant finding was observed within the checks that were actually performed. It does not mean the website is secure.',
  nl: 'PASS betekent dat binnen de uitgevoerde controles geen relevante bevinding is waargenomen. Het betekent niet dat de website veilig is.'
};

const STATUS_MEANING = {
  en: {
    PASS: PASS_MEANING.en,
    REVIEW: 'REVIEW means something was observed that requires a judgement in the context of this organisation.',
    FAIL: 'FAIL means something was observed that is wrong in almost any context.'
  },
  nl: {
    PASS: PASS_MEANING.nl,
    REVIEW: 'REVIEW betekent dat er iets is waargenomen dat beoordeling vraagt in de context van deze organisatie.',
    FAIL: 'FAIL betekent dat er iets is waargenomen dat in vrijwel elke context onjuist is.'
  }
};

export function assess(evidence, { rules = RULES, lang = 'en' } = {}) {
  const findings = rules.map((rule) => {
    const result = rule.evaluate(evidence);
    const text = renderMessage(rule.messageId, result.outcome, result.data, lang);
    return {
      findingId: rule.id,
      category: rule.category,
      check: text.check,
      status: result.status,
      severity: result.severity,
      confidence: result.confidence,
      outcome: result.outcome,
      observedResult: text.observed,
      evidenceRefs: result.evidenceRefs || [],
      evidenceRefsTotal: result.evidenceRefsTotal ?? (result.evidenceRefs || []).length,
      evidenceRefsTruncated: Boolean(result.evidenceRefsTruncated),
      explanation: text.explanation,
      recommendedAction: text.action
    };
  });

  const byCategory = {};
  for (const finding of findings) {
    byCategory[finding.category] = byCategory[finding.category] || { status: STATUS.PASS, findingIds: [] };
    byCategory[finding.category].findingIds.push(finding.findingId);
    byCategory[finding.category].status = worstStatus([byCategory[finding.category].status, finding.status]);
  }

  const overall = worstStatus(findings.map((f) => f.status));
  const open = findings.filter((f) => f.status !== STATUS.PASS);

  return {
    schema: { name: 'darja-rihla-assessment', version: ASSESSMENT_SCHEMA_VERSION },
    scanId: evidence.scan.scanId,
    language: lang,
    target: evidence.scan.target,
    generatedAt: new Date().toISOString(),
    ruleSet: { rules: rules.length, ruleIds: rules.map((r) => r.id) },
    statusMeaning: STATUS_MEANING[lang] || STATUS_MEANING.en,
    overall,
    byCategory,
    counts: {
      total: findings.length,
      pass: findings.filter((f) => f.status === STATUS.PASS).length,
      review: findings.filter((f) => f.status === STATUS.REVIEW).length,
      fail: findings.filter((f) => f.status === STATUS.FAIL).length,
      highSeverityOpen: open.filter((f) => f.severity === 'high').length
    },
    findings,
    limitations: renderLimitations(evidence.limitations, lang)
  };
}

const ORDER = { FAIL: 0, REVIEW: 1, PASS: 2 };
const SEVERITY_ORDER = { high: 0, medium: 1, low: 2, info: 3 };

export function sortFindings(findings) {
  return [...findings].sort(
    (a, b) =>
      ORDER[a.status] - ORDER[b.status] ||
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.findingId.localeCompare(b.findingId)
  );
}
