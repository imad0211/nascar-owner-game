import { TRACKS } from './Tracks.js';

export function getTrackById(id){ return TRACKS.find(t=>t.id===id); }
export function getTracksByCategory(category){ return TRACKS.filter(t=>t.category===category); }
export function getTrackCount(){ return TRACKS.length; }
export function getTrackSummary(){
  return { total: TRACKS.length, superspeedways: TRACKS.filter(t=>t.category==='superspeedway').length, intermediates: TRACKS.filter(t=>t.category==='intermediate').length, shortTracks: TRACKS.filter(t=>t.category==='short').length, roadCourses: TRACKS.filter(t=>t.category==='roadCourse').length };
}
export function calculateTrackPerformance(track, driver, car){
  let driverSkill = driver.overall || 70;
  if(track.category==='superspeedway') driverSkill = driver.superspeedway || driver.overall || 70;
  if(track.category==='intermediate') driverSkill = driver.intermediate || driver.overall || 70;
  if(track.category==='short') driverSkill = driver.shortTrack || driver.overall || 70;
  if(track.category==='roadCourse') driverSkill = driver.roadCourse || driver.overall || 70;
  const speedScore = (car.speed||70) * (track.speed/100);
  const aeroScore = (car.aero||70) * (track.aero/100);
  const handlingScore = (car.handling||70) * (track.handling/100);
  const driverScore = driverSkill * 0.45;
  const carScore = speedScore*0.20 + aeroScore*0.15 + handlingScore*0.20;
  const consistency = (driver.consistency||70) * 0.05;
  const randomFactor = Math.random()*8 - 4;
  return driverScore + carScore + consistency + randomFactor;
}
export function calculateIncidentChance(track, driver, car){
  const aggression = driver.aggression || 50;
  const reliability = car.reliability || 80;
  let chance = track.crashRisk*0.35 + aggression*0.20 - reliability*0.20;
  return Math.max(1, Math.min(40, chance));
}
export function getTrackCharacteristics(track){
  return {
    drafting: track.drafting>=80?'Extreme':track.drafting>=60?'High':track.drafting>=40?'Moderate':'Low',
    tireWear: track.tireWear>=80?'Extreme':track.tireWear>=65?'High':track.tireWear>=45?'Moderate':'Low',
    passing: track.passing>=80?'Excellent':track.passing>=65?'Good':track.passing>=50?'Moderate':'Difficult',
    braking: track.braking>=85?'Heavy':track.braking>=60?'Moderate':'Light',
    aero: track.aero>=85?'Critical':track.aero>=65?'Important':'Low',
  };
}
const MANDATORY_IDS = ['daytona','martinsville','darlington','charlotte'];
export const CUP_REGULAR_RACES = 26;
export const CUP_PLAYOFF_RACES = 10;
export const SEASON_RACES = CUP_REGULAR_RACES + CUP_PLAYOFF_RACES;
export const CUP_PLAYOFF_FIELD = 16;
export const REGULAR_SEASON_RACES = CUP_REGULAR_RACES;
export const PLAYOFF_RACES = CUP_PLAYOFF_RACES;
export const OREILLY_MIN_RACES = 30;
export const OREILLY_MAX_RACES = 33;
export const OREILLY_PLAYOFF_RACES = 9;
export const OREILLY_PLAYOFF_FIELD = 12;
export const TRUCK_TOTAL_RACES = 22;
export const TRUCK_PLAYOFF_RACES = 7;
export const TRUCK_PLAYOFF_FIELD = 10;
function shuffle(arr, random){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){ const j = random.integer(0,i); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function pickEvenWeeks(totalWeeks, count, random){
  const base = [];
  for(let i=0;i<count;i++) base.push(Math.min(totalWeeks-1, Math.round(i*totalWeeks/count)));
  let set = new Set(base);
  let w = 0;
  while(set.size < count && w < totalWeeks){ if(!set.has(w)) set.add(w); w++; }
  let arr = Array.from(set).sort((a,b)=>a-b).slice(0,count);
  for(let k=1;k<arr.length-1;k++){
    if(random.chance(0.5)){
      const shift = random.integer(-1,1);
      const candidate = arr[k]+shift;
      if(candidate>arr[k-1] && candidate<arr[k+1]) arr[k]=candidate;
    }
  }
  return new Set(arr);
}
export function generateSeasonSchedule(random){
  const daytona = getTrackById('daytona');
  const otherMandatory = MANDATORY_IDS.filter(id=>id!=='daytona').map(getTrackById);
  const pool = TRACKS.filter(t=>!MANDATORY_IDS.includes(t.id));
  const fillCount = SEASON_RACES - MANDATORY_IDS.length;
  const fill = shuffle(pool, random).slice(0, fillCount);
  const rest = shuffle([...otherMandatory, ...fill], random);
  const cupOrder = [daytona, ...rest];
  const oreillyCount = random.integer(OREILLY_MIN_RACES, OREILLY_MAX_RACES);
  const truckCount = TRUCK_TOTAL_RACES;
  const oreillyWeeks = pickEvenWeeks(SEASON_RACES, oreillyCount, random);
  const truckWeeks = pickEvenWeeks(SEASON_RACES, truckCount, random);
  let cupNum=0, oreillyNum=0, truckNum=0;
  const weeks = cupOrder.map((track, i) => {
    cupNum++;
    const w = {
      week: i+1, trackId: track.id, trackName: track.name, category: track.category,
      phase: cupNum > CUP_REGULAR_RACES ? 'PLAYOFF' : 'REGULAR', cupRaceNumber: cupNum,
      cupPhase: cupNum > CUP_REGULAR_RACES ? 'PLAYOFF' : 'REGULAR',
      seriesRacing: { CUP:true, OREILLY: oreillyWeeks.has(i), TRUCK: truckWeeks.has(i) },
      oreillyRaceNumber: null, oreillyPhase: null, truckRaceNumber: null, truckPhase: null,
    };
    if(w.seriesRacing.OREILLY){ oreillyNum++; w.oreillyRaceNumber = oreillyNum; w.oreillyPhase = oreillyNum > (oreillyCount - OREILLY_PLAYOFF_RACES) ? 'PLAYOFF' : 'REGULAR'; }
    if(w.seriesRacing.TRUCK){ truckNum++; w.truckRaceNumber = truckNum; w.truckPhase = truckNum > (truckCount - TRUCK_PLAYOFF_RACES) ? 'PLAYOFF' : 'REGULAR'; }
    return w;
  });
  return { weeks, oreillyCount, truckCount };
}
export class TrackSystem {
  constructor(){ this.tracks = TRACKS; this.schedule = []; this.oreillyRaceCount = 0; this.truckRaceCount = 0; }
  getTracks(){ return this.tracks; }
  getTrack(id){ return getTrackById(id); }
  getSchedule(){ return this.schedule; }
  getScheduleForSeries(series){ return this.schedule.filter(w=>w.seriesRacing[series]); }
  initialize(random){
    this.tracks = TRACKS;
    const { weeks, oreillyCount, truckCount } = generateSeasonSchedule(random);
    this.schedule = weeks;
    this.oreillyRaceCount = oreillyCount;
    this.truckRaceCount = truckCount;
  }
}
