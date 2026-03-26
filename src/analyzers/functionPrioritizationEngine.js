/**
 * Ranks an inventory of functions to decide which ones need targeted test generation.
 * Prioritizes Doxygen-heavy, high-cyclomatic-complexity, and public-API functions.
 */

/** Minimum priority score for a function to be selected for deep focus. */
export const PRIORITY_THRESHOLD = 40;

/** Maximum bonus score from cyclomatic complexity. */
const MAX_COMPLEXITY_BONUS = 30;

export class FunctionPrioritizationEngine {
  constructor(threshold = PRIORITY_THRESHOLD) {
    this.threshold = threshold;
  }

  /**
   * Assigns priority scores and ranks functions for Level-2 focused analysis.
   * @param {Array}  inventory            - from FunctionInventoryExtractor
   * @param {Object} fileContextAnalysis  - from WholeFileAnalyzer
   * @param {Array}  oldTestsSummary      - from TestCaseParser
   * @returns {Array} sorted inventory with priority, selected_for_focus, selection_reason, notes
   */
  rankFunctions(inventory, fileContextAnalysis = {}, oldTestsSummary = []) {
    const functionRoles = fileContextAnalysis.function_roles || {};
    const coveredNames = new Set(
      oldTestsSummary.flatMap(t =>
        (t.coveredFunctions || []).concat(
          (t.suites || []).flatMap(s => s.tests || []).map(n => n.split('_')[0])
        )
      )
    );

    for (const func of inventory) {
      let score = 0;
      const selectionReason = [];
      const notes = [];

      // ── Public API Rule ──────────────────────────────────────────────────────
      if (func.access_level === 'public' || !func.class_name) {
        score += 30;
        selectionReason.push('Publicly visible API');
        notes.push('Public APIs are first-order testing targets (user-facing contracts).');
      }

      // ── Doxygen Rule ─────────────────────────────────────────────────────────
      if (func.doxygen_found) {
        score += 40;
        selectionReason.push('Has documented intent (Doxygen)');
        notes.push('Doxygen blocks encode requirements — each clause maps to a scenario.');
      }

      // ── Cyclomatic Complexity / Branch Density ────────────────────────────────
      const branchCount = func.branch_count_estimate || 0;
      if (branchCount > 0) {
        const complexityBonus = Math.min(MAX_COMPLEXITY_BONUS, branchCount * 5);
        score += complexityBonus;
        if (branchCount > 3) {
          selectionReason.push(`High cyclomatic complexity (${branchCount} branches)`);
          notes.push(`${branchCount} detectable branches imply at least ${branchCount + 1} distinct test paths.`);
        }
      }

      // ── Helper / Wrapper Penalty ──────────────────────────────────────────────
      const role = (functionRoles[func.signature] || '').toLowerCase();
      if (role.includes('trivial') || role.includes('passthrough') || role.includes('wrapper')) {
        score -= 50;
        notes.push('Identified as passthrough/wrapper — covered transitively by callers.');
      }

      // ── Coverage Penalty ──────────────────────────────────────────────────────
      const alreadyCovered = coveredNames.has(func.function_name);
      if (!alreadyCovered) {
        score += 15;
        selectionReason.push('Not covered by existing tests');
        notes.push('No matching test found in old test suite — high generation value.');
      } else {
        notes.push('Existing tests reference this function — deprioritized slightly.');
      }

      func.priority = Math.max(0, score);
      func.selected_for_focus = func.priority > this.threshold;
      func.selection_reason = selectionReason.join(', ') || 'Below priority threshold';
      func.notes = notes;

      // Heatmap tier
      if (func.priority > 70) {
        func.priority_tier = 'CRITICAL';
      } else if (func.priority > this.threshold) {
        func.priority_tier = 'HIGH';
      } else {
        func.priority_tier = 'LOW';
      }
    }

    return inventory.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Returns the top N functions by priority score.
   * @param {Array}  rankedInventory - output of rankFunctions()
   * @param {number} n
   */
  getTopN(rankedInventory, n) {
    return rankedInventory.slice(0, n);
  }

  /**
   * Returns all functions selected for deep focus (above threshold).
   * @param {Array} rankedInventory - output of rankFunctions()
   */
  getFocused(rankedInventory) {
    return rankedInventory.filter(f => f.selected_for_focus);
  }
}
