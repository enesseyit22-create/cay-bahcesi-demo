# KERF — iOS App Store & Google Play checklist

## Already in this repo
- [x] Web app + PWA (manifest, SW, icons)
- [x] Capacitor config (`app.kerf.vector`) + `www` prepare script
- [x] Android platform scaffold (`android/`, package `app.kerf.vector`)
- [x] iOS project notes (needs macOS/Xcode — `ios/README.md`)
- [x] IAP product IDs + bridge (`lib/iap.js`) with RevenueCat/KerfBilling hooks
- [x] Privacy Policy + Terms pages
- [x] Store listing copy (multi-language) + fastlane metadata
- [x] Icon set under `store/icons/` (iOS + Play + adaptive)
- [x] Phone screenshots under `store/screenshots/`
- [x] Tablet screenshots (iPad + Android 7")
- [x] Feature graphic 1024×500 (`store/graphics/play-feature-1024x500.png`)
- [x] Apple privacy nutrition + Play Data safety drafts
- [x] Release signing template (`android/keystore.properties.example`)
- [x] OTA web updater (+ Capgo-ready config notes)

## You must do on a Mac / local machine
- [ ] Apple Developer Program enrollment
- [ ] Create App ID `app.kerf.vector`, certificates, provisioning
- [ ] `npm i && npm run cap:add:ios` on macOS, open Xcode
- [ ] Archive → TestFlight → App Review

## You must do in Google Play Console
- [ ] Play Developer account
- [ ] Create app, set package `app.kerf.vector`
- [ ] Upload AAB from Android Studio (`./gradlew bundleRelease`)
- [ ] Complete Data safety form (use `store/play-data-safety.md`)
- [ ] Create subscriptions matching `store/products.json`

## Billing go-live
- [ ] Create IAP products in both stores (IDs in `products.json`)
- [ ] Add RevenueCat (recommended) public SDK keys via `<meta name="kerf-rc-key">`
- [ ] Or implement `KerfBilling` Capacitor plugin for StoreKit 2 / Play Billing Library 5+
- [ ] Server-side receipt validation (optional but recommended for Workshop)

## Assets still nice-to-have
- [ ] App preview video (optional)
- [ ] Replace placeholder marketing/support URLs in fastlane metadata with live domain
