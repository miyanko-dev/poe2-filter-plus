# PoE 2 Filter Plus

A Tampermonkey userscript for the [Path of Exile 2 trade site](https://www.pathofexile.com/trade2/search/poe2/).

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) (or another userscript manager).
2. Open `PoE2-Filter-Plus.user.js`, click **Raw**, and confirm the install — or paste its contents into a new Tampermonkey script.

## Features

### Fuzzy stat search

Start typing in any stat dropdown and your query is treated as fuzzy. Type "fire res" instead of hunting for the exact stat name.

### Duplicate filter group

Clone any stat-filter group (Stat Filters, And, Not, If, Count, Weighted Sum) with one click.

### Merge filter groups

Tick the checkbox at the top-right of two or more stat-filter groups, then click **Merge Filters** (next to Clear). Their filters combine into a single group that keeps the topmost selected group's type.

## Privacy

The script collects, transmits, and sells nothing. It runs only on `https://www.pathofexile.com/trade2/search/poe2/*`, has no analytics, makes no third-party requests (icons are inline SVG), and stores nothing in your browser.

## Credits

Based on a userscript by **miyanko**.
