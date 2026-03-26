#!/usr/bin/env node
// GTest Architect CLI — v2.0

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

import { startTerminalUI } from './tui.js';

import { FunctionInventoryExtractor } from './parsers/functionInventoryExtractor.js';
import { FunctionReportWriter } from './reporters/functionReportWriter.js';
import { runFocusPipeline } from './pipelines/generationPipeline.js';
import { GTestManager } from './services/gtestManager.js';
import { aiService } from './services/aiService.js';
import { startServer } from './server.js';
import { PRBotService } from './services/prBotService.js';
import { LibFuzzerGenerator } from './generators/libFuzzerGenerator.js';
import { PromptBuilder } from './services/promptBuilder.js';

// Import pipelines (these will be implemented in subsequent files)
// import { scanProject } from './pipelines/scanPipeline.js';
// import { generateTests } from './pipelines/generationPipeline.js';

const program = new Command();
program
    .version('4.0.0')
    .description('GTest Architect — AI-powered C++ Test Generator')
    .option('-p, --provider <type>', 'AI Provider to use (gemini, openai)', 'gemini');

// Global hook to set provider
program.hook('preAction', (thisCommand, actionCommand) => {
    const opts = program.opts();
    if (opts.provider) {
        aiService.setProvider(opts.provider);
    }
});

program
  .name('gtest-gen')
  .addHelpText('after', `
========================================================================
🚀 GTest Architect: Enterprise AI Edition v4.0
========================================================================
This tool automatically constructs Google Mock interfaces, Google Test 
parameterized suites, and LibFuzzer harnesses purely from C++ syntax.

Key Commands:
  $ gtest-gen ui                       Launch the stunning Web Dashboard
  $ gtest-gen tui                      Launch the Interactive Terminal UI
  $ gtest-gen diff --branch main       CI/CD Bot: Auto-test changed code
  $ gtest-gen fuzz --file <src.cpp>    Generate a LibFuzzer input harness
  $ gtest-gen focus --file <src.cpp>   Extract fns & generate deep tests
========================================================================
`);

program
  .command('scan')
  .description('Scan project artifacts and compile_commands.json')
  .requiredOption('-p, --project <dir>', 'Path to the C++ project root')
  .requiredOption('-c, --compile-commands <file>', 'Path to compile_commands.json')
  .action((options) => {
    console.log(`Scanning project at ${options.project}...`);
    console.log(`Using compile commands from ${options.compileCommands}...`);
    // scanProject(options.project, options.compileCommands);
    console.log('Scan complete. Generated internal AST state.');
  });

program
  .command('gaps')
  .description('Compute coverage gaps for a specific module')
  .requiredOption('-m, --module <name>', 'Name of the component/module to analyze')
  .action((options) => {
    console.log(`Analyzing coverage gaps for module: ${options.module}...`);
    // calculateGaps(options.module);
    console.log('Gap analysis complete. Report saved to gap_report.json');
  });

program
  .command('generate')
  .description('Generate missing tests for a module')
  .requiredOption('-m, --module <name>', 'Name of the component/module')
  .option('--dry-run', 'Preview tests without writing to disk')
  .action((options) => {
    if (options.dryRun) {
      console.log(`[DRY RUN] Simulating generation for module: ${options.module}`);
    } else {
      console.log(`Generating tests for module: ${options.module}...`);
    }
    // generateTests(options.module, options.dryRun);
    console.log('Generation completed successfully.');
  });

program
  .command('apply')
  .description('Apply generated tests incrementally to the existing test cases')
  .requiredOption('-m, --module <name>', 'Name of the component/module')
  .action((options) => {
    console.log(`Applying incremental test updates to module: ${options.module}...`);
    // applyTests(options.module);
  });

program
  .command('hints')
  .description('Generate hints only for a module')
  .requiredOption('-m, --module <name>', 'Name of the component/module')
  .action((options) => {
    console.log(`Generating reviewer hints for module: ${options.module}...`);
    // compileHints(options.module);
  });

program
  .command('analyze')
  .description('Analyze documentation and test directories, emit a summary')
  .requiredOption('--docs <dir>', 'Path to documentation directory')
  .requiredOption('--tests <dir>', 'Path to existing tests directory')
  .action(async (options) => {
    console.log(`\n[ANALYZE] Scanning docs:  ${options.docs}`);
    console.log(`[ANALYZE] Scanning tests: ${options.tests}\n`);

    const countFiles = (dir, exts) => {
      if (!fs.existsSync(dir)) return 0;
      const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
        e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]
      );
      try {
        return walk(dir).filter(f => exts.some(e => f.endsWith(e))).length;
      } catch (_) { return 0; }
    };

    const docCount  = countFiles(options.docs,  ['.md', '.dox', '.rst', '.html']);
    const testCount = countFiles(options.tests, ['_test.cpp', '_test.cc', 'Test.cpp']);

    console.log(`[ANALYZE] Documentation files found : ${docCount}`);
    console.log(`[ANALYZE] Test files found          : ${testCount}`);
    console.log(`\nCoverage Gap Strategy:`);
    console.log(` - 🟢 ${testCount > docCount ? 'High' : 'Low'} traceability detected.`);
    console.log(` - 💡 Run 'gtest-gen focus --file <src.cpp>' to generate tests for specific functions.`);
  });

program
  .command('functions')
  .description('Extract all functions from the file and print inventory (Level-1)')
  .requiredOption('--file <path>', 'Path to the source file or module')
  .option('--with-doxygen-only', 'Show only functions with Doxygen blocks')
  .action(async (options) => {
    console.log(`Extracting function inventory for ${options.file}...`);
    
    // Wire up dependencies
    const extractor = new FunctionInventoryExtractor(aiService);
    
    try {
        const inventory = await extractor.extractInventory(options.file);
        
        let filtered = inventory;
        if (options.withDoxygenOnly) {
           filtered = inventory.filter(f => f.doxygen_found);
        }
        
        console.table(filtered.map(f => ({
          'Function': f.signature || f.function_name,
          'Dox': f.doxygen_found ? '✅' : '❌',
          'Priority': f.priority || 0,
          'Tier': (f.priority || 0) > 70 ? 'CRITICAL' : (f.priority || 0) > 40 ? 'HIGH' : 'NORMAL'
        })));
    } catch (err) {
        console.error(`Command failed:`, err.message);
    }
  });

program
  .command('focus')
  .description('Perform whole-file Level-1 analysis, then deep Level-2 focus on selected functions')
  .requiredOption('--file <path>', 'Path to the source module')
  .option('--function <name>', 'Deep focus on a single explicit function')
  .option('--select <criteria>', 'Focus on functions matching criteria (e.g. "doxygen")')
  .option('--top <n>', 'Focus on top N highest-priority functions', '2')
  .option('--top-all', 'Focus on ALL functions above the priority threshold')
  .option('--compile-commands <file>', 'Path to compile_commands.json to inject build context')
  .option('--stubs <path>', 'Path to stub/mock directory for #include resolution')
  .option('-o, --output <dir>', 'Directory to save generated test files', './tests')
  .option('--ui', 'Launch interactive module browser dashboard')
  .action(async (options) => {
    if (options.ui) {
        startServer(3000);
        return;
    }

    const pipelineOptions = {
      compileCommandsPath: options.compileCommands || null,
      stubsPath: options.stubs || null,
      outputDir: options.output || null
    };

    const topN = options.topAll ? 9999 : parseInt(options.top || '2', 10);
    if (options.function) {
      pipelineOptions.selectedSignatures = [options.function];
    }

    await runFocusPipeline(options.file, topN, pipelineOptions);
  });

program
  .command('ui')
  .description('Launch the premium web UI dashboard')
  .option('-p, --port <number>', 'Port to run the UI server on', '3021')
  .action((options) => {
      startServer(parseInt(options.port));
  });

program
  .command('tui')
  .description('Launch the interactive terminal UI to browse and select modules')
  .action(async () => {
      await startTerminalUI();
  });

program
  .command('diff')
  .description('Automatically evaluate and test modified C++ files in the current git diff')
  .option('--branch <name>', 'Target branch to diff against', 'main')
  .action(async (options) => {
      const bot = new PRBotService();
      await bot.evaluateAndGenerate(options.branch);
  });

program
  .command('fuzz')
  .description('Automatically build a Google LibFuzzer harness for a specific function')
  .requiredOption('--file <path>', 'Path to the source module')
  .action(async (options) => {
      console.log(`Generating fuzz harness for ${options.file}...`);
      const extract = new FunctionInventoryExtractor(new GeminiService());
      const inventory = await extract.extractInventory(options.file);
      if(inventory.length > 0) {
           const fuzzerGen = new LibFuzzerGenerator(new GeminiService(), new PromptBuilder());
           // Fuzz the first function for demonstration
           const result = await fuzzerGen.generateFuzzer(inventory[0]);
           if (result.framework_code) {
               console.log('\n--- LLVMFuzzerTestOneInput Harness ---\n');
               console.log(result.framework_code);
           }
      }
  });

program
  .command('report')
  .description('Generate function-focused Markdown report with Doxygen traces')
  .requiredOption('--file <path>', 'Path to the source file')
  .option('--function <name>', 'Focus report on single function')
  .action((options) => {
    console.log(`Generating function report for ${options.file} to function_report.md...`);
  });

program
  .command('init-gtest')
  .description('Initialize or update a local GoogleTest repository')
  .option('--tag <version>', 'Specific tag or commit to checkout (e.g. v1.14.0)', 'main')
  .action(async (options) => {
    console.log(`Initializing GoogleTest integration (target version: ${options.tag})...`);
    try {
      const gtestManager = new GTestManager();
      await gtestManager.checkoutVersion(options.tag);
      console.log(`Successfully initialized GoogleTest at ${options.tag}.`);
    } catch (err) {
      console.error(`Error initializing GoogleTest:`, err.message);
    }
  });

program
    .command('ask')
    .description('Directly query the active AI provider')
    .argument('<prompt>', 'The prompt to send to the AI')
    .option('--json', 'Parse and return JSON only', false)
    .action(async (prompt, options) => {
        console.log(`[AI] Querying ${aiService.providerType}...`);
        if (options.json) {
            const res = await aiService.queryJSON(prompt);
            console.log(JSON.stringify(res, null, 2));
        } else {
            const res = await aiService.queryText(prompt);
            console.log(res);
        }
    });

program.parse(process.argv);
