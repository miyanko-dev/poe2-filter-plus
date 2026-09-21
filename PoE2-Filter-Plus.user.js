// ==UserScript==
// @name         PoE 2 Filter Plus
// @namespace    https://github.com/miyanko-dev/poe2-filter-plus
// @version      1.0.0
// @description  Fuzzy stat search, duplicate stat-filter groups, and select multiple groups to merge into one. Verified for PoE 2 Patch 0.5.0.
// @author       miyanko
// @match        https://www.pathofexile.com/trade2/search/poe2/*
// @icon         https://www.poe2wiki.net/images/5/58/Divine_Orb_inventory_icon.png
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const FUZZY_PREFIX = '~';
    const TOAST_DURATION_MS = 3000;
    const VUE_RETRY_DELAY_MS = 200;
    const VUE_MAX_RETRIES = 100;
    const REFRESH_DEBOUNCE_MS = 150;

    // Duplicate glyph: outlined square behind, filled square in front. Inlined as SVG
    // because the site CSP blocks external assets; currentColor lets the CSS tint it.
    const DUPLICATE_ICON_SVG =
        '<svg viewBox="0 0 18 18"><rect x="6.75" y="1.75" width="9.5" height="9.5" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="1" y="6" width="11" height="11" fill="currentColor"/></svg>';

    function logError(area, message, error) {
        console.error(`[PoE 2 Filter Plus][${area}]`, message, error ?? '');
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

    const statsState = () => window.app?.$store?.state?.persistent?.stats;

    // Merge selection lives here, keyed by the store's stat-group objects: the site
    // re-renders group headers on query changes, which silently replaces our
    // checkboxes with fresh unchecked ones — DOM state alone doesn't survive.
    const selectedMergeGroups = new Set();

    function commitStore(type, payload) {
        const store = window.app?.$store;
        if (!store) {
            logError('Store', `cannot commit ${type}, store unavailable`);
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

    // Re-install controls right after the store-driven DOM update, so a duplicated or
    // merged group gets its button/checkbox instantly instead of on the debounced pass.
    function scheduleControlInstall() {
        if (window.app?.$nextTick) window.app.$nextTick(refreshGroupControls);
        else refreshGroupControls();
    }

    function injectStyles() {
        if (document.getElementById('poe2-filter-plus-styles')) return;

        const toastBg = 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAADsSURBVEhLY2AYBfQMgf///3P8+/evAIgvA/FsIF+BavYDDWMBGroaSMMBiE8VC7AZDrIFaMFnii3AZTjUgsUUWUDA8OdAH6iQbQEhw4HyGsPEcKBXBIC4ARhex4G4BsjmweU1soIFaGg/WtoFZRIZdEvIMhxkCCjXIVsATV6gFGACs4Rsw0EGgIIH3QJYJgHSARQZDrWAB+jawzgs+Q2UO49D7jnRSRGoEFRILcdmEMWGI0cm0JJ2QpYA1RDvcmzJEWhABhD/pqrL0S0CWuABKgnRki9lLseS7g2AlqwHWQSKH4oKLrILpRGhEQCw2LiRUIa4lwAAAABJRU5ErkJggg==)';

        const style = document.createElement('style');
        style.id = 'poe2-filter-plus-styles';
        style.textContent = `
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
                width: 16px !important;
                height: 16px !important;
                color: #fff !important;
                position: absolute !important;
                top: 50% !important;
                left: 50% !important;
                transform: translate(-50%, -50%) !important;
            }
            .poe2-duplicate-icon svg {
                width: 16px !important;
                height: 16px !important;
                display: block !important;
            }
            .poe2-merge-checkbox {
                -webkit-appearance: none !important;
                appearance: none !important;
                width: 16px !important;
                height: 16px !important;
                margin: 0 0 0 6px !important;
                vertical-align: middle !important;
                cursor: pointer !important;
                border: 0 !important;
                background: transparent url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Crect x='0.75' y='0.75' width='10.5' height='10.5' rx='1.5' fill='none' stroke='%23585858' stroke-width='1.5'/%3E%3C/svg%3E") center / 12px 12px no-repeat !important;
            }
            .poe2-merge-checkbox:checked {
                background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Crect width='12' height='12' rx='1.5' fill='%23fff'/%3E%3C/svg%3E") !important;
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
            .poe2-merge-btn {
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
            .poe2-merge-btn:hover { background-color: #2a2e32; }
        `;
        document.head.appendChild(style);
    }

    let spriteStyle = null;

    // The site draws its toggle squares from a signed sprite URL that rotates,
    // so steal it from a live .toggle-btn instead of hardcoding it. Falls back
    // to the injected SVG squares until a toggle button exists.
    function adoptNativeCheckboxSprite() {
        if (spriteStyle) return;

        const toggle = document.querySelector('.toggle-btn');
        if (!toggle) return;

        const sprite = getComputedStyle(toggle, '::after').backgroundImage;
        if (!sprite || sprite === 'none') return;

        spriteStyle = document.createElement('style');
        spriteStyle.textContent = `
            .poe2-merge-checkbox {
                width: 15px !important;
                height: 15px !important;
                background-image: ${sprite} !important;
                background-repeat: no-repeat !important;
                background-size: auto !important;
                background-position: -217px -230px !important;
            }
            .poe2-merge-checkbox:checked {
                background-image: ${sprite} !important;
                background-position: -247px -230px !important;
            }
        `;
        document.head.appendChild(spriteStyle);
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

    const STAT_GROUP_NAMES = new Set(['And', 'Not', 'If', 'Count']);

    // Stat-filter groups, in DOM order — which mirrors persistent.stats, so a group's
    // position in this list is its store index. Non-stat filter groups (Type, Equipment,
    // ...) are excluded so that index alignment holds. Collapsed groups must be included
    // too, both to keep the indexes aligned and so their checked merge boxes count.
    function findStatGroups() {
        const groups = [];
        document.querySelectorAll('.filter-group').forEach((element) => {
            const titleEl = element.querySelector('.filter-title-clickable, .filter-title');
            if (!titleEl) return;
            if (!isStatGroup(groupTitle(titleEl))) return;

            // Collapsed groups may not render an edit button; they still occupy
            // a store index, so keep them in the list either way.
            const editButton = element.querySelector('.edit-btn:not(.poe2-duplicate-btn)');
            groups.push({ element, editButton });
        });
        return groups;
    }

    function groupTitle(titleEl) {
        // The title element can hold child nodes (counters, icons); the label is its first
        // non-empty text node, with any trailing description ("Count each stat...") dropped.
        const textNode = Array.from(titleEl.childNodes)
            .find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
        const raw = (textNode ? textNode.textContent : titleEl.textContent).trim();
        const label = raw.split(/[.\n]/)[0].trim();
        return label.includes('Count each stat') ? 'Count' : label;
    }

    function isStatGroup(title) {
        if (title.includes('Stat Filters') || title.includes('Weighted Sum')) return true;
        return STAT_GROUP_NAMES.has(title);
    }

    function attachControls() {
        const refresh = () => {
            refreshGroupControls();
            placeMergeButton();
        };
        refresh();

        const refreshSoon = debounce(refresh, REFRESH_DEBOUNCE_MS);
        new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes') {
                    if (mutation.target.classList?.contains('filter-group')) { refreshSoon(); return; }
                    continue;
                }
                for (const list of [mutation.addedNodes, mutation.removedNodes]) {
                    for (const node of list) {
                        if (isRelevantNode(node)) { refreshSoon(); return; }
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

    function isRelevantNode(node) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
        if (node.matches?.('.filter-group, .edit-btn, .controls-right')) return true;
        return !!node.querySelector?.('.filter-group, .controls-right');
    }

    function refreshGroupControls() {
        const stats = statsState();
        findStatGroups().forEach((group, index) => {
            installDuplicateButton(group);
            installMergeCheckbox(group);
            syncMergeCheckbox(group, Array.isArray(stats) ? stats[index] : null);
        });
    }

    // Reapply the script-held selection after every (re)install pass, so a checkbox
    // recreated by a site re-render comes back in its previous state.
    function syncMergeCheckbox(group, groupState) {
        const checkbox = group.element.querySelector('.poe2-merge-checkbox');
        if (checkbox) checkbox.checked = !!groupState && selectedMergeGroups.has(groupState);
    }

    function installDuplicateButton(group) {
        if (!group.editButton) return;
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
            // Resolve the group from the live DOM, not a captured reference that a
            // re-render could have orphaned.
            duplicateStatGroup(button.closest('.filter-group'));
        });

        const container = group.editButton.parentNode;
        container.insertBefore(button, group.editButton.nextSibling);
    }

    function installMergeCheckbox(group) {
        if (!group.editButton) return;
        if (group.element.querySelector('.poe2-merge-checkbox')) return;

        adoptNativeCheckboxSprite();

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'poe2-merge-checkbox';
        checkbox.title = 'Select this group to merge';

        // Keep the click from reaching the header's expand/collapse handler.
        checkbox.addEventListener('click', (event) => event.stopPropagation());

        // Record the selection against the store object, resolved live at click time:
        // the captured group reference may already be orphaned by a re-render.
        checkbox.addEventListener('change', () => {
            const element = checkbox.closest('.filter-group');
            const index = findStatGroups().findIndex((entry) => entry.element === element);
            const stats = statsState();
            const groupState = (index >= 0 && Array.isArray(stats)) ? stats[index] : null;

            if (!groupState) {
                logError('Merge', `cannot map checkbox to store group (index ${index})`);
                checkbox.checked = false;
                return;
            }
            if (checkbox.checked) selectedMergeGroups.add(groupState);
            else selectedMergeGroups.delete(groupState);
        });

        // Sit at the end of the group's control cluster: edit, duplicate, then checkbox.
        group.editButton.parentNode.appendChild(checkbox);
    }

    function placeMergeButton() {
        document.querySelectorAll('.controls-right').forEach((controls) => {
            if (controls.querySelector('.poe2-merge-btn')) return;
            const clearBtn = controls.querySelector('.clear-btn');
            if (!clearBtn) return;

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn poe2-merge-btn';
            button.innerHTML = '<span>Merge Filters</span>';
            button.addEventListener('click', (event) => {
                event.preventDefault();
                mergeSelectedGroups();
            });
            controls.insertBefore(button, clearBtn);
        });
    }

    function duplicateStatGroup(element) {
        const stats = statsState();
        if (!Array.isArray(stats) || !element) {
            logError('Duplicate', 'stats state or group element unavailable');
            showToast('Duplicate failed — see console.');
            return;
        }

        const index = findStatGroups().findIndex((group) => group.element === element);
        if (index < 0 || index >= stats.length) {
            logError('Duplicate', `group index out of range (${index} / ${stats.length})`);
            showToast('Duplicate failed — see console.');
            return;
        }

        let clone;
        try {
            clone = JSON.parse(JSON.stringify(stats[index]));
        } catch (error) {
            logError('Duplicate', 'failed to clone group', error);
            showToast('Duplicate failed — see console.');
            return;
        }
        if (!clone.filters) clone.filters = [];

        if (commitStore('pushStatGroup', clone)) scheduleControlInstall();
        else showToast('Duplicate failed — see console.');
    }

    function mergeSelectedGroups() {
        const stats = statsState();
        if (!Array.isArray(stats)) {
            logError('Merge', 'stats state unavailable');
            showToast('Merge failed — see console.');
            return;
        }

        // Selection is read from the script-held set, not the DOM, so it is immune to
        // the site re-rendering checkboxes. Walking stats ascending keeps `selected`
        // sorted, so selected[0] is the topmost group.
        const selected = [];
        stats.forEach((groupState, index) => {
            if (selectedMergeGroups.has(groupState)) selected.push(index);
        });

        if (selected.length < 2) {
            showToast('Select at least two filter groups to merge.');
            return;
        }

        const [topIndex, ...absorbed] = selected;

        try {
            // Concatenate every selected group's filters, topmost first. Deep-clone so the
            // merged list can't alias filter objects on the groups about to be removed.
            const merged = [];
            for (const index of selected) {
                for (const filter of stats[index].filters || []) {
                    merged.push(JSON.parse(JSON.stringify(filter)));
                }
            }

            // The topmost group keeps its type and absorbs every filter. Reassigning a
            // reactive property and splicing a reactive array are both tracked by Vue 2, so
            // the form re-renders without a dedicated store mutation.
            selected.forEach((index) => selectedMergeGroups.delete(stats[index]));
            stats[topIndex].filters = merged;
            absorbed.sort((a, b) => b - a).forEach((index) => stats.splice(index, 1));

            scheduleControlInstall();
            showToast(`Merged ${selected.length} filter groups into one.`);
        } catch (error) {
            logError('Merge', 'failed to merge groups', error);
            showToast('Merge failed — see console.');
        }
    }

    function init() {
        injectStyles();
        attachFuzzyPrefix();

        waitForVueApp()
            .then(attachControls)
            .catch((error) => logError('Init', error.message));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
