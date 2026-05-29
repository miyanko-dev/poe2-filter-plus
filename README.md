# PoE 2 Trading Plus

A Chrome extension for the [Path of Exile 2 trade site](https://www.pathofexile.com/trade2/search/poe2/).

## Install

Not on the Chrome Web Store yet. To use it now:

1. Download or clone this repo.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, choose the `extension/` folder.

## Features

### Fuzzy stat search

Start typing in any stat dropdown and your query is treated as fuzzy. Type "fire res" instead of hunting for the exact stat name.

### Copy item

Hover any row and click the notebook icon to copy the listing as PoB-friendly text.

### Search by item, with values

The magnifying-glass button now pre-fills the min values from the item's actual rolls — not just the stat names.

### Duplicate filter group

Clone any stat-filter group (Stat Filters, And, Not, If, Count, Weighted Sum) with one click.

### Import item

Paste an in-game item copy (`Ctrl+C`) and the extension builds the matching stat filters for you.

## Packaging for the Chrome Web Store

The uploadable package is the **contents** of `extension/` (so `manifest.json` sits at the zip root). Build it with:

```
cd extension && zip -r ../poe2-trading-plus.zip . -x '*.DS_Store'
```

Then upload `poe2-trading-plus.zip` in the Chrome Web Store dashboard under **Package → Upload new package**. Bump `version` in `manifest.json` before each release.

## Credits

Based on a userscript by **miyanko**.
