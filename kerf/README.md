# KERF — Laser Cut · CNC Vector

Mobile laser/CNC assistant: photo → vector → SVG/DXF + workshop calculator.

## Run (web)
```bash
cd kerf
python3 -m http.server 8765 --bind 127.0.0.1
# http://127.0.0.1:8765/?demo=1
```

## Android (Capacitor)
```bash
npm install
npm run build:web
npx cap sync android
npx cap open android
```
Package ID: `app.kerf.vector` · see `android/README.md`, `store/CHECKLIST.md`

## iOS (needs macOS)
```bash
npm install && npm run build:web
npx cap add ios && npx cap sync ios && npx cap open ios
```
See `ios/README.md`

## Store kit in repo
- `store/icons/` — App Store & Play icons
- `store/screenshots/` — phone screenshots
- `store/graphics/play-feature-1024x500.png`
- `store/products.json` — IAP / Play subscriptions
- `store/fastlane/metadata/` — listing text
- `store/apple-privacy-nutrition.md` · `store/play-data-safety.md`
- `lib/iap.js` — StoreKit/Play/RevenueCat bridge (sandbox on web)

## OTA
Host `ota-manifest.json` on a CDN; set URL in Profile → Updates.
