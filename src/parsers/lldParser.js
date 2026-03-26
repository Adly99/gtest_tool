import fs from 'fs';

/**
 * Parses LLD (Low Level Design) markdown to detect architectural invariants.
 */
export class LLDParser {
  constructor(lldPath) {
    this.lldPath = lldPath;
  }

  parse() {
    if (!fs.existsSync(this.lldPath)) return [];
    
    const content = fs.readFileSync(this.lldPath, 'utf-8');
    const specifications = [];

    // Detect structural components like Error Handling blocks or State Machines
    const sections = content.split(/^#+\s+/m);
    for (const section of sections) {
        if (section.toLowerCase().includes('error handling') || section.toLowerCase().includes('fallback')) {
           specifications.push({
               context: 'Robustness',
               content: section.trim()
           });
        }
        if (section.toLowerCase().includes('state transition')) {
           specifications.push({
               context: 'State Machine',
               content: section.trim()
           });
        }
    }

    return specifications;
  }
}
