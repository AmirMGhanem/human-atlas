# App Store kit

Everything for the Body Explorer listing in App Store Connect. Each text file holds exactly what goes in one field, so you can open it, select all and paste.

```
app-store/
├── icon/AppIcon-1024.png          app icon, 1024×1024, no alpha (also in the Xcode asset catalog)
├── screenshots/
│   ├── iphone-6.9/01…07.png       1320×2868  → "iPhone 6.9" Display"
│   └── ipad-13/01…07.png          2064×2752  → "iPad 13" Display"
├── metadata/
│   ├── 01-name.txt                App Information → Name (max 30)
│   ├── 02-subtitle.txt            App Information → Subtitle (max 30)
│   ├── 03-promotional-text.txt    version page → Promotional Text (max 170, editable without review)
│   ├── 04-description.txt         version page → Description (max 4000)
│   ├── 05-keywords.txt            version page → Keywords (max 100, comma separated, no spaces)
│   ├── 06-whats-new.txt           version page → What's New (only shown from the second version)
│   ├── 07-support-url.txt         version page → Support URL
│   ├── 08-privacy-policy-url.txt  App Privacy → Privacy Policy URL
│   ├── 09-copyright.txt           version page → Copyright
│   ├── 10-categories.txt          App Information → Category
│   ├── 11-age-rating.txt          App Information → Age Rating questionnaire answers
│   ├── 12-app-privacy.txt         App Privacy questionnaire answers
│   └── 13-review-notes.txt        version page → App Review Information → Notes
├── privacy-policy.md              the page 08-privacy-policy-url.txt points to
└── src/                           scripts that render all of the above from the running app
```

## Upload order

1. **Privacy policy URL.** `08-privacy-policy-url.txt` points at `main`. Until this folder is merged to `main`, use
   `https://github.com/AmirMGhanem/human-atlas/blob/ios-app/app-store/privacy-policy.md` instead.
2. **App Information:** name, subtitle, categories, age rating (11), privacy policy URL.
3. **App Privacy:** answer per `12-app-privacy.txt` → "Data Not Collected".
4. **Pricing and Availability:** Free, all countries.
5. **iOS App 1.0 page:**
   - Drag `screenshots/iphone-6.9/*.png` into *iPhone 6.9" Display* and `screenshots/ipad-13/*.png` into *iPad 13" Display*.
     Keep the file order: the seven panels form one continuous strip, and the first three appear in search results.
   - Paste promotional text, description, keywords, support URL, copyright (03, 04, 05, 07, 09).
   - Build: pick the TestFlight build.
   - App Review Information: no sign-in required; paste `13-review-notes.txt`.
6. In *Pricing and Availability*, turn off "Make this app available on Apple silicon Macs" (iPad on Mac isn't a target).
7. **Add for Review → Submit.**

The icon isn't uploaded here: App Store Connect takes it from the build, so it ships with the next Codemagic build.

## Regenerating

The art is rendered by the app's own viewer in headless Chrome, so it always matches what ships.

```sh
cd app-store/src && npm i
# in another shell, from the repo root: npm run build (once), then ./node_modules/.bin/vite --port 3099
APP_ROOT=$(cd ../.. && pwd) npm run capture    # raw app screens + hero/icon art → renders/
npm run compose                                 # store screenshots + icon → ../screenshots, ../icon
```

- `capture.mjs`: app screens with the real UI (selection sheets, layer panel, female model).
- `art.mjs`: transparent hero body and icon head (glass skin, glowing nervous system).
- `compose.html` / `compose.mjs`: lays the seven panels out as one wide strip per device, with a nerve signal running
  from the hero's brain across every seam, then cuts it into panels.
- `icon.html` / `icon.mjs`: the icon composite.

Copy edits: panel headlines and sub-lines are in `PANELS` in `compose.mjs`.
