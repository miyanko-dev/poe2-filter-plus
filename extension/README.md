# Extension build — developer notes

This is the deployable Chrome extension. End-user docs and feature descriptions live in the [top-level README](../README.md).

Match pattern: `https://www.pathofexile.com/trade2/search/poe2/*`

## Load locally for testing

1. Open `chrome://extensions`.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked** and select this `extension/` folder.
4. Open a PoE 2 trade search page — features kick in immediately.

When you edit `content.js`, hit the circular-arrow refresh icon on the extension card in `chrome://extensions`, then hard-reload the trade page (`Cmd/Ctrl + Shift + R`).

## File layout

```
extension/
├── manifest.json       # MV3 manifest, content_scripts targeting the trade site
├── content.js          # The IIFE that powers every feature (single source of truth)
├── icons/
│   ├── icon-reference.png  # 1024×1024 master artwork
│   ├── icon-16.png         # toolbar / favicon
│   ├── icon-32.png         # Windows favicon variant
│   ├── icon-48.png         # extension management page
│   └── icon-128.png        # Chrome Web Store listing / install dialog
└── README.md
```

## Why `"world": "MAIN"` matters

The content script wraps `window.fetch` and `XMLHttpRequest` to capture trade API responses (`/api/trade2/fetch/...`). Chrome content scripts run in an isolated world by default, where overrides on `window.fetch` are invisible to the page. Manifest V3's `world: "MAIN"` field places our script in the page's main world so the hook actually takes effect.

## Permissions

None requested. Host access for `pathofexile.com/trade2/search/poe2/*` is implicit through the content-script match pattern. Clipboard writes use `navigator.clipboard.writeText`, which is allowed in a user-gesture context (the copy button click) without a `clipboardWrite` permission.

## Regenerating icons

When you replace `icons/icon-reference.png` with a new master:

```bash
python3 <<'PY'
from PIL import Image
src = "extension/icons/icon-reference.png"
img = Image.open(src).convert("RGBA")
bbox = img.split()[-1].getbbox()  # trim transparent border
cropped = img.crop(bbox)
w, h = cropped.size
side = max(w, h)
square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
square.paste(cropped, ((side - w) // 2, (side - h) // 2))
for size in (16, 32, 48, 128):
    square.resize((size, size), Image.LANCZOS).save(f"extension/icons/icon-{size}.png", optimize=True)
PY
```

The auto-trim is important — Chrome doesn't add padding for you, so transparent border around the artwork becomes wasted space at small sizes.

## Publishing checklist (Chrome Web Store)

- [ ] Bump `version` in `manifest.json` for each release.
- [ ] Verify on a fresh Chrome profile (no other PoE userscripts/extensions enabled) — the trade page loads, fuzzy `~` prefix triggers, copy button appears in the row's left column, search button populates min values, Import Item button sits next to Clear.
- [ ] Zip the **contents** of `extension/` (not the folder itself) for upload, omitting docs and the master image:
  ```bash
  cd extension && zip -r ../poe2-trading-plus.zip . -x README.md "icons/icon-reference.png"
  ```
- [ ] Create a [Chrome Web Store developer account](https://chrome.google.com/webstore/devconsole/) ($5 one-time fee) if you don't have one.
- [ ] Prepare store listing assets: short description (≤132 chars), detailed description, 1280×800 or 640×400 screenshots showing each feature, the 128×128 tile.
- [ ] Privacy practices disclosure: this extension does not collect user data, does not transmit anything to remote servers, and operates only on `pathofexile.com/trade2/search/poe2/*`.

## Diagnostics

Console warnings the extension emits and what they mean:

| Warning | Meaning |
|---|---|
| `[PoE2 Suite - Import] Could not resolve these stat texts: …` | Pasted item has a stat the catalog doesn't recognise. Second line lists `statsMap` keys containing the longest content word — that's the closest PoE wording. Add a translation or alias in `resolveStatId`. |
| `[PoE2 Suite - Copy] No cached entry for row` | The fetch/XHR capture missed this row. Fallbacks (Vue 2 walk + Vuex store walk) also failed. Usually a hard-reload fixes it; if persistent, the trade page DOM or state shape has changed. |
| `[PoE2 Suite - Store] commit X threw` | A Vuex mutation name (`pushStatGroup`, `setStatFilter`, `clearSearchForm`, `setPropertyFilter`) is no longer recognised. Check the trade page's network or store inspector for the new name. |
