import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { jest } from '@jest/globals';

import MermaidRenderer from '../render-mermaid.js';

describe('MermaidRenderer', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'render-mermaid-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  test('extracts mermaid blocks from markdown (including CRLF)', () => {
    const mdPath = path.join(tempRoot, 'doc.md');
    const outDir = path.join(tempRoot, 'out');

    const content = [
      '# Doc',
      '',
      '```mermaid\r',
      'graph TD\r',
      '  A --> B\r',
      '```\r',
      '',
      'Text',
      '',
      '```mermaid\r',
      'sequenceDiagram\r',
      '  Alice->>Bob: Hi\r',
      '```\r',
      '',
    ].join('\n');

    fs.writeFileSync(mdPath, content, 'utf-8');

    const renderer = new MermaidRenderer(mdPath, outDir);
    expect(renderer.blocks).toHaveLength(2);
    expect(renderer.blocks[0]).toContain('graph TD');
    expect(renderer.blocks[1]).toContain('sequenceDiagram');
  });

  test('validates document path and extension', () => {
    const outDir = path.join(tempRoot, 'out');

    expect(() => new MermaidRenderer(path.join(tempRoot, 'missing.md'), outDir)).toThrow(
      /Document path does not exist/i,
    );

    const dirPath = path.join(tempRoot, 'a-dir');
    fs.mkdirSync(dirPath);
    expect(() => new MermaidRenderer(dirPath, outDir)).toThrow(/Document path is not a file/i);

    const txtPath = path.join(tempRoot, 'doc.txt');
    fs.writeFileSync(txtPath, 'nope', 'utf-8');
    expect(() => new MermaidRenderer(txtPath, outDir)).toThrow(/Document must be a Markdown file/i);
  });

  test('creates destination directory if missing', () => {
    const mdPath = path.join(tempRoot, 'doc.md');
    const outDir = path.join(tempRoot, 'does-not-exist-yet');

    fs.writeFileSync(mdPath, '```mermaid\ngraph TD\nA-->B\n```\n', 'utf-8');

    expect(fs.existsSync(outDir)).toBe(false);
    // Constructor should create it
    new MermaidRenderer(mdPath, outDir);
    expect(fs.existsSync(outDir)).toBe(true);
  });

  test('run() orchestrates one output PNG per mermaid block (without invoking mmdc)', async () => {
    const mdPath = path.join(tempRoot, 'doc.md');
    const outDir = path.join(tempRoot, 'out');

    fs.writeFileSync(
      mdPath,
      [
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
      ].join('\n'),
      'utf-8',
    );

    const uuidSpy = jest.spyOn(crypto, 'randomUUID');
    uuidSpy.mockImplementationOnce(() => 'id-1');
    uuidSpy.mockImplementationOnce(() => 'id-2');

    const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const tempDirs = [];

    class TestRenderer extends MermaidRenderer {
      async mermaidDocumentConversion(
        inputPath,
        svgOutputPath,
        pngOutputPath,
        mermaidConfigurationPath,
      ) {
        tempDirs.push(path.dirname(inputPath));

        expect(fs.existsSync(inputPath)).toBe(true);
        expect(fs.readFileSync(inputPath, 'utf-8').length).toBeGreaterThan(0);
        expect(fs.existsSync(mermaidConfigurationPath)).toBe(true);

        fs.writeFileSync(svgOutputPath, '<svg xmlns="http://www.w3.org/2000/svg" />', 'utf-8');
        fs.writeFileSync(pngOutputPath, 'png', 'utf-8');
      }
    }

    const renderer = new TestRenderer(mdPath, outDir);
    await renderer.run();

    expect(stdoutSpy).toHaveBeenCalled();

    expect(fs.existsSync(path.join(outDir, 'diagram-id-1.png'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'diagram-id-2.png'))).toBe(true);

    for (const dir of tempDirs) {
      expect(fs.existsSync(dir)).toBe(false);
    }
  });
});
