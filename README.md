# 🧪 GTest Architect v6.0 — The Mock Architect Edition

> **AI-powered C++ unit test & mock generation using Google Gemini.**  
> Transforms headers into GMock headers following **Workflow v05**, analyzes source files for coverage gaps, and writes production-quality GoogleTest tests with a premium glassmorphic dashboard.

---

## ✨ What's New in v6.0

| Feature | Description |
|:---|:---|
| **🏗️ Mock Architect v1.0** | Dedicated tool to transform C++ headers into GMock headers following **Workflow v05**. |
| **🔄 Singleton Mock Pattern** | Automatically generates companion singleton mocks for **static class methods** and **namespaced free functions**. |
| **🛠️ CMake-Native Build** | Adaptive build system that detects `CMakeLists.txt` and manages build/ binaries for the Test Runner. |
| **🌓 Side-by-Side Diff** | High-fidelity dual-pane viewer in the Reviewer Modal for instant code comparison. |
| **💠 Premium UI Dashboard** | Glassmorphic sidebar layout with **Interactive Preview** for headers and side-by-side transformation output. |
| **🛡️ Resilient AI Parsing** | Robust regex-fallback parsing ensures functionality even during AI service (503/429) outages. |

---

## 🏗️ Architecture

```
gtest_tool/
├── src/
│   ├── cli.js                          # Commander.js CLI entry point
│   ├── server.js                       # Express web server (v6.0-mock compliant)
│   ├── tui.js                          # @inquirer/prompts terminal wizard
│   ├── generators/
│   │   ├── mockGenerator.js               # [NEW] Workflow v05 Mock Transmuter
│   │   ├── cppUnitTestGenerator.js        # Dual-agent generator + reviewer + fixer
│   │   ├── libFuzzerGenerator.js          # LibFuzzer harness generator
│   │   └── adapters/
│   │       └── gtestAdapter.js            # TEST / TEST_F / TEST_P / MOCK_METHOD formatter
│   ├── services/
│   │   ├── aiService.js                  # Gemini/OpenAI API with resilience fallback
│   │   └── promptBuilder.js              # [EXTENDED] Workflow v05 Prompt Engine
│   └── parsers/
│       ├── functionInventoryExtractor.js  # C++ function extractor
│       └── compileCommandsParser.js       # CMake context parser
├── public/
│   ├── index.html                         # [V6.0] Premium Sidebar UI
│   ├── app.js                             # [V6.0] Mock Preview & Tab Manager
│   └── style.css                          # [V6.0] Glassmorphic Stylesheet
└── test.cpp                               # Demo C++ file
```

---

## 📦 Installation

**Requirements:** Node.js v18+, CMake (optional for v6.0 Runner)

```bash
git clone <repository>
cd gtest_tool
npm install
```

### Configure API Key

Edit `.env`:
```env
GEMINI_API_KEY="your-key-here"
```

---

## 🚀 Usage

### 🌐 1. Premium Web Dashboard (Recommended)

```bash
node src/cli.js ui
# Open http://localhost:3021
```

**v6.0 Dashboard Highlights:**
- **Navigation Sidebar**: Quick toggle between **Generate**, **Mock Architect**, and **Test Runner**.
- **Mock Architect**:
  - Drag-and-drop or Browse for a `.h` header.
  - See the source code instantly in the **Interactive Preview**.
  - Hit **Transform to GMock** — Workflow v05 executes and returns a side-by-side comparison.
  - Automatic injection of `MOCK_METHOD`, singleton instances, and default arg wrappers.
- **Test Runner (v6.0)**:
  - Detects CMake projects and runs `cmake --build`.
  - Streams real-time build and execution logs to the integrated console.

### 🖥️ 2. Interactive Terminal Wizard (TUI)

```bash
node src/cli.js tui
```

Classic keyboard-driven wizard for headless environments.

---

## 🔄 Workflow v05: The GTest Standard

The **Mock Architect** follows a rigorous 9-step transformation process:

1. **Include Guard Preservation**
2. **GMock/GTest Injection**
3. **Namespace Safety**
4. **Singleton Mocking (Static Methods)**
5. **Singleton Mocking (Free Functions)**
6. **MOCK_METHOD Translation**
7. **Default Arg Wrappers**
8. **Lifecycle Preservation**
9. **Private Section Stripping**

---

## 🛡️ Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | ✅ Yes | Your Google Gemini API key |
| `GEMINI_MODEL` | ❌ No | Gemini model to use (default: gemini-2.5-flash) |

---

## 🛟 Help

```bash
node src/cli.js --help
node src/cli.js ui --help
```
