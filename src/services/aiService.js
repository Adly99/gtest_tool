import { logger } from './logger.js';
import { GeminiProvider } from './ai/geminiProvider.js';
import { OpenAIProvider } from './ai/openAIProvider.js';
import { GeminiCLIProvider } from './ai/geminiCLIProvider.js';
import { VSCodeProvider } from './ai/vscodeProvider.js';

/**
 * AIService (Factory).
 * Manages AI provider instantiation and provides a unified interface.
 * Replaces the old GeminiService.
 */
export class AIService {
  constructor() {
    this.providerType = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
    
    // Support Global OS Variable fallbacks
    this.geminiKey = process.env.GEMINI_API_KEY;
    this.openaiKey = process.env.OPENAI_API_KEY || process.env.GPT_API_KEY;

    this.provider = this._createProvider();
    
    // v7.2 API Key Verification
    if (this.providerType === 'gemini' && !process.env.GEMINI_API_KEY) {
        console.error('❌ [AIService] CRITICAL: GEMINI_API_KEY is not set in .env');
    }
  }

  /**
   * Internal factory to create the requested provider.
   */
  _createProvider() {
    if (this.providerType === 'openai') {
      return new OpenAIProvider(this.openaiKey, {
        model: process.env.OPENAI_MODEL || 'gpt-4o'
      });
    }

    // Default to Gemini 2.0 Flash (Exp) - v7.8.4 Production Standard
    return new GeminiProvider(this.geminiKey, {
      model: process.env.GEMINI_MODEL || 'gemini-3-flash-preview'
    });
  }

  /**
   * Switches the active provider at runtime.
   * Useful for the CLI's --provider flag and UI select.
   */
  setProvider(type, options = {}) {
    const t = type.toLowerCase();
    logger.log(`Requesting Provider Switch: ${t}`, 'AIService');
    
    // Support specific model identifiers from the UI
    if (t.startsWith('gemini')) {
        const model = t === 'gemini' ? (process.env.GEMINI_MODEL || 'gemini-1.5-flash') : t;
        logger.log(`Instantiating GeminiProvider (Model: ${model})`, 'AIService');
        this.provider = new GeminiProvider(options.apiKey || this.geminiKey, { ...options, model });
        this.providerType = 'gemini';
    } else if (t.startsWith('gpt') || t === 'openai') {
        const model = t === 'openai' ? (process.env.OPENAI_MODEL || 'gpt-4o') : t;
        logger.log(`Instantiating OpenAIProvider (Model: ${model})`, 'AIService');
        this.provider = new OpenAIProvider(options.apiKey || this.openaiKey, { ...options, model });
        this.providerType = 'openai';
    } else if (t === 'geminicli') {
        logger.log(`Instantiating GeminiCLIProvider`, 'AIService');
        this.provider = new GeminiCLIProvider(options);
        this.providerType = 'geminicli';
    } else if (t === 'vscode') {
        logger.log(`Instantiating VSCodeProvider`, 'AIService');
        this.provider = new VSCodeProvider(options);
        this.providerType = 'vscode';
    }
  }

  /**
   * Proxy to the active provider's queryJSON.
   */
  async queryJSON(promptText) {
    return this.provider.queryJSON(promptText);
  }

  /**
   * Proxy to the active provider's queryText.
   */
  async queryText(promptText) {
    return this.provider.queryText(promptText);
  }
}

// Export a singleton instance
export const aiService = new AIService();
