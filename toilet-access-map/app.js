const REFERENCE_DATA_URL = "../data/reference/YOKOZEatlas2026_reference_toilets_v0.1.0.geojson";
const VERIFIED_DATA_URL = "../data/verified/YOKOZEatlas2026_verified_toilets_v0.1.0.geojson";
const ISSUE_URL = "https://github.com/furuhashilab/YOKOZEatlas2026/issues/new";
const YOKOZE_BOUNDS = [
  [139.03, 35.94],
  [139.19, 36.04]
];
const YOKOZE_VIEW = {
  center: [139.106, 35.986],
  zoom: 12.2,
  bearing: -18,
  pitch: 48
};

const labels = {
  public_toilet: "公衆トイレ",
  park: "公園",
  station: "駅",
  public_facility: "公共施設",
  tourism: "観光施設",
  convenience: "コンビニ",
  cafe: "カフェ",
  restaurant: "飲食店",
  other: "その他",
  public: "誰でも利用可",
  customers: "利用者・購入者向け",
  permission: "声掛け・許可が必要",
  restricted: "制限あり",
  unknown: "未確認",
  yes: "あり",
  no: "なし",
  limited: "限定的",
  male: "男性用",
  female: "女性用",
  unisex: "共用",
  mixed: "男女別あり",
  reference: "参考・未確認",
  submitted: "投稿済み・確認待ち",
  verified: "確認済み・CC0公開対象",
  osm_reference: "OSM参考照合",
  official_web: "公式Web",
  phone: "電話",
  email: "メール",
  field_survey: "現地調査",
  user_submission: "利用者投稿"
};

let map;
let draftMarker;
let pickingPosition = false;
let importedSvgMarker;
let importedSvgUrl;

const $ = (selector) => document.querySelector(selector);

function toDisplay(value) {
  if (value === null || value === undefined || value === "" || value === "unknown") {
    return "未確認";
  }
  if (typeof value === "boolean") {
    return value ? "はい" : "いいえ";
  }
  return labels[value] || String(value);
}

function safeText(value, maxLength = 1000) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function xmlEscape(value) {
  return safeText(value, 120).replace(/[<>&"']/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "\"": "&quot;",
    "'": "&apos;"
  }[char]));
}

function markdownValue(value, fallback = "unknown") {
  const cleaned = safeText(value, 800);
  return cleaned || fallback;
}

function isNearYokoze(lng, lat) {
  return lng >= YOKOZE_BOUNDS[0][0] && lng <= YOKOZE_BOUNDS[1][0] &&
    lat >= YOKOZE_BOUNDS[0][1] && lat <= YOKOZE_BOUNDS[1][1];
}

function setStatus(message, isError = false) {
  const target = $("#loading-status");
  target.textContent = message;
  target.classList.toggle("error-message", isError);
}

function initMap() {
  maplibregl.setRTLTextPlugin(
    "https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.3.0/dist/mapbox-gl-rtl-text.js",
    true
  );

  map = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: YOKOZE_VIEW.center,
    zoom: YOKOZE_VIEW.zoom,
    bearing: YOKOZE_VIEW.bearing,
    pitch: YOKOZE_VIEW.pitch,
    cooperativeGestures: true,
    attributionControl: false
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
  map.addControl(new maplibregl.AttributionControl({
    compact: true,
    customAttribution: [
      "<a href=\"https://openfreemap.org/\" target=\"_blank\" rel=\"noopener\">OpenFreeMap</a>",
      "<a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\" rel=\"noopener\">© OpenStreetMap contributors</a>",
      "<a href=\"https://mapterhorn.com/attribution\" target=\"_blank\" rel=\"noopener\">© Mapterhorn</a>",
      "OSM参考データ: ODbL 1.0",
      "YOKOZE Atlas確認済みデータ: CC0 1.0"
    ]
  }), "bottom-right");

  map.on("load", async () => {
    addTerrain();
    await loadToiletLayers();
  });

  map.on("click", (event) => {
    if (!pickingPosition) return;
    setDraftPosition(event.lngLat.lng, event.lngLat.lat, true);
    pickingPosition = false;
    $("#position-help").textContent = "位置を指定しました。必要に応じて仮マーカーをドラッグしてください。";
    openDialog($("#submission-dialog"));
  });

  map.on("error", (event) => {
    if (event?.error) {
      console.warn(event.error);
    }
  });
}

function addTerrain() {
  if (!map.getSource("mapterhorn-dem")) {
    map.addSource("mapterhorn-dem", {
      type: "raster-dem",
      tiles: ["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"],
      encoding: "terrarium",
      tileSize: 512,
      attribution: "<a href=\"https://mapterhorn.com/attribution\" target=\"_blank\" rel=\"noopener\">© Mapterhorn</a>"
    });
  }
  map.setTerrain({ source: "mapterhorn-dem", exaggeration: 1.15 });
}

async function loadJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${url} を読み込めませんでした`);
  }
  return response.json();
}

async function loadToiletLayers() {
  try {
    const [referenceData, verifiedData] = await Promise.all([
      loadJson(REFERENCE_DATA_URL),
      loadJson(VERIFIED_DATA_URL)
    ]);
    addPointLayer("reference-toilets", referenceData, "#b65f00", "参考");
    addPointLayer("verified-toilets", verifiedData, "#0b7d62", "確認済み");
    const total = referenceData.features.length + verifiedData.features.length;
    setStatus(`表示中: reference ${referenceData.features.length}件、verified ${verifiedData.features.length}件。合計 ${total}件。`);
  } catch (error) {
    setStatus("データ取得エラー: GeoJSONを読み込めませんでした。", true);
    console.error(error);
  }
}

function addPointLayer(id, data, color, shortLabel) {
  if (map.getSource(id)) {
    map.getSource(id).setData(data);
    return;
  }

  map.addSource(id, {
    type: "geojson",
    data
  });

  map.addLayer({
    id: `${id}-circle`,
    type: "circle",
    source: id,
    paint: {
      "circle-color": color,
      "circle-radius": 9,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2
    }
  });

  map.addLayer({
    id: `${id}-label`,
    type: "symbol",
    source: id,
    layout: {
      "text-field": shortLabel,
      "text-size": 12,
      "text-offset": [0, 1.4],
      "text-anchor": "top"
    },
    paint: {
      "text-color": "#17201b",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.5
    }
  });

  map.on("click", `${id}-circle`, (event) => {
    const feature = event.features[0];
    const coordinates = feature.geometry.coordinates.slice();
    new maplibregl.Popup()
      .setLngLat(coordinates)
      .setDOMContent(createPopupContent(feature.properties))
      .addTo(map);
  });

  map.on("mouseenter", `${id}-circle`, () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", `${id}-circle`, () => {
    map.getCanvas().style.cursor = "";
  });
}

function createPopupContent(properties) {
  const status = properties.verification_status || "unknown";
  const wrapper = document.createElement("article");
  wrapper.className = "popup-card";

  const title = document.createElement("h3");
  title.textContent = toDisplay(properties.name);
  wrapper.append(title);

  const pill = document.createElement("span");
  pill.className = `status-pill ${status}`;
  pill.textContent = toDisplay(status);
  wrapper.append(pill);

  const caution = document.createElement("p");
  caution.className = "small-note";
  caution.textContent = "未確認情報を含むため、現地案内と施設管理者の指示を優先してください。";
  wrapper.append(caution);

  const rows = [
    ["施設種別", toDisplay(properties.category)],
    ["施設利用時間", toDisplay(properties.facility_opening_hours)],
    ["トイレ利用時間", toDisplay(properties.toilet_opening_hours)],
    ["一般利用条件", toDisplay(properties.access)],
    ["車いす対応", toDisplay(properties.wheelchair)],
    ["おむつ交換台", toDisplay(properties.changing_table)],
    ["オストメイト設備", toDisplay(properties.ostomy)],
    ["最終確認日", toDisplay(properties.verification_date)],
    ["情報源", toDisplay(properties.source_name)],
    ["座標の情報源", toDisplay(properties.coordinate_source)],
    ["データライセンス", toDisplay(properties.data_license)],
    ["CC0収録可否", toDisplay(properties.cc0_eligible)]
  ];

  const table = document.createElement("table");
  table.className = "popup-table";
  rows.forEach(([heading, value]) => {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    const td = document.createElement("td");
    th.textContent = heading;
    td.textContent = value;
    tr.append(th, td);
    table.append(tr);
  });
  wrapper.append(table);

  if (properties.source_url) {
    const link = document.createElement("a");
    link.href = properties.source_url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "公式情報を開く";
    wrapper.append(link);
  }

  return wrapper;
}

function openDialog(dialog) {
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

function closeDialog(button) {
  const dialog = button.closest("dialog");
  if (dialog) dialog.close();
}

function setDraftPosition(lng, lat, moveMap = false) {
  const fixedLng = Number(lng).toFixed(6);
  const fixedLat = Number(lat).toFixed(6);
  $("#longitude").value = fixedLng;
  $("#latitude").value = fixedLat;

  const lngLat = [Number(fixedLng), Number(fixedLat)];
  if (!draftMarker) {
    draftMarker = new maplibregl.Marker({ color: "#1e6ea7", draggable: true })
      .setLngLat(lngLat)
      .addTo(map);
    draftMarker.on("dragend", () => {
      const next = draftMarker.getLngLat();
      setDraftPosition(next.lng, next.lat, false);
    });
  } else {
    draftMarker.setLngLat(lngLat);
  }

  updatePositionWarning();
  if (moveMap) map.easeTo({ center: lngLat, duration: 300 });
}

function updatePositionWarning() {
  const lat = Number($("#latitude").value);
  const lng = Number($("#longitude").value);
  const warning = $("#position-warning");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    warning.hidden = true;
    return;
  }
  if (!isNearYokoze(lng, lat)) {
    warning.textContent = "横瀬町から大きく離れた座標の可能性があります。位置を確認してください。";
    warning.hidden = false;
  } else {
    warning.hidden = true;
  }
}

function getFormDataObject() {
  return {
    facilityName: safeText($("#facility-name").value, 80),
    category: $("#category").value,
    latitude: Number($("#latitude").value),
    longitude: Number($("#longitude").value),
    access: $("#access").value || "unknown",
    purchaseNote: safeText($("#purchase-note").value, 120) || "unknown",
    permissionNote: safeText($("#permission-note").value, 120) || "unknown",
    toiletHours: safeText($("#toilet-hours").value, 80) || "unknown",
    wheelchair: $("#wheelchair").value || "unknown",
    changingTable: $("#changing-table").value || "unknown",
    ostomy: $("#ostomy").value || "unknown",
    gender: $("#gender").value || "unknown",
    verificationDate: $("#verification-date").value || null,
    verificationMethod: $("#verification-method").value || "user_submission",
    sourceName: safeText($("#source-name").value, 160) || "user_submission",
    notes: safeText($("#notes").value, 800) || "unknown",
    cc0Agreement: $("#cc0-agreement").checked
  };
}

function validateSubmission() {
  const data = getFormDataObject();
  const error = $("#form-error");
  const messages = [];
  if (!data.facilityName) messages.push("施設名を入力してください。");
  if (!data.category) messages.push("施設種別を選択してください。");
  if (!Number.isFinite(data.latitude) || !Number.isFinite(data.longitude)) messages.push("地図上の位置を指定してください。");
  if (!data.cc0Agreement) messages.push("CC0で公開することへの同意が必要です。");

  if (messages.length) {
    error.textContent = messages.join(" ");
    error.hidden = false;
    return null;
  }

  error.hidden = true;
  return data;
}

function buildIssueBody(data) {
  return `## 基本情報

- 施設名: ${markdownValue(data.facilityName)}
- 施設種別: ${markdownValue(data.category)}
- 緯度: ${data.latitude.toFixed(6)}
- 経度: ${data.longitude.toFixed(6)}

## 利用条件

- 一般利用: ${markdownValue(data.access)}
- 購入・施設利用: ${markdownValue(data.purchaseNote)}
- 声掛け: ${markdownValue(data.permissionNote)}
- 利用可能時間: ${markdownValue(data.toiletHours)}

## 設備

- 車いす対応: ${markdownValue(data.wheelchair)}
- おむつ交換台: ${markdownValue(data.changingTable)}
- オストメイト設備: ${markdownValue(data.ostomy)}
- 男女区分: ${markdownValue(data.gender)}

## 確認情報

- 確認日: ${markdownValue(data.verificationDate)}
- 確認方法: ${markdownValue(data.verificationMethod)}
- 情報源: ${markdownValue(data.sourceName)}
- 備考: ${markdownValue(data.notes)}

## ライセンス同意

- CC0 1.0での公開に同意: はい
- 他の地図サービス等からコピーしていない: はい

## 管理者確認メモ

- 投稿直後は地図へ自動表示しない
- 確認後にのみ \`data/verified/\` のCC0用GeoJSONへ追加する
- Google Maps等からの転用がないか確認する`;
}

function buildIssueUrl(data) {
  const params = new URLSearchParams({
    title: `[トイレ情報投稿] ${data.facilityName}`,
    body: buildIssueBody(data),
    labels: "data"
  });
  return `${ISSUE_URL}?${params.toString()}`;
}

function buildDraftFeature(data) {
  const slug = data.facilityName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 36) || "submitted-toilet";
  const id = `submitted-${slug}-${new Date().toISOString().slice(0, 10)}`;

  return {
    type: "Feature",
    id,
    geometry: {
      type: "Point",
      coordinates: [Number(data.longitude.toFixed(6)), Number(data.latitude.toFixed(6))]
    },
    properties: {
      id,
      name: data.facilityName,
      category: data.category,
      longitude: Number(data.longitude.toFixed(6)),
      latitude: Number(data.latitude.toFixed(6)),
      access: data.access,
      access_note: `購入・施設利用: ${data.purchaseNote}; 声掛け: ${data.permissionNote}`,
      facility_opening_hours: "unknown",
      toilet_opening_hours: data.toiletHours,
      fee: "unknown",
      wheelchair: data.wheelchair,
      changing_table: data.changingTable,
      ostomy: data.ostomy,
      gender: data.gender,
      verification_status: "submitted",
      verification_method: data.verificationMethod,
      verification_date: data.verificationDate,
      source_name: data.sourceName,
      source_url: null,
      source_license: "user_submission",
      coordinate_source: "user_submission",
      data_license: "CC0 1.0 Universal after administrator verification",
      cc0_eligible: true,
      notes: data.notes
    }
  };
}

function buildDraftSvg(data) {
  const name = xmlEscape(data.facilityName);
  const status = "submitted";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="140" viewBox="0 0 360 140" role="img" aria-label="${name} 投稿下書き">
  <rect width="360" height="140" rx="8" fill="#ffffff"/>
  <circle cx="48" cy="48" r="20" fill="#1e6ea7"/>
  <text x="48" y="55" text-anchor="middle" font-size="24" font-family="sans-serif" fill="#ffffff">T</text>
  <text x="82" y="42" font-size="18" font-family="sans-serif" font-weight="700" fill="#17201b">${name}</text>
  <text x="82" y="70" font-size="13" font-family="sans-serif" fill="#546159">status: ${status}</text>
  <text x="82" y="94" font-size="13" font-family="sans-serif" fill="#546159">lat: ${data.latitude.toFixed(6)}, lng: ${data.longitude.toFixed(6)}</text>
  <text x="82" y="116" font-size="12" font-family="sans-serif" fill="#a9352a">未確認投稿。管理者確認前は正式データではありません。</text>
</svg>`;
}

async function copyDraft() {
  const text = $("#draft-output").value;
  if (!text) return;
  await navigator.clipboard.writeText(text);
}

async function handleGeoJsonImport(file) {
  const status = $("#import-status");
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const featureCollection = normalizeGeoJson(data);
    if (!featureCollection.features.length) {
      throw new Error("Point地物がありません");
    }
    addPointLayer("imported-toilets", featureCollection, "#1e6ea7", "取込");
    map.fitBounds(boundsFromFeatures(featureCollection.features), { padding: 80, maxZoom: 16 });
    status.textContent = `GeoJSONを${featureCollection.features.length}件プレビューしました。正式データには未追加です。`;
  } catch (error) {
    status.textContent = `GeoJSONを読み込めませんでした: ${error.message}`;
  }
}

function normalizeGeoJson(data) {
  const collection = data.type === "FeatureCollection" ? data : {
    type: "FeatureCollection",
    features: data.type === "Feature" ? [data] : []
  };
  const pointFeatures = collection.features.filter((feature) => feature?.geometry?.type === "Point");
  return {
    type: "FeatureCollection",
    features: pointFeatures.map((feature, index) => ({
      ...feature,
      properties: {
        verification_status: "submitted",
        name: `取り込みプレビュー ${index + 1}`,
        category: "other",
        data_license: "preview only",
        cc0_eligible: false,
        ...feature.properties
      }
    }))
  };
}

function boundsFromFeatures(features) {
  const bounds = new maplibregl.LngLatBounds();
  features.forEach((feature) => bounds.extend(feature.geometry.coordinates));
  return bounds;
}

async function handleSvgImport(file) {
  const status = $("#import-status");
  try {
    const raw = await file.text();
    const sanitized = sanitizeSvg(raw);
    if (importedSvgUrl) URL.revokeObjectURL(importedSvgUrl);
    importedSvgUrl = URL.createObjectURL(new Blob([sanitized], { type: "image/svg+xml" }));

    const preview = $("#svg-preview");
    preview.replaceChildren();
    const img = document.createElement("img");
    img.alt = "取り込みSVGプレビュー";
    img.src = importedSvgUrl;
    preview.append(img);

    const lngLat = draftMarker ? draftMarker.getLngLat() : map.getCenter();
    const markerElement = document.createElement("div");
    markerElement.className = "marker-svg-preview";
    const markerImg = document.createElement("img");
    markerImg.alt = "";
    markerImg.src = importedSvgUrl;
    markerElement.append(markerImg);

    if (importedSvgMarker) importedSvgMarker.remove();
    importedSvgMarker = new maplibregl.Marker({ element: markerElement, draggable: true })
      .setLngLat(lngLat)
      .addTo(map);
    status.textContent = "SVGをプレビューしました。正式データには未追加です。";
  } catch (error) {
    status.textContent = `SVGを読み込めませんでした: ${error.message}`;
  }
}

function sanitizeSvg(raw) {
  if (raw.length > 120000) {
    throw new Error("SVGファイルが大きすぎます");
  }
  const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
  if (doc.querySelector("parsererror") || !doc.documentElement || doc.documentElement.nodeName.toLowerCase() !== "svg") {
    throw new Error("SVGとして解釈できません");
  }
  doc.querySelectorAll("script, foreignObject").forEach((node) => node.remove());
  doc.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value.toLowerCase();
      if (name.startsWith("on") || value.includes("javascript:")) {
        node.removeAttribute(attr.name);
      }
    });
  });
  return new XMLSerializer().serializeToString(doc.documentElement);
}

function clearImports() {
  ["imported-toilets-circle", "imported-toilets-label"].forEach((id) => {
    if (map.getLayer(id)) map.removeLayer(id);
  });
  if (map.getSource("imported-toilets")) map.removeSource("imported-toilets");
  if (importedSvgMarker) importedSvgMarker.remove();
  importedSvgMarker = null;
  if (importedSvgUrl) URL.revokeObjectURL(importedSvgUrl);
  importedSvgUrl = null;
  $("#svg-preview").replaceChildren();
  $("#geojson-import").value = "";
  $("#svg-import").value = "";
  $("#import-status").textContent = "プレビューを消去しました。";
}

function bindUi() {
  $("#open-form").addEventListener("click", () => openDialog($("#submission-dialog")));
  $("#open-import").addEventListener("click", () => openDialog($("#import-dialog")));
  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => closeDialog(button));
  });

  $("#terrain-toggle").addEventListener("change", (event) => {
    map.setTerrain(event.target.checked ? { source: "mapterhorn-dem", exaggeration: 1.15 } : null);
  });

  $("#fit-yokoze").addEventListener("click", () => {
    map.easeTo(YOKOZE_VIEW);
  });

  $("#pick-position").addEventListener("click", () => {
    pickingPosition = true;
    $("#position-help").textContent = "地図上のトイレ位置をクリックしてください。";
    $("#submission-dialog").close();
  });

  ["#latitude", "#longitude"].forEach((selector) => {
    $(selector).addEventListener("change", () => {
      const lat = Number($("#latitude").value);
      const lng = Number($("#longitude").value);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setDraftPosition(lng, lat, true);
      }
    });
  });

  $("#toilet-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = validateSubmission();
    if (!data) return;
    window.open(buildIssueUrl(data), "_blank", "noopener");
  });

  $("#make-draft-geojson").addEventListener("click", () => {
    const data = validateSubmission();
    if (!data) return;
    $("#draft-output").value = JSON.stringify(buildDraftFeature(data), null, 2);
  });

  $("#make-draft-svg").addEventListener("click", () => {
    const data = validateSubmission();
    if (!data) return;
    $("#draft-output").value = buildDraftSvg(data);
  });

  $("#copy-draft").addEventListener("click", copyDraft);

  $("#geojson-import").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) handleGeoJsonImport(file);
  });

  $("#svg-import").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) handleSvgImport(file);
  });

  $("#clear-imports").addEventListener("click", clearImports);
}

bindUi();
initMap();
