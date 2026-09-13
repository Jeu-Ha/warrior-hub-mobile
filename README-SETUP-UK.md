# Warrior Hub Mobile v0.4.0 — установка без нервів

Це PWA для iPhone/iPad. Після **Add to Home Screen** вона поводиться як окрема програма. Assignments, schedule, calendar і text notes синкаються через conflict-safe OneDrive device shards (`warrior-hub-sync-devices/`), а **drawing notes/media мають окремий захищений storage**.

## Найважливіше про Drawing Notes

У v0.4 немає кнопки **Add page**. Відкриваєш Notes і просто **скролиш вниз**. Warrior Hub автоматично продовжує папір стільки, скільки треба. Усередині програма непомітно ділить цей довгий лист на recovery-сегменти — тільки для продуктивності, backup і відновлення. Для тебе це один безперервний notebook.

Захист даних:

1. головна копія кожного намальованого сегмента зберігається локально в **IndexedDB**;
2. є локальні recovery checkpoints;
3. OneDrive отримує **нові immutable snapshot-файли**, а не одну копію, яку постійно overwrite-имо;
4. restore не стирає локальні unsynced зміни — при конфлікті створюється conflict copy;
5. PWA update змінює Cache Storage програми, але **не змінює/не очищає drawing database**;
6. v0.4 використовує ту саму базу `warrior-mobile-drawing-notes-v2`; schema upgrade тільки додає окремий `assets` store, не видаляючи старі drawing pages;
7. довгий notebook віртуалізований: canvas далеко від екрана вивантажуються з RAM, а strokes лишаються в IndexedDB.

> 100% магічної гарантії від будь-якого видалення даних не існує. Якщо вручну очистити Safari Website Data і одночасно стерти OneDrive backups, локальну копію можна втратити. Нормальний update app, offline режим або баг основного `warrior-hub-sync.json` не повинні бути здатні стерти єдину копію drawing notes.

## Якщо в тебе вже стоїть Mobile v0.2

**НЕ видаляй Home Screen app і НЕ очищай Safari Website Data.**

1. Розпакуй `Warrior-Hub-Mobile-v0.4.zip` на PC.
2. У тому самому GitHub repository заміни старі файли новими.
3. Дочекайся GitHub Pages deploy.
4. На iPad/iPhone закрий Warrior Hub повністю.
5. В Safari відкрий ту саму GitHub Pages адресу і зроби refresh.
6. Знову відкрий Warrior Hub з Home Screen.

Client ID, OneDrive setup та IndexedDB notes повинні лишитися на місці.

## Перша установка — GitHub Pages

1. Розпакуй `Warrior-Hub-Mobile-v0.4.zip`.
2. На GitHub створи repository, наприклад **warrior-hub-mobile**.
3. Закинь у root repository: `index.html`, `app.js`, `app.css`, `service-worker.js`, `manifest.webmanifest`, `icons/`, `resources/`.
4. Repository → **Settings → Pages**.
5. **Build and deployment → Deploy from a branch**.
6. Branch: `main`, folder: `/(root)` → Save.
7. GitHub дасть URL приблизно `https://YOURNAME.github.io/warrior-hub-mobile/`.
8. Відкрий його в Safari на iPhone/iPad.

## Microsoft login / OneDrive

Це робиться один раз.

1. У Mobile відкрий **Setup**.
2. Скопіюй **Register this exact SPA Redirect URI**.
3. Microsoft Entra admin center → **App registrations → New registration**.
4. Name: `Warrior Hub Mobile`.
5. Supported account types: варіант із **personal Microsoft accounts**, якщо твій OneDrive особистий.
6. Create.
7. Overview → скопіюй **Application (client) ID**.
8. **Authentication → Add a platform → Single-page application**.
9. Встав ТОЧНИЙ Redirect URI з Mobile → Save.
10. **API permissions → Add a permission → Microsoft Graph → Delegated permissions**.
11. Додай `Files.ReadWrite` і `User.Read`.
12. **Client secret не створюй.** Mobile використовує Authorization Code + PKCE.
13. Warrior Hub Mobile → Setup → встав Client ID.
14. `OneDrive folder path`: `WARRIOR HUB`.
15. `Tenant`: `common`.
16. **Save settings → Sign in with Microsoft**.
17. Увійди в той самий Microsoft account, що й на PC.
18. Після повернення натисни **Sync**.

Якщо бачиш `OneDrive conflict-safe sync · ... assignments` — синхронізація працює.

## Поставити як app

На iPhone/iPad у Safari:

**Share → Add to Home Screen → Add**.

Після цього краще запускати Warrior Hub саме з Home Screen.

## Як користуватися новими Notes

У вкладці **✍ Notes**:

### Фото / скріншоти / файли

Натисни **＋ Insert**. Є 4 швидкі способи:

- **Photos / screenshots** — вибрати одну або багато картинок із Photos;
- **Camera** — одразу сфотографувати дошку, конспект або лабораторну;
- **Files** — вставити image/PDF/document як attachment;
- **Paste** — вставити screenshot/image з clipboard, якщо браузер дає доступ.

Також можна **drag & drop** файли прямо на notebook. Після вставки натисни **↖ Select**: картинку можна перетягувати пальцем/Pencil, тягнути за нижній правий маркер для resize, `Fit width`, `Open`, `Delete`. Видалення з аркуша не стирає media-asset із safety storage одразу — це навмисно, щоб випадкове видалення не було єдиною копією.

Images оптимізуються для note-taking (дуже великі фото зменшуються до розумного розміру), а decoded images поза екраном не тримаються всі в RAM. Оригінальний notebook усе одно зберігається локально до cloud backup.

Далі інструменти:

- `‹ Course ›` — перемикання між уроками/предметами;
- `‹ дата ›`, `Today` і chips — швидке сортування notebooks по днях;
- `Pen`, `Highlighter`, `Eraser`, Undo/Redo, Color, Size;
- `Ruled / Grid / Blank`;
- **ніяких pages у UI** — просто скроль вниз, папір продовжиться автоматично;
- на iPad **Apple Pencil малює**, палець за замовчуванням скролить;
- `☝ Pan` → `☝ Draw` дозволяє малювати пальцем.

Після stroke notes одразу пишуться локально. Через коротку паузу app пробує зробити OneDrive snapshot. Без інтернету ти продовжуєш писати, а статус буде `Saved locally · cloud pending`.

## Backup, який я реально рекомендую

Setup → **Drawing-note safety**:

- **Back up notes now** — залити всі dirty drawing segments у OneDrive;
- **Restore/merge from OneDrive** — підтягнути cloud snapshots без знищення локальних unsynced змін;
- **Export local backup** — скачати JSON-копію drawing notes;
- **Import backup** — merge JSON назад, без видалення локальних originals.

Перед важливою парою/іспитом або раз на кілька днів: **Back up notes now**. Раз на тиждень можна ще робити **Export local backup**.

Drawing snapshots лежать у:

`WARRIOR HUB/warrior-notes-v2/`

Media-assets лежать у:

`WARRIOR HUB/warrior-notes-v2/assets/`

При backup Warrior спочатку заливає media asset, і лише потім snapshot сторінки, яка на нього посилається. Їх багато навмисно — старі revisions не перезаписуються.

## Якщо OneDrive каже file not found

На PC:

1. Warrior Hub → OneDrive connected.
2. `Sync now`.
3. Перевір, що є `WARRIOR HUB/warrior-hub-sync-devices/` і device JSON. Legacy `warrior-hub-sync.json` може залишатися як read-only migration backup.
4. На Mobile folder path має бути точно `WARRIOR HUB`.

## Course shortcuts у Mobile
У assignment cards автоматично з'являються відповідні shortcuts: Calculus book, Being Good PDF, а для **General Chemistry II Laboratory / course 244636** — **🧪 Chem 2 Lab** на Catalyst course 6760.
