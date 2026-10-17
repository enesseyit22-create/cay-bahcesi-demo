# Çay Bahçesi – Devir Notu (17 Ekim 2026)

Turkish tea garden management game for Android (Google Play). Landscape, 3D, semi-realistic.
- **Prototype:** three.js in the browser.
- **Target:** Unity, building an APK/AAB.
- **Producer / art director:** Enes Seyit. He makes the Meshy 3D models, tests, and runs the Play account.
- **Developer:** the bot.

## Links
- Live demo: https://enesseyit22-create.github.io/cay-bahcesi-demo/
- Repo: github.com/enesseyit22-create/cay-bahcesi-demo (branch main, GitHub Pages)
- Pushes use the token in env GITHUB_TOKEN. Never print it.

## Files (box: /workspace/caybahcesi)
- `site/`: the published repo (index.html, game.js, style.css, vendor/three, assets/*.glb, assets/tex)
- `prototype/`: working copy and screenshots (v1–v7 *.png)
- `models/raw/`: original Meshy exports. Each `.fbx` is actually a zip containing the FBX and 4 PBR textures.
- `tools/`: headless Blender 4.2.3 scripts. Blender is at ~/tools/blender-4.2.3-linux-x64/.
  - decimate_export.py: decimate, export GLB with Draco, 1024 textures
  - rig_animate.py: 18-bone rig, auto weights, idle/walk/run/carry/pickup/serve/pour/sit/talk/drink. Puts A-pose arms down.
  - other test and screenshot scripts
- Meshy models are scaled so their largest side is ~1.9 m. Rescale to real size.
- Triangle budget: characters 9–18k, props 2–8k, scene under ~250k.

## Done (v1–v7.3)
- Third-person (PUBG style) and first-person cameras, tap-to-walk, landscape layout.
- Rigged waiter and owner. Close serving with the tray carried in hand.
- Customer pairs with Turkish speech bubbles, faces and blinking.
  - 4 Meshy customers (hijab, elder, hoodie, tourist) in CUSTOMER_MODELS.
- Meshy environment: çınar with leaf cards, railing, lamps, awning, benches, marble counter. Procedural geranium pots.
- Golden-hour light and HDRI sky. PBR paving.
- Sea shader, vapur, Boğaz panorama (bridge, mosques), granite quay and street.
- Customer patience doubled (28–52 s).
- Main menu: OYNA / MEKANLAR / MAĞAZA (display only) / AYARLAR (graphics, sensitivity, reset).
  - Venues live in the VENUES config in game.js.
- Counter camera fix: the owner stays visible during the tea hand-over.

## Not done (next steps, in order)
1. Day cycle 08:00–22:00, about 6–8 minutes per day.
   - Light changes through morning, noon, evening and night.
   - Clock in the HUD. Rush hours.
   - End-of-day summary.
2. Level system: XP, a daily goal per level, unlocks (tables, products, venues, shop items), level-up popup, saved in localStorage.
3. Kapadokya (level 5) and Karadeniz Yaylası (level 10) as playable VENUES with placeholder art. Add a ?unlock=all test parameter.
4. Products: çay, Türk kahvesi, simit, plus venue specials.
   - Kapadokya: gözleme, şerbet. Karadeniz: Rize çayı, mısır ekmeği.
   - Each needs a prep station, a price and a level unlock.
5. Working MAĞAZA: spend money on tables, a faster semaver, better tea and decorations.
6. Asset manifest, so a GLB automatically replaces its placeholder. FPS counter. Customer LOD. Get the scene under 250k tris (currently ~270k).
7. Later: Unity port, Android build, Play Store (Enes pays the $25 developer fee).

## Known issues
- Animations are scripted keyframes, not motion capture. Rokoko Vision / DeepMotion are options later.
- No pathfinding, no sound.
- FPS on a real phone has not been measured.
