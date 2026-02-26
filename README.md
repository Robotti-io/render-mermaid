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

const renderer = new MermaidRenderer('./doc.md', './out');
await renderer.run();
```
