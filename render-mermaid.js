import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import {
  collectStream,
  findPackageDirInNodeModules,
  findPackageRootFromResolvedFile,
  mergeOptions,
  runWithConcurrency,
} from './lib/helpers.js';

export class MermaidRenderer {
  constructor(documentPath, destinationPath = process.cwd(), options = {}) {
    this.documentPath = path.resolve(documentPath);
    this.destinationPath = path.resolve(destinationPath);
    this.options = mergeOptions(options);

    if (!fs.existsSync(this.documentPath)) {
      throw new Error(`Document path does not exist: ${this.documentPath}`);
    }

    const documentStat = fs.statSync(this.documentPath);
    if (!documentStat.isFile()) {
      throw new Error(`Document path is not a file: ${this.documentPath}`);
    }

    if (documentStat.size > this.options.maxFileBytes) {
      throw new Error(
        `Document is too large (${documentStat.size} bytes). Max allowed is ${this.options.maxFileBytes} bytes.`,
      );
    }

    const ext = path.extname(this.documentPath).toLowerCase();
    if (!['.md', '.markdown'].includes(ext)) {
      throw new Error(`Document must be a Markdown file (.md/.markdown): ${this.documentPath}`);
    }

    if (!fs.existsSync(this.destinationPath)) {
      fs.mkdirSync(this.destinationPath, { recursive: true });
    }

    const destinationStat = fs.statSync(this.destinationPath);
    if (!destinationStat.isDirectory()) {
      throw new Error(`Destination path is not a directory: ${this.destinationPath}`);
    }

    this.documentContent = fs.readFileSync(this.documentPath, 'utf-8');
    this.blocks = this.extractMermaidBlocks();
    this.mermaidConfiguration = {
      theme: "default",
      themeVariables: {
        fontFamily: "Arial, Helvetica, sans-serif",
      },
      flowchart: { htmlLabels: false },
      sequence: { useMaxWidth: true },
      gantt: { useMaxWidth: true },
      journey: { useMaxWidth: true },
      mindmap: { useMaxWidth: true },
    };
  }

  extractMermaidBlocks() {
    const regexPattern = /```mermaid\s*\r?\n([\s\S]*?)\r?\n```/g;
    const blocks = [];
    let match;
    while ((match = regexPattern.exec(this.documentContent)) !== null) {
      const code = match[1].trim();
      blocks.push(code);
    }

    if (blocks.length > this.options.maxBlocks) {
      throw new Error(`Too many Mermaid blocks (${blocks.length}). Max allowed is ${this.options.maxBlocks}.`);
    }

    for (const block of blocks) {
      const bytes = Buffer.byteLength(block, 'utf-8');
      if (bytes > this.options.maxBlockBytes) {
        throw new Error(
          `Mermaid block is too large (${bytes} bytes). Max allowed is ${this.options.maxBlockBytes} bytes.`,
        );
      }
    }

    return blocks;
  }

  async run() {
    process.stdout.write(`Found ${this.blocks.length} Mermaid blocks in the document.\n`);

    await runWithConcurrency(this.blocks, this.options.maxConcurrency, async (block) => {
      const id = crypto.randomUUID();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `mermaid-${id}-`));
      const tempInputPath = path.join(tmpDir, `diagram-${id}.mmd`);
      const tempSVGPath = path.join(tmpDir, `diagram-${id}.svg`);
      const tempMermaidConfigurationPath = path.join(tmpDir, `mermaid-config-${id}.json`);
      const outputPath = path.join(this.destinationPath, `diagram-${id}.png`);

      try {
        fs.writeFileSync(tempInputPath, block, 'utf-8');
        fs.writeFileSync(
          tempMermaidConfigurationPath,
          JSON.stringify(this.mermaidConfiguration, null, 2),
          'utf-8',
        );

        await this.mermaidDocumentConversion(
          tempInputPath,
          tempSVGPath,
          outputPath,
          tempMermaidConfigurationPath,
          this.options.backgroundColor,
          this.options.scale,
        );
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  }

  getMermaidDocumentBinaryPath() {
    if (this.options.mmdcPath) {
      const resolved = path.resolve(this.options.mmdcPath);
      if (!fs.existsSync(resolved)) {
        throw new Error(`mmdcPath does not exist: ${resolved}`);
      }
      return resolved;
    }

    // Avoid using Node's package "exports" resolution for subpaths; instead,
    // locate the package.json directly via a node_modules search.
    const startDir = path.dirname(fileURLToPath(import.meta.url));
    const found =
      findPackageDirInNodeModules('@mermaid-js/mermaid-cli', startDir)
      ?? findPackageDirInNodeModules('@mermaid-js/mermaid-cli', process.cwd());

    let mermaidCliDir;
    let mermaidCliPkg;
    if (found) {
      mermaidCliDir = found.packageDir;
      mermaidCliPkg = found.packageJson;
    } else {
      // Last-resort fallback if node_modules layout is unusual.
      const require = createRequire(import.meta.url);
      const resolved = require.resolve('sharp');
      const rootInfo = findPackageRootFromResolvedFile(resolved, 'sharp');
      const fromSharp = findPackageDirInNodeModules('@mermaid-js/mermaid-cli', rootInfo.packageDir);
      if (!fromSharp) {
        throw new Error('Unable to locate @mermaid-js/mermaid-cli package.json');
      }
      mermaidCliDir = fromSharp.packageDir;
      mermaidCliPkg = fromSharp.packageJson;
    }

    const bin = mermaidCliPkg?.bin;
    let binRelativePath;
    if (typeof bin === 'string') {
      binRelativePath = bin;
    } else if (bin && typeof bin === 'object') {
      binRelativePath = bin.mmdc ?? Object.values(bin)[0];
    }

    if (!binRelativePath) {
      throw new Error('Unable to locate mmdc binary from @mermaid-js/mermaid-cli');
    }

    return path.resolve(mermaidCliDir, binRelativePath);
  }

  mermaidDocumentConversion(inputPath, svgOutputPath, pngOutputPath, mermaidConfigurationPath, backgroundColor = 'white', scale = 1) {
    return new Promise((resolve, reject) => {
      const mermaidDocumentBinaryPath = this.getMermaidDocumentBinaryPath();
      const args = [
        '-i', inputPath,
        '-o', svgOutputPath,
        '-b', backgroundColor,
        '-s', scale.toString(),
        '-c', mermaidConfigurationPath,
      ];

      const isJavaScriptBinary = ['.js', '.mjs', '.cjs'].includes(path.extname(mermaidDocumentBinaryPath).toLowerCase());
      const command = isJavaScriptBinary ? process.execPath : mermaidDocumentBinaryPath;
      const commandArgs = isJavaScriptBinary ? [mermaidDocumentBinaryPath, ...args] : args;

      const stdio = this.options.childOutput === 'inherit'
        ? 'inherit'
        : this.options.childOutput === 'ignore'
          ? 'ignore'
          : ['ignore', 'pipe', 'pipe'];

      const child = spawn(command, commandArgs, {
        stdio,
        windowsHide: true,
      });

      const capturedStdout = this.options.childOutput === 'capture'
        ? collectStream(child.stdout, { maxBytes: 64 * 1024 })
        : null;
      const capturedStderr = this.options.childOutput === 'capture'
        ? collectStream(child.stderr, { maxBytes: 64 * 1024 })
        : null;

      let didTimeout = false;
      const timeoutHandle = setTimeout(() => {
        didTimeout = true;
        try {
          child.kill();
        } catch {
          // ignore
        }
      }, this.options.timeoutMs);

      child.on('error', (err) => {
        clearTimeout(timeoutHandle);
        reject(err);
      });
      child.on('exit', async (code) => {
        clearTimeout(timeoutHandle);

        if (didTimeout) {
          reject(new Error(`Mermaid document conversion timed out after ${this.options.timeoutMs}ms`));
          return;
        }

        if (code === 0) {
          try {
            const svgStat = fs.statSync(svgOutputPath);
            if (svgStat.size > this.options.maxSvgBytes) {
              reject(
                new Error(
                  `Rendered SVG is too large (${svgStat.size} bytes). Max allowed is ${this.options.maxSvgBytes} bytes.`,
                ),
              );
              return;
            }

            await this.convertSVGToPNG(
              svgOutputPath,
              pngOutputPath,
              this.options.density,
              this.options.maxWidth,
            );
            resolve();
          } catch (err) {
            reject(err);
          }
        } else {
          // Avoid leaking diagram content into logs. Provide a safe, high-level error.
          const err = new Error(`Mermaid document conversion failed with exit code ${code}`);
          if (this.options.childOutput === 'capture') {
            err.cause = {
              stdout: capturedStdout?.getText?.() ?? '',
              stderr: capturedStderr?.getText?.() ?? '',
            };
          }
          reject(err);
        }
      });
    });
  }

  async convertSVGToPNG(inputPath, outputPath, density = 350, maxWidth = null) {
    let pipeline = sharp(inputPath, { density });
    if (maxWidth && Number.isFinite(maxWidth)) {
      pipeline = pipeline.resize({ width: maxWidth, withoutEnlargement: true });
    }
    await pipeline.png().toFile(outputPath);
  }
}

export default MermaidRenderer;
