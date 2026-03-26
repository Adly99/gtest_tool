import { select, checkbox, input } from '@inquirer/prompts';
import { glob } from 'glob';
import fs from 'fs';
import path from 'path';
import { runFocusPipeline } from './pipelines/generationPipeline.js';
import { FunctionInventoryExtractor } from './parsers/functionInventoryExtractor.js';
import { aiService } from './services/aiService.js';
import { CompileCommandsParser } from './parsers/compileCommandsParser.js';

export async function startTerminalUI(initialDir = process.cwd(), initialFile = null) {
  console.log('\n=======================================================');
  console.log('🛠️  GTest Architect: Interactive Terminal Dashboard  🛠️');
  console.log('=======================================================\n');

  try {
    let selectedFile = initialFile;

    // ── Step 1: File selection ────────────────────────────────────────────────
    if (!selectedFile) {
      console.log('Scanning workspace for C/C++ files…');
      const files = await glob('**/*.{cpp,cc,cxx,c}', {
        cwd: initialDir,
        ignore: ['node_modules/**', '.gtest_tool/**', 'build/**'],
      });

      if (files.length === 0) {
        console.log('❌ No C++ source files found in the current directory.');
        return;
      }

      const choices = files.map(f => ({
        name: `${path.basename(f)}  (${path.dirname(f)})`,
        value: path.join(initialDir, f),
      }));

      selectedFile = await select({
        message: 'Select a source file to analyze and generate tests for:',
        choices,
        pageSize: 15,
      });
    }

    // ── Step 2: Context inputs ────────────────────────────────────────────────
    const projDir = await input({
      message: 'Project Root Directory [optional, Enter to skip]:',
      default: initialDir,
    });

    const compileCmdsDefault = path.join(projDir, 'compile_commands.json');
    const compileCmdsInput = await input({
      message: 'Path to compile_commands.json [Enter to skip]:',
      default: fs.existsSync(compileCmdsDefault) ? compileCmdsDefault : '',
    });
    const compileCmds = compileCmdsInput.trim();

    const stubsInput = await input({
      message: 'Stubs / Mocks Include Directory [Enter to skip]:',
      default: '',
    });
    const stubsDir = stubsInput.trim();

    // ── Step 3: Extract function inventory ───────────────────────────────────
    console.log(`\n📄 Analyzing: ${selectedFile}`);
    console.log('Extracting functions…');

    const extractor = new FunctionInventoryExtractor(aiService);
    const inventory = await extractor.extractInventory(selectedFile);

    if (inventory.length === 0) {
      console.log('❌ No functions found in this file.');
      return;
    }

    // ── Step 4: Function selection checkbox ──────────────────────────────────
    const funcChoices = inventory.map((fn, idx) => {
      const tier = (fn.priority || 0) > 70 ? '🔴' : (fn.priority || 0) > 40 ? '🟠' : '🟢';
      const dox  = fn.doxygen_found ? ' [Doxygen]' : '';
      const pri  = fn.priority != null ? ` (priority: ${fn.priority})` : '';
      return {
        name:    `${tier} ${fn.signature}${dox}${pri}`,
        value:   fn.signature, // pass the signature, not index
        checked: fn.selected_for_focus ?? (fn.priority || 0) > 40,
      };
    });

    let selectedSignatures = await checkbox({
      message: `Select functions to generate tests for (${inventory.length} found):`,
      choices: funcChoices,
      pageSize: 20,
    });

    if (selectedSignatures.length === 0) {
      console.log('No functions selected — exiting.');
      return;
    }

    // ── Step 5: Load compile context ──────────────────────────────────────────
    let compileContext = { defines: [], includes: [] };
    if (compileCmds && fs.existsSync(compileCmds)) {
      const ccParser = new CompileCommandsParser(compileCmds);
      const loaded   = await ccParser.loadDatabase();
      if (loaded) {
        compileContext = ccParser.extractFileContext(selectedFile);
        console.log(`📦 Compile context: ${compileContext.defines.length} defines, ${compileContext.includes.length} includes`);
      }
    }

    // ── Step 6: Run pipeline for selected functions ───────────────────────────
    console.log(`\n🚀 Launching pipeline for ${selectedSignatures.length} selected function(s)…\n`);

    const pipelineOptions = {
      compileCommandsPath: compileCmds || null,
      stubsPath: stubsDir || null,
      // Pass explicit selected signatures so pipeline can filter
      selectedSignatures,
    };

    await runFocusPipeline(selectedFile, selectedSignatures.length, pipelineOptions);
    console.log('\n✅ Done — GTest Architect generation complete.');

  } catch (err) {
    if (err.name === 'ExitPromptError') {
      console.log('\nExiting interactive mode.');
    } else {
      console.error('\n❌ Terminal UI error:', err.message);
    }
  }
}
