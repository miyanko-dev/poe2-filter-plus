
(function () {
    'use strict';

    // The PoE 2 /api/trade2/fetch response no longer contains a base64 extended.text
    // (the PoE 1 shortcut). We capture the whole result entry (listing + item) and
    // build the in-game item text on demand from the structured fields below.
    const pendingEntries = [];
    const rowEntry = new WeakMap();

    const TRADE_FETCH_PATTERN = /\/api\/trade2?\/fetch\b/;

    (function installApiHooks() {
        const pushFromResponse = (data) => {
            for (const entry of data?.result ?? []) {
                if (entry?.item) pendingEntries.push(entry);
            }
            // Vue may render the rows before this fires, or it may update existing
            // row elements in place (so the MutationObserver never re-fires for them).
            // Either way, drain whatever we have into any rows still missing data.
            drainPendingIntoUnmatchedRows();
        };

        const origFetch = window.fetch;
        window.fetch = async function (input, init) {
            const url = String(typeof input === 'string' ? input : input?.url ?? input ?? '');
            const response = await origFetch.apply(this, arguments);
            // Await the parse (rather than fire-and-forget) so pendingEntries is populated
            // before the page processes the body and Vue renders the rows.
            if (TRADE_FETCH_PATTERN.test(url) && !response.bodyUsed) {
                try {
                    const text = await response.clone().text();
                    pushFromResponse(JSON.parse(text));
                } catch (e) {}
            }
            return response;
        };

        const origOpen = XMLHttpRequest.prototype.open;
        const origSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function (method, url) {
            this._poe2SuiteUrl = String(url ?? '');
            return origOpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function () {
            if (TRADE_FETCH_PATTERN.test(this._poe2SuiteUrl)) {
                this.addEventListener('load', () => {
                    try { pushFromResponse(JSON.parse(this.responseText)); } catch (e) {}
                });
            }
            return origSend.apply(this, arguments);
        };
    })();

    const FUZZY_PREFIX = '~';
    const TOAST_DURATION_MS = 3000;
    const VUE_RETRY_DELAY_MS = 200;
    const VUE_MAX_RETRIES = 100;
    const FILTER_DEBOUNCE_MS = 150;

    // The page CSP (style-src 'unsafe-inline') forbids cross-origin stylesheets, so the
    // Material Symbols webfont can't load. Inline the original glyphs as SVG instead:
    // copy = Lucide "copy"; duplicate = Material Symbols "tab_inactive" (the previous
    // icon, which matched the site). currentColor lets the existing CSS tint them.
    const COPY_ICON_SVG =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round">' +
        '<rect x="9" y="9" width="11" height="11" rx="2"/>' +
        '<path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
    const DUPLICATE_ICON_SVG =
        '<svg viewBox="0 -960 960 960" fill="currentColor"><path d="M320-80q-33 0-56.5-23.5T240-160v-80h-80q-33 0-56.5-23.5T80-320v-80h80v80h80v-320q0-33 23.5-56.5T320-720h320v-80h-80v-80h80q33 0 56.5 23.5T720-800v80h80q33 0 56.5 23.5T880-640v480q0 33-23.5 56.5T800-80H320Zm0-80h480v-480H320v480ZM80-480v-160h80v160H80Zm0-240v-80q0-33 23.5-56.5T160-880h80v80h-80v80H80Zm240-80v-80h160v80H320Zm0 640v-480 480Z"/></svg>';

    function logError(area, message, error) {
        console.error(`[PoE2 Suite - ${area}]`, message, error ?? '');
    }

    function debounce(fn, wait) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), wait);
        };
    }

    function waitForVueApp() {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const tick = () => {
                if (window.app?.$store?.state?.persistent) {
                    resolve(window.app);
                    return;
                }
                if (++attempts >= VUE_MAX_RETRIES) {
                    reject(new Error('Vue app not found'));
                    return;
                }
                setTimeout(tick, VUE_RETRY_DELAY_MS);
            };
            tick();
        });
    }

    function commitStore(type, payload) {
        const store = window.app?.$store;
        if (!store) {
            logError('Store', `Cannot commit ${type}, store unavailable`);
            return false;
        }
        try {
            store.commit(type, payload);
            return true;
        } catch (err) {
            logError('Store', `commit ${type} threw`, err);
            return false;
        }
    }

    // Add an "And" stat group from [{ id, value }] entries. The store's setStatFilter
    // mutation, called WITHOUT an index, does `stats[group].filters.push(value)` — the
    // exact path Import's working mode uses, which binds the value inputs. (Passing the
    // filters inline to pushStatGroup stores them but the form doesn't bind their values
    // reliably.) So: push an empty group — `filters: []` creates zero rows — then append
    // each filter via no-index setStatFilter.
    function addAndStatGroup(entries) {
        if (entries.length === 0) return 0;
        const groupIndex = window.app?.$store?.state?.persistent?.stats?.length ?? 0;
        if (!commitStore('pushStatGroup', { type: 'and', filters: [] })) return 0;

        let added = 0;
        for (const entry of entries) {
            if (commitStore('setStatFilter', {
                group: groupIndex,
                value: { id: entry.id, value: entry.value },
            })) added++;
        }
        return added;
    }

    function injectStyles() {
        if (document.getElementById('poe2-suite-styles')) return;

        const toastBg = 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAADsSURBVEhLY2AYBfQMgf///3P8+/evAIgvA/FsIF+BavYDDWMBGroaSMMBiE8VC7AZDrIFaMFnii3AZTjUgsUUWUDA8OdAH6iQbQEhw4HyGsPEcKBXBIC4ARhex4G4BsjmweU1soIFaGg/WtoFZRIZdEvIMhxkCCjXIVsATV6gFGACs4Rsw0EGgIIH3QJYJgHSARQZDrWAB+jawzgs+Q2UO49D7jnRSRGoEFRILcdmEMWGI0cm0JJ2QpYA1RDvcmzJEWhABhD/pqrL0S0CWuABKgnRki9lLseS7g2AlqwHWQSKH4oKLrILpRGhEQCw2LiRUIa4lwAAAABJRU5ErkJggg==)';

        const style = document.createElement('style');
        style.id = 'poe2-suite-styles';
        style.textContent = `
            .poe2-copy-btn {
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                cursor: pointer !important;
                background: transparent !important;
                border: none !important;
                padding: 4px !important;
                opacity: 0 !important;
            }
            div.row:hover .poe2-copy-btn { opacity: 1 !important; }
            .poe2-copy-icon {
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                color: #fff !important;
            }
            .poe2-copy-icon svg {
                width: 20px !important;
                height: 20px !important;
                display: block !important;
            }
            .poe2-duplicate-btn {
                display: inline-block !important;
                position: relative !important;
                text-align: center !important;
                vertical-align: middle !important;
            }
            .poe2-duplicate-btn.edit-btn::after {
                content: "" !important;
                display: none !important;
            }
            .poe2-duplicate-icon {
                width: 18px !important;
                height: 18px !important;
                color: #fff !important;
                position: absolute !important;
                top: 50% !important;
                left: 50% !important;
                transform: translate(-50%, -50%) !important;
            }
            .poe2-duplicate-icon svg {
                width: 18px !important;
                height: 18px !important;
                display: block !important;
            }
            .poe2-toast {
                position: fixed;
                bottom: 80px;
                left: 50%;
                width: 300px;
                margin: 0;
                padding: 14px 14px 14px 48px;
                font-family: Verdana, Arial, Helvetica, sans-serif;
                font-size: 14px;
                line-height: 1.3;
                color: #fff;
                background-color: #1e2124;
                background-image: ${toastBg};
                background-position: 15px center;
                background-repeat: no-repeat;
                border-radius: 4px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
                opacity: 0;
                pointer-events: auto;
                z-index: 999999;
                transform: translateX(-50%) translateY(20px);
                transition: opacity 0.3s ease, transform 0.3s ease;
                box-sizing: border-box;
            }
            .poe2-toast.visible {
                opacity: 0.9;
                transform: translateX(-50%) translateY(0);
            }
            .poe-import-btn {
                display: inline-block;
                margin: 0 5px 0 0;
                padding: 6px;
                min-height: 34px;
                font-family: inherit;
                font-size: 13px;
                line-height: 16px;
                color: #e2e2e2;
                background-color: #1e2124;
                border: 1px solid #000;
                border-radius: 0;
                cursor: pointer;
                user-select: none;
                white-space: nowrap;
                vertical-align: middle;
            }
            .poe-import-btn:hover { background-color: #2a2e32; }
            .poe-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 99999;
            }
            .poe-modal-content {
                display: flex;
                flex-direction: column;
                gap: 12px;
                width: 420px;
                padding: 20px;
                color: #e2e2e2;
                background: #1e2124;
                border: 1px solid #444;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
                font-family: inherit;
                font-size: 13px;
                line-height: 1.3;
            }
            .poe-modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 5px;
            }
            .poe-modal-header h2 {
                margin: 0;
                color: #fff;
                font-family: inherit;
                font-size: 16px;
                font-weight: 400;
            }
            .poe-close-btn {
                background: none;
                border: none;
                color: #888;
                font-family: inherit;
                font-size: 20px;
                cursor: pointer;
            }
            .poe-close-btn:hover { color: #fff; }
            .poe-textarea {
                width: 100%;
                min-height: 400px;
                padding: 8px;
                color: #e2e2e2;
                background: #0c0c0c;
                border: 1px solid #444;
                font-family: inherit;
                font-size: 13px;
                line-height: 1.4;
                resize: none;
                overflow: hidden;
                box-sizing: border-box;
            }
            .poe-textarea::placeholder {
                color: #888;
                font-family: inherit;
                font-size: 13px;
            }
            .poe-toggle-group {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 0;
                border-bottom: 1px solid #333;
            }
            .poe-toggle-group:last-of-type { border-bottom: none; }
            .poe-toggle-label {
                color: #e2e2e2;
                font-family: inherit;
                font-size: 13px;
            }
            .poe-toggle {
                position: relative;
                width: 44px;
                height: 22px;
            }
            .poe-toggle input {
                opacity: 0;
                width: 0;
                height: 0;
            }
            .poe-toggle-slider {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                cursor: pointer;
                background-color: #444;
                border-radius: 22px;
                transition: 0.3s;
            }
            .poe-toggle-slider:before {
                content: "";
                position: absolute;
                left: 3px;
                bottom: 3px;
                width: 16px;
                height: 16px;
                background-color: #888;
                border-radius: 50%;
                transition: 0.3s;
            }
            .poe-toggle input:checked + .poe-toggle-slider { background-color: #1a4a7a; }
            .poe-toggle input:checked + .poe-toggle-slider:before {
                background-color: #8ab4f8;
                transform: translateX(22px);
            }
            .poe-actions {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                margin-top: 10px;
            }
            .poe-btn {
                display: inline-block;
                padding: 6px 12px;
                min-height: 34px;
                font-family: Verdana, Arial, Helvetica, sans-serif;
                font-size: 13px;
                line-height: 16px;
                color: #e2e2e2;
                border: 1px solid #000;
                border-radius: 0;
                cursor: pointer;
                user-select: none;
                white-space: nowrap;
            }
            .poe-btn-cancel {
                min-width: 96px;
                background-color: #5a2020;
                border-color: #8a3030;
            }
            .poe-btn-cancel:hover { background-color: #6a2828; }
            .poe-btn-submit {
                min-width: 128px;
                background-color: #0f304d;
                border-color: #4c4c7d;
            }
            .poe-btn-submit:hover { background-color: #133d62; }
        `;
        document.head.appendChild(style);
    }

    let toastTimer = null;

    function showToast(message) {
        let toast = document.querySelector('.poe2-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'poe2-toast';
            document.body.appendChild(toast);
        }

        toast.textContent = message;

        // Force reflow so the transition replays on rapid repeats.
        toast.classList.remove('visible');
        void toast.offsetWidth;
        toast.classList.add('visible');

        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('visible'), TOAST_DURATION_MS);
    }

    function attachFuzzyPrefix() {
        const handle = (event) => {
            const target = event.target;
            if (!target.classList?.contains('multiselect__input')) return;
            if (target.selectionStart !== target.selectionEnd) return;

            const value = target.value;
            if (value.startsWith(FUZZY_PREFIX) || value.startsWith(' ') || event.key === ' ') return;

            target.value = FUZZY_PREFIX + value;
        };

        document.body.addEventListener('keydown', handle);
        document.body.addEventListener('paste', (event) => setTimeout(() => handle(event), 0));
    }

    const processedRows = new WeakSet();

    function attachCopyButtons() {
        scanCopyButtons();

        new MutationObserver((mutations) => {
            let rowRemoved = false;
            for (const mutation of mutations) {
                for (const node of mutation.removedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE &&
                        (node.matches?.('div.row') || node.querySelector?.('div.row'))) {
                        rowRemoved = true;
                    }
                }
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) continue;
                    // Vue sometimes inserts the resultset container with rows already
                    // nested inside. Match the added node itself or any descendant row.
                    const rows = node.matches?.('div.row')
                        ? [node]
                        : Array.from(node.querySelectorAll?.('div.row') || []);
                    for (const row of rows) {
                        if (row.querySelector('div.itemHeader')) processRow(row);
                    }
                }
            }
            if (rowRemoved && !document.querySelector('div.row')) {
                pendingEntries.length = 0;
            }
        }).observe(document.body, { childList: true, subtree: true });
    }

    function scanCopyButtons() {
        document.querySelectorAll('div.row').forEach((row) => {
            if (row.querySelector('div.itemHeader')) processRow(row);
        });
    }

    function processRow(row) {
        if (processedRows.has(row)) return;
        installCopyButton(row);
        enhanceSearchByButton(row);
        // Distribute any pending entries to rows that still lack one (including this row).
        drainPendingIntoUnmatchedRows();
    }

    const enhancedSearchRows = new WeakSet();

    function enhanceSearchByButton(row) {
        if (enhancedSearchRows.has(row)) return;
        const native = row.querySelector('button.searchBy');
        if (!native) return;
        enhancedSearchRows.add(row);

        // Capture-phase listener fires before Vue's bubble-phase @click binding on the
        // same element. stopImmediatePropagation prevents the native handler from running,
        // so we replace its behaviour without touching the DOM (no clone, no replaceWith).
        native.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            try {
                filterByRowStats(row);
            } catch (err) {
                logError('Filter', 'filterByRowStats threw', err);
                showToast('Filter failed — see console.');
            }
        }, true);
    }

    function filterByRowStats(row) {
        drainPendingIntoUnmatchedRows();
        const entry = rowEntry.get(row) || findEntryViaVue(row) || findEntryViaStore(row);
        const hashes = entry?.item?.extended?.hashes?.explicit;
        const displayMods = entry?.item?.explicitMods;

        if (!hashes?.length || !displayMods?.length) {
            showToast('No explicit stats available to filter.');
            return;
        }

        const entries = [];
        for (let i = 0; i < hashes.length; i++) {
            const id = hashes[i]?.[0];
            if (!id) continue;
            entries.push({ id, value: { min: extractMinFromMod(displayMods[i] || '') } });
        }

        if (entries.length === 0) {
            showToast('No stat filters extracted.');
            return;
        }

        const added = addAndStatGroup(entries);

        // TEMP diagnostic — reveals whether values reach the store (binding issue) or not
        // (extraction issue). Remove once value population is confirmed working.
        try {
            const allStats = window.app?.$store?.state?.persistent?.stats;
            console.log('[PoE2 Suite - SearchSimilar] DIAG',
                '\n  hashes[0..2] =', JSON.stringify(hashes.slice(0, 3)),
                '\n  mods[0..2]   =', JSON.stringify(displayMods.slice(0, 3)),
                '\n  entries      =', JSON.stringify(entries),
                '\n  storedGroup  =', JSON.stringify(allStats?.[allStats.length - 1]));
        } catch (err) {
            console.log('[PoE2 Suite - SearchSimilar] DIAG error', err);
        }

        if (added) showToast(`Added ${added} stat filter${added === 1 ? '' : 's'} with min values.`);
    }

    function extractMinFromMod(text) {
        const cleaned = cleanItemText(text);
        // "X to Y" range → average (e.g. "Adds 5 to 9 Fire Damage" → 7).
        const range = cleaned.match(/([+-]?\d+(?:\.\d+)?)\s+to\s+([+-]?\d+(?:\.\d+)?)/);
        if (range) return Math.floor((parseFloat(range[1]) + parseFloat(range[2])) / 2);
        // Otherwise take the first signed numeric value.
        const first = cleaned.match(/([+-]?\d+(?:\.\d+)?)/);
        return first ? parseFloat(first[1]) : null;
    }

    function drainPendingIntoUnmatchedRows() {
        if (pendingEntries.length === 0) return;
        const rows = document.querySelectorAll('div.row');
        for (const row of rows) {
            if (pendingEntries.length === 0) break;
            if (rowEntry.has(row)) continue;
            if (!row.querySelector('div.itemHeader')) continue;
            rowEntry.set(row, pendingEntries.shift());
        }
    }

    function installCopyButton(row) {
        if (processedRows.has(row)) return;
        if (row.querySelector('.poe2-copy-btn')) return;

        // Anchor next to the native "search similar" button (the magnifier in the item
        // card's bottom-left controls) rather than a fixed div.left child slot, which no
        // longer holds on the current trade form. The searchBy button is always present.
        const searchBtn = row.querySelector('button.searchBy');
        if (!searchBtn || !searchBtn.parentNode) return;

        const button = document.createElement('button');
        button.className = 'poe2-copy-btn copy';
        button.title = 'Copy Item Stats';

        const icon = document.createElement('span');
        icon.className = 'poe2-copy-icon';
        icon.innerHTML = COPY_ICON_SVG;
        button.appendChild(icon);

        button.addEventListener('click', () => copyRowToClipboard(row));
        searchBtn.parentNode.insertBefore(button, searchBtn);
        processedRows.add(row);
    }

    function copyRowToClipboard(row) {
        // Last-chance drain in case pushFromResponse fired before this row was rendered.
        drainPendingIntoUnmatchedRows();

        // Try every source in order of preference:
        //   1. fetch/XHR capture (lost when bodyUsed or to upstream userscripts)
        //   2. Vue 2 component instance via el.__vue__
        //   3. Vue 3 component instance via el.__vueParentComponent
        //   4. Vuex store walk, matched to the row by DOM index
        let entry = rowEntry.get(row)
            || findEntryViaVue(row)
            || findEntryViaStore(row);

        if (!entry?.item) {
            logError('Copy', 'No cached entry for row');
            showToast('Could not read item data.');
            return;
        }

        rowEntry.set(row, entry);

        const text = buildItemText(entry);
        if (!text) {
            showToast('Could not build item text.');
            return;
        }

        navigator.clipboard.writeText(text)
            .then(() => showToast('Item stats copied to clipboard.'))
            .catch((err) => logError('Copy', 'Clipboard write failed', err));
    }

    function findEntryViaVue(row) {
        let el = row;
        let depth = 0;
        while (el && el !== document.body && depth++ < 12) {
            if (el.__vue__) {
                const found = searchVue2(el.__vue__);
                if (found) return found;
            }
            if (el.__vueParentComponent) {
                const found = searchVue3(el.__vueParentComponent);
                if (found) return found;
            }
            el = el.parentElement;
        }
        return null;
    }

    function searchVue2(vm) {
        if (!vm) return null;
        for (const obj of [vm, vm.$data, vm.$props]) {
            if (!obj) continue;
            for (const key of Object.keys(obj)) {
                if (key.startsWith('$') || key.startsWith('_')) continue;
                if (isTradeEntry(obj[key])) return obj[key];
            }
        }
        return null;
    }

    function searchVue3(vm) {
        if (!vm) return null;
        for (const obj of [vm.proxy, vm.props, vm.setupState, vm.data, vm.ctx]) {
            if (!obj) continue;
            for (const key of Object.keys(obj)) {
                if (key.startsWith('$') || key.startsWith('_')) continue;
                if (isTradeEntry(obj[key])) return obj[key];
            }
        }
        return null;
    }

    function findEntryViaStore(row) {
        const sources = [window.app?.$store?.state, window.app?.$data, window.app];
        for (const source of sources) {
            const results = findResultArray(source);
            if (!results) continue;
            const itemRows = Array.from(document.querySelectorAll('div.row'))
                .filter((r) => r.querySelector('div.itemHeader'));
            const index = itemRows.indexOf(row);
            if (index >= 0 && index < results.length && isTradeEntry(results[index])) {
                return results[index];
            }
        }
        return null;
    }

    function findResultArray(obj, depth = 0, seen = new WeakSet()) {
        if (!obj || typeof obj !== 'object' || depth > 4 || seen.has(obj)) return null;
        seen.add(obj);
        if (Array.isArray(obj)) {
            return obj.length > 0 && isTradeEntry(obj[0]) ? obj : null;
        }
        for (const key of Object.keys(obj)) {
            try {
                const found = findResultArray(obj[key], depth + 1, seen);
                if (found) return found;
            } catch (e) {}
        }
        return null;
    }

    function isTradeEntry(v) {
        return !!(v && typeof v === 'object' && v.item && v.item.typeLine);
    }

    const SECTION_SEPARATOR = '\n--------\n';

    // PoE 2 0.5.0+ advanced item description format. Section order follows the
    // synthesized grammar: nameplate → properties → requires → sockets → ilvl →
    // enchant → rune → implicit → granted skills → explicit (advanced brace
    // headers when extended mod metadata is available) → terminal flags → note.
    function buildItemText(entry) {
        const item = entry?.item;
        if (!item) return null;

        const sections = [];

        const header = [];
        const itemClass = getItemClass(item);
        if (itemClass) header.push(`Item Class: ${itemClass}`);
        header.push(`Rarity: ${item.rarity || 'Normal'}`);
        if (item.name) header.push(item.name);
        if (item.typeLine && item.typeLine !== item.name) header.push(item.typeLine);
        sections.push(header);

        // Skip property[0] — it's the item-class label, already in the header.
        const propLines = (item.properties || []).slice(1).map(formatProperty).filter(Boolean);
        if (propLines.length) sections.push(propLines);

        const requiresLine = formatRequires(item.requirements);
        if (requiresLine) sections.push([requiresLine]);

        const socketsLine = formatSockets(item);
        if (socketsLine) sections.push([socketsLine]);

        if (item.ilvl) sections.push([`Item Level: ${item.ilvl}`]);

        pushTaggedSection(sections, item.enchantMods, ' (enchant)');
        pushTaggedSection(sections, item.runeMods, ' (rune)');
        pushTaggedSection(sections, item.implicitMods, ' (implicit)');

        if (item.grantedSkills?.length) {
            const lines = item.grantedSkills.map(formatProperty).filter(Boolean);
            if (lines.length) sections.push(lines);
        }

        const explicitSection = buildExplicitSection(item);
        if (explicitSection) sections.push(explicitSection);

        pushTaggedSection(sections, item.craftedMods, ' (crafted)');
        pushTaggedSection(sections, item.fracturedMods, ' (fractured)');
        pushTaggedSection(sections, item.desecratedMods, ' (desecrated)');

        if (item.corrupted) sections.push(['Corrupted']);
        if (item.note) sections.push([`Note: ${item.note}`]);

        return sections.map((lines) => lines.join('\n')).join(SECTION_SEPARATOR);
    }

    function pushTaggedSection(sections, mods, suffix) {
        if (!mods?.length) return;
        sections.push(mods.map((mod) => `${cleanItemText(mod)}${suffix}`));
    }

    function formatRequires(requirements) {
        if (!requirements?.length) return null;
        const parts = [];
        for (const req of requirements) {
            const name = cleanItemText(req.name || '');
            const value = req.values?.[0]?.[0];
            if (!name && value === undefined) continue;
            if (name === 'Level') parts.push(`Level ${value}`);
            else if (req.displayMode === 1) parts.push(`${value} ${name}`);
            else parts.push(name ? `${name} ${value}` : String(value));
        }
        return parts.length ? `Requires: ${parts.join(', ')}` : null;
    }

    function formatSockets(item) {
        const sockets = item.sockets;
        if (!sockets?.length) return null;
        // Group consecutive sockets that share a `group` index into linked clusters.
        const groups = [];
        for (const s of sockets) {
            const idx = s.group ?? 0;
            if (!groups[idx]) groups[idx] = [];
            groups[idx].push(socketLetter(s));
        }
        const formatted = groups.filter(Boolean).map((g) => g.join('-')).join(' ');
        return formatted ? `Sockets: ${formatted}` : null;
    }

    function socketLetter(s) {
        // PoE 2 sockets are typed (gem, rune, ...); fall back to a generic 'S' for unknowns.
        if (s.type === 'rune') return 'R';
        if (s.type === 'gem') return 'S';
        return s.sColour?.toUpperCase() || 'S';
    }

    function buildExplicitSection(item) {
        const displayMods = item.explicitMods;
        if (!displayMods?.length) return null;

        const modDefs = item.extended?.mods?.explicit;
        const hashEntries = item.extended?.hashes?.explicit;

        // Fall back to plain lines when we lack the metadata for advanced headers.
        if (!Array.isArray(modDefs) || !Array.isArray(hashEntries)
            || hashEntries.length !== displayMods.length) {
            return displayMods.map(cleanItemText);
        }

        const lines = [];
        const headed = new Set();
        for (let i = 0; i < displayMods.length; i++) {
            const indices = hashEntries[i]?.[1] || [];
            for (const modIdx of indices) {
                if (headed.has(modIdx)) continue;
                headed.add(modIdx);
                const header = formatModHeader(modDefs[modIdx]);
                if (header) lines.push(header);
            }
            lines.push(cleanItemText(displayMods[i]));
        }
        return lines;
    }

    function formatModHeader(mod) {
        if (!mod) return null;
        const tier = mod.tier || '';
        const kind = tier.startsWith('P') ? 'Prefix Modifier'
            : tier.startsWith('S') ? 'Suffix Modifier'
            : 'Modifier';
        const tierNum = tier.match(/\d+/)?.[0];
        let header = `{ ${kind}`;
        if (mod.name) header += ` "${mod.name}"`;
        if (tierNum) header += ` (Tier: ${tierNum})`;
        return `${header} }`;
    }

    function formatProperty(prop) {
        const name = cleanItemText(prop.name || '');
        if (!prop.values?.length) return name;

        // displayMode 3: template with {n} placeholders, e.g. "Recovers {0} Mana over {1} Seconds".
        if (prop.displayMode === 3 && /\{\d+\}/.test(name)) {
            return prop.values.reduce((acc, v, i) => acc.replace(`{${i}}`, formatValue(v)), name);
        }

        const values = prop.values.map(formatValue).join(', ');
        // displayMode 1 puts the value before the label, e.g. "80 Dex".
        if (prop.displayMode === 1) return name ? `${values} ${name}` : values;
        return name ? `${name}: ${values}` : values;
    }

    function formatValue(v) {
        return v[1] === 1 ? `${v[0]} (augmented)` : String(v[0]);
    }

    function cleanItemText(text) {
        // Strip [Tag|Display] → "Display" and bare [Tag] → "Tag" markup.
        return String(text || '')
            .replace(/\[([^\]|]+)\|([^\]]+)\]/g, '$2')
            .replace(/\[([^\]]+)\]/g, '$1');
    }

    function getItemClass(item) {
        if (item.frameType === 4) return 'Skill Gems';
        const firstProp = item.properties?.[0]?.name;
        if (!firstProp) return null;
        const singular = cleanItemText(firstProp);
        if (singular === 'Quarterstaff') return 'Quarterstaves';
        return `${singular}s`;
    }

    const STAT_GROUP_NAMES = new Set(['And', 'Not', 'If', 'Count']);

    function attachDuplicateButtons() {
        refreshDuplicateButtons();

        const refresh = debounce(refreshDuplicateButtons, FILTER_DEBOUNCE_MS);

        new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.target.classList?.contains('filter-group')) {
                    refresh();
                    return;
                }
                if (mutation.type === 'childList') {
                    for (const list of [mutation.addedNodes, mutation.removedNodes]) {
                        for (const node of list) {
                            if (isFilterGroupNode(node)) {
                                refresh();
                                return;
                            }
                        }
                    }
                }
            }
        }).observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class'],
        });
    }

    function isFilterGroupNode(node) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
        return (
            node.classList?.contains('filter-group') ||
            node.classList?.contains('edit-btn') ||
            !!node.querySelector?.('.filter-group')
        );
    }

    function refreshDuplicateButtons() {
        findStatGroups().forEach(installDuplicateButton);
    }

    function findStatGroups() {
        const groups = [];
        document.querySelectorAll('.filter-group.expanded').forEach((element) => {
            const titleEl = element.querySelector('.filter-title-clickable, .filter-title');
            const editButton = element.querySelector('.edit-btn:not(.poe2-duplicate-btn)');
            if (!titleEl || !editButton) return;

            const title = extractGroupTitle(titleEl);
            if (!isStatGroup(title)) return;

            groups.push({ element, title, editButton });
        });
        return groups;
    }

    function extractGroupTitle(titleEl) {
        const textNode = Array.from(titleEl.childNodes)
            .find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());

        if (textNode) return cleanGroupTitle(textNode.textContent.trim());

        let text = titleEl.textContent.trim();
        const period = text.indexOf('.');
        const newline = text.indexOf('\n');
        if (period > 0 && (newline === -1 || period < newline)) text = text.slice(0, period).trim();
        else if (newline > 0) text = text.slice(0, newline).trim();

        return cleanGroupTitle(text);
    }

    function cleanGroupTitle(text) {
        if (text.includes('Count each stat')) return 'Count';
        return text;
    }

    function isStatGroup(title) {
        if (title.includes('Stat Filters') || title.includes('Weighted Sum')) return true;
        return STAT_GROUP_NAMES.has(title);
    }

    function installDuplicateButton(group) {
        if (group.element.querySelector('.poe2-duplicate-btn')) return;

        const button = document.createElement('button');
        group.editButton.classList.forEach((cls) => button.classList.add(cls));
        button.classList.add('poe2-duplicate-btn');
        button.title = 'Duplicate Filter Group';

        const icon = document.createElement('span');
        icon.className = 'poe2-duplicate-icon';
        icon.innerHTML = DUPLICATE_ICON_SVG;
        button.appendChild(icon);

        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            duplicateStatGroup(group);
        });

        const container = group.editButton.parentNode;
        const nextSibling = group.editButton.nextSibling;
        if (nextSibling) container.insertBefore(button, nextSibling);
        else container.appendChild(button);
    }

    function duplicateStatGroup(group) {
        const stats = window.app?.$store?.state?.persistent?.stats;
        if (!Array.isArray(stats)) {
            logError('Duplicator', 'Vue store stats unavailable');
            return;
        }

        const groups = findStatGroups();
        const index = groups.findIndex((g) => g.element === group.element);
        if (index === -1 || index >= stats.length) {
            logError('Duplicator', `Group index out of range (${index} / ${stats.length})`);
            return;
        }

        try {
            const clone = JSON.parse(JSON.stringify(stats[index]));
            if (!clone.filters) clone.filters = [];

            commitStore('pushStatGroup', clone);
            // Install the new group's duplicate icon on the next Vue tick — right after
            // the DOM updates — instead of after a fixed delay, so it appears instantly.
            if (window.app?.$nextTick) window.app.$nextTick(refreshDuplicateButtons);
            else refreshDuplicateButtons();
        } catch (error) {
            logError('Duplicator', 'Failed to duplicate group', error);
        }
    }

    let statsMap = null;
    let itemClassMap = null;

    function buildLookupMaps() {
        const staticData = window.app?.$data?.static_;
        if (!staticData) return false;

        statsMap = {};
        statsMapLower = null;
        const addKey = (key, id) => {
            if (!key) return;
            if (!statsMap[key]) statsMap[key] = [];
            if (!statsMap[key].includes(id)) statsMap[key].push(id);
        };
        (staticData.knownStats || []).forEach((category) => {
            (category.entries || []).forEach((stat) => {
                // Index both the raw text and a markup-stripped copy. PoE 2's stat
                // texts often contain "[Tag|Display]" wikilinks (e.g.
                // "#% reduced [Attributes|Attribute] Requirements"); our humanText
                // is always stripped, so we need the stripped form as a key too.
                addKey(stat.text, stat.id);
                addKey(cleanItemText(stat.text), stat.id);
            });
        });

        const typeFilters = (staticData.propertyFilters || []).find((f) => f.id === 'type_filters')?.filters;
        const options = typeFilters?.[0]?.option?.options || [];
        itemClassMap = options.reduce((map, entry) => {
            map[entry.text] = entry.id;
            return map;
        }, {});

        return true;
    }

    let statsMapLower = null;

    function resolveStatId(humanText) {
        if (!statsMap) return null;
        if (statsMap[humanText]) return statsMap[humanText][0];

        // PoE's stat text is inconsistent about a leading "+": "+# to maximum Life"
        // but "#% increased Movement Speed". Try the opposite-sign variant.
        const flipped = humanText.startsWith('+') ? humanText.slice(1) : `+${humanText}`;
        if (statsMap[flipped]) return statsMap[flipped][0];

        // Regional disambiguation suffixes.
        for (const region of ['Local', 'Global', 'Jewel']) {
            for (const base of [humanText, flipped]) {
                const regional = `${base} (${region})`;
                if (statsMap[regional]) return statsMap[regional][0];
            }
        }

        // Case-insensitive last resort — helps when users hand-type the item text.
        if (!statsMapLower) {
            statsMapLower = {};
            for (const key of Object.keys(statsMap)) statsMapLower[key.toLowerCase()] = statsMap[key];
        }
        const ciHit = statsMapLower[humanText.toLowerCase()] || statsMapLower[flipped.toLowerCase()];
        if (ciHit) return ciHit[0];

        return null;
    }

    function attachImportButton() {
        scanImportButtons();
        new MutationObserver(scanImportButtons).observe(document.body, { childList: true, subtree: true });
    }

    function scanImportButtons() {
        document.querySelectorAll('.controls-right').forEach((controls) => {
            if (controls.querySelector('.poe-import-btn')) return;
            const clearBtn = controls.querySelector('.clear-btn');
            if (!clearBtn) return;

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn poe-import-btn';
            button.innerHTML = '<span>Import Item</span>';
            button.addEventListener('click', (event) => {
                event.preventDefault();
                openImportModal();
            });
            controls.insertBefore(button, clearBtn);
        });
    }

    function openImportModal() {
        if (document.getElementById('poe-import-modal')) return;

        const overlay = document.createElement('div');
        overlay.id = 'poe-import-modal';
        overlay.className = 'poe-modal-overlay';
        overlay.innerHTML = `
            <div class="poe-modal-content">
                <div class="poe-modal-header">
                    <h2>Import Item Stats</h2>
                    <button class="poe-close-btn" id="poe-close">&times;</button>
                </div>
                <textarea id="poe-item-text" class="poe-textarea" placeholder="Paste the advanced item description here (Ctrl+C in-game, PoE 2 0.5.0+)."></textarea>
                <div class="poe-toggle-group">
                    <span class="poe-toggle-label">Allow 20% Deviation</span>
                    <label class="poe-toggle">
                        <input type="checkbox" id="poe-deviation">
                        <span class="poe-toggle-slider"></span>
                    </label>
                </div>
                <div class="poe-toggle-group">
                    <span class="poe-toggle-label">Clear Existing Filters</span>
                    <label class="poe-toggle">
                        <input type="checkbox" id="poe-clear" checked>
                        <span class="poe-toggle-slider"></span>
                    </label>
                </div>
                <div class="poe-actions">
                    <button class="poe-btn poe-btn-cancel" id="poe-cancel">Cancel</button>
                    <button class="poe-btn poe-btn-submit" id="poe-submit">Import Item Filter</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.querySelector('#poe-close').onclick = close;
        overlay.querySelector('#poe-cancel').onclick = close;
        overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });

        const textarea = overlay.querySelector('#poe-item-text');
        const resize = () => {
            textarea.style.height = 'auto';
            textarea.style.height = `${Math.max(400, textarea.scrollHeight)}px`;
        };
        textarea.addEventListener('input', resize);
        textarea.addEventListener('paste', () => setTimeout(resize, 0));

        const deviationInput = overlay.querySelector('#poe-deviation');
        const clearInput = overlay.querySelector('#poe-clear');

        const savedDeviation = localStorage.getItem('poe_import_deviation');
        const savedClear = localStorage.getItem('poe_import_clear');
        if (savedDeviation !== null) deviationInput.checked = savedDeviation === 'true';
        if (savedClear !== null) clearInput.checked = savedClear === 'true';

        overlay.querySelector('#poe-submit').onclick = () => {
            const text = textarea.value.trim();
            const deviation = deviationInput.checked;
            const clearFirst = clearInput.checked;

            localStorage.setItem('poe_import_deviation', deviation);
            localStorage.setItem('poe_import_clear', clearFirst);

            if (!text) {
                showToast('Please paste item text.');
                return;
            }

            try {
                const { committed, skipped } = importItemText(text, deviation, clearFirst);
                close();
                if (committed === 0) {
                    showToast(skipped > 0
                        ? `No stats matched (${skipped} unrecognized) — see console.`
                        : 'No stat filters found to import.');
                } else if (skipped > 0) {
                    showToast(`Imported ${committed} stat${committed === 1 ? '' : 's'}; ${skipped} unrecognized — see console.`);
                } else {
                    showToast(`Imported ${committed} stat filter${committed === 1 ? '' : 's'} successfully.`);
                }
            } catch (error) {
                logError('Import', 'Failed to import item', error);
                showToast(error.message || 'Error parsing item.');
            }
        };
    }

    const MOD_TAG_PATTERN = /\((enchant|implicit|fractured|rune|desecrated|corrupted|crafted)\)\s*$/i;
    const AFFIX_TIER_PATTERN = /^\{.*\}$/;

    function importItemText(fullText, applyDeviation, clearFirst) {
        if (!statsMap || !itemClassMap) buildLookupMaps();

        const lines = fullText.split('\n');

        if (!lines[0]?.trim().startsWith('Item Class:')) {
            throw new Error('Paste the advanced item description (must start with "Item Class:").');
        }

        const itemClass = parseItemClass(lines[0].trim());

        const statLines = lines.slice(1).filter((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed === '--------') return false;
            if (trimmed.includes(':')) return false;
            if (MOD_TAG_PATTERN.test(trimmed)) return false;
            if (AFFIX_TIER_PATTERN.test(trimmed)) return false;
            return true;
        });

        const parsed = statLines
            .map((line) => parseStatLine(line.replace(/\s*\(augmented\)\s*$/i, '').trim()))
            .filter(Boolean);
        const finalStats = parsed.map((stat) => ({
            humanText: stat.humanText,
            min: applyDeviation && stat.min !== null ? Math.floor(stat.min * 0.8) : stat.min,
        }));

        const unresolved = [];

        const resolveOrFlip = (humanText, min) => {
            const id = resolveStatId(humanText);
            if (id) return { id, value: { min } };
            // PoE trade often has only the "increased X" stat; a "reduced X" item
            // value of N is just −N on that same stat. Filter as max = −N.
            if (/\breduced\b/i.test(humanText)) {
                const flipped = humanText.replace(/\breduced\b/i, 'increased');
                const altId = resolveStatId(flipped);
                if (altId) return { id: altId, value: { max: min !== null ? -min : null } };
            }
            return null;
        };

        let committed = 0;
        if (clearFirst) {
            commitStore('clearSearchForm');
            finalStats.forEach((stat) => {
                const resolved = resolveOrFlip(stat.humanText, stat.min);
                if (!resolved) { unresolved.push(stat.humanText); return; }
                if (commitStore('setStatFilter', {
                    group: 0,
                    value: { id: resolved.id, value: resolved.value },
                })) committed++;
            });
        } else {
            const entries = [];
            finalStats.forEach((stat) => {
                const resolved = resolveOrFlip(stat.humanText, stat.min);
                if (resolved) entries.push(resolved);
                else unresolved.push(stat.humanText);
            });
            committed = addAndStatGroup(entries);
        }

        if (unresolved.length) {
            console.warn('[PoE2 Suite - Import] Could not resolve these stat texts:', unresolved);
            // For each miss, show statsMap keys that contain the longest content word
            // so we can see what PoE actually calls the stat.
            for (const text of unresolved) {
                const words = text.match(/[A-Za-z]{4,}/g) || [];
                const probe = words.sort((a, b) => b.length - a.length)[0];
                if (!probe) continue;
                const needle = probe.toLowerCase();
                const candidates = Object.keys(statsMap || {})
                    .filter((k) => k.toLowerCase().includes(needle))
                    .slice(0, 12);
                console.warn(`  • "${text}" — statsMap keys containing "${probe}":`,
                    candidates.length ? candidates : '(none)');
            }
        }

        if (itemClass && itemClassMap?.[itemClass]) {
            commitStore('setPropertyFilter', {
                group: 'type_filters',
                index: 'category',
                value: { option: itemClassMap[itemClass] },
            });
        }

        return { committed, skipped: unresolved.length };
    }

    function parseItemClass(headerLine) {
        if (!headerLine?.startsWith('Item Class:')) return null;
        let itemClass = headerLine.replace('Item Class:', '').trim();
        if (itemClass === 'Quarterstaves') return 'Quarterstaff';
        if (itemClass.endsWith('s')) return itemClass.slice(0, -1);
        return itemClass;
    }

    function parseStatLine(line) {
        const cleaned = line
            .replace(/\[[^\]|]+\|([^\]]+)\]/g, '$1')
            .replace(/[\[\]]/g, '')
            .replace(/\s*\((augmented|desecrated|fractured)\)\s*$/i, '')
            .trim();
        if (!cleaned) return null;

        // "X to Y" range — keep both placeholders, average the values as min.
        const range = cleaned.match(/(\d+(?:\.\d+)?)\s+to\s+(\d+(?:\.\d+)?)/);
        if (range) {
            const avg = Math.floor((parseFloat(range[1]) + parseFloat(range[2])) / 2);
            return {
                humanText: cleaned.replace(/\d+(?:\.\d+)?\s+to\s+\d+(?:\.\d+)?/g, '# to #'),
                min: avg,
            };
        }

        // Single-value mod. Preserve the sign in humanText because PoE's stat-text
        // lookup keys distinguish "+# to maximum Life" from "#% increased Life".
        // Replace each [+-]?digits occurrence with the same sign + "#".
        const firstMatch = cleaned.match(/[+-]?\d+(?:\.\d+)?/);
        if (!firstMatch) return null;

        return {
            humanText: cleaned.replace(/([+-]?)(\d+(?:\.\d+)?)/g, (_, sign) => `${sign}#`),
            min: parseFloat(firstMatch[0]),
        };
    }

    function init() {
        injectStyles();
        attachFuzzyPrefix();
        attachCopyButtons();

        waitForVueApp()
            .then(() => {
                buildLookupMaps();
                attachDuplicateButtons();
                attachImportButton();
            })
            .catch((error) => logError('Init', error.message));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();