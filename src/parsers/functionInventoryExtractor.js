import fs from 'fs';
import path from 'path';

/**
 * Parses entire source/header files to extract all function definitions.
 *
 * Strategy (two-tier):
 * 1. Ask Gemini for a rich semantic inventory (preferred — full Doxygen awareness).
 * 2. If Gemini is unavailable or returns empty (e.g. rate-limit), fall back to a
 *    local regex-based extractor so the UI always shows something useful.
 */
export class FunctionInventoryExtractor {
  constructor(geminiService, promptBuilder = null) {
    this.geminiService = geminiService;
    this.promptBuilder = promptBuilder; // optional — uses inline prompt if null
  }

  /**
   * Scans a file and extracts a structured catalog of all functions.
   *
   * Strategy — Regex-first with optional Gemini enrichment:
   * 1. Run the local regex extractor immediately (synchronous, always fast).
   * 2. Race against a 6-second Gemini call. If Gemini responds in time with a
   *    non-empty array, use its richer semantic results. Otherwise keep the regex
   *    results. This guarantees the Web UI always gets data, even when the API
   *    quota is exhausted.
   */
  async extractInventory(filePath) {
    if (!fs.existsSync(filePath)) return [];

    const content = fs.readFileSync(filePath, 'utf-8');

    // ── Step 1: Instant regex extraction (baseline — always succeeds) ─────────
    const regexResults = this._localExtract(content, filePath);
    console.log(`[LEVEL-1] Local regex extracted ${regexResults.length} function(s) from ${path.basename(filePath)}`);

    // ── Step 2: Race Gemini enrichment against a hard 6-second timeout ────────
    const GEMINI_TIMEOUT_MS = 6000;

    const prompt = this.promptBuilder
      ? this.promptBuilder.buildInventoryPrompt(filePath, content.substring(0, 8000))
      : `
Given the following C++ file content, extract EVERY function
(free functions, member functions, statics, overloads, constructors, destructors).

File: ${filePath}
Content:
\`\`\`cpp
${content.substring(0, 8000)}
\`\`\`

For each function return a JSON object in an array with:
- "function_name"        : just the function name (no return type)
- "signature"            : full "ReturnType ClassName::Name(params)" string
- "doxygen_found"        : boolean — true if preceded by /** or /// comment block
- "doxygen_summary"      : one-line summary from Doxygen @brief or ""
- "access_level"         : "public" | "private" | "protected" | "free"
- "class_name"           : enclosing class name or null for free functions
- "branch_count_estimate": integer — estimated if/switch/ternary count in body
- "priority"             : integer 0-100 (public + Doxygen + complex = higher)
Return a JSON ARRAY only, no other text.
`;

    const timeoutPromise = new Promise(resolve =>
      setTimeout(() => resolve(null), GEMINI_TIMEOUT_MS)
    );

    console.log(`[LEVEL-1] Attempting Gemini enrichment (${GEMINI_TIMEOUT_MS / 1000}s budget)...`);
    let geminiResults = null;
    try {
      geminiResults = await Promise.race([
        this.geminiService.queryJSON(prompt),
        timeoutPromise,
      ]);
    } catch (_) {
      // Gemini failed — use regex results
    }

    if (Array.isArray(geminiResults) && geminiResults.length > 0) {
      console.log(`[LEVEL-1] ✅ Gemini enrichment succeeded — ${geminiResults.length} function(s) returned.`);
      return geminiResults;
    }

    console.log(`[LEVEL-1] ⚡ Using local regex results (${regexResults.length} function(s)).`);
    return regexResults;
  }

  // ───────────────────────────────────────────────────────────────────── private

  /**
   * Multi-pass local C++ extractor.
   *
   * Pass 1 — Pre-process: collapse multi-line signatures into single logical lines,
   *           build Doxygen block index, track class/struct/namespace scopes and
   *           access specifiers.
   * Pass 2 — Match: apply function-definition regex to logical lines, enrich with
   *           class context and Doxygen metadata collected in Pass 1.
   *
   * Handles:
   *  ✅ Free functions          (RetType name(...) {)
   *  ✅ In-class member fns     (void parse(...) { — no Foo:: prefix needed)
   *  ✅ Out-of-class qualified   (RetType Class::method(...) {)
   *  ✅ Constructors/Destructors (Foo(...) { / ~Foo() {)
   *  ✅ Operator overloads       (operator+, operator==, etc.)
   *  ✅ const / noexcept / override / final / = default / = delete / pure virtual
   *  ✅ Template functions       (template<...> RetType name(...) {)
   *  ✅ Multi-line param lists   joined before matching
   *  ✅ Access level tracking    (public: / private: / protected:)
   *  ✅ Doxygen summary extraction (@brief, first ///-sentence)
   */
  _localExtract(content, filePath) {
    const rawLines = content.split('\n');

    // ── Pass 1a: Build Doxygen index ──────────────────────────────────────────
    // Maps line index → { summary, endLine }
    const doxygenIndex = new Map();
    let inDoxygenBlock = false;
    let doxyBlockStart = -1;
    let doxyBrief = '';

    for (let i = 0; i < rawLines.length; i++) {
      const t = rawLines[i].trim();

      if (!inDoxygenBlock) {
        if (t.startsWith('/**') || t.startsWith('/*!')) {
          inDoxygenBlock = true;
          doxyBlockStart = i;
          doxyBrief = this._extractBrief(t);
        } else if (t.startsWith('///') || t.startsWith('//!')) {
          // Single-line /// block
          const brief = t.replace(/^\/\/[/!]\s*(?:@brief\s*)?/, '').trim();
          // Accumulate consecutive /// lines
          let j = i;
          let accumulated = brief;
          while (j + 1 < rawLines.length && rawLines[j + 1].trim().startsWith('///')) {
            j++;
            const more = rawLines[j].trim().replace(/^\/\/\/\s*/, '');
            if (!accumulated) accumulated = more;
          }
          doxygenIndex.set(j + 1, { summary: accumulated, startLine: i });
          doxygenIndex.set(j + 2, { summary: accumulated, startLine: i }); // handle blank line gap
          i = j;
        }
      } else {
        // Inside /** ... */ block
        const briefMatch = t.match(/@brief\s+(.+)/);
        if (briefMatch && !doxyBrief) doxyBrief = briefMatch[1].trim();

        if (t.includes('*/')) {
          inDoxygenBlock = false;
          const summary = doxyBrief;
          // Map the 1-2 lines AFTER the closing */
          doxygenIndex.set(i + 1, { summary, startLine: doxyBlockStart });
          doxygenIndex.set(i + 2, { summary, startLine: doxyBlockStart });
          doxyBrief = '';
        }
      }
    }

    // ── Pass 1b: Build logical lines (join multi-line signatures) ─────────────
    // A "logical line" fuses a line and its continuations until we see `{` or `;`
    const logicalLines = []; // { text, originalLineNum, rawLines[] }
    let i = 0;
    while (i < rawLines.length) {
      const base = rawLines[i];
      const baseTrim = base.trim();

      // Skip preprocessor, comments, blank lines, pure brace lines
      if (
        baseTrim.startsWith('#') ||
        baseTrim.startsWith('//') ||
        baseTrim.startsWith('/*') ||
        baseTrim.startsWith('*') ||
        baseTrim === '' ||
        baseTrim === '{' ||
        baseTrim === '}'
      ) {
        logicalLines.push({ text: base, originalLineNum: i, raw: [base] });
        i++;
        continue;
      }

      // If line contains `(` but not yet `)`, fuse following lines
      const openCount  = (baseTrim.match(/\(/g) || []).length;
      const closeCount = (baseTrim.match(/\)/g) || []).length;

      if (openCount > closeCount && !baseTrim.includes('{') && !baseTrim.endsWith(';')) {
        const segments = [baseTrim];
        const rawGroup = [base];
        let j = i + 1;
        let opens = openCount, closes = closeCount;

        while (j < rawLines.length && opens > closes) {
          const extra = rawLines[j].trim();
          if (!extra.startsWith('//') && !extra.startsWith('*')) {
            segments.push(extra);
            rawGroup.push(rawLines[j]);
            opens  += (extra.match(/\(/g) || []).length;
            closes += (extra.match(/\)/g) || []).length;
          }
          j++;
        }
        logicalLines.push({ text: segments.join(' '), originalLineNum: i, raw: rawGroup });
        i = j;
        continue;
      }

      logicalLines.push({ text: base, originalLineNum: i, raw: [base] });
      i++;
    }

    // ── Pass 1c: Track class/struct scope + access specifier ─────────────────
    // For each logical line, record what class (if any) it is inside + access level.
    const C_KEYWORDS = new Set(['if', 'while', 'for', 'switch', 'catch', 'else', 'do',
                                 'try', 'return', 'case', 'default', 'namespace', 'extern',
                                 'static_assert', 'typedef', 'using', 'enum']);

    // Stack entries: { name, accessLevel }
    const classStack   = [];
    const lineContext  = []; // parallel to logicalLines

    let braceDepth   = 0;
    const classBraceDepthStack = []; // brace depth at which each class was opened

    for (let idx = 0; idx < logicalLines.length; idx++) {
      const t = logicalLines[idx].text.trim();

      // Snapshot current context BEFORE processing this line's braces
      lineContext.push({
        className:   classStack.length > 0 ? classStack[classStack.length - 1].name : null,
        accessLevel: classStack.length > 0 ? classStack[classStack.length - 1].accessLevel : 'free',
      });

      // Detect class/struct/union opening (not forward declaration)
      const classMatch = t.match(/^(?:class|struct|union)\s+(\w+)\s*(?:final\s*)?(?::\s*[^{]*)?\{/);
      if (classMatch) {
        // Default access: struct/union = public, class = private
        const isStruct = t.startsWith('struct') || t.startsWith('union');
        classStack.push({ name: classMatch[1], accessLevel: isStruct ? 'public' : 'private' });
        classBraceDepthStack.push(braceDepth + 1);
      }

      // Track access specifiers
      const accessMatch = t.match(/^(public|private|protected)\s*:/);
      if (accessMatch && classStack.length > 0) {
        classStack[classStack.length - 1].accessLevel = accessMatch[1];
      }

      // Count brace changes
      const opens  = (t.match(/\{/g) || []).length;
      const closes = (t.match(/\}/g) || []).length;
      braceDepth += opens - closes;

      // Pop class scope when we return to the depth it was opened from
      while (
        classBraceDepthStack.length > 0 &&
        braceDepth < classBraceDepthStack[classBraceDepthStack.length - 1]
      ) {
        classBraceDepthStack.pop();
        classStack.pop();
      }
    }

    // ── Pass 2: Function-definition matching ──────────────────────────────────
    const results    = [];
    const seenSigs   = new Set();

    // Main regex: optional template + return-type + name + params + qualifiers + body-open or = default/delete
    // Groups: [1]=returnType  [2]=fullName  [3]=params  [4]=qualifiers
    const FN_RE = new RegExp(
      String.raw`^` +
      String.raw`(?:(?:inline|static|virtual|explicit|constexpr|consteval|constinit|friend)\s+)*` +  // storage/specifiers
      String.raw`(?:template\s*<[^>]*>\s*)?` +                       // template<...>
      String.raw`([\w:~<>*&\s]+?)\s+` +                              // [1] return type
      String.raw`((?:\w+::)*(?:~?\w+|operator\s*\S+?))\s*` +        // [2] name (with optional Class:: prefix)
      String.raw`\(([^)]*)\)\s*` +                                    // [3] params
      String.raw`((?:const|noexcept(?:\([^)]*\))?|override|final|volatile)\s*)*` + // [4] qualifiers
      String.raw`(?:=\s*(?:0|default|delete)\s*;|;|{)`              // body open OR pure/default/delete
    );

    for (let idx = 0; idx < logicalLines.length; idx++) {
      const { text, originalLineNum } = logicalLines[idx];
      const t = text.trim();
      if (!t) continue;

      const match = FN_RE.exec(t);
      if (!match) continue;

      const rawReturn = match[1].trim();
      const fullName  = match[2].trim();
      const rawParams = (match[3] || '').trim();
      const quals     = (match[4] || '').trim();

      // Filter out C++ control-flow keywords mistakenly matched
      if (C_KEYWORDS.has(rawReturn) || C_KEYWORDS.has(fullName.split('::').pop())) continue;
      // Filter out pure type declarations (e.g. "int x" with no parens)
      if (!t.includes('(')) continue;
      // Skip pure variable/type lines, struct field declarations
      if (/^(struct|enum|union|class)\b/.test(rawReturn)) continue;

      // Resolve class name from qualified name OR from scope tracker
      const nameParts = fullName.split('::');
      const funcBase  = nameParts[nameParts.length - 1];
      let   className = nameParts.length > 1 ? nameParts.slice(0, -1).join('::') : null;
      if (!className) className = lineContext[idx]?.className || null;

      // Identify constructor / destructor
      const isDestructor  = funcBase.startsWith('~');
      const isConstructor = className && (funcBase === className);
      const isCtor        = isConstructor || isDestructor;

      // Build clean signature
      // For constructors/destructors: "ClassName::CtorName(params)"
      // For operators: keep "operator+" style
      const qualSuffix = quals ? ` ${quals.trim()}` : '';
      const signature  = isCtor
        ? `${className ? className + '::' : ''}${funcBase}(${rawParams})${qualSuffix}`
        : `${rawReturn} ${className ? className + '::' : ''}${funcBase}(${rawParams})${qualSuffix}`;

      // De-duplicate (same signature may appear after joining lines)
      const sigKey = signature.replace(/\s+/g, ' ');
      if (seenSigs.has(sigKey)) continue;
      seenSigs.add(sigKey);

      // Doxygen: check original line and a few lines above
      const doxyEntry = doxygenIndex.get(originalLineNum) ||
                        doxygenIndex.get(originalLineNum + 1);
      const hasDoxygen = !!doxyEntry;
      const doxygenSummary = doxyEntry?.summary || '';

      // Access level from scope tracker
      const ctx         = lineContext[idx] || {};
      let   accessLevel = ctx.accessLevel || 'free';
      // If explicitly qualified as Class::method defined outside class, mark as unknown
      if (nameParts.length > 1 && !lineContext[idx]?.className) accessLevel = 'public';

      // Branch count: scan the body opening region
      const bodyLines = rawLines.slice(originalLineNum, originalLineNum + 40).join('\n');
      const branchCount = (bodyLines.match(/\bif\s*\(|\bswitch\s*\(|\bcase\s+|\?(?!:)|\belse\b/g) || []).length;

      // Priority heuristic
      let priority = 0;
      if (accessLevel === 'public' || accessLevel === 'free') priority += 30;
      if (hasDoxygen)     priority += 40;
      if (branchCount > 2) priority += Math.min(30, branchCount * 5);
      if (isCtor)          priority += 10; // constructors always worth testing
      priority = Math.min(100, priority);

      results.push({
        function_name:         funcBase,
        signature:             sigKey,
        doxygen_found:         hasDoxygen,
        doxygen_summary:       doxygenSummary,
        access_level:          accessLevel,
        class_name:            className,
        branch_count_estimate: branchCount,
        priority,
        _source: 'regex-fallback',
      });
    }

    return results;
  }

  /** Extract @brief from a single line of a Doxygen comment */
  _extractBrief(line) {
    const m = line.match(/@brief\s+(.+)/);
    return m ? m[1].trim() : '';
  }
}

