import { logger } from '../logger.js';
import { AIProvider } from './aiProvider.js';

/**
 * OpenAI Provider.
 * Implements the AIProvider interface for OpenAI's Chat Completion API.
 */
export class OpenAIProvider extends AIProvider {
  constructor(apiKey, options = {}) {
    super({ ...options, name: 'OpenAI' });
    this.apiKey = apiKey;
    this.modelName = options.model || 'gpt-4o'; // Or gpt-3.5-turbo
    this.apiUrl = options.apiUrl || 'https://api.openai.com/v1/chat/completions';

    if (!this.apiKey) {
      logger.warn('API KEY not set — running in mock mode.', 'OpenAIProvider');
    }
  }

  async queryJSON(promptText) {
    if (!this.apiKey) return this._mockJSON(promptText);

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const raw = await this._callAPI(promptText);
        const result = this._parseJSON(raw);
        if (result) return result;
      } catch (e) {
        if (attempt < this.maxRetries) {
          const delay = Math.pow(2, attempt) * 5000;
          console.warn(`[OpenAIProvider] Request failed — retrying in ${delay / 1000}s (attempt ${attempt}/${this.maxRetries})… (${e.message})`);
          await this._sleep(delay);
        } else {
          console.error(`[OpenAIProvider] API Error: ${e.message}`);
          return null;
        }
      }
    }
    return null;
  }

  async queryText(promptText) {
    if (!this.apiKey) return `[MOCK] OpenAI response for: ${promptText.substring(0, 50)}...`;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this._callAPI(promptText);
      } catch (e) {
        if (attempt < this.maxRetries) {
          const delay = Math.pow(2, attempt) * 5000;
          await this._sleep(delay);
        } else {
          console.error(`[OpenAIProvider] API Error: ${e.message}`);
          return null;
        }
      }
    }
    return null;
  }

  async _callAPI(promptText) {
    logger.log(`📤 Sending Request to OpenAI (${this.modelName})`, 'OpenAIProvider');
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelName,
        messages: [
          { role: 'system', content: this.systemPrompt },
          { role: 'user', content: promptText },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const msg = errData.error?.message || response.statusText;
      logger.error(`API Error (${response.status}): ${msg}`, null, 'OpenAIProvider');
      throw new Error(`OpenAI API status ${response.status}: ${msg}`);
    }

    const data = await response.json();
    const output = data.choices?.[0]?.message?.content || '';
    logger.log(`📥 Received response (${output.length} characters)`, 'OpenAIProvider');
    return output;
  }

  _mockJSON(promptText) {
    return { mock: true, provider: 'OpenAI', note: 'Running in mock mode.' };
  }
}
