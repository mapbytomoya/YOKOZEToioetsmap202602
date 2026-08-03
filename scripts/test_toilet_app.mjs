import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile("toilet-access-map/app.js", "utf8");
const html = await readFile("toilet-access-map/index.html", "utf8");
const reference = JSON.parse(await readFile("data/reference/osm_toilet_candidates.geojson", "utf8"));
const submitted = JSON.parse(await readFile("data/submitted/submitted_toilets.geojson", "utf8"));
const verified = JSON.parse(await readFile("data/verified/YOKOZEatlas2026_verified_toilets_v0.1.0.geojson", "utf8"));

const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
const staticSelectorIds = [...app.matchAll(/\$\("#([A-Za-z0-9_-]+)"\)/g)].map((match) => match[1]);
const missingIds = [...new Set(staticSelectorIds)].filter((id) => !htmlIds.has(id));

assert.deepEqual(missingIds, [], `HTMLに存在しないID: ${missingIds.join(", ")}`);
assert.equal(reference.type, "FeatureCollection");
assert.equal(reference.features.length, 19);
assert.equal(submitted.type, "FeatureCollection");
assert(Array.isArray(submitted.features));
submitted.features.forEach((feature) => {
  assert.equal(feature.geometry?.type, "Point");
  assert.equal(feature.properties?.verification_status, "submitted");
  assert.equal(feature.properties?.cc0_eligible, false);
});
assert.equal(verified.type, "FeatureCollection");
assert.equal(verified.features.length, 0);

for (const id of [
  "layer-submitted", "submitted-count", "new-osm-note-panel", "new-osm-note-link",
  "exterior-note", "flush-type", "toilet-style", "equipment-note",
  "open-update-router", "update-route-dialog", "update-kind-step", "update-method-step",
  "selected-update-kind", "back-to-update-kind",
]) {
  assert(htmlIds.has(id), `${id} がありません`);
}

assert(app.includes("../data/submitted/submitted_toilets.geojson"));
assert(app.includes("https://www.openstreetmap.org/note/new#map=19/"));
assert(app.includes("mapbytomoya/YOKOZEToioetsmap202602/issues/new"));
assert(app.includes("verification_status: \"submitted\""));
assert(html.includes("Actionsが確認待ち地図へ自動反映"));
assert(html.includes("新規メモはアカウント不要"));
assert(html.includes('data-update-kind="new"'));
assert(html.includes('data-update-kind="existing"'));
assert(html.includes('data-update-method="osm_edit"'));
assert(html.includes('data-update-method="osm_note"'));
assert(html.includes('data-update-method="github_issue"'));
assert(app.includes("runExistingPointAction"));
assert(app.includes('new maplibregl.Popup({ maxWidth: "760px" })'));

console.log("site integration: ok");
