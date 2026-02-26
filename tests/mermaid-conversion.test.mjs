import fs from 'fs';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';
import { jest } from '@jest/globals';

const spawnMock = jest.fn();

jest.unstable_mockModule('child_process', () => ({
  spawn: spawnMock,
}));

const { default: MermaidRenderer } = await import('../render-mermaid.js');

function createTempPaths(root) {
  const inputPath = path.join(root, 'in.mmd');
  const svgPath = path.join(root, 'out.svg');
  const pngPath = path.join(root, 'out.png');
  const configPath = path.join(root, 'config.json');

  fs.writeFileSync(inputPath, 'graph TD\nA-->B\n', 'utf-8');
  fs.writeFileSync(configPath, '{"theme":"default"}', 'utf-8');
  return { inputPath, svgPath, pngPath, configPath };
}

describe('MermaidRenderer.mermaidDocumentConversion', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'render-mermaid-conv-test-'));
    spawnMock.mockReset();
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('uses node to execute .js mmdc binaries and resolves on exit code 0', async () => {
    const mdPath = path.join(tempRoot, 'doc.md');
    fs.writeFileSync(mdPath, '```mermaid\ngraph TD\nA-->B\n```\n', 'utf-8');

    const renderer = new MermaidRenderer(mdPath, tempRoot);
    renderer.getMermaidDocumentBinaryPath = () => path.join(tempRoot, 'mmdc.js');
    const convertSpy = jest.spyOn(renderer, 'convertSVGToPNG').mockImplementation(async () => {});

    const { inputPath, svgPath, pngPath, configPath } = createTempPaths(tempRoot);

    spawnMock.mockImplementation((_command, _args) => {
      const child = new EventEmitter();
      process.nextTick(() => child.emit('exit', 0));
      return child;
    });

    await renderer.mermaidDocumentConversion(inputPath, svgPath, pngPath, configPath);

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [command, args] = spawnMock.mock.calls[0];
    expect(command).toBe(process.execPath);
    expect(args[0]).toContain('mmdc.js');
    expect(args).toEqual(
      expect.arrayContaining(['-i', inputPath, '-o', svgPath, '-c', configPath]),
    );

    expect(convertSpy).toHaveBeenCalledWith(svgPath, pngPath);
  });

  test('uses binary directly for non-js mmdc binaries', async () => {
    const mdPath = path.join(tempRoot, 'doc.md');
    fs.writeFileSync(mdPath, '```mermaid\ngraph TD\nA-->B\n```\n', 'utf-8');

    const renderer = new MermaidRenderer(mdPath, tempRoot);
    const fakeBinary = path.join(tempRoot, 'mmdc');
    renderer.getMermaidDocumentBinaryPath = () => fakeBinary;
    jest.spyOn(renderer, 'convertSVGToPNG').mockImplementation(async () => {});

    const { inputPath, svgPath, pngPath, configPath } = createTempPaths(tempRoot);

    spawnMock.mockImplementation((_command, _args) => {
      const child = new EventEmitter();
      process.nextTick(() => child.emit('exit', 0));
      return child;
    });

    await renderer.mermaidDocumentConversion(inputPath, svgPath, pngPath, configPath);

    const [command, args] = spawnMock.mock.calls[0];
    expect(command).toBe(fakeBinary);
    expect(args).toEqual(expect.arrayContaining(['-i', inputPath, '-o', svgPath]));
  });

  test('rejects on non-zero exit code', async () => {
    const mdPath = path.join(tempRoot, 'doc.md');
    fs.writeFileSync(mdPath, '```mermaid\ngraph TD\nA-->B\n```\n', 'utf-8');

    const renderer = new MermaidRenderer(mdPath, tempRoot);
    renderer.getMermaidDocumentBinaryPath = () => path.join(tempRoot, 'mmdc.js');

    const { inputPath, svgPath, pngPath, configPath } = createTempPaths(tempRoot);

    spawnMock.mockImplementation(() => {
      const child = new EventEmitter();
      process.nextTick(() => child.emit('exit', 2));
      return child;
    });

    await expect(renderer.mermaidDocumentConversion(inputPath, svgPath, pngPath, configPath))
      .rejects
      .toThrow(/exit code 2/i);
  });

  test('rejects on spawn error', async () => {
    const mdPath = path.join(tempRoot, 'doc.md');
    fs.writeFileSync(mdPath, '```mermaid\ngraph TD\nA-->B\n```\n', 'utf-8');

    const renderer = new MermaidRenderer(mdPath, tempRoot);
    renderer.getMermaidDocumentBinaryPath = () => path.join(tempRoot, 'mmdc.js');

    const { inputPath, svgPath, pngPath, configPath } = createTempPaths(tempRoot);

    spawnMock.mockImplementation(() => {
      const child = new EventEmitter();
      process.nextTick(() => child.emit('error', new Error('spawn failed')));
      return child;
    });

    await expect(renderer.mermaidDocumentConversion(inputPath, svgPath, pngPath, configPath))
      .rejects
      .toThrow(/spawn failed/i);
  });
});
