# poe2-filter-plus

A userscript adding quality-of-life search tools to the [Path of Exile 2 trade site](https://www.pathofexile.com/trade2/search/poe2/).

## Features

- **Fuzzy stat search** — start typing in any stat dropdown and your query is matched loosely. Type "fire res" instead of hunting for the exact stat name.
- **Duplicate filter group** — clone any stat-filter group (Stat Filters, And, Not, If, Count, Weighted Sum) with one click.
- **Merge filter groups** — tick the checkbox on two or more groups, then click **Merge Filters** next to Clear. Their filters combine into one group, keeping the topmost selected group's type.

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) or another userscript manager.
2. Open [`PoE2-Filter-Plus.user.js`](PoE2-Filter-Plus.user.js), click **Raw**, and confirm the install.
3. Reload the trade site.

## Restrictions

Runs only on `https://www.pathofexile.com/trade2/search/poe2/*`. It collects and transmits nothing: no analytics, no third-party requests (icons are inline SVG), nothing stored in your browser.

## Credits

Based on a userscript by **miyanko**.
