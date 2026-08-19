import { HeroAuditReport } from './components/HeroAuditReport';
import { AuditReplay } from './components/AuditReplay';
import {
  Body,
  Command,
  Eyebrow,
  Heading,
  Lede,
  Pill,
  Reveal,
  Section,
  ThemeToggle,
} from './components/primitives';

const GITHUB = 'https://github.com/7vignesh/spectruth';
const NPM = 'https://www.npmjs.com/package/spectruth';
const ISSUE = 'https://github.com/kirodotdev/Kiro/issues/3599';
const SPIKE = `${GITHUB}/blob/master/docs/kiro-integration-spike.md`;

export default function App() {
  return (
    <div className="min-h-screen bg-ink">
      <Nav />
      <Hero />
      <Problem />
      <Workflow />
      <EvidenceModel />
      <WhyNotTestsOrReview />
      <KiroIntegration />
      <Proof />
      <FinalCTA />
      <Footer />
    </div>
  );
}

/* ─── Navigation ──────────────────────────────────────────────────────────── */

function Nav() {
  return (
    <header className="sticky top-0 z-20 border-b border-edge bg-ink/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
        <a href="#top" className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-brand" />
          <span className="font-mono text-base font-medium tracking-tight text-text">
            spectruth
          </span>
        </a>
        <nav className="flex items-center gap-4 font-mono text-sm text-text-muted sm:gap-6">
          <a href="#workflow" className="hidden transition-colors hover:text-brand sm:block">
            how
          </a>
          <a href="#model" className="hidden transition-colors hover:text-brand sm:block">
            model
          </a>
          <a href="#kiro" className="hidden transition-colors hover:text-brand lg:block">
            kiro
          </a>
          <a href={NPM} className="transition-colors hover:text-brand">
            npm
          </a>
          <a
            href={GITHUB}
            className="rounded-md border border-edge px-3 py-1.5 text-text transition-colors hover:border-brand hover:text-brand"
          >
            GitHub
          </a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

/* ─── Hero ────────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <div id="top" className="hero-glow relative overflow-hidden px-6 pt-16 pb-16 sm:pt-24">
      <div className="relative z-10 mx-auto w-full max-w-5xl">
        <div className="grid items-start gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-10">
          {/* Left column — copy */}
          <div className="flex flex-col justify-center">
            <Reveal>
              <div className="inline-flex items-center gap-2.5 rounded-full border border-edge bg-brand-dim px-4 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                <p className="font-mono text-sm tracking-wide text-brand">
                  DONE INTEGRITY FOR KIRO
                </p>
              </div>
            </Reveal>

            <Reveal delay={60}>
              <h1 className="mt-7 max-w-xl text-4xl font-semibold leading-[1.08] tracking-tight text-text sm:text-5xl lg:text-[3.4rem] lg:leading-[1.06]">
                Your coding agent said{' '}
                <span className="text-brand">"done."</span>
                <br />
                SpecTruth checks the evidence.
              </h1>
            </Reveal>

            <Reveal delay={120}>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-text-muted">
                SpecTruth audits completed{' '}
                <span className="text-text">Kiro spec tasks</span> against their
                acceptance criteria — deterministic evidence first, then
                Kiro-assisted adjudication for anything the CLI cannot prove.
                No extra API key. Ship decision:{' '}
                <span className="font-mono text-supported">READY</span>,{' '}
                <span className="font-mono text-partial">REVIEW_REQUIRED</span>, or{' '}
                <span className="font-mono text-unsupported">BLOCKED</span>.
              </p>
            </Reveal>

            <Reveal delay={180}>
              <div className="mt-8 max-w-md">
                <Command value="npx spectruth@latest audit" />
                <p className="mt-3 font-mono text-sm text-text-faint">
                  For projects built with Kiro specs. No API key required.
                </p>
              </div>
            </Reveal>

            <Reveal delay={220}>
              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                <Pill>Kiro projects only</Pill>
                <Pill>no confidence scores</Pill>
                <Pill>no automatic edits</Pill>
                <Pill>MIT</Pill>
              </div>
            </Reveal>

            <Reveal delay={260}>
              <div className="mt-6 flex items-center gap-4 font-mono text-sm">
                <a
                  href={GITHUB}
                  className="text-text-muted underline decoration-transparent transition hover:text-brand hover:decoration-current"
                >
                  GitHub ↗
                </a>
                <a
                  href={NPM}
                  className="text-text-muted underline decoration-transparent transition hover:text-brand hover:decoration-current"
                >
                  npm ↗
                </a>
              </div>
            </Reveal>
          </div>

          {/* Right column — animated audit report */}
          <div className="lg:pt-4">
            <HeroAuditReport />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Problem ─────────────────────────────────────────────────────────────── */

function Problem() {
  return (
    <Section>
      <Reveal>
        <Eyebrow>The problem</Eyebrow>
        <Heading>
          Kiro can mark a task complete when the implementation is missing.
        </Heading>
      </Reveal>

      <Reveal delay={80}>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-muted">
          Not bad code — <span className="text-text">absent code</span>, behind a
          checked box. The person exposed to it sees{' '}
          <span className="font-mono text-base text-text">Task completed ✓</span>{' '}
          and moves on.
        </p>
      </Reveal>

      <Reveal delay={120}>
        <figure className="mt-9 rounded-xl border border-edge bg-ink-card p-7">
          <blockquote className="text-lg leading-relaxed text-text sm:text-xl">
            "Kiro is out right not completing tasks…{' '}
            <span className="text-unsupported">
              It has lied multiple times
            </span>{' '}
            and hallucinated an error."
          </blockquote>
          <figcaption className="mt-5 text-base text-text-muted">
            <a
              href={ISSUE}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-sm text-brand underline decoration-transparent transition hover:decoration-current"
            >
              kirodotdev/Kiro · #3599 ↗
            </a>
          </figcaption>
        </figure>
      </Reveal>

      <Reveal delay={160}>
        <p className="mt-8 max-w-2xl text-lg leading-relaxed text-text">
          Nothing in the existing toolchain checks the completion claim itself.
          SpecTruth does.
        </p>
      </Reveal>
    </Section>
  );
}

/* ─── Workflow ─────────────────────────────────────────────────────────────── */

function Workflow() {
  const steps = [
    {
      label: 'SPEC',
      desc: 'Kiro defines requirements and acceptance criteria.',
    },
    {
      label: 'BUILD',
      desc: 'Kiro implements a task and marks it complete.',
    },
    {
      label: 'EVIDENCE',
      desc: 'The CLI scans deterministically — status codes, libraries, route definitions, limits.',
    },
    {
      label: 'ADJUDICATE',
      desc: 'For anything the CLI cannot prove, the Kiro agent reads the source and decides. No extra API key.',
    },
    {
      label: 'DECIDE',
      desc: 'Combined evidence produces READY, REVIEW_REQUIRED, or BLOCKED.',
    },
    {
      label: 'REPAIR',
      desc: 'You approve a preview, Kiro implements, SpecTruth re-audits.',
    },
  ];

  return (
    <Section id="workflow">
      <Reveal>
        <Eyebrow>How it works</Eyebrow>
        <Heading>The full product loop.</Heading>
        <Lede>
          From spec to ship decision — with a human approval gate before anything
          changes.
        </Lede>
      </Reveal>

      <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-edge bg-edge sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((step, index) => (
          <Reveal key={step.label} delay={(index % 3) * 60}>
            <div className="flex h-full flex-col bg-ink-card p-6">
              <p className="font-mono text-sm tracking-[0.14em] text-brand">
                {step.label}
              </p>
              <p className="mt-3 text-base leading-relaxed text-text-muted">
                {step.desc}
              </p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={160}>
        <div className="mt-8 rounded-lg border border-edge bg-ink-raised p-5">
          <p className="text-base leading-relaxed text-text-muted">
            <span className="font-mono text-text">Install in one command:</span>{' '}
            <code className="text-brand">npx spectruth@latest init</code> — writes
            the Agent Skill, custom agent, and paired task hooks into your Kiro
            project.
          </p>
        </div>
      </Reveal>
    </Section>
  );
}

/* ─── Evidence Model ──────────────────────────────────────────────────────── */

function EvidenceModel() {
  const states = [
    {
      name: 'SUPPORTED',
      tone: 'text-supported',
      dot: 'bg-supported',
      body: 'Evidence supports every material part of the criterion.',
    },
    {
      name: 'PARTIAL',
      tone: 'text-partial',
      dot: 'bg-partial',
      body: 'Evidence supports some, but not all, material parts.',
    },
    {
      name: 'UNSUPPORTED',
      tone: 'text-unsupported',
      dot: 'bg-unsupported',
      body: 'The implementation is absent, contradicted, or clearly incomplete.',
    },
    {
      name: 'UNVERIFIED',
      tone: 'text-unverified',
      dot: 'bg-unverified',
      body: 'Available evidence cannot prove or contradict the criterion.',
    },
  ];

  const policy = [
    { when: 'UNSUPPORTED or PARTIAL', then: 'BLOCKED', tone: 'text-unsupported' },
    { when: 'only UNVERIFIED gaps', then: 'REVIEW_REQUIRED', tone: 'text-partial' },
    { when: 'all SUPPORTED', then: 'READY', tone: 'text-supported' },
  ];

  return (
    <Section id="model">
      <Reveal>
        <Eyebrow>The model</Eyebrow>
        <Heading>Four states. Three decisions. No scores.</Heading>
        <Lede>
          Each finding lands in exactly one state, and the states decide the
          outcome mechanically.
        </Lede>
      </Reveal>

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {states.map((state, index) => (
          <Reveal key={state.name} delay={(index % 2) * 70}>
            <div className="h-full rounded-lg border border-edge bg-ink-card p-6">
              <div className="flex items-center gap-2.5">
                <span className={`h-2 w-2 rounded-full ${state.dot}`} />
                <p className={`font-mono text-base ${state.tone}`}>{state.name}</p>
              </div>
              <p className="mt-3 text-base leading-relaxed text-text-muted">
                {state.body}
              </p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={100}>
        <div className="mt-9 overflow-hidden rounded-xl border border-edge">
          <div className="border-b border-edge bg-ink-raised px-6 py-4">
            <p className="font-mono text-sm tracking-wider uppercase text-text-faint">
              Ship policy
            </p>
          </div>
          <div className="divide-y divide-edge">
            {policy.map(rule => (
              <div
                key={rule.then}
                className="flex flex-wrap items-center gap-3 px-6 py-4 font-mono text-base"
              >
                <span className="text-text-muted">{rule.when}</span>
                <span className="text-text-faint">→</span>
                <span className={rule.tone}>{rule.then}</span>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      <Reveal delay={140}>
        <p className="mt-8 max-w-2xl text-base leading-relaxed text-text-muted">
          No threshold to tune, no confidence value to argue with. Run it twice
          offline and the output is byte-identical.
        </p>
      </Reveal>
    </Section>
  );
}

/* ─── Why not tests or code review? ───────────────────────────────────────── */

function WhyNotTestsOrReview() {
  const rows = [
    ['Code review', 'a diff', 'Is the code well-written?'],
    ['Tests', 'runnable behaviour', 'Does it behave correctly?'],
    ['SpecTruth', 'a completion claim', 'Is the claimed work actually supported?'],
  ];

  return (
    <Section id="compare">
      <Reveal>
        <Eyebrow>Why not tests or code review?</Eyebrow>
        <Heading>Different input, different question.</Heading>
      </Reveal>

      <Reveal delay={80}>
        <div className="mt-10 overflow-x-auto rounded-xl border border-edge">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-ink-raised">
                {['Tool', 'Needs', 'Answers'].map(head => (
                  <th
                    key={head}
                    className="border-b border-edge px-5 py-4 font-mono text-sm tracking-wider uppercase text-text-faint"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const isUs = index === rows.length - 1;
                return (
                  <tr key={row[0]} className={isUs ? 'bg-brand-dim' : ''}>
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className={`border-b border-edge px-5 py-4 text-base ${
                          isUs
                            ? cellIndex === 0
                              ? 'font-mono font-medium text-brand'
                              : 'text-text'
                            : 'text-text-muted'
                        }`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Reveal>

      <Reveal delay={140}>
        <p className="mt-8 max-w-2xl text-lg leading-relaxed text-text-muted">
          If the agent wrote nothing, there is no diff to review and no behaviour
          for tests to execute. SpecTruth checks the claim that work happened.
        </p>
      </Reveal>
    </Section>
  );
}

/* ─── Kiro Integration ────────────────────────────────────────────────────── */

function KiroIntegration() {
  const points = [
    'Kiro specs provide requirements, design, and task plans.',
    'The CLI collects deterministic evidence — status codes, named libraries, numeric limits.',
    'For criteria the CLI cannot prove, the Kiro agent reads the source and adjudicates.',
    'No separate API key — the model doing the work is the one you already have.',
    'Repairs are previewed and require explicit approval before anything changes.',
  ];

  return (
    <Section id="kiro">
      <Reveal>
        <Eyebrow>Kiro integration</Eyebrow>
        <Heading>Deterministic evidence. Kiro-assisted adjudication.</Heading>
        <Lede>
          The CLI catches what pattern matching can prove. For everything else,
          the Kiro agent reads the source itself — using the model you already
          have. No extra API key, no extra cost.
        </Lede>
      </Reveal>

      <div className="mt-10 space-y-4">
        {points.map((point, index) => (
          <Reveal key={index} delay={index * 50}>
            <div className="flex items-start gap-3 rounded-lg border border-edge bg-ink-card px-5 py-4">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
              <p className="text-base leading-relaxed text-text-muted">{point}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={200}>
        <div className="mt-9 rounded-xl border border-brand/40 bg-brand-dim p-6">
          <p className="text-base leading-relaxed text-text">
            <span className="font-mono text-brand">How it activates:</span> SpecTruth
            is agent-initiated — you ask, it audits. Install with{' '}
            <code className="text-brand">npx spectruth init</code>, then ask the
            agent whether a task is actually done.
          </p>
          <a
            href={SPIKE}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 font-mono text-sm text-brand underline decoration-transparent transition hover:decoration-current"
          >
            Read the integration findings <span aria-hidden="true">↗</span>
          </a>
        </div>
      </Reveal>

      <Reveal delay={240}>
        <div className="mt-8 rounded-lg border border-edge bg-ink-raised p-5">
          <p className="font-mono text-sm text-text-faint">
            Built for the Ready, Spec, Ship hackathon · spec-first · 345 tests
          </p>
        </div>
      </Reveal>
    </Section>
  );
}

/* ─── Proof (interactive demo) ────────────────────────────────────────────── */

function Proof() {
  return (
    <Section id="demo">
      <Reveal>
        <Eyebrow>Live demo</Eyebrow>
        <Heading>
          Same file, same spec — two different answers.
        </Heading>
        <Lede>
          Task 1 is truly done. Task 2 is not. Toggle to see the evidence.
        </Lede>
      </Reveal>

      <div className="mt-10">
        <AuditReplay />
      </div>

      <Reveal delay={80}>
        <div className="mt-8 grid gap-5 sm:grid-cols-3">
          {[
            {
              n: '01',
              title: 'required',
              body: 'The acceptance criterion, verbatim.',
            },
            {
              n: '02',
              title: 'found',
              body: 'What the codebase shows — file and line.',
            },
            {
              n: '03',
              title: 'missing',
              body: 'The specific absence that drives the state.',
            },
          ].map((item, index) => (
            <Reveal key={item.n} delay={index * 60}>
              <div className="h-full rounded-lg border border-edge bg-ink-card p-5">
                <p className="font-mono text-sm text-brand">{item.n}</p>
                <p className="mt-2 font-mono text-base text-text">{item.title}</p>
                <Body>{item.body}</Body>
              </div>
            </Reveal>
          ))}
        </div>
      </Reveal>

      <Reveal delay={160}>
        <div className="mt-8 max-w-lg">
          <Command value="npx spectruth@latest demo" subtle />
          <p className="mt-3 font-mono text-sm text-text-faint">
            Self-contained. No spec, no API key, no network. ~3 seconds.
          </p>
        </div>
      </Reveal>
    </Section>
  );
}

/* ─── Final CTA ───────────────────────────────────────────────────────────── */

function FinalCTA() {
  return (
    <Section>
      <Reveal>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-text sm:text-4xl">
            Don't trust the checkmark.
            <br />
            <span className="text-brand">Audit the claim.</span>
          </h2>

          <div className="mx-auto mt-9 max-w-md">
            <Command value="npx spectruth@latest audit" />
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4 font-mono text-sm">
            <a
              href={GITHUB}
              className="rounded-md border border-edge px-4 py-2 text-text transition-colors hover:border-brand hover:text-brand"
            >
              View on GitHub
            </a>
            <a
              href={NPM}
              className="rounded-md border border-edge px-4 py-2 text-text transition-colors hover:border-brand hover:text-brand"
            >
              View on npm
            </a>
          </div>

          <p className="mt-8 font-mono text-sm text-text-faint">
            No API key · No confidence scores · No automatic edits · MIT
          </p>
        </div>
      </Reveal>
    </Section>
  );
}

/* ─── Footer ──────────────────────────────────────────────────────────────── */

function Footer() {
  return (
    <footer className="border-t border-edge px-6 py-12">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4">
        <p className="font-mono text-sm text-text-faint">
          SpecTruth · MIT · built with Kiro for the Ready, Spec, Ship hackathon
        </p>
        <div className="flex items-center gap-6 font-mono text-sm text-text-muted">
          <a href={GITHUB} className="transition-colors hover:text-brand">
            GitHub
          </a>
          <a href={NPM} className="transition-colors hover:text-brand">
            npm
          </a>
        </div>
      </div>
    </footer>
  );
}
