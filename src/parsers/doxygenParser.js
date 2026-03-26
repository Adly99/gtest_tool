import fs from 'fs';

/**
 * Extracts behavioral conditions from Doxygen strings.
 */
export class DoxygenParser {
  constructor() {}

  /**
   * Parse a block of Doxygen to identify preconditions, postconditions, and returns.
   */
  parseContent(content) {
    const rules = {
      description: "",
      params: [],
      returns: "",
      preconditions: [],
      postconditions: [],
      warnings: []
    };

    // Very naive heuristic Doxygen comment extractor
    const docsBlockRegex = /\/\*\*([\s\S]*?)\*\//g;
    let match;
    while ((match = docsBlockRegex.exec(content)) !== null) {
      const block = match[1];
      
      this.extractTags(block, rules);
    }

    return rules;
  }

  extractTags(block, rules) {
      const lines = block.split('\n');
      for (let line of lines) {
          line = line.replace(/^\s*\*\s?/, '').trim();
          if (line.startsWith('@brief') || line.startsWith('\\brief')) {
              rules.description += line.replace(/[@\\]brief/, '').trim() + ' ';
          } else if (line.startsWith('@param') || line.startsWith('\\param')) {
              rules.params.push(line.replace(/[@\\]param(.*?)\s/, '').trim());
          } else if (line.startsWith('@return') || line.startsWith('\\return')) {
              rules.returns = line.replace(/[@\\]return/, '').trim();
          } else if (line.startsWith('@pre') || line.startsWith('\\pre')) {
              rules.preconditions.push(line.replace(/[@\\]pre/, '').trim());
          } else if (line.startsWith('@post') || line.startsWith('\\post')) {
              rules.postconditions.push(line.replace(/[@\\]post/, '').trim());
          } else if (line.startsWith('@warning') || line.startsWith('\\warning')) {
              rules.warnings.push(line.replace(/[@\\]warning/, '').trim());
          }
      }
  }
}
