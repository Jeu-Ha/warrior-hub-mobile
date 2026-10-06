(() => {
  if (window.__warriorCanvasLoadedV56) return;
  window.__warriorCanvasLoadedV56 = true;


  const DEBUG_ENABLED_KEY='warriorDebugEnabledV59';let warriorDebugEnabled=false;
  chrome.storage.local.get(DEBUG_ENABLED_KEY).then(g=>warriorDebugEnabled=!!g?.[DEBUG_ENABLED_KEY]).catch(()=>{});
  chrome.storage.onChanged.addListener((c,a)=>{if(a==='local'&&c[DEBUG_ENABLED_KEY])warriorDebugEnabled=!!c[DEBUG_ENABLED_KEY].newValue});
  function debug(event,data={}){if(!warriorDebugEnabled)return;try{chrome.runtime.sendMessage({type:'DEBUG_LOG',source:'canvas-content',event,data}).catch(()=>{})}catch(_){}}
  window.addEventListener('error',e=>debug('window-error',{message:e.message,filename:e.filename,lineno:e.lineno,colno:e.colno,error:String(e.error?.stack||e.error||'')}));
  window.addEventListener('unhandledrejection',e=>debug('unhandled-rejection',{reason:String(e.reason?.stack||e.reason||'')}));
  debug('canvas-script-boot',{href:location.href,title:document.title});

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'WARRIOR_SYNC_CANVAS') return;
    debug('canvas-sync-request',{reason:'background-message'});
    syncCanvas().then(payload => sendResponse({ ok: true, payload }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  });

  let autoSyncPromise = null;
  let lastAutoSyncAt = 0;
  async function autoSync(reason='auto') {
    if (autoSyncPromise) return autoSyncPromise;
    debug('canvas-auto-sync-trigger',{reason,hidden:document.hidden,href:location.href});
    // Keep Canvas fresh without hammering its API if multiple navigation events fire together.
    if (Date.now() - lastAutoSyncAt < 20000) return;
    lastAutoSyncAt = Date.now();
    autoSyncPromise = syncCanvas().then(payload => {debug('canvas-auto-sync-result',{reason,assignments:payload.assignments?.length||0,announcements:payload.announcements?.length||0,courses:payload.courses?.length||0,diagnostics:payload.diagnostics||[]});return chrome.runtime.sendMessage({ type:'CANVAS_SYNC_RESULT', payload }).catch(()=>{});}).catch(e=>debug('canvas-auto-sync-error',{reason,error:String(e?.message||e)})).finally(()=>{autoSyncPromise=null;});
    return autoSyncPromise;
  }

  // Opening Canvas is the permission: first sync automatically, then refresh every minute.
  setTimeout(() => autoSync('open'), 900);
  setInterval(() => autoSync('interval'), 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) autoSync('visible'); });

  async function syncCanvas() {
    if (!location.hostname.includes('canvas.wayne.edu') && !location.hostname.includes('instructure.com')) {
      throw new Error('Not on Canvas');
    }

    const coursesRaw = await fetchAll('/api/v1/courses?enrollment_state=active&enrollment_type=student&include[]=term&include[]=total_scores&per_page=100');
    const courses = coursesRaw
      .filter(c => c && c.id && !c.access_restricted_by_date)
      .map(c => ({
        id: c.id,
        name: c.name || c.course_code || `Course ${c.id}`,
        code: c.course_code || '',
        term: c.term?.name || '',
        applyAssignmentGroupWeights: Boolean(c.apply_assignment_group_weights),
        url: `${location.origin}/courses/${c.id}`
      }));
    const courseMap = new Map(courses.map(c => [String(c.id), c]));

    const assignmentMap = new Map();
    const diagnostics = [];
    const audit = [];

    // Planner is useful for marked-complete/submission state, but it is NOT treated
    // as the authoritative assignment inventory.
    try {
      const start = new Date(); start.setDate(start.getDate() - 120);
      const end = new Date(); end.setDate(end.getDate() + 365);
      const planner = await fetchAll(`/api/v1/planner/items?start_date=${encodeURIComponent(start.toISOString())}&end_date=${encodeURIComponent(end.toISOString())}&per_page=100`);
      for (const item of planner) {
        const normalized = normalizePlannerItem(item, courseMap);
        if (normalized) assignmentMap.set(String(normalized.id), normalized);
      }
    } catch (e) {
      diagnostics.push(`planner: ${e.message}`);
    }

    // Full course audit. We intentionally do not date-filter here: future homework,
    // exams, no-due-date items and older submitted work all belong in the master list.
    // Assignment Groups with include[]=assignments are a second inventory source because
    // some Canvas course setups expose items there that Planner/direct listing can omit.
    for (const course of courses) {
      const row = {
        courseId: String(course.id),
        courseName: course.name || course.code,
        directAssignments: 0,
        groupAssignments: 0,
        mergedAssignments: 0,
        errors: []
      };
      try {
        let groups = [];
        try {
          groups = await fetchAll(`/api/v1/courses/${course.id}/assignment_groups?include[]=assignments&include[]=submission&include[]=overrides&per_page=100`);
        } catch (e) {
          row.errors.push(`groups: ${e.message}`);
          diagnostics.push(`${course.code || course.id} groups: ${e.message}`);
        }

        let direct = [];
        try {
          direct = await fetchAll(`/api/v1/courses/${course.id}/assignments?order_by=due_at&include[]=submission&include[]=overrides&per_page=100`);
        } catch (e) {
          row.errors.push(`assignments: ${e.message}`);
          diagnostics.push(`${course.code || course.id} assignments: ${e.message}`);
        }
        row.directAssignments = direct.length;

        const groupAssignments = [];
        for (const g of groups) {
          for (const a of (Array.isArray(g?.assignments) ? g.assignments : [])) {
            if (!a || !a.id) continue;
            groupAssignments.push({ ...a, assignment_group_id: a.assignment_group_id ?? g.id });
          }
        }
        row.groupAssignments = groupAssignments.length;

        // Merge all course-level assignment sources by Canvas assignment id.
        // Prefer the direct object where it exists because include[]=submission tends
        // to be freshest, while retaining fields only present in assignment groups.
        const rawById = new Map();
        for (const a of groupAssignments) if (a?.id) rawById.set(String(a.id), a);
        for (const a of direct) if (a?.id) rawById.set(String(a.id), { ...(rawById.get(String(a.id)) || {}), ...a });
        row.mergedAssignments = rawById.size;

        const groupMap = new Map(groups.map(g => [String(g.id), {
          id: g.id,
          name: g.name || 'Assignment group',
          weight: finiteNumber(g.group_weight),
          totalPoints: 0
        }]));
        let totalCoursePoints = 0;
        for (const a of rawById.values()) {
          if (a.omit_from_final_grade) continue;
          const pts = positiveNumber(a.points_possible);
          if (!pts) continue;
          totalCoursePoints += pts;
          const gm = groupMap.get(String(a.assignment_group_id || ''));
          if (gm) gm.totalPoints += pts;
        }
        const groupWeightSum = [...groupMap.values()].reduce((sum, g) => sum + Math.max(0, Number(g.weight || 0)), 0);
        const weighted = Boolean(course.applyAssignmentGroupWeights || groupWeightSum > 0.01);

        for (const a of rawById.values()) {
          const group = groupMap.get(String(a.assignment_group_id || '')) || null;
          const normalized = normalizeAssignment(a, course, { weighted, totalCoursePoints, group });
          mergeNormalizedAssignment(assignmentMap, normalized);
        }

        // Canvas exams are often implemented as Classic/New Quizzes.  Do not assume a quiz
        // must appear in /assignments: student-visible quizzes are an independent inventory.
        try {
          const quizzes = await fetchAll(`/api/v1/courses/${course.id}/quizzes?per_page=100`);
          row.quizzes = quizzes.length;
          let recovered = 0;
          for (const q of quizzes) {
            if (!q || !q.id) continue;
            const assignmentId = q.assignment_id || null;

            // If Canvas exposes the assignment backing this quiz, pull the richer object
            // (submission state, points, group) first.
            if (assignmentId) {
              const existing = [...assignmentMap.values()].some(x =>
                String(x?.courseId) === String(course.id) &&
                (String(x?.canvasId) === String(assignmentId) || String(x?.assignmentId || '') === String(assignmentId))
              );
              if (!existing) {
                try {
                  const r = await fetch(`/api/v1/courses/${course.id}/assignments/${assignmentId}?include[]=submission`, { credentials:'include', headers:{Accept:'application/json'} });
                  if (r.ok) {
                    const a = await r.json();
                    const group = groupMap.get(String(a.assignment_group_id || '')) || null;
                    mergeNormalizedAssignment(assignmentMap, normalizeAssignment(a, course, { weighted, totalCoursePoints, group }));
                    recovered += 1;
                  }
                } catch (_) {}
              }
            }

            // Always merge the quiz itself too.  This is the important fallback for exams
            // that Canvas exposes in Quizzes/Modules but omits from the assignment endpoint.
            mergeNormalizedAssignment(assignmentMap, normalizeQuiz(q, course, { weighted, totalCoursePoints }));
          }
          row.quizRecovered = recovered;
        } catch (e) {
          const msg=String(e?.message||e);
          if(/Canvas API 404/i.test(msg)){
            row.quizzes=0;
            row.quizRecovered=0;
            row.optionalWarnings=[...(row.optionalWarnings||[]),`quizzes: ${msg}`];
          }else{
            row.errors.push(`quizzes: ${msg}`);
            diagnostics.push(`${course.code || course.id} quizzes: ${msg}`);
          }
        }

        // Modules are a third inventory.  Some instructors publish an exam as a module item
        // before (or without) a normal Assignment object.  Preserve visible major-assessment
        // module entries instead of silently dropping them.
        try {
          const modules = await fetchAll(`/api/v1/courses/${course.id}/modules?include[]=items&per_page=100`);
          let moduleMajors = 0;
          for (const mod of modules) {
            let items = Array.isArray(mod?.items) ? mod.items : [];
            const expected = Number(mod?.items_count || 0);
            if (!items.length || (expected > 0 && items.length < expected)) {
              try {
                items = await fetchAll(`/api/v1/courses/${course.id}/modules/${mod.id}/items?per_page=100`);
              } catch (e) {
                row.errors.push(`module ${mod.id} items: ${e.message}`);
                diagnostics.push(`${course.code || course.id} module ${mod.id} items: ${e.message}`);
              }
            }
            for (const item of items) {
              const majorKind = detectMajorKind(item?.title || '');
              if (!majorKind) continue;
              const normalized = normalizeModuleMajor(item, course, majorKind);
              if (!normalized) continue;
              mergeNormalizedAssignment(assignmentMap, normalized);
              moduleMajors += 1;
            }
          }
          row.moduleMajors = moduleMajors;
        } catch (e) {
          // Module access can be restricted independently of Assignments/Quizzes.  Record
          // it for audit visibility, but the other inventories still remain usable.
          row.errors.push(`modules: ${e.message}`);
          diagnostics.push(`${course.code || course.id} modules: ${e.message}`);
        }
      } catch (e) {
        row.errors.push(String(e?.message || e));
        diagnostics.push(`${course.code || course.id}: ${e.message}`);
      }
      row.finalItems = [...assignmentMap.values()].filter(x => String(x?.courseId || '') === String(course.id)).length;
      audit.push(row);
    }

    // Major assessments can also be plain Canvas calendar events rather than assignments.
    // Scan a broad current-term window and keep only exam/test/midterm/final-like events.
    try {
      const eventStart = new Date(); eventStart.setDate(eventStart.getDate() - 45);
      const eventEnd = new Date(); eventEnd.setDate(eventEnd.getDate() + 240);
      for (let i = 0; i < courses.length; i += 10) {
        const chunk = courses.slice(i, i + 10);
        const params = new URLSearchParams();
        params.set('type', 'event');
        params.set('start_date', eventStart.toISOString());
        params.set('end_date', eventEnd.toISOString());
        params.set('per_page', '100');
        chunk.forEach(c => params.append('context_codes[]', `course_${c.id}`));
        const events = await fetchAll(`/api/v1/calendar_events?${params.toString()}`);
        for (const ev of events) {
          const title = ev?.title || '';
          const majorKind = detectMajorKind(title);
          if (!majorKind) continue;
          const courseId = String(ev?.context_code || ev?.context_code_id || '').replace(/^course_/, '');
          const course = courseMap.get(courseId);
          if (!course) continue;
          mergeNormalizedAssignment(assignmentMap, normalizeCalendarMajor(ev, course, majorKind));
        }
      }
    } catch (e) {
      diagnostics.push(`calendar exams: ${e.message}`);
    }

    const assignments = [...assignmentMap.values()].sort((a, b) => Date.parse(a.dueAt || '9999') - Date.parse(b.dueAt || '9999'));

    let announcements = [];
    const ids = courses.map(c => c.id);
    for (let i = 0; i < ids.length; i += 10) {
      const chunk = ids.slice(i, i + 10);
      if (!chunk.length) continue;
      const params = new URLSearchParams();
      chunk.forEach(id => params.append('context_codes[]', `course_${id}`));
      const aStart = new Date(); aStart.setDate(aStart.getDate() - 30);
      params.set('start_date', aStart.toISOString());
      params.set('end_date', new Date(Date.now() + 30 * 86400000).toISOString());
      params.set('active_only', 'true');
      params.set('per_page', '100');
      try {
        announcements.push(...await fetchAll(`/api/v1/announcements?${params.toString()}`));
      } catch (e) {
        diagnostics.push(`announcements: ${e.message}`);
      }
    }

    announcements = announcements.map(a => {
      const courseId = String(a.context_code || '').replace('course_', '');
      const course = courseMap.get(courseId);
      const readState = String(a.read_state || '').toLowerCase();
      const unread = readState ? readState !== 'read' : (typeof a.unread === 'boolean' ? a.unread : true);
      return {
        id: a.id,
        title: a.title || 'Announcement',
        message: stripHtml(a.message || ''),
        postedAt: a.posted_at || a.created_at || null,
        courseId,
        courseName: course?.name || course?.code || `Course ${courseId}`,
        readState: readState || null,
        unread,
        url: normalizeCanvasUrl(a.html_url, courseId, 'announcement', a.id)
      };
    }).sort((a, b) => Date.parse(b.postedAt || 0) - Date.parse(a.postedAt || 0));

    if (!assignments.length && diagnostics.length) {
      throw new Error(`Canvas returned no assignments (${diagnostics.slice(0, 2).join('; ')})`);
    }

    const courseErrors = audit.filter(x => Array.isArray(x.errors) && x.errors.length);
    const result = {
      assignments,
      announcements,
      courses,
      sourceOrigin: location.origin,
      diagnostics: diagnostics.slice(0, 20),
      audit: {
        complete: courseErrors.length === 0,
        coursesChecked: audit.length,
        coursesTotal: courses.length,
        courseErrors: courseErrors.map(x => ({courseId:x.courseId,courseName:x.courseName,errors:x.errors})).slice(0,20),
        courses: audit
      }
    };
    debug('canvas-sync-complete',{assignments:assignments.length,announcements:announcements.length,courses:courses.length,diagnostics:result.diagnostics,audit:result.audit});
    return result;
  }

  function mergeNormalizedAssignment(assignmentMap, normalized) {
    if (!normalized) return;
    let existingKey = '';
    const normCourse = String(normalized.courseId || '');
    const normCanvas = String(normalized.canvasId ?? '');
    const normAssignment = String(normalized.assignmentId ?? '');
    const normQuiz = String(normalized.quizId ?? '');
    const normTitle = normalizeTitleKey(normalized.title);
    const normDue = Date.parse(normalized.dueAt || '');

    for (const [k, v] of assignmentMap) {
      if (String(v?.courseId || '') !== normCourse) continue;
      const vCanvas = String(v?.canvasId ?? '');
      const vAssignment = String(v?.assignmentId ?? '');
      const vQuiz = String(v?.quizId ?? '');

      const idMatch = Boolean(
        (normCanvas && vCanvas && normCanvas === vCanvas) ||
        (normAssignment && (normAssignment === vCanvas || normAssignment === vAssignment)) ||
        (vAssignment && (vAssignment === normCanvas || (normAssignment && vAssignment === normAssignment))) ||
        (normQuiz && (normQuiz === vQuiz || normQuiz === vCanvas)) ||
        (vQuiz && (vQuiz === normCanvas || (normQuiz && vQuiz === normQuiz)))
      );

      // Canvas may expose the same exam once as a quiz, once as an assignment, and once
      // as a module/calendar item with unrelated ids.  Same title + close due/start time
      // is a safe final dedupe signal within the same course.
      const vTitle = normalizeTitleKey(v?.title);
      const vDue = Date.parse(v?.dueAt || '');
      const placeholderMatch = Boolean(
        (!Number.isFinite(normDue) || !Number.isFinite(vDue)) &&
        (/^(module-audit|calendar-event)$/.test(String(normalized.source || '')) || /^(module-audit|calendar-event)$/.test(String(v?.source || '')))
      );
      const titleTimeMatch = Boolean(
        normTitle && vTitle && normTitle === vTitle &&
        (
          (!Number.isFinite(normDue) && !Number.isFinite(vDue)) ||
          (Number.isFinite(normDue) && Number.isFinite(vDue) && Math.abs(normDue - vDue) <= 36 * 3600000) ||
          placeholderMatch
        )
      );

      if (idMatch || titleTimeMatch) {
        existingKey = k;
        break;
      }
    }
    if (!existingKey) {
      assignmentMap.set(String(normalized.id), normalized);
      return;
    }
    const old = assignmentMap.get(existingKey) || {};
    const oldMajor = String(old.majorKind || '');
    const newMajor = String(normalized.majorKind || '');
    assignmentMap.set(existingKey, {
      ...old,
      ...normalized,
      id: old.id || normalized.id,
      canvasId: old.canvasId ?? normalized.canvasId,
      assignmentId: old.assignmentId ?? normalized.assignmentId ?? null,
      quizId: old.quizId ?? normalized.quizId ?? null,
      url: old.url || normalized.url,
      dueAt: old.dueAt || normalized.dueAt || null,
      points: normalized.points ?? old.points ?? null,
      pointsPossible: normalized.pointsPossible ?? old.pointsPossible ?? normalized.points ?? old.points ?? null,
      score: normalized.score ?? old.score ?? null,
      grade: normalized.grade || old.grade || '',
      excused: Boolean(normalized.excused || old.excused),
      gradedAt: normalized.gradedAt || old.gradedAt || null,
      gradePercent: normalized.gradePercent ?? old.gradePercent ?? null,
      description: old.description || normalized.description || '',
      majorKind: oldMajor || newMajor,
      importanceScore: Math.max(Number(old.importanceScore || 0), Number(normalized.importanceScore || 0)),
      importanceLabel: Number(old.importanceScore || 0) >= Number(normalized.importanceScore || 0)
        ? (old.importanceLabel || normalized.importanceLabel)
        : (normalized.importanceLabel || old.importanceLabel),
      submitted: Boolean(old.submitted || normalized.submitted),
      canvasSubmitted: Boolean(old.canvasSubmitted || normalized.canvasSubmitted || old.submitted || normalized.submitted),
      completed: Boolean(old.completed || normalized.completed || old.submitted || normalized.submitted),
      canvasCompleted: Boolean(old.canvasCompleted || normalized.canvasCompleted || old.completed || normalized.completed || old.submitted || normalized.submitted)
    });
  }

  function normalizeTitleKey(title) {
    return String(title || '')
      .toLowerCase()
      .replace(/\b(?:quiz|exam|examination|test)\s*#?\s*/g, m => m.trim() + ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeSubmissionGrade(submission, pointsPossible = null) {
    const list = Array.isArray(submission) ? submission.filter(Boolean) : (submission ? [submission] : []);
    const sub = list.find(x => x?.excused || x?.score !== null && x?.score !== undefined || x?.grade !== null && x?.grade !== undefined || x?.graded_at) || list[0] || null;
    const score = finiteNumber(sub?.score ?? sub?.entered_score);
    const possible = finiteNumber(pointsPossible);
    const rawGrade = sub?.grade ?? sub?.entered_grade ?? '';
    const grade = rawGrade === null || rawGrade === undefined ? '' : String(rawGrade).trim();
    const excused = Boolean(sub?.excused);
    const gradedAt = sub?.graded_at || sub?.posted_at || null;
    const gradePercent = score !== null && possible !== null && possible > 0 ? round2((score / possible) * 100) : null;
    return { score, grade, excused, gradedAt, gradePercent, pointsPossible: possible };
  }

  function normalizePlannerItem(item, courseMap) {
    if (!item) return null;
    const type = item.plannable_type || item.type || '';
    if (String(type).toLowerCase() === 'announcement') return null;
    const p = item.plannable || {};
    const courseId = String(item.course_id || item.context_id || p.course_id || '');
    const course = courseMap.get(courseId);
    const dueAt = p.due_at || item.plannable_date || item.due_at || null;
    const id = p.id || item.plannable_id || item.id;
    const title = p.title || item.title || p.name || 'Canvas item';
    const submission = item.submissions || item.submission || p.submission || null;
    const submitted = isSubmitted(submission);
    const grading = normalizeSubmissionGrade(submission, p.points_possible);
    return {
      id: `${type || 'item'}:${courseId}:${id}`,
      canvasId: id,
      assignmentId: /assignment/i.test(String(type || '')) ? id : null,
      quizId: /quiz/i.test(String(type || '')) ? id : null,
      type: type || 'assignment',
      title,
      dueAt,
      courseId,
      courseName: item.context_name || course?.name || course?.code || (courseId ? `Course ${courseId}` : 'Canvas'),
      courseCode: course?.code || '',
      url: normalizeCanvasUrl(p.html_url || item.html_url || item.plannable_url, courseId, type, id),
      submitted,
      canvasSubmitted: submitted,
      completed: Boolean(item.planner_override?.marked_complete || item.marked_complete || submitted),
      canvasCompleted: Boolean(item.planner_override?.marked_complete || item.marked_complete || submitted),
      points: p.points_possible ?? null,
      pointsPossible: grading.pointsPossible,
      score: grading.score,
      grade: grading.grade,
      excused: grading.excused,
      gradedAt: grading.gradedAt,
      gradePercent: grading.gradePercent,
      description: stripHtml(p.description || item.details || '').slice(0, 5000)
    };
  }

  function normalizeAssignment(a, course, stats = {}) {
    const submission = a.submission || null;
    const submitted = isSubmitted(submission);
    const points = finiteNumber(a.points_possible);
    const grading = normalizeSubmissionGrade(submission, a.points_possible);
    const importance = buildImportance({
      title: a.name || 'Assignment',
      dueAt: a.due_at || null,
      points,
      omitFromFinalGrade: Boolean(a.omit_from_final_grade),
      weighted: Boolean(stats.weighted),
      totalCoursePoints: finiteNumber(stats.totalCoursePoints),
      group: stats.group || null
    });
    return {
      id: `assignment:${course.id}:${a.id}`,
      canvasId: a.id,
      assignmentId: a.id,
      quizId: a.quiz_id ?? null,
      type: a.quiz_id ? 'quiz' : 'assignment',
      title: a.name || 'Assignment',
      dueAt: a.due_at || null,
      courseId: String(course.id),
      courseName: course.name || course.code,
      courseCode: course.code || '',
      url: normalizeCanvasUrl(a.html_url, course.id, 'assignment', a.id),
      submitted,
      canvasSubmitted: submitted,
      completed: submitted,
      canvasCompleted: submitted,
      points: a.points_possible ?? null,
      pointsPossible: grading.pointsPossible,
      score: grading.score,
      grade: grading.grade,
      excused: grading.excused,
      gradedAt: grading.gradedAt,
      gradePercent: grading.gradePercent,
      assignmentGroupId: a.assignment_group_id ?? null,
      groupName: stats.group?.name || '',
      groupWeight: stats.weighted ? finiteNumber(stats.group?.weight) : null,
      estimatedGradeImpact: importance.estimatedGradeImpact,
      importanceScore: importance.score,
      importanceLabel: importance.label,
      majorKind: importance.majorKind,
      omitFromFinalGrade: Boolean(a.omit_from_final_grade),
      description: stripHtml(a.description || '').slice(0, 5000)
    };
  }

  function normalizeQuiz(q, course, stats = {}) {
    if (!q || !q.id) return null;
    const title = q.title || q.name || 'Quiz';
    const points = finiteNumber(q.points_possible);
    const dueAt = q.due_at || q.lock_at || null;
    const importance = buildImportance({
      title,
      dueAt,
      points,
      omitFromFinalGrade: false,
      weighted: Boolean(stats.weighted),
      totalCoursePoints: finiteNumber(stats.totalCoursePoints),
      group: null
    });
    return {
      id: `quiz:${course.id}:${q.id}`,
      canvasId: q.id,
      quizId: q.id,
      assignmentId: q.assignment_id ?? null,
      type: 'quiz',
      title,
      dueAt,
      courseId: String(course.id),
      courseName: course.name || course.code,
      courseCode: course.code || '',
      url: normalizeCanvasUrl(q.html_url || q.mobile_url, course.id, 'quiz', q.id),
      submitted: false,
      canvasSubmitted: false,
      completed: false,
      canvasCompleted: false,
      points: q.points_possible ?? null,
      estimatedGradeImpact: importance.estimatedGradeImpact,
      importanceScore: importance.score,
      importanceLabel: importance.label,
      majorKind: importance.majorKind,
      description: stripHtml(q.description || '').slice(0, 5000),
      source: 'quiz-api'
    };
  }

  function normalizeModuleMajor(item, course, majorKind) {
    if (!item || !item.id || !majorKind) return null;
    const type = String(item.type || 'module-item').toLowerCase();
    const contentId = item.content_id ?? null;
    const title = item.title || 'Exam';
    const importance = buildImportance({
      title,
      dueAt: null,
      points: null,
      omitFromFinalGrade: false,
      weighted: false,
      totalCoursePoints: 0,
      group: null
    });
    return {
      id: `module-major:${course.id}:${item.id}`,
      canvasId: `module-${item.id}`,
      assignmentId: type.includes('assignment') ? contentId : null,
      quizId: type.includes('quiz') ? contentId : null,
      moduleItemId: item.id,
      type: type.includes('quiz') ? 'quiz' : 'exam',
      title,
      dueAt: null,
      courseId: String(course.id),
      courseName: course.name || course.code,
      courseCode: course.code || '',
      url: normalizeCanvasUrl(item.html_url || item.external_url, course.id, type, contentId || item.id),
      submitted: false,
      canvasSubmitted: false,
      completed: false,
      canvasCompleted: false,
      points: null,
      estimatedGradeImpact: importance.estimatedGradeImpact,
      importanceScore: Math.max(90, importance.score),
      importanceLabel: 'Critical',
      majorKind,
      description: '',
      source: 'module-audit'
    };
  }

  function normalizeCalendarMajor(ev, course, majorKind) {
    if (!ev || !majorKind) return null;
    const title = ev.title || 'Exam';
    const dueAt = ev.start_at || ev.all_day_date || ev.end_at || null;
    const importance = buildImportance({
      title,
      dueAt,
      points: null,
      omitFromFinalGrade: false,
      weighted: false,
      totalCoursePoints: 0,
      group: null
    });
    return {
      id: `calendar-major:${course.id}:${ev.id}`,
      canvasId: `calendar-${ev.id}`,
      type: 'exam',
      title,
      dueAt,
      courseId: String(course.id),
      courseName: course.name || course.code,
      courseCode: course.code || '',
      url: normalizeCanvasUrl(ev.html_url, course.id, 'calendar', ev.id),
      submitted: false,
      canvasSubmitted: false,
      completed: false,
      canvasCompleted: false,
      points: null,
      estimatedGradeImpact: 0,
      importanceScore: Math.max(90, importance.score),
      importanceLabel: 'Critical',
      majorKind,
      description: stripHtml(ev.description || '').slice(0, 5000),
      source: 'calendar-event'
    };
  }

  function buildImportance({ title, dueAt, points, omitFromFinalGrade, weighted, totalCoursePoints, group }) {
    if (omitFromFinalGrade) return { estimatedGradeImpact: 0, score: 5, label: 'Not graded', majorKind: '' };
    const pts = positiveNumber(points);
    const groupTotal = positiveNumber(group?.totalPoints);
    const groupWeight = positiveNumber(group?.weight);
    let impact = 0;
    if (weighted && groupWeight && groupTotal && pts) impact = groupWeight * (pts / groupTotal);
    else if (positiveNumber(totalCoursePoints) && pts) impact = 100 * (pts / totalCoursePoints);

    const majorKind = detectMajorKind(title);
    let score = impactScore(impact);
    if (majorKind === 'final' || majorKind === 'exam' || majorKind === 'midterm') score = Math.max(score, 90);
    else if (majorKind === 'project' || majorKind === 'paper' || majorKind === 'presentation' || majorKind === 'capstone') score = Math.max(score, 82);
    else if (/\bquiz\b/i.test(title || '')) score = Math.max(score, 42);

    // A due date does not change academic weight, but a major assessment that is close
    // should never look deceptively low because Canvas weighting data is incomplete.
    if (majorKind && dueAt) {
      const d = Date.parse(dueAt) - Date.now();
      if (Number.isFinite(d) && d >= 0 && d <= 21 * 86400000) score = Math.max(score, 88);
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    return { estimatedGradeImpact: round2(impact), score, label: importanceLabel(score), majorKind };
  }

  function impactScore(impact) {
    if (impact >= 10) return 98;
    if (impact >= 7.5) return 93;
    if (impact >= 5) return 86;
    if (impact >= 3) return 74;
    if (impact >= 1.5) return 60;
    if (impact >= 0.75) return 47;
    if (impact >= 0.25) return 33;
    if (impact > 0) return 22;
    return 18;
  }

  function importanceLabel(score) {
    if (score >= 90) return 'Critical';
    if (score >= 75) return 'Very high';
    if (score >= 55) return 'High';
    if (score >= 35) return 'Medium';
    return 'Low';
  }

  function detectMajorKind(title) {
    const t = String(title || '').toLowerCase();
    if (/\bfinal(?: exam)?\b/.test(t)) return 'final';
    if (/\bmidterm\b/.test(t)) return 'midterm';
    if (/\bexam(?:ination)?\b|\btest\b/.test(t)) return 'exam';
    if (/\bproject\b/.test(t)) return 'project';
    if (/\bcapstone\b/.test(t)) return 'capstone';
    if (/\bpresentation\b/.test(t)) return 'presentation';
    if (/\b(?:research )?paper\b|\bessay\b/.test(t)) return 'paper';
    return '';
  }

  function finiteNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function positiveNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

  function isSubmitted(submission) {
    if (Array.isArray(submission)) return submission.some(isSubmitted);
    if (!submission || typeof submission !== 'object') return false;
    const state = String(submission.workflow_state || '').toLowerCase();
    return Boolean(
      submission.submitted_at ||
      submission.excused ||
      ['submitted', 'graded', 'pending_review', 'complete'].includes(state)
    );
  }

  function normalizeCanvasUrl(raw, courseId, type, id) {
    const fallback = inferCanvasUrl(courseId, type, id);
    if (!raw) return fallback;
    try {
      const url = new URL(String(raw), location.origin);
      if (!['http:', 'https:'].includes(url.protocol)) return fallback;
      return url.href;
    } catch { return fallback; }
  }

  function inferCanvasUrl(courseId, type, id) {
    if (!courseId) return location.origin;
    const t = String(type || '').toLowerCase();
    if (t.includes('announcement')) return `${location.origin}/courses/${courseId}/announcements`;
    if (t.includes('quiz')) return `${location.origin}/courses/${courseId}/quizzes/${id}`;
    if (t.includes('discussion')) return `${location.origin}/courses/${courseId}/discussion_topics/${id}`;
    if (id) return `${location.origin}/courses/${courseId}/assignments/${id}`;
    return `${location.origin}/courses/${courseId}`;
  }

  async function fetchAll(path) {
    let url = new URL(path, location.origin).href;
    const all = [];
    const seen = new Set();
    let pages = 0;
    while (url) {
      if (seen.has(url)) throw new Error('Canvas pagination loop detected');
      seen.add(url);
      const res = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) throw new Error('Canvas session needs login');
        throw new Error(`Canvas API ${res.status}`);
      }
      const data = await res.json();
      if (Array.isArray(data)) all.push(...data); else if (data) all.push(data);
      url = nextLink(res.headers.get('Link'));
      pages += 1;
      if (pages > 1000) throw new Error('Canvas pagination safety stop');
    }
    return all;
  }

  function nextLink(header) {
    if (!header) return null;
    for (const part of header.split(',')) {
      const m = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
      if (m && m[2] === 'next') return m[1];
    }
    return null;
  }

  function stripHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 900);
  }
})();
