import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import MermaidRenderer from '../index.js';

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'render-mermaid-single-test-'));
}

function writeFakeMmdcScript(scriptPath, bodyJs) {
  // Written as CommonJS so it can run from OS temp without a package.json.
  fs.writeFileSync(scriptPath, `/* eslint-disable */\n${bodyJs}\n`, 'utf-8');
}

function writeMarkdown(filePath, lines) {
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
}

function createConversionPaths(root) {
  const inMmd = path.join(root, 'in.mmd');
  const outSvg = path.join(root, 'out.svg');
  const outPng = path.join(root, 'out.png');
  const cfg = path.join(root, 'config.json');

  fs.writeFileSync(inMmd, 'graph TD\nA-->B\n', 'utf-8');
  fs.writeFileSync(cfg, '{"theme":"default"}', 'utf-8');

  return { inMmd, outSvg, outPng, cfg };
}

function pngHasSignature(pngPath) {
  const buf = fs.readFileSync(pngPath);
  return buf.length >= 8
    && buf[0] === 0x89
    && buf[1] === 0x50
    && buf[2] === 0x4E
    && buf[3] === 0x47
    && buf[4] === 0x0D
    && buf[5] === 0x0A
    && buf[6] === 0x1A
    && buf[7] === 0x0A;
}

describe('MermaidRenderer integration + validations (single file, no mocks)', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = makeTempRoot();
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('constructor validates missing path and markdown extension', () => {
    const outDir = path.join(tempRoot, 'out-basic');

    expect(() => new MermaidRenderer(path.join(tempRoot, 'missing.md'), outDir))
      .toThrow(/Document path does not exist/i);

    const txtPath = path.join(tempRoot, 'doc.txt');
    fs.writeFileSync(txtPath, 'nope', 'utf-8');
    expect(() => new MermaidRenderer(txtPath, outDir)).toThrow(/Document must be a Markdown file/i);
  });

  test('validates renderer option branches', () => {
    const mdPath = path.join(tempRoot, 'doc.md');
    fs.writeFileSync(mdPath, '# Doc\n', 'utf-8');

    expect(() => new MermaidRenderer(mdPath, tempRoot, { childOutput: 'nope' }))
      .toThrow(/childOutput must be one of/i);
    expect(() => new MermaidRenderer(mdPath, tempRoot, { scale: 0 }))
      .toThrow(/scale must be a positive number/i);
    expect(() => new MermaidRenderer(mdPath, tempRoot, { density: 0 }))
      .toThrow(/density must be a positive integer/i);
    expect(() => new MermaidRenderer(mdPath, tempRoot, { maxWidth: 0 }))
      .toThrow(/maxWidth must be a positive integer or null/i);
    expect(() => new MermaidRenderer(mdPath, tempRoot, { maxWidth: null })).not.toThrow();
    expect(() => new MermaidRenderer(mdPath, tempRoot, { mmdcPath: '' }))
      .toThrow(/mmdcPath must be a non-empty string/i);
  });

  test('extracts blocks and enforces block limits', () => {
    const mdPath = path.join(tempRoot, 'blocks.md');
    const outDir = path.join(tempRoot, 'out-blocks');

    writeMarkdown(mdPath, [
      '# Doc',
      '',
      '```mermaid',
      'graph TD',
      '  A --> B',
      '```',
      '',
      '```mermaid',
      'sequenceDiagram',
      '  Alice->>Bob: Hi',
      '```',
      '',
    ]);

    const renderer = new MermaidRenderer(mdPath, outDir);
    expect(renderer.blocks).toHaveLength(2);

    expect(() => new MermaidRenderer(mdPath, outDir, { maxBlocks: 1 }))
      .toThrow(/Too many Mermaid blocks/i);

    expect(() => new MermaidRenderer(mdPath, outDir, { maxBlockBytes: 1 }))
      .toThrow(/Mermaid block is too large/i);
  });

  test('enforces max file size', () => {
    const mdPath = path.join(tempRoot, 'big.md');
    const outDir = path.join(tempRoot, 'out-big');

    fs.writeFileSync(mdPath, 'x'.repeat(50), 'utf-8');
    expect(() => new MermaidRenderer(mdPath, outDir, { maxFileBytes: 10 }))
      .toThrow(/Document is too large/i);
  });

  test('resolves real mmdc binary path from installed dependency', () => {
    const mdPath = path.join(tempRoot, 'path-check.md');
    const outDir = path.join(tempRoot, 'out-path-check');
    fs.writeFileSync(mdPath, '# Doc\n', 'utf-8');

    const renderer = new MermaidRenderer(mdPath, outDir);
    const binPath = renderer.getMermaidDocumentBinaryPath();

    expect(typeof binPath).toBe('string');
    expect(fs.existsSync(binPath)).toBe(true);
  });

  test('run renders one PNG per block with a fake local mmdc script', async () => {
    const mdPath = path.join(tempRoot, 'int.md');
    const outDir = path.join(tempRoot, 'out-int');

    writeMarkdown(mdPath, [
      '# Doc',
      '',
      '```mermaid',
      'graph TD',
      'A-->B',
      '```',
      '',
      '```mermaid',
      'sequenceDiagram',
      'Alice->>Bob: Hi',
      '```',
      '',
    ]);

    const fakeMmdcPath = path.join(tempRoot, 'mmdc.js');
    writeFakeMmdcScript(
      fakeMmdcPath,
      `const fs = require('fs');
const path = require('path');

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : null;
}

const outSvg = argValue('-o');
if (!outSvg) process.exit(2);

fs.mkdirSync(path.dirname(outSvg), { recursive: true });
fs.writeFileSync(
  outSvg,
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect x="0" y="0" width="10" height="10" fill="black"/></svg>',
  'utf-8',
);
process.exit(0);`,
    );

    const renderer = new MermaidRenderer(mdPath, outDir, {
      mmdcPath: fakeMmdcPath,
      childOutput: 'ignore',
      maxConcurrency: 2,
      timeoutMs: 5_000,
    });

    await renderer.run();

    const pngs = fs.readdirSync(outDir).filter((f) => f.toLowerCase().endsWith('.png'));
    expect(pngs.length).toBe(2);
    expect(pngHasSignature(path.join(outDir, pngs[0]))).toBe(true);
  });

  test('captures stdout/stderr details on conversion failure when childOutput=capture', async () => {
    const mdPath = path.join(tempRoot, 'capture.md');
    const outDir = path.join(tempRoot, 'out-capture');
    fs.writeFileSync(mdPath, '```mermaid\ngraph TD\nA-->B\n```\n', 'utf-8');

    const fakeMmdcPath = path.join(tempRoot, 'mmdc-fail.js');
    writeFakeMmdcScript(
      fakeMmdcPath,
      `process.stdout.write('hello-stdout');
process.stderr.write('hello-stderr');
process.exit(3);`,
    );

    const renderer = new MermaidRenderer(mdPath, outDir, {
      mmdcPath: fakeMmdcPath,
      childOutput: 'capture',
    });

    const root = path.join(tempRoot, 'capture-paths');
    fs.mkdirSync(root, { recursive: true });
    const { inMmd, outSvg, outPng, cfg } = createConversionPaths(root);

    let err;
    try {
      await renderer.mermaidDocumentConversion(inMmd, outSvg, outPng, cfg);
    } catch (e) {
      err = e;
    }

    expect(err).toBeTruthy();
    expect(err.message).toMatch(/exit code 3/i);
    expect(err.cause).toEqual(
      expect.objectContaining({
        stdout: expect.stringContaining('hello-stdout'),
        stderr: expect.stringContaining('hello-stderr'),
      }),
    );
  });

  test('enforces maxSvgBytes before png conversion', async () => {
    const mdPath = path.join(tempRoot, 'svg-limit.md');
    const outDir = path.join(tempRoot, 'out-svg-limit');
    fs.writeFileSync(mdPath, '```mermaid\ngraph TD\nA-->B\n```\n', 'utf-8');

    const fakeMmdcPath = path.join(tempRoot, 'mmdc-bigsvg.js');
    writeFakeMmdcScript(
      fakeMmdcPath,
      `const fs = require('fs');
const path = require('path');

const idx = process.argv.indexOf('-o');
const outSvg = idx >= 0 ? process.argv[idx + 1] : null;
if (!outSvg) process.exit(2);

fs.mkdirSync(path.dirname(outSvg), { recursive: true });
const big = '<svg xmlns="http://www.w3.org/2000/svg">' + 'x'.repeat(500) + '</svg>';
fs.writeFileSync(outSvg, big, 'utf-8');
process.exit(0);`,
    );

    const renderer = new MermaidRenderer(mdPath, outDir, {
      mmdcPath: fakeMmdcPath,
      childOutput: 'ignore',
      maxSvgBytes: 50,
    });

    const root = path.join(tempRoot, 'svg-limit-paths');
    fs.mkdirSync(root, { recursive: true });
    const { inMmd, outSvg, outPng, cfg } = createConversionPaths(root);

    await expect(renderer.mermaidDocumentConversion(inMmd, outSvg, outPng, cfg))
      .rejects
      .toThrow(/Rendered SVG is too large/i);

    expect(fs.existsSync(outPng)).toBe(false);
  });

  test('times out long-running conversion', async () => {
    const mdPath = path.join(tempRoot, 'timeout.md');
    const outDir = path.join(tempRoot, 'out-timeout');
    fs.writeFileSync(mdPath, '```mermaid\ngraph TD\nA-->B\n```\n', 'utf-8');

    const fakeMmdcPath = path.join(tempRoot, 'mmdc-timeout.js');
    writeFakeMmdcScript(
      fakeMmdcPath,
      `setTimeout(() => { process.exit(0); }, 500);`,
    );

    const renderer = new MermaidRenderer(mdPath, outDir, {
      mmdcPath: fakeMmdcPath,
      childOutput: 'ignore',
      timeoutMs: 25,
    });

    const root = path.join(tempRoot, 'timeout-paths');
    fs.mkdirSync(root, { recursive: true });
    const { inMmd, outSvg, outPng, cfg } = createConversionPaths(root);

    await expect(renderer.mermaidDocumentConversion(inMmd, outSvg, outPng, cfg))
      .rejects
      .toThrow(/timed out/i);
  });

  test('parses Mermaid blocks from real-world fixture', () => {
    const fixturePath = fileURLToPath(new URL('./Threat Model Review - 2026-02-25.md', import.meta.url));
    const fixtureDir = path.dirname(fixturePath);

    const renderer = new MermaidRenderer(fixturePath, fixtureDir);
    expect(renderer.blocks.length).toBeGreaterThanOrEqual(3);
    expect(renderer.blocks.some((b) => b.includes('flowchart'))).toBe(true);
    expect(renderer.blocks.some((b) => b.includes('sequenceDiagram'))).toBe(true);
  });
});
