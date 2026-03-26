import fs from 'fs';

/**
 * Serializes coverage gap analysis arrays to a JSON artifact.
 * Includes enriched metadata and per-gap assertion hints.
 */
export class JSONReportWriter {
  /**
   * @param {string} outputPath - absolute file path, or '-' to print to stdout
   */
  constructor(outputPath) {
    this.outputPath = outputPath;
  }

  /**
   * Writes the gap analysis to JSON.
   *
   * @param {Array}  gapScenarios  - enriched gap objects from CoverageGapAnalyzer
   * @param {Object} options       - { filePath, toolName }
   */
  write(gapScenarios, options = {}) {
    const uncoveredGaps  = gapScenarios.filter(g => g.status === 'uncovered');
    const partialGaps    = gapScenarios.filter(g => g.status === 'partially covered');
    const coveredCount   = gapScenarios.filter(g => g.status === 'fully covered').length;

    const coveragePct = gapScenarios.length > 0
      ? ((coveredCount / gapScenarios.length) * 100).toFixed(1)
      : '0.0';

    const report = {
      metadata: {
        analysisVersion: '3.0',
        toolName: options.toolName || 'GTest Architect',
        generatedAt: new Date().toISOString(),
        filePath: options.filePath || null,
        totalScenarios: gapScenarios.length,
        fullyCoveredCount: coveredCount,
        partialCount: partialGaps.length,
        uncoveredCount: uncoveredGaps.length,
        coveragePercent: parseFloat(coveragePct),
      },
      gaps: gapScenarios.map(g => ({
        scenario_id: g.scenario_id,
        type: g.type || 'behavior',
        status: g.status,
        expected_behavior: g.expected_behavior || g.expected_output || '',
        requirement_source: g.requirement_source || g.doc_trace || 'derived',
        confidence_score: g.confidence_score ?? g.confidence ?? null,
        matching_test: g.matching_test ?? null,
        assertion_hints: g.assertion_hints || [],
        doc_trace: g.doc_trace || g.requirement_source || '',
        priority_weight: g.priority_weight ?? (g.status === 'uncovered' ? 10 : 5),
      })),
    };

    const reportStr = JSON.stringify(report, null, 2);

    if (this.outputPath === '-') {
      console.log(reportStr);
    } else {
      const dir = path.dirname(this.outputPath);
      if (dir !== '.' && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.outputPath, reportStr);
      console.log(`[REPORT] Saved JSON gap report → ${this.outputPath}`);
    }

    return report;
  }
}
