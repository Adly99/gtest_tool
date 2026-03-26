import { logger } from '../logger.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIProvider } from './aiProvider.js';

/**
 * Google Gemini Provider.
 * Implements the AIProvider interface for @google/genai.
 */
export class GeminiProvider extends AIProvider {
  constructor(apiKey, options = {}) {
    super({ ...options, name: 'Gemini' });
    this.apiKey = apiKey;
    this.modelName = options.model || 'gemini-1.5-flash';

    if (this.apiKey) {
      // v7.4: Force v1 in constructor
      this.ai = new GoogleGenerativeAI(this.apiKey, { apiVersion: 'v1' });
    } else {
      logger.warn('Gemini API KEY not set — running in mock mode.', 'GeminiProvider');
    }
  }

  async queryJSON(promptText) {
    if (!this.ai) return this._mockJSON(promptText);

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const raw = await this._callAPI(promptText);
        const result = this._parseJSON(raw);
        if (result) return result;
      } catch (e) {
        const is429 = e.status === 429 || e.message?.includes('429') || e.message?.includes('RESOURCE_EXHAUSTED');
        if (is429 && attempt < this.maxRetries) {
          const delay = Math.pow(2, attempt) * 5000;
          await this._sleep(delay);
        } else {
          // GTest Architect v7.3: NEVER return null, always throw the real error
          throw e;
        }
      }
    }
    throw new Error('AI Query failed after retries');
  }

  async queryText(promptText) {
    if (!this.ai) return `[MOCK] Gemini response for: ${promptText.substring(0, 50)}...`;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this._callAPI(promptText);
      } catch (e) {
        const is429 = e.status === 429 || e.message?.includes('429') || e.message?.includes('RESOURCE_EXHAUSTED');
        if (is429 && attempt < this.maxRetries) {
          const delay = Math.pow(2, attempt) * 5000;
          await this._sleep(delay);
        } else {
          logger.error(`API Error: ${e.message}`, null, 'GeminiProvider');
          return null;
        }
      }
    }
    return null;
  }

  async _callAPI(promptText, overrideModel = null, visitedModels = new Set(), apiVersion = 'v1') {
    const modelToUse = overrideModel || this.modelName;
    
    // v7.7.2: Definitive Loop Prevention (Cycle Detection)
    const cycleKey = `${apiVersion}:${modelToUse}`;
    if (visitedModels.has(cycleKey)) {
        logger.error(`Critical: AI Engine Fallback Cycle Detected for ${cycleKey}. Terminating.`, null, 'GeminiProvider');
        throw new Error(`AI Engine Connectivity Failure: No stable model found (404 Loop for ${cycleKey})`);
    }
    visitedModels.add(cycleKey);

    const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${modelToUse}:generateContent?key=${this.apiKey}`;
    
    logger.log(`📤 Direct REST Routing (${apiVersion}): ${modelToUse}`, 'GeminiProvider');

    const payload = {
        contents: [{
            parts: [
                { text: this.systemPrompt },
                { text: promptText }
            ]
        }],
        generationConfig: {
            temperature: 0.1,
            topP: 0.95,
            topK: 64,
            maxOutputTokens: 4096
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        // v7.8.4: Definitive Protocol Fallback (v1 -> v1beta)
        if (response.status === 404) {
            if (apiVersion === 'v1') {
                logger.log(`Model ${modelToUse} not found on v1. Trying v1beta Protocol...`, 'GeminiProvider');
                return this._callAPI(promptText, modelToUse, visitedModels, 'v1beta');
            }
            const isLatest = modelToUse.endsWith('-latest');
            if (!isLatest) {
                logger.log(`Model ${modelToUse} not found on v1beta. retrying with -latest variant...`, 'GeminiProvider');
                return this._callAPI(promptText, `${modelToUse}-latest`, visitedModels, 'v1beta');
            }
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Gemini API status ${response.status}: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const output = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        logger.log(`📥 Received response (${output.length} characters)`, 'GeminiProvider');
        return output;
    } catch (err) {
        // v7.8.1: Catch-Level Fallback (Same model family ONLY)
        const isAlreadyLatest = modelToUse.endsWith('-latest');
        
        if (err.message?.includes('404') && !isAlreadyLatest) {
            logger.warn(`Model ${modelToUse} not found (Catch). Retrying with -latest variant...`, 'GeminiProvider');
            return this._callAPI(promptText, modelToUse + '-latest', visitedModels);
        }
        logger.log(`Failed to call Gemini API: ${err.message}`, 'GeminiProvider');
        throw err;
    }
  }

  _mockJSON(promptText) {
    const p = promptText.toLowerCase();
    if (p.includes('function') || p.includes('inventory')) {
      return [
        { function_name: 'MockFunction', signature: 'void MockFunction()', doxygen_found: false, access_level: 'free', class_name: null, branch_count_estimate: 0, priority: 20, doxygen_summary: '' }
      ];
    }
    return { mock: true, response: 'Gemini Mock' };
  }
}
