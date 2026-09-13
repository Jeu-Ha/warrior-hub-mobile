# Warrior Hub Mobile v0.3 — continuous notebook

## Notes як study app
- **Нема Add page / Next page / page strip.** Для тебе це один довгий notebook: просто скроль вниз.
- App автоматично підставляє новий paper нижче, коли ти наближаєшся до кінця.
- Внутрішні storage segments не показуються як сторінки; у day chips є тільки крапка, що в цей день є handwriting.
- Course `‹ / ›`, course select, date `‹ / ›`, Today та recent day chips лишаються зверху.
- Apple Pencil/pen використовує coalesced pointer events + pressure для плавнішого stroke. Палець за замовчуванням скролить; `☝ Draw` вмикає finger drawing.
- Далекі canvas вивантажуються з RAM, а новий segment додається в DOM без повного rerender notebook.

## Захист від втрати Notes
- Primary copy — IndexedDB `warrior-mobile-drawing-notes-v2`; DB name/version не змінені від v0.2.
- Stroke після завершення одразу записується локально; під час дуже довгого stroke є emergency local snapshot приблизно раз на 5 s.
- Local recovery checkpoints лишаються.
- OneDrive snapshots append-only: новий revision = новий файл, а не overwrite єдиної копії.
- Restore ніколи не стирає dirty local variant: при розбіжності створюється conflict copy.
- Service Worker update чистить старий Cache Storage app shell, але не IndexedDB.
- Export/Import local backup лишені.

## Course resources
- Calculus → Stewart/Clegg/Watson book.
- Contemporary Moral Issues → bundled Being Good PDF.
- General Chemistry II Laboratory / Canvas 244636 → `🧪 Chem 2 Lab` → Catalyst course 6760.
