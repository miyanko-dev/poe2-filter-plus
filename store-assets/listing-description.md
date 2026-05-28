PoE 2 Trading Plus is a quality-of-life extension for the official Path of Exile 2 trade site at pathofexile.com/trade2/search/poe2. It removes the most tedious clicks from price-checking and item-search, and runs entirely in your browser. No accounts, no servers, no tracking.

WHAT IT DOES

🔍 Fuzzy stat search
Start typing in any stat-filter dropdown — your query is treated as fuzzy automatically. Type "fire res" instead of hunting for "+#% to Fire Resistance". Works on paste as well.

📋 Copy any item in PoB-friendly format
Hover any result row and click the notebook icon in the top-left. The full listing is copied to your clipboard in the standard PoE 2 0.5.0+ advanced format — rarity, name, base, properties, requirements, sockets, item level, every mod with its tier and prefix/suffix label, corruption, and the listed price.

🎯 Search by item — with values pre-filled
The magnifying-glass button on each row used to drop the stats into your filter list with blank values, so you had to manually copy each rolled number across. Not anymore. One click and the filter group is populated with both the stats and the rolled min values from that item.

📑 Duplicate any filter group
A duplicate-icon button appears next to the pencil icon on every stat-filter group — Stat Filters, And, Not, If, Count, Weighted Sum. One click clones the whole group (filters, weights, settings) as a new group at the end of the list. Useful for building variant searches.

📥 Import item from clipboard
A new "Import Item" button sits next to "Clear" in the search controls. Click it, paste an item you copied in-game (Ctrl+C while hovering), and the extension builds a matching stat-filter group for you automatically. Two toggles let you allow a 20% deviation (for cheaper-but-similar items) or wipe your existing filters first.

VERIFIED FOR PATCH 0.5.0

Tested and verified against the current Path of Exile 2 trade site as of Patch 0.5.0. Handles the new advanced item description format including brace-headers, sign-aware stat lookup, and the "reduced X" / "increased X" PoE 2 inversion (e.g. "reduced Duration of Bleeding on You" is automatically translated to "increased Duration of Bleeding on You" with the correct negative max value).

PRIVACY

This extension does not collect, store, or transmit any personal data. It reads only the trade page you're already viewing, runs locally in your browser, and never sends anything to any remote server. No accounts, no analytics, no third-party services. Source code is open on GitHub.

PERMISSIONS

The extension requests no special permissions. It only operates on https://www.pathofexile.com/trade2/search/poe2/* — the official PoE 2 trade search URL — implicitly via Chrome's content-script match pattern. PoE 1 trade is untouched.

HOW TO USE

Install, open the trade site, and everything is live. There's no setup, no settings page, no toolbar popup. The new buttons appear in their natural places on the page. If you ever want to disable a feature, just disable the extension at chrome://extensions.

OPEN SOURCE

Built in the open at github.com/miyanko-dev/PoE2-Trading-Plus. Issues, suggestions, and PRs welcome. Based on an earlier userscript by miyanko, heavily refactored and extended.
