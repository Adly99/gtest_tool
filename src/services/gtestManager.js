import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Service to manage a local clone of the GoogleTest repository.
 * This allows the tool to reference specific versions, extract headers for mock generation,
 * or even perform test runs using a consistent framework version.
 */
export class GTestManager {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.gtestDir = path.join(this.projectRoot, '.gtest_tool', 'googletest');
    this.repoUrl = 'https://github.com/google/googletest.git';
  }

  /**
   * Clones the repository if it doesn't exist, or fetches updates if it does.
   */
  async ensureRepository() {
    if (!fs.existsSync(this.gtestDir)) {
      console.log(`Cloning GoogleTest repository to ${this.gtestDir}...`);
      const dirPath = path.dirname(this.gtestDir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      await execAsync(`git clone ${this.repoUrl} ${this.gtestDir}`);
    } else {
      console.log(`GoogleTest repository found at ${this.gtestDir}. Fetching updates...`);
      await execAsync(`git fetch --all`, { cwd: this.gtestDir });
    }
  }

  /**
   * Checks out a specific tag or commit.
   * @param {string} version - The branch, tag, or commit hash to checkout (default 'main').
   */
  async checkoutVersion(version = 'main') {
    await this.ensureRepository();
    console.log(`Checking out GoogleTest version/tag: ${version}...`);
    try {
      await execAsync(`git checkout ${version}`, { cwd: this.gtestDir });
    } catch (error) {
       console.error(`Failed to checkout version ${version}. The tag/commit might not exist or the repo is dirty.`);
       throw error;
    }
  }

  /**
   * Retrieves a list of available tags (versions).
   * @returns {Promise<string[]>} Array of tag strings.
   */
  async getAvailableTags() {
    await this.ensureRepository();
    const { stdout } = await execAsync(`git tag --sort=-v:refname`, { cwd: this.gtestDir });
    return stdout.split('\n').map(t => t.trim()).filter(t => t.length > 0);
  }
}
