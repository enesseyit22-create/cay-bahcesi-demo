# App Privacy (App Store Connect) — draft answers for KERF

## Data Not Collected (default web processing)
If you ship without analytics/accounts:
- **Data Used to Track You:** No
- **Data Linked to You:** No
- **Data Not Linked to You:** optionally **Purchases** (StoreKit handled by Apple)

## If using RevenueCat / analytics
Collect / disclose:
- Purchases (Purchase History) — linked to user / not used for tracking
- Identifiers (User ID) — RevenueCat app user id
- Diagnostics (Crash Data / Performance) — if you add a crash SDK

## Data types KERF itself does NOT upload by default
- Photos / drawings stay on-device for vectorization
- No account system required for core features

## Privacy Policy URL
Host `privacy.html` on your HTTPS domain and paste that URL in App Store Connect.
