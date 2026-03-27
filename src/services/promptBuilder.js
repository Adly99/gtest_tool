import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * PromptBuilder v4.0 — Intelligent GTest & Refactoring Suite
 *
 * Key design principles:
 *  1. COMPLETE FILE — every prompt asks for a full compilable .cpp, not a snippet
 *  2. CONCRETE ASSERTIONS — inject real source code so Gemini can use actual types/values
 *  3. CHAIN-OF-THOUGHT — structured reasoning before code ensures higher quality
 *  4. NEGATIVE RULES — explicit anti-patterns prevent the most common AI mistakes
 *  5. JSON-WRAPPED — easier parsing, no markdown fence stripping needed
 */
export class PromptBuilder {
  constructor() {}

  /**
   * builds the ultimate prompt for C++ mock generation following Workflow v05.
   */
  buildMockTransformationPrompt(headerContent, filePath) {
    let workflowDocs = '';
    try {
        const workflowPath = path.resolve(__dirname, '../../GTest_Mock_Generation_Workflow.md');
        workflowDocs = fs.readFileSync(workflowPath, 'utf8');
    } catch (err) {
        workflowDocs = `Error reading workflow file: ${err.message}\n(Please ensure GTest_Mock_Generation_Workflow.md exists in the project root)`;
    }

    return `
# ROLE: EXPERT C++ GTEST/GMOCK ASSISTANT
# OBJECTIVE: Systematically transform the provided C++ header into a HIGH-QUALITY GMOCK HEADER following Workflow v05.

# WORKFLOW STEPS TO EXECUTE:
The following workflow document provides the exact standard constraints, examples, and line-by-line transformations you must follow strictly:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  GTEST / GMOCK WORKFLOW MANUAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${workflowDocs}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# HEADER CONTENT:
\`\`\`cpp
// File: ${filePath}
${headerContent}
\`\`\`

# OUTPUT FORMAT:
Return a SINGLE JSON object:
{
  "thought_process": {
    "workflow_steps": [
      { "step": "Step 2-3", "transformation": "Header & Structural Setup", "details": "✓ Include guards preserved ✓ GMock/GTest headers injected ✓ Original includes retained" },
      { "step": "Step 4", "transformation": "Static Methods", "details": "No static methods found (N/A) OR Delegated to [MockClass]" },
      { "step": "Step 5-5a", "transformation": "Public Methods → MOCK_METHOD", "details": "X methods converted to MOCK_METHOD macros" },
      { "step": "Step 5a", "transformation": "Default Arguments", "details": "X wrappers generated" },
      { "step": "Step 6", "transformation": "Lifecycle Methods", "details": "Implicit default constructor & destructor preserved" },
      { "step": "Step 7", "transformation": "Clean Internals", "details": "Private section removed for mock generation" },
      { "step": "Step 8", "transformation": "Ancillary Members", "details": "Documentation comments preserved; annotations added" },
      { "step": "Step 9", "transformation": "Output Generation", "details": "Mock file ready" }
    ],
    "generated_features": [
      "X mockable methods with full const-correctness support",
      "Overloaded wrappers for [...] to handle default arguments",
      "Clean public interface - private implementation details removed"
    ],
    "todos": [
      "DONE: Scenario mapping",
      "TODO: Finalizing wrappers"
    ]
  },
  "mock_code": "the ENTIRE compilable transformed header code",
  "singleton_mocks_created": ["Name1", "Name2"]
}
`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PRIMARY: Autonomous complete-file test generation (one Gemini call
  //  per function → full compilable .cpp with ALL scenarios covered)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Builds a prompt that asks Gemini to generate a COMPLETE, compilable
   * GTest .cpp file covering ALL scenarios for a single C++ function.
   *
   * This replaces the old buildCodeGenPrompt which only produced one TEST().
   *
   * @param {Object} fn   - function descriptor from inventory
   * @param {Object} ctx  - style/compile context
   */
  buildAutonomousTestFilePrompt(fn, ctx = {}) {
    const mocks       = this._formatMocks(ctx.mocks || []);
    const flags       = this._formatFlags(ctx.compile_flags);
    const source      = fn.source_snippet || ctx.source_snippet || '(unavailable)';
    const callGraph   = ctx.local_call_graph?.[fn.signature] ? JSON.stringify(ctx.local_call_graph[fn.signature]) : 'none';
    const fileContext = ctx.file_context ? JSON.stringify(ctx.file_context) : '{}';

    return `
You are an autonomous C++ unit test engineer using Google Test (GTest) 4.x and Google Mock (GMock).
Your assignment: write a COMPLETE, self-contained, compilable GTest test file for the function below.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  FUNCTION UNDER TEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Signature    : ${fn.signature}
Class        : ${fn.class_name || 'free function'}
Access Level : ${fn.access_level || 'public'}
Doxygen      : ${fn.doxygen_summary || 'no documentation'}
Branch count : ~${fn.branch_count_estimate || 0}
Compile flags: ${flags}

SOURCE CODE:
\`\`\`cpp
${source}
\`\`\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  WIDER FILE CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Local callers / callees : ${callGraph}
File-level macros/globals: ${fileContext}
Dependencies to mock    :
${mocks}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  CHAIN-OF-THOUGHT REQUIREMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Before writing any test code, reason through:
1. BRANCHES  — list every if/switch/ternary/early-return branch visible in the source.
2. INPUTS    — for each branch, what exact input values trigger it?
3. TYPES     — verify the C++ types of all parameters and return value.
4. SIDE-EFFECTS — does the function modify state, call a collaborator, or throw?
5. MOCKS     — which collaborators must be mocked? Are they injectable?
6. ASSERTIONS — for each scenario, what specific EXPECT_ macro and expected value?
7. FIXTURE   — do multiple tests share setup? If so, use TEST_F with a fixture.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  TEST COVERAGE MANDATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You MUST generate one test per scenario. Required scenarios (minimum):
  ✅ HAPPY      — valid inputs, expected successful output
  ✅ BRANCH-*   — one test per distinct if/switch branch (cover EVERY branch)
  ✅ BOUNDARY   — values at exact numeric/string/size boundaries (0, max, empty, 1)
  ✅ NULL/EMPTY — null pointers, empty containers, zero-length strings
  ✅ EXCEPTION  — inputs that should throw (if throw is possible)
  ✅ POST-COND  — verify state changes after the call (if function has side-effects)
  ✅ PARAM-TEST — use TEST_P for functions with multiple similar input groups
  ✅ MUTATION   — "Killer Scenarios" designed to catch accidental logic changes (e.g. flipping a boolean or off-by-one)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  REFACTORING & ARCHITECTURAL ADVICE (v4.0)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If the code is hard to test (e.g. cyclomatic complexity > 10, hidden dependencies, giant methods), 
you MUST provide a brief, actionable refactoring plan. Focus on:
• TESTABILITY — how to make the code easier to isolate?
• COUPLING    — where to inject a dependency instead of using a global?
• SRP         — which logic should be extracted to a separate function?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SMART STUBS (v4.0)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Mocks should be LOGIC-AWARE. If you see a dependency being called, don't just return a dummy.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  LOGIC-AWARE & SINGLETON MOCKING (v6.0)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• MOCKING STATIC METHODS: 
  Follow the "Singleton Mock Pattern": Create a companion \`Mock\` class (e.g. \`PtpHandlerMock\`) with a \`static getInstance()\` method. 
  Delegate the original static calls to this singleton instance.
• MOCKING FREE FUNCTIONS: 
  If functions are in a namespace, create a singleton mock class inside that namespace to hold the \`MOCK_METHOD\` declarations.
• DEFAULT ARGUMENTS: 
  Create a full \`MOCK_METHOD\` and an overloaded wrapper that calls the mock with the original default value.
• Contextual Values:
  Infer the dependency's behavior and use EXPECT_CALL(...).WillOnce(Return(x)) with values 
  that specifically explore the NEXT branch of the function under test.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  GTEST FRAMEWORK RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Use TEST()   — stateless, no shared setup
• Use TEST_F() — shared fixture (state, mocks, SUT instance)
• Use TEST_P() — multiple inputs to same logic via ::testing::Values()
• Use EXPECT_DEATH() — for intentional abort/crash scenarios
• Every test: // Arrange | // Act | // Assert comment structure
• Mock with MOCK_METHOD(RetType, Name, (Args), (override))
• Verify mocks: EXPECT_CALL(mock, Method()).Times(1)
• Prefer EXPECT_* over ASSERT_* except when state is corrupt without it

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  STRICT ANTI-PATTERNS (NEVER DO THESE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✗ ASSERT_TRUE(expr != nullptr) — use ASSERT_NE(expr, nullptr)
✗ Empty test body — every TEST must have at least one real EXPECT_/ASSERT_
✗ GTEST_SKIP() unless you explicitly document why with GTEST_SKIP() << "reason"
✗ TODO placeholders — write real typed assertions using the actual parameter types
✗ Real filesystem/network/clock calls inside tests — mock or stub them
✗ Raw owning new/delete in fixtures — use unique_ptr or direct stack objects
✗ Hardcoded magic numbers without a named constant or comment explaining the value
✗ EXPECT_EQ(result, true) — use EXPECT_TRUE(result)
✗ Non-compilable forward declarations — include the real header or declare inline

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  REQUIRED OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Return a SINGLE JSON object (no markdown fences):
{
  "thought_process": {
    "branches_found": ["<branch1>", "<branch2>", "..."],
    "scenarios_planned": ["HAPPY-001: ...", "BRANCH-001: ...", "..."],
    "mocks_needed": ["<MockClass: reason>"],
    "fixture_needed": true | false,
    "fixture_reason": "<why TEST_F is needed or not>"
  },
  "refactoring_plan": {
    "testability_rating": <0-100>,
    "major_issues": ["<issue1>", "..."],
    "proposed_refactor": "<short description of how to fix for testability>",
    "is_refactor_recommended": true | false
  },
  "mutation_notes": "<how these tests prevent regression if logic is subtly broken>",
  "complete_cpp_file": "<ENTIRE compilable .cpp file as a single escaped string>",
  "test_count": <integer number of TEST/TEST_F/TEST_P macros generated>,
  "scenario_ids": ["HAPPY-001", "BRANCH-001", "MUTATION-001", ...]
}

The "complete_cpp_file" field MUST be a full .cpp file starting with #include directives
and containing ALL test cases. It must compile with:
  g++ -std=c++17 <file> -lgtest -lgtest_main -lgmock -pthread
`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  REVIEWER — evaluates the complete generated .cpp file
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Builds a Staff Engineer code review prompt for the complete generated file.
   */
  buildReviewerPrompt(generatedCode) {
    return `
You are a Staff C++ Engineer conducting a formal code review of an AI-generated GTest file.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  CODE UNDER REVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
\`\`\`cpp
${generatedCode}
\`\`\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  REVIEW CHECKLIST (flag every violation)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CORRECTNESS
  [ ] Compile errors — missing #include, wrong types, MOCK_METHOD arity
  [ ] UB — null dereference, out-of-bounds, signed overflow
  [ ] Wrong assertion — EXPECT_TRUE(result == x) instead of EXPECT_EQ

COVERAGE & MUTATION (v4.0)
  [ ] Missing branch — at least one if/switch arm has no corresponding test
  [ ] Missing boundary — no test at 0, max, empty, or ±1 of limit
  [ ] Missing mutation test — no "Killer Scenarios" present to catch logic flips
  [ ] Weak smart stubs — mocks return static values that don't drive logic forward

INTELLIGENCE (v4.0)
  [ ] Missing refactoring plan — code is complex (>10 branches) but no plan provided
  [ ] Vague refactoring — plan doesn't address specific testability blockers

TEST QUALITY
  [ ] Weak assertion — sole assertion is EXPECT_TRUE(true) or similar
  [ ] Placeholder — body contains TODO or GTEST_SKIP without reason
  [ ] Unmocked I/O — real filesystem, network, or clock calls present
  [ ] Unverified mock — EXPECT_CALL not verified (missing Times/Return)
  [ ] Memory leak — raw new without delete in fixture or test body
  [ ] Magic number — unexplained constant used in EXPECT_EQ

STYLE
  [ ] No Arrange/Act/Assert comments
  [ ] Test name doesn't encode condition and expected result
  [ ] Multiple unrelated assertions in one test (hurts failure diagnosis)

Return ONLY JSON:
{
  "status": "PASS" | "FAIL",
  "score": <integer 0-100>,
  "defects": [
    {
      "category": "CORRECTNESS | COVERAGE | QUALITY | STYLE",
      "severity": "CRITICAL | HIGH | MEDIUM | LOW",
      "test_name": "<TEST name or 'global' if file-level>",
      "description": "<precise description of the issue>",
      "fix_instruction": "<exact change needed>"
    }
  ]
}
`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  FIXER — heals defects identified by the reviewer
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Builds an auto-fix prompt incorporating reviewer defect feedback.
   */
  buildFixPrompt(originalPrompt, generatedCode, defects) {
    const defectList = Array.isArray(defects)
      ? defects.map((d, i) =>
          `${i + 1}. [${d.severity || 'HIGH'}] ${d.test_name || 'global'} — ${d.description}\n   FIX: ${d.fix_instruction}`
        ).join('\n')
      : JSON.stringify(defects, null, 2);

    return `
${originalPrompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PREVIOUS ATTEMPT (contains defects)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
\`\`\`cpp
${generatedCode}
\`\`\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  DEFECTS TO FIX (ALL must be resolved)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${defectList}

Rules:
  • Fix EVERY defect in the list — do not skip any
  • Do NOT change test intent — only fix the exact defect
  • Do NOT add new TODO placeholders
  • Return the same JSON schema as the original prompt
`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  SCENARIO DERIVER — separate light call to enumerate test scenarios
  //  (used when we want FAST enumeration before code gen)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Builds a lightweight prompt to enumerate all test scenarios for a function.
   * Returns structured list, not code — much faster + smaller than full gen.
   */
  buildScenarioDeriverPrompt(fn, sourceSnippet) {
    return `
You are a C++ test strategist. Enumerate ALL distinct test scenarios for the function below.
Be systematic — cover every branch, boundary, null check, and exception path.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  FUNCTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Signature: ${fn.signature}
Doxygen  : ${fn.doxygen_summary || 'none'}
Source:
\`\`\`cpp
${sourceSnippet || '(unavailable)'}
\`\`\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ENUMERATION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
For EACH distinct behavior, produce one scenario. Include ALL of:
  • Happy path (valid typical inputs → expected output)
  • One entry per if/switch branch
  • Boundary values (0, empty, null, max, -1, 1)
  • Exception / error paths
  • Post-condition / state mutation tests (if function has side effects)

Return JSON ARRAY of objects:
[
  {
    "scenario_id": "HAPPY-001",
    "description": "<one sentence: what this test proves>",
    "inputs": "<literal values or descriptions, e.g. 'amount=99.99, sender=\"alice\"'>",
    "expected_output": "<return value or thrown type>",
    "assertion_style": "EXPECT_EQ | EXPECT_TRUE | EXPECT_FALSE | EXPECT_THROW | EXPECT_DEATH | EXPECT_CALL",
    "tags": ["happy_path | branch | boundary | null_check | exception | post_condition | param"]
  }
]
Return the JSON ARRAY only.
`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  INVENTORY — function extraction from source file
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Builds the function inventory extraction prompt.
   * Used by FunctionInventoryExtractor Tier-1 Gemini call.
   */
  buildInventoryPrompt(filePath, contentSnippet) {
    return `
You are a C++ static analysis tool extracting a complete function inventory from a source file.
Your output will be consumed by an automated test generation pipeline — accuracy is critical.

File: ${filePath}
Source (first 8000 chars):
\`\`\`cpp
${contentSnippet}
\`\`\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  EXTRACTION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Extract EVERY function definition:
  • Free functions, static functions
  • All class member functions (public, protected, private)
  • Constructors & destructors
  • Operator overloads
  • Template instantiations (use concrete type if known)

Do NOT extract:
  • Pure declarations (no body { })
  • Lambda functions
  • Deleted or defaulted functions (= delete, = default)

For EACH function, return a JSON object:
{
  "function_name"        : "<base name only, no class prefix, no return type>",
  "signature"            : "<full: ReturnType ClassName::Name(Type param, ...) const>",
  "doxygen_found"        : <true if preceded by /** */ or ///>,
  "doxygen_summary"      : "<@brief text or first sentence, or ''>",
  "access_level"         : "public" | "private" | "protected" | "free",
  "class_name"           : "<enclosing class or null>",
  "branch_count_estimate": <integer: count of if/switch/ternary/return-in-loop in body>,
  "priority"             : <0-100: public=+30, doxygen=+40, branches>2=+30>
}

Return a JSON ARRAY. No other text, no markdown.
`;
  }

  buildFuzzerPrompt(inventoryItem) {
    return `
You are a security tooling expert writing a Google LibFuzzer harness for C++.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  TARGET FUNCTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Signature : ${inventoryItem.signature}
Role      : ${inventoryItem.role || inventoryItem.doxygen_summary || 'Unknown'}
Parameters: ${inventoryItem.args || 'See signature'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  REQUIREMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Export: extern "C" int LLVMFuzzerTestOneInput(const uint8_t *Data, size_t Size)
• Check Size before casting fuzzer bytes to typed inputs
• Wrap call in try/catch to prevent crashes from propagating to the fuzzer runtime
• Prefer FuzzedDataProvider for structured consumption
• Suggest at least 3 meaningful corpus seed values

Return PURE JSON:
{
  "harness_code": "<full C++ source>",
  "imports": ["<cstdint>", "<cstddef>", "<fuzzer/FuzzedDataProvider.h>"],
  "seed_corpus_suggestions": ["<seed1>", "<seed2>", "<seed3>"],
  "crash_budget_note": "<notes on what attacker-controlled inputs to fuzz>"
}
`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  BACKWARD COMPAT — keep old buildCodeGenPrompt for per-scenario calls
  //  (used only when Gemini IS available and selected scenario pipeline runs)
  // ═══════════════════════════════════════════════════════════════════════

  buildCodeGenPrompt(gapScenario, targetFixture, styleContext) {
    const mocks       = this._formatMocks(styleContext.mocks || []);
    const flags       = this._formatFlags(styleContext.compile_flags);
    const source      = styleContext.source_snippet || gapScenario.source_snippet || '(unavailable)';
    const scenarioBlock = gapScenario.scenario_id
      ? `Scenario ID : ${gapScenario.scenario_id}
Description : ${gapScenario.description}
Inputs      : ${gapScenario.inputs}
Expected    : ${gapScenario.expected_output}
Assert Style: ${gapScenario.assertion_style || 'EXPECT_EQ'}`
      : `Description : ${gapScenario.role || gapScenario.description || 'See function signature'}`;

    return `
You are an expert C++ test generation agent (GTest/GMock).
Write ONE compilable test that covers the EXACT scenario described.

━━━ TARGET FUNCTION ━━━
Signature    : ${gapScenario.signature || 'Unknown'}
Doxygen      : ${gapScenario.doxygen_summary || 'none'}
Class        : ${gapScenario.class_name || 'free function'}
Branch count : ~${gapScenario.branch_count_estimate || 0}
Compile flags: ${flags}

SOURCE CODE:
\`\`\`cpp
${source}
\`\`\`

━━━ SCENARIO ━━━
${scenarioBlock}

━━━ MOCKING ━━━
${mocks}

━━━ RULES ━━━
• TEST for stateless, TEST_F for shared fixture, TEST_P for parameterized
• Arrange / Act / Assert comment structure
• Use real typed values — no placeholders or TODO
• EXPECT_THROW for exception scenarios
• EXPECT_CALL with Times() for mock verification

━━━ NEGATIVE RULES ━━━
✗ ASSERT_TRUE(ptr != nullptr) → use ASSERT_NE(ptr, nullptr)
✗ Empty body or TODO comments
✗ Real I/O — mock everything
✗ Raw owning new without cleanup

Chain-of-thought:
1. What boundary/behavior is being validated?
2. What setup/mocks are needed?
3. What observable value proves success?

Return PURE JSON:
{
  "thought_process": ["<step1>", "<step2>", "<step3>"],
  "test_type": "TEST | TEST_F | TEST_P",
  "suite_name": "${targetFixture}",
  "test_name": "<Name_Condition_ExpectedResult>",
  "body": "<inner C++ body with Arrange/Act/Assert comments>",
  "imports": ["<gtest/gtest.h>", "<gmock/gmock.h>"],
  "mocks_required": [],
  "fixture_setup": "",
  "fixture_members": "",
  "requires_death_test": false,
  "parameter_type": null,
  "parameter_generator": null
}
`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  _formatMocks(mocks) {
    if (!mocks || mocks.length === 0) return 'None identified — function has no injectable collaborators';
    return mocks.map(m =>
      `• ${m.dependency_type}: ${m.reason || ''}\n  Injection: ${m.is_injected ? 'constructor/arg' : 'link-seam (harder)'}\n  Style: ${m.mock_style || 'EXPECT_CALL'}`
    ).join('\n');
  }

  _formatFlags(flags) {
    if (!flags) return 'None';
    return Array.isArray(flags) ? (flags.join(' ') || 'None') : flags;
  }
}
