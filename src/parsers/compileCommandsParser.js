import fs from 'fs';
import path from 'path';

/**
 * Extracts compiler flags (macros, includes, defines) from compile_commands.json.
 * Supports both "command" string and "arguments" array formats.
 */
export class CompileCommandsParser {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.dbCache = null;
  }

  /**
   * Loads the compile_commands.json database.
   * Call this before any other method.
   * @returns {boolean} true if loaded successfully
   */
  async loadDatabase() {
    if (!fs.existsSync(this.dbPath)) {
      console.warn(`[CompileCommandsParser] File not found: ${this.dbPath}`);
      return false;
    }
    try {
      const data = fs.readFileSync(this.dbPath, 'utf-8');
      this.dbCache = JSON.parse(data);
      console.log(`[CompileCommandsParser] Loaded ${this.dbCache.length} entries from ${this.dbPath}`);
      return true;
    } catch (err) {
      console.error(`[CompileCommandsParser] Failed to parse DB:`, err.message);
      return false;
    }
  }

  /**
   * Finds the compile_commands entry for a specific source file.
   * Tries exact absolute path match first, then basename fallback.
   * @param {string} targetFile - absolute or relative path to the C++ source file
   * @returns {Object|null} the matching compile_commands entry, or null
   */
  getEntryForFile(targetFile) {
    if (!this.dbCache) return null;

    // Normalize path for Windows (handle drive casing: c: vs C:)
    const normalize = (p) => {
      const abs = path.resolve(p);
      if (process.platform === 'win32') {
         return abs.charAt(0).toUpperCase() + abs.slice(1);
      }
      return abs;
    };

    const targetAbs = normalize(targetFile);
    const targetBase = path.basename(targetFile);

    // 1. Exact absolute match (normalized)
    let entry = this.dbCache.find(e => normalize(e.file) === targetAbs);

    // 2. Basename fallback (handles relative path mismatches)
    if (!entry) {
      entry = this.dbCache.find(e => path.basename(e.file) === targetBase);
    }

    // 3. Substring match
    if (!entry) {
      const lowerTarget = targetAbs.toLowerCase();
      entry = this.dbCache.find(e => lowerTarget.endsWith(path.basename(e.file).toLowerCase()));
    }

    return entry || null;
  }

  /**
   * Extracts -D defines and -I includes from a compile command string or arguments array.
   */
  extractBuildContext(commandStr) {
    if (!commandStr) return { defines: [], includes: [] };
    // Split on whitespace but respect simple quoted sequences
    const args = commandStr.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    return this._parseArgs(args);
  }

  /**
   * Convenience: Get ONLY defines/macros for a file.
   */
  getDefinesForFile(targetFile) {
    const ctx = this.extractFileContext(targetFile);
    return ctx.defines;
  }

  /**
   * Convenience: Get ONLY include paths for a file.
   */
  getIncludesForFile(targetFile) {
    const ctx = this.extractFileContext(targetFile);
    return ctx.includes;
  }

  /**
   * Finds the macros and includes for a specific file.
   * Convenience wrapper: combines getEntryForFile + extractBuildContext.
   * @param {string} targetFile
   * @returns {{ defines: string[], includes: string[], macros: string[] }}
   */
  extractFileContext(targetFile) {
    const entry = this.getEntryForFile(targetFile);
    if (!entry) return { defines: [], includes: [], macros: [] };

    const raw = entry.command || (entry.arguments || []).join(' ');
    const ctx = this.extractBuildContext(raw);
    return { ...ctx, macros: ctx.defines }; // alias macros = defines for compatibility
  }

  // ─── private ────────────────────────────────────────────────────────────────

  _parseArgs(args) {
    const defines  = [];
    const includes = [];

    for (let i = 0; i < args.length; i++) {
      const a = args[i].replace(/"/g, '').trim();

      if (a.startsWith('-D') && a.length > 2) {
        defines.push(a);
      } else if (a === '-D' && i + 1 < args.length) {
        defines.push('-D' + args[++i]);
      } else if (a.startsWith('-I') && a.length > 2) {
        includes.push(a);
      } else if (a === '-I' && i + 1 < args.length) {
        includes.push('-I' + args[++i]);
      }
    }

    return { defines, includes };
  }
}
