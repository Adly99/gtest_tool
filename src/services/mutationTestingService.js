import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

/**
 * Triggers Cull / Mull mutation testing sequentially against 
 * newly generated Unit Tests to guarantee assertion quality.
 */
import { aiService } from './aiService.js';

/**
 * MutationTestingService — v5.0 "Killer Scenarios"
 * Uses Gemini to simulate code mutations and generates test cases (scenarios)
 * that are specifically designed to catch subtle logic errors.
 */
export class MutationTestingService {
    constructor() {
        this.aiService = aiService;
    }

    /**
     * Generates a "Killer Scenario" for a given function signature and its implementation.
     * This scenario is one that would catch a "Mutant" (a slight change in code).
     */
    async generateKillerScenario(functionSignature, sourceCode) {
        console.log(`[Killer Scenarios] Analyzing mutation surface for: ${functionSignature}...`);
        
        const prompt = `
            ACT AS A SENIOR C++ SECURITY & QUALITY AUDITOR.
            
            FUNCTION SIGNATURE: ${functionSignature}
            SOURCE CODE:
            \`\`\`cpp
            ${sourceCode}
            \`\`\`
            
            TASK:
            1. Identify a "Mutant": A subtle change to the code (e.g. changing < to <=, swapping + for -, omitting an edge case check) that would likely survive simple, naive unit tests.
            2. Design a "Killer Scenario": A specific input/state combination that would DEFINITIVELY FAIL if this mutant existed, but PASS on the original code.
            
            RETURN JSON:
            {
                "mutant_description": "string describing the subtle logic change",
                "impact_analysis": "why it's dangerous",
                "killer_scenario": {
                    "input": "description of inputs",
                    "precondition": "required state",
                    "expected_behavior": "what should happen",
                    "assertion_hint": "the specific GTest macro and check to use"
                }
            }
        `;

        try {
            const result = await this.aiService.queryJSON(prompt);
            return result;
        } catch (err) {
            console.error(`[MutationService] Error: ${err.message}`);
            return null;
        }
    }

    /**
     * Integrates the killer scenario into the generation context.
     */
    async enrichContextWithKillerScenarios(inventoryItem, sourceCode) {
        const scenario = await this.generateKillerScenario(inventoryItem.signature, sourceCode);
        if (scenario) {
            inventoryItem.killer_scenario = scenario;
            console.log(`[MutationService] ✅ Injected Killer Scenario: ${scenario.mutant_description}`);
        }
        return inventoryItem;
    }
}
