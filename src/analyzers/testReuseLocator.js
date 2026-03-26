/**
 * Identifies appropriate existing fixtures/suites to reuse when adding coverage.
 * Uses both filename matching and class-name extraction heuristics.
 */
export class TestReuseLocator {
  constructor(existingTests) {
    this.existingTests = existingTests || [];
  }

  /**
   * Finds the best test file, test suite, and fixture for a target gap scenario.
   *
   * @param {string} targetSymbolName   - e.g. "MyClass::doThing" or "computeHash"
   * @param {Object} scenarioContext    - optional: { type, expected_behavior }
   * @returns {{ directive, targetFile, targetSuite, confidence, matchReason }}
   */
  findBestSuite(targetSymbolName, scenarioContext = {}) {
    // Extract the class name part if present (e.g. "MyClass::doThing" → "MyClass")
    const parts = targetSymbolName.split('::');
    const className   = parts.length > 1 ? parts[0] : null;
    const methodName  = parts[parts.length - 1];

    let bestMatch = null;
    let bestScore = 0;

    for (const t of this.existingTests) {
      let score = 0;
      let reason = '';

      // 1. Class-name match in filename (strongest signal)
      if (className && t.file && t.file.includes(className)) {
        score += 60;
        reason = `Filename contains class name "${className}"`;
      }

      // 2. Method-name match in filename
      if (t.file && t.file.includes(methodName)) {
        score += 30;
        reason = reason || `Filename contains method name "${methodName}"`;
      }

      // 3. Suite-name match
      const suiteMatch = (t.suites || []).find(
        s => s.suite && (s.suite.includes(className || '') || s.suite.includes(methodName))
      );
      if (suiteMatch) {
        score += 40;
        reason = reason || `Suite "${suiteMatch.suite}" references "${targetSymbolName}"`;
      }

      // 4. Generic "Test" suffix guess
      if (t.file && className && t.file.includes(className + 'Test')) {
        score += 20;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = { file: t.file, suite: suiteMatch ? suiteMatch.suite : null, reason };
      }
    }

    if (bestMatch && bestScore > 30) {
      const confidence = Math.min(1.0, bestScore / 100);
      return {
        directive: 'APPEND',
        targetFile: bestMatch.file,
        targetSuite: bestMatch.suite || (className ? `${className}Test` : `${methodName}Test`),
        confidence,
        matchReason: bestMatch.reason,
      };
    }

    // No good match — recommend creating a new file
    const suggestedClass = className || methodName;
    return {
      directive: 'CREATE_NEW',
      targetFile: `${suggestedClass}_test.cpp`,
      targetSuite: `${suggestedClass}Test`,
      confidence: 1.0,
      matchReason: 'No existing test file found for this symbol — creating new suite.',
    };
  }
}
