# KERF iOS (Xcode)

This Linux CI/cloud environment cannot generate the Xcode project. On a Mac:

```bash
cd kerf
npm install
npm run build:web
npx cap add ios
npx cap sync ios
npx cap open ios
```

## Then in Xcode
1. Signing & Capabilities → Team + Bundle ID `app.kerf.vector`
2. Add In-App Purchase capability
3. Optional: add RevenueCat SDK / `@revenuecat/purchases-capacitor`
4. Archive → Distribute → TestFlight

Icons: copy from `store/icons/ios-*.png` into Assets.xcassets AppIcon.
Screenshots: `store/screenshots/01-*.png` (1290×2796).
