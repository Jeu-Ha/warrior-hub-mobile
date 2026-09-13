# Warrior Hub Mobile v0.4.0

## Notebook media workflow
- Додано **＋ Insert** bottom sheet: Photos/Screenshots, Camera, Files, Paste.
- Multi-select images, drag & drop, clipboard paste.
- **Select tool** для move/resize media на аркуші.
- Fit width / Open / Delete controls.
- PDF та інші файли можна прикріпити як локальні attachment cards.
- Drawing notebook лишається безкінечним vertically; Add page не повертався.

## Safety
- Existing IndexedDB database не видаляється; schema upgrade додає `assets` object store.
- Media спочатку записується локально в IndexedDB.
- OneDrive assets зберігаються в `WARRIOR HUB/warrior-notes-v2/assets/`.
- Cloud backup спочатку завантажує media, потім immutable page snapshot.
- Restore перевіряє images/attachments разом зі strokes; локальні dirty зміни не перезаписуються мовчки.
- Export/Import local backup v3 включає media data, не лише pen strokes.

## Performance
- Дуже великі images нормалізуються до max ~2600 px для notebook use.
- Image decoding кеш обмежений; off-screen paper segments як і раніше virtualized.
