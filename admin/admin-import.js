// BraapTrax Admin — GPX / KML parsing.
//
// Dependency-free on purpose: the browser's DOMParser handles both formats,
// which avoids a third-party CDN/transpile dependency at runtime and lets us
// support GPX tracks/segments/routes and KML LineString + gx:Track uniformly.
// Each parser returns an array of track candidates; tracks are never merged.
//
//   parseTrackFile(fileName, text) ->
//     { kind: "gpx" | "kml", tracks: [{ name, points: [{lat,lng,ele?}] }] }

function descendantsByLocalName(root, localName) {
  const out = [];
  const all = root.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    if (all[i].localName === localName) out.push(all[i]);
  }
  return out;
}

function childByLocalName(node, localName) {
  for (let c = node.firstElementChild; c; c = c.nextElementSibling) {
    if (c.localName === localName) return c;
  }
  return null;
}

function textOf(node, localName) {
  const el = childByLocalName(node, localName);
  return el && el.textContent ? el.textContent.trim() : "";
}

function num(v) {
  const n = parseFloat(v);
  return isFinite(n) ? n : undefined;
}

function parseXml(text) {
  const dom = new DOMParser().parseFromString(text, "application/xml");
  if (dom.getElementsByTagName("parsererror").length) {
    throw new Error("File is not valid XML.");
  }
  return dom;
}

// ---- GPX ------------------------------------------------------------------
export function parseGpx(text) {
  const dom = parseXml(text);
  const tracks = [];

  const trks = descendantsByLocalName(dom, "trk");
  trks.forEach((trk, ti) => {
    const trkName = textOf(trk, "name") || `Track ${ti + 1}`;
    const segs = descendantsByLocalName(trk, "trkseg");
    segs.forEach((seg, si) => {
      const points = descendantsByLocalName(seg, "trkpt")
        .map((p) => ({
          lat: num(p.getAttribute("lat")),
          lng: num(p.getAttribute("lon")),
          ele: num(textOf(p, "ele")),
        }))
        .filter((p) => p.lat != null && p.lng != null);
      if (points.length >= 2) {
        tracks.push({
          name: segs.length > 1 ? `${trkName} · segment ${si + 1}` : trkName,
          points,
        });
      }
    });
  });

  descendantsByLocalName(dom, "rte").forEach((rte, ri) => {
    const points = descendantsByLocalName(rte, "rtept")
      .map((p) => ({
        lat: num(p.getAttribute("lat")),
        lng: num(p.getAttribute("lon")),
        ele: num(textOf(p, "ele")),
      }))
      .filter((p) => p.lat != null && p.lng != null);
    if (points.length >= 2) {
      tracks.push({
        name: (textOf(rte, "name") || `Route ${ri + 1}`) + " (route)",
        points,
      });
    }
  });

  return { kind: "gpx", tracks };
}

// ---- KML ------------------------------------------------------------------
function kmlCoordsText(text) {
  // "lng,lat[,alt] lng,lat[,alt] ..." (whitespace separated tuples)
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => {
      const [lng, lat, ele] = tok.split(",");
      return { lat: num(lat), lng: num(lng), ele: num(ele) };
    })
    .filter((p) => p.lat != null && p.lng != null);
}

export function parseKml(text) {
  const dom = parseXml(text);
  const tracks = [];

  descendantsByLocalName(dom, "Placemark").forEach((pm, pi) => {
    const pmName = textOf(pm, "name") || `Placemark ${pi + 1}`;
    const geometries = [];

    descendantsByLocalName(pm, "LineString").forEach((ls) => {
      const c = childByLocalName(ls, "coordinates");
      if (c && c.textContent) geometries.push(kmlCoordsText(c.textContent));
    });

    // Google extension: <gx:Track> with repeated <gx:coord>lng lat alt</gx:coord>
    descendantsByLocalName(pm, "Track").forEach((tr) => {
      const pts = descendantsByLocalName(tr, "coord")
        .map((c) => {
          const [lng, lat, ele] = (c.textContent || "").trim().split(/\s+/);
          return { lat: num(lat), lng: num(lng), ele: num(ele) };
        })
        .filter((p) => p.lat != null && p.lng != null);
      if (pts.length) geometries.push(pts);
    });

    geometries
      .filter((g) => g.length >= 2)
      .forEach((points, gi) => {
        tracks.push({
          name:
            geometries.length > 1 ? `${pmName} · part ${gi + 1}` : pmName,
          points,
        });
      });
  });

  return { kind: "kml", tracks };
}

export function parseTrackFile(fileName, text) {
  const ext = String(fileName || "").toLowerCase().split(".").pop();
  if (ext === "gpx") return parseGpx(text);
  if (ext === "kml") return parseKml(text);
  throw new Error("Unsupported file type — upload a .gpx or .kml file.");
}
