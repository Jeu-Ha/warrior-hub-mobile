const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..');const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const app=read('app.js'),html=read('index.html'),css=read('app.css'),sw=read('service-worker.js'),manifest=read('manifest.webmanifest');
assert(app.includes("APP_VERSION='0.8.1'"));
assert(app.includes("DRAW_DB='warrior-mobile-drawing-notes-v2'"));
assert(app.includes('DRAW_DB_VERSION=2'));
assert(app.includes("objectStoreNames.contains('assets')"));
assert(app.includes('appendBlankSegment'));
assert(app.includes('maybeGrowInfinitePaper'));
assert(app.includes('IntersectionObserver'));
assert(app.includes('getCoalescedEvents'));
assert(app.includes('emergencyDrawingSnapshot'));
assert(app.includes('createAssetFromFile'));
assert(app.includes('normalizedImageBlob'));
assert(app.includes('pasteFromClipboard'));
assert(app.includes('insertFiles'));
assert(app.includes('assetBitmapCache'));
assert(app.includes('ensureNotesAssetsFolder'));
assert(app.includes('uploadAsset'));
assert(app.includes('ensurePageAssetsLocal'));
assert(app.includes('blobToDataUrl'));
assert(app.includes('dataUrlToBlob'));
assert(app.includes('deleteSelectedItem'));
assert(app.includes('fitSelectedItem'));
assert(app.includes("CHEM2_LAB_URL='https://canvas.wayne.edu/courses/244636/modules/items/6576907'"));
assert(!app.includes('addPageBtn'));
assert(!html.includes('Add page'));
assert(html.includes('id="infinitePaper"'));
assert(html.includes('Photos / screenshots'));
assert(html.includes('id="cameraPickerInput"'));
assert(html.includes('id="noteFilePickerInput"'));
assert(html.includes('data-tool="select"'));
assert(html.includes('id="insertNoteItemBtn"'));
assert(css.includes('.insert-sheet'));
assert(css.includes('.drawing-viewport.drag-over'));
assert(sw.includes("warrior-mobile-v0.8.1"));
assert(manifest.includes('screenshots'));
assert(app.includes("REMOTE_LIVE_FILE='warrior-mobile-live.json'"));assert(app.includes("REMOTE_COMMAND_DIR='warrior-mobile-commands'"));assert(app.includes("MOBILE_VAPID_PUBLIC_KEY="));assert(app.includes("sendRemoteCommand"));assert(app.includes("enablePhoneAlerts"));assert(html.includes('id="view-study"'));assert(html.includes('id="enablePhoneAlertsBtn"'));assert(html.includes('data-tool="pencil"'));assert(css.includes('.apple-notes-view'));assert(css.includes('.apple-markup-toolbar'));assert(sw.includes("self.addEventListener('push'"));assert(sw.includes("self.addEventListener('notificationclick'"));assert(html.includes('id="view-todos"'));assert(app.includes('toggleTodoMobile'));assert(app.includes('manualAssignmentStatus'));assert(css.includes('grid-template-columns:repeat(5'));console.log('PASS Mobile v0.7 checklist + compact nav + Apple-style notes + remote + Web Push');

assert(app.includes("const nav=$('.tabs')"));assert(!app.includes("\n  $('.tab').forEach"));assert(app.includes("prompt:'none'"));assert(css.includes('large reliable mobile navigation'));

assert(html.includes('app.css?v=0.8.1'));assert(html.includes('app.js?v=0.8.1'));assert(app.includes("updateViaCache:'none'"));assert(app.includes('controllerchange'));assert(sw.includes("cache:'no-store'"));

assert(app.includes("studyView?.addEventListener('pointerup'"));assert(app.includes("'study-remote-tap'"));assert(css.includes('harden Study/Spotify touch controls'));assert(html.includes('type="button" id="remoteSpotifyNext"'));

assert(app.includes('optimisticSpotify(action,payload)'));assert(app.includes('nextPreview'));assert(app.includes('REMOTE_POLL_MS=600'));assert(css.includes('optimistic Study player UI'));

assert(app.includes('function predictStudy'));assert(app.includes('function optimisticStudy'));assert(app.includes('REMOTE_STALE_MS=90000'));assert(app.includes("Desktop syncing…"));assert(app.includes('remoteDisplayStudy().running'));

assert(app.includes("STYLUS_TOUCH_KEY='warriorMobileStylusTouchV08'"));
assert(app.includes("data-tool==='hand'")||app.includes("drawTool==='hand'"));
assert(app.includes("touchInk=e.pointerType==='touch'&&fingerDraw"));
assert(app.includes("document.body.classList.toggle('notes-workspace-mode'"));
assert(html.includes('id="exitNotesBtn"'));
assert(html.includes('data-tool="hand"'));
assert(html.includes('id="fingerDrawBtn"'));
assert(css.includes('Warrior Notes: standalone tablet-first workspace'));
assert(css.includes('body.notes-workspace-mode .topbar'));

assert(app.includes("CHEM2_LAB_KRITIK_URL='https://us.kritik.io/course/cms9aaapu00040pn934f1gbnc/assignments'"));assert(app.includes('🧪 Kritik'));
