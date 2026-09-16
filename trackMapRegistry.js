export const TRACK_MAPS = {
  daytona: { id: "daytona", name: "Daytona International Speedway", type: "Superspeedway",
    path: [[.18,.70],[.14,.58],[.15,.42],[.22,.28],[.40,.18],[.62,.18],[.79,.28],[.85,.42],[.86,.58],[.80,.72],[.62,.82],[.39,.82],[.22,.74],[.18,.70]] },
  talladega: { id: "talladega", name: "Talladega Superspeedway", type: "Superspeedway",
    path: [[.17,.68],[.12,.50],[.18,.30],[.37,.18],[.63,.18],[.82,.30],[.88,.50],[.82,.70],[.63,.82],[.37,.82],[.17,.68]] },
  charlotte: { id: "charlotte", name: "Charlotte Motor Speedway", type: "Intermediate",
    path: [[.22,.72],[.16,.57],[.20,.36],[.35,.22],[.67,.20],[.82,.34],[.86,.55],[.79,.72],[.60,.82],[.35,.82],[.22,.72]] },
  martinsville: { id: "martinsville", name: "Martinsville Speedway", type: "Short Track",
    path: [[.23,.72],[.17,.55],[.23,.30],[.42,.18],[.63,.20],[.82,.34],[.86,.55],[.78,.74],[.56,.82],[.34,.80],[.23,.72]] },
  watkinsGlen: { id: "watkinsGlen", name: "Watkins Glen International", type: "Road Course",
    path: [[.18,.62],[.23,.45],[.40,.44],[.48,.25],[.72,.22],[.83,.35],[.71,.48],[.56,.49],[.66,.65],[.82,.72],[.69,.84],[.46,.78],[.35,.65],[.18,.62]] }
};
export function getTrackMap(trackId) { return TRACK_MAPS[trackId] || null; }
export function interpolateTrackPosition(track, progress) {
  if (!track?.path?.length) return { x: .5, y: .5 };
  const path = track.path;
  const scaled = (((progress % 1) + 1) % 1) * (path.length - 1);
  const i = Math.floor(scaled), f = scaled - i;
  const a = path[i], b = path[Math.min(i + 1, path.length - 1)];
  return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f };
}
