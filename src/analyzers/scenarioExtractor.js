/**
 * Correlates multiple information sources into structured Test Scenarios using Chain-of-Thought reasoning.
 * Sources: Doxygen, Requirements, LLD/Design docs, Code Structure Analysis.
 */
export class ScenarioExtractor {
  constructor(geminiService) {
    this.geminiService = geminiService;
  }

  /**
   * Extracts all testable scenarios for a symbol from all available documentation.
   *
   * @param {string} symbolName  - function or class name
   * @param {Object} docData     - Doxygen data
   * @param {Object} reqData     - requirements data
   * @param {Object} codeData    - from CodeStructureAnalyzer (branches, functions, etc.)
   * @param {Object} options     - { chainOfThought: boolean, stubbedDependencies: [] }
   * @returns {Array} scenario objects
   */
  async extract(symbolName, docData, reqData, codeData, options = {}) {
    const { chainOfThought = true, stubbedDependencies = [] } = options;

    const prompt = `
      You are a senior C++ test architect performing comprehensive scenario extraction for a function.

      Target Symbol: ${symbolName}

      Documentation (Doxygen):
      ${JSON.stringify(docData, null, 2)}

      Requirements / Specification:
      ${JSON.stringify(reqData, null, 2)}

      Code Structure Analysis:
      ${JSON.stringify(codeData, null, 2)}

      Stubbed Dependencies available:
      ${stubbedDependencies.length > 0 ? stubbedDependencies.join(', ') : '(none listed — infer from code)'}

      ${chainOfThought ? `
      CHAIN-OF-THOUGHT MODE:
      Before finalising each scenario, internally reason through:
      1. What exact boundary condition does this address?
      2. What initial state setup is needed to reach this code path?
      3. What observable side-effect or return value determines success?
      ` : ''}

      Extract ALL necessary testing scenarios, categorized as:
      1. Happy Path — normal successful execution
      2. Boundaries — exact limit values (off-by-one, max/min)
      3. Invalid Inputs — null, empty, out-of-range, malformed
      4. Error Handling — exception paths, error return codes
      5. State Transitions — observable state changes after the call

      Return a JSON array where each object has:
      {
        "scenario_id": "<TYPE-NNN e.g. HAPPY-001>",
        "type": "happy_path | boundary | invalid_input | error | state_transition",
        "expected_behavior": "<precise assertion: what value/state/exception to check>",
        "precondition": "<what must be true before calling the function>",
        "confidence": <0.0-1.0 confidence this scenario is worth testing>,
        "requirement_source": "<Doxygen tag, req ID, or 'inferred from code'>",
        "stub_strategy": "<how to mock dependencies: EXPECT_CALL, constructor injection, link seam, etc.>",
        "thought_process": ${chainOfThought ? '"<one sentence reasoning chain>"' : '"(disabled)"'}
      }
    `;

    const response = await this.geminiService.queryJSON(prompt);
    return Array.isArray(response) ? response : [];
  }
}
