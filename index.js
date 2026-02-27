import MermaidRenderer, { MermaidRenderer as NamedMermaidRenderer } from './render-mermaid.js';

export { NamedMermaidRenderer as MermaidRenderer };
export default MermaidRenderer;

// Istanbul does not count ESM re-exports as executable statements.
// This no-op ensures the entrypoint registers as covered when imported.
// eslint-disable-next-line no-unused-expressions
void MermaidRenderer;
