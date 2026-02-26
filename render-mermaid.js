import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import sharp from 'sharp';

export class MermaidRenderer {
  constructor(documentPath, destinationPath = process.cwd()) {
    this.documentPath = path.resolve(documentPath);
    this.destinationPath = path.resolve(destinationPath);

    if (!fs.existsSync(this.documentPath)) {
      throw new Error(`Document path does not exist: ${this.documentPath}`);
    }

    const documentStat = fs.statSync(this.documentPath);
    if (!documentStat.isFile()) {
      throw new Error(`Document path is not a file: ${this.documentPath}`);
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
    return blocks;
  }

  async run() {
   process.stdout.write(`Found ${this.blocks.length} Mermaid blocks in the document.\n`);

    const tasks = this.blocks.map(async (block) => {
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
        );
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    await Promise.all(tasks);
  }

  getMermaidDocumentBinaryPath() {
    const require = createRequire(import.meta.url);
    const mermaidCliPackageJsonPath = require.resolve('@mermaid-js/mermaid-cli/package.json');
    const mermaidCliDir = path.dirname(mermaidCliPackageJsonPath);
    const mermaidCliPkg = JSON.parse(fs.readFileSync(mermaidCliPackageJsonPath, 'utf-8'));

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

      const child = spawn(command, commandArgs, {
        stdio: 'inherit',
        windowsHide: true,
      });

      child.on('error', (err) => {
        reject(err);
      });
      child.on('exit', async (code) => {
        if (code === 0) {
          try {
            await this.convertSVGToPNG(svgOutputPath, pngOutputPath);
            resolve();
          } catch (err) {
            reject(err);
          }
        } else {
          reject(new Error(`Mermaid document conversion failed with exit code ${code}`));
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
