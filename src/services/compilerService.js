import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

/**
 * Hooks into the native build system (Ninja/Make) to execute tests
 * and pipe compiler/runtime STDErr outputs back into Gemini to fix broken Generation outputs.
 */
export class CompilerService {
  constructor(geminiService) {
      this.geminiService = geminiService;
  }

  /**
   * The "Auto-Heal" loop.
   */
  async executeAndHeal(testTargetName, buildCommand, generatedCodePayload, maxRetries = 3) {
      let attempts = 0;
      let currentCode = generatedCodePayload.code;
      
      while (attempts < maxRetries) {
          console.log(`[BUILD] Compiling target ${testTargetName} (Attempt ${attempts + 1})`);
          try {
              // Execute local build via CLI
              const { stdout } = await execAsync(buildCommand);
              console.log(`[BUILD SUCCESS] ${testTargetName} compiled flawlessly.`);
              return currentCode; // Done! Code is flawless.
          } catch (error) {
              // Compilation failed. Extract Stderr to heal.
              console.warn(`[BUILD ERROR] Compiler raised an error on line ${error.stdout || error.stderr}`);
              
              const healPrompt = `
                 The following generated C++ test case failed to compile:
                 ${currentCode}
                 
                 Compiler Output:
                 ${error.stderr || error.stdout}
                 
                 Fix the syntax, include, or macro errors to make it standard compliant.
                 Return ONLY JSON with the fixed code String under 'fixed_code'.
              `;
              
              console.log(`[HEAL] Pushing compiler stderr back to Gemini for resolution...`);
              const reaction = await this.geminiService.queryJSON(healPrompt);
              
              if (reaction && reaction.fixed_code) {
                  currentCode = reaction.fixed_code; // Apply patch
                  // Mock update file mechanism here
              } else {
                  console.error(`[HEAL FAILED] Gemini could not resolve compiler loop.`);
                  break;
              }
          }
          attempts++;
      }
      return null; // Failed after max retries
  }
}
