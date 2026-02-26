import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import MermaidRenderer from '../render-mermaid.js';

describe('Real-world markdown fixtures', () => {
  test('parses Mermaid blocks from tests/Threat Model Review - 2026-02-25.md', () => {
    const fixturePath = fileURLToPath(new URL('./Threat Model Review - 2026-02-25.md', import.meta.url));
    const fixtureDir = path.dirname(fixturePath);

    // Sanity check: fixture exists and is markdown
    expect(fs.existsSync(fixturePath)).toBe(true);
    expect(fixturePath.toLowerCase().endsWith('.md')).toBe(true);

    const renderer = new MermaidRenderer(fixturePath, fixtureDir);

    // This file is intentionally large and contains multiple Mermaid diagrams.
    expect(renderer.blocks.length).toBeGreaterThanOrEqual(3);

    // Spot-check we captured different diagram types.
    expect(renderer.blocks.some((b) => b.includes('flowchart'))).toBe(true);
    expect(renderer.blocks.some((b) => b.includes('sequenceDiagram'))).toBe(true);
  });
});
