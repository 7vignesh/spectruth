import { useEffect, useRef, useState } from 'react';
import { useReveal } from '../lib/useReveal';

/**
 * Animated audit report for the hero section.
 *
 * Tells the full product story in ~10 seconds:
 *   Task marked complete → findings → BLOCKED → repair approved → READY
 *
 * Uses CSS transitions and timers rather than an animation library, matching
 * the existing approach in the codebase.
 */

type Tone = 'plain' | 'muted' | 'faint' | 'label' | 'supported' | 'partial' | 'unsupported' | 'unverified' | 'prompt';

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
  partial: 'text-partial',
  unsupported: 'text-unsupported',
  unverified: 'text-unverified',
  prompt: 'text-brand',
};

const PHASE_BLOCKED: Seg[][] = [
  [{ t: 'SpecTruth — Done Integrity', tone: 'faint' }],
  [],
  [{ t: 'Task 2  ' }, { t: 'Enforce record ownership on delete', tone: 'plain' }],
  [{ t: '        marked complete by Kiro', tone: 'faint' }],
  [],
  [{ t: '  REQ-1-AC-2   ' }, { t: 'UNSUPPORTED', tone: 'unsupported' }],
  [{ t: '    required  ', tone: 'label' }, { t: 'WHEN a user deletes a record they do not own', tone: 'muted' }],
  [{ t: '              THEN the system SHALL return 403', tone: 'muted' }],
  [{ t: '    found     ', tone: 'label' }, { t: 'src/records.js:16  DELETE route definition', tone: 'muted' }],
  [{ t: '    missing   ', tone: 'label' }, { t: 'Status code 403 not found in relevant code', tone: 'unsupported' }],
  [],
  [{ t: '  SHIP DECISION  ' }, { t: 'BLOCKED', tone: 'unsupported' }],
  [{ t: '  Verdict computed from static evidence only.', tone: 'faint' }],
  [],
  [{ t: '  Repair preview available: ', tone: 'muted' }, { t: 'RP-7101b5d9', tone: 'plain' }],
];

const PHASE_REPAIR: Seg[][] = [
  [],
  [{ t: '  Repair approved. Applying...', tone: 'muted' }],
  [{ t: '  Re-running audit...', tone: 'faint' }],
];

const PHASE_READY: Seg[][] = [
  [],
  [{ t: '  REQ-1-AC-2   ' }, { t: 'SUPPORTED', tone: 'supported' }],
  [{ t: '    found     ', tone: 'label' }, { t: 'src/records.js:14  Status code 403 found', tone: 'supported' }],
  [],
  [{ t: '  SHIP DECISION  ' }, { t: 'BLOCKED → READY', tone: 'supported' }],
];

const LINE_MS = 110;
const PAUSE_BEFORE_REPAIR = 2200;
const PAUSE_BEFORE_READY = 1400;
const PAUSE_BEFORE_RESTART = 4000;

type AnimPhase = 'blocked' | 'repair' | 'ready' | 'done';

export function HeroAuditReport() {
  const { ref, visible } = useReveal<HTMLDivElement>();
  const [lines, setLines] = useState<Seg[][]>([]);
  const [phase, setPhase] = useState<AnimPhase>('blocked');
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  };

  const addTimer = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  };

  useEffect(() => {
    if (!visible) return;

    let isCancelled = false;
    clearTimers();
    setLines([]);
    setPhase('blocked');

    // Phase 1: type out blocked report
    let elapsed = 0;
    PHASE_BLOCKED.forEach((line) => {
      elapsed += LINE_MS;
      addTimer(() => {
        if (isCancelled) return;
        setLines(prev => [...prev, line]);
      }, elapsed);
    });

    // Phase 2: pause then show repair
    const repairStart = elapsed + PAUSE_BEFORE_REPAIR;
    addTimer(() => {
      if (isCancelled) return;
      setPhase('repair');
    }, repairStart);

    let repairElapsed = repairStart;
    PHASE_REPAIR.forEach((line) => {
      repairElapsed += LINE_MS * 2;
      addTimer(() => {
        if (isCancelled) return;
        setLines(prev => [...prev, line]);
      }, repairElapsed);
    });

    // Phase 3: pause then show ready
    const readyStart = repairElapsed + PAUSE_BEFORE_READY;
    addTimer(() => {
      if (isCancelled) return;
      setPhase('ready');
    }, readyStart);

    let readyElapsed = readyStart;
    PHASE_READY.forEach((line) => {
      readyElapsed += LINE_MS;
      addTimer(() => {
        if (isCancelled) return;
        setLines(prev => [...prev, line]);
      }, readyElapsed);
    });

    // Mark done
    addTimer(() => {
      if (isCancelled) return;
      setPhase('done');
    }, readyElapsed + 200);

    // Restart loop
    addTimer(() => {
      if (isCancelled) return;
      setLines([]);
      setPhase('blocked');
      // Re-trigger by toggling visible state indirectly is not possible,
      // so we just restart inline. The useEffect won't re-run, so we do it manually.
    }, readyElapsed + PAUSE_BEFORE_RESTART);

    return () => {
      isCancelled = true;
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Restart loop after 'done' pause
  useEffect(() => {
    if (phase !== 'done') return;
    const id = window.setTimeout(() => {
      setLines([]);
      setPhase('blocked');

      // Replay the blocked phase
      let elapsed = 0;
      PHASE_BLOCKED.forEach((line) => {
        elapsed += LINE_MS;
        const tid = window.setTimeout(() => {
          setLines(prev => [...prev, line]);
        }, elapsed);
        timers.current.push(tid);
      });

      // Repair
      const repairStart = elapsed + PAUSE_BEFORE_REPAIR;
      const tid1 = window.setTimeout(() => setPhase('repair'), repairStart);
      timers.current.push(tid1);

      let repairElapsed = repairStart;
      PHASE_REPAIR.forEach((line) => {
        repairElapsed += LINE_MS * 2;
        const tid = window.setTimeout(() => {
          setLines(prev => [...prev, line]);
        }, repairElapsed);
        timers.current.push(tid);
      });

      // Ready
      const readyStart = repairElapsed + PAUSE_BEFORE_READY;
      const tid2 = window.setTimeout(() => setPhase('ready'), readyStart);
      timers.current.push(tid2);

      let readyElapsed = readyStart;
      PHASE_READY.forEach((line) => {
        readyElapsed += LINE_MS;
        const tid = window.setTimeout(() => {
          setLines(prev => [...prev, line]);
        }, readyElapsed);
        timers.current.push(tid);
      });

      const tid3 = window.setTimeout(() => setPhase('done'), readyElapsed + 200);
      timers.current.push(tid3);
    }, PAUSE_BEFORE_RESTART);
    timers.current.push(id);

    return () => clearTimers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const showCaret = phase !== 'done';

  return (
    <div ref={ref} className="reveal" data-visible={visible}>
      <div className="overflow-hidden rounded-xl border border-edge bg-ink-card shadow-2xl shadow-black/40">
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b border-edge bg-ink-raised px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-edge-bright" />
          <span className="h-2.5 w-2.5 rounded-full bg-edge-bright" />
          <span className="h-2.5 w-2.5 rounded-full bg-edge-bright" />
          <span className="ml-2 font-mono text-sm text-text-faint">
            {phase === 'blocked' && 'auditing...'}
            {phase === 'repair' && 'repairing...'}
            {phase === 'ready' && 're-auditing...'}
            {phase === 'done' && 'audit complete'}
          </span>
        </div>

        <pre className="overflow-x-auto px-4 py-5 font-mono text-xs leading-[1.7] sm:px-5 sm:text-sm sm:leading-[1.7]">
          <code>
            {lines.map((segments, index) => (
              <div
                key={`line-${index}`}
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
            {showCaret && <span className="caret text-text">▋</span>}
          </code>
        </pre>
      </div>
    </div>
  );
}
