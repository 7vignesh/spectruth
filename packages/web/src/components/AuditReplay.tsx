import { useEffect, useMemo, useRef, useState } from 'react';
import { useReveal } from '../lib/useReveal';

type Tone =
  | 'plain'
  | 'muted'
  | 'faint'
  | 'label'
  | 'supported'
  | 'unsupported'
  | 'prompt';

interface Seg {
  t: string;
  tone?: Tone;
}

const TONE_CLASS: Record<Tone, string> = {
  plain: 'text-text',
  muted: 'text-text-muted',
  faint: 'text-text-faint',
  label: 'text-text-faint',
  supported: 'text-supported',
  unsupported: 'text-unsupported',
  prompt: 'text-brand',
};

/** Real output, copied from a verified run rather than mocked up. */
const BLOCKED: Seg[][] = [
  [{ t: '$ ', tone: 'faint' }, { t: 'npx spectruth@latest', tone: 'prompt' }],
  [],
  [{ t: 'SpecTruth — Done Integrity' }],
  [],
  [
    { t: 'Task 2  Enforce record ownership on delete' },
    { t: '   ← marked complete', tone: 'faint' },
  ],
  [],
  [{ t: '  REQ-1-AC-2   ' }, { t: 'UNSUPPORTED', tone: 'unsupported' }],
  [
    { t: '    required  ', tone: 'label' },
    { t: 'WHEN a user requests to delete a record they do not own', tone: 'muted' },
  ],
  [{ t: '              THEN the system SHALL refuse and return 403', tone: 'muted' }],
  [
    { t: '    found     ', tone: 'label' },
    { t: 'src/records.js:16  Found DELETE route definition', tone: 'muted' },
  ],
  [
    { t: '    missing   ', tone: 'label' },
    { t: 'Status code 403 not found in relevant code', tone: 'unsupported' },
  ],
  [],
  [{ t: 'SHIP DECISION  ' }, { t: 'BLOCKED', tone: 'unsupported' }],
  [{ t: '1 criterion checked: 1 unsupported', tone: 'faint' }],
  [{ t: 'Verdict computed from static evidence only. No model was used.', tone: 'faint' }],
  [],
  [{ t: 'Repair preview available: RP-7101b5d9', tone: 'muted' }],
  [
    {
      t: 'Nothing has been changed. Approve a preview to authorize that repair.',
      tone: 'faint',
    },
  ],
];

const READY: Seg[][] = [
  [
    { t: '$ ', tone: 'faint' },
    { t: 'npx spectruth@latest --task 2', tone: 'prompt' },
  ],
  [],
  [{ t: 'SpecTruth — Done Integrity' }],
  [],
  [
    { t: 'Task 2  Enforce record ownership on delete' },
    { t: '   ← marked complete', tone: 'faint' },
  ],
  [],
  [{ t: '  REQ-1-AC-2   ' }, { t: 'SUPPORTED', tone: 'supported' }],
  [
    { t: '    required  ', tone: 'label' },
    { t: 'WHEN a user requests to delete a record they do not own', tone: 'muted' },
  ],
  [{ t: '              THEN the system SHALL refuse and return 403', tone: 'muted' }],
  [
    { t: '    found     ', tone: 'label' },
    { t: 'src/records.js:14  Status code 403 found in code', tone: 'supported' },
  ],
  [],
  [{ t: 'SHIP DECISION  ' }, { t: 'READY', tone: 'supported' }],
  [{ t: '1 criterion checked: 1 supported', tone: 'faint' }],
  [{ t: 'Verdict computed from static evidence only. No model was used.', tone: 'faint' }],
];

type Phase = 'blocked' | 'ready';

const LINE_MS = 95;

export function AuditReplay() {
  const { ref, visible } = useReveal<HTMLDivElement>();
  const [phase, setPhase] = useState<Phase>('blocked');
  const [shown, setShown] = useState(0);
  const timers = useRef<number[]>([]);

  const lines = useMemo(() => (phase === 'blocked' ? BLOCKED : READY), [phase]);

  // Play the lines out once the block is on screen, then pause on the verdict.
  useEffect(() => {
    if (!visible) return;

    setShown(0);
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];

    lines.forEach((_, index) => {
      const id = window.setTimeout(() => setShown(index + 1), index * LINE_MS);
      timers.current.push(id);
    });

    return () => {
      for (const id of timers.current) window.clearTimeout(id);
      timers.current = [];
    };
  }, [visible, lines]);

  const done = shown >= lines.length;

  return (
    <div ref={ref} className="reveal" data-visible={visible}>
      <div className="overflow-hidden rounded-xl border border-edge bg-ink-card shadow-2xl shadow-black/40">
        {/* window chrome */}
        <div className="flex items-center gap-2 border-b border-edge bg-ink-raised px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-edge-bright" />
          <span className="h-2.5 w-2.5 rounded-full bg-edge-bright" />
          <span className="h-2.5 w-2.5 rounded-full bg-edge-bright" />
          <span className="ml-2 font-mono text-sm text-text-faint">
            {phase === 'blocked' ? 'the claim is false' : 'after an approved repair'}
          </span>
        </div>

        <pre className="overflow-x-auto px-5 py-6 font-mono text-sm leading-[1.7] sm:px-7 sm:text-[15px]">
          <code>
            {lines.slice(0, shown).map((segments, index) => (
              <div
                key={`${phase}-${index}`}
                className="line-in"
                style={{ animationDelay: '0ms' }}
              >
                {segments.length === 0
                  ? '\u00A0'
                  : segments.map((seg, segIndex) => (
                      <span key={segIndex} className={TONE_CLASS[seg.tone ?? 'plain']}>
                        {seg.t}
                      </span>
                    ))}
              </div>
            ))}
            {!done && <span className="caret text-text">▋</span>}
          </code>
        </pre>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-edge bg-ink-raised px-5 py-4 sm:px-7">
          <p className="font-mono text-sm text-text-faint">
            {phase === 'blocked'
              ? 'The route exists. The ownership check does not.'
              : 'The gap closed, and a re-audit confirmed it.'}
          </p>
          <button
            type="button"
            onClick={() => setPhase(phase === 'blocked' ? 'ready' : 'blocked')}
            className="rounded-md border border-edge px-3.5 py-2 font-mono text-sm text-text-muted transition-colors hover:border-brand hover:text-brand"
          >
            {phase === 'blocked' ? 'approve the repair →' : '← back to the claim'}
          </button>
        </div>
      </div>
    </div>
  );
}
