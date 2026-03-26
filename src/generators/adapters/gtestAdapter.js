/**
 * Google Test formatting abstraction.
 * Offers static/instance methods to generate canonical GTest and GMock C++ syntax.
 */
export class GTestAdapter {
  constructor() {}
  
  /**
   * Generates a standard TEST macro block.
   */
  formatTest(suite, name, body) {
      return `TEST(${suite}, ${name}) {\n${this._indent(body)}\n}`;
  }

  /**
   * Generates a TEST_F macro block for use with fixtures.
   */
  formatTestF(suite, name, body) {
      return `TEST_F(${suite}, ${name}) {\n${this._indent(body)}\n}`;
  }

  /**
   * Generates a fixture class definition.
   */
  formatFixture(className, setupBody = '', teardownBody = '', extraMembers = '') {
      return `class ${className} : public ::testing::Test {\n` +
             ` protected:\n` +
             `  void SetUp() override {\n${this._indent(setupBody, 4)}\n  }\n\n` +
             `  void TearDown() override {\n${this._indent(teardownBody, 4)}\n  }\n\n` +
             `${this._indent(extraMembers, 2)}\n};`;
  }

  /**
   * Generates a standard TEST_P macro block for parameterized tests.
   */
  formatTestP(suite, name, body) {
      return `TEST_P(${suite}, ${name}) {\n${this._indent(body)}\n}`;
  }

  /**
   * Generates a parameterized fixture class definition.
   */
  formatParameterizedFixture(className, paramType, setupBody = '', teardownBody = '', extraMembers = '') {
      return `class ${className} : public ::testing::TestWithParam<${paramType}> {\n` +
             ` protected:\n` +
             `  void SetUp() override {\n${this._indent(setupBody, 4)}\n  }\n\n` +
             `  void TearDown() override {\n${this._indent(teardownBody, 4)}\n  }\n\n` +
             `${this._indent(extraMembers, 2)}\n};`;
  }

  /**
   * Instantiates a parameterized test suite.
   */
  formatInstantiateTestSuite(instantiationName, suiteName, paramGenerator) {
      return `INSTANTIATE_TEST_SUITE_P(\n` +
             `    ${instantiationName},\n` +
             `    ${suiteName},\n` +
             `    ${paramGenerator}\n);`;
  }

  /**
   * Generates a GMock mock class definition.
   * @param {string} className - The name of the mock class (e.g. MockFoo)
   * @param {string} interfaceToMock - The interface being mocked (e.g. IFoo)
   * @param {Array<{returnType: string, MethodName: string, argsString: string, qualifiers: string}>} methods
   */
  formatMockClass(className, interfaceToMock, methods) {
      const formattedMethods = methods.map(m => {
          return `  MOCK_METHOD(${m.returnType}, ${m.MethodName}, (${m.argsString}), (${m.qualifiers || 'override'}));`;
      }).join('\n');

      return `class ${className} : public ${interfaceToMock} {\n` +
             ` public:\n` +
             formattedMethods + `\n};`;
  }

  /**
   * Generates EXPECT_DEATH assertion for testing aborts/panics.
   */
  formatExpectDeath(statement, regexMatcher = '""') {
      return `EXPECT_DEATH({\n${this._indent(statement, 4)}\n}, ${regexMatcher});`;
  }

  _indent(str, spaces = 2) {
      if (!str) return '';
      const prefix = ' '.repeat(spaces);
      return str.split('\n').map(line => line.length > 0 ? prefix + line : line).join('\n');
  }
}
