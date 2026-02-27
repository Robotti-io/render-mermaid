# @robotti.io/render-mermaid

Render Mermaid diagrams found in a Markdown file to PNG images.

## Install

```bash
npm install @robotti.io/render-mermaid
```

## CLI

```bash
npx render-mermaid ./doc.md ./out
```

### Security note (untrusted input)

This tool renders Mermaid by spawning `mmdc` (Mermaid CLI), which typically runs headless Chromium. Treat rendering attacker-controlled Markdown/Mermaid (for example, CI on PRs from forks) as **high risk**.

If you must run on untrusted inputs, prefer running in a sandboxed environment (container/VM), with least privilege and restricted network egress.

This package is **hardened by default** (resource limits + non-inherited child output). Use `--mode lax` or `--mode unsafe only for trusted local documents.

### Options

- `--verbose`: inherit Mermaid CLI stdout/stderr (may leak sensitive info into logs)
- `--mode <string>`: base profile configuration [`hardened` (default), `lax`, `unsafe`]
- `--max-concurrency <n>`: maximum concurrent renders
- `--timeout-ms <ms>`: timeout per render
- `--max-blocks <n>`: maximum Mermaid blocks allowed
- `--max-file-bytes <n>`: maximum input Markdown size
- `--max-block-bytes <n>`: maximum Mermaid block size
- `--max-svg-bytes <n>`: maximum rendered SVG size (pre-rasterization)

### Default vs lax settings

Defaults apply to both the CLI and library unless you override options.

| Setting | hardened (default) | lax | unsafe |
| --- | ---: | ---: | ---: |
| `maxConcurrency` | 1 | 2 | `os.cpus().length` |
| `timeoutMs` | 15000 | 30000 | 60000 |
| `maxBlocks` | 25 | 50 | 250 |
| `maxFileBytes` | 1MB | 2MB | 10MB |
| `maxBlockBytes` | 64KB | 128KB | 512KB |
| `maxSvgBytes` | 2MB | 5MB | 20MB |
| `childOutput` | `capture` | `capture` | `capture` |

- `./doc.md` must contain one or more fenced Mermaid blocks:

  ````md
  ```mermaid
  graph TD
    A --> B
  ```
  ````

## Library

```js
import MermaidRenderer from '@robotti.io/render-mermaid';

// Uses hardened defaults unless overridden.
const renderer = new MermaidRenderer('./doc.md', './out');
await renderer.run();

// Lax example (trusted docs):
const laxRenderer = new MermaidRenderer('./doc.md', './out', {
  timeoutMs: 30_000,
  maxConcurrency: 2,
  maxBlocks: 50,
  maxFileBytes: 2 * 1024 * 1024,
  maxBlockBytes: 128 * 1024,
  maxSvgBytes: 5 * 1024 * 1024,
  childOutput: 'capture',
});
await laxRenderer.run();
```
