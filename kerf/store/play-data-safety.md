# Google Play Data safety — draft for KERF

## Does your app collect or share user data?
**No**, for the baseline on-device build (photos processed locally, no analytics).

## If subscriptions via Google Play Billing only
- Collected: **Purchase history** (by Google Play; declare if your app/RevenueCat reads it)
- Purpose: App functionality
- Shared: No (or with RevenueCat as service provider if used)
- Encrypted in transit: Yes
- Users can request deletion: N/A for anonymous sandbox; Yes if you store account ids

## Photo / media
- Not collected / not shared (processed on device)

## Data safety form tips
1. Start with “No data collected” if you truly have no backend.
2. After adding RevenueCat or analytics, update this form before release.
3. Link Privacy Policy URL (hosted `privacy.html`).
