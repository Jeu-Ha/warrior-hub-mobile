# Warrior Hub Mobile v0.2

- Notes tab перероблено під drawing-first notebook для iPad/iPhone.
- Unlimited notebook pages per course/day.
- Apple Pencil / Pointer Events, pen, highlighter, stroke eraser, undo/redo, color, width, ruled/grid/blank paper.
- Course previous/next, day previous/next, Today, sorted day chips with page counts.
- Local primary storage moved to durable IndexedDB (`warrior-mobile-drawing-notes-v2`).
- Local recovery checkpoints kept separately from current pages.
- OneDrive drawing backup uses append-only immutable snapshots under `WARRIOR HUB/warrior-notes-v2/`; cloud backup never overwrites the only page copy.
- Restore preserves conflicts as separate pages instead of overwriting local dirty work.
- Export/import local drawing backup added.
- `navigator.storage.persist()` requested when supported.
- PWA update cache is separate from IndexedDB, so app updates do not delete drawing notes.
- Existing v0.1 Microsoft setup/local state keys are intentionally reused so updating at the same origin keeps configuration.
