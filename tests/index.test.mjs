import MermaidRenderer, { MermaidRenderer as NamedMermaidRenderer } from '../index.js';

describe('index exports', () => {
  test('default export is MermaidRenderer', () => {
    expect(typeof MermaidRenderer).toBe('function');
    expect(MermaidRenderer).toBe(NamedMermaidRenderer);
  });
});
