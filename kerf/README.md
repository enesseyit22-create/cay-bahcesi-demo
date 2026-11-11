# KERF — Laser Cut File Generator · CNC Template Maker

App Store / Google Play’e hazır **PWA** kabuğu + Capacitor iskeleti. Fotoğraf → line-art vektör → SVG/DXF.

## Özellikler
- Açık profesyonel arayüz, onboarding, alt sekme
- Abonelik: Ücretsiz · Pro · Workshop (sandbox IAP)
- CUT + ENGRAVE, kerf, sac, LightBurn SVG / DXF
- Ölçüm hesapları (süre, maliyet, yerleşim)
- 11 dil (tr/en/de/fr/es/pt/it/ru/zh/ja/ar)
- **OTA**: dış CDN’den `ota-manifest.json` ile güncelleme
- `privacy.html` · `terms.html` · `store/LISTING.md` · PWA manifest

## Çalıştırma
```bash
cd kerf && python3 -m http.server 8765 --bind 127.0.0.1
```
Demo: http://127.0.0.1:8765/?demo=1

## OTA (dışarıdan güncelleme)
1. `ota-manifest.json` dosyasını CDN / GitHub raw / sunucuya koy.
2. `version` + `build` yükselt (`force: true` = zorunlu).
3. Uygulamada **Profil → OTA manifest URL** alanına uzak adresi yaz.
4. Açılışta veya “Güncellemeleri kontrol et” ile banner gelir → **Şimdi güncelle**.

Yerel sürüm: `lib/ota.js` → `APP_VERSION` / `APP_BUILD`.  
Native Capacitor için Capgo (`CapacitorUpdater`) opsiyonel; web OTA PWA için yeterlidir.

## Native sarmalama
`capacitor.config.json` ile `npx cap add ios|android` · IAP ürünleri `store/LISTING.md`.
