import { AuditReplay } from './components/AuditReplay';
import {
  Body,
  Citation,
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
const KIRO_CORRECTNESS = 'https://kiro.dev/docs/specs/correctness/';
const KIRO_SPECS = 'https://kiro.dev/docs/specs/';
const CC_SDD = 'https://github.com/gotalab/cc-sdd';
const SPIKE = `${GITHUB}/blob/master/docs/kiro-integration-spike.md`;

export default function App() {
  return (
    <div className="min-h-screen bg-ink">
      <Nav />
      <Hero />
      <Proof />
      <Model />
      <Problem />
      <Research />
      <HowItWorks />
      <NotAReviewer />
      <Decisions />
      <BuiltWithKiro />
      <BeyondKiro />
      <TryIt />
      <Footer />
    </div>
  );
}

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
          <a href="#model" className="hidden transition-colors hover:text-brand sm:block">
            model
          </a>
          <a href="#research" className="hidden transition-colors hover:text-brand sm:block">
            research
          </a>
          <a href="#how" className="transition-colors hover:text-brand">
            how
          </a>
          <a href="#built" className="hidden transition-colors hover:text-brand lg:block">
            built with kiro
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

function Hero() {
  return (
    <div id="top" className="hero-glow relative overflow-hidden px-6 pt-20 pb-16 sm:pt-28">
      <div className="relative z-10 mx-auto w-full max-w-5xl">
        <Reveal>
          <div className="inline-flex items-center gap-2.5 rounded-full border border-edge bg-brand-dim px-4 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            <p className="font-mono text-sm tracking-wide text-brand">
              Done Integrity · built for Kiro
            </p>
          </div>
        </Reveal>

        <Reveal delay={60}>
          <h1 className="mt-7 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight text-text sm:text-6xl">
            The agent says the task is done.
            <br />
            <span className="text-brand">Is it?</span>
          </h1>
        </Reveal>

        <Reveal delay={120}>
          <p className="mt-7 max-w-2xl text-lg leading-relaxed text-text-muted sm:text-xl">
            When an agent marks a spec task complete, that is a{' '}
            <span className="text-text">claim</span>. SpecTruth audits the claim against the
            acceptance criteria it was supposed to satisfy, and blocks the ship when the
            evidence does not support it.
          </p>
        </Reveal>

        <Reveal delay={180}>
          <div className="mt-9 max-w-xl">
            <Command value="npx spectruth@latest demo" />
            <p className="mt-3.5 font-mono text-sm text-text-faint">
              No spec, no API key, no network. Runs in about three seconds.
            </p>
          </div>
        </Reveal>

        <Reveal delay={240}>
          <div className="mt-9 flex flex-wrap items-center gap-2.5">
            <Pill>deterministic verdict</Pill>
            <Pill>no confidence scores</Pill>
            <Pill>repairs need approval</Pill>
            <Pill>314 tests</Pill>
            <Pill>MIT</Pill>
          </div>
        </Reveal>
      </div>
    </div>
  );
}

function Proof() {
  return (
    <Section className="!border-t-0">
      <Reveal>
        <Eyebrow>See it</Eyebrow>
        <Heading>A task was checked off. The check was never written.</Heading>
        <Lede>
          Same file, same spec, two different answers — because one claim was true and one was
          not.
        </Lede>
      </Reveal>

      <div className="mt-10">
        <AuditReplay />
      </div>

      {/*
        Demo video slot. To fill it, replace the inner div with either
          <video src="/demo.mp4" controls poster="/demo-poster.png" className="h-full w-full" />
        or a YouTube iframe with the same aspect wrapper.
      */}
      <Reveal delay={60}>
        <figure className="mt-8">
          <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-edge-bright bg-ink-raised">
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-edge-bright text-brand">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <p className="mt-4 font-mono text-sm text-text-faint">
                walkthrough video
              </p>
            </div>
          </div>
          <figcaption className="mt-3 text-sm text-text-faint">
            Two minutes: a task marked complete, the audit refusing it, and the approved repair
            being verified.
          </figcaption>
        </figure>
      </Reveal>

      <div className="mt-10 grid gap-5 sm:grid-cols-3">
        {[
          {
            n: '01',
            title: 'required',
            body: 'The acceptance criterion, verbatim, so nothing is paraphrased away.',
          },
          {
            n: '02',
            title: 'found',
            body: 'What the codebase actually shows, with a file and a line number.',
          },
          {
            n: '03',
            title: 'missing',
            body: 'The specific absence that drives the state. This is the line that matters.',
          },
        ].map((item, index) => (
          <Reveal key={item.n} delay={index * 80}>
            <div className="h-full rounded-lg border border-edge bg-ink-card p-6">
              <p className="font-mono text-sm text-brand">{item.n}</p>
              <p className="mt-2.5 font-mono text-base text-text">{item.title}</p>
              <p className="mt-2.5 text-base leading-relaxed text-text-muted">{item.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function Model() {
  const states = [
    {
      name: 'SUPPORTED',
      tone: 'text-supported',
      dot: 'bg-supported',
      body: 'Evidence demonstrates the complete criterion.',
    },
    {
      name: 'PARTIAL',
      tone: 'text-partial',
      dot: 'bg-partial',
      body: 'Evidence demonstrates only part of it.',
    },
    {
      name: 'UNSUPPORTED',
      tone: 'text-unsupported',
      dot: 'bg-unsupported',
      body: 'Implementation is absent, contradicted, or demonstrably incomplete.',
    },
    {
      name: 'UNVERIFIED',
      tone: 'text-unverified',
      dot: 'bg-unverified',
      body: 'Implementation may exist, but evidence cannot establish the behaviour.',
    },
  ];

  const policy = [
    { when: 'any UNSUPPORTED or PARTIAL', then: 'BLOCKED', tone: 'text-unsupported' },
    { when: 'otherwise, any UNVERIFIED', then: 'REVIEW_REQUIRED', tone: 'text-partial' },
    { when: 'every criterion SUPPORTED', then: 'READY', tone: 'text-supported' },
  ];

  return (
    <Section id="model">
      <Reveal>
        <Eyebrow>The model</Eyebrow>
        <Heading>Four states, three decisions, one rule.</Heading>
        <Lede>
          The words in that terminal are not adjectives. Each finding lands in exactly one
          state, and the states decide the outcome mechanically.
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
              <p className="mt-3 text-base leading-relaxed text-text-muted">{state.body}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={80}>
        <div className="mt-9 overflow-hidden rounded-xl border border-edge">
          <div className="border-b border-edge bg-ink-raised px-6 py-4">
            <p className="font-mono text-sm tracking-wider uppercase text-text-faint">
              The ship policy, in full
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

      <Reveal delay={130}>
        <div className="mt-9 grid gap-5 sm:grid-cols-2">
          <div className="rounded-lg border border-edge bg-ink-raised p-6">
            <p className="font-mono text-base text-text">There is no fourth outcome.</p>
            <p className="mt-3 text-base leading-relaxed text-text-muted">
              No score to interpret, no threshold to tune, no confidence value to argue with.
              The same findings always produce the same decision.
            </p>
          </div>
          <div className="rounded-lg border border-edge bg-ink-raised p-6">
            <p className="font-mono text-base text-text">
              Every finding carries a justification.
            </p>
            <p className="mt-3 text-base leading-relaxed text-text-muted">
              A state without a reason is not auditable, so the domain constructor rejects an
              empty justification at runtime. There is no path to a verdict without one.
            </p>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}

function Problem() {
  return (
    <Section>
      <Reveal>
        <Eyebrow>The problem</Eyebrow>
        <Heading>This is a reported failure, not a hypothetical.</Heading>
      </Reveal>

      <Reveal delay={80}>
        <figure className="mt-10 rounded-xl border border-edge bg-ink-card p-7 sm:p-9">
          <blockquote className="text-xl leading-relaxed text-text sm:text-2xl sm:leading-[1.5]">
            “Kiro is out right not completing tasks and burning credits with said incomplete
            tasks despite them being in the task.md for a spec.{' '}
            <span className="text-unsupported">It has lied multiple times</span> and
            hallucinated an error.”
          </blockquote>
          <figcaption className="mt-6 text-base text-text-muted">
            <a
              href={ISSUE}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-brand underline decoration-transparent transition hover:decoration-current"
            >
              kirodotdev/Kiro · issue #3599 ↗
            </a>
            <span className="ml-2">— reported by a user, on Kiro's own tracker</span>
          </figcaption>
        </figure>
      </Reveal>

      <Reveal delay={140}>
        <p className="mt-10 max-w-2xl text-lg leading-relaxed text-text-muted sm:text-xl">
          The person exposed to this is not the one reviewing diffs carefully. It is the one
          who hands a task to an agent, sees{' '}
          <span className="font-mono text-base text-text">Task completed ✓</span>, and moves
          on.
        </p>
      </Reveal>

      <div className="mt-10 grid gap-5 sm:grid-cols-3">
        {[
          {
            k: 'Tests',
            v: 'verify the code that exists. If nothing was written, nothing fails.',
          },
          {
            k: 'Code review',
            v: 'reads a diff. If nothing was written, there is no diff to read.',
          },
          {
            k: 'Property tests',
            v: 'need runnable behaviour to probe. Absent code has no behaviour.',
          },
        ].map((item, index) => (
          <Reveal key={item.k} delay={index * 80}>
            <div className="h-full rounded-lg border border-edge bg-ink-raised p-6">
              <p className="font-mono text-base text-text">{item.k}</p>
              <p className="mt-2.5 text-base leading-relaxed text-text-muted">{item.v}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={160}>
        <p className="mt-9 max-w-2xl text-lg leading-relaxed text-text sm:text-xl">
          SpecTruth's input is the claim itself. That is why it can catch work that never
          happened.
        </p>
      </Reveal>
    </Section>
  );
}

function Research() {
  return (
    <Section id="research">
      <Reveal>
        <Eyebrow>What the research showed</Eyebrow>
        <Heading>Every claim on this page links to its source.</Heading>
        <Lede>
          Before building anything, the question was whether this gap was real and whether
          something already filled it. Here is what turned up, including the parts that argue
          against us.
        </Lede>
      </Reveal>

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        <Reveal>
          <Citation href={ISSUE} source="kirodotdev/Kiro · issue #3599">
            <span className="text-brand">The failure is documented by users.</span> A report
            on Kiro's own tracker describes tasks marked complete in <code>tasks.md</code>{' '}
            without the work being done, and credits being consumed doing it.
          </Citation>
        </Reveal>

        <Reveal delay={70}>
          <Citation href={KIRO_CORRECTNESS} source="kiro.dev/docs/specs/correctness">
            <span className="text-brand">Kiro already ships correctness checking</span>, and
            it is good at what it does. Its own docs state the limits we work inside: “not
            every requirement maps cleanly to a property”, and it “provides evidence of
            correctness, not a proof”.
          </Citation>
        </Reveal>

        <Reveal delay={40}>
          <Citation href={KIRO_SPECS} source="kiro.dev/docs/specs · capability matrix">
            <span className="text-brand">Property-based testing is IDE-only.</span> Kiro's
            capability table marks it available in the IDE and unavailable in CLI, Web and
            Mobile. An audit that runs anywhere fills a different slot.
          </Citation>
        </Reveal>

        <Reveal delay={110}>
          <Citation href={CC_SDD} source="gotalab/cc-sdd · kiro-verify-completion">
            <span className="text-brand">Prior art exists, as a prompt.</span> A verification
            skill instructs an agent to demand fresh evidence before claiming success.
            Directionally right — but a skill asks a model to be careful, and a model can be
            talked out of being careful.
          </Citation>
        </Reveal>

        <Reveal delay={80}>
          <Citation href={SPIKE} source="docs/kiro-integration-spike.md">
            <span className="text-brand">One finding is ours.</span> The paired task hooks use
            Kiro's documented <code>preTaskExecution</code> schema, but IDE task execution
            delegates to an internal subagent and does not invoke external hooks. That is why
            SpecTruth is agent-initiated rather than automatic.
          </Citation>
        </Reveal>

        <Reveal delay={150}>
          <div className="h-full rounded-lg border border-brand/40 bg-brand-dim p-6">
            <p className="font-mono text-sm tracking-wide uppercase text-brand">
              The conclusion
            </p>
            <p className="mt-3.5 text-base leading-relaxed text-text">
              Tests need code to run. Review needs a diff to read. Properties need behaviour
              to probe. A prompt needs a model to stay disciplined.
            </p>
            <p className="mt-3.5 text-base leading-relaxed text-text-muted">
              Nothing existing takes the completion claim as its input and computes an answer
              without a model in the loop. That is the gap SpecTruth fills.
            </p>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: 'Step 01',
      title: 'Install it where you already work',
      body: 'One command scaffolds an Agent Skill, a custom agent, and the paired task hooks into your project. Nothing else to configure.',
      command: 'npx spectruth@latest init',
    },
    {
      n: 'Step 02',
      title: 'Ask, in the words you would already use',
      body: 'You never type a command again. Ask the agent whether a task is done, and it runs the audit and explains the decision.',
      quote: 'is task 2 actually done?',
    },
    {
      n: 'Step 03',
      title: 'Get a decision, not a number',
      body: 'READY, REVIEW_REQUIRED, or BLOCKED — each with the criterion, the evidence, and the gap. If it blocks, a repair is previewed and nothing is changed until you approve it.',
    },
  ];

  return (
    <Section id="how">
      <Reveal>
        <Eyebrow>How it works</Eyebrow>
        <Heading>Install → ask → decide.</Heading>
      </Reveal>

      <div className="mt-12 space-y-10">
        {steps.map((step, index) => (
          <Reveal key={step.n} delay={index * 70}>
            <div className="grid gap-6 border-t border-edge pt-9 sm:grid-cols-[150px_1fr]">
              <p className="font-mono text-sm tracking-[0.14em] uppercase text-brand">
                {step.n}
              </p>
              <div>
                <h3 className="text-2xl font-semibold tracking-tight text-text">
                  {step.title}
                </h3>
                <div className="mt-3.5 max-w-2xl">
                  <Body>{step.body}</Body>
                </div>

                {step.command && (
                  <div className="mt-5 max-w-lg">
                    <Command value={step.command} subtle />
                  </div>
                )}

                {step.quote && (
                  <div className="mt-5 max-w-lg rounded-lg border border-edge bg-ink-raised px-5 py-4">
                    <p className="font-mono text-base text-brand">“{step.quote}”</p>
                  </div>
                )}
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function NotAReviewer() {
  const rows = [
    ['Code review', 'a diff', 'Is this code good?'],
    ['Property-based tests', 'running code', 'Does it behave correctly?'],
    ['Fidelity scoring', 'spec + repo', 'How closely do they match?'],
    ['SpecTruth', 'a completion claim', 'Is this claim true?'],
  ];

  return (
    <Section id="compare">
      <Reveal>
        <Eyebrow>Side by side</Eyebrow>
        <Heading>It is not a code reviewer.</Heading>
        <Lede>
          A reviewer reads the code that is there. SpecTruth checks whether the code that was
          promised is there.
        </Lede>
      </Reveal>

      <Reveal delay={90}>
        <div className="mt-10 overflow-x-auto rounded-xl border border-edge">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-ink-raised">
                {['Tool', 'Input', 'Question it answers'].map(head => (
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
          Only the last row can catch a task that was checked off with nothing written. The
          others need something to read or something to run.
        </p>
      </Reveal>
    </Section>
  );
}

function Decisions() {
  const decisions = [
    {
      title: 'No scores. No confidence values.',
      body: 'A percentage describes a feeling and hides the decision. Is 61% shippable? Nobody can say. So the output is READY, REVIEW_REQUIRED, or BLOCKED — three outcomes, each with an obvious next action.',
      tone: 'text-supported',
    },
    {
      title: 'UNVERIFIED is not failure.',
      body: '“I cannot prove this” is different from “this is broken”. Collapsing them either cries wolf or hides risk, so unproven has its own state.',
      tone: 'text-unverified',
    },
    {
      title: 'The verdict is computed, not generated.',
      body: 'Static evidence decides. Run it twice offline and the output is identical, with no model in the loop. A model may refine the result if you configure one, but it is never required.',
      tone: 'text-supported',
    },
    {
      title: 'Missing security enforcement blocks.',
      body: 'A missing authorization or ownership check is a blocking absence, never an unknown. And partial enforcement of a security requirement is not enforcement.',
      tone: 'text-unsupported',
    },
    {
      title: 'Documentation is not evidence.',
      body: 'An early version cited a README as proof that code returned 403, because the README described returning 403. Prose about intent is exactly the false support this tool exists to catch.',
      tone: 'text-partial',
    },
    {
      title: 'Repairs are previewed, never performed.',
      body: 'An approval covers one preview, bound to one report and to the files as they were. It cannot be widened, replayed, or reused after the code drifts — and it never authorizes editing tasks.md.',
      tone: 'text-unverified',
    },
  ];

  return (
    <Section>
      <Reveal>
        <Eyebrow>Design decisions</Eyebrow>
        <Heading>Most of these cost something.</Heading>
        <Lede>
          The interesting choices were the ones that made the output less flattering and more
          honest.
        </Lede>
      </Reveal>

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {decisions.map((decision, index) => (
          <Reveal key={decision.title} delay={(index % 2) * 70}>
            <div className="h-full rounded-lg border border-edge bg-ink-card p-6 transition-colors hover:border-brand">
              <h3 className={`font-mono text-base ${decision.tone}`}>{decision.title}</h3>
              <p className="mt-3.5 text-base leading-relaxed text-text-muted">
                {decision.body}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function BuiltWithKiro() {
  return (
    <Section id="built">
      <Reveal>
        <Eyebrow>Built with Kiro</Eyebrow>
        <Heading>Spec-first, and the record is in the commits.</Heading>
        <Lede>
          SpecTruth was built the way it asks you to build: requirements and design before
          code, tasks tracked in a spec, and small commits per increment.
        </Lede>
      </Reveal>

      <div className="mt-10 overflow-hidden rounded-xl border border-edge">
        {[
          {
            phase: 'Ready',
            what: 'Requirements, design, and a task plan written in .kiro/specs before implementation.',
          },
          {
            phase: 'Spec',
            what: 'Five requirements with EARS acceptance criteria; every task references the criteria it claims to satisfy.',
          },
          {
            phase: 'Build',
            what: 'Day-by-day increments, each validated and committed separately rather than in one drop.',
          },
          {
            phase: 'Integrate',
            what: 'An Agent Skill, a custom agent, and paired task hooks, all installable into any project with one command.',
          },
          {
            phase: 'Dogfood',
            what: 'It audits its own repository — and honestly reports UNVERIFIED, because static analysis cannot prove its own behaviour.',
          },
        ].map((row, index) => (
          <Reveal key={row.phase} delay={index * 50}>
            <div className="grid gap-2 border-b border-edge px-6 py-5 last:border-b-0 sm:grid-cols-[130px_1fr] sm:gap-6">
              <p className="font-mono text-sm tracking-[0.14em] uppercase text-brand">
                {row.phase}
              </p>
              <p className="text-base leading-relaxed text-text-muted">{row.what}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={120}>
        <div className="mt-9 rounded-xl border border-edge bg-ink-card p-7">
          <p className="font-mono text-base text-text">
            Building it produced a finding worth publishing.
          </p>
          <p className="mt-3.5 max-w-2xl text-base leading-relaxed text-text-muted">
            The paired hooks use Kiro's documented <code className="text-brand">
              preTaskExecution
            </code>{' '}
            schema, but IDE task execution delegates to an internal subagent and does not
            invoke external hooks. Rather than hide that, SpecTruth is agent-initiated: you
            ask, it audits. The hooks ship anyway, ready if those triggers activate.
          </p>
          <a
            href={SPIKE}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 font-mono text-sm text-brand underline decoration-transparent transition hover:decoration-current"
          >
            Read the integration findings <span aria-hidden="true">↗</span>
          </a>
        </div>
      </Reveal>

      {/*
        Screenshot slots. To fill one: drop the image in packages/web/public/
        and replace <Placeholder /> with
        <img src="/kiro-skill.png" alt="..." className="w-full rounded-md" />
      */}
      <Reveal delay={160}>
        <div className="mt-9 grid gap-5 sm:grid-cols-2">
          <ScreenshotSlot
            label="skill activating in Kiro"
            caption="The spectruth skill loading via skill:// and answering in chat."
          />
          <ScreenshotSlot
            label="an audit inside the IDE"
            caption="The ship decision and the gap, explained by the agent."
          />
          <ScreenshotSlot
            label="the approval turn"
            caption="A repair preview, and the separate turn that authorizes it."
          />
          <ScreenshotSlot
            label="spec and tasks"
            caption="Requirements, design, and tasks tracked as a Kiro spec."
          />
        </div>
      </Reveal>
    </Section>
  );
}

function ScreenshotSlot({ label, caption }: { label: string; caption: string }) {
  return (
    <figure>
      <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-edge-bright bg-ink-raised">
        <p className="px-6 text-center font-mono text-sm text-text-faint">{label}</p>
      </div>
      <figcaption className="mt-3 text-sm leading-relaxed text-text-faint">
        {caption}
      </figcaption>
    </figure>
  );
}

function BeyondKiro() {
  return (
    <Section id="beyond">
      <Reveal>
        <Eyebrow>Beyond Kiro</Eyebrow>
        <Heading>The pattern is not Kiro-specific.</Heading>
        <Lede>
          Any agent that marks work complete is making a claim. Kiro is the first integration
          because its specs make the claim checkable — not because the idea stops there.
        </Lede>
      </Reveal>

      <div className="mt-10 grid gap-5 sm:grid-cols-3">
        {[
          {
            title: 'What it needs',
            body: 'Acceptance criteria, a task list with completion state, and a codebase. Kiro provides all three, which is why it went first.',
          },
          {
            title: 'What is portable',
            body: 'The engine is a separate package from the Kiro adapter. Parsing, evidence, adjudication and the approval gate know nothing about Kiro.',
          },
          {
            title: 'What comes next',
            body: 'An MCP server so any host can call the audit as a native tool, a CI gate, and adapters that ingest existing test output as evidence.',
          },
        ].map((item, index) => (
          <Reveal key={item.title} delay={index * 70}>
            <div className="h-full rounded-lg border border-edge bg-ink-card p-6">
              <p className="font-mono text-base text-brand">{item.title}</p>
              <p className="mt-3.5 text-base leading-relaxed text-text-muted">{item.body}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={140}>
        <div className="mt-9 rounded-xl border border-brand/40 bg-brand-dim p-7 sm:p-9">
          <p className="text-xl leading-relaxed text-text sm:text-2xl sm:leading-[1.5]">
            The more work we delegate to agents, the more of our confidence rests on claims
            nobody checked.
          </p>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-text-muted">
            Done Integrity is the missing layer: not another reviewer, and not more autonomy —
            a gate that asks whether the thing an agent says it did is supported by evidence,
            and refuses to guess when it cannot tell.
          </p>
        </div>
      </Reveal>
    </Section>
  );
}

function TryIt() {
  return (
    <Section>
      <Reveal>
        <Eyebrow>Try it</Eyebrow>
        <Heading>Three commands, none of them need setup.</Heading>
      </Reveal>

      <div className="mt-10 grid gap-5 sm:grid-cols-3">
        {[
          {
            label: 'See it work',
            command: 'npx spectruth@latest demo',
            note: 'Self-contained. No spec, key, or network.',
          },
          {
            label: 'Audit your project',
            command: 'npx spectruth@latest',
            note: 'Every completed task, in every spec.',
          },
          {
            label: 'Wire it into Kiro',
            command: 'npx spectruth@latest init',
            note: 'Skill, agent, and paired task hooks.',
          },
        ].map((item, index) => (
          <Reveal key={item.label} delay={index * 70}>
            <div className="h-full rounded-lg border border-edge bg-ink-card p-6">
              <p className="font-mono text-sm tracking-wider uppercase text-brand">
                {item.label}
              </p>
              <div className="mt-4">
                <Command value={item.command} subtle />
              </div>
              <p className="mt-3.5 text-base leading-relaxed text-text-muted">{item.note}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={160}>
        <div className="mt-10 rounded-xl border border-edge bg-ink-raised p-7 sm:p-9">
          <p className="text-xl leading-relaxed text-text">
            Run it on this repository and it reports{' '}
            <span className="font-mono text-unverified">UNVERIFIED</span> for almost
            everything.
          </p>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-text-muted">
            That is the correct answer. Those criteria describe internal behaviour that static
            analysis cannot prove, and the evidence that would prove it is test output, which
            is not ingested yet. A tool that scored itself highly here would be telling you
            something it cannot know.
          </p>
        </div>
      </Reveal>
    </Section>
  );
}

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
