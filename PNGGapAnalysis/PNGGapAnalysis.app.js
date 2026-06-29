const APP_VERSION = "20260629-keep-null-genus";

const state = {
  summary: null,
  map: null,
  layers: {},
  climateCache: new Map(),
  changeCache: new Map(),
  changeLayers: null,
  suggestedLayers: null,
  gapRows: [],
  cropRows: [],
  siteRows: [],
  rawSiteRows: [],
  siteGrid: null,
  changeGrids: null,
};

const fmt = new Intl.NumberFormat("en-US");
const bounds = [[-12, 140], [0, 160]];
const SUGGESTED_LAYER_KEYS = ["gbif_genesys_gap", "temp_genesys_gap", "rain_extreme_genesys_gap"];
const SUGGESTED_LAYER_STYLES = {
  gbif_genesys_gap: {
    legend: "GBIF-rich, Genesys-poor",
    border: "#9b3b2f",
    stops: [[255, 244, 214], [239, 146, 63], [171, 43, 30]],
  },
  temp_genesys_gap: {
    legend: "High warming, Genesys-poor",
    border: "#8e1f49",
    stops: [[255, 235, 238], [224, 96, 121], [128, 28, 67]],
  },
  rain_extreme_genesys_gap: {
    legend: "Extreme rainfall change, Genesys-poor",
    border: "#145c72",
    stops: [[226, 246, 244], [74, 163, 177], [19, 89, 122]],
  },
  weighted_collection_priority: {
    legend: "Weighted final recommendation",
    border: "#3f5f20",
    stops: [[244, 250, 217], [171, 202, 76], [64, 111, 36]],
  },
};

function valueColor(value, max, rgb) {
  const t = Math.max(0.08, Math.min(0.88, Math.log1p(value) / Math.log1p(max || 1)));
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${t})`;
}

function pct(values, p) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

function formatLegendValue(value, unit) {
  if (!Number.isFinite(value)) return "-";
  if (unit === "mm/year") return `${Math.round(value)} mm/year`;
  if (unit === "deg C") return `${value.toFixed(1)} deg C`;
  return `${Math.round(value * 10) / 10} ${unit}`;
}

function colorRamp(t, stops) {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  return stops[i].map((v, c) => Math.round(v * (1 - f) + stops[i + 1][c] * f));
}

async function fetchJson(path) {
  const separator = path.includes("?") ? "&" : "?";
  const res = await fetch(`${path}${separator}v=${APP_VERSION}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

function clearCheckedInputs() {
  document.querySelectorAll('input[type="checkbox"]').forEach(input => {
    input.checked = false;
  });
}

function setKpis(summary) {
  document.getElementById("gbifRows").textContent = fmt.format(summary.gbif.bbox_coord_rows);
  document.getElementById("gbifSpecies").textContent = fmt.format(summary.gbif.species);
  document.getElementById("genesysRows").textContent = fmt.format(summary.genesys.rows);
  document.getElementById("genesysCoords").textContent = fmt.format(summary.genesys.bbox_coord_rows);
  document.getElementById("freshness").textContent = `${summary.climate.model} ${summary.climate.ssp.toUpperCase()} ${summary.climate.period}; ${summary.grid_degrees} degree hotspot grid`;
}

function initMap() {
  state.map = L.map("map", {
    zoomControl: true,
    preferCanvas: true,
    maxBounds: [[-16, 136], [3, 164]],
  }).fitBounds(bounds, { padding: [24, 24] });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 12,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(state.map);
}

function makeGridLayer(geojson, mode) {
  const max = Math.max(...geojson.features.map(f => f.properties.records));
  const rgb = mode === "gbif" ? [216, 93, 63] : [34, 107, 140];
  return L.geoJSON(geojson, {
    style: feature => ({
      color: mode === "gbif" ? "#9b3b2f" : "#1c5874",
      weight: 0.55,
      opacity: 0.42,
      fillColor: valueColor(feature.properties.records, max, rgb),
      fillOpacity: 0.82,
    }),
    onEachFeature: (feature, layer) => {
      const p = feature.properties;
      const label = mode === "gbif" ? "GBIF records" : "Genesys accessions";
      const richness = mode === "gbif"
        ? `${fmt.format(p.species)} species, ${fmt.format(p.genera)} genera`
        : `${fmt.format(p.taxa)} taxa, ${fmt.format(p.institutes)} institutes`;
      layer.bindPopup(`<strong>${label}</strong><br>${fmt.format(p.records)} records<br>${richness}`);
    },
  });
}

function makePointLayer(points) {
  return L.layerGroup(points.map(point => {
    const marker = L.circleMarker([point.lat, point.lon], {
      radius: 4,
      color: "#174d69",
      weight: 1,
      fillColor: "#2f8db3",
      fillOpacity: 0.82,
    });
    const link = point.url ? `<br><a href="${point.url}" target="_blank" rel="noreferrer">Genesys record</a>` : "";
    marker.bindPopup(`<strong>${point.taxon || "Accession"}</strong><br>${point.accenumb || ""}<br>${point.instcode || ""}${link}`);
    return marker;
  }));
}

function makeRecommendedSiteLayer(geojson) {
  const max = Math.max(...geojson.features.map(f => f.properties.priority_score || 0), 1);
  return L.geoJSON(geojson, {
    style: feature => {
      const p = feature.properties;
      const intensity = Math.max(0.16, Math.min(0.72, (p.priority_score || 0) / max));
      return {
        color: "#4e327e",
        weight: 1.1,
        opacity: 0.64,
        fillColor: `rgba(111, 74, 165, ${intensity})`,
        fillOpacity: 0.48,
        dashArray: p.genesys_accessions === 0 ? "" : "4 3",
      };
    },
    onEachFeature: (feature, layer) => {
      const p = feature.properties;
      const genera = (p.top_genera || []).map(row => `${row[0]} (${fmt.format(row[1])})`).join(", ");
      const speciesLimit = Number(document.getElementById("speciesLimit")?.value || 6);
      const species = (p.top_species || []).slice(0, speciesLimit).map(row => `${row[0]} (${fmt.format(row[1])})`).join(", ");
      const risk = state.changeGrids ? climateChangeForPoint(p.center[0], p.center[1]) : null;
      const riskLine = risk
        ? `<br>Rainfall change: ${Math.round(risk.precip)} mm/year<br>Mean temp change: ${risk.temp.toFixed(1)} deg C`
        : "";
      layer.bindPopup(`
        <strong>Vegetable collection priority site</strong><br>
        Center: ${p.center[0]}, ${p.center[1]}<br>
        Vegetable GBIF: ${fmt.format(p.gbif_records)} records, ${fmt.format(p.gbif_species)} species<br>
        Vegetable Genesys in same grid: ${fmt.format(p.genesys_accessions)} accessions<br>
        Vegetable genera: ${genera || "not available"}<br>
        Vegetable hotspot species: ${species || "not available"}${riskLine}
      `);
    },
  });
}

function suggestedOpacity() {
  return Number(document.getElementById("suggestedSiteOpacity")?.value || 0.68);
}

function featureKey(feature) {
  const p = feature.properties || {};
  return `${p.center_lat},${p.center_lon}`;
}

function suggestedLayerColor(layerKey, t) {
  const style = SUGGESTED_LAYER_STYLES[layerKey] || SUGGESTED_LAYER_STYLES.gbif_genesys_gap;
  const rgb = colorRamp(t, style.stops);
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function makeSuggestedSiteLayer(layerDef, layerKey) {
  const features = layerDef.geojson.features;
  const max = Math.max(...features.map(f => f.properties.score || 0), 1);
  const styleDef = SUGGESTED_LAYER_STYLES[layerKey] || SUGGESTED_LAYER_STYLES.gbif_genesys_gap;
  return L.geoJSON(layerDef.geojson, {
    style: feature => {
      const p = feature.properties;
      const t = Math.max(0.08, Math.min(1, (p.score || 0) / max));
      return {
        color: styleDef.border,
        weight: 0.9,
        opacity: 0.72,
        fillColor: suggestedLayerColor(layerKey, t),
        fillOpacity: suggestedOpacity(),
      };
    },
    onEachFeature: (feature, layer) => {
      const p = feature.properties;
      const species = (p.top_species || []).slice(0, 6).map(row => `${row[0]} (${fmt.format(row[1])})`).join(", ");
      const temp = Number.isFinite(p.temp_change) ? `${p.temp_change.toFixed(2)} deg C` : "not available";
      const rain = Number.isFinite(p.precip_change) ? `${Math.round(p.precip_change)} mm/year` : "not available";
      layer.bindPopup(`
        <strong>${layerDef.label}</strong><br>
        Center: ${p.center_lat}, ${p.center_lon}<br>
        Score: ${(p.score || 0).toFixed(3)}<br>
        Vegetable GBIF: ${fmt.format(p.gbif_records)} records, ${fmt.format(p.gbif_species)} species<br>
        Vegetable Genesys in same grid: ${fmt.format(p.genesys_accessions)} accessions<br>
        Temperature change: ${temp}<br>
        Rainfall change: ${rain}<br>
        Hotspot species: ${species || "not available"}
      `);
    },
  });
}

function getSuggestedWeights() {
  return {
    gbif_genesys_gap: Number(document.querySelector('[data-weight-key="gbif_genesys_gap"]')?.value || 0),
    temp_genesys_gap: Number(document.querySelector('[data-weight-key="temp_genesys_gap"]')?.value || 0),
    rain_extreme_genesys_gap: Number(document.querySelector('[data-weight-key="rain_extreme_genesys_gap"]')?.value || 0),
  };
}

function updateWeightLabels() {
  const weights = getSuggestedWeights();
  const labels = {
    gbif_genesys_gap: "weightGbif",
    temp_genesys_gap: "weightTemp",
    rain_extreme_genesys_gap: "weightRain",
  };
  Object.entries(labels).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = weights[key].toFixed(2);
  });
}

function buildWeightedSuggestedLayerDef() {
  const layers = state.suggestedLayers?.layers || {};
  const base = layers.gbif_genesys_gap?.geojson?.features || [];
  const weights = getSuggestedWeights();
  const totalWeight = Object.values(weights).reduce((sum, value) => sum + Math.max(0, value), 0);
  const scoreMaps = {};
  for (const key of SUGGESTED_LAYER_KEYS) {
    scoreMaps[key] = new Map((layers[key]?.geojson?.features || []).map(feature => [featureKey(feature), feature.properties.score || 0]));
  }
  return {
    label: "Weighted vegetable collection priority",
    description: totalWeight
      ? `Weighted score: GBIF gap ${weights.gbif_genesys_gap.toFixed(2)}, temperature ${weights.temp_genesys_gap.toFixed(2)}, rainfall ${weights.rain_extreme_genesys_gap.toFixed(2)}.`
      : "Weighted score is zero because all weights are set to 0.",
    geojson: {
      type: "FeatureCollection",
      features: base.map(feature => {
        const key = featureKey(feature);
        const componentScores = {
          gbif_gap_score: scoreMaps.gbif_genesys_gap.get(key) || 0,
          temperature_score: scoreMaps.temp_genesys_gap.get(key) || 0,
          rainfall_score: scoreMaps.rain_extreme_genesys_gap.get(key) || 0,
        };
        const score = totalWeight
          ? (
            componentScores.gbif_gap_score * Math.max(0, weights.gbif_genesys_gap) +
            componentScores.temperature_score * Math.max(0, weights.temp_genesys_gap) +
            componentScores.rainfall_score * Math.max(0, weights.rain_extreme_genesys_gap)
          ) / totalWeight
          : 0;
        return {
          ...feature,
          properties: {
            ...feature.properties,
            ...componentScores,
            score,
            layer: "weighted_collection_priority",
          },
        };
      }),
    },
  };
}

function makeWeightedSuggestedLayer(layerDef) {
  const features = layerDef.geojson.features;
  const max = Math.max(...features.map(f => f.properties.score || 0), 1);
  const styleDef = SUGGESTED_LAYER_STYLES.weighted_collection_priority;
  return L.geoJSON(layerDef.geojson, {
    style: feature => {
      const p = feature.properties;
      const t = Math.max(0.08, Math.min(1, (p.score || 0) / max));
      return {
        color: styleDef.border,
        weight: 1.15,
        opacity: 0.78,
        fillColor: suggestedLayerColor("weighted_collection_priority", t),
        fillOpacity: suggestedOpacity(),
      };
    },
    onEachFeature: (feature, layer) => {
      const p = feature.properties;
      const species = (p.top_species || []).slice(0, 6).map(row => `${row[0]} (${fmt.format(row[1])})`).join(", ");
      layer.bindPopup(`
        <strong>Weighted vegetable collection priority</strong><br>
        Center: ${p.center_lat}, ${p.center_lon}<br>
        Combined score: ${(p.score || 0).toFixed(3)}<br>
        GBIF gap score: ${(p.gbif_gap_score || 0).toFixed(3)}<br>
        Temperature score: ${(p.temperature_score || 0).toFixed(3)}<br>
        Rainfall score: ${(p.rainfall_score || 0).toFixed(3)}<br>
        Vegetable GBIF: ${fmt.format(p.gbif_records)} records, ${fmt.format(p.gbif_species)} species<br>
        Vegetable Genesys in same grid: ${fmt.format(p.genesys_accessions)} accessions<br>
        Hotspot species: ${species || "not available"}
      `);
    },
  });
}

function selectedSuggestedLayerKeys() {
  return Array.from(document.querySelectorAll(".suggestedLayerToggle"))
    .filter(input => input.checked)
    .map(input => input.dataset.layerKey)
    .filter(key => SUGGESTED_LAYER_KEYS.includes(key));
}

function renderSuggestedSiteLayers() {
  if (state.layers.suggestedSiteComponents) {
    Object.values(state.layers.suggestedSiteComponents).forEach(layer => {
      if (state.map.hasLayer(layer)) state.map.removeLayer(layer);
    });
  }
  if (state.layers.suggestedComposite && state.map.hasLayer(state.layers.suggestedComposite)) {
    state.map.removeLayer(state.layers.suggestedComposite);
  }
  state.layers.suggestedSiteComponents = {};
  state.layers.suggestedComposite = null;
  const status = document.getElementById("suggestedSiteStatus");
  const layers = state.suggestedLayers?.layers || {};
  if (!Object.keys(layers).length) {
    if (status) status.textContent = "Suggested-site layer is not available.";
    return;
  }

  const selectedKeys = selectedSuggestedLayerKeys();
  selectedKeys.forEach(key => {
    const layerDef = layers[key];
    if (!layerDef) return;
    const layer = makeSuggestedSiteLayer(layerDef, key).addTo(state.map);
    layer.bringToFront();
    state.layers.suggestedSiteComponents[key] = layer;
  });

  const showComposite = document.getElementById("toggleSuggestedComposite")?.checked;
  if (showComposite) {
    const weightedDef = buildWeightedSuggestedLayerDef();
    state.layers.suggestedComposite = makeWeightedSuggestedLayer(weightedDef).addTo(state.map);
    state.layers.suggestedComposite.bringToFront();
  }

  if (status) {
    const active = [
      ...selectedKeys.map(key => SUGGESTED_LAYER_STYLES[key].legend),
      ...(showComposite ? [SUGGESTED_LAYER_STYLES.weighted_collection_priority.legend] : []),
    ];
    status.textContent = active.length
      ? `Showing ${active.join("; ")}.`
      : "All suggested collection layers are hidden.";
  }
  updateLegend();
}

function makeClimateRiskLayer(rows) {
  const metric = document.getElementById("changeMetric")?.value || "precip";
  const hasClimateValues = state.changeGrids && rows.some(row => Number.isFinite(row.precip_change) || Number.isFinite(row.temp_change));
  const values = rows.map(row => {
    if (!hasClimateValues) return row.priority_score || row.gbif_records || 0;
    return metric === "temp" ? Math.abs(row.temp_change || 0) : Math.abs(row.precip_change || 0);
  });
  const max = Math.max(...values, 1);
  return L.geoJSON({
    type: "FeatureCollection",
    features: rows.map(row => ({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[
          [row.lon0, row.lat0],
          [row.lon0 + 0.25, row.lat0],
          [row.lon0 + 0.25, row.lat0 + 0.25],
          [row.lon0, row.lat0 + 0.25],
          [row.lon0, row.lat0],
        ]],
      },
      properties: row,
    })),
  }, {
    style: feature => {
      const p = feature.properties;
      const raw = hasClimateValues
        ? (metric === "temp" ? Math.abs(p.temp_change || 0) : Math.abs(p.precip_change || 0))
        : (p.priority_score || p.gbif_records || 0);
      const intensity = Math.max(0.18, Math.min(0.92, raw / max));
      return {
        color: "#8b2d1d",
        weight: 2,
        opacity: 0.92,
        fillColor: `rgba(222, 84, 45, ${intensity})`,
        fillOpacity: 0.72,
        dashArray: hasClimateValues ? "" : "5 3",
      };
    },
    onEachFeature: (feature, layer) => {
      const p = feature.properties;
      const speciesLimit = Number(document.getElementById("speciesLimit")?.value || 6);
      const species = (p.top_species || []).slice(0, speciesLimit).map(row => `${row[0]} (${fmt.format(row[1])})`).join(", ");
      const changeLine = !hasClimateValues
        ? "Climate change values are still loading"
        : metric === "temp"
        ? `Mean temperature change: ${p.temp_change?.toFixed(1)} deg C`
        : `Rainfall change: ${Math.round(p.precip_change || 0)} mm/year`;
      layer.bindPopup(`
        <strong>Climate risk collection site</strong><br>
        Center: ${p.center_lat}, ${p.center_lon}<br>
        ${changeLine}<br>
        Vegetable GBIF: ${fmt.format(p.gbif_records)} records, ${fmt.format(p.gbif_species)} species<br>
        Vegetable Genesys in same grid: ${fmt.format(p.genesys_accessions)} accessions<br>
        Hotspot species: ${species || "not available"}
      `);
    },
  });
}

function makeChangeOverlay(metric) {
  if (!state.changeGrids) return null;
  const source = metric === "temp" ? state.changeGrids.temp : state.changeGrids.precip;
  const unit = metric === "temp" ? "deg C" : "mm/year";
  const key = metric;
  if (state.changeCache.has(key)) return state.changeCache.get(key);
  const values = Array.from(source).filter(Number.isFinite);
  if (!values.length) return null;
  const abs95 = Math.max(Math.abs(pct(values, 5)), Math.abs(pct(values, 95)), 0.01);
  const canvas = document.createElement("canvas");
  canvas.width = state.changeGrids.width;
  canvas.height = state.changeGrids.height;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < source.length; i++) {
    const value = source[i];
    const offset = i * 4;
    if (!Number.isFinite(value)) {
      img.data[offset + 3] = 0;
      continue;
    }
    const magnitude = Math.min(1, Math.abs(value) / abs95);
    const rgb = value >= 0
      ? colorRamp(magnitude, [[255, 244, 214], [240, 129, 69], [154, 37, 30]])
      : colorRamp(magnitude, [[224, 242, 241], [77, 154, 191], [34, 79, 145]]);
    img.data[offset] = rgb[0];
    img.data[offset + 1] = rgb[1];
    img.data[offset + 2] = rgb[2];
    img.data[offset + 3] = Math.round(85 + magnitude * 150);
  }
  ctx.putImageData(img, 0, 0);
  const payload = {
    dataUrl: canvas.toDataURL("image/png"),
    range: [-abs95, abs95],
    unit,
  };
  state.changeCache.set(key, payload);
  return payload;
}

function renderClimateChangeHotspot() {
  if (state.layers.risk && state.map.hasLayer(state.layers.risk)) {
    state.map.removeLayer(state.layers.risk);
  }
  state.layers.risk = null;
  const status = document.getElementById("riskStatus");
  const metric = document.getElementById("changeMetric")?.value || "precip";
  if (!document.getElementById("toggleRisk")?.checked) {
    updateLegend();
    return;
  }
  if (state.changeLayers?.layers?.[metric]) {
    const layer = state.changeLayers.layers[metric];
    const opacity = Number(document.getElementById("riskOpacity")?.value || 0.72);
    const versionedImage = `${layer.image}?v=${APP_VERSION}-${encodeURIComponent((layer.range || []).join("_"))}`;
    state.layers.risk = L.imageOverlay(versionedImage, state.changeLayers.bounds, { opacity, interactive: false }).addTo(state.map);
    state.layers.risk.bringToFront();
    if (status) {
      const label = metric === "temp" ? "Annual mean temperature change" : "Annual rainfall change";
      status.textContent = `${label}; ${formatLegendValue(layer.range[0], layer.unit)} to ${formatLegendValue(layer.range[1], layer.unit)}`;
    }
    updateLegend();
    return;
  }
  if (!state.changeGrids) {
    if (status) status.textContent = "Loading future-minus-current climate raster...";
    updateLegend();
    return;
  }
  const overlay = makeChangeOverlay(metric);
  if (!overlay) {
    if (status) status.textContent = "Climate-change raster has no valid values.";
    updateLegend();
    return;
  }
  const opacity = Number(document.getElementById("riskOpacity")?.value || 0.72);
  state.layers.risk = L.imageOverlay(overlay.dataUrl, bounds, { opacity, interactive: false }).addTo(state.map);
  state.layers.risk.bringToFront();
  if (status) {
    const label = metric === "temp" ? "Annual mean temperature change" : "Annual rainfall change";
    status.textContent = `${label}; ${formatLegendValue(overlay.range[0], overlay.unit)} to ${formatLegendValue(overlay.range[1], overlay.unit)}`;
  }
  updateLegend();
}

function climateScoreForFeature(feature, metric) {
  if (!state.changeGrids) return feature.properties.priority_score || 0;
  const p = feature.properties;
  const risk = climateChangeForPoint(p.center[0], p.center[1]);
  if (!risk) return 0;
  return metric === "temp" ? Math.abs(risk.temp) : Math.abs(risk.precip);
}

function renderGapTable() {
  const q = document.getElementById("gapSearch").value.trim().toLowerCase();
  const rows = state.gapRows
    .filter(row => !q || row.genus.toLowerCase().includes(q))
    .slice(0, 42);
  const html = rows.map(row => `
    <tr data-status="${row.status}">
      <td title="${row.status}">${row.genus}</td>
      <td>${fmt.format(row.gbif_records)}</td>
      <td>${fmt.format(row.genesys_accessions)}</td>
    </tr>
  `).join("");
  document.getElementById("gapTable").innerHTML = html;
}

function renderCropTable() {
  const q = document.getElementById("cropSearch").value.trim().toLowerCase();
  const rows = state.cropRows
    .filter(row => !q || row.genus.toLowerCase().includes(q))
    .slice(0, 48);
  document.getElementById("cropTable").innerHTML = rows.map(row => `
    <tr data-status="${row.status}">
      <td title="${row.recommendation}; score ${row.priority_score}">${row.genus}</td>
      <td>${fmt.format(row.gbif_records)}</td>
      <td>${fmt.format(row.genesys_accessions)}</td>
    </tr>
  `).join("");
}

function weightedPriorityRows() {
  const speciesLimit = Number(document.getElementById("speciesLimit")?.value || 6);
  const weightedDef = state.suggestedLayers ? buildWeightedSuggestedLayerDef() : null;
  const features = weightedDef?.geojson?.features || [];
  return features
    .map(feature => {
      const p = feature.properties;
      return {
        rank: 0,
        center_lat: p.center_lat,
        center_lon: p.center_lon,
        score: p.score || 0,
        gbif_gap_score: p.gbif_gap_score || 0,
        temperature_score: p.temperature_score || 0,
        rainfall_score: p.rainfall_score || 0,
        gbif_records: p.gbif_records || 0,
        gbif_species: p.gbif_species || 0,
        genesys_accessions: p.genesys_accessions || 0,
        species: (p.top_species || []).slice(0, speciesLimit).map(item => item[0]),
        species_with_counts: (p.top_species || []).slice(0, speciesLimit).map(item => `${item[0]} (${fmt.format(item[1])})`),
      };
    })
    .sort((a, b) => b.score - a.score || b.gbif_records - a.gbif_records)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function renderSiteTable() {
  const rows = weightedPriorityRows();
  document.getElementById("siteTable").innerHTML = rows.map((row, index) => `
    <tr data-status="recommended" data-site-index="${index}">
      <td>${row.rank}</td>
      <td>${Number(row.center_lat).toFixed(3)}, ${Number(row.center_lon).toFixed(3)}</td>
      <td title="GBIF gap ${row.gbif_gap_score.toFixed(3)}; temperature ${row.temperature_score.toFixed(3)}; rainfall ${row.rainfall_score.toFixed(3)}">${row.score.toFixed(3)}</td>
      <td>${row.species.join(", ") || "-"}</td>
    </tr>
  `).join("");
  document.querySelectorAll("[data-site-index]").forEach(el => {
    el.addEventListener("click", () => {
      const row = rows[Number(el.dataset.siteIndex)];
      state.map.flyTo([row.center_lat, row.center_lon], 8, { duration: 0.6 });
    });
  });
}

function downloadSiteTable() {
  const rows = weightedPriorityRows().map(row => ({
    Rank: row.rank,
    Latitude: row.center_lat,
    Longitude: row.center_lon,
    "GPS location": `${Number(row.center_lat).toFixed(6)}, ${Number(row.center_lon).toFixed(6)}`,
    "Weighted priority score": Number(row.score.toFixed(6)),
    "GBIF gap score": Number(row.gbif_gap_score.toFixed(6)),
    "Temperature score": Number(row.temperature_score.toFixed(6)),
    "Rainfall score": Number(row.rainfall_score.toFixed(6)),
    "GBIF records": row.gbif_records,
    "GBIF species": row.gbif_species,
    "Genesys accessions": row.genesys_accessions,
    "Possible species": row.species.join("; "),
  }));
  if (window.XLSX) {
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Weighted priority sites");
    XLSX.writeFile(book, `weighted_vegetable_collection_sites_${APP_VERSION}.xlsx`);
    return;
  }
  const headers = Object.keys(rows[0] || {});
  const htmlRows = [
    `<tr>${headers.map(header => `<th>${header}</th>`).join("")}</tr>`,
    ...rows.map(row => `<tr>${headers.map(header => `<td>${String(row[header] ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")}</td>`).join("")}</tr>`),
  ].join("");
  const blob = new Blob([`<table>${htmlRows}</table>`], { type: "application/vnd.ms-excel;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `weighted_vegetable_collection_sites_${APP_VERSION}.xls`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function formatChange(row, metric) {
  if (!Number.isFinite(row.precip_change) || !Number.isFinite(row.temp_change)) {
    return "loading";
  }
  if (metric === "temp") return `${row.temp_change.toFixed(1)} C`;
  return `${Math.round(row.precip_change)} mm`;
}

function sortRiskSites() {
  const metric = document.getElementById("changeMetric")?.value || "precip";
  const status = document.getElementById("riskStatus");
  if (status && !state.changeGrids) {
    status.textContent = "Loading future-minus-current climate raster...";
  }
  const rows = state.rawSiteRows
    .filter(row => row.genesys_accessions === 0)
    .map(row => {
      const risk = state.changeGrids ? climateChangeForPoint(row.center_lat, row.center_lon) : null;
      return {
        ...row,
        precip_change: risk?.precip,
        temp_change: risk?.temp,
      };
    });
  rows.sort((a, b) => {
    const av = metric === "temp" ? Math.abs(a.temp_change ?? 0) : Math.abs(a.precip_change ?? 0);
    const bv = metric === "temp" ? Math.abs(b.temp_change ?? 0) : Math.abs(b.precip_change ?? 0);
    if (!state.changeGrids) return (b.priority_score || 0) - (a.priority_score || 0) || b.gbif_records - a.gbif_records;
    return bv - av || b.gbif_records - a.gbif_records;
  });
  state.siteRows = rows;
  renderSiteTable();
}

function rebuildSiteLayer() {
  if (!state.siteGrid || !state.map) return;
  const visible = !document.getElementById("toggleSites") || document.getElementById("toggleSites").checked;
  if (state.layers.sites && state.map.hasLayer(state.layers.sites)) {
    state.map.removeLayer(state.layers.sites);
  }
  state.layers.sites = makeRecommendedSiteLayer(state.siteGrid);
  if (visible) state.layers.sites.addTo(state.map);
}

function rebuildRiskLayer() {
  if (!state.map) return;
  const visible = !document.getElementById("toggleRisk") || document.getElementById("toggleRisk").checked;
  if (state.layers.risk && state.map.hasLayer(state.layers.risk)) {
    state.map.removeLayer(state.layers.risk);
  }
  if (!state.siteRows.length) return;
  state.layers.risk = makeClimateRiskLayer(state.siteRows);
  if (visible) {
    state.layers.risk.addTo(state.map);
    state.layers.risk.bringToFront();
  }
}

function populateSources(summary) {
  document.getElementById("sources").innerHTML = summary.sources.map(source => {
    const name = source.url
      ? `<a href="${source.url}" target="_blank" rel="noreferrer">${source.name}</a>`
      : `<strong>${source.name}</strong>`;
    return `<li>${name}: ${source.note}</li>`;
  }).join("");
}

function populateClimateSelect(summary) {
  const select = document.getElementById("climateSelect");
  select.innerHTML = summary.climate.layers.map(layer => `<option value="${layer.id}">${layer.label}</option>`).join("");
}

async function readCroppedRasters(path, samples = null) {
  const tiff = await GeoTIFF.fromUrl(path);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const resX = 360 / width;
  const resY = 180 / height;
  const left = Math.floor((140 + 180) / resX);
  const right = Math.ceil((160 + 180) / resX);
  const top = Math.floor((90 - 0) / resY);
  const bottom = Math.ceil((90 - (-12)) / resY);
  const sampleList = samples || Array.from({ length: image.getSamplesPerPixel() }, (_, i) => i);
  const rasters = await image.readRasters({ window: [left, top, right, bottom], samples: sampleList });
  return { rasters, width: right - left, height: bottom - top };
}

function validRasterValue(value) {
  return Number.isFinite(value) && value > -3e30;
}

function sumBands(rasters, length) {
  const out = new Float32Array(length);
  out.fill(NaN);
  for (let i = 0; i < length; i++) {
    let total = 0;
    let n = 0;
    for (const band of rasters) {
      const v = Number(band[i]);
      if (validRasterValue(v)) {
        total += v;
        n += 1;
      }
    }
    if (n) out[i] = total;
  }
  return out;
}

function meanBands(rasters, length) {
  const out = new Float32Array(length);
  out.fill(NaN);
  for (let i = 0; i < length; i++) {
    let total = 0;
    let n = 0;
    for (const band of rasters) {
      const v = Number(band[i]);
      if (validRasterValue(v)) {
        total += v;
        n += 1;
      }
    }
    if (n) out[i] = total / n;
  }
  return out;
}

async function readMonthlyFiles(files, reducerName) {
  let all = [];
  let grid = null;
  for (const file of files) {
    const result = await readCroppedRasters(file, [0]);
    grid = result;
    all.push(result.rasters[0]);
  }
  const length = grid.width * grid.height;
  return {
    values: reducerName === "sum" ? sumBands(all, length) : meanBands(all, length),
    width: grid.width,
    height: grid.height,
  };
}

async function buildClimateChangeGrids() {
  const status = document.getElementById("riskStatus");
  if (!window.GeoTIFF) {
    status.textContent = "Climate-change ranking unavailable: GeoTIFF runtime did not load.";
    return;
  }
  status.textContent = "Reading baseline precipitation...";
  const baselinePrec = await readMonthlyFiles(state.summary.climate.change.baseline.prec.files, "sum");
  status.textContent = "Reading future precipitation...";
  const futurePrecRaw = await readCroppedRasters(state.summary.climate.change.future.precip.local_tif);
  const futurePrec = sumBands(futurePrecRaw.rasters, futurePrecRaw.width * futurePrecRaw.height);

  status.textContent = "Reading baseline temperature...";
  const baselineTemp = await readMonthlyFiles(state.summary.climate.change.baseline.tavg.files, "mean");
  status.textContent = "Reading future temperature...";
  const futureTminRaw = await readCroppedRasters(state.summary.climate.change.future.tmin.local_tif);
  const futureTmaxRaw = await readCroppedRasters(state.summary.climate.change.future.tmax.local_tif);
  const futureTmin = meanBands(futureTminRaw.rasters, futureTminRaw.width * futureTminRaw.height);
  const futureTmax = meanBands(futureTmaxRaw.rasters, futureTmaxRaw.width * futureTmaxRaw.height);

  const length = baselinePrec.width * baselinePrec.height;
  const precipChange = new Float32Array(length);
  const tempChange = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    precipChange[i] = validRasterValue(futurePrec[i]) && validRasterValue(baselinePrec.values[i])
      ? futurePrec[i] - baselinePrec.values[i]
      : NaN;
    const futureMean = validRasterValue(futureTmin[i]) && validRasterValue(futureTmax[i])
      ? (futureTmin[i] + futureTmax[i]) / 2
      : NaN;
    tempChange[i] = validRasterValue(futureMean) && validRasterValue(baselineTemp.values[i])
      ? futureMean - baselineTemp.values[i]
      : NaN;
  }

  state.changeGrids = {
    width: baselinePrec.width,
    height: baselinePrec.height,
    precip: precipChange,
    temp: tempChange,
  };
  status.textContent = "Climate-change raster ready.";
  renderClimateChangeHotspot();
  sortRiskSites();
}

function climateChangeForPoint(lat, lon) {
  if (!state.changeGrids) return null;
  const x = Math.floor(((lon - 140) / 20) * state.changeGrids.width);
  const y = Math.floor(((0 - lat) / 12) * state.changeGrids.height);
  if (x < 0 || y < 0 || x >= state.changeGrids.width || y >= state.changeGrids.height) return null;
  const idx = y * state.changeGrids.width + x;
  const precip = state.changeGrids.precip[idx];
  const temp = state.changeGrids.temp[idx];
  if (!Number.isFinite(precip) || !Number.isFinite(temp)) return null;
  return { precip, temp };
}

async function renderClimateLayer(layerMeta) {
  const opacity = Number(document.getElementById("climateOpacity").value);
  if (state.layers.climate) {
    state.map.removeLayer(state.layers.climate);
    state.layers.climate = null;
  }
  if (!document.getElementById("toggleClimate").checked) {
    updateLegend(layerMeta);
    return;
  }

  const status = document.getElementById("climateStatus");
  status.textContent = "Reading CMIP6 GeoTIFF...";

  try {
    let dataUrl = state.climateCache.get(layerMeta.id);
    let range = layerMeta.range;
    if (!dataUrl) {
      if (!window.GeoTIFF) throw new Error("GeoTIFF runtime unavailable");
      const tiff = await GeoTIFF.fromUrl(layerMeta.local_tif);
      const image = await tiff.getImage();
      const width = image.getWidth();
      const height = image.getHeight();
      const resX = 360 / width;
      const resY = 180 / height;
      const left = Math.floor((140 + 180) / resX);
      const right = Math.ceil((160 + 180) / resX);
      const top = Math.floor((90 - 0) / resY);
      const bottom = Math.ceil((90 - (-12)) / resY);
      const samples = Array.from({ length: image.getSamplesPerPixel() }, (_, i) => i);
      const rasters = await image.readRasters({ window: [left, top, right, bottom], samples });
      const cropW = right - left;
      const cropH = bottom - top;
      const values = new Float32Array(cropW * cropH);

      for (let i = 0; i < values.length; i++) {
        let n = 0;
        let total = 0;
        for (const band of rasters) {
          const v = Number(band[i]);
          if (Number.isFinite(v) && v > -3e30) {
            total += v;
            n += 1;
          }
        }
        values[i] = n ? (layerMeta.id === "precip" ? total : total / n) : NaN;
      }

      const vmin = pct(Array.from(values), 5);
      const vmax = pct(Array.from(values), 95);
      const canvas = document.createElement("canvas");
      canvas.width = cropW;
      canvas.height = cropH;
      const ctx = canvas.getContext("2d");
      const img = ctx.createImageData(cropW, cropH);
      const stops = layerMeta.id === "precip"
        ? [[246, 239, 210], [147, 199, 174], [62, 137, 182], [33, 70, 129]]
        : [[63, 136, 197], [255, 237, 160], [240, 93, 59], [144, 33, 54]];
      for (let i = 0; i < values.length; i++) {
        const v = values[i];
        const offset = i * 4;
        if (!Number.isFinite(v)) {
          img.data[offset + 3] = 0;
          continue;
        }
        const rgb = colorRamp((v - vmin) / Math.max(0.0001, vmax - vmin), stops);
        img.data[offset] = rgb[0];
        img.data[offset + 1] = rgb[1];
        img.data[offset + 2] = rgb[2];
        img.data[offset + 3] = 185;
      }
      ctx.putImageData(img, 0, 0);
      dataUrl = canvas.toDataURL("image/png");
      range = [Math.round(vmin * 10) / 10, Math.round(vmax * 10) / 10];
      state.climateCache.set(layerMeta.id, dataUrl);
      layerMeta.range = range;
    }

    state.layers.climate = L.imageOverlay(dataUrl, bounds, { opacity, interactive: false }).addTo(state.map);
    state.layers.climate.bringToBack();
    status.textContent = `${layerMeta.unit}; 5-95% range ${range[0]} to ${range[1]}`;
    updateLegend(layerMeta);
  } catch (err) {
    status.innerHTML = `Climate raster could not render. <a href="${layerMeta.source_url}" target="_blank" rel="noreferrer">Source GeoTIFF</a>`;
    console.error(err);
  }
}

function syncLayerVisibility() {
  const pairs = [
    ["toggleGbif", "gbif"],
    ["toggleGenesys", "genesys"],
    ["togglePoints", "points"],
  ];
  for (const [control, layerName] of pairs) {
    const checked = document.getElementById(control).checked;
    const layer = state.layers[layerName];
    if (!layer) continue;
    if (checked && !state.map.hasLayer(layer)) layer.addTo(state.map);
    if (!checked && state.map.hasLayer(layer)) state.map.removeLayer(layer);
  }
  const selected = state.summary.climate.layers.find(layer => layer.id === document.getElementById("climateSelect").value);
  renderClimateLayer(selected);
  renderClimateChangeHotspot();
  renderSuggestedSiteLayers();
}

function updateLegend() {
  const selected = state.summary?.climate?.layers?.find(layer => layer.id === document.getElementById("climateSelect")?.value);
  const climateVisible = document.getElementById("toggleClimate")?.checked;
  const changeMetric = document.getElementById("changeMetric")?.value || "precip";
  const changeOverlay = state.changeLayers?.layers?.[changeMetric] || (state.changeGrids ? makeChangeOverlay(changeMetric) : null);
  const changeTitle = changeMetric === "temp" ? "Temperature change" : "Rainfall change";
  const climateTitle = selected?.id === "precip" ? "Rainfall" : "Temperature";
  const climateRange = selected?.range
    ? `${formatLegendValue(selected.range[0], selected.unit)} to ${formatLegendValue(selected.range[1], selected.unit)}`
    : "loading range";
  const climateClass = selected?.id === "precip" ? "climate rain" : "climate temp";
  document.getElementById("legend").innerHTML = `
    <strong>Map legend</strong>
    <div class="legend-block">
      <div class="legend-title">${climateTitle} ${climateVisible ? "" : "(hidden)"}</div>
      <div class="scale-row"><span>${selected?.range ? formatLegendValue(selected.range[0], selected.unit) : "low"}</span><span>${selected?.range ? formatLegendValue(selected.range[1], selected.unit) : "high"}</span></div>
      <span class="swatch ${climateClass}"></span>
      <div class="legend-note">CMIP6 ${state.summary?.climate?.model || ""} ${state.summary?.climate?.ssp?.toUpperCase() || ""} ${state.summary?.climate?.period || ""}; ${climateRange}</div>
    </div>
    <div class="legend-block">
      <div class="legend-title">${changeTitle} ${document.getElementById("toggleRisk")?.checked ? "" : "(hidden)"}</div>
      <div class="scale-row"><span>${changeOverlay ? formatLegendValue(changeOverlay.range[0], changeOverlay.unit) : "negative"}</span><span>${changeOverlay ? formatLegendValue(changeOverlay.range[1], changeOverlay.unit) : "positive"}</span></div>
      <span class="swatch change ${changeMetric === "temp" ? "temp" : "precip"}"></span>
      <div class="legend-note">${changeMetric === "temp" ? "Future minus current climate; pale means no change, red means increase." : "Future minus current climate; blue means decrease, red means increase."}</div>
    </div>
    <div class="swatch-row"><span class="swatch suggested gbif-gap"></span><span>Suggested: GBIF-rich, Genesys-poor</span></div>
    <div class="swatch-row"><span class="swatch suggested temp-gap"></span><span>Suggested: high warming, Genesys-poor</span></div>
    <div class="swatch-row"><span class="swatch suggested rain-gap"></span><span>Suggested: rainfall extreme, Genesys-poor</span></div>
    <div class="swatch-row"><span class="swatch suggested weighted"></span><span>Weighted final recommendation</span></div>
    <div class="swatch-row"><span class="swatch gbif"></span><span>GBIF occurrence density</span></div>
    <div class="swatch-row"><span class="swatch genesys"></span><span>Genesys accession density</span></div>
  `;
}

async function main() {
  clearCheckedInputs();
  const [summary, gbifGrid, genesysGrid, points, gapRows, siteGrid, siteRows, cropRows, changeLayers, suggestedLayers] = await Promise.all([
    fetchJson("data/summary.json"),
    fetchJson("data/gbif_grid.geojson"),
    fetchJson("data/genesys_grid.geojson"),
    fetchJson("data/genesys_points.json"),
    fetchJson("data/taxa_gap.json"),
    fetchJson("data/recommended_sites.geojson"),
    fetchJson("data/recommended_sites.json"),
    fetchJson("data/recommended_crops.json"),
    fetchJson("data/climate/change_layers.json"),
    fetchJson("data/suggested_vegetable_layers.json"),
  ]);

  state.summary = summary;
  state.gapRows = gapRows;
  state.rawSiteRows = siteRows;
  state.siteRows = siteRows.filter(row => row.genesys_accessions === 0);
  state.cropRows = cropRows;
  state.siteGrid = siteGrid;
  state.changeLayers = changeLayers;
  state.suggestedLayers = suggestedLayers;
  setKpis(summary);
  populateSources(summary);
  populateClimateSelect(summary);
  initMap();
  updateLegend();

  state.layers.gbif = makeGridLayer(gbifGrid, "gbif").addTo(state.map);
  state.layers.genesys = makeGridLayer(genesysGrid, "genesys").addTo(state.map);
  state.layers.points = makePointLayer(points);
  updateWeightLabels();
  renderGapTable();
  renderCropTable();
  sortRiskSites();

  document.getElementById("gapSearch").addEventListener("input", renderGapTable);
  document.getElementById("cropSearch").addEventListener("input", renderCropTable);
  document.getElementById("changeMetric").addEventListener("change", () => {
    renderClimateChangeHotspot();
    sortRiskSites();
  });
  document.getElementById("riskOpacity").addEventListener("input", () => {
    if (state.layers.risk) state.layers.risk.setOpacity(Number(document.getElementById("riskOpacity").value));
  });
  for (const id of ["toggleClimate", "toggleGbif", "toggleRisk", "toggleGenesys", "togglePoints"]) {
    document.getElementById(id).addEventListener("change", syncLayerVisibility);
  }
  document.querySelectorAll(".suggestedLayerToggle").forEach(input => {
    input.addEventListener("change", renderSuggestedSiteLayers);
  });
  document.getElementById("toggleSuggestedComposite").addEventListener("change", renderSuggestedSiteLayers);
  document.querySelectorAll(".suggestedWeight").forEach(input => {
    input.addEventListener("input", () => {
      updateWeightLabels();
      renderSuggestedSiteLayers();
      renderSiteTable();
    });
  });
  document.getElementById("suggestedSiteOpacity").addEventListener("input", () => {
    const opacity = suggestedOpacity();
    Object.values(state.layers.suggestedSiteComponents || {}).forEach(layer => layer.setStyle({ fillOpacity: opacity }));
    if (state.layers.suggestedComposite) state.layers.suggestedComposite.setStyle({ fillOpacity: opacity });
  });
  document.getElementById("climateSelect").addEventListener("change", syncLayerVisibility);
  document.getElementById("climateOpacity").addEventListener("input", () => {
    if (state.layers.climate) state.layers.climate.setOpacity(Number(document.getElementById("climateOpacity").value));
  });
  document.getElementById("downloadSiteTable").addEventListener("click", downloadSiteTable);

  syncLayerVisibility();
  if (state.changeLayers) {
    renderClimateChangeHotspot();
  } else {
    buildClimateChangeGrids().catch(err => {
      document.getElementById("riskStatus").textContent = "Climate-change raster could not be calculated.";
      console.error(err);
    });
  }
}

main().catch(err => {
  document.getElementById("freshness").textContent = "Unable to load dashboard data.";
  console.error(err);
});
