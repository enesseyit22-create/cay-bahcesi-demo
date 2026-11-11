# KERF Android (Capacitor)

Package: `app.kerf.vector` · versionName `1.2.0`

## Open in Android Studio
```bash
cd kerf
npm install
npm run build:web
npx cap sync android
npx cap open android
```

## Release AAB
1. Copy `keystore.properties.example` → `keystore.properties` and fill values.
2. Place your `.jks` next to the path in `storeFile`.
3. In Android Studio: Build → Generate Signed Bundle / or:
   ```bash
   ./gradlew bundleRelease
   ```
4. Upload `app/build/outputs/bundle/release/app-release.aab` to Play Console.

## Store assets
- Icons: `../store/icons/android-*.png`
- Screenshots: `../store/screenshots/android-*.png`, `tablet-*.png`
- Feature graphic: `../store/graphics/play-feature-1024x500.png`
- Listing text: `../store/fastlane/metadata/android/`
- IAP: `../store/products.json`
