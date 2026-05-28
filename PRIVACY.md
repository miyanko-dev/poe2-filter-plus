# Privacy Policy

**Effective date:** 2026-05-28

This Privacy Policy applies to the **PoE 2 Trading Plus** Chrome extension ("the extension"), distributed via the Chrome Web Store and as open-source code at https://github.com/miyanko-dev/PoE2-Trading-Plus.

## Summary

The extension does not collect, store, transmit, or sell any user data.

## Data collection

The extension does not collect any personally identifiable information, authentication credentials, financial information, health information, communications, location data, web browsing history, user activity, or website content.

The extension does not include any analytics, telemetry, error reporting, or any other form of usage tracking.

## Data transmission

The extension does not send any data to the developer, to any remote server, or to any third party.

The only network activity the extension performs is observing requests the official Path of Exile 2 trade page makes to its own backend (`pathofexile.com/api/trade2/...`) in order to extract item information for clipboard copying and filter population. No data is forwarded, mirrored, or persisted outside the user's browser.

## Data storage

The extension does not store any user data in cookies, localStorage, sessionStorage, IndexedDB, or extension storage.

Two small UI-preference flags (the "Allow 20% Deviation" and "Clear Existing Filters" toggles in the Import Item dialog) are saved to your browser's `localStorage` so the toggle states are remembered between page reloads. This data never leaves your browser.

## Permissions

The extension does not request any sensitive Chrome permissions. It operates only on the URL pattern `https://www.pathofexile.com/trade2/search/poe2/*` via Chrome's content-script match pattern. It cannot access any other websites, tabs, or browser data.

## Third parties

The extension does not embed any third-party libraries, SDKs, or services. It loads the Material Symbols font from Google Fonts to render its button icons. Google Fonts may receive your IP address as part of serving the font file — this is the same data Google receives from any website that uses Google Fonts, governed by Google's own privacy policy. No other third-party requests are made.

## Source code

The extension's full source code is available at https://github.com/miyanko-dev/PoE2-Trading-Plus. Anyone can verify that the behaviour described in this policy matches what the extension actually does.

## Changes

If this policy ever changes, the change will appear in this file's Git history at the repository above.

## Contact

For questions about this policy or the extension, open an issue at https://github.com/miyanko-dev/PoE2-Trading-Plus/issues.
