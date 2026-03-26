import { execSync } from 'child_process';
import { AIProvider } from './aiProvider.js';

/**
 * Gemini CLI Provider.
 * Bridges to a local CLI tool (e.g., 'gemini', 'gcloud ai gemini', etc.)
 */
export class GeminiCLIProvider extends AIProvider {
  constructor(options = {}) {
    super({ ...options, name: 'GeminiCLI' });
    this.command = options.command || process.env.GEMINI_CLI_CMD || 'gemini';
  }

  async queryJSON(promptText) {
    const raw = await this.queryText(promptText);
    return this._parseJSON(raw);
  }

  async queryText(promptText) {
    try {
      // Escape the prompt for shell execution
      const escapedPrompt = promptText.replace(/"/g, '\\"');
      console.log(`[GeminiCLI] Executing: ${this.command} "${escapedPrompt.substring(0, 30)}..."`);
      
      const output = execSync(`${this.command} "${escapedPrompt}"`, { encoding: 'utf8' });
      return output;
    } catch (e) {
      console.error(`[GeminiCLI] Execution failed: ${e.message}`);
      return `[ERROR] Gemini CLI failed: ${e.message}`;
    }
  }
}
