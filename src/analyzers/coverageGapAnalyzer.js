/**
 * Compares ideal Scenarios against parsed Test Cases to report Gaps.
 * Returns enriched gap objects with confidence scores, assertion hints, and doc traces.
 */
export class CoverageGapAnalyzer {
  constructor(aiService) {
    this.aiService = aiService;
  }

  /**
   * Identifies which expected scenarios are missing or only partially covered.
   *
   * @param {Array} idealScenarios  - from DoxygenToScenarioMapper / ScenarioExtractor
   * @param {Array} existingTests   - from TestCaseParser
   * @returns {Array} enriched gap objects with status, confidence_score, assertion_hints, doc_trace
   */
  async computeGaps(idealScenarios, existingTests) {
    // Fast path: no existing tests → everything is uncovered
    if (!existingTests || existingTests.length === 0) {
      return idealScenarios.map(s => ({
        ...s,
        status: 'uncovered',
        confidence_score: 1.0,
        assertion_hints: [`No existing tests found — generate from scratch for "${s.scenario_id}"`],
        doc_trace: s.doxygen_clause || s.requirement_source || '',
      }));
    }

    const prompt = `
      You are a senior C++ test coverage analyst. Compare the ideal testing scenarios against the
      actual existing test cases and classify coverage status for each scenario.

      Ideal Scenarios:
      ${JSON.stringify(idealScenarios, null, 2)}

      Existing Tests (summaries):
      ${JSON.stringify(existingTests, null, 2)}

      For EACH ideal scenario, determine:
      - "fully covered"   : an existing test clearly validates this exact behavior
      - "partially covered": an existing test touches this area but misses key assertions or branches
      - "uncovered"       : no existing test addresses this scenario at all

      Return a JSON array, one object per ideal scenario, in the same order:
      [
        {
          "scenario_id": "<from ideal>",
          "type": "<from ideal>",
          "expected_behavior": "<from ideal>",
          "requirement_source": "<from ideal>",
          "status": "fully covered | partially covered | uncovered",
          "confidence_score": <0.0-1.0 how confident you are in this classification>,
          "matching_test": "<test name if found, else null>",
          "assertion_hints": [
            "<concrete suggestion: e.g. Add EXPECT_CALL for FlushManager::trigger()>"
          ],
          "doc_trace": "<exact Doxygen clause or requirement that motivates this scenario>"
        }
      ]
    `;

    const mappings = await this.aiService.queryJSON(prompt);

    if (!Array.isArray(mappings)) return [];

    // Merge back any ideal scenario fields that Gemini may have omitted
    return mappings.map((gap, i) => ({
      ...idealScenarios[i],
      ...gap,
      assertion_hints: gap.assertion_hints || [],
      doc_trace: gap.doc_trace || (idealScenarios[i] || {}).doxygen_clause || '',
    }));
  }
}
