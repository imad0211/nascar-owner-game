import { TRACK_MAPS, getTrackMap } from "./trackMapData.js";
export function registerTrackMap(trackMap) {
  if (!trackMap?.id) throw new Error("Track map requires an id.");
  TRACK_MAPS[trackMap.id] = trackMap;
  return trackMap;
}
export function getAvailableTrackMaps() { return Object.values(TRACK_MAPS); }
export { getTrackMap };
