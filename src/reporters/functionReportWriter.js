import fs from 'fs';

/**
 * Generates structured gap reports isolated to specific Function scopes and whole-file metrics.
 * Includes priority heatmap legend, assertion score column, and mocking strategies table.
 */
export class FunctionReportWriter {
  constructor(outputPath) {
    this.outputPath = outputPath;
  }

  /**
   * Writes the function-level analysis report.
   *
   * @param {string} filePath          - source file analyzed
   * @param {Array}  inventory         - ranked function inventory from FunctionPrioritizationEngine
   * @param {Array}  focusedFunctions  - deep-analysis results for selected functions
   * @param {Object} assertionScores   - optional map: { functionName: evaluationResult }
   * @param {Object} mockingStrategies - optional map from WholeFileAnalyzer: { signature: [...] }
   */
  write(filePath, inventory, focusedFunctions, assertionScores = {}, mockingStrategies = {}) {
    const timestamp = new Date().toISOString();
    let md = `# Function-Level Analysis Report\n\n`;
    md += `*Target File: \`${filePath}\`*  \n`;
    md += `*Generated: ${timestamp}*\n\n`;

    // ── Priority Heatmap Legend ─────────────────────────────────────────────────
    md += `## Priority Heatmap Legend\n`;
    md += `| Tier | Badge | Score Range | Meaning |\n`;
    md += `|------|-------|-------------|---------|\n`;
    md += `| CRITICAL | 🔴 | > 70 | Must test — high complexity + documented |\n`;
    md += `| HIGH     | 🟠 | 40–70 | Should test — public API or Doxygen found |\n`;
    md += `| LOW      | 🟢 | < 40  | Optional — passthrough or already covered |\n\n`;

    // ── File Inventory Dashboard ─────────────────────────────────────────────────
    md += `## File Inventory Dashboard\n`;
    md += `Total Functions Discovered: **${inventory.length}**  \n`;
    md += `Selected for Deep Focus: **${inventory.filter(f => f.selected_for_focus).length}**\n\n`;

    md += `| Tier | Signature | Doxygen? | Priority | Assertion Score | Focused? | Reason |\n`;
    md += `|------|-----------|----------|----------|-----------------|----------|--------|\n`;

    for (const func of inventory) {
      const tierBadge =
        func.priority_tier === 'CRITICAL' ? '🔴' :
        func.priority_tier === 'HIGH'     ? '🟠' : '🟢';

      const dox = func.doxygen_found ? '✅' : '❌';
      const foc = func.selected_for_focus ? '✅' : '❌';

      const assertEval = assertionScores[func.function_name];
      const assertCol  = assertEval
        ? `${assertEval.score}/5 (${assertEval.confidence ? (assertEval.confidence * 100).toFixed(0) + '% conf' : ''})`
        : '—';

      md += `| ${tierBadge} | \`${func.function_name}\` | ${dox} | ${func.priority} | ${assertCol} | ${foc} | ${func.selection_reason || 'Skipped'} |\n`;
    }
    md += `\n`;

    // ── Mocking Strategies ──────────────────────────────────────────────────────
    const mockKeys = Object.keys(mockingStrategies);
    if (mockKeys.length > 0) {
      md += `## Mocking Strategies\n`;
      md += `| Function | Dependency | Mock Style | Injected? |\n`;
      md += `|----------|------------|------------|-----------|\n`;
      for (const sig of mockKeys) {
        for (const dep of mockingStrategies[sig] || []) {
          const injected = dep.is_injected ? '✅ Yes' : '❌ No (link seam)';
          md += `| \`${sig}\` | \`${dep.dependency_type}\` | ${dep.mock_style || dep.reason || ''} | ${injected} |\n`;
        }
      }
      md += `\n`;
    }

    // ── Deep Focus Results ──────────────────────────────────────────────────────
    md += `## Deep Focus Results\n`;

    if (!focusedFunctions || focusedFunctions.length === 0) {
      md += `*No functions selected for deep focus in this run.*\n`;
    } else {
      for (const focus of focusedFunctions) {
        md += `### Function \`${focus.signature}\`\n`;
        md += `- **Role/Context**: ${focus.role || '—'}\n`;
        md += `- **Requirements Extracted**: ${(focus.related_requirements || []).length}\n`;
        md += `- **Doxygen Scenarios**: ${(focus.doxygen_scenarios || []).length}\n`;
        md += `- **Missing Coverage Gaps**: ${(focus.missing_scenarios || []).length}\n\n`;

        if (focus.notes && focus.notes.length > 0) {
          md += `**Notes:**\n`;
          for (const note of focus.notes) {
            md += `- ${note}\n`;
          }
          md += `\n`;
        }

        if (focus.reviewer_hints && focus.reviewer_hints.length > 0) {
          md += `#### Reviewer Hints\n`;
          for (const hint of focus.reviewer_hints) {
            md += `- ${hint}\n`;
          }
        }

        md += `\n---\n`;
      }
    }

    fs.writeFileSync(this.outputPath, md);
    console.log(`[REPORT] Saved function-focused report → ${this.outputPath}`);
  }
}
