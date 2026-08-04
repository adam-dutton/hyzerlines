import { useState } from 'react';
import { Panel, cn } from '@hyzerlines/design';
import type { Finding } from '@hyzerlines/core';

/**
 * Design findings.
 *
 * Advisory, never prescriptive: every rule can be silenced, because designers
 * break guidelines deliberately and a tool that nags is a tool that gets
 * switched off entirely.
 *
 * Collapsed to a single count by default. A permanently expanded list of things
 * that are "wrong" with an in-progress course is demoralising and quickly
 * ignored — the count is enough to notice, and the detail is one click away.
 */

const severityStyles = {
  error: 'text-status-danger',
  warning: 'text-status-warning',
  info: 'text-text-muted',
} as const;

function Dot({ severity }: { severity: Finding['severity'] }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-current',
        severityStyles[severity],
      )}
    />
  );
}

export function FindingsList({
  findings,
  onReveal,
  onDismissRule,
}: {
  findings: readonly Finding[];
  /** Frame whatever the finding points at. */
  onReveal: (finding: Finding) => void;
  onDismissRule: (ruleId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (findings.length === 0) return null;

  const errors = findings.filter((f) => f.severity === 'error').length;
  const worst = errors > 0 ? 'error' : findings[0]!.severity;

  return (
    <Panel
      as="section"
      elevation="raised"
      padding="none"
      className="flex max-h-72 shrink-0 flex-col overflow-hidden"
      aria-label="Design notes"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full shrink-0 items-center gap-2 px-3 py-2 text-left transition-colors duration-fast hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <Dot severity={worst} />
        <span className="flex-1 text-xs text-text-primary">
          {findings.length} {findings.length === 1 ? 'note' : 'notes'}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden="true"
          className={cn(
            'text-text-muted transition-transform duration-fast',
            open && 'rotate-180',
          )}
        >
          <path
            d="M2 4l3 3 3-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <ul className="min-h-0 flex-1 overflow-y-auto border-t border-border-subtle">
          {findings.map((finding, i) => (
            <li
              key={`${finding.ruleId}-${finding.featureId ?? finding.holeId ?? i}`}
              className="border-b border-border-subtle last:border-b-0"
            >
              <div className="flex items-start gap-2 px-3 py-2">
                <Dot severity={finding.severity} />
                <div className="min-w-0 flex-1">
                  {/* A course-wide finding has nothing to frame, so it is plain
                      text rather than a button that would do nothing. */}
                  {finding.featureId || finding.holeId ? (
                    <button
                      type="button"
                      onClick={() => onReveal(finding)}
                      className="text-left text-2xs leading-4 text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                    >
                      {finding.message}
                    </button>
                  ) : (
                    <p className="text-2xs leading-4 text-text-secondary">{finding.message}</p>
                  )}

                  {/* Where the rule's authority comes from. A designer should
                      know whether they are being told a fact about their own
                      document or a published standard — and if it is a
                      standard, exactly which revision, because they may be
                      about to quote it to a parks department. */}
                  {finding.source && (
                    <p className="mt-0.5 text-2xs text-text-muted">
                      {finding.docUrl ? (
                        <a
                          href={finding.docUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline-offset-2 hover:text-text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                        >
                          {finding.source}
                        </a>
                      ) : (
                        finding.source
                      )}
                      {finding.revision && ` · ${finding.revision}`}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => onDismissRule(finding.ruleId)}
                    className="mt-1 text-2xs text-text-muted underline-offset-2 hover:text-text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    Ignore this check
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
