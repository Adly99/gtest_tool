import path from 'path';
import fs from 'fs';

/**
 * Drives Gemini to generate MULTIPLE compilable C++ GoogleTest test cases
 * for a single target function — one per scenario derived from its source code.
 *
 * Flow per function:
 *  1. ScenarioDeriver   → asks Gemini to enumerate N distinct test scenarios (branches + edges)
 *  2. For each scenario:
 *     a. Generator     → writes a structured test JSON
 *     b. Reviewer      → reviews for defects (weak asserts, leaks, UB, real I/O)
 *     c. Fixer         → auto-heals if reviewer says FAIL
 *  3. _assembleCode     → renders all scenarios into a single compilable .cpp block
 *
 * Falls back to a deterministic regex-driven scenario set if Gemini quota is exhausted.
 */
export class CppUnitTestGenerator {
  constructor(geminiService, promptBuilder, outputAdapter) {
    this.geminiService = geminiService;
    this.promptBuilder = promptBuilder;
    this.outputAdapter = outputAdapter;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Generates a COMPLETE, compilable GTest file for a single function.
   *
   * PRIMARY PATH (Gemini available):
   *   buildAutonomousTestFilePrompt → ONE Gemini call → full .cpp with ALL scenarios
   *   → Reviewer validates the file → Fixer heals defects  
   *   Total: 2-3 Gemini calls, one 8s window
   *
   * FALLBACK (Gemini quota exhausted in derive step):
   *   Local scenario derivation from source code → deterministic stubs
   *   Total: 0 additional Gemini calls, instant
   *
   * @param {Object} gapScenario   - enriched function descriptor from inventory
   * @param {string} targetFixture - GTest suite name
   * @param {Object} styleContext  - { mocks[], compile_flags, source_snippet, file_path, ... }
   * @returns {Object} { framework_code, scenarios_generated, per_scenario_tests[] }
   */
  async generateTestCode(gapScenario, targetFixture, styleContext) {
    const signature     = gapScenario.signature || gapScenario.function_name || 'UnknownFunction';
    const sourceSnippet = styleContext.source_snippet || gapScenario.source_snippet || '';

    // ── Step A: Check if Gemini is available (lightweight scenario probe) ──────
    const { geminiAvailable } = await this._deriveScenarios(signature, sourceSnippet, gapScenario, styleContext);
    console.log(`[Generator] Gemini: ${geminiAvailable ? '✅ available' : '⚡ quota exhausted — fast fallback'}`);

    if (!geminiAvailable) {
      // Fast path — no Gemini waits. Derive scenarios locally and build stubs instantly.
      const localScenarios = this._deriveLocalScenarios(signature, sourceSnippet, gapScenario);
      console.log(`[Generator] 📋 Local scenarios derived: ${localScenarios.length}`);
      const perTests = localScenarios.map(s => this._buildDeterministicTest(s, targetFixture));
      const fullCode  = this._assembleMultiScenario(perTests, signature, styleContext);
      return { framework_code: fullCode, scenarios_generated: localScenarios.length, per_scenario_tests: perTests };
    }

    // ── Step B (Gemini): ONE call → complete .cpp with ALL scenarios ──────────
    const fn = { ...gapScenario, source_snippet: sourceSnippet };
    const autonomousPrompt = this.promptBuilder.buildAutonomousTestFilePrompt(fn, {
      ...styleContext,
      local_call_graph: styleContext.local_call_graph || {},
      file_context:     styleContext.file_context || {},
    });

    console.log(`[Generator] 🤖 Autonomous generation for: ${signature}`);
    const TIMEOUT = 12000; // 12s — generous for a complete file
    const timeoutP = new Promise(resolve => setTimeout(() => resolve(null), TIMEOUT));
    let aiResponse = null;
    try {
      aiResponse = await Promise.race([this.geminiService.queryJSON(autonomousPrompt), timeoutP]);
    } catch (_) {}

    if (aiResponse?.complete_cpp_file) {
      const rawCode       = aiResponse.complete_cpp_file;
      const testCount     = aiResponse.test_count || (rawCode.match(/\bTEST[_FP]?\s*\(/g) || []).length;
      console.log(`[Generator] ✅ AI generated ${testCount} test(s) — running reviewer...`);

      // ── Step C: Reviewer → Fixer ───────────────────────────────────────────
      const reviewedCode = await this._reviewAndFix(autonomousPrompt, rawCode);
      return {
        framework_code: reviewedCode,
        scenarios_generated: testCount,
        per_scenario_tests: [reviewedCode],
        refactoring_plan: aiResponse.refactoring_plan || null,
        mutation_notes:   aiResponse.mutation_notes   || null
      };
    }

    // Gemini returned null / wrong shape — fall back to deterministic stubs
    console.log(`[Generator] ⚠️  Autonomous generation returned empty — using deterministic stubs`);
    const fallback = this._buildFallbackTests(gapScenario, targetFixture, sourceSnippet);
    return { framework_code: fallback, scenarios_generated: 1, per_scenario_tests: [fallback] };
  }


  /**
   * Generates test code for a single pre-defined scenario (legacy / pipeline use).
   */
  async generateTestCodeForScenario(scenario, targetFixture, styleContext) {
    const code = await this._generateOneScenario(scenario, targetFixture, styleContext);
    return {
      framework_code: code || this._buildFallbackTests(scenario, targetFixture, ''),
      scenario,
    };
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  /**
   * Asks Gemini to enumerate all distinct scenarios worth testing for this function.
   * Returns a deterministic fallback list if Gemini times out.
   */
  async _deriveScenarios(signature, sourceSnippet, gapScenario, styleContext) {
    const derivePrompt = this.promptBuilder.buildScenarioDeriverPrompt({
      signature,
      doxygen_summary: gapScenario.doxygen_summary || gapScenario.role || ''
    }, sourceSnippet);

    const timeout = new Promise(resolve => setTimeout(() => resolve(null), 8000));
    let result = null;
    try {
      result = await Promise.race([this.geminiService.queryJSON(derivePrompt), timeout]);
    } catch (_) {}

    if (Array.isArray(result) && result.length > 0) return { scenarios: result, geminiAvailable: true };

    // Deterministic fallback: derive from source code structure
    return { scenarios: this._deriveLocalScenarios(signature, sourceSnippet, gapScenario), geminiAvailable: false };
  }


  /**
   * Derives scenarios locally (no Gemini) by scanning source code for branches.
   */
  _deriveLocalScenarios(signature, source, gapScenario) {
    const scenarios = [];
    const base = { scenario_id: '', description: '', inputs: '', expected_output: '', assertion_style: 'EXPECT_TRUE', tags: [] };

    // Always include happy path
    scenarios.push({ ...base,
      scenario_id: 'HAPPY-001',
      description: 'Valid inputs produce expected output',
      inputs: 'Minimal valid inputs for the function',
      expected_output: 'Success / non-error result',
      assertion_style: 'EXPECT_TRUE',
      tags: ['happy_path'],
    });

    // Detect if/return false patterns
    const ifBranches = (source.match(/\bif\s*\([^)]+\)\s*(?:return\s+false|throw|return\s+0|return\s+nullptr)/g) || []);
    ifBranches.forEach((branch, i) => {
      const cond = branch.match(/\bif\s*\(([^)]+)\)/)?.[1] || 'condition';
      scenarios.push({ ...base,
        scenario_id: `BRANCH-${String(i + 1).padStart(3,'0')}`,
        description: `When ${cond.trim()} → function returns early`,
        inputs: `Inputs that make (${cond.trim()}) true`,
        expected_output: 'Early return / false / throw',
        assertion_style: 'EXPECT_FALSE',
        tags: ['branch', 'error_path'],
      });
    });

    // Detect throw
    if (source.includes('throw')) {
      scenarios.push({ ...base,
        scenario_id: 'THROW-001',
        description: 'Invalid input causes exception to be thrown',
        inputs: 'Inputs that trigger the throw statement',
        expected_output: 'std::exception or derived type thrown',
        assertion_style: 'EXPECT_THROW',
        tags: ['error_path', 'exception'],
      });
    }

    // Detect nullptr / empty checks
    if (source.includes('nullptr') || source.includes('.empty()')) {
      scenarios.push({ ...base,
        scenario_id: 'NULL-001',
        description: 'Null/empty input is rejected',
        inputs: 'nullptr or empty string/container',
        expected_output: '0 / false / throw',
        assertion_style: 'EXPECT_FALSE',
        tags: ['boundary', 'null_check'],
      });
    }

    // Boundary
    scenarios.push({ ...base,
      scenario_id: 'BOUND-001',
      description: 'Boundary value at the edge of the valid range',
      inputs: 'Value exactly at boundary (0, INT_MAX, empty string, size=1)',
      expected_output: 'Correct clamped or accepted behavior',
      assertion_style: 'EXPECT_EQ',
      tags: ['boundary'],
    });

    return scenarios;
  }

  /**
   * Runs the Reviewer → Fixer loop for a generated code block.
   */
  async _reviewAndFix(originalPrompt, generatedCode) {
    const reviewPrompt = this.promptBuilder.buildReviewerPrompt(generatedCode);
    const reviewTimeout = new Promise(resolve => resolve({ status: 'PASS', defects: [] }));
    const TIMEOUT = 8000;
    
    let reviewResult = { status: 'PASS', defects: [] };
    try {
      const timeoutP = new Promise(resolve => setTimeout(() => resolve(null), TIMEOUT));
      reviewResult = await Promise.race([this.geminiService.queryJSON(reviewPrompt), timeoutP]) || reviewResult;
    } catch (_) {}

    if (reviewResult?.status === 'FAIL' && reviewResult.defects?.length > 0) {
      console.log(`  [Reviewer] ⚠️  Found ${reviewResult.defects.length} defect(s). Healing...`);
      const fixPrompt = this.promptBuilder.buildFixPrompt(originalPrompt, generatedCode, reviewResult.defects);
      
      const fixTimeoutP = new Promise(resolve => setTimeout(() => resolve(null), 10000));
      let fixed = null;
      try {
        fixed = await Promise.race([this.geminiService.queryJSON(fixPrompt), fixTimeoutP]);
      } catch (_) {}

      if (fixed?.complete_cpp_file) {
        console.log(`  [Fixer] ✅ Defects healed.`);
        return fixed.complete_cpp_file;
      }
      if (fixed?.body) {
          // Fallback if it returns the old shape
          return this._assembleCode(fixed);
      }
    }

    return generatedCode;
  }

  /**
   * Runs the Generator → Reviewer → Fixer loop for a single scenario.
   */
  async _generateOneScenario(scenario, targetFixture, styleContext) {

    const prompt = this.promptBuilder.buildCodeGenPrompt(scenario, targetFixture, styleContext);

    const timeout = new Promise(resolve => setTimeout(() => resolve(null), 8000));
    let response = null;
    try {
      response = await Promise.race([this.geminiService.queryJSON(prompt), timeout]);
    } catch (_) {}

    if (!response || !response.suite_name) {
      // Build deterministic test from scenario description
      return this._buildDeterministicTest(scenario, targetFixture);
    }

    // Reviewer pass
    const rawCode = this._assembleCode(response);
    const reviewPrompt = this.promptBuilder.buildReviewerPrompt(rawCode);
    const reviewTimeout = new Promise(resolve => setTimeout(() => resolve({ status: 'PASS', feedback: [] }), 5000));
    let reviewResult = { status: 'PASS', feedback: [] };
    try {
      reviewResult = await Promise.race([this.geminiService.queryJSON(reviewPrompt), reviewTimeout]) || reviewResult;
    } catch (_) {}

    if (reviewResult?.status === 'FAIL' && reviewResult.feedback?.length > 0) {
      console.log(`  [Reviewer] FAIL — healing ${reviewResult.feedback.length} defect(s)...`);
      const fixPrompt = this.promptBuilder.buildFixPrompt(prompt, rawCode, reviewResult.feedback);
      const fixTimeout = new Promise(resolve => setTimeout(() => resolve(null), 8000));
      let fixed = null;
      try { fixed = await Promise.race([this.geminiService.queryJSON(fixPrompt), fixTimeout]); } catch (_) {}
      if (fixed?.suite_name) return this._assembleCode(fixed);
    }

    return rawCode;
  }

  /**
   * Builds a deterministic (no-AI) test for a scenario using its description.
   */
  _buildDeterministicTest(scenario, targetFixture) {
    const safeName = (scenario.scenario_id || 'UnknownScenario')
      .replace(/[^a-zA-Z0-9_]/g, '_');
    const desc = scenario.description || 'Auto-generated scenario';
    const assertLine = this._scenarioToAssert(scenario);

    return this.outputAdapter.formatTest(
      targetFixture,
      safeName,
      `    // Scenario: ${desc}\n    // Expected: ${scenario.expected_output || 'see description'}\n    // Inputs  : ${scenario.inputs || 'see description'}\n${assertLine}`
    );
  }

  _scenarioToAssert(scenario) {
    switch (scenario.assertion_style) {
      case 'EXPECT_FALSE':  return `    // TODO: call function with invalid inputs\n    EXPECT_FALSE(true); // Replace with real call`;
      case 'EXPECT_THROW':  return `    // TODO: EXPECT_THROW(yourFunction(badInput), std::exception);`;
      case 'EXPECT_DEATH':  return `    // TODO: EXPECT_DEATH(yourFunction(input), ".*");`;
      case 'EXPECT_CALL':   return `    // TODO: set up EXPECT_CALL on mock before invoking function`;
      case 'EXPECT_EQ':     return `    // TODO: EXPECT_EQ(yourFunction(input), expectedValue);`;
      default:              return `    // TODO: EXPECT_TRUE(yourFunction(validInput));`;
    }
  }

  /**
   * Builds a full fallback test block when Gemini is unavailable for all scenarios.
   * Uses source code analysis to create meaningful stubs.
   */
  _buildFallbackTests(gapScenario, targetFixture, source) {
    const sig       = gapScenario.signature || 'UnknownFunction';
    const funcName  = (gapScenario.function_name || sig).replace(/[^a-zA-Z0-9_]/g, '_');
    const branches  = source ? (source.match(/\bif\s*\(|switch\s*\(|\?/g) || []).length : 0;

    let body = `    // Function: ${sig}\n`;
    if (gapScenario.doxygen_summary) body += `    // Doxygen : ${gapScenario.doxygen_summary}\n`;
    body += `    // Branches estimated: ${branches}\n\n`;
    body += `    // Arrange — set up valid inputs\n    // TODO: replace placeholders with actual types/values\n\n`;
    body += `    // Act\n    // auto result = ${funcName}(/* args */);\n\n`;
    body += `    // Assert — happy path\n    // EXPECT_TRUE(result); // or EXPECT_EQ(result, expectedValue);\n\n`;

    if (branches > 0) {
      body += `    // IMPORTANT: This function has ~${branches} branch(es).\n`;
      body += `    // Add separate TEST cases for each branch condition.\n`;
    }
    body += `    GTEST_SKIP() << "Auto-generated stub — implement assertions";`;

    return this.outputAdapter.formatTest(targetFixture, `Test_${funcName}_Placeholder`, body);
  }

  /**
   * Assembles the raw per-scenario test fragments into one compilable output block.
   * Deduplicates #includes across all scenarios.
   */
  _assembleMultiScenario(perScenarioCodes, signature, styleContext) {
    // Collect and deduplicate all #include lines across scenarios
    const includeSet = new Set(['<gtest/gtest.h>', '<gmock/gmock.h>']);
    const bodies = [];

    for (const code of perScenarioCodes) {
      const lines = code.split('\n');
      const includes  = lines.filter(l => l.trim().startsWith('#include'));
      const nonIncludes = lines.filter(l => !l.trim().startsWith('#include'));
      includes.forEach(inc => {
        const header = inc.replace('#include', '').trim().replace(/[<>"]/g, '').trim();
        includeSet.add(`<${header}>`);
      });
      bodies.push(nonIncludes.join('\n').trim());
    }

    let out = '';
    // Sorted includes
    for (const inc of [...includeSet].sort()) {
      out += `#include ${inc}\n`;
    }
    out += '\n';
    out += bodies.join('\n\n');
    return out;
  }

  /**
   * Assembles a single structured Gemini response into compilable C++.
   */
  _assembleCode(response) {
    let code = '';

    const imports = Array.isArray(response.imports) ? response.imports : ['<gtest/gtest.h>'];
    for (const imp of imports) {
      const h = imp.replace(/^["<]|[">]$/g, '');
      code += `#include <${h}>\n`;
    }
    if (imports.length > 0) code += '\n';

    // Mock classes
    if (Array.isArray(response.mocks_required)) {
      for (const mock of response.mocks_required) {
        if (mock.mock_name && mock.interface) {
          code += this.outputAdapter.formatMockClass(mock.mock_name, mock.interface, mock.methods || []);
          code += '\n\n';
        }
      }
    }

    // Fixture (TEST_F)
    if (response.test_type === 'TEST_F' && (response.fixture_members || response.fixture_setup)) {
      code += this.outputAdapter.formatFixture(
        response.suite_name,
        response.fixture_setup   || '',
        response.fixture_teardown || '',
        response.fixture_members  || ''
      );
      code += '\n\n';
    }

    // Test body
    const body = response.body || '    GTEST_SKIP() << "Empty body — implement assertions";';
    if (response.test_type === 'TEST_P') {
      code += this.outputAdapter.formatTestP(response.suite_name, response.test_name, body);
      if (response.parameter_type && response.parameter_generator) {
        code += '\n\n' + this.outputAdapter.formatInstantiateTestSuite(
          `${response.suite_name}_Inst`, response.suite_name, response.parameter_generator
        );
      }
    } else if (response.test_type === 'TEST_F') {
      code += this.outputAdapter.formatTestF(response.suite_name, response.test_name, body);
    } else {
      code += this.outputAdapter.formatTest(response.suite_name, response.test_name, body);
    }

    return code;
  }
}
