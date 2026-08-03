const OSM_CANDIDATES_DATA_URL = "../data/reference/osm_toilet_candidates.geojson";
const VERIFIED_DATA_URL = "../data/verified/YOKOZEatlas2026_verified_toilets_v0.1.0.geojson";
const ISSUE_URL = "https://github.com/mapbytomoya/YOKOZEToioetsmap202602/issues/new";
const SUBMISSION_EMAIL = "";
const YOKOZE_BOUNDS = [
  [139.03, 35.94],
  [139.19, 36.04]
];
const YOKOZE_VIEW = {
  center: [139.106, 35.986],
  zoom: 12.2,
  bearing: 0,
  pitch: 0
};
const BASEMAPS = {
  osm: {
    label: "OSM / OpenFreeMap",
    credit: "背景地図: OpenFreeMap",
    style: () => "https://tiles.openfreemap.org/styles/liberty",
    customAttribution: [
      "<a href=\"https://openfreemap.org/\" target=\"_blank\" rel=\"noopener\">OpenFreeMap</a>"
    ]
  },
  "gsi-standard": {
    label: "国土地理院 標準地図",
    credit: "背景地図: 国土地理院 標準地図",
    style: () => ({
      version: 8,
      sources: {
        "gsi-standard": {
          type: "raster",
          tiles: ["https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "<a href=\"https://maps.gsi.go.jp/development/ichiran.html\" target=\"_blank\" rel=\"noopener\">国土地理院</a>"
        }
      },
      layers: [
        {
          id: "gsi-background",
          type: "background",
          paint: {
            "background-color": "#eef2ed"
          }
        },
        {
          id: "gsi-standard",
          type: "raster",
          source: "gsi-standard",
          minzoom: 5,
          maxzoom: 18
        }
      ]
    }),
    customAttribution: []
  }
};
const DATA_ATTRIBUTION = [
  "<a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\" rel=\"noopener\">© OpenStreetMap contributors</a>",
  "OSMトイレ参考候補データ: ODbL 1.0",
  "YOKOZE Atlas確認済みデータ: CC0 1.0"
];

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
  user_submission: "利用者投稿",
  atlas: "YOKOZE Atlasへ確認情報を提供",
  atlas_and_osm: "YOKOZE Atlasへ提供し、OpenStreetMapにも追加"
};
const wheelchairLabels = {
  yes: "利用しやすい",
  limited: "一部利用可・要確認",
  no: "車いす対応なし",
  unknown: "未確認"
};
const wheelchairColors = {
  yes: "#1D744D",
  limited: "#D29A2E",
  no: "#B84A42",
  unknown: "#606A65"
};
const wheelchairColorExpression = [
  "match",
  ["get", "wheelchair_status"],
  "yes", wheelchairColors.yes,
  "limited", wheelchairColors.limited,
  "no", wheelchairColors.no,
  wheelchairColors.unknown
];

let map;
let draftMarker;
let pickingPosition = false;
let currentBasemap = "osm";
let currentWheelchairFilter = "all";
let attributionControl;
let referenceDataCache;
let verifiedDataCache;
let importedGeoJsonData;
let importedSvgMarkerElement;
const interactiveLayerIds = new Set();
const pointLayerGroupIds = new Set();
let didFitInitialReferenceBounds = false;
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

function normalizeWheelchairValue(value) {
  const normalized = safeText(value, 40).toLowerCase();
  if (["yes", "designated", "true", "1"].includes(normalized)) return "yes";
  if (["limited", "partial", "partly"].includes(normalized)) return "limited";
  if (["no", "false", "0"].includes(normalized)) return "no";
  return "unknown";
}

function getWheelchairLabel(value) {
  return wheelchairLabels[normalizeWheelchairValue(value)] || wheelchairLabels.unknown;
}

function withWheelchairAccessibilityProperties(feature) {
  const properties = feature.properties || {};
  const wheelchairStatus = normalizeWheelchairValue(properties.wheelchair || properties.wheelchair_status);
  return {
    ...feature,
    properties: {
      ...properties,
      wheelchair: properties.wheelchair || wheelchairStatus,
      wheelchair_status: wheelchairStatus,
      wheelchair_label: getWheelchairLabel(wheelchairStatus)
    }
  };
}

function safeText(value, maxLength = 1000) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function parseCoordinateInput(value) {
  const text = String(value ?? "").trim();
  return text ? Number(text) : Number.NaN;
}

function buildOsmEditUrl(osmId, latitude, longitude) {
  if (typeof osmId === "string") {
    const match = osmId.trim().match(/^(node|way|relation)\/(\d+)$/);
    if (match) {
      const [, type, id] = match;
      return `https://www.openstreetmap.org/edit?editor=id&${type}=${encodeURIComponent(id)}`;
    }
  }

  const lat = Number(latitude);
  const lng = Number(longitude);
  const fallbackLat = Number.isFinite(lat) ? lat : YOKOZE_VIEW.center[1];
  const fallbackLng = Number.isFinite(lng) ? lng : YOKOZE_VIEW.center[0];
  return `https://www.openstreetmap.org/edit?editor=id#map=19/${fallbackLat}/${fallbackLng}`;
}

function getOsmOriginalTags(properties) {
  if (typeof properties?.osm_original_tags_json === "string") {
    try {
      const parsed = JSON.parse(properties.osm_original_tags_json);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch (error) {
      console.warn("OSM参考タグを復元できませんでした。", error);
    }
  }
  return properties || {};
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
    style: BASEMAPS[currentBasemap].style(),
    center: YOKOZE_VIEW.center,
    zoom: YOKOZE_VIEW.zoom,
    bearing: YOKOZE_VIEW.bearing,
    pitch: YOKOZE_VIEW.pitch,
    cooperativeGestures: true,
    attributionControl: false
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
  updateAttributionControl();

  map.on("load", async () => {
    await restoreOverlays();
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

function updateAttributionControl() {
  if (attributionControl) {
    map.removeControl(attributionControl);
  }
  attributionControl = new maplibregl.AttributionControl({
    compact: true,
    customAttribution: [
      ...BASEMAPS[currentBasemap].customAttribution,
      ...DATA_ATTRIBUTION
    ]
  });
  map.addControl(attributionControl, "bottom-right");
  $("#basemap-credit").textContent = BASEMAPS[currentBasemap].credit;
}

async function switchBasemap(nextBasemap) {
  if (!BASEMAPS[nextBasemap] || nextBasemap === currentBasemap) return;
  currentBasemap = nextBasemap;
  $("#basemap-credit").textContent = BASEMAPS[currentBasemap].credit;
  setStatus(`背景地図を${BASEMAPS[currentBasemap].label}へ切り替えています。`);
  map.setStyle(BASEMAPS[currentBasemap].style());
  map.once("style.load", async () => {
    updateAttributionControl();
    await restoreOverlays();
    setStatus(`背景地図: ${BASEMAPS[currentBasemap].label}。reference ${referenceDataCache?.features.length || 0}件、verified ${verifiedDataCache?.features.length || 0}件。`);
  });
}

async function restoreOverlays() {
  await loadToiletLayers();
  restoreImportedGeoJson();
}

async function loadJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${url} を読み込めませんでした`);
  }
  return response.json();
}

async function loadToiletLayers() {
  setStatus("トイレ候補データを読み込んでいます。");
  try {
    if (!referenceDataCache || !verifiedDataCache) {
      const [osmCandidateData, verifiedData] = await Promise.all([
        loadJson(OSM_CANDIDATES_DATA_URL),
        loadJson(VERIFIED_DATA_URL)
      ]);
      referenceDataCache = normalizeOsmCandidates(osmCandidateData);
      verifiedDataCache = normalizePointCollection(verifiedData);
    }
    addPointLayer("reference-toilets", referenceDataCache, "OSM参考", "layer-osm-reference");
    addPointLayer("verified-toilets", verifiedDataCache, "確認済み", "layer-verified");
    const total = referenceDataCache.features.length + verifiedDataCache.features.length;
    setStatus(`表示中: reference ${referenceDataCache.features.length}件、verified ${verifiedDataCache.features.length}件。合計 ${total}件。`);
    fitInitialReferenceBounds();
  } catch (error) {
    setStatus("トイレ候補データを読み込めませんでした。", true);
    map.easeTo(YOKOZE_VIEW);
    console.error(error);
  }
}

function normalizeOsmCandidates(data) {
  const sourceFeatures = data.type === "FeatureCollection" ? data.features : [];
  const pointFeatures = sourceFeatures.filter((feature) => feature?.geometry?.type === "Point" && Array.isArray(feature.geometry.coordinates));
  return {
    type: "FeatureCollection",
    features: pointFeatures.map((feature, index) => {
      const coordinates = feature.geometry.coordinates;
      const originalProperties = feature.properties || {};
      const osmId = originalProperties["@id"] || feature.id || `osm-reference-${index + 1}`;
      return withWheelchairAccessibilityProperties({
        ...feature,
        id: osmId,
        properties: {
          ...originalProperties,
          id: osmId,
          osm_id: osmId,
          name: originalProperties.name || "OSM参考地点",
          category: "public_toilet",
          longitude: Number(coordinates[0]),
          latitude: Number(coordinates[1]),
          verification_status: "reference",
          verification_method: "osm_reference",
          source_name: "OpenStreetMap",
          source_license: "ODbL-1.0",
          data_license: "ODbL-1.0",
          coordinate_source: "OpenStreetMap",
          cc0_eligible: false,
          field_surveyed: false,
          osm_original_tags_json: JSON.stringify(originalProperties),
          duplicate_note: "他の候補地点と重複している可能性があります。"
        }
      });
    })
  };
}

function normalizePointCollection(data) {
  const sourceFeatures = data.type === "FeatureCollection" ? data.features : [];
  return {
    ...data,
    type: "FeatureCollection",
    features: sourceFeatures
      .filter((feature) => feature?.geometry?.type === "Point" && Array.isArray(feature.geometry.coordinates))
      .map(withWheelchairAccessibilityProperties)
  };
}

function fitInitialReferenceBounds() {
  if (didFitInitialReferenceBounds) return;
  didFitInitialReferenceBounds = true;
  const features = referenceDataCache?.features || [];
  if (!features.length) {
    map.easeTo(YOKOZE_VIEW);
    return;
  }
  try {
    map.fitBounds(boundsFromFeatures(features), { padding: 90, maxZoom: 15, duration: 700 });
  } catch (error) {
    map.easeTo(YOKOZE_VIEW);
    console.warn(error);
  }
}

function getLayerCheckboxState(checkboxId) {
  if (!checkboxId) return true;
  const checkbox = document.getElementById(checkboxId);
  return checkbox ? checkbox.checked : true;
}

function setLayerGroupVisibility(id, visible) {
  const visibility = visible ? "visible" : "none";
  [`${id}-circle`, `${id}-label`].forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visibility);
    }
  });
}

function getWheelchairFilterExpression() {
  if (currentWheelchairFilter === "all") return null;
  return ["==", ["get", "wheelchair_status"], currentWheelchairFilter];
}

function applyPointLayerFilter(id) {
  const filter = getWheelchairFilterExpression();
  [`${id}-circle`, `${id}-label`].forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setFilter(layerId, filter);
    }
  });
}

function setWheelchairFilter(value) {
  currentWheelchairFilter = wheelchairLabels[value] ? value : "all";
  pointLayerGroupIds.forEach(applyPointLayerFilter);
}

function addPointLayer(id, data, shortLabel, visibilityCheckboxId) {
  pointLayerGroupIds.add(id);
  if (map.getSource(id)) {
    map.getSource(id).setData(data);
    applyPointLayerFilter(id);
    setLayerGroupVisibility(id, getLayerCheckboxState(visibilityCheckboxId));
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
      "circle-color": wheelchairColorExpression,
      "circle-radius": [
        "match",
        ["get", "wheelchair_status"],
        "yes", 10,
        "limited", 9,
        "no", 8,
        8
      ],
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
      "text-size": 11,
      "text-offset": [0, 1.4],
      "text-anchor": "top"
    },
    paint: {
      "text-color": "#17201b",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.5
    }
  });

  applyPointLayerFilter(id);
  setLayerGroupVisibility(id, getLayerCheckboxState(visibilityCheckboxId));

  if (!interactiveLayerIds.has(id)) {
    interactiveLayerIds.add(id);
    map.on("click", `${id}-circle`, (event) => {
      const feature = event.features[0];
      const coordinates = feature.geometry.coordinates.slice();
      new maplibregl.Popup()
        .setLngLat(coordinates)
        .setDOMContent(createPopupContent(feature))
        .addTo(map);
    });

    map.on("mouseenter", `${id}-circle`, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", `${id}-circle`, () => {
      map.getCanvas().style.cursor = "";
    });
  }
}

function createPopupContent(feature) {
  const properties = feature.properties || {};
  const osmTags = getOsmOriginalTags(properties);
  const coordinates = feature.geometry?.coordinates || [properties.longitude, properties.latitude];
  const osmId = properties.osm_id || properties["@id"] || feature.id || "";
  const status = properties.verification_status || "unknown";
  const wheelchairStatus = normalizeWheelchairValue(properties.wheelchair_status || properties.wheelchair);
  const wrapper = document.createElement("article");
  wrapper.className = "popup-card";

  const title = document.createElement("h3");
  title.textContent = toDisplay(properties.name);
  wrapper.append(title);

  const pill = document.createElement("span");
  pill.className = `status-pill ${status}`;
  pill.textContent = toDisplay(status);
  wrapper.append(pill);

  const accessPill = document.createElement("span");
  accessPill.className = `accessibility-pill wheelchair-${wheelchairStatus}`;
  accessPill.textContent = `車いす対応: ${getWheelchairLabel(wheelchairStatus)}`;
  wrapper.append(accessPill);

  const caution = document.createElement("p");
  caution.className = "small-note";
  caution.textContent = status === "reference"
    ? "この地点はOpenStreetMapから抽出した参考情報です。位置、設備、利用条件等は独立確認されていません。"
    : "未確認情報を含む場合があります。現地案内と施設管理者の指示を優先してください。";
  wrapper.append(caution);

  const licenseNotice = document.createElement("p");
  licenseNotice.className = `popup-license ${status}`;
  licenseNotice.textContent = status === "reference"
    ? "OpenStreetMap参考データ｜ライセンス：ODbL 1.0｜YOKOZE AtlasのCC0公開データではありません"
    : status === "verified"
      ? "YOKOZE Atlas確認済みデータ｜ライセンス：CC0 1.0"
      : "投稿・取込データ｜管理者確認前・自動公開されません";
  wrapper.append(licenseNotice);

  const rows = [
    ["表示区分", status === "reference" ? "OSM参考地点・未確認・独立確認前・CC0データではない" : toDisplay(status)],
    ["OSM ID", toDisplay(osmId)],
    ["name", toDisplay(properties.name)],
    ["amenity", toDisplay(properties.amenity)],
    ["施設種別", toDisplay(properties.category)],
    ["施設利用時間", toDisplay(properties.facility_opening_hours)],
    ["トイレ利用時間", toDisplay(properties.toilet_opening_hours || properties.opening_hours)],
    ["トイレの存在", toDisplay(properties.toilet_exists)],
    ["一般利用条件", toDisplay(properties.access)],
    ["利用料金", toDisplay(properties.fee)],
    ["車いす対応", getWheelchairLabel(wheelchairStatus)],
    ["おむつ交換台", toDisplay(properties.changing_table)],
    ["オストメイト設備", toDisplay(properties.ostomy)],
    ["排水方式", toDisplay(properties["toilets:disposal"])],
    ["緯度", toDisplay(Number(coordinates[1]).toFixed(6))],
    ["経度", toDisplay(Number(coordinates[0]).toFixed(6))],
    ["最終確認日", toDisplay(properties.verification_date)],
    ["確認状態", toDisplay(properties.verification_status)],
    ["情報源", toDisplay(properties.source_name)],
    ["情報源ライセンス", toDisplay(properties.source_license)],
    ["座標の情報源", toDisplay(properties.coordinate_source)],
    ["データライセンス", toDisplay(properties.data_license)],
    ["CC0収録可否", toDisplay(properties.cc0_eligible)],
    ["現地確認", toDisplay(properties.field_surveyed)],
    ["重複可能性", toDisplay(properties.duplicate_note)]
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

  if (status === "reference") {
    const tagDetails = document.createElement("details");
    const summary = document.createElement("summary");
    const tagTable = document.createElement("table");
    summary.textContent = "その他GeoJSON内のOSMタグ";
    tagTable.className = "popup-table";
    Object.entries(osmTags)
      .filter(([key]) => !["@id", "name", "amenity", "access", "fee", "wheelchair", "opening_hours", "changing_table"].includes(key))
      .forEach(([key, value]) => {
        const tr = document.createElement("tr");
        const th = document.createElement("th");
        const td = document.createElement("td");
        th.textContent = key;
        td.textContent = toDisplay(value);
        tr.append(th, td);
        tagTable.append(tr);
      });
    tagDetails.append(summary, tagTable);
    wrapper.append(tagDetails);

    const actionGroup = document.createElement("div");
    actionGroup.className = "popup-action-group";

    const osmChoice = document.createElement("section");
    osmChoice.className = "popup-choice osm-choice";
    const osmDescription = document.createElement("p");
    osmDescription.textContent = "OpenStreetMap上の名称、位置、設備タグなどを編集します。変更の保存にはOpenStreetMapアカウントが必要です。";
    const osmEditLink = document.createElement("a");
    osmEditLink.className = "osm-action-button popup-action";
    osmEditLink.href = buildOsmEditUrl(osmId, coordinates[1], coordinates[0]);
    osmEditLink.target = "_blank";
    osmEditLink.rel = "noopener noreferrer";
    osmEditLink.textContent = "↗ OpenStreetMapで編集する";
    const osmAccountNote = document.createElement("small");
    osmAccountNote.textContent = "OSMアカウントが必要・編集内容はODbLで共有";
    osmChoice.append(osmDescription, osmEditLink, osmAccountNote);

    const atlasChoice = document.createElement("section");
    atlasChoice.className = "popup-choice atlas-choice";
    const atlasDescription = document.createElement("p");
    atlasDescription.textContent = "現地調査や施設への問い合わせで確認した情報をYOKOZE Atlasへ提供します。";
    const provideButton = document.createElement("button");
    provideButton.type = "button";
    provideButton.className = "primary-button popup-action";
    provideButton.textContent = "✎ 確認した情報を提供する";
    provideButton.addEventListener("click", () => {
      openEditSubmission(feature);
    });
    const atlasLoginNote = document.createElement("small");
    atlasLoginNote.textContent = "情報提供用の下書き作成はログイン不要・確認後に反映";
    atlasChoice.append(atlasDescription, provideButton, atlasLoginNote);

    actionGroup.append(osmChoice, atlasChoice);
    wrapper.append(actionGroup);
  }

  if (properties.source_url) {
    const link = document.createElement("a");
    link.href = properties.source_url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
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

function clearDraftMarker() {
  if (draftMarker) draftMarker.remove();
  draftMarker = null;
}

function clearOsmReferenceContext() {
  $("#osm-id").value = "";
  $("#osm-name").value = "";
  $("#osm-latitude").value = "";
  $("#osm-longitude").value = "";
  $("#osm-attributes").value = "";
  $("#reference-verification-status").value = "";
  $("#osm-context-id").textContent = "未確認";
  $("#osm-context-name").textContent = "未確認";
  $("#osm-context-coordinates").textContent = "未確認";
  $("#osm-context-access").textContent = "未確認";
  $("#osm-context-fee").textContent = "未確認";
  $("#osm-context-wheelchair").textContent = "未確認";
  $("#osm-context-opening-hours").textContent = "未確認";
  $("#osm-context-changing-table").textContent = "未確認";
  $("#osm-context-tags").textContent = "未確認";
  $("#osm-reference-context").hidden = true;
}

function setSubmissionMode(type) {
  const isExisting = type === "edit_existing";
  $("#submission-type").value = isExisting ? "edit_existing" : "new";
  $("#submission-type-label").textContent = isExisting ? "既存OSM地点の確認情報" : "新しいトイレ情報";
  $("#form-title").textContent = isExisting ? "確認した情報を提供する" : "新しいトイレ情報を提供する";
  $("#new-destination-options").hidden = isExisting;
}

function resetSubmissionContext() {
  $("#toilet-form").reset();
  clearDraftMarker();
  clearOsmReferenceContext();
  setSubmissionMode("new");
  $("#position-help").textContent = "地図上で確認した位置を選びます。仮マーカーはドラッグで移動できます。";
  $("#form-error").hidden = true;
  $("#submission-status").hidden = true;
  updateNewOsmEditLink();
}

function openEditSubmission(feature) {
  const properties = feature.properties || {};
  const originalTags = getOsmOriginalTags(properties);
  const coordinates = feature.geometry?.coordinates || [properties.longitude, properties.latitude];
  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  const osmId = safeText(originalTags["@id"] || properties.osm_id || properties["@id"] || feature.id, 120);
  const osmTags = JSON.stringify(originalTags, null, 2);
  const excludedKeys = new Set(["@id", "name", "amenity", "access", "fee", "wheelchair", "opening_hours", "changing_table"]);
  const otherTags = Object.fromEntries(Object.entries(originalTags).filter(([key]) => !excludedKeys.has(key)));

  $("#toilet-form").reset();
  clearDraftMarker();
  clearOsmReferenceContext();
  setSubmissionMode("edit_existing");
  $("#osm-id").value = osmId;
  $("#osm-name").value = safeText(originalTags.name, 120);
  $("#osm-latitude").value = Number.isFinite(lat) ? lat.toFixed(6) : "";
  $("#osm-longitude").value = Number.isFinite(lng) ? lng.toFixed(6) : "";
  $("#osm-attributes").value = osmTags.slice(0, 4000);
  $("#reference-verification-status").value = "reference";
  $("#osm-context-id").textContent = osmId || "未確認";
  $("#osm-context-name").textContent = safeText(originalTags.name, 120) || "未確認";
  $("#osm-context-coordinates").textContent = Number.isFinite(lat) && Number.isFinite(lng)
    ? `緯度 ${lat.toFixed(6)} / 経度 ${lng.toFixed(6)}`
    : "未確認";
  $("#osm-context-access").textContent = toDisplay(originalTags.access);
  $("#osm-context-fee").textContent = toDisplay(originalTags.fee);
  $("#osm-context-wheelchair").textContent = toDisplay(originalTags.wheelchair);
  $("#osm-context-opening-hours").textContent = toDisplay(originalTags.opening_hours);
  $("#osm-context-changing-table").textContent = toDisplay(originalTags.changing_table);
  $("#osm-context-tags").textContent = Object.keys(otherTags).length
    ? JSON.stringify(otherTags, null, 2).slice(0, 1200)
    : "その他のタグはありません";
  $("#osm-reference-context").hidden = false;

  $("#facility-name").value = "";
  $("#category").value = "";
  $("#latitude").value = "";
  $("#longitude").value = "";
  $("#position-help").textContent = "OSM座標は上の参考欄にのみ表示しています。地図で確認した位置を選んでください。";
  $("#form-error").hidden = true;
  $("#submission-status").hidden = true;
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    map.easeTo({ center: [lng, lat], duration: 300 });
  }
  openDialog($("#submission-dialog"));
}

function getSubmissionDestination() {
  return document.querySelector('input[name="submissionDestination"]:checked')?.value || "atlas";
}

function updateNewOsmEditLink() {
  const isNew = $("#submission-type").value === "new";
  const wantsOsm = getSubmissionDestination() === "atlas_and_osm";
  const panel = $("#new-osm-link-panel");
  const link = $("#new-osm-edit-link");
  const status = $("#new-osm-link-status");
  panel.hidden = !isNew || !wantsOsm;
  if (panel.hidden) return;

  const lat = parseCoordinateInput($("#latitude").value);
  const lng = parseCoordinateInput($("#longitude").value);
  const hasPosition = Number.isFinite(lat) && Number.isFinite(lng);
  link.hidden = !hasPosition;
  status.hidden = hasPosition;
  if (hasPosition) {
    link.href = buildOsmEditUrl("", lat, lng);
  } else {
    link.removeAttribute("href");
    status.textContent = "先に地図で追加地点を選んでください。";
  }
}

function setDraftPosition(lng, lat, moveMap = false) {
  const numericLng = Number(lng);
  const numericLat = Number(lat);
  if (!Number.isFinite(numericLng) || !Number.isFinite(numericLat)) return;
  const fixedLng = numericLng.toFixed(6);
  const fixedLat = numericLat.toFixed(6);
  $("#longitude").value = fixedLng;
  $("#latitude").value = fixedLat;

  const lngLat = [Number(fixedLng), Number(fixedLat)];
  if (!draftMarker) {
    draftMarker = new maplibregl.Marker({ color: "#3478C0", draggable: true })
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
  updateNewOsmEditLink();
  if (moveMap) map.easeTo({ center: lngLat, duration: 300 });
}

function updatePositionWarning() {
  const lat = parseCoordinateInput($("#latitude").value);
  const lng = parseCoordinateInput($("#longitude").value);
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
    submissionType: $("#submission-type").value || "new",
    submissionDestination: $("#submission-type").value === "new" ? getSubmissionDestination() : "atlas",
    osmId: safeText($("#osm-id").value, 120),
    osmName: safeText($("#osm-name").value, 120),
    osmLatitude: $("#osm-latitude").value ? Number($("#osm-latitude").value) : null,
    osmLongitude: $("#osm-longitude").value ? Number($("#osm-longitude").value) : null,
    osmAttributes: safeText($("#osm-attributes").value, 4000),
    referenceVerificationStatus: $("#reference-verification-status").value || null,
    facilityName: safeText($("#facility-name").value, 80),
    category: $("#category").value,
    latitude: parseCoordinateInput($("#latitude").value),
    longitude: parseCoordinateInput($("#longitude").value),
    toiletExists: $("#toilet-exists").value || "unknown",
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
  if (!Number.isFinite(data.latitude) || !Number.isFinite(data.longitude)) {
    messages.push("地図上の位置を指定してください。");
  } else if (data.latitude < -90 || data.latitude > 90 || data.longitude < -180 || data.longitude > 180) {
    messages.push("緯度・経度の値を確認してください。");
  }
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
  const typeLabel = data.submissionType === "edit_existing" ? "既存OSM地点の確認情報提供" : "新しいトイレ情報の提供";
  const osmBlock = data.submissionType === "edit_existing" ? `
## OSM参考元情報

- OSM ID: ${markdownValue(data.osmId)}
- OSM上の名称: ${markdownValue(data.osmName)}
- OSM上の緯度: ${Number.isFinite(data.osmLatitude) ? data.osmLatitude.toFixed(6) : "unknown"}
- OSM上の経度: ${Number.isFinite(data.osmLongitude) ? data.osmLongitude.toFixed(6) : "unknown"}
- 参照時の確認状態: ${markdownValue(data.referenceVerificationStatus)}
- OSM属性:

\`\`\`json
${markdownValue(data.osmAttributes, "{}")}
\`\`\`

` : "";

  return `## 基本情報

- 投稿種別: ${typeLabel}
- 希望する更新経路: ${toDisplay(data.submissionDestination)}
- 施設名: ${markdownValue(data.facilityName)}
- 施設種別: ${markdownValue(data.category)}
- 投稿者が確認した緯度: ${data.latitude.toFixed(6)}
- 投稿者が確認した経度: ${data.longitude.toFixed(6)}

${osmBlock}## 利用条件

- トイレの存在: ${markdownValue(data.toiletExists)}
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
- 既存地点の確認・修正の場合、OSM座標と投稿者確認座標を分けて確認する
- Google Maps等からの転用がないか確認する`;
}

function buildSubmissionTitle(data) {
  const titlePrefix = data.submissionType === "edit_existing" ? "トイレ情報確認・修正" : "トイレ情報投稿";
  return `横瀬町${titlePrefix}: ${data.facilityName}`;
}

function buildSubmissionText(data) {
  return `${buildSubmissionTitle(data)}

${buildIssueBody(data)}`;
}

function buildIssueUrl(data) {
  const params = new URLSearchParams({
    title: buildSubmissionTitle(data),
    body: buildIssueBody(data),
    labels: "data"
  });
  return `${ISSUE_URL}?${params.toString()}`;
}

function buildMailtoUrl(data) {
  const params = new URLSearchParams({
    subject: buildSubmissionTitle(data),
    body: `${buildSubmissionText(data)}

---
送信前に、宛先が横瀬町トイレアクセスマップの管理者・担当者になっているか確認してください。`
  });
  return `mailto:${encodeURIComponent(SUBMISSION_EMAIL)}?${params.toString()}`;
}

function getSubmissionSlug(data) {
  return data.facilityName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 36) || "submitted-toilet";
}

function buildDraftFeature(data) {
  const slug = getSubmissionSlug(data);
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
      toilet_exists: data.toiletExists,
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
      submission_type: data.submissionType,
      submission_destination: data.submissionDestination,
      source_osm_id: data.osmId || null,
      source_osm_name: data.osmName || null,
      source_osm_longitude: Number.isFinite(data.osmLongitude) ? Number(data.osmLongitude.toFixed(6)) : null,
      source_osm_latitude: Number.isFinite(data.osmLatitude) ? Number(data.osmLatitude.toFixed(6)) : null,
      verification_method: data.verificationMethod,
      verification_date: data.verificationDate,
      source_name: data.sourceName,
      source_url: null,
      source_license: "user_submission",
      coordinate_source: "user_submission",
      data_license: "pending verification; not published as CC0",
      cc0_eligible: false,
      cc0_publication_consent: true,
      notes: data.notes
    }
  };
}

function buildDraftSvg(data) {
  const name = xmlEscape(data.facilityName);
  const status = "submitted";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="140" viewBox="0 0 360 140" role="img" aria-label="${name} 投稿下書き">
  <rect width="360" height="140" rx="8" fill="#ffffff"/>
  <circle cx="48" cy="48" r="20" fill="#3478c0"/>
  <text x="48" y="55" text-anchor="middle" font-size="24" font-family="sans-serif" fill="#ffffff">T</text>
  <text x="82" y="42" font-size="18" font-family="sans-serif" font-weight="700" fill="#17201b">${name}</text>
  <text x="82" y="70" font-size="13" font-family="sans-serif" fill="#546159">status: ${status}</text>
  <text x="82" y="94" font-size="13" font-family="sans-serif" fill="#546159">lat: ${data.latitude.toFixed(6)}, lng: ${data.longitude.toFixed(6)}</text>
  <text x="82" y="116" font-size="12" font-family="sans-serif" fill="#b64242">未確認投稿。管理者確認前は正式データではありません。</text>
</svg>`;
}

async function copyDraft() {
  const text = $("#draft-output").value;
  if (!text) return;
  await navigator.clipboard.writeText(text);
  showSubmissionStatus("内容をコピーしました。メール、チャット、フォームなどに貼り付けて送れます。");
}

function downloadTextFile(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function showSubmissionStatus(message, isError = false) {
  const status = $("#submission-status");
  status.textContent = message;
  status.hidden = false;
  status.classList.toggle("error-message", isError);
}

async function copyTextToClipboard(text) {
  await navigator.clipboard.writeText(text);
}

async function shareOrCopySubmission(data) {
  const title = buildSubmissionTitle(data);
  const text = buildSubmissionText(data);
  $("#draft-output").value = text;

  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      showSubmissionStatus("共有メニューを開きました。送信先を選んで投稿してください。");
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
      console.warn(error);
    }
  }

  try {
    await copyTextToClipboard(text);
    showSubmissionStatus("投稿文をコピーしました。メール、チャット、フォームなどに貼り付けて送れます。");
  } catch (error) {
    showSubmissionStatus("投稿文を下書き欄に生成しました。内容を選択してコピーしてください。", true);
  }
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
    importedGeoJsonData = featureCollection;
    addPointLayer("imported-toilets", featureCollection, "取込", "layer-imported-geojson");
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
    features: pointFeatures.map((feature, index) => withWheelchairAccessibilityProperties({
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

function restoreImportedGeoJson() {
  if (!importedGeoJsonData?.features?.length) return;
  addPointLayer("imported-toilets", importedGeoJsonData, "取込", "layer-imported-geojson");
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
    importedSvgMarkerElement = markerElement;
    const markerImg = document.createElement("img");
    markerImg.alt = "";
    markerImg.src = importedSvgUrl;
    markerElement.append(markerImg);

    if (importedSvgMarker) importedSvgMarker.remove();
    importedSvgMarker = new maplibregl.Marker({ element: markerElement, draggable: true })
      .setLngLat(lngLat)
      .addTo(map);
    setImportedSvgVisibility(getLayerCheckboxState("layer-imported-svg"));
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

function setImportedSvgVisibility(visible) {
  if (importedSvgMarkerElement) {
    importedSvgMarkerElement.hidden = !visible;
  }
}

function clearImports() {
  ["imported-toilets-circle", "imported-toilets-label"].forEach((id) => {
    if (map.getLayer(id)) map.removeLayer(id);
  });
  if (map.getSource("imported-toilets")) map.removeSource("imported-toilets");
  if (importedSvgMarker) importedSvgMarker.remove();
  importedSvgMarker = null;
  importedSvgMarkerElement = null;
  if (importedSvgUrl) URL.revokeObjectURL(importedSvgUrl);
  importedSvgUrl = null;
  importedGeoJsonData = null;
  $("#svg-preview").replaceChildren();
  $("#geojson-import").value = "";
  $("#svg-import").value = "";
  $("#import-status").textContent = "プレビューを消去しました。";
}

function bindUi() {
  $("#open-form").addEventListener("click", () => {
    resetSubmissionContext();
    openDialog($("#submission-dialog"));
  });
  $("#open-import").addEventListener("click", () => openDialog($("#import-dialog")));
  $("#basemap-select").addEventListener("change", (event) => {
    switchBasemap(event.target.value);
  });
  $("#wheelchair-filter").addEventListener("change", (event) => {
    setWheelchairFilter(event.target.value);
  });
  document.querySelectorAll('input[name="submissionDestination"]').forEach((radio) => {
    radio.addEventListener("change", updateNewOsmEditLink);
  });
  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => closeDialog(button));
  });

  $("#fit-yokoze").addEventListener("click", () => {
    map.easeTo(YOKOZE_VIEW);
  });

  $("#layer-osm-reference").addEventListener("change", (event) => {
    setLayerGroupVisibility("reference-toilets", event.target.checked);
  });

  $("#layer-verified").addEventListener("change", (event) => {
    setLayerGroupVisibility("verified-toilets", event.target.checked);
  });

  $("#layer-imported-geojson").addEventListener("change", (event) => {
    setLayerGroupVisibility("imported-toilets", event.target.checked);
  });

  $("#layer-imported-svg").addEventListener("change", (event) => {
    setImportedSvgVisibility(event.target.checked);
  });

  $("#pick-position").addEventListener("click", () => {
    pickingPosition = true;
    $("#position-help").textContent = "地図上のトイレ位置をクリックしてください。";
    $("#submission-dialog").close();
  });

  ["#latitude", "#longitude"].forEach((selector) => {
    $(selector).addEventListener("change", () => {
      const lat = parseCoordinateInput($("#latitude").value);
      const lng = parseCoordinateInput($("#longitude").value);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setDraftPosition(lng, lat, true);
      } else {
        updatePositionWarning();
        updateNewOsmEditLink();
      }
    });
  });

  $("#toilet-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = validateSubmission();
    if (!data) return;
    shareOrCopySubmission(data);
  });

  $("#email-submission").addEventListener("click", () => {
    const data = validateSubmission();
    if (!data) return;
    $("#draft-output").value = buildSubmissionText(data);
    window.location.href = buildMailtoUrl(data);
    showSubmissionStatus("メールアプリを開きました。送信前に宛先を確認してください。");
  });

  $("#open-github-issue").addEventListener("click", () => {
    const data = validateSubmission();
    if (!data) return;
    window.open(buildIssueUrl(data), "_blank", "noopener");
  });

  $("#make-submission-text").addEventListener("click", () => {
    const data = validateSubmission();
    if (!data) return;
    $("#draft-output").value = buildSubmissionText(data);
    showSubmissionStatus("投稿文を生成しました。共有・コピー・メール送信に使えます。");
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

  $("#download-draft-geojson").addEventListener("click", () => {
    const data = validateSubmission();
    if (!data) return;
    const text = JSON.stringify(buildDraftFeature(data), null, 2);
    $("#draft-output").value = text;
    downloadTextFile(`${getSubmissionSlug(data)}.geojson`, text, "application/geo+json");
    showSubmissionStatus("GeoJSON下書きを保存しました。別の地図や管理フローへ引き継げます。");
  });

  $("#download-draft-svg").addEventListener("click", () => {
    const data = validateSubmission();
    if (!data) return;
    const text = buildDraftSvg(data);
    $("#draft-output").value = text;
    downloadTextFile(`${getSubmissionSlug(data)}.svg`, text, "image/svg+xml");
    showSubmissionStatus("SVG下書きを保存しました。確認資料として使えます。");
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
