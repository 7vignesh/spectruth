import { useState, type ReactNode } from 'react';
import { useReveal } from '../lib/useReveal';
import { useTheme } from '../lib/useTheme';

/** Small label above a section heading. Sized to stay readable, not decorative. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span className="h-1.5 w-1.5 rounded-full bg-brand" />
      <p className="font-mono text-sm tracking-[0.14em] uppercase text-brand">{children}</p>
      <span className="rule-fade h-px flex-1" />
    </div>
  );
}

export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      data-visible={visible}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

export function Section({
  id,
  children,
  className = '',
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`border-t border-edge px-6 py-24 sm:py-32 ${className}`}>
      <div className="mx-auto w-full max-w-5xl">{children}</div>
    </section>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-3xl font-semibold tracking-tight text-text sm:text-[2.6rem] sm:leading-[1.15]">
      {children}
    </h2>
  );
}

export function Lede({ children }: { children: ReactNode }) {
  return (
    <p className="mt-5 max-w-2xl text-lg leading-relaxed text-text-muted sm:text-xl">
      {children}
    </p>
  );
}

export function Body({ children }: { children: ReactNode }) {
  return <p className="text-base leading-relaxed text-text-muted">{children}</p>;
}

/** A command the reader is meant to run, with a copy affordance. */
export function Command({ value, subtle = false }: { value: string; subtle?: boolean }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-lg border border-edge ${
        subtle ? 'bg-ink-raised' : 'bg-ink-card'
      } px-4 py-3.5`}
    >
      <code className="overflow-x-auto font-mono text-[15px] text-text">
        <span className="mr-2 select-none text-brand">$</span>
        {value}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy: ${value}`}
        className="shrink-0 rounded-md border border-edge px-3 py-1.5 font-mono text-sm text-text-muted transition-colors hover:border-brand hover:text-brand"
      >
        {copied ? 'copied' : 'copy'}
      </button>
    </div>
  );
}

export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-edge bg-ink-raised px-3.5 py-1.5 font-mono text-sm text-text-muted">
      {children}
    </span>
  );
}

/**
 * A source the reader can check. Every claim on this page that came from
 * somewhere links back to it.
 */
export function Citation({
  href,
  source,
  children,
}: {
  href: string;
  source: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-edge bg-ink-card p-6">
      <p className="text-base leading-relaxed text-text">{children}</p>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-flex items-center gap-1.5 font-mono text-sm text-brand underline decoration-transparent transition hover:decoration-current"
      >
        {source}
        <span aria-hidden="true">↗</span>
      </a>
    </div>
  );
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="flex h-9 w-9 items-center justify-center rounded-md border border-edge text-text-muted transition-colors hover:border-brand hover:text-brand"
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />
    </svg>
  );
}
