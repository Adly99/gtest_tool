/**
 * Rates the assertion depth and quality of existing test cases.
 * Identifies GTest anti-patterns and suggests concrete fixes.
 */
export class AssertionStrengthAnalyzer {
  constructor(aiService) {
    this.aiService = aiService;
  }

  /**
   * Evaluates assertion quality for a single test definition against its expected scenario.
   * @returns {Object} { score, reasoning, suggested_fix, anti_patterns_found, confidence }
   */
  async evaluateAssertionQuality(testDefinition, expectedScenario) {
    const prompt = `
      You are a senior C++ testing expert. Evaluate this Google Test assertion quality.

      Test Code:
      ${testDefinition.code}

      Expected Behavior for this Scenario:
      ${expectedScenario.expected_behavior}

      SCORING RUBRIC (1-5):
      1 = Only ASSERT_TRUE(true) or no meaningful assertions
      2 = Checks return value only, ignores side effects
      3 = Checks return value and some state
      4 = Deep state + side-effect validation with EXPECT_CALL mocks
      5 = Full: state, side effects, mock call counts, edge error paths

      ANTI-PATTERNS to detect (flag any found):
      - "ASSERT_TRUE(ptr != nullptr)" used as only null check (prefer ASSERT_NE)
      - Boolean return checked without verifying internal state changes
      - Hard-coded sleep/wait without MockClock injection
      - Real file I/O instead of virtual filesystem stub
      - Missing EXPECT_CALL verification for collaborator interactions
      - EXPECT_EQ on string content subject to localization

      Return JSON exactly:
      {
        "score": <1-5 integer>,
        "reasoning": "<explanation>",
        "suggested_fix": "<concrete code or suggestion>",
        "anti_patterns_found": ["<pattern1>", "<pattern2>"],
        "confidence": <0.0-1.0>
      }
    `;

    const response = await this.aiService.queryJSON(prompt);
    return response || {
      score: 0,
      reasoning: 'Evaluation failed — Gemini unavailable',
      suggested_fix: 'Retry with a valid API key.',
      anti_patterns_found: [],
      confidence: 0,
    };
  }

  /**
   * Batch-evaluates multiple test definitions in a single Gemini call.
   * More efficient than N individual calls for large test suites.
   * @param {Array} testDefinitions - array of { code, name }
   * @param {Array} scenarios       - parallel array of { expected_behavior }
   * @returns {Array} array of evaluation objects
   */
  async batchEvaluate(testDefinitions, scenarios) {
    if (!testDefinitions || testDefinitions.length === 0) return [];

    const items = testDefinitions.map((t, i) => ({
      index: i,
      test_name: t.name || `Test_${i}`,
      test_code: t.code,
      expected_behavior: (scenarios[i] || {}).expected_behavior || 'Unknown',
    }));

    const prompt = `
      You are a senior C++ testing expert. Evaluate ALL of the following Google Tests for assertion strength.

      Items to evaluate:
      ${JSON.stringify(items, null, 2)}

      For each item use the same scoring rubric and anti-pattern rules as a rigorous senior reviewer.

      Return a JSON array (one object per item, in the same order):
      [
        {
          "index": <same index as input>,
          "test_name": "<name>",
          "score": <1-5>,
          "reasoning": "<brief explanation>",
          "suggested_fix": "<concrete suggestion>",
          "anti_patterns_found": ["..."],
          "confidence": <0.0-1.0>
        }
      ]
    `;

    const response = await this.aiService.queryJSON(prompt);
    return Array.isArray(response) ? response : [];
  }

  /**
   * Computes a histogram of assertion scores from a batch result.
   * @param {Array} evaluations - result of batchEvaluate
   * @returns {Object} { "1": count, "2": count, ... , averageScore }
   */
  buildScoreHistogram(evaluations) {
    const histogram = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let total = 0;
    for (const ev of evaluations) {
      const s = Math.min(5, Math.max(1, Math.round(ev.score || 1)));
      histogram[s] = (histogram[s] || 0) + 1;
      total += s;
    }
    const averageScore = evaluations.length > 0 ? (total / evaluations.length).toFixed(2) : 0;
    return { ...histogram, averageScore };
  }
}
