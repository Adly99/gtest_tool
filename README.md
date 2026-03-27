# 🧪 GTest Architect v8.1.0 — The AI Provider & Mock Architect Edition

> **AI-powered C++ unit test & mock generation using Google Gemini & OpenAI.**  
> Transforms headers into GMock headers following **Workflow v05**, analyzes source files for coverage gaps, and writes production-quality GoogleTest tests with a premium glassmorphic dashboard.

---

## ✨ What's New in v8.1.0

| Feature | Description |
|:---|:---|
| **🤖 Dual AI Engine Support** | Hot-swap between **Gemini 3 Flash** and **OpenAI GPT-4o / GPT-4o-Mini** instantly from the UI. |
| **🗄️ Native File Explorer** | A new, powerful server-side directory/file picker modal with keyboard navigation and search filtering. |
| **🖥️ Technical Log Sidebar** | Live diagnostics drawer built into the dashboard for real-time AI provider switching logs and API feedback. |
| **🏗️ Mock Architect v1.0** | Dedicated tool to transform C++ headers into GMock headers following **Workflow v05**. |
| **🔄 Singleton Mock Pattern** | Automatically generates companion singleton mocks for **static class methods** and **namespaced free functions**. |
| **🛠️ CMake-Native Build** | Adaptive build system that detects `CMakeLists.txt` and manages build/ binaries for the Test Runner. |
| **🌓 Side-by-Side Diff** | High-fidelity dual-pane viewer in the Reviewer Modal for instant code comparison. |
| **💠 Premium UI Dashboard** | Glassmorphic sidebar layout with **Interactive Preview** for headers and side-by-side transformation output. |
| **🛡️ Resilient AI Parsing** | Robust regex-fallback parsing ensures functionality even during AI service (503/429) outages. |

---

## 🏗️ Architecture

```text
gtest_tool/
├── src/
│   ├── cli.js                          # Commander.js CLI entry point
│   ├── server.js                       # Express web server (v8.1.0 compliant)
│   ├── tui.js                          # @inquirer/prompts terminal wizard
│   ├── generators/
│   │   ├── mockGenerator.js               # Workflow v05 Mock Transmuter
│   │   ├── cppUnitTestGenerator.js        # Dual-agent generator + reviewer + fixer
│   │   ├── libFuzzerGenerator.js          # LibFuzzer harness generator
│   │   └── adapters/
│   │       └── gtestAdapter.js            # TEST / TEST_F / TEST_P / MOCK_METHOD formatter
│   ├── services/
│   │   ├── aiService.js                  # Engine factory mapping UI requests to Gemini/OpenAI
│   │   └── promptBuilder.js              # Workflow v05 Prompt Engine
│   └── parsers/
│       ├── functionInventoryExtractor.js  # C++ function extractor
│       └── compileCommandsParser.js       # CMake context parser
├── public/
│   ├── index.html                         # Premium Sidebar UI with AI Engine Dropdown
│   ├── app.js                             # API logic, Mock preview, File Explorer, Log Drawer
│   └── style.css                          # Glassmorphic Stylesheet
├── RESTART_CLEAN.bat                      # Windows quick-start and cleanup script
└── test.cpp                               # Demo C++ file
```

---

## 📦 Installation

**Requirements:** Node.js v18+, CMake (optional for v8.1.0 Runner)

```bash
git clone <repository>
cd gtest_tool
npm install
```

### Configure API Keys

Edit `.env` to configure your AI credentials:
```env
# Google AI Studio (Gemini)
GEMINI_API_KEY="your-gemini-key-here"
GEMINI_MODEL="gemini-3-flash-preview"

# OpenAI (ChatGPT)
OPENAI_API_KEY="your-openai-key-here"
OPENAI_MODEL="gpt-4o-mini"
```

---

## 🚀 Usage

### 🌐 1. Premium Web Dashboard (Recommended)

```bash
npm start
# OR run the Windows Batch script
RESTART_CLEAN.bat
# Open http://localhost:3021
```

**v8.1.0 Dashboard Highlights:**
- **Navigation Sidebar**: Quick toggle between **Project**, **Generate**, **Mock Architect**, and **Test Runner**.
- **AI Engine Swapping**: Change the `AI ENGINE` dropdown in the Project Tab to hot-swap between Gemini and OpenAI instantly. View the change actively in the floating **Technical Log**.
- **Enhanced Directory Browser**: Click `Browse` to open the full-screen interactive file system modal.
- **Mock Architect**:
  - Browse for a `.h` header.
  - See the source code instantly in the **Interactive Preview**.
  - Hit **Transform to GMock** — Workflow v05 executes and returns a side-by-side comparison.
  - Automatic injection of `MOCK_METHOD`, singleton instances, and default arg wrappers.
- **Test Runner**:
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
| `GEMINI_API_KEY` | ⚠️ Yes* | Your Google Gemini API key. *(Unless only using OpenAI)* |
| `GEMINI_MODEL` | ❌ No | Gemini model to use (default: gemini-3-flash-preview) |
| `OPENAI_API_KEY` | ⚠️ Yes* | Your OpenAI API key. *(Unless only using Gemini)* |
| `OPENAI_MODEL` | ❌ No | OpenAI model to use (default: gpt-4o-mini) |
| `PORT` | ❌ No | Port for the UI dashboard (default: 3021) |

---

## 🛟 Help

```bash
node src/cli.js --help
node src/cli.js ui --help
```
