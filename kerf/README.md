# KERF — Laser Cut File Generator · CNC Template Maker

Mobil odaklı **photo → vector art** asistanı. Eskiz / şablon fotoğrafını temiz line-art vektöre çevirir; **LightBurn uyumlu SVG** ve **CAD/CNC DXF** dışa aktarır.

## Özellikler

- Adaptif (Sauvola) / Otsu eşik, morfolojik temizlik, otomatik kırpma
- Kapalı **CUT** konturları + delik hiyerarşisi
- Zhang–Suen iskelet → **ENGRAVE** merkez çizgisi
- CAM: mm ölçek, kerf ofseti, malzeme hazır ayarı, sac boyutu
- SVG: `CUT=#FF0000`, `ENGRAVE=#0000FF` (mm)
- DXF R12: katmanlar `CUT` / `ENGRAVE`, `$INSUNITS=4` (mm), Y-up

## Çalıştırma

```bash
cd kerf
python3 -m http.server 8765 --bind 127.0.0.1
```

Demo: http://127.0.0.1:8765/?demo=1

## Akış

1. Fotoğraf çek / yükle / demo  
2. Hazır ayar: Eskiz · Basılı şablon · Kenar  
3. Line-art ince ayar → Vektörleştir  
4. CAM (genişlik, kerf, sac)  
5. SVG / DXF / ikisi birden  
