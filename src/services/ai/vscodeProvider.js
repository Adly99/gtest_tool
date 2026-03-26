import { AIProvider } from './aiProvider.js';

/**
 * VS Code Bridge Provider.
 * Since an external script cannot directly call the internal VS Code AI API,
 * this provider serves as a "Manual Handoff" or "Snippet" provider.
 * In a real VS Code extension, this would be replaced by the extension API calls.
 */
export class VSCodeProvider extends AIProvider {
  constructor(options = {}) {
    super({ ...options, name: 'VSCodeAssist' });
  }

  async queryJSON(promptText) {
    console.warn('[VSCodeAssist] Manual Handoff Mode: Please use Gemini Code Assist in VS Code for this prompt.');
    // For the sake of the automated tool, we return a structural placeholder
    // In a real implementation, this might write to a specific file that the extension watches.
    return this._mockJSON(promptText);
  }

  async queryText(promptText) {
    return '[VSCode Assist Mode] Please copy the prompt to your VS Code "Gemini Code Assist" panel and paste the result back.';
  }

  _mockJSON(promptText) {
     // Return a "waiting" state or a mock that informs the user
     return { 
        status: 'WAITING_FOR_VSCODE', 
        message: 'GTest Architect is configured to use VS Code Assist. Please use the integrated extension.',
        prompt_snippet: promptText.substring(0, 100) + '...'
     };
  }
}
