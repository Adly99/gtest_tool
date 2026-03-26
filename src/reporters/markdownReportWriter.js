import fs from 'fs';

/**
 * Formats coverage gap analysis into a human-readable Markdown artifact.
 * Features: ASCII coverage bar, per-gap code trace blocks, assertion hint callouts.
 */
export class MarkdownReportWriter {
  /**
   * @param {string} outputPath
   */
  constructor(outputPath) {
    this.outputPath = outputPath;
  }

  /**
   * Writes the coverage gap report to Markdown.
   *
   * @param {string} moduleName    - name of the analyzed module/file
   * @param {Array}  gapScenarios  - enriched gap objects from CoverageGapAnalyzer
   * @param {Object} options       - { filePath }
   */
  write(moduleName, gapScenarios, options = {}) {
    const timestamp = new Date().toISOString();
    const filePath  = options.filePath || moduleName;

    const uncovered = gapScenarios.filter(g => g.status === 'uncovered').length;
    const partial   = gapScenarios.filter(g => g.status === 'partially covered').length;
    const covered   = gapScenarios.filter(g => g.status === 'fully covered').length;
    const total     = gapScenarios.length;
    const pct       = total > 0 ? Math.round((covered / total) * 100) : 0;

    let md = `# Coverage Gap Report: \`${moduleName}\`\n\n`;
    md += `*Source File: \`${filePath}\`*  \n`;
    md += `*Generated: ${timestamp} by GTest Architect v3.0 (Autonomous Engine)*\n\n`;

    // ── Summary Dashboard ────────────────────────────────────────────────────────
    md += `## Summary Dashboard\n\n`;
    md += this._renderCoverageBar(pct);
    md += `\n`;
    md += `| Metric | Count |\n`;
    md += `|--------|-------|\n`;
    md += `| Total Scenarios | **${total}** |\n`;
    md += `| ✅ Fully Covered | **${covered}** |\n`;
    md += `| 🟠 Partially Covered | **${partial}** |\n`;
    md += `| 🔴 Uncovered | **${uncovered}** |\n`;
    md += `| **Coverage %** | **${pct}%** |\n\n`;

    // ── Detailed Scenarios ────────────────────────────────────────────────────────
    md += `## Detailed Gaps\n\n`;

    if (total === 0) {
      md += `*No scenarios were extracted. Run with Doxygen-annotated source files for best results.*\n`;
    }

    // Sort by priority weight desc
    const sortedGaps = [...gapScenarios].sort((a, b) => 
      (b.priority_weight || 0) - (a.priority_weight || 0)
    );

    for (const gap of sortedGaps) {
      const badge =
        gap.status === 'uncovered'         ? '🔴 UNCOVERED' :
        gap.status === 'partially covered' ? '🟠 PARTIAL'   : '🟢 COVERED';

      const conf = gap.confidence_score ?? gap.confidence ?? 0;
      const confBadge = conf >= 0.8 ? '🟢' : conf >= 0.5 ? '🟠' : '🔴';
      const confStr = ` ${confBadge} *(${(conf * 100).toFixed(0)}% confidence)*`;

      md += `### [${badge}] ${gap.scenario_id}${confStr}\n`;
      md += `- **Type**: ${gap.type || 'behavior'}\n`;
      md += `- **Expected Behavior**: ${gap.expected_behavior || gap.expected_output || '—'}\n`;
      md += `- **Requirement Source**: ${gap.requirement_source || gap.doc_trace || 'derived'}\n`;

      if (gap.matching_test) {
        md += `- **Closest Existing Test**: \`${gap.matching_test}\`\n`;
      }

      // Doc trace block
      if (gap.doc_trace || gap.requirement_source) {
        md += `\n> **📎 Context:** *"${gap.doc_trace || gap.requirement_source}"*\n`;
      }

      // Assertion hints
      const hints = gap.assertion_hints || [];
      if (hints.length > 0) {
        md += `\n**💡 Assertion Hints:**\n`;
        for (const hint of hints) {
          md += `- ${hint}\n`;
        }
      }

      md += `\n---\n\n`;
    }

    const dir = path.dirname(this.outputPath);
    if (dir !== '.' && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.outputPath, md);
    console.log(`[REPORT] Saved Markdown gap report → ${this.outputPath}`);
  }

  /**
   * Renders an ASCII coverage percentage bar.
   * e.g. [██████████░░░░░░░░░░] 50%
   */
  _renderCoverageBar(pct) {
    const filled = Math.round(pct / 5);   // 20 chars total
    const empty  = 20 - filled;
    const bar    = '█'.repeat(filled) + '░'.repeat(empty);
    const color  = pct >= 80 ? '✅' : pct >= 50 ? '🟠' : '🔴';
    return `${color} \`[${bar}]\` **${pct}% covered**\n`;
  }
}
