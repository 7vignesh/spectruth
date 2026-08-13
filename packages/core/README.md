# spectruth-core

The Done Integrity engine behind [SpecTruth](https://github.com/7vignesh/spectruth).

When an agent marks a spec task complete, that is a *claim*. This package
audits the claim against the acceptance criteria the task references and
returns a ship decision. It is not a code reviewer, a test runner, or a
spec-conformance scorer — its input is the completion claim, which is why it can
catch work that was never done rather than only work done badly.

Most people want the CLI instead:

```bash
npx spectruth@latest audit
```

Install this package directly only if you are building your own integration.

```bash
npm install spectruth-core
```

## Evidence states

| State | Meaning |
|---|---|
| `SUPPORTED` | Evidence demonstrates the complete criterion |
| `PARTIAL` | Evidence demonstrates only part of it |
| `UNSUPPORTED` | Implementation is absent, contradicted, or demonstrably incomplete |
| `UNVERIFIED` | Implementation may exist, but evidence cannot establish the behaviour |

## Ship decisions

| Decision | Rule |
|---|---|
| `BLOCKED` | Any `UNSUPPORTED` or `PARTIAL` finding |
| `REVIEW_REQUIRED` | Nothing blocking, but at least one `UNVERIFIED` |
| `READY` | Every linked criterion is `SUPPORTED` |

There are no confidence values, percentages, or completion scores anywhere in
the output. The same findings always produce the same decision.

## Usage

```ts
import { auditProject } from 'spectruth-core';

const report = await auditProject({ projectRoot: process.cwd() });
console.log(report.summary.shipStatus);
```

The deterministic path uses no model at all. If `ANTHROPIC_API_KEY` or
`OPENAI_API_KEY` is present, a provider may refine the result within a bounded
evidence bundle. The provider SDKs are optional peer dependencies loaded through
dynamic `import()`, so the default path stays dependency-free.

## Design notes

Documentation is never treated as evidence — markdown, `.kiro`, `.spectruth`
and `docs` paths are excluded from evidence retrieval, because prose describing
intent is exactly the false support this tool exists to catch.

Static checks declare how much they can prove. A status code, a named algorithm,
or a stated numeric bound is *specific* and can support a criterion. A route
definition is *corroborating*: it establishes where a behaviour would live, not
that the behaviour exists, and can never carry a criterion to `SUPPORTED` on its
own.

Missing security enforcement is `UNSUPPORTED`, never `UNVERIFIED`. Partial
enforcement of a security requirement is also `UNSUPPORTED` — half an ownership
check protects nothing.

Full documentation, including the repair and approval cycle, is in the
[repository README](https://github.com/7vignesh/spectruth#readme).

## License

MIT
