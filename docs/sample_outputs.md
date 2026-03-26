# Sample C++ Outputs & Hints (v2.0)

A showcase of real output produced by GTest Architect across the full analysis pipeline.

---

## 1. JSON Gap Report (v2.0 Format)

The `JSONReportWriter` emits this structure after `CoverageGapAnalyzer` processes scenarios:

```json
{
  "metadata": {
    "analysisVersion": "2.0",
    "toolName": "GTest Architect",
    "generatedAt": "2026-03-23T21:00:00.000Z",
    "filePath": "src/VehicleController.cpp",
    "totalScenarios": 5,
    "fullyCovedCount": 2,
    "partialCount": 1,
    "uncoveredCount": 2,
    "coveragePercent": 40.0
  },
  "gaps": [
    {
      "scenario_id": "BOUNDARY-012-MaxBufferFlush",
      "type": "boundary",
      "status": "uncovered",
      "expected_behavior": "processPayload with exactly 1024 bytes triggers FlushManager::triggerFlush() exactly once",
      "requirement_source": "Doxygen @warning on processPayload()",
      "confidence_score": 0.95,
      "matching_test": null,
      "assertion_hints": [
        "Add EXPECT_CALL(*mockFlushManager, triggerFlush()).Times(1) BEFORE invoking processPayload",
        "Assert EXPECT_EQ(controller->getBufferedBytes(), 0) to verify post-flush state"
      ],
      "doc_trace": "@warning Payload sizes of exact BUF_MAX (1024) trigger immediate flush.",
      "priority_weight": 9
    }
  ]
}
```

---

## 2. Markdown Gap Report — Coverage Bar

The `MarkdownReportWriter` renders an ASCII coverage progress bar:

```
🔴 `[████░░░░░░░░░░░░░░░░]` **20% covered**

| Metric               | Count |
|----------------------|-------|
| Total Scenarios      | **5** |
| ✅ Fully Covered     | **1** |
| 🟠 Partially Covered | **1** |
| 🔴 Uncovered         | **3** |
| **Coverage %**       | **20%** |
```

And per-gap doc trace + assertion hint callouts:

```markdown
### [🔴 UNCOVERED] BOUNDARY-012-MaxBufferFlush *(95% confidence)*
- **Type**: boundary
- **Expected Behavior**: triggerFlush() called exactly once at 1024-byte boundary
- **Requirement Source**: Doxygen @warning on processPayload()

> **📎 Doc Trace:** *"@warning Payload sizes of exact BUF_MAX (1024) trigger immediate flush."*

**💡 Assertion Hints:**
- Add `EXPECT_CALL(*mockFlushManager, triggerFlush()).Times(1)` before invoking `processPayload`
- Assert `EXPECT_EQ(controller->getBufferedBytes(), 0)` to verify post-flush state
```

---

## 3. Generated GTest (Focus Pipeline Output)

When running `gtest-gen.bat focus --file VehicleController.cpp --compile-commands compile_commands.json`:

```
[PIPELINE] ═══════════════════════════════════════════════
[PIPELINE] GTest Architect — Focus Pipeline
[PIPELINE] Target: VehicleController.cpp
[PIPELINE] ═══════════════════════════════════════════════

[PIPELINE] 📦 Loading compile context from: compile_commands.json
[PIPELINE]   → Defines: -DBUF_MAX=1024 -DENABLE_FLUSH_CALLBACK
[PIPELINE]   → Includes: 3 paths
[PIPELINE] 🔍 Level-1: Extracting function inventory...
[PIPELINE]   → 7 functions found.
[PIPELINE] 🧠 Level-1: Running whole-file semantic analysis...
[PIPELINE] 📊 Level-2: Ranking functions by priority...
[PIPELINE]   → Top 2 targets selected:
[PIPELINE]     🔴 [85] bool VehicleController::processPayload(const std::vector<uint8_t>& data)
[PIPELINE]        ↳ Publicly visible API, Has documented intent (Doxygen), High cyclomatic complexity (5 branches)
[PIPELINE]     🟠 [55] Status VehicleController::init(const Config& cfg)
[PIPELINE]        ↳ Publicly visible API, Has documented intent (Doxygen)
```

The generated test appended to `VehicleController_test.cpp`:

```cpp
// ---- AUTO-GENERATED | GTest Architect v2.0 ----
// Scenario: BOUNDARY-012-MaxBufferFlush
// Source: Doxygen @warning on processPayload() | BUF_MAX=-DBUF_MAX=1024
// Assertion Hint: EXPECT_CALL for FlushManager::triggerFlush() required
TEST_F(VehicleControllerTest, ProcessPayload_ExactBoundary1024_FlushesBuffer) {
    // Arrange — 1024-byte payload hits the BUF_MAX boundary
    std::vector<uint8_t> payload(1024, 0xFF);
    EXPECT_CALL(*mockFlushManager, triggerFlush()).Times(1);

    // Act
    auto result = controller->processPayload(payload);

    // Assert return code
    EXPECT_EQ(result, Status::SUCCESS);
    // Assert post-flush internal state
    EXPECT_EQ(controller->getBufferedBytes(), 0);
}
```

---

## 4. Chain-of-Thought Scenario Extraction

`ScenarioExtractor` with `chainOfThought: true` produces reasoning traces:

```json
[
  {
    "scenario_id": "BOUNDARY-001",
    "type": "boundary",
    "expected_behavior": "Returns ERR_OVERFLOW when payload.size() == BUF_MAX + 1",
    "precondition": "Controller initialized, FlushManager available",
    "confidence": 0.92,
    "requirement_source": "@warning Payload sizes of exact BUF_MAX trigger immediate flush.",
    "stub_strategy": "EXPECT_CALL(*mockFlushManager, triggerFlush()).Times(0) — flush must NOT fire on overflow",
    "thought_process": "BUF_MAX=1024; payload of 1025 exceeds it; the @warning covers exactly 1024 but the else branch returns ERR_OVERFLOW — this is an uncovered error path."
  }
]
```

---

## 5. Function Report — Priority Heatmap + Mocking Strategies

`FunctionReportWriter` outputs:

```markdown
## Priority Heatmap Legend
| Tier     | Badge | Score Range | Meaning                                  |
|----------|-------|-------------|------------------------------------------|
| CRITICAL | 🔴    | > 70        | Must test — high complexity + documented |
| HIGH     | 🟠    | 40–70       | Should test — public API or Doxygen found|
| LOW      | 🟢    | < 40        | Optional — passthrough or already covered|

## File Inventory Dashboard
| Tier | Signature          | Doxygen? | Priority | Assertion Score | Focused? | Reason                          |
|------|--------------------|----------|----------|-----------------|----------|---------------------------------|
| 🔴   | `processPayload`   | ✅       | 85       | 3/5 (78% conf)  | ✅       | Public API, Doxygen, 5 branches |
| 🟠   | `init`             | ✅       | 55       | —               | ✅       | Public API, Doxygen             |
| 🟢   | `getBufferedBytes` | ❌       | 10       | —               | ❌       | Passthrough getter              |

## Mocking Strategies
| Function          | Dependency       | Mock Style                          | Injected?          |
|-------------------|------------------|-------------------------------------|--------------------|
| `processPayload`  | `FlushManager`   | EXPECT_CALL / constructor injection | ✅ Yes             |
| `init`            | `ConfigValidator`| EXPECT_CALL / link seam             | ❌ No (link seam)  |
```

---

## 6. Assertion Strength Batch Evaluation

`AssertionStrengthAnalyzer.batchEvaluate()` returns:

```json
[
  {
    "index": 0,
    "test_name": "ProcessPayload_ExactBoundary1024_FlushesBuffer",
    "score": 5,
    "reasoning": "Checks return value, post-state, AND EXPECT_CALL mock interactions — full coverage.",
    "suggested_fix": "No changes needed.",
    "anti_patterns_found": [],
    "confidence": 0.97
  },
  {
    "index": 1,
    "test_name": "Init_ValidConfig_ReturnsSuccess",
    "score": 2,
    "reasoning": "Only checks return code. Internal config state not verified.",
    "suggested_fix": "Add EXPECT_EQ(controller->isInitialized(), true) and verify ConfigValidator mock was called.",
    "anti_patterns_found": ["Boolean return checked without verifying internal state changes"],
    "confidence": 0.88
  }
]
```
