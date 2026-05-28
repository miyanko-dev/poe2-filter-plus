# PoE 2 Trading Plus

A Chrome extension that makes trading on the [Path of Exile 2 trade site](https://www.pathofexile.com/trade2/search/poe2/) faster and a lot less clicky.

It adds five quality-of-life tools to the search page — fuzzy stat search, one-click item copy, smarter "search for similar" buttons, filter-group duplication, and pasting an item to auto-build a search. That's it. No accounts, no servers, no tracking.

## Install

The extension isn't on the Chrome Web Store yet. To use it now:

1. Download or clone this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** in the top-right.
4. Click **Load unpacked** and choose the `extension/` folder.
5. Open the trade site — everything kicks in automatically.

The extension only runs on `pathofexile.com/trade2/search/poe2/*`. PoE 1 trade is untouched.

## Features

### Fuzzy stat search

Just start typing in any stat-filter dropdown — the extension prefixes your query with `~` so you don't have to remember the exact stat name.

Type "movement" instead of hunting for "#% increased Movement Speed". Type "fire res" instead of "+#% to Fire Resistance". Works on paste too.

### Copy any item in PoB-friendly format

Hover any result and the dark notebook icon appears in the top-left of the row. Click it to copy the full item to your clipboard in the standard PoE 2 advanced format that PoB and other tools accept.

Includes rarity, base, properties, requirements, sockets, item level, every mod with its tier and prefix/suffix label, corruption, and the listed price.

### Search by item stats (with values pre-filled)

The magnifying-glass button on each row used to drop the stats into the filter list with blank values — meaning you had to manually copy each rolled value over. Not anymore. Click it and the filter group is populated with **both** the stats *and* the rolled min values from the item.

### Duplicate any filter group

A duplicate-icon button appears next to the pencil icon on every stat-filter group (Stat Filters, And, Not, If, Count, Weighted Sum). Click it to clone the whole group — filters, weights, and settings — as a new group at the end of the list.

Useful for building variant searches: duplicate, tweak the duplicate, repeat.

### Import item from clipboard

A new **Import Item** button sits next to **Clear** in the search controls. Click it, paste an item copy (in-game `Ctrl+C` while hovering, or text copied from anywhere using the advanced format), and the extension builds a stat-filter group for you automatically.

Two toggles:

- **Allow 20% Deviation** — Each min value is set to 80% of the rolled value. Good for finding slightly-worse-but-cheaper alternatives.
- **Clear Existing Filters** — Off (default): adds the imported stats as a new AND group below your existing filters. On: wipes the search first.

The item class is detected from the paste and applied automatically.

## Tips & tricks

- **For range stats** like "Adds 5 to 9 Fire Damage", the importer uses the average (7) as the min.
- **For "reduced" stats** like "50% reduced Duration of Bleeding on You" — PoE 2 trade doesn't have a separate "reduced" filter for some of these, so the extension automatically converts them to the matching "increased" filter with a `max` of −50. The search still works; the filter just reads "increased".
- **The advanced item format** uses brace headers like `{ Prefix Modifier "Hardened" (Tier: 4) }` above each stat line. The extension produces these on copy so you can see exactly what tier a mod is. Pasting these brace lines back in is fine — the importer ignores them.
- **Enchant, implicit, rune, fractured, crafted, and desecrated mods** are skipped on import. Only the regular explicit stats become filters — that's almost always what you want when looking for "more items like this one".
- **Local vs. global variants** (like `+# to Evasion Rating (Local)` on armour vs. on a jewel) are resolved automatically — the closest match wins.
- **If a copied price-check looks off**, hover the row again — the copy reads the item directly from the trade response, so reloading the page or sending a new search regenerates it.

## Troubleshooting

| Problem | Fix |
|---|---|
| Buttons don't appear | Hard-reload the page (`Cmd/Ctrl + Shift + R`). Make sure the extension is enabled at `chrome://extensions`. |
| Some imported stats have empty min boxes | Open the browser console (F12 → Console). The extension logs `[PoE2 Suite - Import] Could not resolve …` with the exact stat text it couldn't match. Open an issue with that line. |
| Copy says "No cached entry for row" | Reload the page so the extension can recapture the search results, then try again. |
| Extension icon looks gray in the toolbar | The toolbar shows the 16px size; the design is intentionally moody. The full icon shows on the extension management page. |

## Privacy

The extension does not collect, store, or transmit any personal data. It only reads the trade page you're already viewing, runs locally in your browser, and never sends anything anywhere. No accounts, no analytics, no servers.

## Credits

Built on top of an earlier userscript by **miyanko**, heavily refactored and extended into the Chrome extension you see today.
