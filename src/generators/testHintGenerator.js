/**
 * Generates structured rationale (hints) explaining why each test case was generated.
 * Aligns with v2.0 reporter fields: doc_trace, assertion_hint, confidence, etc.
 */
export class TestHintGenerator {
  constructor() {}

  /**
   * Produces a single reviewer hint object for a gap scenario.
   * @param {Object} gapScenario          - enriched gap from CoverageGapAnalyzer
   * @param {string} targetSuiteStr       - test suite name the test will be added to
   * @param {Object} assertionStrengthCheck - result from AssertionStrengthAnalyzer (optional)
   * @returns {Object} hint object
   */
  generateHint(gapScenario, targetSuiteStr, assertionStrengthCheck = null) {
    const confidence = gapScenario.confidence ?? gapScenario.confidence_score ?? 1.0;
    return {
      scenario_id: gapScenario.scenario_id,
      target_suite: targetSuiteStr,
      reason_for_generation:
        gapScenario.status === 'uncovered'
          ? 'Requirement unverified in existing tests'
          : gapScenario.status === 'partially covered'
            ? 'Strengthening weak or incomplete existing coverage'
            : 'Assertion depth improvement recommended',
      doc_trace:
        gapScenario.doc_trace ||
        gapScenario.requirement_source ||
        gapScenario.doxygen_clause ||
        'Implicit branch discovery',
      code_trace: `Review branch within ${gapScenario.symbol || gapScenario.scenario_id || 'unknown'}`,
      helper_awareness: gapScenario.relies_on_helpers
        ? 'WARNING: This function delegates to internal helpers. Prefer testing via this public API.'
        : 'Standalone logic — test directly.',
      stub_setup_hint:
        (gapScenario.implied_stubs || []).join(', ') ||
        (gapScenario.stub_strategy) ||
        'No stubs required',
      assertion_hint:
        assertionStrengthCheck?.suggested_fix ||
        (gapScenario.assertion_hints || [])[0] ||
        'Standard state + return-code check',
      anti_patterns_to_avoid: assertionStrengthCheck?.anti_patterns_found || [],
      confidence,
      reviewer_note:
        confidence < 0.7
          ? 'WARNING: Low-confidence scenario. Manually verify stub states and boundary values.'
          : 'Generated via automated derivation — high confidence.',
    };
  }

  /**
   * Batch-generates hints for an array of gap scenarios in one pass (no Gemini needed).
   * @param {Array}  gapScenarios           - array of enriched gap objects
   * @param {string} targetSuiteStr         - test suite name
   * @param {Object} assertionScoreMap      - optional map { scenario_id: evaluationResult }
   * @returns {Array} array of hint objects
   */
  generateBatchHints(gapScenarios, targetSuiteStr, assertionScoreMap = {}) {
    return gapScenarios.map(gap =>
      this.generateHint(gap, targetSuiteStr, assertionScoreMap[gap.scenario_id] || null)
    );
  }

  /**
   * Formats hints as a Markdown block for embedding in reports or console output.
   * @param {Array} hints - output of generateBatchHints
   * @returns {string} markdown string
   */
  formatAsMarkdown(hints) {
    if (!hints || hints.length === 0) return '*No hints generated.*\n';
    return hints.map(h => {
      const confPct = Math.round((h.confidence || 0) * 100);
      const confBadge = confPct >= 80 ? '🟢' : confPct >= 60 ? '🟠' : '🔴';
      return [
        `### ${h.scenario_id} ${confBadge} (${confPct}% confidence)`,
        `- **Reason**: ${h.reason_for_generation}`,
        `- **Doc Trace**: ${h.doc_trace}`,
        `- **Assertion Hint**: ${h.assertion_hint}`,
        `- **Stub Setup**: ${h.stub_setup_hint}`,
        h.anti_patterns_to_avoid.length > 0
          ? `- **⚠️ Avoid**: ${h.anti_patterns_to_avoid.join(', ')}`
          : '',
        `- *${h.reviewer_note}*`,
        '',
      ].filter(Boolean).join('\n');
    }).join('\n---\n\n');
  }
}
