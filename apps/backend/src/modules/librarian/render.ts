import {
  type Assertion,
  BRAIN_TREE,
  type DocumentPath,
  KIND_PLACEMENT,
  LifeArea,
  type StructuredMemory,
} from '@bob/contracts';
import { compareIds, isActive } from './memory.js';

export type RenderMeta = {
  version: number;
  sourceWatermark: number;
  /** Snapshot time; also the "as of" date for review flags, so rendering stays deterministic. */
  asOf: string;
};

type Section = {
  title: string;
  intro: string;
  /** Heading for superseded items; experience is history already, so it keeps retired items. */
  retiredTitle: string;
};

const SECTIONS: Record<Exclude<DocumentPath, 'overview.md' | 'evidence/sources.md'>, Section> = {
  'situation/current.md': {
    title: 'Situation: now',
    intro:
      "What is true in the customer's life now: circumstances, commitments, constraints and active transitions. Reviewed often.",
    retiredTitle: 'Previously true',
  },
  'situation/goals.md': {
    title: 'Situation: goals and intent',
    intro:
      'Outcomes the customer wants, with deadlines and progress. Only customer-expressed or confirmed intent; proposed help is not a goal.',
    retiredTitle: 'Closed or withdrawn',
  },
  'personality/preferences.md': {
    title: 'Personality: preferences and values',
    intro:
      'How the customer tends to choose and act, stated in context. Interpretations are marked as inferred.',
    retiredTitle: 'No longer holds',
  },
  'personality/communication.md': {
    title: 'Personality: communication',
    intro: 'How the customer prefers to be contacted and helped.',
    retiredTitle: 'No longer holds',
  },
  'experience/history.md': {
    title: 'Experience: history',
    intro: 'Significant events, previous decisions and their outcomes.',
    retiredTitle: 'Corrected or withdrawn',
  },
  'experience/interactions.md': {
    title: 'Experience: interactions',
    intro: 'Interactions with the service: feedback, accepted and rejected help.',
    retiredTitle: 'Corrected or withdrawn',
  },
};

const AREA_TITLE: Record<LifeArea, string> = {
  home: 'Home',
  work: 'Work',
  household: 'Household',
  finances: 'Finances',
  banking: 'Banking',
  health: 'Health',
  mobility: 'Mobility',
  education: 'Education',
  leisure: 'Leisure',
  other: 'Other',
};

const EMPTY = '_Nothing recorded yet._';
const date = (instant: string) => instant.slice(0, 10);
/** Keeps supplied text from forming Markdown structure (headings, tables, HTML). */
const inline = (text: string) =>
  text
    .replace(/\s+/g, ' ')
    .replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;'))
    .replace(/\|/g, '\\|')
    .trim();

function evidenceLine(a: Assertion, memory: StructuredMemory) {
  const ledger = new Map(memory.evidence.map((e) => [e.sequence, e]));
  return a.evidence
    .map((r) => {
      const e = ledger.get(r.sequence);
      return e ? `#${r.sequence} (${e.event_type}, ${date(e.occurred_at)})` : `#${r.sequence}`;
    })
    .join(', ');
}

function renderAssertion(a: Assertion, memory: StructuredMemory, asOf: string) {
  const title = a.status === 'retired' ? `~~${inline(a.statement)}~~` : inline(a.statement);
  const lines = [`### ${title}`, '', `- ID: ${a.id}`, `- Kind: ${a.kind}`, `- Status: ${a.status}`];
  if (a.goal_state) lines.push(`- Goal state: ${a.goal_state}`);
  if (a.target_date) lines.push(`- Target date: ${a.target_date}`);
  if (a.context) lines.push(`- Context: ${inline(a.context)}`);
  if (a.tag) lines.push(`- Tag: \`${a.tag}\``);
  if (a.valid_from) lines.push(`- Valid from: ${a.valid_from}`);
  if (a.valid_until) lines.push(`- Valid until: ${a.valid_until}`);
  if (a.review_after && a.status !== 'retired') {
    const due = a.review_after <= date(asOf) ? ' (due)' : '';
    lines.push(`- Review after: ${a.review_after}${due}`);
  }
  lines.push(`- Evidence: ${evidenceLine(a, memory)}`);
  if (a.related_ids?.length) lines.push(`- Related: ${a.related_ids.join(', ')}`);
  if (a.retired_at) {
    lines.push(`- Retired: ${date(a.retired_at)}: ${inline(a.retired_reason ?? '')}`);
  }
  lines.push(`- Recorded: ${date(a.recorded_at)}; updated: ${date(a.updated_at)}`);
  return lines.join('\n');
}

function byArea(items: Assertion[], memory: StructuredMemory, asOf: string) {
  const out: string[] = [];
  for (const area of LifeArea.options) {
    const inArea = items.filter((a) => a.area === area).sort(compareIds);
    if (inArea.length === 0) continue;
    out.push(`## ${AREA_TITLE[area]}`, '');
    for (const a of inArea) out.push(renderAssertion(a, memory, asOf), '');
  }
  return out;
}

function header(title: string, intro: string, meta: RenderMeta) {
  return [
    `# ${title}`,
    '',
    `> ${intro}`,
    '',
    `Brain version ${meta.version} · sources through #${meta.sourceWatermark} · as of ${date(meta.asOf)}`,
    '',
  ];
}

function renderSection(path: keyof typeof SECTIONS, memory: StructuredMemory, meta: RenderMeta) {
  const section = SECTIONS[path];
  const mine = memory.assertions.filter((a) => KIND_PLACEMENT[a.kind].document === path);
  const active = mine.filter(isActive);
  const retired = mine.filter((a) => !isActive(a));
  const out = header(section.title, section.intro, meta);
  if (active.length === 0) out.push(EMPTY, '');
  else out.push(...byArea(active, memory, meta.asOf));
  if (retired.length > 0) {
    out.push(`## ${section.retiredTitle}`, '');
    for (const a of retired.sort(compareIds)) out.push(renderAssertion(a, memory, meta.asOf), '');
  }
  return `${out.join('\n').trimEnd()}\n`;
}

function renderOverview(memory: StructuredMemory, meta: RenderMeta) {
  const out = header(
    'Customer overview',
    'Generated from the documents below; facts are maintained there, never here.',
    meta,
  );
  out.push('## Summary', '', memory.summary ? inline(memory.summary) : EMPTY, '');

  const today = date(meta.asOf);
  out.push('## Contents', '', '| Document | Active | Needs review |', '|---|---|---|');
  for (const { documents } of BRAIN_TREE) {
    for (const path of documents) {
      if (path === 'overview.md' || path === 'evidence/sources.md') continue;
      const active = memory.assertions.filter(
        (a) => isActive(a) && KIND_PLACEMENT[a.kind].document === path,
      );
      const due = active.filter((a) => a.review_after && a.review_after <= today).length;
      out.push(`| [${path}](${path}) | ${active.length} | ${due} |`);
    }
  }
  out.push(
    `| [evidence/sources.md](evidence/sources.md) | ${memory.evidence.length} sources | |`,
    '',
  );

  const goals = memory.assertions
    .filter((a) => isActive(a) && a.kind === 'goal' && a.goal_state !== 'achieved')
    .sort(compareIds);
  out.push('## Open goals', '');
  if (goals.length === 0) out.push(EMPTY);
  for (const g of goals) {
    const target = g.target_date ? `, target ${g.target_date}` : '';
    out.push(`- ${inline(g.statement)} (${g.id}, ${g.goal_state ?? 'open'}${target})`);
  }
  out.push('');

  const due = memory.assertions
    .filter((a) => isActive(a) && a.review_after && a.review_after <= today)
    .sort(compareIds);
  out.push('## Needs review', '');
  if (due.length === 0) out.push('_Nothing due._');
  for (const a of due)
    out.push(`- ${a.id}: ${inline(a.statement)} (review after ${a.review_after})`);
  return `${out.join('\n').trimEnd()}\n`;
}

function renderEvidence(memory: StructuredMemory, meta: RenderMeta) {
  const out = header(
    'Evidence: sources',
    'Source events incorporated into this memory. Original payloads are kept separately and are available through the events API.',
    meta,
  );
  if (memory.evidence.length === 0) return `${[...out, EMPTY].join('\n')}\n`;
  const supports = new Map<number, string[]>();
  for (const a of [...memory.assertions].sort(compareIds)) {
    for (const r of a.evidence)
      supports.set(r.sequence, [...(supports.get(r.sequence) ?? []), a.id]);
  }
  out.push('| # | Type | Source | Occurred | Received | Corrects | Supports | Event ID |');
  out.push('|---|---|---|---|---|---|---|---|');
  const bySequence = new Map(memory.evidence.map((e) => [e.event_id, e.sequence]));
  for (const e of memory.evidence) {
    const corrects = e.corrects_event_id ? `#${bySequence.get(e.corrects_event_id) ?? '?'}` : '';
    out.push(
      `| ${e.sequence} | ${inline(e.event_type)} | ${inline(e.source)} | ${date(e.occurred_at)} | ${date(e.received_at)} | ${corrects} | ${(supports.get(e.sequence) ?? []).join(', ')} | \`${e.event_id}\` |`,
    );
  }
  return `${out.join('\n')}\n`;
}

/** Renders every canonical document. Same memory and meta always yield identical Markdown. */
export function renderDocuments(
  memory: StructuredMemory,
  meta: RenderMeta,
): Record<DocumentPath, string> {
  return {
    'overview.md': renderOverview(memory, meta),
    'situation/current.md': renderSection('situation/current.md', memory, meta),
    'situation/goals.md': renderSection('situation/goals.md', memory, meta),
    'personality/preferences.md': renderSection('personality/preferences.md', memory, meta),
    'personality/communication.md': renderSection('personality/communication.md', memory, meta),
    'experience/history.md': renderSection('experience/history.md', memory, meta),
    'experience/interactions.md': renderSection('experience/interactions.md', memory, meta),
    'evidence/sources.md': renderEvidence(memory, meta),
  };
}

/** All documents as one Markdown bundle, in tree order: the form a model or reader loads. */
export function bundleDocuments(documents: Record<string, string>) {
  return BRAIN_TREE.flatMap((f) => f.documents)
    .filter((path) => documents[path] !== undefined)
    .map((path) => `<!-- file: ${path} -->\n${documents[path]}`)
    .join('\n');
}
