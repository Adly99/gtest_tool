/**
 * Maps the exact Doxygen documentation of a selected function into actionable Test Scenarios.
 * Supports compiler define injection so Gemini reasons about active conditional branches.
 */
export class DoxygenToScenarioMapper {
  constructor(geminiService) {
    this.geminiService = geminiService;
  }

  /**
   * Takes a single focused function's Doxygen and forces explicit edge case generation.
   *
   * @param {string} functionSignature  - e.g. "bool TokenValidator::validate(const Token& t)"
   * @param {string} doxygenBlock       - raw Doxygen comment text
   * @param {Object} fileContextInfo    - from WholeFileAnalyzer (macros, globals, etc.)
   * @param {Object} compileContext     - optional: { defines: ['-DFOO=1'] }
   * @returns {Array} scenario objects
   */
  async mapDoxygen(functionSignature, doxygenBlock, fileContextInfo = {}, compileContext = {}) {
    const defines = (compileContext.defines || []).join(' ');

    const prompt = `
      You are a senior C++ test designer performing deep Level-2 scenario extraction.

      Target Function: ${functionSignature}

      Doxygen Block:
      ${doxygenBlock || '(no Doxygen found — infer scenarios from signature and context)'}

      File Global Context:
      ${JSON.stringify(fileContextInfo, null, 2)}

      ${defines ? `Active Build Macros: ${defines}` : ''}

      Instructions:
      1. Extract EVERY specific rule, precondition (@pre), postcondition (@post), return rule (@return),
         warning (@warning), error condition (@throws), and any explicit or implied boundary from the Doxygen.
      2. If a @warning references a macro (e.g. BUF_MAX), use the build macros above to determine its value.
      3. For each extracted clause, map it to a concrete testing Scenario.
      4. Assign a priority_weight (1-10) based on clause severity:
         - @warning → 9,  @throws / error paths → 8,  @pre / precondition → 7
         - @post / state change → 6,  @return / nominal → 5,  implied boundary → 4

      Return a JSON array where each object has:
      {
        "scenario_id": "<UNIQUE-ID e.g. BOUNDARY-001>",
        "doxygen_clause": "<exact quote from Doxygen that motivates this>",
        "type": "nominal | boundary | error | precondition | state_transition",
        "expected_behavior": "<precise assertion target — what we check>",
        "priority_weight": <1-10>,
        "implied_stubs": ["<DependencyClass::method to mock>"],
        "setup_notes": "<brief setup / precondition setup note>"
      }
    `;

    const scenarios = await this.geminiService.queryJSON(prompt);
    return Array.isArray(scenarios) ? scenarios : [];
  }
}
