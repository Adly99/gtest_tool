# Tool Architecture and Strategy Explanations
This document explains the core testing logic and strategy within the C++ Test Generation Tool.

## 1. How Duplicate Detection Works
To prevent "blind rewrites" or redundant code, the Test Accumulator component uses multiple layers of similarity matching:
* **Syntactic Verification**: Extracted existing test names, fixture calls, and structural AST are compared against newly planned scenarios.
* **Semantic Target Matching**: Gemini and AST logic check whether the specific setup inputs, function arguments, and outputs map onto covered code paths.
* **Scenario Intent Hash**: Each planned scenario is assigned a semantic "scenario_id". If an existing test matches the same precondition and target intent, the tool blocks duplicate generation.

## 2. How Partial Coverage is Detected
Partial coverage refers to a test exercising an API but not covering all semantic branches or constraints.
* **Extraction Mapping**: The Code and Doc Parsers assemble an N-dimensional space of valid state transitions (e.g., null input, boundary bounds).
* **Assertion Reviewing**: The script compares what a test _can_ verify against what it _actually_ asserts (e.g., checks output but misses `std::error_code` side-effects). 
* **Outcome**: A scenario gets classified as "partially covered", meaning the baseline fixture might exist, but additional assertions or test parameters are required to strengthen it.

## 3. How Assertion Strength is Evaluated
The tool uses a lightweight internal rubric combined with LLM semantic checking:
1. **Depth check**: Does the test only verify a `true/false` return value, or does it verify dependent state changes?
2. **Context check**: Are mock interactions checked? Are the arguments correctly verified via `EXPECT_CALL` constraints or broad wildcard matchers?
3. **Verdict Assignment**: An assertion strength score (1-5) is produced. Lower scores trigger the generation of a stronger overriding test or a suggested "reviewer hint" fix.

## 4. How Hints are Derived
Hints are structured explanations required to accompany generated tests, ensuring developers trust the output. 
They are synthesized from the trace provenance pipeline:
* **`reason_for_generation`**: Derives directly from the Gap Analyzer output indicating an "uncovered" constraint.
* **`doc_trace` / `code_trace`**: Directly extracts the specific `#include`, lines, or LLD clauses.
* **`assertion_hint`**: Why the semantic evaluator decided to generate a specific `EXPECT_EQ()` behavior rather than another constraint.

## 5. How Broad Scenario Coverage is Ensured
By combining static extraction of compilation flags (`compile_commands.json`), dynamic extraction of dependencies (`stubs`), and structural logic paths, the pipeline mathematically enumerates scenario clusters. Gemini is tasked with systematically generating a cross product of:
[Happy Paths, Boundaries, Error Fallbacks, State Machine Cycles, Interaction Callbacks] x [Function API]. This forces coverage to exist for every logical quadrant, producing a gap matrix where missing quadrants are explicitly listed in reports.
