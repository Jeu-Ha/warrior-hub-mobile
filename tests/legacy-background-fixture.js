// Browser bootstrap fixture; no account credentials or network services.
const DEFAULT_STUDY={
  workMinutes: 50,
  breakMinutes: 10,
  phase: 'work',
  running: false,
  endAt: null,
  remainingMs: 50 * 60 * 1000,
  cycles: 0,
  autoAdvance: true,
  focusAssignmentId: '',
  focusText: '',
  notes: '',
  notesByCourse: {},
  noteBooks: {},
  notesSubjectKey: 'general',
  notesDayKey: '',
  theme: 'midnight',
  videoTheme: 'library',
  spotifyUrl: 'https://open.spotify.com/playlist/3pRLVP3hoPzbZtetvH1tro?si=7ad7fd89c1584d01',
  spotifyActive: true,
  phaseFxEnabled: true,
  musicFxWanted: true,
};
const DEFAULT_STATE={
  assignments: [],
  announcements: [],
  courses: [],
  schedule: [],
  scheduleMeta: { term: null, capturedAt: null, sourceUrl: null },
  mail: [],
  sync: {
    canvas: { status: 'never', lastSync: null, message: 'Not synced yet' },
    mail: { status: 'never', lastSync: null, message: 'Wayne Mail not synced yet' },
    registration: { status: 'never', lastSync: null, message: 'Capture your schedule once' },
    academica: { status: 'unknown', lastSeen: null }
  },
  settings: {
    notifyDueSoon: true,
    dueSoonHours: 24,
    refreshMinutes: 10
  },
  hiddenAssignments: [],
  manualAssignmentStatus: {},
  todos: [],
  resourceProgress: { calculusUrl: '', calculusUpdatedAt: null },
  previewRead: { announcements: [], mail: [] },
  notified: {},
  notifiedMail: {},
  study: structuredClone(DEFAULT_STUDY)
};
async function ensureSpotifyEngine(){return false}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 (async()=>{const got=await chrome.storage.local.get('warriorState');let state=got.warriorState||structuredClone(DEFAULT_STATE);
 if(message.type==='GET_STATE')return {ok:true,state,urls:{canvas:'https://canvas.wayne.edu/',connect:'https://connect.wayne.edu/'}};
 if(message.type==='ADD_TODO'){state.todos.push({id:crypto.randomUUID(),title:message.title,updatedAt:new Date().toISOString()});await chrome.storage.local.set({warriorState:state});return {ok:true,state}}
 if(message.type==='SPOTIFY_ENGINE_INIT'){await ensureSpotifyEngine();return {ok:true}}
 if(message.type==='SPOTIFY_ENGINE_COMMAND'){await ensureSpotifyEngine();return chrome.runtime.sendMessage({type:'SPOTIFY_ENGINE_EXEC',command:message.command})}
 return {ok:false,error:'Unknown message'};
 })().then(respond,error=>respond({ok:false,error:error.message}));return true;
});
