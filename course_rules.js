/* User-provided CHM 1140 Fall 2026 syllabus. Pure, shared desktop/mobile rules. */
(() => {
  'use strict';
  const COURSE_ID='244611',POLICY='chm1140-fall2026-v1';
  const EXAMS=[
    {n:1,date:'2026-09-28',offset:'-04:00',chapters:'12–14',max:100},
    {n:2,date:'2026-10-23',offset:'-04:00',chapters:'15–16',max:100},
    {n:3,date:'2026-11-16',offset:'-05:00',chapters:'17–18',max:100},
    {n:4,date:'2026-12-07',offset:'-05:00',chapters:'19–20',max:100},
    {n:5,date:'2026-12-23',offset:'-05:00',chapters:'Comprehensive',max:200,final:true}
  ];
  const number=v=>v===null||v===undefined||String(v).trim()===''||!Number.isFinite(Number(v))?null:Number(v);
  const text=a=>`${a.title||a.name||''} ${a.groupName||''}`;
  const isChem=c=>[c?.id,c?.courseId].some(id=>String(id||'')===COURSE_ID)||/\bchm[\s_-]*1140\b/i.test(`${c?.code||c?.courseCode||''} ${c?.name||c?.courseName||''}`);
  function examNumber(a){
    if(/practice|review|sample|answer|study.?guide/i.test(a.title||a.name||''))return null;
    const t=text(a);if(/\bfinal\b/i.test(t))return 5;
    const m=t.match(/\b(?:exam(?:ination)?|test|midterm)\s*[#:_-]?\s*(1|2|3|4|I{1,3}|IV)\b/i);
    if(m)return ({I:1,II:2,III:3,IV:4})[m[1].toUpperCase()]||Number(m[1]);
    if(/\bexam(?:ination)?\b|\bmidterm\b/i.test(t)&&a.dueAt){const date=String(a.dueAt).slice(0,10);return EXAMS.find(e=>e.date===date)?.n||null}
    return null;
  }
  function category(a){if(examNumber(a))return 'exams';if(/practice|review|sample|answer|study.?guide/i.test(a.title||''))return null;const t=text(a);if(/extra.?credit|bonus/i.test(t))return 'extraCredit';if(/homework|\bhw\b|cengage|webassign|\bchapter\s*\d/i.test(t))return 'homework';if(/attendance|i\s*clicker|participation/i.test(t))return 'attendance';return null}
  function score(a,max){
    if(a.excused||a.submission?.excused||a.omitFromFinalGrade||a.omit_from_final_grade)return null;
    for(const v of [a.score,a.pointsEarned,a.earnedPoints,a.submissionScore,a.enteredScore,a.submission?.score]){const s=number(v);if(s!==null)return s}
    const pct=number(a.gradePercent);if(pct!==null)return pct*max/100;
    const grade=a.grade??a.submission?.grade;if(typeof grade==='string'&&/^\s*\d+(?:\.\d+)?\s*%\s*$/.test(grade))return parseFloat(grade)*max/100;
    return number(grade);
  }
  function assignmentBelongs(a,course){return String(a.courseId||'')===String(course.id||'')||isChem({...a,id:a.courseId})}
  function enrichAssignments(assignments,course){
    const rows=(Array.isArray(assignments)?assignments:[]).map(a=>({...a}));
    for(const e of EXAMS){
      const id=`syllabus-${POLICY}-exam-${e.n}`;
      const matches=rows.filter(a=>assignmentBelongs(a,course)&&examNumber(a)===e.n);
      const real=matches.find(a=>a.syllabusPolicy!==POLICY&&score(a,e.max)!==null)||matches.find(a=>a.syllabusPolicy!==POLICY);
      if(real){for(let i=rows.length-1;i>=0;i--)if(rows[i].id===id)rows.splice(i,1)}
      let a=real||matches.find(a=>a.id===id);
      if(!a){a={id,courseId:course.id,courseCode:course.code||'CHM 1140',courseName:course.name||'General Chemistry II',title:e.final?'CHM 1140 · Final Exam':`CHM 1140 · Exam ${e.n}: Chapters ${e.chapters}`,source:'syllabus',syllabusPolicy:POLICY,url:`https://canvas.wayne.edu/courses/${course.id}/grades`,completed:false,submitted:false};rows.push(a)}
      if(!a.dueAt)a.dueAt=`${e.date}T${e.final?'10:15':'11:30'}:00${e.offset}`;
      a.syllabusDate=e.date;a.syllabusExamNumber=e.n;a.syllabusMaxPoints=e.max;
      a.syllabusTimeNote=e.final?'10:15–12:15, per syllabus':'Regular lecture start, per syllabus';
      if(e.final)a.endAt=`${e.date}T12:15:00${e.offset}`;
      a.originalPointsPossible=a.originalPointsPossible??a.pointsPossible??a.points??e.max;
      a.pointsPossible=e.max;a.points=e.max;a.majorKind=e.final?'final exam':'exam';a.importanceScore=100;
      const s=score(a,e.max);if(s!==null){a.gradePercent=s/e.max*100;a.completed=true}
    }
    return rows;
  }
  function letter(percent){for(const [min,g] of [[93,'A'],[90,'A-'],[87.5,'B+'],[83,'B'],[80,'B-'],[77.5,'C+'],[73,'C'],[70,'C-'],[60,'D']])if(percent>=min)return g;return 'F'}
  function summary(course,assignments){
    if(!isChem(course))return null;
    const parts={extraCredit:{earned:0,possible:0,count:0},exams:{earned:0,possible:0,count:0},homework:{earned:0,possible:0,count:0},attendance:{earned:0,possible:0,count:0}},seen=new Set();
    const candidates=(assignments||[]).filter(a=>assignmentBelongs(a,course));
    const realExamIds=new Set(candidates.filter(a=>!a.syllabusPolicy).map(examNumber).filter(Boolean));
    const examChoices=new Map();for(const a of candidates){const n=examNumber(a);if(!n)continue;const prior=examChoices.get(n);if(!prior||prior.syllabusPolicy&&!a.syllabusPolicy||score(prior,EXAMS[n-1].max)===null&&score(a,EXAMS[n-1].max)!==null)examChoices.set(n,a)}
    for(const a of candidates){
      if(a.syllabusPolicy&&realExamIds.has(examNumber(a)))continue;
      const key=a.id==null?a:a.id;if(seen.has(key))continue;seen.add(key);
      const kind=category(a);if(!kind)continue;
      const exam=EXAMS.find(e=>e.n===examNumber(a));if(exam&&examChoices.get(exam.n)!==a)continue;
      const rawMax=number(a.originalPointsPossible??a.pointsPossible??a.points??a.points_possible);
      let max=exam?.max??rawMax;if(kind==='extraCredit')max=0;else if(!(max>0))continue;
      const earned=score(a,max);if(earned===null)continue;
      let possible=max,points=earned;
      if(kind==='homework'){
        possible=/\btotal\b|all homework/i.test(a.title||'')?45:5;
        points=earned/max*possible;
      }
      const part=parts[kind];part.earned+=points;part.possible+=possible;part.count++;
    }
    for(const [kind,cap] of [['homework',45],['attendance',20]])if(parts[kind].possible>cap){parts[kind].earned*=cap/parts[kind].possible;parts[kind].possible=cap}
    const earned=Object.values(parts).reduce((n,p)=>n+p.earned,0),possible=Object.values(parts).reduce((n,p)=>n+p.possible,0);
    if(!possible)return null;
    const percent=earned/possible*100,grade=letter(percent);
    return {score:percent,grade,label:`${+percent.toFixed(2)}% · ${grade}`,earned,possible,totalPossible:665,parts,source:'calculated',detail:`Calculated CHM 1140: ${+earned.toFixed(2)}/${+possible.toFixed(2)} graded points · course total 665. Ungraded work excluded.`};
  }
  const GROUP3=[{date:'2026-10-15',title:'Group 3 · Project Meeting 1',notes:'Each group member: correct answers and all your own work.'},{date:'2026-11-03',title:'Group 3 · Project Meeting 2',notes:'Bring a rough draft of your journal, completed PowerPoint, and questions.'},{date:'2026-11-19',title:'Group 3 · Project Presentation',notes:'Group 3 presentation during workshop.'}];
  function applyGroup3(state,assignments){
    const workshop=(state.schedule||[]).find(c=>/MAT\s*2120/i.test(c.code||'')||/calculus.*(?:wk|workshop)/i.test(c.title||''));
    const course=(state.courses||[]).find(c=>/MAT\s*2120/i.test(c.code||''));
    const rows=assignments.map(a=>({...a}));
    for(const e of GROUP3){const id='group3-project-f26-'+e.date;if(rows.some(a=>a.id===id))continue;const time=/^\d{2}:\d{2}$/.test(workshop?.startTime||'')?workshop.startTime:null,offset=e.date<'2026-11-01'?'-04:00':'-05:00';rows.push({id,title:e.title,courseCode:workshop?.code||'MAT 2120',courseName:workshop?.title||'Calculus workshop',courseId:course?.id||'',dueAt:time?e.date+'T'+time+':00'+offset:e.date+'T12:00:00'+offset,allDay:!time,timeNote:time?'During your scheduled workshop':'During workshop · time not provided in the calendar',description:e.notes,source:'group3-project-calendar-f26',majorKind:e.title.includes('Presentation')?'presentation':'project meeting',importanceScore:95,completed:false,submitted:false})}
    return rows;
  }
  function apply(state){
    if(!state||typeof state!=='object')return state;
    const courses=(Array.isArray(state.courses)?state.courses:[]).map(c=>({...c}));
    let course=courses.find(isChem);
    if(!course){course={id:COURSE_ID,code:'CHM 1140',name:'General Chemistry II',term:'Fall 2026',source:'syllabus',url:`https://canvas.wayne.edu/courses/${COURSE_ID}`};courses.push(course)}
    const assignments=applyGroup3(state,enrichAssignments(state.assignments,course));course.calculatedGrade=summary(course,assignments);return {...state,courses,assignments};
  }
  globalThis.WarriorCourseRules={apply,summary,isChem,examNumber,category,EXAMS,POLICY,GROUP3};
})();
