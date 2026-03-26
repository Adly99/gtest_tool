/**
 * Base class for all AI providers.
 * Defines the contract for interacting with different LLM APIs.
 */
export class AIProvider {
  constructor(options = {}) {
    this.name = options.name || 'base';
    this.maxRetries = options.maxRetries || 3;
    this.systemPrompt = options.systemPrompt || `You are a Senior C++ Automated Verification Engineer.
Your goal is to produce HIGH-QUALITY, COMPILABLE GMock headers.
REGULATIONS FOR PRODUCTION-GRADE TRANSFORMATION:
1. Return ONLY raw, parseable JSON. NO markdown fences (\`\`\`json).
2. "mock_code" IS THE MANDATORY AND PRIMARY KEY. YOU MUST PROVIDE THE COMPLETE CODE.
3. Keep "thought_process" brief (max 1-2 lines) or omit it to save generation headroom.
4. PROVIDE COMPLETE IMPLEMENTATIONS ONLY. Do NOT truncate, do NOT use placeholders.
5. If the transformation consists only of an explanation without code, the task has FAILED.`;
  }

  /**
   * Queries the AI and parses the response as JSON.
   */
  async queryJSON(promptText) {
    throw new Error('queryJSON not implemented');
  }

  /**
   * Queries the AI and returns the raw text.
   */
  async queryText(promptText) {
    throw new Error('queryText not implemented');
  }

  /**
   * Helper to clean and parse JSON from AI response.
   */
  _parseJSON(raw) {
    if (!raw) return null;
    
    let clean = raw.trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    // v7.8.5: Multi-Stage Resilient Parsing (Handle Truncation)
    const attempts = [
        () => JSON.parse(clean),
        () => this._parseHeuristic(clean, '{', '}'),
        () => this._parseHeuristic(clean, '[', ']'),
        () => this._parseHeuristic(this._repairTruncated(clean), '{', '}'),
        () => this._parseHeuristic(this._repairTruncated(clean), '[', ']')
    ];

    for (const attempt of attempts) {
        try {
            const result = attempt();
            if (result) return result;
        } catch (e) { /* silent retry */ }
    }

    console.error(`[${this.name}] All JSON parse attempts failed. Content tail: ${clean.substring(clean.length - 200)}`);
    return null;
  }

  _parseHeuristic(text, startChar, endChar) {
    const first = text.indexOf(startChar);
    const last  = text.lastIndexOf(endChar);
    if (first !== -1 && last !== -1 && last > first) {
      const candidate = text.substring(first, last + 1);
      return JSON.parse(this._sanitizeJSON(candidate));
    }
    return null;
  }

  _repairTruncated(text) {
    // v7.8.5: Simple Truncation Repair (Close unclosed quotes/brackets)
    let repaired = text.trim();
    
    // Close unclosed quote
    const quoteCount = (repaired.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) repaired += '"';

    // Close unclosed brackets (dumb closer)
    const openBraces = (repaired.match(/{/g) || []).length;
    const closeBraces = (repaired.match(/}/g) || []).length;
    for (let i = 0; i < openBraces - closeBraces; i++) repaired += '}';

    const openSquares = (repaired.match(/\[/g) || []).length;
    const closeSquares = (repaired.match(/\]/g) || []).length;
    for (let i = 0; i < openSquares - closeSquares; i++) repaired += ']';

    return repaired;
  }

  _sanitizeJSON(jsonStr) {
    // Ultra-Robust Sanitization v6.8
    return jsonStr
      .replace(/,(\s*[\]}])/g, '$1') // remove trailing commas
      .trim();
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
