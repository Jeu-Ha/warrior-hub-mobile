(() => {
  if (window.__warriorRegistrationLoaded) return;
  window.__warriorRegistrationLoaded = true;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'WARRIOR_CAPTURE_REGISTRATION') return;
    captureSchedule()
      .then(payload => sendResponse({ ok: true, payload }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  });



  async function captureSchedule() {
    // Wayne uses Ellucian Banner StudentRegistrationSSB. On Registration History,
    // the visible registrations table contains CRNs, while meeting times are
    // returned separately by Banner. Prefer those structured data over scraping
    // the visual calendar.
    const courses = parseRegisteredCourses();
    const term = detectTermCode();
    const errors = [];
    let schedule = [];

    if (courses.length && term) {
      const fromMeetings = await captureFromFacultyMeetingTimes(courses, term, errors);
      schedule.push(...fromMeetings);
    }

    // Banner also exposes the exact events used by its schedule calendar.
    // This fallback is useful if Wayne's FacultyMeetingTimes endpoint varies.
    if (!schedule.length) {
      const fromEvents = await captureFromRegistrationEvents(courses, term, errors);
      schedule.push(...fromEvents);
    }

    // Final fallback for pages where meeting detail is already rendered in DOM.
    if (!schedule.length) {
      schedule.push(...captureFromDom());
    }

    return {
      schedule: dedupe(schedule),
      sourceUrl: location.href,
      capturedAt: new Date().toISOString(),
      term: term || null,
      registeredCourses: courses.length,
      diagnostics: errors.slice(0, 8)
    };
  }

  function parseRegisteredCourses() {
    const out = [];
    const tables = [...document.querySelectorAll('table')];
    for (const table of tables) {
      const headers = [...table.querySelectorAll('thead th, tr th')].map(el => clean(el.textContent).toLowerCase());
      const crnIndex = headers.findIndex(h => h === 'crn' || h.includes('crn'));
      const detailsIndex = headers.findIndex(h => h.includes('details'));
      const titleIndex = headers.findIndex(h => h === 'title' || h.includes('title'));
      if (crnIndex < 0) continue;

      for (const row of table.querySelectorAll('tbody tr')) {
        const cells = [...row.querySelectorAll('td')];
        if (!cells.length || crnIndex >= cells.length) continue;
        const crn = clean(cells[crnIndex]?.textContent);
        if (!/^\d{4,6}$/.test(crn)) continue;
        const details = detailsIndex >= 0 ? clean(cells[detailsIndex]?.textContent) : clean(row.textContent);
        const title = titleIndex >= 0 ? clean(cells[titleIndex]?.textContent) : '';
        const parsed = parseCourseDetails(details);
        out.push({
          crn,
          code: parsed.code,
          section: parsed.section,
          title,
          details,
          url: row.querySelector('a[href]')?.href || location.href
        });
      }
    }
    return dedupeBy(out, x => x.crn);
  }

  function parseCourseDetails(text) {
    // Wayne rows look like "MAT 2020, 501" or "CHM 1145, 001".
    const m = clean(text).match(/\b([A-Z]{2,5})\s*[- ]?\s*(\d{3,4})\s*,?\s*([A-Z0-9]{2,4})?\b/i);
    if (!m) return { code: '', section: '' };
    return { code: `${m[1].toUpperCase()} ${m[2]}`, section: m[3] || '' };
  }

  function detectTermCode() {
    const selects = [...document.querySelectorAll('select')];
    const candidates = [];
    for (const select of selects) {
      const opt = select.selectedOptions?.[0];
      if (!opt) continue;
      const value = clean(opt.value);
      const label = clean(opt.textContent);
      const score = /term/i.test(select.id + ' ' + select.name + ' ' + (select.getAttribute('aria-label') || '')) ? 5 : 0;
      if (/^\d{6}$/.test(value)) candidates.push({ value, score: score + 10, label });
      else if (/^\d{4,8}$/.test(value)) candidates.push({ value, score: score + 5, label });
    }
    candidates.sort((a,b) => b.score - a.score);
    if (candidates[0]) return candidates[0].value;

    // Some Banner pages keep the term in hidden form values.
    for (const el of document.querySelectorAll('input[type="hidden"]')) {
      const key = `${el.name || ''} ${el.id || ''}`;
      const value = clean(el.value);
      if (/term/i.test(key) && /^\d{4,8}$/.test(value)) return value;
    }
    return '';
  }

  async function captureFromFacultyMeetingTimes(courses, term, errors) {
    const result = [];
    // Keep requests sequential-ish to avoid hammering Banner.
    for (const course of courses) {
      try {
        const url = new URL('/StudentRegistrationSsb/ssb/searchResults/getFacultyMeetingTimes', location.origin);
        url.searchParams.set('term', term);
        url.searchParams.set('courseReferenceNumber', course.crn);
        const res = await fetch(url.href, {
          credentials: 'include',
          headers: { 'Accept': 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest' }
        });
        if (!res.ok) throw new Error(`meeting times ${res.status}`);
        const data = await res.json();
        result.push(...normalizeFacultyMeetingResponse(data, course, term));
      } catch (e) {
        errors.push(`${course.crn}: ${e.message}`);
      }
    }
    return result;
  }

  function normalizeFacultyMeetingResponse(data, course, term) {
    const sessions = [];
    const roots = Array.isArray(data) ? data : [data];
    const visit = value => {
      if (!value || typeof value !== 'object') return;
      if (value.meetingTime && typeof value.meetingTime === 'object') {
        sessions.push({ meetingTime: value.meetingTime, faculty: value.faculty || value.instructors || [] });
      }
      if (Array.isArray(value)) value.forEach(visit);
      else Object.values(value).forEach(visit);
    };
    roots.forEach(visit);

    return sessions.map((session, index) => {
      const mt = session.meetingTime || {};
      const days = daysFromMeetingTime(mt);
      const startTime = bannerTime(mt.beginTime || mt.startTime);
      const endTime = bannerTime(mt.endTime || mt.finishTime);
      if (!days.length || !startTime) return null;
      const building = clean(mt.buildingDescription || mt.building || '');
      const room = clean(mt.room || '');
      const locationText = [building, room].filter(Boolean).join(' ').trim();
      const instructor = instructorFromFaculty(session.faculty);
      return {
        id: `${term}|${course.crn}|${index}|${days.join('')}|${startTime}`,
        crn: course.crn,
        code: course.code || `CRN ${course.crn}`,
        section: course.section || '',
        title: course.title || '',
        days,
        startTime,
        endTime,
        location: locationText,
        instructor,
        startDate: mt.startDate || null,
        endDate: mt.endDate || null,
        url: location.href
      };
    }).filter(Boolean);
  }

  async function captureFromRegistrationEvents(courses, term, errors) {
    try {
      const url = new URL('/StudentRegistrationSsb/ssb/classRegistration/getRegistrationEvents', location.origin);
      url.searchParams.set('termFilter', term || 'null');
      const res = await fetch(url.href, {
        credentials: 'include',
        headers: { 'Accept': 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest' }
      });
      if (!res.ok) throw new Error(`registration events ${res.status}`);
      const data = await res.json();
      const events = extractObjects(data);
      const byCrn = new Map(courses.map(c => [String(c.crn), c]));
      const out = [];
      for (const event of events) {
        const item = normalizeBannerEvent(event, byCrn, term);
        if (item) out.push(item);
      }
      return out;
    } catch (e) {
      errors.push(e.message);
      return [];
    }
  }

  function extractObjects(value) {
    const out = [];
    const seen = new Set();
    const visit = obj => {
      if (!obj || typeof obj !== 'object' || seen.has(obj)) return;
      seen.add(obj);
      if (!Array.isArray(obj)) out.push(obj);
      if (Array.isArray(obj)) obj.forEach(visit);
      else Object.values(obj).forEach(visit);
    };
    visit(value);
    return out;
  }

  function normalizeBannerEvent(event, byCrn, term) {
    const mt = event.meetingTime || event.meeting || event;
    const crn = clean(event.courseReferenceNumber || event.crn || mt.courseReferenceNumber || '');
    const course = byCrn.get(crn) || {};
    let days = daysFromMeetingTime(mt);
    let startTime = bannerTime(mt.beginTime || mt.startTime || event.beginTime);
    let endTime = bannerTime(mt.endTime || mt.finishTime || event.endTime);

    // FullCalendar-style event objects may expose ISO timestamps instead.
    if ((!days.length || !startTime) && event.start) {
      const d = new Date(event.start);
      if (!Number.isNaN(d.getTime())) {
        days = [dayKey(d.getDay())];
        startTime = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      }
      const end = event.end ? new Date(event.end) : null;
      if (end && !Number.isNaN(end.getTime())) endTime = `${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}`;
    }
    if (!days.length || !startTime) return null;

    const code = course.code || clean(event.subjectCourse || event.courseCode || event.subject || '') || (crn ? `CRN ${crn}` : 'Class');
    const title = course.title || clean(event.courseTitle || event.title || '');
    const building = clean(mt.buildingDescription || mt.building || event.buildingDescription || event.building || '');
    const room = clean(mt.room || event.room || '');
    const instructor = instructorFromFaculty(event.faculty || event.instructors || []);
    return {
      id: `${term || ''}|${crn}|${days.join('')}|${startTime}|${code}`,
      crn,
      code,
      section: course.section || clean(event.sequenceNumber || event.section || ''),
      title,
      days,
      startTime,
      endTime,
      location: [building, room].filter(Boolean).join(' ').trim(),
      instructor,
      url: location.href
    };
  }

  function captureFromDom() {
    const rows = findCandidateRows();
    const items = [];
    for (const row of rows) {
      const text = clean(row.innerText || row.textContent || '');
      if (!text || text.length < 8) continue;
      const parsed = parseRenderedMeeting(text, row);
      if (parsed) items.push(parsed);
    }
    return dedupe(items);
  }

  function findCandidateRows() {
    const selectors = [
      '.schedule-detail-item', '.schedule-details [role="row"]', '.schedule-details tr',
      '.meeting', '.registered-course', '.course-item', '.class-schedule-item',
      '.fc-event', '.fc-time-grid-event', '[class*="schedule"] [class*="event"]'
    ];
    const set = new Set();
    selectors.forEach(sel => document.querySelectorAll(sel).forEach(el => set.add(el)));
    return [...set];
  }

  function parseRenderedMeeting(text, row) {
    const courseMatch = text.match(/\b([A-Z]{2,5})\s*[- ]?\s*(\d{3,4})\b/i);
    const timeMatch = text.match(/\b(\d{1,2}:\d{2})\s*(AM|PM)?\s*[-–]\s*(\d{1,2}:\d{2})\s*(AM|PM)?\b/i);
    const days = parseDays(text);
    if (!courseMatch || !timeMatch || !days.length) return null;
    const code = `${courseMatch[1].toUpperCase()} ${courseMatch[2]}`;
    return {
      id: `${code}|${days.join('')}|${timeMatch[0]}`,
      code,
      title: '',
      days,
      startTime: normalizeTime(timeMatch[1], timeMatch[2] || timeMatch[4]),
      endTime: normalizeTime(timeMatch[3], timeMatch[4] || timeMatch[2]),
      location: guessLocation(text),
      instructor: guessInstructor(text),
      url: row.querySelector('a[href]')?.href || location.href
    };
  }

  function daysFromMeetingTime(mt) {
    const map = [
      ['monday','Mon'], ['tuesday','Tue'], ['wednesday','Wed'], ['thursday','Thu'],
      ['friday','Fri'], ['saturday','Sat'], ['sunday','Sun']
    ];
    const out = [];
    for (const [key, day] of map) {
      if (mt?.[key] === true || mt?.[key] === 'true' || mt?.[key] === 'Y') out.push(day);
    }
    if (out.length) return out;
    return parseDays(clean(mt?.days || mt?.day || mt?.meetingDays || ''));
  }

  function bannerTime(value) {
    if (value == null) return null;
    const raw = clean(value);
    if (!raw) return null;
    if (/^\d{3,4}$/.test(raw)) {
      const s = raw.padStart(4, '0');
      return `${s.slice(0,2)}:${s.slice(2)}`;
    }
    const m = raw.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
    if (m) return normalizeTime(`${m[1]}:${m[2]}`, m[3]);
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    return null;
  }

  function instructorFromFaculty(faculty) {
    const list = Array.isArray(faculty) ? faculty : faculty ? [faculty] : [];
    const person = list.find(x => x?.primaryIndicator) || list[0];
    return clean(person?.displayName || person?.name || person?.fullName || '');
  }

  function parseDays(text) {
    const upper = ` ${String(text || '').toUpperCase()} `;
    const out = [];
    const words = [
      ['MONDAY','Mon'], ['TUESDAY','Tue'], ['WEDNESDAY','Wed'], ['THURSDAY','Thu'],
      ['FRIDAY','Fri'], ['SATURDAY','Sat'], ['SUNDAY','Sun']
    ];
    for (const [full, short] of words) if (upper.includes(full)) out.push(short);
    if (out.length) return out;
    const compact = upper.match(/\b(MWF|MW|WF|TR|TTH|MTR|MTWRF|M|T|W|R|F)\b/);
    if (!compact) return [];
    const map = { M:'Mon', T:'Tue', W:'Wed', R:'Thu', F:'Fri' };
    return [...compact[1].replace('TH','R')].map(c => map[c]).filter(Boolean);
  }

  function normalizeTime(raw, meridiem) {
    let [h, m] = String(raw).split(':').map(Number);
    const ap = String(meridiem || '').toUpperCase();
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }

  function guessLocation(text) {
    const m = text.match(/(?:Location|Where|Room)\s*:?\s*([^\n|]{2,80})/i);
    return m ? clean(m[1]) : '';
  }

  function guessInstructor(text) {
    const m = text.match(/(?:Instructor|Professor)\s*:?\s*([^\n|]{2,80})/i);
    return m ? clean(m[1]) : '';
  }

  function dayKey(index) { return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][index]; }
  function dedupe(items) { return dedupeBy(items, x => x.id); }
  function dedupeBy(items, keyFn) {
    const map = new Map();
    for (const item of items) {
      if (!item) continue;
      const key = keyFn(item);
      if (!map.has(key)) map.set(key, item);
    }
    return [...map.values()];
  }
  function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
})();
