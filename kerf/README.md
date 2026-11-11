# KERF — Laser Cut File Generator · CNC Template Maker

App Store / Google Play’e hazır **PWA** kabuğu + Capacitor iskeleti. Fotoğraf → line-art vektör → SVG/DXF.

## Özellikler
- Yeni açık profesyonel arayüz (Outfit / Sora), alt sekme navigasyonu, onboarding
- Abonelik: Ücretsiz · Pro · Workshop (sandbox IAP; StoreKit / Play Billing’e hazır)
- CUT + ENGRAVE, kerf, sac, LightBurn SVG / DXF
- `privacy.html` · `terms.html` · `store/LISTING.md` · `manifest.webmanifest`

## Çalıştırma
```bash
cd kerf && python3 -m http.server 8765 --bind 127.0.0.1
```
Demo: http://127.0.0.1:8765/?demo=1

## Native sarmalama
`capacitor.config.json` ile `npx cap add ios|android` sonrası mağaza IAP ürün ID’leri `store/LISTING.md` içinde.
