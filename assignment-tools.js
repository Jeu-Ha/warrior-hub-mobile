/* Shared assignment filtering for the extension and phone. No state mutations. */
(() => {
 const label=s=>s>=90?'Critical':s>=75?'Very high':s>=55?'High':s>=35?'Medium':'Low';
 function importance(a){
  const raw=a.importanceScore;let score=raw!==null&&raw!==undefined&&raw!==''&&Number.isFinite(Number(raw))?Number(raw):null;
  if(score===null){const text=String(a.title||'')+' '+String(a.majorKind||''),named={'critical':95,'very high':80,'high':60,'medium':40,'low':22}[String(a.importanceLabel||'').toLowerCase()];
   if(named!=null)score=named;else if(/\b(final|midterm|exam|test)\b/i.test(text))score=92;else if(/\b(project|capstone|presentation|paper|essay)\b/i.test(text))score=84;else if(/\bquiz\b/i.test(text))score=44;else{const p=Number(a.pointsPossible??a.points??a.points_possible)||0;score=p>=100?72:p>=50?58:p>=20?45:p>0?30:22}}
  score=Math.max(0,Math.min(100,score));const hue=Math.round(120-score*1.2);return{score,label:label(score),color:`hsl(${hue} 82% 62%)`,soft:`hsla(${hue},82%,55%,.10)`};
 }
 function query(rows,{status='all',priority='all',search='',sort='due',hidden=[],done=a=>a.submitted||a.completed,graded=a=>a.score!=null,now=Date.now()}={}){
  const hiddenIds=new Set(hidden.map(String)),terms=search.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const date=a=>{const t=Date.parse(a.dueAt);return Number.isFinite(t)?t:null};
  const result=rows.filter(a=>{if(hiddenIds.has(String(a.id)))return false;const i=importance(a),t=date(a),finished=done(a);
   const hay=`${a.title||''} ${a.courseName||''} ${a.courseCode||''} ${a.groupName||''} ${a.majorKind||''} ${i.label} importance ${i.score>=55?'high importance important важливе':''}`.toLocaleLowerCase();if(!terms.every(w=>hay.includes(w)))return false;
   if(status==='high'&&i.score<55||status==='open'&&finished||status==='week'&&(finished||t===null||t<now||t>now+7*86400000)||status==='overdue'&&(finished||t===null||t>=now)||status==='past'&&(t===null||t>=now)||status==='done'&&!finished||status==='graded'&&!graded(a))return false;
   if(priority==='high'&&i.score<55||priority==='critical'&&i.score<90||priority==='very-high'&&(i.score<75||i.score>=90)||priority==='medium'&&(i.score<35||i.score>=55)||priority==='low'&&i.score>=35)return false;return true;
  });
  return result.sort((a,b)=>{const ad=date(a),bd=date(b),due=(ad??Infinity)-(bd??Infinity);let cmp=0;if(sort==='importance')cmp=importance(b).score-importance(a).score;else if(sort==='course')cmp=String(a.courseCode||a.courseName||'').localeCompare(String(b.courseCode||b.courseName||''));else if(sort==='title')cmp=String(a.title||'').localeCompare(String(b.title||''));else if(sort==='newest')cmp=(bd??-Infinity)-(ad??-Infinity);return (Number.isFinite(cmp)&&cmp||Number.isFinite(due)&&due||String(a.id).localeCompare(String(b.id)))});
 }
 globalThis.WarriorAssignments={importance,query};
})();
