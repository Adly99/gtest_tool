const VERSION = '8.1.0';
const logger = { log: (msg, src) => console.log(`[${src}] ${msg}`) };

document.addEventListener('DOMContentLoaded', () => {
    logger.log(`Initializing GTest Architect UI v${VERSION}`, 'UI');

    // --- Staggered Tab Animations ---
    const triggerTabAnimations = (tabId) => {
        const container = document.getElementById(tabId);
        if (!container) return;
        container.style.opacity = '1';
        container.querySelectorAll(':scope > .v5-form-card').forEach((el, i) => {
            el.style.opacity = '0.01';
            el.style.transform = 'translateY(10px)';
            el.style.transition = 'opacity 0.5s ease-out, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
            setTimeout(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; }, i * 60 + 40);
        });
    };

    // --- Hash Router ---
    const syncHashToTab = () => {
        const hash = window.location.hash.replace('#', '') || 'projectTab';
        const tabMap = { 'project': 'projectTab', 'generate': 'generateTab', 'mock-architect': 'mockTab', 'runner': 'runnerTab' };
        const targetId = tabMap[hash] || hash;
        if (document.getElementById(targetId)) switchMainTab(targetId);
    };

    // --- UI Elements ---
    const fileListEl            = document.getElementById('fileList');
    const refreshBtn            = document.getElementById('dirRefreshBtn');
    const generateBtn           = document.getElementById('generateBtn');
    const projectRootPathInput  = document.getElementById('projectRootPath');
    const compileCmdsPathInput  = document.getElementById('compileCmdsPath');
    const stubsPathInput        = document.getElementById('stubsPath');
    const aiProviderSelector    = document.getElementById('aiProvider');
    const fileSearchInput       = document.getElementById('moduleFileSearch');
    const themeToggle           = document.getElementById('themeToggle');

    const activeSourcePathInput = document.getElementById('activeSourcePath');
    const activeFunctionSelect  = document.getElementById('activeFunctionSelect');
    const coverageStrategy      = document.getElementById('coverageStrategy');
    const filePrefix            = document.getElementById('filePrefix');
    const modulePrefix          = document.getElementById('modulePrefix');
    const customInstructions    = document.getElementById('customInstructions');

    // Make switching provider instantly update backend and logs
    if (aiProviderSelector) {
        aiProviderSelector.addEventListener('change', async (e) => {
            try {
                await fetch('/api/provider/switch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ provider: e.target.value })
                });
            } catch (err) {
                console.error('Failed to switch provider:', err);
            }
        });
    }

    const testToRunPath         = document.getElementById('testToRunPath');
    const workingDirPath        = document.getElementById('workingDirPath');
    const runTestsBtn           = document.getElementById('runTestsBtn');
    const runnerConsole         = document.getElementById('runnerConsole');

    const reviewerModal         = document.getElementById('reviewerModal');
    const reviewerCode          = document.getElementById('reviewerCode');
    const closeModalBtn         = document.getElementById('closeModalBtn');
    const dirPickerModal        = document.getElementById('dirPickerModal');
    const browserItemsEl        = document.getElementById('browserItems');

    // --- State ---
    let currentSelectedFile = null;
    let allFilesCache = [];
    let contextStore = { headers: [], stubs: [], helpers: [], examples: [] };
    let currentBrowserPath = '';
    let browserTargetInput = '';
    let pickerType = 'dir';
    let contextTypePending = '';
    let pickerKeyboardIndex = -1;
    let pickerCurrentItems = [];

    // ══════════════════════════════════════════
    //  TAB MANAGEMENT
    // ══════════════════════════════════════════
    window.switchMainTab = (tabId) => {
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        const targetTab = document.getElementById(tabId);
        if (targetTab) { targetTab.classList.add('active'); triggerTabAnimations(tabId); }
        const clickedBtn = Array.from(document.querySelectorAll('.nav-item'))
            .find(b => b.getAttribute('onclick') && b.getAttribute('onclick').includes(tabId));
        if (clickedBtn) clickedBtn.classList.add('active');
    };
    syncHashToTab();
    window.addEventListener('hashchange', syncHashToTab);

    // ══════════════════════════════════════════
    //  CONTEXT FILE MANAGEMENT
    // ══════════════════════════════════════════
    window.openFilePickerForContext = (type) => {
        contextTypePending = type;
        browserTargetInput = `context_${type}`;
        pickerType = 'file';
        openPickerModal(projectRootPathInput.value || '.');
    };

    const addContextFile = (type, filePath) => {
        if (!contextStore[type].includes(filePath)) {
            contextStore[type].push(filePath);
            renderContextTags(type);
        }
    };

    window.removeContextFile = (type, filePath) => {
        contextStore[type] = contextStore[type].filter(p => p !== filePath);
        renderContextTags(type);
    };

    const renderContextTags = (type) => {
        const listEl = document.getElementById(`${type}FilesList`);
        if (!listEl) return;
        if (contextStore[type].length === 0) {
            listEl.innerHTML = 'No files added.';
            return;
        }
        listEl.innerHTML = '';
        contextStore[type].forEach(filePath => {
            const fileName = filePath.split(/[/\\]/).pop();
            const tag = document.createElement('div');
            tag.className = 'file-tag';
            tag.innerHTML = `<span title="${filePath}">${fileName}</span><span class="remove-tag" onclick="removeContextFile('${type}', '${escapeHtml(filePath).replace(/'/g,"\\'")}')">✕</span>`;
            listEl.appendChild(tag);
        });
    };

    // ══════════════════════════════════════════
    //  FILE TREE (Project Explorer)
    // ══════════════════════════════════════════
    const loadFiles = async () => {
        const root = projectRootPathInput.value || '.';
        fileListEl.innerHTML = '<div class="loading-state"><span class="spinner"></span> Discovering files...</div>';
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000);
            const res = await fetch(`/api/files?root=${encodeURIComponent(root)}`, { signal: controller.signal });
            clearTimeout(timeoutId);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            allFilesCache = data.files || [];
            renderFilteredFiles();
        } catch (err) {
            fileListEl.innerHTML = `<div class="error-msg">⚠️ ${err.message === 'The user aborted a request.' ? 'Request timed out' : err.message}</div>`;
        }
    };

    const renderFilteredFiles = () => {
        const query = fileSearchInput.value.toLowerCase();
        // BUG 1 FIX: API returns `basename`, not `name`
        const filtered = allFilesCache.filter(f =>
            f.path.toLowerCase().includes(query) ||
            (f.basename && f.basename.toLowerCase().includes(query))
        );

        fileListEl.innerHTML = '';
        if (filtered.length === 0) {
            fileListEl.innerHTML = `<div class="loading-state">No matching files for "${escapeHtml(query)}"</div>`;
            return;
        }
        const tree = buildFileTree(filtered, projectRootPathInput.value || '.');
        renderTree(tree, fileListEl);
    };

    fileSearchInput.addEventListener('input', renderFilteredFiles);
    if (refreshBtn) refreshBtn.addEventListener('click', loadFiles);

    const buildFileTree = (files, root) => {
        const tree = { name: 'Root', children: {}, type: 'directory' };
        const normRoot = root.replace(/[\\\/]$/, '') + '/';
        files.forEach(file => {
            let rel = file.path;
            if (rel.startsWith(normRoot)) rel = rel.substring(normRoot.length);
            else if (rel.startsWith(root)) rel = rel.substring(root.length).replace(/^[\\\/]/, '');
            const parts = rel.split(/[\\\/]/);
            let curr = tree;
            parts.forEach((p, i) => {
                if (!p) return;
                if (i === parts.length - 1) {
                    curr.children[p] = { ...file, type: 'file' };
                } else {
                    if (!curr.children[p]) curr.children[p] = { name: p, children: {}, type: 'directory' };
                    curr = curr.children[p];
                }
            });
        });
        return tree;
    };

    const getFileIcon = (name) => {
        const ext = name.split('.').pop().toLowerCase();
        if (ext === 'cpp' || ext === 'cc') return '⚙️';
        if (ext === 'h' || ext === 'hpp') return '📋';
        return '📄';
    };
    const getExtBadgeClass = (name) => {
        const ext = name.split('.').pop().toLowerCase();
        return `ext-${ext}`;
    };

    const renderTree = (node, container, depth = 0) => {
        const keys = Object.keys(node.children).sort((a, b) => {
            const na = node.children[a], nb = node.children[b];
            if (na.type !== nb.type) return na.type === 'directory' ? -1 : 1;
            return a.localeCompare(b);
        });

        keys.forEach(k => {
            const child = node.children[k];
            const item = document.createElement('div');
            const isDir = child.type === 'directory';
            item.className = `tree-item ${isDir ? 'directory-item' : 'file-item'}`;
            item.style.paddingLeft = `${depth * 16 + 12}px`;

            if (isDir) {
                item.innerHTML = `<span class="tree-icon">📁</span><span class="tree-label">${escapeHtml(k)}</span><span class="tree-chevron">›</span>`;
                const sub = document.createElement('div');
                sub.className = 'tree-children';
                sub.style.display = 'none';
                item.onclick = (e) => {
                    e.stopPropagation();
                    const open = sub.style.display === 'none';
                    sub.style.display = open ? 'block' : 'none';
                    item.querySelector('.tree-icon').textContent = open ? '📂' : '📁';
                    item.classList.toggle('open', open);
                };
                container.appendChild(item);
                container.appendChild(sub);
                renderTree(child, sub, depth + 1);
            } else {
                const ext = k.split('.').pop().toLowerCase();
                item.innerHTML = `
                    <span class="tree-icon">${getFileIcon(k)}</span>
                    <span class="tree-label">${escapeHtml(k)}</span>
                    <span class="ext-badge ${getExtBadgeClass(k)}">.${ext}</span>
                `;
                // BUG 2 FIX: clicking a file sets activeSourcePath AND switches to Generate tab
                item.onclick = (e) => {
                    e.stopPropagation();
                    document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('selected'));
                    item.classList.add('selected');
                    currentSelectedFile = child.path;
                    activeSourcePathInput.value = child.path;
                    populateFunctions(child.path);
                    // Auto-navigate to Generate tab for smooth workflow
                    switchMainTab('generateTab');
                };
                container.appendChild(item);
            }
        });
    };

    // ══════════════════════════════════════════
    //  FUNCTION EXTRACTION
    // ══════════════════════════════════════════
    const populateFunctions = async (filePath) => {
        activeFunctionSelect.innerHTML = '<option>🔍 Extracting functions...</option>';
        generateBtn.disabled = true;
        try {
            const res = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filePath, provider: aiProviderSelector.value })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            activeFunctionSelect.innerHTML = '<option value="all">— All Functions —</option>';
            (data.inventory || []).forEach(fn => {
                const opt = document.createElement('option');
                opt.value = fn.signature;
                opt.textContent = fn.function_name || fn.signature;
                activeFunctionSelect.appendChild(opt);
            });
            generateBtn.disabled = false;
        } catch (err) {
            activeFunctionSelect.innerHTML = `<option>⚠️ Error: ${escapeHtml(err.message)}</option>`;
        }
    };

    // ══════════════════════════════════════════
    //  GENERATION
    // ══════════════════════════════════════════
    generateBtn.onclick = async () => {
        const filePath = activeSourcePathInput.value;
        const selectedFn = activeFunctionSelect.value;
        if (!filePath) return alert('Select a source file first.');

        const body = {
            filePath,
            selectedFunctions: selectedFn === 'all'
                ? Array.from(activeFunctionSelect.options).slice(1).map(o => o.value)
                : [selectedFn],
            provider: aiProviderSelector.value,
            headers: contextStore.headers,
            stubs: contextStore.stubs,
            helpers: contextStore.helpers,
            examples: contextStore.examples,
            customInstructions: customInstructions.value,
            coverageStrategy: coverageStrategy.value,
            filePrefix: filePrefix.value,
            modulePrefix: modulePrefix.value
        };

        generateBtn.disabled = true;
        generateBtn.innerHTML = '<span class="spinner"></span> Generating...';

        try {
            const res = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            showReviewerModal(data.code, data);
            testToRunPath.value = 'tests/generated_test.cpp';
        } catch (err) {
            alert(`Generation failed: ${err.message}`);
        } finally {
            generateBtn.disabled = false;
            generateBtn.innerHTML = 'Generate Tests';
        }
    };

    const showReviewerModal = async (newCode, data) => {
        reviewerCode.innerHTML = '<div class="loading-state"><span class="spinner"></span> Preparing diff...</div>';
        reviewerModal.classList.remove('hidden');
        let oldCode = '';
        try {
            const fileName = activeSourcePathInput.value.split(/[/\\]/).pop().split('.')[0];
            const dir = activeSourcePathInput.value.split(/[/\\]/).slice(0,-1).join('/');
            const possibleTestPath = `${dir}/tests/${fileName}_test.cpp`;
            const res = await fetch(`/api/browser/view?path=${encodeURIComponent(possibleTestPath)}`);
            if (res.ok) { const json = await res.json(); oldCode = json.content || ''; }
        } catch (e) { /* no existing test */ }

        reviewerCode.innerHTML = renderSideBySideDiff(oldCode, newCode);
        if (data.refactoring_plans && data.refactoring_plans.length > 0) {
            const insightsEl = document.createElement('div');
            insightsEl.className = 'insights-box';
            insightsEl.innerHTML = `<h3>Architectural Insights</h3><p>${escapeHtml(JSON.stringify(data.refactoring_plans))}</p>`;
            reviewerCode.appendChild(insightsEl);
        }
    };

    const renderSideBySideDiff = (oldContent, newContent) => {
        const oldLines = oldContent ? oldContent.split('\n') : [];
        const newLines = newContent ? newContent.split('\n') : [];
        return `<div class="diff-container">
            <div class="diff-header">
                <div class="diff-pane-title">Existing Test Asset</div>
                <div class="diff-pane-title">AI-Generated v8.1.0</div>
            </div>
            <div class="diff-body">
                <div class="diff-pane old-pane"><pre><code>${oldLines.map(l => `<div class="diff-line">${escapeHtml(l)}</div>`).join('')}</code></pre></div>
                <div class="diff-pane new-pane"><pre><code>${newLines.map(l => `<div class="diff-line added">${escapeHtml(l)}</div>`).join('')}</code></pre></div>
            </div>
        </div>`;
    };

    const escapeHtml = (text) => String(text)
        .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;").replace(/'/g,"&#039;");

    closeModalBtn.onclick = () => reviewerModal.classList.add('hidden');
    reviewerModal.addEventListener('click', e => { if (e.target === reviewerModal) reviewerModal.classList.add('hidden'); });

    // Download buttons
    const modalDownloadBtn = document.getElementById('modalDownloadBtn');
    if (modalDownloadBtn) {
        modalDownloadBtn.onclick = () => {
            const code = reviewerCode.innerText;
            const name = (activeSourcePathInput.value.split(/[/\\]/).pop().split('.')[0] || 'generated') + '_test.cpp';
            downloadFile(name, code);
        };
    }
    const modalCopyBtn = document.getElementById('modalCopyBtn');
    if (modalCopyBtn) {
        modalCopyBtn.onclick = () => {
            navigator.clipboard.writeText(reviewerCode.innerText);
            modalCopyBtn.textContent = '✅ Copied!';
            setTimeout(() => modalCopyBtn.textContent = '📋 Copy', 2000);
        };
    }

    // ══════════════════════════════════════════
    //  TEST RUNNER
    // ══════════════════════════════════════════
    const runTests = async () => {
        const testPath = testToRunPath.value;
        const dir = workingDirPath.value;
        if (!testPath) return alert('Select a test file.');
        runTestsBtn.disabled = true;
        runnerConsole.innerHTML = '<div class="log-info"><span class="spinner"></span> Building and running tests...</div>';
        try {
            const res = await fetch('/api/test/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ testFilePath: testPath, workingDir: dir })
            });
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            runnerConsole.innerHTML = '';
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value);
                chunk.split('\n').filter(l => l.trim()).forEach(line => {
                    try {
                        const msg = JSON.parse(line);
                        const p = document.createElement('div');
                        p.className = `log-${msg.status || 'info'}`;
                        p.textContent = msg.message || msg.output || msg.error || '';
                        runnerConsole.appendChild(p);
                        runnerConsole.scrollTop = runnerConsole.scrollHeight;
                    } catch (e) {
                        runnerConsole.innerHTML += `<div class="log-info">${escapeHtml(line)}</div>`;
                    }
                });
            }
        } catch (err) {
            const p = document.createElement('div');
            p.className = 'log-error';
            p.textContent = `Error: ${err.message}`;
            runnerConsole.appendChild(p);
        } finally {
            runTestsBtn.disabled = false;
        }
    };
    runTestsBtn.onclick = runTests;

    // ══════════════════════════════════════════
    //  FILE / DIR PICKER MODAL — FULL OVERHAUL
    // ══════════════════════════════════════════
    const openPickerModal = async (startPath) => {
        pickerKeyboardIndex = -1;
        pickerCurrentItems = [];
        document.getElementById('browserSearchInput').value = '';
        updatePickerModeBadge();
        dirPickerModal.classList.remove('hidden');
        // Resolve start path: if it looks like a file path, go to its parent dir
        let navPath = startPath || '.';
        if (navPath && navPath.match(/\.[a-zA-Z]+$/)) {
            navPath = navPath.replace(/[\\\/][^\\\/]+$/, '') || '.';
        }
        await loadBrowser(navPath);
        // Add keyboard listener
        dirPickerModal.focus && dirPickerModal.focus();
    };

    const updatePickerModeBadge = () => {
        const badge = document.getElementById('pickerModeBadge');
        if (badge) {
            badge.textContent = pickerType === 'file' ? '📄 Select File' : '📁 Select Directory';
        }
    };

    window.openDirPicker = async (targetId) => {
        browserTargetInput = targetId;
        pickerType = 'dir';
        const currentVal = document.getElementById(targetId)?.value || '.';
        await openPickerModal(currentVal);
    };

    window.openFilePicker = async (targetId) => {
        browserTargetInput = targetId;
        pickerType = 'file';
        const currentVal = document.getElementById(targetId)?.value || '.';
        await openPickerModal(currentVal);
    };

    window.closeDirPicker = () => {
        dirPickerModal.classList.add('hidden');
        pickerKeyboardIndex = -1;
    };

    // Close on backdrop click
    dirPickerModal.addEventListener('click', e => { if (e.target === dirPickerModal) closeDirPicker(); });

    // Keyboard navigation for picker
    document.addEventListener('keydown', e => {
        if (dirPickerModal.classList.contains('hidden')) return;
        if (e.key === 'Escape') { closeDirPicker(); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
        if (e.key === 'ArrowUp')   { e.preventDefault(); moveFocus(-1); }
        if (e.key === 'Enter')     { e.preventDefault(); activateFocusedItem(); }
        if (e.key === 'Backspace' && document.activeElement?.id !== 'browserSearchInput') {
            e.preventDefault(); navigateBrowserUp();
        }
    });

    const moveFocus = (dir) => {
        const items = Array.from(browserItemsEl.querySelectorAll('.browser-item'));
        if (items.length === 0) return;
        items.forEach(i => i.classList.remove('keyboard-focused'));
        pickerKeyboardIndex = Math.max(0, Math.min(items.length - 1, pickerKeyboardIndex + dir));
        items[pickerKeyboardIndex].classList.add('keyboard-focused');
        items[pickerKeyboardIndex].scrollIntoView({ block: 'nearest' });
    };

    const activateFocusedItem = () => {
        const focused = browserItemsEl.querySelector('.browser-item.keyboard-focused');
        if (focused) focused.click();
        else if (pickerType === 'dir') confirmDirSelection();
    };

    window.loadBrowser = async (p) => {
        pickerKeyboardIndex = -1;
        try {
            let targetPath = p;
            // BUG 3 FIX: HOME shortcut now calls API for real home directory
            if (p === 'HOME') {
                try {
                    const homeRes = await fetch('/api/env/home');
                    const homeData = await homeRes.json();
                    targetPath = homeData.home || '.';
                } catch (_) { targetPath = '.'; }
            }

            browserItemsEl.innerHTML = '<div class="loading-state"><span class="spinner"></span></div>';
            const res = await fetch(`/api/browser/ls?path=${encodeURIComponent(targetPath)}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            currentBrowserPath = data.currentPath.replace(/\\/g, '/');

            // Update footer path label
            const pathLabel = document.getElementById('currentPathLabel');
            if (pathLabel) pathLabel.textContent = currentBrowserPath;

            // --- Breadcrumbs ---
            const breadcrumbNav = document.getElementById('browserBreadcrumbs');
            if (breadcrumbNav) {
                breadcrumbNav.innerHTML = '';
                const parts = currentBrowserPath.split(/[\/]/).filter(x => x);
                // Windows drive letter fix: ensure "C:" stays as-is
                let accumulated = '';
                parts.forEach((part, index) => {
                    if (index > 0) {
                        const sep = document.createElement('span');
                        sep.className = 'breadcrumb-separator';
                        sep.textContent = '›';
                        breadcrumbNav.appendChild(sep);
                    }
                    // Build accumulated path
                    if (index === 0) accumulated = part;
                    else accumulated += '/' + part;

                    const segment = document.createElement('span');
                    segment.className = 'breadcrumb-segment';
                    segment.textContent = part || '/';
                    const navTarget = accumulated;
                    segment.onclick = () => loadBrowser(navTarget);
                    breadcrumbNav.appendChild(segment);
                });
            }

            // Build items list
            const allItems = [
                ...data.directories.map(d => ({ name: d, type: 'dir' })),
                ...(pickerType === 'file' ? data.files.map(f => ({ name: f, type: 'file' })) : [])
            ];
            pickerCurrentItems = allItems;
            renderBrowserItems(allItems);

            // Search filter
            const searchInput = document.getElementById('browserSearchInput');
            if (searchInput) {
                searchInput.value = '';
                searchInput.oninput = (e) => {
                    const query = e.target.value.toLowerCase();
                    const filtered = allItems.filter(i => i.name.toLowerCase().includes(query));
                    pickerCurrentItems = filtered;
                    renderBrowserItems(filtered);
                    pickerKeyboardIndex = -1;
                };
            }
        } catch (e) {
            browserItemsEl.innerHTML = `<div class="error-msg" style="margin:16px">⚠️ ${escapeHtml(e.message)}</div>`;
        }
    };

    const renderBrowserItems = (items) => {
        browserItemsEl.innerHTML = '';
        pickerKeyboardIndex = -1;
        if (items.length === 0) {
            browserItemsEl.innerHTML = `<div class="browser-empty"><span class="big-icon">📂</span>No items found</div>`;
            return;
        }
        items.forEach(item => {
            const el = document.createElement('div');
            const isDir = item.type === 'dir';
            el.className = `browser-item ${isDir ? 'directory' : 'file'}`;
            el.setAttribute('role', 'button');
            el.setAttribute('tabindex', '-1');

            let icon = isDir ? '📁' : getFileIcon(item.name);
            let ext = '';
            let metaHtml = '';
            if (!isDir) {
                const rawExt = item.name.split('.').pop().toLowerCase();
                ext = `<span class="item-ext-badge ${getExtBadgeClass(item.name)}">.${rawExt}</span>`;
            } else {
                metaHtml = `<span class="item-arrow">›</span>`;
            }

            el.innerHTML = `
                <div class="item-icon">${icon}</div>
                <span class="item-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
                ${ext}
                ${metaHtml}
            `;

            el.onclick = () => {
                if (isDir) {
                    loadBrowser(currentBrowserPath + '/' + item.name);
                } else {
                    // File selected
                    const fullPath = currentBrowserPath + '/' + item.name;
                    browserItemsEl.querySelectorAll('.browser-item').forEach(i => i.classList.remove('selected-file'));
                    el.classList.add('selected-file');

                    if (browserTargetInput.startsWith('context_')) {
                        addContextFile(contextTypePending, fullPath);
                        closeDirPicker();
                    } else {
                        const input = document.getElementById(browserTargetInput);
                        if (input) {
                            input.value = fullPath;
                            input.dispatchEvent(new Event('change'));
                        }
                        closeDirPicker();
                    }
                }
            };
            browserItemsEl.appendChild(el);
        });
    };

    window.navigateBrowserUp = () => {
        const parent = currentBrowserPath.replace(/\/[^\/]+$/, '') || '/';
        loadBrowser(parent || '.');
    };

    // BUG 9 FIX: confirmDirSelection guards against context_ target
    window.confirmDirSelection = () => {
        if (!browserTargetInput || browserTargetInput.startsWith('context_')) {
            // For context pickers there is no direct input to fill — just close
            closeDirPicker();
            return;
        }
        const input = document.getElementById(browserTargetInput);
        if (input) {
            input.value = currentBrowserPath;
            input.dispatchEvent(new Event('change'));
        }
        closeDirPicker();
        if (browserTargetInput === 'projectRootPath') loadFiles();
    };

    // ══════════════════════════════════════════
    //  THEME TOGGLE
    // ══════════════════════════════════════════
    themeToggle.onclick = () => {
        const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', theme);
        themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
    };

    // ══════════════════════════════════════════
    //  MOCK ARCHITECT
    // ══════════════════════════════════════════
    const generateMockBtn = document.getElementById('generateMockBtn');
    const mockHeaderPathInput = document.getElementById('mockHeaderPath');
    const sourcePreview = document.getElementById('sourcePreview');
    const mockPreview = document.getElementById('mockPreview');
    const sourceHeaderName = document.getElementById('sourceHeaderName');

    const updateHeaderPreview = async () => {
        const filePath = mockHeaderPathInput.value;
        if (!filePath) return;
        sourceHeaderName.textContent = filePath.split(/[/\\]/).pop().toUpperCase();
        sourcePreview.textContent = 'Loading...';
        try {
            const res = await fetch(`/api/browser/view?path=${encodeURIComponent(filePath)}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            sourcePreview.textContent = data.content || 'Could not load content.';
        } catch (e) {
            sourcePreview.textContent = `Error loading file: ${e.message}`;
        }
    };

    mockHeaderPathInput.addEventListener('change', updateHeaderPreview);
    mockHeaderPathInput.addEventListener('input', updateHeaderPreview);

    if (generateMockBtn) {
        generateMockBtn.onclick = async () => {
            const filePath = mockHeaderPathInput.value;
            if (!filePath) return alert('Select a header file.');
            generateMockBtn.disabled = true;
            generateMockBtn.innerHTML = '<span class="spinner"></span> Working...';

            const workflow = document.getElementById('mockWorkflow');
            const progressContainer = document.getElementById('mockProgressContainer');
            const pBar = document.getElementById('mockProgressBar');
            // BUG 7 FIX: correct selector from .w-step to .step-item
            const steps = document.querySelectorAll('.step-item');

            workflow.classList.remove('hidden');
            progressContainer.classList.remove('hidden');
            pBar.style.width = '0%';
            steps.forEach((s, i) => { s.classList.remove('active', 'complete'); if (i === 0) s.classList.add('active'); });

            let progressInterval = setInterval(() => {
                const cw = parseFloat(pBar.style.width) || 0;
                if (cw < 90) {
                    pBar.style.width = (cw + 2) + '%';
                    const activeStep = Math.min(Math.floor(cw / 18), steps.length - 1);
                    steps.forEach((s, i) => {
                        s.classList.remove('active', 'complete');
                        if (i < activeStep) s.classList.add('complete');
                        else if (i === activeStep) s.classList.add('active');
                    });
                }
            }, 300);

            try {
                const res = await fetch('/api/generate/mock', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ headerPath: filePath, provider: aiProviderSelector.value })
                });
                const data = await res.json();
                if (data.error) throw new Error(data.error);

                mockPreview.textContent = data.code;

                const mockInsights = document.getElementById('mockInsights');
                const mockInsightsContent = document.getElementById('mockInsightsContent');
                if (mockInsights && data.thought_process) {
                    mockInsights.classList.remove('hidden');
                    let html = '';
                    if (data.thought_process) html += `<div class="insight-card"><strong>🧠 Transformation Strategy</strong><p>${escapeHtml(data.thought_process)}</p></div>`;
                    if (data.singletons?.length > 0) html += `<div class="insight-card"><strong>🦄 Singletons Detected</strong><ul>${data.singletons.map(s => `<li><code>${escapeHtml(s)}</code></li>`).join('')}</ul></div>`;
                    mockInsightsContent.innerHTML = html;
                }

                clearInterval(progressInterval);
                pBar.style.width = '100%';
                steps.forEach(s => { s.classList.remove('active'); s.classList.add('complete'); });
                setTimeout(() => { workflow.classList.add('hidden'); progressContainer.classList.add('hidden'); }, 2500);

                showReviewerModal(data.code, { refactoring_plans: data.thought_process ? [`Architectural Notes: ${data.thought_process}`] : [] });
            } catch (err) {
                clearInterval(progressInterval);
                workflow.classList.add('hidden');
                progressContainer.classList.add('hidden');
                alert(`Mock Generation Failed: ${err.message}`);
            } finally {
                generateMockBtn.disabled = false;
                generateMockBtn.innerHTML = '<span class="btn-icon">✨</span> Transform to GMock';
            }
        };
    }

    // Copy mock output (single definition — BUG 8 FIX)
    window.copyMockOutput = () => {
        const text = document.getElementById('mockPreview')?.textContent || '';
        navigator.clipboard.writeText(text);
        const copyBtn = document.querySelector('.preview-actions .copy-btn');
        if (copyBtn) {
            const old = copyBtn.textContent;
            copyBtn.textContent = '✅ Copied!';
            setTimeout(() => copyBtn.textContent = old, 2000);
        }
    };

    const downloadMockBtn = document.getElementById('downloadMockBtn');
    if (downloadMockBtn) {
        downloadMockBtn.onclick = () => {
            const code = document.getElementById('mockPreview')?.textContent || '';
            const originalPath = mockHeaderPathInput.value;
            const filename = (originalPath.split(/[/\\]/).pop().split('.')[0] || 'Mock') + 'Mock.h';
            downloadFile(filename, code);
        };
    }

    function downloadFile(filename, content) {
        const a = document.createElement('a');
        a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(content);
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    // ══════════════════════════════════════════
    //  DIAGNOSTICS
    // ══════════════════════════════════════════
    async function runDiagnostics() {
        try {
            const res = await fetch('/api/diag');
            if (res.status === 404) throw new Error('Server endpoint not found');
            const data = await res.json();
            if (data.version !== VERSION) showServerRestartOverlay(`Version mismatch (UI: ${VERSION}, Server: ${data.version})`);
            else if (!data.hasGemini && !data.hasOpenAI) showAPIKeyWarning();
            console.log(`[v${VERSION}] Server Ready:`, data);
        } catch (e) {
            showServerRestartOverlay(e.message);
        }
    }

    window.listAvailableModels = async () => {
        const output = document.getElementById('debugOutput');
        output.textContent = '🔍 Querying Google AI for available models...';
        try {
            const res = await fetch('/api/diag/models');
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            if (data.models?.length > 0) {
                const modelStrings = data.models
                    .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
                    .map(m => `✅ ${m.name.replace('models/', '')} (${m.displayName})`).join('\n');
                output.textContent = "AVAILABLE MODELS:\n" + modelStrings + "\n\n(If Gemini 3 is not listed, it is not available for this key.)";
            } else { output.textContent = 'No models returned. Check your API key permissions.'; }
        } catch (e) { output.textContent = 'Error: ' + e.message; }
    };

    function showServerRestartOverlay(reason) {
        const overlay = document.createElement('div');
        overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.88);backdrop-filter:blur(12px);z-index:99999;display:flex;align-items:center;justify-content:center;color:white;text-align:center;padding:40px";
        overlay.innerHTML = `<div><h1 style="color:var(--danger);font-size:2.5rem;margin-bottom:18px">⚠️ RESTART REQUIRED</h1><p style="font-size:1.1rem;margin-bottom:8px">Reason: <strong>${escapeHtml(reason)}</strong></p><p style="margin-bottom:28px;color:#94a3b8">Kill the Node process and run:<br><code style="display:inline-block;background:#1e293b;padding:10px 18px;border-radius:8px;margin-top:14px">npm start</code></p><button onclick="location.reload()" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;color:white;padding:14px 32px;border-radius:999px;font-size:1rem;cursor:pointer;font-weight:700">I've Restarted</button></div>`;
        document.body.appendChild(overlay);
    }

    function showAPIKeyWarning() {
        const banner = document.createElement('div');
        banner.style.cssText = "position:fixed;top:0;left:0;right:0;background:#dc2626;color:white;text-align:center;padding:10px 20px;z-index:99998;font-weight:700;font-size:0.88rem";
        banner.innerHTML = '⚠️ GEMINI_API_KEY is missing — add it to your .env file and restart.';
        document.body.appendChild(banner);
    }

    // ══════════════════════════════════════════
    //  DEBUG CONSOLE
    // ══════════════════════════════════════════
    window.toggleDebugConsole = () => {
        const drawer = document.getElementById('debugConsole');
        drawer.classList.toggle('hidden');
        if (!drawer.classList.contains('hidden')) refreshDebugLog();
    };

    window.refreshDebugLog = async () => {
        const output = document.getElementById('debugOutput');
        try {
            const res = await fetch('/api/debug');
            const data = await res.json();
            output.textContent = data.log || 'No logs found.';
            output.scrollTop = output.scrollHeight;
        } catch (e) { output.textContent = 'Error fetching logs: ' + e.message; }
    };

    window.clearDebugLog = async () => {
        if (!confirm('This will wipe all technical logs. Continue?')) return;
        try { await fetch('/api/debug/clear', { method: 'POST' }); refreshDebugLog(); }
        catch (e) { alert('Failed to clear logs: ' + e.message); }
    };

    setInterval(() => {
        const drawer = document.getElementById('debugConsole');
        if (drawer && !drawer.classList.contains('hidden')) refreshDebugLog();
    }, 5000);

    // ══════════════════════════════════════════
    //  INIT
    // ══════════════════════════════════════════
    loadFiles();
    runDiagnostics();
});
