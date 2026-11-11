# KERF — Laser Cut File Generator

Mobil odaklı **photo → vector** asistanı. Telefon kamerası veya galeriden çizim alıp line-art vektöre çevirir; **SVG** ve **DXF** olarak dışa aktarır. Ölçek (mm) ve kerf ofseti CAM ekranında ayarlanır.

## Çalıştırma

```bash
cd kerf
python3 -m http.server 8765 --bind 127.0.0.1
```

Tarayıcı: http://127.0.0.1:8765/?demo=1

## Akış

1. Fotoğraf çek / yükle  
2. Eşik, bulanıklık, kenar algılama  
3. Vektörleştir  
4. CAM: genişlik (mm), kerf  
5. SVG veya DXF indir  

SEO hedefleri: laser cut file generator · CNC template maker · photo to vector art
