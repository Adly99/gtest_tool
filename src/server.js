import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { logger } from './services/logger.js';
import { AIService } from './services/aiService.js';
import { MockGenerator } from './generators/mockGenerator.js';
import { FunctionInventoryExtractor } from './parsers/functionInventoryExtractor.js';
import { WholeFileAnalyzer } from './analyzers/wholeFileAnalyzer.js';
import { CppUnitTestGenerator } from './generators/cppUnitTestGenerator.js';
import { PromptBuilder } from './services/promptBuilder.js';
import { GTestAdapter } from './generators/adapters/gtestAdapter.js';
import { CompileCommandsParser } from './parsers/compileCommandsParser.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const aiService = new AIService();
const mockGenerator = new MockGenerator();

const app = express();
const debugLogPath = path.join(__dirname, '..', 'debug.log');

// Persistent Debug Log System (v7.7)
app.use((req, res, next) => {
    logger.log(`${req.method} ${req.url}`, 'REQUEST');
    next();
});
app.use(express.json());

// Diagnostic Endpoint (v7.4.1)
app.get('/api/diag', (req, res) => {
    // Check for both .env and Global OS variables
    const geminiKey = process.env.GEMINI_API_KEY;
    const gptKey = process.env.OPENAI_API_KEY || process.env.GPT_API_KEY;
    
    res.json({ 
        version: '8.1.0', 
        status: 'ready', 
        hasGemini: !!geminiKey,
        hasOpenAI: !!gptKey,
        activeModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash'
    });
});

// v8.0.2: Model Discovery (List available models to resolve 404s)
app.get('/api/diag/models', async (req, res) => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(401).json({ error: 'GEMINI_API_KEY missing' });
    try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${key}`);
        const data = await response.json();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/debug
 * Returns the tail of the debug log.
 */
app.get('/api/debug', (req, res) => {
    res.json({ log: logger.getTail(100) });
});

/**
 * POST /api/debug/clear
 * Resets the debug log.
 */
app.post('/api/debug/clear', (req, res) => {
    const success = logger.clear();
    res.json({ success });
});

// Serve static files from the public directory
const publicDir = path.join(path.dirname(__dirname), 'public');
app.use(express.static(publicDir));

// --- API Endpoints ---

/**
 * GET /api/files?root=...
 * Scans the project root for C++ files.
 */
app.get('/api/files', (req, res) => {
    const root = req.query.root || '.';
    const absoluteRoot = path.resolve(root);
    logger.log(`Scanning: ${absoluteRoot}`, 'API/Files');

    if (!fs.existsSync(absoluteRoot)) {
        return res.status(404).json({ error: 'Project root not found' });
    }

    const getAllFiles = (dirPath, arrayOfFiles = []) => {
        try {
            const files = fs.readdirSync(dirPath);
            files.forEach((file) => {
                if (file === 'node_modules' || file === '.git' || file === '.gtest_tool' || file === '.gemini') return;
                
                const fullPath = path.join(dirPath, file);
                try {
                    const stats = fs.statSync(fullPath);
                    if (stats.isDirectory()) {
                        getAllFiles(fullPath, arrayOfFiles);
                    } else if (file.endsWith('.cpp') || file.endsWith('.cc') || file.endsWith('.h') || file.endsWith('.hpp')) {
                        arrayOfFiles.push({
                            path: fullPath,
                            basename: file
                        });
                    }
                } catch (e) {
                    // Skip inaccessible files
                }
            });
        } catch (err) {
            console.error(`Error reading directory ${dirPath}: ${err.message}`);
        }
        return arrayOfFiles;
    };

    try {
        const files = getAllFiles(absoluteRoot);
        console.log(`[/api/files] Found ${files.length} files.`);
        res.json({ files });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/analyze
 * Extracts function inventory from a file.
 */
app.post('/api/analyze', async (req, res) => {
    const { filePath, stubsPath, compileCmdsPath, provider } = req.body;

    if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    if (provider) aiService.setProvider(provider);

    try {
        const gemini = aiService;
        const extractor = new FunctionInventoryExtractor(gemini);
        const wholeFileAnalyzer = new WholeFileAnalyzer(gemini);

        // Resolve compile context
        let compileContext = { defines: [], includes: [] };
        if (compileCmdsPath && fs.existsSync(compileCmdsPath)) {
            const ccParser = new CompileCommandsParser(compileCmdsPath);
            const entry = ccParser.getEntryForFile(filePath);
            if (entry) {
                compileContext = ccParser.extractBuildContext(entry.command || entry.arguments?.join(' ') || '');
            }
        }

        const rawContent = fs.readFileSync(filePath, 'utf-8');
        const inventory = await extractor.extractInventory(filePath);
        
        // Semantic analysis for roles and mocking strategies
        const fileContext = await wholeFileAnalyzer.analyzeFileContext(
            filePath, rawContent, inventory, compileContext
        );

        res.json({
            inventory,
            context: fileContext,
            compileContext
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/generate
 * Generates GTest code for selected functions.
 */
app.post('/api/generate', async (req, res) => {
    const { 
        filePath, 
        selectedFunctions, 
        stubsPath, 
        compileCmdsPath, 
        provider,
        headers,
        stubs,
        helpers,
        examples,
        customInstructions
    } = req.body;

    if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    if (provider) aiService.setProvider(provider);

    try {
        const gemini = aiService;
        const builder = new PromptBuilder();
        const adapter = new GTestAdapter();
        const testGen = new CppUnitTestGenerator(gemini, builder, adapter);
        const extractor = new FunctionInventoryExtractor(gemini);

        const inventory = await extractor.extractInventory(filePath);
        const targets = inventory.filter(fn => selectedFunctions.includes(fn.signature));

        if (targets.length === 0) {
            return res.status(400).json({ error: 'No valid functions selected' });
        }

        // For now, we generate for the first selected function or a combined suite
        // v4.0 supports full-file generation
        const target = targets[0]; // Simplification for first version of reconstruct

        // Ingest context
        const contextContent = {
            headers: (headers || []).map(p => ({ path: p, content: fs.readFileSync(p, 'utf-8') })),
            stubs: (stubs || []).map(p => ({ path: p, content: fs.readFileSync(p, 'utf-8') })),
            helpers: (helpers || []).map(p => ({ path: p, content: fs.readFileSync(p, 'utf-8') })),
            examples: (examples || []).map(p => ({ path: p, content: fs.readFileSync(p, 'utf-8') }))
        };

        const scenario = {
            signature: target.signature,
            doxygen_found: target.doxygen_found,
            doxygen_summary: target.doxygen_summary || 'Target function',
            role: 'Component Function',
            mocking_hints: [],
            stubsPath: stubsPath || null,
            source_snippet: target.source_snippet || '',
            context: contextContent,
            customInstructions: customInstructions || ''
        };

        const result = await testGen.generateTestCode(scenario, 'GeneratedFixture', {
            mocks: [],
            compile_flags: [],
            file_path: filePath
        });

        res.json({
            message: 'Generation complete.',
            code: result.framework_code,
            scenarios_generated: result.scenarios_generated,
            functions_covered: targets.length,
            refactoring_plans: result.refactoring_plans || [],
            mutation_notes: result.mutation_notes || []
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/generate/mock
 * Transforms a header into a GMock header.
 */
app.post('/api/generate/mock', async (req, res) => {
    const { headerPath, provider } = req.body;
    if (!headerPath) return res.status(400).json({ error: 'headerPath is required' });

    try {
        logger.log(`Requested Provider: ${provider || 'default'}`, 'API/Generate/Mock');
        if (provider) aiService.setProvider(provider);
        const result = await mockGenerator.generateMock(headerPath);
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/browser/ls?path=...
 * File system browser for picking directories/files.
 */
app.get('/api/browser/ls', (req, res) => {
    let targetPath = req.query.path || '.';
    const absolutePath = path.resolve(targetPath);

    if (!fs.existsSync(absolutePath)) {
        return res.status(404).json({ error: 'Path not found' });
    }

    try {
        const stats = fs.statSync(absolutePath);
        if (!stats.isDirectory()) {
            return res.status(400).json({ error: 'Path is not a directory' });
        }

        const items = fs.readdirSync(absolutePath);
        const directories = [];
        const files = [];

        items.forEach(item => {
            if (item === 'node_modules' || item === '.git') return;
            const fullPath = path.join(absolutePath, item);
            try {
                if (fs.statSync(fullPath).isDirectory()) {
                    directories.push(item);
                } else {
                    files.push(item);
                }
            } catch (e) {
                // Ignore inaccessible files
            }
        });

        res.json({
            currentPath: absolutePath,
            directories: directories.sort(),
            files: files.sort()
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/browser/view?path=...
 * Reads the content of a file for preview.
 */
app.get('/api/browser/view', (req, res) => {
    let filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'Path is required' });
    
    // Normalize and resolve path
    filePath = path.normalize(filePath);
    logger.log(`Reading: ${filePath}`, 'API/Browser/View');

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found at: ' + filePath });
    }
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        res.json({ content });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/test/run
 * Builds and runs a GTest file. (v5.0 feature)
 */
app.post('/api/test/run', async (req, res) => {
    const { testFilePath, workingDir } = req.body;

    if (!testFilePath || !fs.existsSync(testFilePath)) {
        return res.status(404).json({ error: 'Test file not found' });
    }

    const cwd = workingDir || path.dirname(testFilePath);
    
    // GTest Architect v6.0: CMake-Native Build Flow
    const isCMake = fs.existsSync(path.join(cwd, 'CMakeLists.txt'));
    const binaryName = path.basename(testFilePath, path.extname(testFilePath)) + (process.platform === 'win32' ? '.exe' : '');

    try {
        if (isCMake) {
            res.write(JSON.stringify({ status: 'info', message: 'Detected CMake project. Running build...' }) + '\n');
            // Ensure build directory exists
            const buildDir = path.join(cwd, 'build');
            if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });
            
            await execAsync(`cmake -B build -S .`, { cwd });
            await execAsync(`cmake --build build`, { cwd });
            
            res.write(JSON.stringify({ status: 'info', message: 'CMake build successful. Executing...' }) + '\n');
            // Binary location in CMake can be complex, but for simple demos it's usually in build/ or build/Debug/
            const possibleBinPaths = [
                path.join(cwd, 'build', binaryName),
                path.join(cwd, 'build', 'Debug', binaryName),
                path.join(cwd, binaryName)
            ];
            let foundBin = possibleBinPaths.find(p => fs.existsSync(p));
            if (!foundBin) throw new Error("Could not find compiled binary in build artifacts.");
            
            const { stdout, stderr } = await execAsync(`"${foundBin}"`, { cwd });
            res.write(JSON.stringify({ status: 'success', output: stdout, errors: stderr }) + '\n');
        } else {
            // Legacy g++ fallback
            const compileCmd = `g++ -O0 "${testFilePath}" -o "${binaryName}" -lgtest -lgtest_main -lpthread`;
            res.write(JSON.stringify({ status: 'info', message: `No CMake found. Falling back to: ${compileCmd}` }) + '\n');
            await execAsync(compileCmd, { cwd });
            const { stdout, stderr } = await execAsync(`.\\${binaryName}`, { cwd });
            res.write(JSON.stringify({ status: 'success', output: stdout, errors: stderr }) + '\n');
        }
        res.end();
    } catch (err) {
        // BUG 5 FIX: cannot call res.status() after res.write() — just write the error and end
        if (!res.headersSent) {
            res.setHeader('Content-Type', 'application/json');
        }
        res.write(JSON.stringify({ status: 'error', message: `Build/Run failed: ${err.message}` }) + '\n');
        res.end();
    }
});

/**
 * GET /api/env/home
 * Returns the user's home directory for the HOME shortcut in the file picker.
 */
app.get('/api/env/home', (req, res) => {
    res.json({ home: os.homedir().replace(/\\/g, '/') });
});

export function startServer(port = 3021) {
    app.listen(port, () => {
        console.log(`GTest Architect UI running at http://localhost:${port}`);
    });
}

// Global JSON Error Handler (v6.7) - Prevents <!DOCTYPE HTML> on failed API calls
app.use((req, res) => {
    if (req.accepts('json') || req.path.startsWith('/api/')) {
        logger.log(`API route not found: ${req.path}`, '404');
        res.status(404).json({ error: 'API endpoint not found' });
    } else {
        res.status(404).send('Not Found');
    }
});
