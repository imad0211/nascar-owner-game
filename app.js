import { MainGame } from './MainGame.js';
import { SaveSystem } from './SaveSystem.js';
import { SeriesId } from './Series.js';
import { RDCategory, RD_COST_BY_SERIES } from './RDSystem.js';
import { ALL_ROLES } from './Assignments.js';
import { LiveRaceViewer } from './liveRaceViewer.js';
import { renderRaceDayPitCrewPanel } from './pitCrewRaceDayUI.js';
import { findTrackMapKey, buildLiveViewSession } from './LiveRaceViewBridge.js';
import { renderTrack } from './liveRaceView.js';
import { getTrackMap } from './trackMapData.js';
import { buildPersonnelAdapter } from './PersonnelBridge.js';
import { getActiveContract, calculateBuyout } from './personnelContracts.js';
import { getFreeAgentPool, rankFreeAgents, calculateMarketValue } from './personnelMarket.js';

const SAVE_KEY = 'nascar-owner-save-v1';
const saveSystem = new SaveSystem();

const state = {
  game: null, tab: 'overview',
  teamsSeries: 'ALL', teamsSearch: '',
  driversSeries: 'ALL', driversSearch: '', driversSort: { col: 'rating', dir: -1 },
  personnelSearch: '', personnelPosition: 'ALL', personnelStatus: 'ALL',
  standingsSeries: SeriesId.CUP, standingsView: 'DRIVERS',
  scheduleSeries: SeriesId.CUP, newsCategory: 'ALL',
};

const SERIES_LABEL = { CUP: 'Cup Series', OREILLY: "O'Reilly Series", TRUCK: 'Truck Series' };
const SERIES_CLASS = { CUP: 'cup', OREILLY: 'oreilly', TRUCK: 'truck' };

function boot(){
  const saved = saveSystem.loadFromStorage(SAVE_KEY);
  const game = new MainGame();
  if(saved){ try{ game.restore(saved); } catch(e){ console.error('Restore failed, starting fresh', e); game.startGame(); } }
  else { game.startGame(); }
  state.game = game;
  render();
}
function persist(){ saveSystem.saveToStorage(SAVE_KEY, state.game.serialize()); }
function toast(msg){
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
  document.body.appendChild(el); setTimeout(()=>el.remove(), 2200);
}
function money(n){ const v = Math.round(n||0); const sign = v<0 ? '-' : ''; return sign + '$' + Math.abs(v).toLocaleString('en-US'); }
function hashColor(str){ let h=0; for(let i=0;i<str.length;i++){ h = str.charCodeAt(i) + ((h<<5)-h); } return `hsl(${Math.abs(h)%360},58%,42%)`; }
function initials(name){ const clean = name.replace(/\(.*?\)/g, '').trim(); return clean.split(/\s+/).filter(Boolean).map(w => (w.match(/[A-Za-z0-9]/)||[''])[0]).filter(Boolean).slice(0,3).join('').toUpperCase(); }
function roundel(text, colorSeed, size=''){ return `<div class="roundel ${size}" style="--rc:${hashColor(colorSeed)}">${text}</div>`; }
function pill(series){ return `<span class="pill ${SERIES_CLASS[series]||''}">${SERIES_LABEL[series]||series}</span>`; }
function teamById(id){ return state.game.teams.getTeams().find(t=>t.id===id); }
function esc(s){ return String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function driverNameById(id){ const d = state.game.drivers.getDrivers().find(x=>x.id===id); return d?d.fullName:null; }

function openModal(innerHtml){
  closeModal();
  const backdrop = document.createElement('div'); backdrop.className = 'modal-backdrop'; backdrop.id = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal">${innerHtml}</div>`;
  backdrop.addEventListener('click', (e)=>{ if(e.target===backdrop) closeModal(); });
  document.body.appendChild(backdrop);
}
function closeModal(){ document.getElementById('modal-backdrop')?.remove(); }

function driverModalHtml(driver){
  const team = teamById(driver.teamId);
  const stat = (label,val)=>`<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:12px;color:var(--steel)"><span>${label}</span><span style="color:var(--chalk);font-family:var(--font-mono)">${val}</span></div><div class="barmeter"><div style="width:${val}%"></div></div></div>`;
  return `<div class="modal-header">${roundel(driver.number, driver.teamId, 'lg')}<div class="titles"><h2 style="margin-bottom:2px">${esc(driver.fullName)}</h2><div class="sub">${team?esc(team.name):'Free Agent'} &middot; #${esc(driver.number)} ${pill(driver.series)}</div></div><button class="modal-close" data-close>&times;</button></div>
   <div class="modal-body">
     <div class="grid grid-3" style="margin-bottom:18px">
       <div class="card"><div class="stat-label">Age</div><div class="stat">${driver.age}</div></div>
       <div class="card"><div class="stat-label">Overall</div><div class="stat amber">${driver.rating}</div></div>
       <div class="card"><div class="stat-label">Salary / yr</div><div class="stat" style="font-size:16px">${money(driver.salary)}</div></div>
     </div>
     <h3 style="margin-bottom:10px">Skills</h3>
     ${stat('Oval', driver.ovalSkill)}${stat('Road Course', driver.roadCourseSkill)}${stat('Superspeedway', driver.superspeedwaySkill)}${stat('Tire Management', driver.tireManagement)}${stat('Restarts', driver.restartAbility)}${stat('Feedback', driver.feedbackAbility)}${stat('Marketability', driver.marketability)}
     <div style="margin-top:14px;font-size:12px;color:var(--steel)">Morale: <span style="color:var(--chalk)">${driver.morale}/100</span> ${driver.partTime?' &middot; Part-time seat':''} ${driver.teamId ? ` &middot; Contract: ${driver.contractYears}yr left` : ' &middot; Free Agent'}</div>
   </div>`;
}
function personModalHtml(person, assignment){
  const team = assignment ? teamById(assignment.teamId) : null;
  const stat = (label,val)=>`<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:12px;color:var(--steel)"><span>${label}</span><span style="color:var(--chalk);font-family:var(--font-mono)">${val}</span></div><div class="barmeter"><div style="width:${val}%"></div></div></div>`;
  return `<div class="modal-header">${roundel(initials(person.fullName), team?team.id:person.id, 'lg')}<div class="titles"><h2 style="margin-bottom:2px">${esc(person.fullName)}</h2><div class="sub">${esc(person.position)} &middot; ${team?esc(team.name):'Free Agent'}</div></div><button class="modal-close" data-close>&times;</button></div>
   <div class="modal-body">
     <div class="grid grid-3" style="margin-bottom:18px">
       <div class="card"><div class="stat-label">Age</div><div class="stat">${person.age}</div></div>
       <div class="card"><div class="stat-label">Potential</div><div class="stat amber">${person.potential}</div></div>
       <div class="card"><div class="stat-label">Salary / yr</div><div class="stat" style="font-size:16px">${money(person.salary)}</div></div>
     </div>
     ${stat('Experience', person.experience)}${stat('Morale', person.morale)}${stat('Fatigue', person.fatigue)}
   </div>`;
}
function renderTopbar(){
  const g = state.game;
  const team = g.playerTeamId ? teamById(g.playerTeamId) : null;
  const finance = team ? g.finance.getForTeam(team.id) : null;
  return `<div class="topbar"><div class="brand"><span class="dot"></span> Pit Box</div>
     ${team ? `<div style="display:flex;align-items:center;gap:8px">${roundel(initials(team.name), team.id,'sm')}<b style="font-family:var(--font-display);text-transform:uppercase;font-size:13px">${esc(team.name)}</b></div>` : ''}
     <div class="spacer"></div>
     <div class="clockbox">Season <b>${g.calendar.getYear()}</b> &middot; Day <b>${g.calendar.getDayOfSeason()}</b></div>
     ${finance ? `<div class="cashbox ${finance.cash<0?'neg':''}">${money(finance.cash)}</div>` : ''}
     <button class="btn" id="btn-advance-day">Advance Day</button>
     <button class="btn" id="btn-advance-week">Advance Week</button>
     <button class="btn btn-ghost btn-sm" id="btn-save">Save</button>
     <button class="btn btn-ghost btn-sm" id="btn-newgame">New Game</button></div>`;
}
function renderOnboarding(){
  const g = state.game;
  const bySeries = {};
  for(const t of g.teams.getTeams()){ (bySeries[t.series] ||= []).push(t); }
  const block = (series) => `<div class="seriesblock"><h2>${SERIES_LABEL[series]}</h2><div class="grid grid-4">
    ${bySeries[series].map(t=>`<div class="card clickable" data-pick-team="${t.id}"><div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">${roundel(initials(t.name), t.id)}<div class="meta"><div class="name">${esc(t.name)}</div><div class="sub">${t.vehicleCount} car${t.vehicleCount!==1?'s':''}${t.partTimeVehicles?` +${t.partTimeVehicles} PT`:''}</div></div></div></div>`).join('')}</div></div>`;
  return `<div class="hazard"></div><div class="onboard"><h1>Choose Your Organization</h1><div class="subtitle">Pick the team you'll own and manage for the ${g.calendar.getYear()} season. You can browse every other team in the league once you're in.</div>${block('CUP')}${block('OREILLY')}${block('TRUCK')}</div>`;
}
function renderOverview(){
  const g = state.game;
  const team = teamById(g.playerTeamId);
  const finance = g.finance.getForTeam(team.id);
  const drivers = g.drivers.getDriversForTeam(team.id);
  const sponsors = g.sponsors.getForTeam(team.id);
  const cars = g.cars.getCarsForTeam(team.id);
  return `<div style="display:flex;align-items:center;gap:14px;margin-bottom:18px">${roundel(initials(team.name), team.id, 'lg')}<div><h1 style="margin-bottom:2px">${esc(team.name)}</h1><div class="subtitle" style="margin-bottom:0">${pill(team.series)} &middot; ${team.manufacturer?esc(team.manufacturer)+' &middot; ':''}${cars.length} car${cars.length!==1?'s':''}</div></div></div>
   <div class="grid grid-4" style="margin-bottom:22px">
     <div class="card"><div class="stat-label">Cash on Hand</div><div class="stat ${finance.cash<0?'red':'green'}">${money(finance.cash)}</div></div>
     <div class="card"><div class="stat-label">Monthly Payroll</div><div class="stat">${money(finance.payroll)}</div></div>
     <div class="card"><div class="stat-label">Monthly Revenue</div><div class="stat green">${money(finance.revenue)}</div></div>
     <div class="card"><div class="stat-label">Monthly Overhead</div><div class="stat red">${money(finance.expenses)}</div></div>
   </div>
   <div class="grid grid-2" style="align-items:start">
     <div><h2 style="margin-bottom:10px">Drivers</h2><div class="grid" style="gap:10px">
       ${drivers.map(d=>`<div class="entity-card clickable" data-view-driver="${d.id}">${roundel(d.number, d.teamId)}<div class="meta"><div class="name">${esc(d.fullName)}</div><div class="sub">Overall ${d.rating} &middot; ${money(d.salary)}/yr</div></div></div>`).join('') || `<div class="emptystate">No drivers signed.</div>`}
     </div></div>
     <div><h2 style="margin-bottom:10px">Sponsors</h2><div class="grid" style="gap:10px">
       ${sponsors.map(s=>`<div class="card"><div style="display:flex;justify-content:space-between;margin-bottom:6px"><b style="font-size:13px">${esc(s.sponsorName)}</b><span style="font-family:var(--font-mono);color:var(--green);font-size:13px">${money(s.value)}</span></div><div class="sub" style="margin-bottom:6px">${s.remainingDays} days left on contract</div><div class="barmeter"><div style="width:${s.satisfaction}%"></div></div></div>`).join('') || `<div class="emptystate">No sponsors signed.</div>`}
     </div></div>
   </div>`;
}
function renderRoster(){
  const g = state.game;
  const team = teamById(g.playerTeamId);
  const drivers = g.drivers.getDriversForTeam(team.id);
  const cars = g.cars.getCarsForTeam(team.id);
  const crew = g.pitCrew.getForTeam(team.id);
  const staff = g.assignments.getForTeam(team.id).filter(a=>a.department==='Competition').map(a=>({...a, person:g.personnel.getPeople().find(p=>p.id===a.personId)})).filter(a=>a.person);
  return `<h1>${esc(team.name)} Roster</h1><div class="subtitle">Everyone signed to this organization.</div>
   <h2 style="margin-top:10px">Drivers &amp; Cars</h2>
   <table style="margin-bottom:24px"><thead><tr><th>#</th><th>Driver</th><th>Rating</th><th>Chassis</th><th>Engine</th><th>Aero</th><th>Reliability</th><th>Salary</th></tr></thead><tbody>
     ${drivers.map((d,i)=>{ const car = cars[i]; return `<tr class="clickable" data-view-driver="${d.id}"><td>${esc(d.number)}</td><td class="namecol">${esc(d.fullName)}</td><td>${d.rating}</td><td>${car?car.chassisRating:'—'}</td><td>${car?car.engineRating:'—'}</td><td>${car?aeroRating:'—'}</td><td>${car?car.reliability:'—'}</td><td>${money(d.salary)}</td></tr>`; }).join('') || `<tr><td colspan="8" class="emptystate">No drivers signed.</td></tr>`}
   </tbody></table>
   <h2>Pit Crew ${crew?`<span style="font-family:var(--font-body);color:var(--steel);font-size:12px;text-transform:none">&middot; Chemistry ${crew.chemistry}</span>`:''}</h2>
   <table style="margin-bottom:24px"><thead><tr><th>Position</th><th>Name</th><th>Rating</th></tr></thead><tbody>
     ${(crew?.members||[]).map(m=>`<tr class="clickable" ${m.personId?`data-view-person="${m.personId}"`:''}><td>${esc(m.position)}</td><td class="namecol">${esc(m.name)}</td><td>${m.rating||'—'}</td></tr>`).join('') || `<tr><td colspan="3" class="emptystate">No pit crew assigned.</td></tr>`}
   </tbody></table>
   <h2>Competition Staff</h2>
   <table><thead><tr><th>Role</th><th>Name</th><th>Experience</th><th>Morale</th></tr></thead><tbody>
     ${staff.map(a=>`<tr class="clickable" data-view-person="${a.person.id}"><td>${esc(a.position)}</td><td class="namecol">${esc(a.person.fullName)}</td><td>${a.person.experience}</td><td>${a.person.morale}</td></tr>`).join('') || `<tr><td colspan="4" class="emptystate">No staff assigned.</td></tr>`}
   </tbody></table>`;
}
function renderTeams(){
  const g = state.game;
  let teams = g.teams.getTeams();
  if(state.teamsSeries!=='ALL') teams = teams.filter(t=>t.series===state.teamsSeries);
  if(state.teamsSearch) teams = teams.filter(t=>t.name.toLowerCase().includes(state.teamsSearch.toLowerCase()));
  return `<h1>League Teams</h1><div class="subtitle">${g.teams.getTeams().length} organizations across three series.</div>
   <div class="searchbar"><input type="text" id="teams-search" placeholder="Search teams…" value="${esc(state.teamsSearch)}">
     <div class="tabs-inline" id="teams-series-tabs">${['ALL','CUP','OREILLY','TRUCK'].map(s=>`<button data-series="${s}" class="${state.teamsSeries===s?'active':''}">${s==='ALL'?'All':SERIES_LABEL[s]}</button>`).join('')}</div>
   </div>
   <div class="grid grid-4">
     ${teams.map(t=>{ const fin = g.finance.getForTeam(t.id); const isMine = t.id===g.playerTeamId; return `<div class="card clickable" data-view-team="${t.id}"><div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">${roundel(initials(t.name), t.id)}<div class="meta"><div class="name">${esc(t.name)} ${isMine?'<span style="color:var(--amber)">★</span>':''}</div><div class="sub">${pill(t.series)}</div></div></div><div class="sub">${t.vehicleCount} car${t.vehicleCount!==1?'s':''} &middot; ${fin?money(fin.cash):'—'}</div></div>`; }).join('') || `<div class="emptystate">No teams match.</div>`}
   </div>`;
}
function teamModalHtml(team){
  const g = state.game;
  const fin = g.finance.getForTeam(team.id);
  const drivers = g.drivers.getDriversForTeam(team.id);
  const isMine = team.id===g.playerTeamId;
  const relSummary = g.relationships.getTeamSummary(team.id, g.calendar.getYear());
  const affiliates = (relSummary?.teamRelationships||[]).map(r=>{ const otherId = r.sourceTeamId===team.id ? r.targetTeamId : r.sourceTeamId; return { rel: r, team: teamById(otherId) }; }).filter(x=>x.team);
  return `<div class="modal-header">${roundel(initials(team.name), team.id, 'lg')}<div class="titles"><h2 style="margin-bottom:2px">${esc(team.name)}</h2><div class="sub">${pill(team.series)} ${team.manufacturer?'&middot; '+esc(team.manufacturer):''}</div></div><button class="modal-close" data-close>&times;</button></div>
   <div class="modal-body">
     <div class="grid grid-3" style="margin-bottom:18px">
       <div class="card"><div class="stat-label">Cash</div><div class="stat" style="font-size:18px">${fin?money(fin.cash):'—'}</div></div>
       <div class="card"><div class="stat-label">Payroll/mo</div><div class="stat" style="font-size:18px">${fin?money(fin.payroll):'—'}</div></div>
       <div class="card"><div class="stat-label">Cars</div><div class="stat" style="font-size:18px">${team.vehicleCount}</div></div>
     </div>
     ${relSummary ? `<h3 style="margin-bottom:8px">Manufacturer Relationship</h3><div class="card" style="margin-bottom:16px"><div class="sub">${esc(relSummary.manufacturerLevel.replaceAll('_',' '))} &middot; Score ${relSummary.manufacturerRelationshipScore}/100</div></div>
     ${affiliates.length ? `<h3 style="margin-bottom:8px">Affiliated Teams</h3><div class="grid" style="gap:8px;margin-bottom:16px">${affiliates.map(a=>`<div class="entity-card clickable" data-view-team="${a.team.id}">${roundel(initials(a.team.name), a.team.id, 'sm')}<div class="meta"><div class="name">${esc(a.team.name)}</div><div class="sub">${pill(a.team.series)} &middot; ${a.rel.permissions.join(', ')}</div></div></div>`).join('')}</div>` : ''}` : ''}
     <h3 style="margin-bottom:8px">Drivers</h3><div class="grid" style="gap:8px;margin-bottom:16px">${drivers.map(d=>`<div class="entity-card clickable" data-view-driver="${d.id}">${roundel(d.number,d.teamId,'sm')}<div class="meta"><div class="name">${esc(d.fullName)}</div><div class="sub">Overall ${d.rating}</div></div></div>`).join('') || `<div class="emptystate">No drivers.</div>`}</div>
     ${isMine ? '' : `<button class="btn btn-primary" id="btn-switch-team" data-team="${team.id}">Take Over This Organization</button>`}
   </div>`;
}
function renderDrivers(){
  const g = state.game;
  let drivers = g.drivers.getDrivers().slice();
  if(state.driversSeries!=='ALL') drivers = drivers.filter(d=>d.series===state.driversSeries);
  if(state.driversSearch) drivers = drivers.filter(d=>d.fullName.toLowerCase().includes(state.driversSearch.toLowerCase()));
  const { col, dir } = state.driversSort;
  drivers.sort((a,b)=>{ const av=a[col], bv=b[col]; if(typeof av==='string') return av.localeCompare(bv)*dir; return (av-bv)*dir; });
  const cols = [['number','#'], ['fullName','Driver'], ['series','Series'], ['rating','Rating'], ['ovalSkill','Oval'], ['superspeedwaySkill','SS'], ['roadCourseSkill','Road'], ['salary','Salary']];
  return `<h1>League Drivers</h1><div class="subtitle">${drivers.length} of ${g.drivers.getDrivers().length} drivers shown.</div>
   <div class="searchbar"><input type="text" id="drivers-search" placeholder="Search drivers…" value="${esc(state.driversSearch)}">
     <div class="tabs-inline" id="drivers-series-tabs">${['ALL','CUP','OREILLY','TRUCK'].map(s=>`<button data-series="${s}" class="${state.driversSeries===s?'active':''}">${s==='ALL'?'All':SERIES_LABEL[s]}</button>`).join('')}</div>
   </div>
   <table><thead><tr>${cols.map(([key,label])=>`<th data-sort="${key}">${label}${col===key?(dir===1?' ▲':' ▼'):''}</th>`).join('')}<th>Team</th></tr></thead><tbody>
     ${drivers.map(d=>{ const t = teamById(d.teamId); return `<tr class="clickable" data-view-driver="${d.id}"><td>${esc(d.number)}</td><td class="namecol">${esc(d.fullName)}</td><td>${pill(d.series)}</td><td>${d.rating}</td><td>${d.ovalSkill}</td><td>${d.superspeedwaySkill}</td><td>${d.roadCourseSkill}</td><td>${money(d.salary)}</td><td class="namecol">${t?esc(t.name):'<span style="color:var(--amber)">Free Agent</span>'}</td></tr>`; }).join('') || `<tr><td colspan="9" class="emptystate">No drivers match.</td></tr>`}
   </tbody></table>`;
}
function renderPersonnel(){
  const g = state.game;
  let people = g.personnel.getPeople();
  const assignmentByPerson = new Map(g.assignments.getAssignments().map(a=>[a.personId,a]));
  const positions = [...new Set(people.map(p=>p.position))].sort();
  let filtered = people;
  if(state.personnelSearch) filtered = filtered.filter(p=>p.fullName.toLowerCase().includes(state.personnelSearch.toLowerCase()));
  if(state.personnelPosition!=='ALL') filtered = filtered.filter(p=>p.position===state.personnelPosition);
  if(state.personnelStatus==='ASSIGNED') filtered = filtered.filter(p=>assignmentByPerson.has(p.id));
  if(state.personnelStatus==='FREE') filtered = filtered.filter(p=>!assignmentByPerson.has(p.id));
  const shown = filtered.slice(0, 200);
  return `<h1>Personnel Pool</h1><div class="subtitle">${people.length} people league-wide &middot; ${filtered.length} match your filters${filtered.length>200?' (showing first 200 — narrow your search for more)':''}.</div>
   <div class="searchbar"><input type="text" id="personnel-search" placeholder="Search by name…" value="${esc(state.personnelSearch)}">
     <select id="personnel-position"><option value="ALL">All Positions</option>${positions.map(p=>`<option value="${esc(p)}" ${state.personnelPosition===p?'selected':''}>${esc(p)}</option>`).join('')}</select>
     <div class="tabs-inline" id="personnel-status-tabs">${['ALL','ASSIGNED','FREE'].map(s=>`<button data-status="${s}" class="${state.personnelStatus===s?'active':''}">${s==='ALL'?'All':s==='ASSIGNED'?'Assigned':'Free Agents'}</button>`).join('')}</div>
   </div>
   <table><thead><tr><th>Name</th><th>Position</th><th>Team</th><th>Age</th><th>Exp</th><th>Potential</th><th>Morale</th><th>Salary</th></tr></thead><tbody>
     ${shown.map(p=>{ const a = assignmentByPerson.get(p.id); const t = a ? teamById(a.teamId) : null; return `<tr class="clickable" data-view-person="${p.id}"><td class="namecol">${esc(p.fullName)}</td><td>${esc(p.position)}</td><td class="namecol">${t?esc(t.name):'Free Agent'}</td><td>${p.age}</td><td>${p.experience}</td><td>${p.potential}</td><td>${p.morale}</td><td>${money(p.salary)}</td></tr>`; }).join('') || `<tr><td colspan="8" class="emptystate">No one matches.</td></tr>`}
   </tbody></table>`;
}
function renderStandings(){
  const g = state.game;
  const series = state.standingsSeries;
  const view = state.standingsView;
  const phase = g.championship.getPhase(series);
  const inChase = phase==='PLAYOFFS';
  const chaseInfo = { CUP:{field:16,winPts:55}, OREILLY:{field:12,winPts:55}, TRUCK:{field:10,winPts:55} }[series];
  if(view==='OWNERS'){
    const rows = g.ownerStandings.getForSeries(series);
    const started = rows.some(r=>r.points>0);
    return `<h1>Standings</h1><div class="subtitle">${started ? 'Owner points — same finish-points formula as drivers, tracked by team.' : "Season hasn't run any races yet."}</div>
     <div class="tabs-inline" id="standings-view-tabs">${['DRIVERS','OWNERS'].map(v=>`<button data-view="${v}" class="${view===v?'active':''}">${v==='DRIVERS'?'Drivers':'Owners'}</button>`).join('')}</div>
     <div class="tabs-inline" id="standings-series-tabs">${['CUP','OREILLY','TRUCK'].map(s=>`<button data-series="${s}" class="${state.standingsSeries===s?'active':''}">${SERIES_LABEL[s]}</button>`).join('')}</div>
     <table><thead><tr><th>Rank</th><th>Team</th><th>Points</th><th>Wins</th><th>Top 5</th><th>Top 10</th></tr></thead><tbody>
       ${rows.map((r,i)=>`<tr><td class="rank">${i+1}</td><td class="namecol">${esc(r.teamName)}</td><td>${r.points}</td><td>${r.wins}</td><td>${r.top5}</td><td>${r.top10}</td></tr>`).join('') || `<tr><td colspan="6" class="emptystate">No teams in this series.</td></tr>`}
     </tbody></table>`;
  }
  const rows = g.championship.getForSeries(series).slice().sort((a,b)=> b.points-a.points || b.wins-a.wins || (a.driverName||'').localeCompare(b.driverName||''));
  const started = rows.some(r=>r.points>0);
  return `<h1>Standings</h1><div class="subtitle">${!started ? "Season hasn't run any races yet — order is alphabetical until points are on the board." : inChase ? `The Chase is underway — field reset to the top ${chaseInfo.field}, race wins now worth ${chaseInfo.winPts} points.` : 'Current championship points. Tap a driver for full season stats.'}</div>
   <div class="tabs-inline" id="standings-view-tabs">${['DRIVERS','OWNERS'].map(v=>`<button data-view="${v}" class="${view===v?'active':''}">${v==='DRIVERS'?'Drivers':'Owners'}</button>`).join('')}</div>
   <div class="tabs-inline" id="standings-series-tabs">${['CUP','OREILLY','TRUCK'].map(s=>`<button data-series="${s}" class="${state.standingsSeries===s?'active':''}">${SERIES_LABEL[s]}</button>`).join('')}</div>
   <table><thead><tr><th>Rank</th><th>Driver</th><th>#</th><th>Team</th><th>Points</th><th>Wins</th><th>Top 5</th><th>Top 10</th>${inChase?'<th>Chase</th>':''}</tr></thead><tbody>
     ${rows.map((r,i)=>{ const t = teamById(r.teamId); const chaseCell = inChase ? `<td>${r.inPlayoffs? '<span style="color:var(--amber)">In</span>' : '<span style="color:var(--steel)">Out</span>'}</td>` : ''; return `<tr class="clickable" data-view-driver-stats="${r.entityId}"><td class="rank">${i+1}</td><td class="namecol">${esc(r.driverName)}</td><td>${esc(r.number)}</td><td class="namecol">${t?esc(t.name):'—'}</td><td>${r.points}</td><td>${r.wins}</td><td>${r.top5}</td><td>${r.top10}</td>${chaseCell}</tr>`; }).join('') || `<tr><td colspan="9" class="emptystate">No drivers in this series.</td></tr>`}
   </tbody></table>`;
}
function driverStatsModalHtml(entityId){
  const g = state.game;
  const summary = g.championship.getStatSummary(entityId);
  if(!summary) return `<div class="modal-body"><div class="emptystate">No data available.</div></div>`;
  const team = teamById(summary.teamId);
  const statCard = (label,val)=>`<div class="card"><div class="stat-label">${label}</div><div class="stat" style="font-size:20px">${val ?? '—'}</div></div>`;
  return `<div class="modal-header">${roundel(esc(summary.number||''), summary.teamId||summary.entityId, 'lg')}<div class="titles"><h2 style="margin-bottom:2px">${esc(summary.driverName)}</h2><div class="sub">${team?esc(team.name):'Free Agent'} &middot; Season Stats</div></div><button class="modal-close" data-close>&times;</button></div>
   <div class="modal-body">
     <div class="grid grid-3" style="margin-bottom:12px">
       ${statCard('Points', summary.points)}${statCard('Wins', summary.wins)}${statCard('Poles', summary.poles)}${statCard('Top 5s', summary.top5)}${statCard('Top 10s', summary.top10)}${statCard('DNFs', summary.dnfs)}${statCard('Laps Led', summary.lapsLed)}${statCard('Stage Wins', summary.stageWins)}${statCard('Stage Points', summary.stagePointsEarned)}${statCard('Best Finish', summary.bestFinish)}${statCard('Avg Start', summary.avgStart)}${statCard('Avg Finish', summary.avgFinish)}
     </div>
     <div class="sub">${summary.starts} start${summary.starts!==1?'s':''} this season</div>
   </div>`;
}
function renderSchedule(){
  const g = state.game;
  const series = state.scheduleSeries;
  const fullSchedule = g.tracks.getSchedule();
  const seriesSchedule = g.tracks.getScheduleForSeries(series);
  const seasonOver = g.currentWeekIndex >= fullSchedule.length;
  const nextGlobal = fullSchedule[g.currentWeekIndex];
  const nextForSeries = seriesSchedule.find(w => w.week-1 >= g.currentWeekIndex);
  const last = g.lastRaceResult;
  const categoryLabel = { superspeedway:'Superspeedway', intermediate:'Intermediate', short:'Short Track', roadCourse:'Road Course' };
  const phaseKey = { CUP:'phase', OREILLY:'oreillyPhase', TRUCK:'truckPhase' }[series];
  const numKey = { CUP:'cupRaceNumber', OREILLY:'oreillyRaceNumber', TRUCK:'truckRaceNumber' }[series];
  const totalForSeries = series==='CUP' ? fullSchedule.length : series==='OREILLY' ? g.tracks.oreillyRaceCount : g.tracks.truckRaceCount;
  const lastLines = [];
  if(last){
    for(const s of ['CUP','OREILLY','TRUCK']){
      const r = last.seriesResults[s];
      if(!r) continue;
      const stageWinners = (r.stageResults||[]).map((stage,i)=> stage && stage[0] ? `S${i+1}: ${esc(driverNameById(stage[0].carId)||'')}` : null).filter(Boolean).join(' &middot; ');
      lastLines.push(`<div style="margin-bottom:8px"><span class="pill ${SERIES_CLASS[s]}">${SERIES_LABEL[s]}</span> <b>${esc(r.winnerName)}</b> wins <span class="sub">&middot; ${r.laps} laps${r.cautions?` &middot; ${r.cautions} caution${r.cautions!==1?'s':''}`:''}</span>${r.qualifying?.poleWinner ? `<div class="sub" style="margin-top:2px">Pole: ${esc(r.qualifying.poleWinner)}${stageWinners?` &middot; ${stageWinners}`:''}</div>` : ''}</div>`);
    }
  }
  return `<h1>Race Schedule</h1><div class="subtitle">36-week shared calendar &middot; Daytona opens the year &middot; Cup races all 36, O'Reilly and Truck race a spaced-out subset of the same weeks.</div>
   <div class="card" style="margin-bottom:18px">
     <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
       <div><div class="stat-label">${seasonOver ? 'Season Complete' : `Next Week — ${g.currentWeekIndex+1} of 36`}</div>
         <div style="font-family:var(--font-display);font-size:18px;text-transform:uppercase">${seasonOver ? 'All 36 weeks run' : esc(nextGlobal?.trackName || '')}</div>
         ${!seasonOver ? `<div class="sub" style="margin-top:2px">${['CUP','OREILLY','TRUCK'].filter(s=>nextGlobal.seriesRacing[s]).map(s=>SERIES_LABEL[s]).join(' &middot; ')}</div>` : ''}
       </div>
       <div class="spacer" style="flex:1"></div>
       ${!seasonOver ? `<button class="btn btn-ghost btn-sm" id="btn-practice">Practice</button><button class="btn btn-primary" id="btn-run-race">Simulate Week</button><button class="btn" id="btn-watch-race">Watch Cup Race</button>` : `<button class="btn btn-primary" id="btn-complete-season">Start New Season</button>`}
     </div>
     ${lastLines.length ? `<div class="hazard" style="margin:14px 0"></div><div class="stat-label" style="margin-bottom:8px">Last Result — Week ${last.week} &middot; ${esc(last.trackName)}</div>${lastLines.join('')}` : ''}
   </div>
   <div class="tabs-inline" id="schedule-series-tabs">${['CUP','OREILLY','TRUCK'].map(s=>`<button data-series="${s}" class="${state.scheduleSeries===s?'active':''}">${SERIES_LABEL[s]} (${s==='CUP'?36:s==='OREILLY'?g.tracks.oreillyRaceCount:g.tracks.truckRaceCount})</button>`).join('')}</div>
   <table><thead><tr><th>Wk</th><th>Race #</th><th>Track</th><th>Type</th><th>Phase</th><th>Status</th></tr></thead><tbody>
     ${seriesSchedule.map(r=>{ const isNext = nextForSeries && r.week===nextForSeries.week; const isRun = (r.week-1) < g.currentWeekIndex; return `<tr style="${isNext?'background:rgba(255,182,39,0.06)':''}"><td>${r.week}</td><td>${r[numKey]}/${totalForSeries}</td><td class="namecol">${esc(r.trackName)}</td><td>${categoryLabel[r.category]||r.category}</td><td>${r[phaseKey]==='PLAYOFF' ? '<span class="pill cup">Chase</span>' : '<span class="pill">Regular</span>'}</td><td>${isRun ? '<span style="color:var(--steel)">Run</span>' : isNext ? '<span style="color:var(--amber)">Next</span>' : '—'}</td></tr>`; }).join('')}
   </tbody></table>`;
}
function practiceModalHtml(series){
  const g = state.game;
  const data = g.runPracticeForWeek(series);
  const playerTeam = teamById(g.playerTeamId);
  const isPlayerSeries = playerTeam?.series === series;
  const rows = data.map(p=>{ const driver = g.drivers.getDrivers().find(d=>d.id===p.driverId); const team = driver ? teamById(driver.teamId) : null; return { ...p, driver, team }; }).sort((a,b)=>b.shortRunPace-a.shortRunPace);
  return `<div class="modal-header"><div class="titles"><h2 style="margin-bottom:2px">Practice — ${SERIES_LABEL[series]}</h2><div class="sub">${isPlayerSeries ? 'Set a focus for your drivers before qualifying' : 'Pace estimates for this week'}</div></div><button class="modal-close" data-close>&times;</button></div>
   <div class="modal-body">
     ${!rows.length ? `<div class="emptystate">No practice data — this series may not be racing this week.</div>` : `
     <table><thead><tr><th>Driver</th><th>Team</th><th>Short Run</th><th>Long Run</th>${isPlayerSeries?'<th>Focus</th>':''}</tr></thead><tbody>
       ${rows.map(r=>{ const isMine = isPlayerSeries && r.driver?.teamId===g.playerTeamId; return `<tr><td class="namecol">${esc(r.driver?.fullName||'')}</td><td class="namecol">${esc(r.team?.name||'')}</td><td>${r.shortRunPace}</td><td>${r.longRunPace}</td>${isPlayerSeries ? `<td>${isMine ? `<button class="btn btn-sm ${r.driver.practiceFocus==='SHORT_RUN'?'btn-primary':''}" data-practice-focus="${r.driverId}" data-focus="SHORT_RUN">Short</button><button class="btn btn-sm ${r.driver.practiceFocus==='LONG_RUN'?'btn-primary':''}" data-practice-focus="${r.driverId}" data-focus="LONG_RUN">Long</button><button class="btn btn-sm" data-practice-focus="${r.driverId}" data-focus="">Clear</button>` : ''}</td>` : ''}</tr>`; }).join('')}
     </tbody></table>
     ${isPlayerSeries ? `<div class="sub" style="margin-top:10px">Short Run gives a small qualifying bonus. Long Run reduces tire wear during the race.</div>` : ''}
     `}
   </div>`;
}
const NEWS_CATEGORY_LABEL = { driver_market:'Driver Market', personnel:'Personnel', business:'Business', performance:'Performance', rivalry:'Rivalry', manufacturer:'Manufacturer', streak:'Streak', general:'General' };
function dedupeConsecutiveNews(items){ const out = []; for(const item of items){ const prev = out[out.length-1]; if(prev && prev.headline===item.headline) continue; out.push(item); } return out; }
function renderNews(){
  const g = state.game;
  const standings = g.world.manufacturers.standings();
  const rawNews = g.world.news.latest(80);
  const news = dedupeConsecutiveNews(rawNews).slice(0, 30);
  const cat = state.newsCategory;
  const filtered = cat==='ALL' ? news : news.filter(n=>n.category===cat);
  const categories = ['ALL', ...new Set(rawNews.map(n=>n.category))];
  const importanceColor = (imp) => imp==='high' ? 'var(--amber)' : 'var(--steel)';
  return `<h1>League News</h1><div class="subtitle">Headlines, manufacturer standings, and rivalries from around the league.</div>
   <h2 style="margin-bottom:10px">Manufacturer Standings</h2>
   <div class="grid grid-3" style="margin-bottom:24px">${standings.map((m,i)=>`<div class="card"><div class="stat-label">${i===0?'★ ':''}${esc(m.manufacturer)}</div><div class="stat" style="font-size:20px">${m.points.toLocaleString()} pts</div><div class="sub">${m.wins} wins &middot; ${m.top5} top 5s &middot; ${m.entries} entries</div></div>`).join('')}</div>
   <h2 style="margin-bottom:10px">Headlines</h2>
   <div class="tabs-inline" id="news-category-tabs">${categories.map(c=>`<button data-cat="${c}" class="${state.newsCategory===c?'active':''}">${c==='ALL'?'All':(NEWS_CATEGORY_LABEL[c]||c)}</button>`).join('')}</div>
   <div class="grid" style="gap:10px">${filtered.map(n=>`<div class="card"><div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:4px"><b style="font-size:13px;color:${importanceColor(n.importance)}">${esc(n.headline)}</b></div><div class="sub" style="margin-bottom:4px">${esc(n.body)}</div><div class="sub" style="font-size:11px">Week ${n.week} &middot; ${NEWS_CATEGORY_LABEL[n.category]||n.category}</div></div>`).join('') || `<div class="emptystate">No news yet — run some race weeks.</div>`}</div>
   ${g.world.storylines.getRivalries().length ? `<h2 style="margin:24px 0 10px">Top Rivalries</h2><div class="grid" style="gap:8px">${g.world.storylines.getRivalries().slice(0,8).map(r=>`<div class="card"><div style="display:flex;justify-content:space-between"><b style="font-size:13px">${esc(r.a)} vs ${esc(r.b)}</b><span class="sub">Level ${r.level}/5</span></div><div class="sub">${r.battles} battles${r.incidents?` &middot; ${r.incidents} incidents`:''}</div></div>`).join('')}</div>` : ''}`;
}
const RD_FIELDS = [['chassisRating','Chassis'],['engineRating','Engine'],['aeroRating','Aero'],['handling','Handling'],['reliability','Reliability']];
function renderOwner(){
  const g = state.game;
  const team = teamById(g.playerTeamId);
  const finance = g.finance.getForTeam(team.id);
  const cars = g.cars.getCarsForTeam(team.id);
  const avg = (field) => cars.length ? Math.round(cars.reduce((s,c)=>s+(c[field]||0),0)/cars.length) : 0;
  const cost = RD_COST_BY_SERIES[team.series] || 150000;
  const activeProjects = g.research.getForTeam(team.id);
  const projectByCategory = new Map(activeProjects.map(p=>[p.category,p]));
  const staffRows = ALL_ROLES.filter(r=>r!=='Crew Chief').map(role => { const a = g.assignments.getForTeam(team.id).find(x=>x.position===role); const person = a ? g.personnel.getPeople().find(p=>p.id===a.personId) : null; return { role, person }; });
  const myDrivers = g.drivers.getDriversForTeam(team.id);
  const seats = (team.vehicleCount||0) + (team.partTimeVehicles||0);
  const sponsors = g.sponsors.getForTeam(team.id);
  const adapter = buildPersonnelAdapter(g);
  const myCrewChiefs = adapter.crewChiefs.filter(c=>c.teamId===team.id);
  const season = g.calendar.getYear();
  return `<h1>Owner Decisions</h1><div class="subtitle">${esc(team.name)} &middot; ${money(finance.cash)} on hand</div>
   <h2 style="margin-top:6px">Research &amp; Development</h2>
   <div class="grid grid-3" style="margin-bottom:20px">${RD_FIELDS.map(([field,label])=>{ const active = projectByCategory.get(field); return `<div class="card"><div class="stat-label">${label}</div><div class="stat" style="margin-bottom:8px">${avg(field)}</div>${active ? `<div class="sub" style="margin-bottom:4px">In progress &middot; ${active.completionDays}d left</div><div class="barmeter"><div style="width:${Math.round(100*(1-active.completionDays/active.daysTotal))}%"></div></div>` : `<button class="btn btn-sm" data-rd="${field}">Invest ${money(cost)}</button>`}</div>`; }).join('')}</div>
   <h2>Crew Chief</h2>
   <div class="grid" style="gap:8px;margin-bottom:10px">${myCrewChiefs.map(cc=>{ const contract = getActiveContract(adapter, cc.id); const buyout = contract ? calculateBuyout(contract, season) : 0; const yearsLeft = contract ? Math.max(0, contract.endSeason - season + 1) : 0; return `<div class="card"><div style="display:flex;gap:12px;align-items:center;margin-bottom:10px">${roundel(initials(cc.fullName), cc.id, 'sm')}<div class="meta"><div class="name">${esc(cc.fullName)}</div><div class="sub">Overall ${cc.overall} &middot; Strategy ${cc.strategy} &middot; Setup ${cc.setupAbility} &middot; Comm ${cc.communication}</div></div></div>${contract ? `<div class="sub" style="margin-bottom:10px">${money(contract.salary)}/yr &middot; ${yearsLeft}yr left &middot; buyout ${money(buyout)}</div>` : ''}<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-sm" data-extend-cc="${cc.id}">Extend +1yr</button><button class="btn btn-sm" data-buyout-cc="${cc.id}">Buyout (${money(buyout)})</button><button class="btn btn-sm" data-release-cc="${cc.id}">Release</button></div></div>`; }).join('') || `<div class="emptystate">No crew chief signed.</div>`}</div>
   <button class="btn" id="btn-hire-crew-chief" style="margin-bottom:26px">Hire Crew Chief</button>
   <h2>Driver Pairing</h2>
   <div class="grid" style="gap:8px;margin-bottom:26px">${myDrivers.map(d=>{ const paired = d.crewChiefId ? myCrewChiefs.find(c=>c.id===d.crewChiefId) : null; return `<div class="entity-card">${roundel(d.number, d.teamId, 'sm')}<div class="meta"><div class="name">${esc(d.fullName)}</div><div class="sub">${paired ? `Paired with ${esc(paired.fullName)} (Overall ${paired.overall})` : 'No crew chief paired'}</div></div>${paired ? `<button class="btn btn-sm" data-unpair-driver="${d.id}">Unpair</button>` : (myCrewChiefs.length ? `<button class="btn btn-sm" data-pair-driver="${d.id}">Pair</button>` : '')}</div>`; }).join('') || `<div class="emptystate">No drivers signed.</div>`}</div>
   <h2>Staff</h2>
   <table style="margin-bottom:24px"><thead><tr><th>Role</th><th>Name</th><th>Rating</th><th></th></tr></thead><tbody>${staffRows.map(({role,person})=>`<tr><td>${esc(role)}</td><td class="namecol">${person?esc(person.fullName):'— Vacant —'}</td><td>${person?Math.round((person.experience+person.potential)/2):'—'}</td><td>${person ? `<button class="btn btn-sm" data-fire="${person.id}">Release</button>` : `<button class="btn btn-sm" data-hire-role="${esc(role)}">Hire</button>`}</td></tr>`).join('')}</tbody></table>
   <h2>Drivers <span class="sub" style="font-family:var(--font-body);text-transform:none">&middot; ${myDrivers.length}/${seats} seats filled</span></h2>
   <div class="grid" style="gap:8px;margin-bottom:14px">${myDrivers.map(d=>`<div class="entity-card">${roundel(d.number,d.teamId,'sm')}<div class="meta"><div class="name">${esc(d.fullName)}</div><div class="sub">Overall ${d.rating} &middot; ${d.contractYears}yr left &middot; ${money(d.salary)}/yr</div></div><button class="btn btn-sm" data-release-driver="${d.id}">Release</button></div>`).join('') || `<div class="emptystate">No drivers signed.</div>`}</div>
   <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:26px"><button class="btn" id="btn-sign-driver">Sign Free Agent</button><button class="btn" id="btn-propose-trade">Propose Trade</button></div>
   <h2>Sponsors</h2>
   <div class="grid" style="gap:8px;margin-bottom:12px">${sponsors.map(s=>`<div class="card"><div style="display:flex;justify-content:space-between;margin-bottom:6px"><b style="font-size:13px">${esc(s.sponsorName)}</b><span style="font-family:var(--font-mono);color:var(--green);font-size:13px">${money(s.value)}</span></div><div class="sub">${s.remainingDays} days left</div></div>`).join('') || `<div class="emptystate">No sponsors signed.</div>`}</div>
   <button class="btn btn-primary" id="btn-negotiate-sponsor">Negotiate New Sponsor</button>
   <h2 style="margin-top:26px">Race Day</h2>
   <div id="raceday-pitcrew-root"></div>`;
}
function hireModalHtml(role){
  const g = state.game;
  const assigned = new Set(g.assignments.getAssignments().map(a=>a.personId));
  const candidates = g.personnel.getPeople().filter(p=>!assigned.has(p.id)).sort((a,b)=>b.potential-a.potential).slice(0,15);
  return `<div class="modal-header"><div class="titles"><h2 style="margin-bottom:2px">Hire — ${esc(role)}</h2><div class="sub">Top available free agents</div></div><button class="modal-close" data-close>&times;</button></div>
   <div class="modal-body"><div class="grid" style="gap:8px">
     ${candidates.map(p=>`<div class="entity-card">${roundel(initials(p.fullName), p.id, 'sm')}<div class="meta"><div class="name">${esc(p.fullName)}</div><div class="sub">Potential ${p.potential} &middot; Exp ${p.experience} &middot; ${money(p.salary)}/yr</div></div><button class="btn btn-sm" data-hire="${p.id}" data-role="${esc(role)}">Sign</button></div>`).join('') || `<div class="emptystate">No free agents available right now.</div>`}
   </div></div>`;
}
function hireCrewChiefModalHtml(){
  const g = state.game;
  const team = teamById(g.playerTeamId);
  const adapter = buildPersonnelAdapter(g);
  const openRoles = g.assignments.getOpenRoles(team.id);
  const hasOpenRole = openRoles.includes('Crew Chief');
  const candidates = rankFreeAgents(getFreeAgentPool(adapter, 'CrewChief'), 'overall').slice(0,15);
  return `<div class="modal-header"><div class="titles"><h2 style="margin-bottom:2px">Hire Crew Chief</h2><div class="sub">${hasOpenRole ? 'Top available free agents' : 'No open crew chief slot on this team'}</div></div><button class="modal-close" data-close>&times;</button></div>
   <div class="modal-body">${!hasOpenRole ? `<div class="emptystate" style="margin-bottom:12px">Release your current crew chief first.</div>` : ''}
   <div class="grid" style="gap:8px">${candidates.map(cc=>`<div class="entity-card">${roundel(initials(cc.fullName), cc.id, 'sm')}<div class="meta"><div class="name">${esc(cc.fullName)}</div><div class="sub">Overall ${cc.overall} &middot; Strategy ${cc.strategy} &middot; Setup ${cc.setupAbility} &middot; ${money(calculateMarketValue(cc))}/yr</div></div>${hasOpenRole ? `<button class="btn btn-sm" data-hire-cc="${cc.id}">Sign</button>` : ''}</div>`).join('') || `<div class="emptystate">No free agent crew chiefs available right now.</div>`}</div>
   </div>`;
}
function signDriverModalHtml(){
  const g = state.game;
  const team = teamById(g.playerTeamId);
  const seats = (team.vehicleCount||0) + (team.partTimeVehicles||0);
  const openSeats = seats - g.drivers.getDriversForTeam(team.id).length;
  const agents = g.drivers.getFreeAgents(team.series).sort((a,b)=>b.rating-a.rating);
  return `<div class="modal-header"><div class="titles"><h2 style="margin-bottom:2px">Sign Free Agent</h2><div class="sub">${SERIES_LABEL[team.series]} &middot; ${openSeats} open seat${openSeats!==1?'s':''}</div></div><button class="modal-close" data-close>&times;</button></div>
   <div class="modal-body">${openSeats<=0 ? `<div class="emptystate" style="margin-bottom:12px">No open seats — release a driver first.</div>` : ''}
   <div class="grid" style="gap:8px">${agents.map(d=>`<div class="entity-card">${roundel(d.number, d.id, 'sm')}<div class="meta"><div class="name">${esc(d.fullName)}</div><div class="sub">Overall ${d.rating} &middot; ${money(d.salary)}/yr</div></div>${openSeats>0 ? `<button class="btn btn-sm" data-sign-driver="${d.id}">Sign</button>` : ''}</div>`).join('') || `<div class="emptystate">No free agent drivers in this series right now.</div>`}</div>
   </div>`;
}
function tradeModalHtml(){
  const g = state.game;
  const team = teamById(g.playerTeamId);
  const myDrivers = g.drivers.getDriversForTeam(team.id);
  const others = g.drivers.getDrivers().filter(d=>d.series===team.series && d.teamId && d.teamId!==team.id);
  return `<div class="modal-header"><div class="titles"><h2 style="margin-bottom:2px">Propose Trade</h2><div class="sub">${SERIES_LABEL[team.series]}</div></div><button class="modal-close" data-close>&times;</button></div>
   <div class="modal-body">${myDrivers.length ? `
     <div style="margin-bottom:16px"><div class="stat-label" style="margin-bottom:6px">Offer one of your drivers</div>
       <select id="trade-my-driver" style="width:100%">${myDrivers.map(d=>`<option value="${d.id}">#${esc(d.number)} ${esc(d.fullName)} (${d.rating} ovr)</option>`).join('')}</select>
     </div>
     <div class="stat-label" style="margin-bottom:6px">For one of these drivers</div>
     <div class="grid" style="gap:8px">${others.map(d=>{ const t = teamById(d.teamId); return `<div class="entity-card">${roundel(d.number, d.teamId, 'sm')}<div class="meta"><div class="name">${esc(d.fullName)}</div><div class="sub">${t?esc(t.name):''} &middot; Overall ${d.rating}</div></div><button class="btn btn-sm" data-propose-trade="${d.id}" data-target-team="${d.teamId}">Offer</button></div>`; }).join('') || `<div class="emptystate">No other drivers in this series.</div>`}</div>
   ` : `<div class="emptystate">You have no drivers to trade.</div>`}</div>`;
}
const TABS = [
  ['overview','Overview'], ['roster','My Roster'], ['owner','Owner'], ['schedule','Schedule'], ['news','News'], ['teams','League Teams'],
  ['drivers','League Drivers'], ['personnel','Personnel'], ['standings','Standings'],
];
function render(){
  const root = document.getElementById('app');
  const g = state.game;
  if(!g.playerTeamId){ root.innerHTML = renderTopbar() + renderOnboarding(); bindTopbar(); bindOnboarding(); return; }
  const tabHtml = { overview: renderOverview, roster: renderRoster, owner: renderOwner, schedule: renderSchedule, news: renderNews, teams: renderTeams, drivers: renderDrivers, personnel: renderPersonnel, standings: renderStandings }[state.tab]();
  root.innerHTML = `${renderTopbar()}<div class="hazard"></div><div class="shell"><div class="sidebar">${TABS.map(([key,label])=>`<div class="navitem ${state.tab===key?'active':''}" data-tab="${key}">${label}</div>`).join('')}</div><div class="content">${tabHtml}</div></div>`;
  bindTopbar(); bindSidebar(); bindContentDelegates();
  if(state.tab === 'owner'){
    const pitCrewRoot = document.getElementById('raceday-pitcrew-root');
    const team = teamById(g.playerTeamId);
    if(pitCrewRoot && team){ renderRaceDayPitCrewPanel(g, team, pitCrewRoot); pitCrewRoot.querySelectorAll('[data-pit]').forEach(btn=>btn.addEventListener('click', ()=>persist())); }
  }
}
function bindTopbar(){
  document.getElementById('btn-advance-day')?.addEventListener('click', ()=>{ state.game.advanceDays(1); persist(); render(); toast('Advanced 1 day'); });
  document.getElementById('btn-advance-week')?.addEventListener('click', ()=>{ state.game.advanceDays(7); persist(); render(); toast('Advanced 7 days'); });
  document.getElementById('btn-save')?.addEventListener('click', ()=>{ persist(); toast('Game saved'); });
  document.getElementById('btn-newgame')?.addEventListener('click', ()=>{
    if(!confirm('Start a brand new game? This discards your current save.')) return;
    localStorage.removeItem(SAVE_KEY); state.game = new MainGame().startGame(); state.tab = 'overview'; render();
  });
}
function bindOnboarding(){
  document.querySelectorAll('[data-pick-team]').forEach(el=>{ el.addEventListener('click', ()=>{ state.game.playerTeamId = el.getAttribute('data-pick-team'); state.tab = 'overview'; persist(); render(); }); });
}
function bindSidebar(){ document.querySelectorAll('[data-tab]').forEach(el=>{ el.addEventListener('click', ()=>{ state.tab = el.getAttribute('data-tab'); render(); }); }); }
function bindContentDelegates(){
  const content = document.querySelector('.content');
  if(!content) return;
  content.querySelector('#teams-search')?.addEventListener('input', (e)=>{ state.teamsSearch = e.target.value; render(); refocus('#teams-search'); });
  content.querySelector('#drivers-search')?.addEventListener('input', (e)=>{ state.driversSearch = e.target.value; render(); refocus('#drivers-search'); });
  content.querySelector('#personnel-search')?.addEventListener('input', (e)=>{ state.personnelSearch = e.target.value; render(); refocus('#personnel-search'); });
  content.querySelector('#personnel-position')?.addEventListener('change', (e)=>{ state.personnelPosition = e.target.value; render(); });
  content.querySelectorAll('#teams-series-tabs button').forEach(b=>b.addEventListener('click', ()=>{ state.teamsSeries=b.getAttribute('data-series'); render(); }));
  content.querySelectorAll('#drivers-series-tabs button').forEach(b=>b.addEventListener('click', ()=>{ state.driversSeries=b.getAttribute('data-series'); render(); }));
  content.querySelectorAll('#personnel-status-tabs button').forEach(b=>b.addEventListener('click', ()=>{ state.personnelStatus=b.getAttribute('data-status'); render(); }));
  content.querySelectorAll('#standings-series-tabs button').forEach(b=>b.addEventListener('click', ()=>{ state.standingsSeries=b.getAttribute('data-series'); render(); }));
  content.querySelectorAll('#standings-view-tabs button').forEach(b=>b.addEventListener('click', ()=>{ state.standingsView=b.getAttribute('data-view'); render(); }));
  content.querySelectorAll('#schedule-series-tabs button').forEach(b=>b.addEventListener('click', ()=>{ state.scheduleSeries=b.getAttribute('data-series'); render(); }));
  content.querySelectorAll('#news-category-tabs button').forEach(b=>b.addEventListener('click', ()=>{ state.newsCategory=b.getAttribute('data-cat'); render(); }));
  content.querySelectorAll('th[data-sort]').forEach(th=>th.addEventListener('click', ()=>{ const key = th.getAttribute('data-sort'); if(state.driversSort.col===key) state.driversSort.dir *= -1; else state.driversSort = { col:key, dir:-1 }; render(); }));
  content.querySelectorAll('[data-view-driver]').forEach(el=>el.addEventListener('click', ()=>{ const d = state.game.drivers.getDrivers().find(x=>x.id===el.getAttribute('data-view-driver')); if(d) openModal(driverModalHtml(d)); bindModal(); }));
  content.querySelectorAll('[data-view-driver-stats]').forEach(el=>el.addEventListener('click', ()=>{ openModal(driverStatsModalHtml(el.getAttribute('data-view-driver-stats'))); bindModal(); }));
  content.querySelectorAll('[data-view-person]').forEach(el=>el.addEventListener('click', (e)=>{ e.stopPropagation(); const p = state.game.personnel.getPeople().find(x=>x.id===el.getAttribute('data-view-person')); if(!p) return; const a = state.game.assignments.getAssignments().find(x=>x.personId===p.id); openModal(personModalHtml(p,a)); bindModal(); }));
  content.querySelectorAll('[data-view-team]').forEach(el=>el.addEventListener('click', ()=>{ const t = teamById(el.getAttribute('data-view-team')); if(t) openModal(teamModalHtml(t)); bindModal(); }));
  content.querySelector('#btn-run-race')?.addEventListener('click', ()=>{
    const result = state.game.runNextRaceWeek(); if(!result) return; persist(); render();
    const cupWinner = result.seriesResults.CUP?.winnerName; toast(cupWinner ? `${cupWinner} wins at ${result.trackName}` : `Week ${result.week} complete`);
  });
  content.querySelector('#btn-watch-race')?.addEventListener('click', ()=>{ startWatchRace(); });
  content.querySelector('#btn-practice')?.addEventListener('click', ()=>{ openModal(practiceModalHtml(state.scheduleSeries)); bindModal(); });
  content.querySelector('#btn-complete-season')?.addEventListener('click', ()=>{ const result = state.game.completeSeason(); persist(); render(); toast(`New season! ${result.year} Cup champion: ${result.champions.CUP || 'TBD'}`); });
  content.querySelectorAll('[data-rd]').forEach(btn=>btn.addEventListener('click', ()=>{ const category = btn.getAttribute('data-rd'); const project = state.game.investRD(category); persist(); render(); toast(project ? 'R&D project started' : "Not enough cash, or that category's already in progress"); }));
  content.querySelectorAll('[data-fire]').forEach(btn=>btn.addEventListener('click', ()=>{ const ok = state.game.fireStaff(btn.getAttribute('data-fire')); persist(); render(); toast(ok ? 'Released to free agency' : 'Could not release'); }));
  content.querySelectorAll('[data-hire-role]').forEach(btn=>btn.addEventListener('click', ()=>{ openModal(hireModalHtml(btn.getAttribute('data-hire-role'))); bindModal(); }));
  content.querySelectorAll('[data-release-driver]').forEach(btn=>btn.addEventListener('click', ()=>{ const ok = state.game.releaseDriver(btn.getAttribute('data-release-driver')); persist(); render(); toast(ok ? 'Driver released to free agency' : 'Could not release'); }));
  content.querySelector('#btn-sign-driver')?.addEventListener('click', ()=>{ openModal(signDriverModalHtml()); bindModal(); });
  content.querySelector('#btn-propose-trade')?.addEventListener('click', ()=>{ openModal(tradeModalHtml()); bindModal(); });
  content.querySelector('#btn-negotiate-sponsor')?.addEventListener('click', ()=>{ const result = state.game.negotiateSponsor(); persist(); render(); toast(result ? `${result.sponsorName} signed!` : 'Sponsor negotiation fell through'); });
  content.querySelector('#btn-hire-crew-chief')?.addEventListener('click', ()=>{ openModal(hireCrewChiefModalHtml()); bindModal(); });
  content.querySelectorAll('[data-extend-cc]').forEach(btn=>btn.addEventListener('click', ()=>{ const contract = state.game.extendCrewChiefContractAction(btn.getAttribute('data-extend-cc'), 1); persist(); render(); toast(contract ? 'Contract extended' : 'Could not extend contract'); }));
  content.querySelectorAll('[data-buyout-cc]').forEach(btn=>btn.addEventListener('click', ()=>{ if(!confirm('Buy out this crew chief\'s remaining contract? This cannot be undone.')) return; const ok = state.game.buyoutCrewChiefAction(btn.getAttribute('data-buyout-cc')); persist(); render(); toast(ok ? 'Crew chief bought out' : 'Not enough cash to buy out this contract'); }));
  content.querySelectorAll('[data-release-cc]').forEach(btn=>btn.addEventListener('click', ()=>{ const ok = state.game.releaseCrewChiefAction(btn.getAttribute('data-release-cc')); persist(); render(); toast(ok ? 'Crew chief released to free agency' : 'Could not release'); }));
  content.querySelectorAll('[data-pair-driver]').forEach(btn=>btn.addEventListener('click', ()=>{
    const g = state.game; const team = teamById(g.playerTeamId); const adapter = buildPersonnelAdapter(g);
    const myCrewChief = adapter.crewChiefs.find(c=>c.teamId===team.id);
    if(!myCrewChief){ toast('No crew chief to pair with'); return; }
    const ok = g.pairDriverCrewChiefAction(btn.getAttribute('data-pair-driver'), myCrewChief.id);
    persist(); render(); toast(ok ? 'Paired!' : 'Could not pair');
  }));
  content.querySelectorAll('[data-unpair-driver]').forEach(btn=>btn.addEventListener('click', ()=>{ const ok = state.game.unpairDriverAction(btn.getAttribute('data-unpair-driver')); persist(); render(); toast(ok ? 'Unpaired' : 'Could not unpair'); }));
}
function bindModal(){
  document.querySelector('[data-close]')?.addEventListener('click', closeModal);
  document.querySelectorAll('[data-view-team]').forEach(el=>el.addEventListener('click', ()=>{ const t = teamById(el.getAttribute('data-view-team')); if(t) openModal(teamModalHtml(t)); bindModal(); }));
  document.getElementById('btn-switch-team')?.addEventListener('click', (e)=>{ state.game.playerTeamId = e.target.getAttribute('data-team'); persist(); closeModal(); state.tab = 'overview'; render(); toast('You now own this organization'); });
  document.querySelectorAll('[data-hire]').forEach(btn=>btn.addEventListener('click', ()=>{ const ok = state.game.hireStaff(btn.getAttribute('data-hire'), btn.getAttribute('data-role')); persist(); closeModal(); render(); toast(ok ? 'Hired!' : 'Could not hire — role may already be filled'); }));
  document.querySelectorAll('[data-sign-driver]').forEach(btn=>btn.addEventListener('click', ()=>{ const ok = state.game.signFreeAgentDriver(btn.getAttribute('data-sign-driver')); persist(); closeModal(); render(); toast(ok ? 'Driver signed!' : 'Could not sign — no open seat or not enough cash'); }));
  document.querySelectorAll('[data-hire-cc]').forEach(btn=>btn.addEventListener('click', ()=>{ const contract = state.game.hireCrewChiefAction(btn.getAttribute('data-hire-cc')); persist(); closeModal(); render(); toast(contract ? 'Crew chief signed!' : 'Could not hire — no open slot or not enough cash'); }));
  document.querySelectorAll('[data-propose-trade]').forEach(btn=>btn.addEventListener('click', ()=>{
    const myDriverId = document.getElementById('trade-my-driver')?.value;
    const targetDriverId = btn.getAttribute('data-propose-trade'); const targetTeamId = btn.getAttribute('data-target-team');
    const ok = myDriverId ? state.game.proposeTrade(myDriverId, targetTeamId, targetDriverId) : false;
    persist(); closeModal(); render(); toast(ok ? 'Trade accepted!' : 'They declined the trade.');
  }));
  document.querySelectorAll('[data-practice-focus]').forEach(btn=>btn.addEventListener('click', ()=>{
    const driverId = btn.getAttribute('data-practice-focus'); const focus = btn.getAttribute('data-focus') || null;
    state.game.setPracticeFocusAction(driverId, focus); persist();
    openModal(practiceModalHtml(state.scheduleSeries)); bindModal();
  }));
}
let liveViewer = null;
function liveRaceOverlayHtml(trackName, carCount, hasMap){
  return `<div class="live-race" id="live-race"><div class="live-race-header"><div><div class="stat-label">Live &middot; ${esc(trackName)} &middot; ${carCount} cars</div><div id="live-lap" style="font-family:var(--font-display);font-size:20px;text-transform:uppercase">Lap 1</div></div><div id="live-caution" class="live-caution-badge"></div><div class="spacer"></div><button class="btn btn-sm" id="live-pause">Pause</button><button class="btn btn-sm" id="live-skip">Skip to Finish</button><button class="btn btn-sm btn-ghost" id="live-close" style="display:none">Close</button></div>
   <div class="live-race-body"><div class="panel-scroll">${hasMap ? `<div id="live-track-map" class="race-map-container" style="margin-bottom:12px"></div>` : ''}<table><thead><tr><th>Pos</th><th>Driver</th><th>Lap</th><th>Speed</th><th>Status</th></tr></thead><tbody id="live-leaderboard-body"></tbody></table></div><div class="live-feed" id="live-feed"></div></div></div>`;
}
function renderLiveLeaderboard(engine, mapKey){
  const lapEl = document.getElementById('live-lap');
  if(lapEl) lapEl.textContent = `Lap ${Math.min(engine.currentLap(), engine.totalLaps)} / ${engine.totalLaps}`;
  const cautionEl = document.getElementById('live-caution');
  if(cautionEl){ if(engine.caution){ cautionEl.textContent = `CAUTION — ${engine.caution.type}`; cautionEl.classList.add('active'); } else cautionEl.classList.remove('active'); }
  const body = document.getElementById('live-leaderboard-body');
  if(body){ body.innerHTML = engine.getLeaderboard().map(row => `<tr><td class="rank">${row.position}</td><td class="namecol">${esc(row.driver)}</td><td>${row.lap}/${engine.totalLaps}</td><td>${row.speed} mph</td><td>${esc(row.status)}</td></tr>`).join(''); }
  if(mapKey){ const mapRoot = document.getElementById('live-track-map'); const track = getTrackMap(mapKey); if(mapRoot && track) mapRoot.innerHTML = renderTrack(buildLiveViewSession(engine, mapKey), track); }
}
function finishLiveRaceUI(engine, mapKey){
  const result = state.game.finishLiveCupRace(engine); persist(); renderLiveLeaderboard(engine, mapKey);
  const pauseBtn = document.getElementById('live-pause'), skipBtn = document.getElementById('live-skip'), closeBtn = document.getElementById('live-close');
  if(pauseBtn) pauseBtn.style.display = 'none'; if(skipBtn) skipBtn.style.display = 'none'; if(closeBtn) closeBtn.style.display = '';
  const lapEl = document.getElementById('live-lap'); const winner = result?.seriesResults?.CUP?.winnerName;
  if(lapEl) lapEl.textContent = winner ? `Finished — ${winner} wins` : 'Finished';
  if(winner) toast(`${winner} wins at ${result.trackName}`);
  return result;
}
function startWatchRace(){
  const engine = state.game.startLiveCupRace();
  if(!engine){ toast('No race to watch — season may be complete, or no Cup drivers signed'); return; }
  persist();
  const w = state.game.tracks.getSchedule()[state.game.currentWeekIndex];
  const mapKey = findTrackMapKey(w.trackId);
  document.body.insertAdjacentHTML('beforeend', liveRaceOverlayHtml(w.trackName, engine.cars.length, !!mapKey));
  let lastRender = 0;
  liveViewer = new LiveRaceViewer(engine, {
    onUpdate: (eng) => { const now = performance.now(); if(now - lastRender < 130) return; lastRender = now; renderLiveLeaderboard(eng, mapKey); },
    onEvent: (text) => { const feed = document.getElementById('live-feed'); if(!feed) return; const line = document.createElement('div'); line.textContent = text; feed.prepend(line); while(feed.children.length > 30) feed.removeChild(feed.lastChild); },
    onFinish: (eng) => { finishLiveRaceUI(eng, mapKey); },
  });
  document.getElementById('live-pause')?.addEventListener('click', (e) => { if(engine.paused){ liveViewer.resume(); e.target.textContent = 'Pause'; } else { liveViewer.stop(); e.target.textContent = 'Resume'; } });
  document.getElementById('live-skip')?.addEventListener('click', () => { liveViewer.stop(); engine.paused = false; engine.running = true; let ticks = 0; while(!engine.completed && ticks < 20000){ engine.update(1); ticks++; } finishLiveRaceUI(engine, mapKey); });
  document.getElementById('live-close')?.addEventListener('click', () => { document.getElementById('live-race')?.remove(); liveViewer = null; render(); });
  liveViewer.start();
}
function refocus(sel){ const el = document.querySelector(sel); if(el){ el.focus(); const len=el.value.length; el.setSelectionRange?.(len,len); } }
boot();
