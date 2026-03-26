import fs from 'fs';

/**
 * Parses raw requirement text to isolate constraint clauses.
 */
export class RequirementsParser {
  constructor(reqFilePath) {
    this.reqFilePath = reqFilePath;
  }

  parse() {
    if (!fs.existsSync(this.reqFilePath)) {
      return [];
    }

    const content = fs.readFileSync(this.reqFilePath, 'utf-8');
    const requirements = [];

    // Simple heuristic: Line-by-line breakdown capturing SHALL/MUST/SHOULD
    const lines = content.split('\n');
    let currentReq = null;
    
    for (const line of lines) {
      const isConstraint = /(SHALL|MUST|SHOULD|WILL)/.test(line);
      
      if (isConstraint) {
         currentReq = {
             text: line.trim(),
             type: 'behavioral',
             id: this.extractReqId(line) || `REQ-${requirements.length + 1}`
         };
         requirements.push(currentReq);
      }
    }
    return requirements;
  }

  extractReqId(line) {
    // Attempt to find a structured ID like [REQ-123]
    const match = line.match(/\[([A-Z]+-\d+)\]/);
    return match ? match[1] : null;
  }
}
