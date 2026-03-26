import fs from 'fs';
import path from 'path';
import { aiService } from '../services/aiService.js';
import { FunctionInventoryExtractor } from '../parsers/functionInventoryExtractor.js';
import { PromptBuilder } from '../services/promptBuilder.js';
import { GTestAdapter } from '../generators/adapters/gtestAdapter.js';
import { CppUnitTestGenerator } from '../generators/cppUnitTestGenerator.js';
import { WholeFileAnalyzer } from '../analyzers/wholeFileAnalyzer.js';
import { FunctionPrioritizationEngine } from '../analyzers/functionPrioritizationEngine.js';
import { CompileCommandsParser } from '../parsers/compileCommandsParser.js';
import { MutationTestingService } from '../services/mutationTestingService.js';

/**
 * Full Level-1 → Level-2 test generation pipeline.
 *
 * @param {string} filePath          - C++ source file to analyze
 * @param {number} topN              - number of top-priority functions to target
 * @param {Object} pipelineOptions   - { compileCommandsPath, stubsPath }
 */
export async function runFocusPipeline(filePath, topN = 2, pipelineOptions = {}) {
  if (!fs.existsSync(filePath)) {
    console.error(`[PIPELINE] ❌ File not found: ${filePath}`);
    return;
  }

  console.log(`\n[PIPELINE] ═══════════════════════════════════════════════`);
  console.log(`[PIPELINE] GTest Architect — Focus Pipeline`);
  console.log(`[PIPELINE] Target: ${filePath}`);
  console.log(`[PIPELINE] ═══════════════════════════════════════════════\n`);

  // ── 1. Boot Services ──────────────────────────────────────────────────────────
  const gemini    = aiService;
  const builder   = new PromptBuilder();
  const adapter   = new GTestAdapter();
  const testGen   = new CppUnitTestGenerator(gemini, builder, adapter);
  const inventoryExtractor = new FunctionInventoryExtractor(gemini);
  const wholeFileAnalyzer  = new WholeFileAnalyzer(gemini);
  const prioritizer = new FunctionPrioritizationEngine();
  const mutationService = new MutationTestingService();

  // ── 2. Resolve Compile Context ────────────────────────────────────────────────
  let compileContext = { defines: [], includes: [] };
  if (pipelineOptions.compileCommandsPath && fs.existsSync(pipelineOptions.compileCommandsPath)) {
    console.log(`[PIPELINE] 📦 Loading compile context from: ${pipelineOptions.compileCommandsPath}`);
    try {
      const ccParser = new CompileCommandsParser(pipelineOptions.compileCommandsPath);
      const entry = ccParser.getEntryForFile(filePath);
      if (entry) {
        compileContext = ccParser.extractBuildContext(entry.command || entry.arguments?.join(' ') || '');
        console.log(`[PIPELINE]   → Defines: ${compileContext.defines.join(' ') || '(none)'}`);
        console.log(`[PIPELINE]   → Includes: ${compileContext.includes.length} paths`);
      }
    } catch (e) {
      console.warn(`[PIPELINE] ⚠️  Could not parse compile_commands.json: ${e.message}`);
    }
  }

  if (pipelineOptions.stubsPath) {
    console.log(`[PIPELINE] 🔗 Stubs path registered: ${pipelineOptions.stubsPath}`);
  }

  // ── 3. Level-1: Extract Function Inventory ────────────────────────────────────
  console.log(`[PIPELINE] 🔍 Level-1: Extracting function inventory...`);
  const rawContent = fs.readFileSync(filePath, 'utf-8');
  const inventory  = await inventoryExtractor.extractInventory(filePath);

  if (!inventory || inventory.length === 0) {
    console.log(`[PIPELINE] No functions discovered in file.`);
    return;
  }
  console.log(`[PIPELINE]   → ${inventory.length} functions found.`);

  // ── 4. Level-1: Whole-File Context Analysis ───────────────────────────────────
  console.log(`[PIPELINE] 🧠 Level-1: Running whole-file semantic analysis...`);
  const fileContextAnalysis = await wholeFileAnalyzer.analyzeFileContext(
    filePath, rawContent, inventory, compileContext
  );
  const roles = fileContextAnalysis.function_roles || {};
  const mockingStrategies = fileContextAnalysis.mocking_strategies || {};

  // ── 5. Level-2: Prioritize Functions ─────────────────────────────────────────
  console.log(`[PIPELINE] 📊 Level-2: Ranking functions by priority...`);
  const rankedInventory = prioritizer.rankFunctions(inventory, fileContextAnalysis, []);
  
  let targets = [];
  if (pipelineOptions.selectedSignatures && pipelineOptions.selectedSignatures.length > 0) {
    targets = rankedInventory.filter(fn => pipelineOptions.selectedSignatures.includes(fn.signature));
    console.log(`[PIPELINE]   → Filters applied: ${targets.length} explicit functions selected.`);
  } else {
    targets = prioritizer.getTopN(rankedInventory, topN);
    console.log(`[PIPELINE]   → Top ${targets.length} targets selected automatically.`);
  }

  console.log(`[PIPELINE]   → Top ${targets.length} targets selected:`);
  for (const t of targets) {
    const tier = t.priority_tier || 'LOW';
    const badge = tier === 'CRITICAL' ? '🔴' : tier === 'HIGH' ? '🟠' : '🟢';
    console.log(`[PIPELINE]     ${badge} [${t.priority}] ${t.signature || t.function_name}`);
    if (t.selection_reason) {
      console.log(`[PIPELINE]        ↳ ${t.selection_reason}`);
    }
  }

  // ── 6. Level-2: Generate Tests for Each Target ───────────────────────────────
  for (const target of targets) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`[LEVEL-2] Deep generating tests for: ${target.signature}`);
    console.log(`${'─'.repeat(60)}`);

    const role = roles[target.signature] || 'Unknown role — see file context';
    console.log(`[LEVEL-2] Role: ${role}`);

    const mocks = mockingStrategies[target.signature] || [];
    
    // ── GTest Architect v5.0: Ingest Additional Context ───────────────────────
    const contextContent = {
        headers: (pipelineOptions.headers || []).map(p => ({ path: p, content: fs.readFileSync(p, 'utf-8') })),
        stubs: (pipelineOptions.stubs || []).map(p => ({ path: p, content: fs.readFileSync(p, 'utf-8') })),
        helpers: (pipelineOptions.helpers || []).map(p => ({ path: p, content: fs.readFileSync(p, 'utf-8') })),
        examples: (pipelineOptions.examples || []).map(p => ({ path: p, content: fs.readFileSync(p, 'utf-8') }))
    };

    const scenario = {
      signature: target.signature,
      doxygen_found: target.doxygen_found,
      doxygen_summary: target.doxygen_summary || role,
      role,
      mocking_hints: mocks,
      stubsPath: pipelineOptions.stubsPath || null,
      source_snippet: target.source_snippet || '',
      context: contextContent, // Pass the new context
      customInstructions: pipelineOptions.customInstructions || ''
    };

    // ── GTest Architect v5.0: Killer Scenarios ───────────────────────────────
    console.log(`[LEVEL-2] 🛡️ Analyzing for subtle logic mutants...`);
    await mutationService.enrichContextWithKillerScenarios(scenario, target.source_snippet || '');

    console.log(`[LEVEL-2] Querying Gemini for Autonomous GTest test file...`);
    const result = await testGen.generateTestCode(scenario, 'GeneratedFixture', {
      mocks,
      compile_flags: compileContext.defines,
      file_path: filePath
    });

    console.log(`\n[GENERATED TEST SUITE] (${result.scenarios_generated} scenarios)`);
    if (result && result.framework_code) {
      console.log(result.framework_code.substring(0, 500) + '...');
      
      // Save to disk if requested or by default in a 'tests' dir
      const outputDir = path.join(path.dirname(filePath), 'tests');
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
      
      const fileName = path.basename(filePath, path.extname(filePath));
      const outPath  = path.join(outputDir, `${fileName}_${target.function_name}_test.cpp`);
      fs.writeFileSync(outPath, result.framework_code);
      console.log(`\n[LEVEL-2] ✅ Saved to: ${outPath}`);
    } else {
      console.warn(`[LEVEL-2] ⚠️  Generation failed for ${target.signature}`);
    }
    console.log(`${'═'.repeat(60)}\n`);
  }

  console.log(`[PIPELINE] ✅ End-to-end execution complete.`);
}
