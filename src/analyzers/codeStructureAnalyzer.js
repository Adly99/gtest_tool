import fs from 'fs';

/**
 * Parses C++ source files to deduce internal state loops, branches, and API contracts.
 * Detects free functions, member functions, constructors/destructors, templates,
 * if/else branches, switch cases, and ternary operators.
 */
export class CodeStructureAnalyzer {
  constructor(srcPath) {
    this.srcPath = srcPath;
  }

  /**
   * Analyzes the source file and returns a rich structural summary.
   * @returns {{ functions, branches, switches, ternaries, totalBranchCount }}
   */
  analyze() {
    if (!fs.existsSync(this.srcPath)) {
      return { functions: [], branches: [], switches: [], ternaries: [], totalBranchCount: 0 };
    }

    const content = fs.readFileSync(this.srcPath, 'utf-8');

    const branches  = this.extractConditionBranches(content);
    const switches  = this.extractSwitchBranches(content);
    const ternaries = this.extractTernaries(content);

    return {
      functions: this.extractFunctions(content),
      branches,
      switches,
      ternaries,
      totalBranchCount: branches.length + switches.length + ternaries.length,
    };
  }

  /**
   * Extracts function definitions: member functions, free functions, constructors/destructors, templates.
   */
  extractFunctions(content) {
    const methods = [];

    // Member functions: ReturnType ClassName::methodName(...)
    const memberRegex = /(\w[\w:<>*& ]+?)\s+(\w+)::(\w+)\s*\(([^)]*)\)\s*(?:const\s*)?\{/g;
    let match;
    while ((match = memberRegex.exec(content)) !== null) {
      methods.push({
        kind: 'member',
        returnType: match[1].trim(),
        className: match[2],
        name: match[3],
        args: match[4].trim(),
        signature: `${match[1].trim()} ${match[2]}::${match[3]}(${match[4].trim()})`,
      });
    }

    // Constructors/Destructors: ClassName::ClassName(...) or ClassName::~ClassName(...)
    const ctorRegex = /(\w+)::(~?\1)\s*\(([^)]*)\)\s*(?::\s*[^{]+)?\{/g;
    while ((match = ctorRegex.exec(content)) !== null) {
      methods.push({
        kind: match[2].startsWith('~') ? 'destructor' : 'constructor',
        returnType: '',
        className: match[1],
        name: match[2],
        args: match[3].trim(),
        signature: `${match[1]}::${match[2]}(${match[3].trim()})`,
      });
    }

    // Free functions: ReturnType functionName(...) { (not inside a class scope heuristic)
    const freeRegex = /^(\w[\w:<>*& ]+?)\s+(\w+)\s*\(([^)]*)\)\s*(?:noexcept\s*)?\{/gm;
    while ((match = freeRegex.exec(content)) !== null) {
      // Skip if already captured as member (look for '::' absence in match[2])
      if (!match[2].includes(':') && match[1] !== 'if' && match[1] !== 'while' && match[1] !== 'for') {
        methods.push({
          kind: 'free',
          returnType: match[1].trim(),
          className: null,
          name: match[2],
          args: match[3].trim(),
          signature: `${match[1].trim()} ${match[2]}(${match[3].trim()})`,
        });
      }
    }

    // Template functions: template<...> ReturnType name(...)
    const templateRegex = /template\s*<[^>]+>\s*(\w[\w:<>*& ]+?)\s+(\w+)\s*\(([^)]*)\)\s*\{/g;
    while ((match = templateRegex.exec(content)) !== null) {
      methods.push({
        kind: 'template',
        returnType: match[1].trim(),
        className: null,
        name: match[2],
        args: match[3].trim(),
        signature: `template ${match[1].trim()} ${match[2]}(${match[3].trim()})`,
      });
    }

    return methods;
  }

  /** Extracts if/else if conditions. */
  extractConditionBranches(content) {
    const branches = [];
    const ifRegex = /\bif\s*\(([^)]+)\)/g;
    let match;
    while ((match = ifRegex.exec(content)) !== null) {
      branches.push({ type: 'if', condition: match[1].trim() });
    }
    return branches;
  }

  /** Extracts switch/case labels. */
  extractSwitchBranches(content) {
    const switches = [];
    const switchRegex = /\bswitch\s*\(([^)]+)\)/g;
    const caseRegex   = /\bcase\s+([^:]+):/g;
    let match;

    while ((match = switchRegex.exec(content)) !== null) {
      switches.push({ type: 'switch', discriminant: match[1].trim() });
    }
    while ((match = caseRegex.exec(content)) !== null) {
      switches.push({ type: 'case', value: match[1].trim() });
    }
    return switches;
  }

  /** Extracts ternary operator expressions. */
  extractTernaries(content) {
    const ternaries = [];
    // Look for patterns like: <condition> ? <expr> : <expr>
    const ternaryRegex = /([^?!<>=\s][^?]*)\?([^:]+):([^;,\n]+)/g;
    let match;
    while ((match = ternaryRegex.exec(content)) !== null) {
      const cond = match[1].trim();
      // Filter out very short/false positives
      if (cond.length > 3 && !cond.startsWith('//')) {
        ternaries.push({ type: 'ternary', condition: cond.slice(-50) });
      }
    }
    return ternaries;
  }
}
