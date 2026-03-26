/**
 * Specialized Generator to construct Google LibFuzzer targets.
 */
export class LibFuzzerGenerator {
  constructor(geminiService, promptBuilder) {
    this.geminiService = geminiService;
    this.promptBuilder = promptBuilder;
  }

  /**
   * Generates a fuzzing harness for a specifically vulnerable/buffer-based function.
   * @param {Object} inventoryItem - function to fuzz
   * @returns {Object} { framework_code, thought_process }
   */
  async generateFuzzer(inventoryItem) {
    console.log(`[Fuzzer] Constructing LLVMFuzzerTestOneInput harness for: ${inventoryItem.signature}`);
    const prompt = this.promptBuilder.buildFuzzerPrompt(inventoryItem);
    
    // Fuzzers often take longer to reason about
    const TIMEOUT = 15000;
    const timeoutP = new Promise(resolve => setTimeout(() => resolve(null), TIMEOUT));
    
    let response = null;
    try {
      response = await Promise.race([this.geminiService.queryJSON(prompt), timeoutP]);
    } catch (_) {}
    
    if (response?.complete_cpp_file) {
      return {
        framework_code: response.complete_cpp_file,
        thought_process: response.thought_process
      };
    }

    // Fallback if it returns the old shape or raw text
    if (response?.harness_code) {
       let code = (response.imports || []).map(i => `#include ${i}`).join('\n') + '\n\n';
       code += response.harness_code;
       return { framework_code: code, thought_process: response.thought_process };
    }
    
    return { framework_code: '// Fuzzer generation failed or timed out.', scenarios_generated: 0 };
  }
}
