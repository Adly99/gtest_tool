/**
 * Level-1 Whole-File Semantic Analyzer.
 * Correlates context elements (includes, macros, typedefs, globals) to understand
 * how functions interrelate. Optionally injects compile_commands.json build context.
 */
export class WholeFileAnalyzer {
  constructor(aiService) {
    this.aiService = aiService;
  }

  /**
   * Analyzes file context before allowing isolated function generation.
   *
   * @param {string} filePath         - absolute path to the source file
   * @param {string} rawContent       - full file text (used directly in prompt)
   * @param {Array}  inventory        - from FunctionInventoryExtractor
   * @param {Object} compileContext   - optional: { defines: ['-DFOO=1'], includes: ['-I/path'] }
   * @returns {Object} { file_context, function_roles, local_call_graph, mocking_strategies }
   */
  async analyzeFileContext(filePath, rawContent, inventory, compileContext = {}) {
    const defines = (compileContext.defines || []).join(' ');
    const includes = (compileContext.includes || []).join(' ');
    const contentSnippet = rawContent ? rawContent.substring(0, 6000) : '(content unavailable)';

    const prompt = `
      You are a senior C++ architect performing a whole-file semantic analysis.

      File: ${filePath}
      ${defines ? `Build Macros (-D flags): ${defines}` : ''}
      ${includes ? `Include Paths (-I flags): ${includes}` : ''}

      Source Code (first 6000 chars):
      \`\`\`cpp
      ${contentSnippet}
      \`\`\`

      Functions discovered: ${JSON.stringify(inventory.map(i => i.signature))}

      Analyze the relationships:
      1. Identify which functions are trivial passthrough wrappers vs core stateful logic.
      2. Map the local call graph (who calls whom within this file).
      3. Identify module-level static state, constants, or macros that affect function behavior.
         Consider the -D macros above when reasoning about conditional compilation branches.
      4. For each function, identify what external dependencies (interfaces, services, classes)
         need to be mocked to test it in isolation — including whether they are injected via
         constructor/args or internally instantiated (non-injectable = harder to mock).

      Return JSON exactly:
      {
        "file_context": {
          "macros": ["MACRO_NAME"],
          "globals": ["global_var_name"],
          "conditional_blocks": ["FOO_ENABLED branch active", "..."]
        },
        "function_roles": {
          "<signature>": "<role description and whether it should be tested directly>"
        },
        "local_call_graph": {
          "<signature>": ["called_signature_1", "called_signature_2"]
        },
        "mocking_strategies": {
          "<signature>": [
            {
              "dependency_type": "InterfaceOrClassName",
              "reason": "Why this needs to be mocked",
              "is_injected": true,
              "mock_style": "EXPECT_CALL / constructor injection / link-seam"
            }
          ]
        }
      }
    `;

    const DEFAULT_CONTEXT = {
      file_context: { macros: [], globals: [], conditional_blocks: [] },
      function_roles: {},
      local_call_graph: {},
      mocking_strategies: {},
    };

    const timeout = new Promise(resolve => setTimeout(() => resolve(null), 6000));
    let analysis = null;
    try {
      analysis = await Promise.race([
        this.aiService.queryJSON(prompt),
        timeout,
      ]);
    } catch (_) {
      // fall through to default
    }

    return analysis || DEFAULT_CONTEXT;
  }
}
