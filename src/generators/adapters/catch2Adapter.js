/**
 * Catch2 formatting abstraction.
 */
export class Catch2Adapter {
  constructor() {}
  
  formatTest(suite, name, body) {
      // Catch2 typical syntax uses TEST_CASE("Name", "[tags]")
      return `TEST_CASE("${name}", "[${suite}]") {\n${body}\n}`;
  }

  formatSetup(className) {
      // Catch2 setups are typically done inside the TEST_CASE dynamically via sections.
      return `// Catch2 dynamic setup stub for ${className}`;
  }
}
