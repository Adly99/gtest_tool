import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const debugLogPath = path.resolve(__dirname, '../../debug.log');

/**
 * Centralized Logger (v7.7)
 * Ensures consistent output to both console and the persistent debug.log.
 */
class Logger {
    constructor() {
        this.logCount = 0;
    }

    log(msg, category = 'INFO') {
        this._write(`[${category}] ${msg}`);
    }

    warn(msg) {
        this._write(`[WARN] ⚠️ ${msg}`);
    }

    error(msg, err) {
        const detail = err ? ` | Error: ${err.message || err}` : '';
        this._write(`[ERROR] ❌ ${msg}${detail}`);
        if (err?.stack) {
            this._write(`[STACK] ${err.stack.split('\n').slice(0, 3).join(' | ')}`);
        }
    }

    _write(formattedMsg) {
        const time = new Date().toISOString();
        const line = `[${time}] ${formattedMsg}\n`;
        try {
            fs.appendFileSync(debugLogPath, line);
        } catch (e) {
            console.error('Failed to write to debug log:', e.message);
        }
        console.log(formattedMsg);
        this.logCount++;
    }

    clear() {
        try {
            fs.writeFileSync(debugLogPath, `[${new Date().toISOString()}] --- DEBUG LOG CLEARED ---\n`);
            this.logCount = 0;
            return true;
        } catch (e) {
            return false;
        }
    }

    getTail(limit = 100) {
        if (!fs.existsSync(debugLogPath)) return 'No logs found.';
        try {
            const content = fs.readFileSync(debugLogPath, 'utf-8');
            return content.split('\n').slice(-limit).join('\n');
        } catch (e) {
            return `Error reading log: ${e.message}`;
        }
    }
}

export const logger = new Logger();
