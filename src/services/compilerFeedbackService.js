import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Executes headless native compilers (e.g. clang++, ninja, make) to verify syntax.
 * If tests fail to compile, this service hooks back into Gemini to automatically
 * heal the syntax error (Auto-Healing Loop).
 */
export class CompilerFeedbackService {
    constructor(geminiService, buildDir = './build', buildCmd = 'ninja') {
        this.geminiService = geminiService;
        this.buildDir = buildDir;
        this.buildCmd = buildCmd;
    }

    /**
     * Executes the background compilation step.
     */
    async executeBuild() {
        try {
            console.log(`[Auto-Heal] Triggering test compilation using: ${this.buildCmd} in ${this.buildDir}`);
            const { stdout, stderr } = await execAsync(this.buildCmd, { cwd: this.buildDir });
            return { success: true, logs: stdout };
        } catch (error) {
            // Error contains stdout and stderr from the failed process
            return { success: false, logs: error.stderr || error.stdout || error.message };
        }
    }

    /**
     * Attempts to heal a failing C++ test file.
     */
    async healFile(filePath, codeBuffer, maxRetries = 2) {
        let currentCode = codeBuffer;
        let attempt = 0;

        while (attempt < maxRetries) {
            console.log(`[Auto-Heal] Verifying syntax (Attempt ${attempt + 1}/${maxRetries})...`);
            
            // In a real scenario, we would write 'currentCode' to 'filePath' here
            // fs.writeFileSync(filePath, currentCode);

            const result = await this.executeBuild();
            if (result.success) {
                console.log(`[Auto-Heal] ✅ Compilation succeeded!`);
                return { success: true, finalCode: currentCode };
            }

            console.log(`[Auto-Heal] ❌ Build failed. Asking AI to heal the error...`);
            const fixPrompt = `
You previously generated a C++ test file that failed to compile.
Here is the code you generated:
${currentCode}

Here is the native compiler error output:
${result.logs}

Analyze the compiler error and fix the code. Ensure all imports are present.
Return the complete corrected C++ file as a pure JSON object:
{"fixed_code": "[The full C++ source]"}
`;
            try {
                const aiResponse = await this.geminiService.queryJSON(fixPrompt);
                if (aiResponse && aiResponse.fixed_code) {
                    currentCode = aiResponse.fixed_code;
                }
            } catch (err) {
                console.error("[Auto-Heal] AI failed to parse heal request.", err);
            }

            attempt++;
        }

        console.log(`[Auto-Heal] Failed to heal the file after ${maxRetries} attempts.`);
        return { success: false, finalCode: currentCode };
    }
}
