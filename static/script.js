"use strict";

/* =====================================================
   HEARTWISE DASHBOARD - METRICS, CHARTS, DATA, HISTORY
   ===================================================== */

const $ = (id) => document.getElementById(id);

const COLORS = {
  cyan: "#5ce7d3",
  blue: "#65a9ff",
  violet: "#9d91ff",
  green: "#65dfb0",
  muted: "#8298b2",
  grid: "rgba(143,162,186,.16)",
  text: "#edf5ff"
};

/*
  Saved comparison figures are shown immediately while APIs load.
  They are comparison CSV figures, NOT verified independent test scores.
*/
const FALLBACK_MODELS = [
  {
    Model: "Logistic Regression",
    Accuracy: 0.8032786885245902,
    Precision: 0.8,
    Recall: 0.8484848484848485,
    "F1 Score": 0.8235294117647058
  },
  {
    Model: "Random Forest",
    Accuracy: 0.7540983606557377,
    Precision: 0.7647058823529411,
    Recall: 0.7878787878787877,
    "F1 Score": 0.7761194029850746
  }
];

const state = {
  metrics: null,
  dataset: null,
  models: FALLBACK_MODELS,
  summary: null
};


/* ---------------- COMMON HELPERS ---------------- */

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function safe(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[ch]);
}

function numeric(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "string" && value.trim().endsWith("%")) {
    const parsed = Number(value.trim().slice(0, -1));
    return Number.isFinite(parsed) ? parsed / 100 : null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ratio(value) {
  const number = numeric(value);
  if (number === null) return null;

  return number > 1 && number <= 100
    ? number / 100
    : number;
}

function percent(value) {
  const number = ratio(value);
  return number === null ? "—" : `${(number * 100).toFixed(1)}%`;
}

function getValue(object, keys) {
  for (const key of keys) {
    if (
      object &&
      object[key] !== null &&
      object[key] !== undefined &&
      object[key] !== ""
    ) {
      return object[key];
    }
  }
  return null;
}

function setBarWidth(id, value) {
  const bar = $(id);
  if (!bar) return;

  const n = ratio(value);

  bar.style.width = n === null
    ? "0%"
    : `${Math.max(0, Math.min(1, n)) * 100}%`;
}

function setMetric(valueId, barId, value) {
  setText(valueId, percent(value));
  setBarWidth(barId, value);
}

async function getJSON(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }

  return response.json();
}

function showTableMessage(id, count, message) {
  const body = $(id);
  if (!body) return;

  body.innerHTML =
    `<tr><td colspan="${count}" class="empty-cell">${safe(message)}</td></tr>`;
}


/* ---------------- METRIC CARDS ---------------- */

function normaliseMetrics(row) {
  if (!row) return null;

  return {
    accuracy: getValue(row, ["accuracy", "Accuracy"]),
    precision: getValue(row, ["precision", "Precision"]),
    recall: getValue(row, ["recall", "Recall"]),
    f1: getValue(row, ["f1", "f1_score", "F1 Score"]),
    roc_auc: getValue(row, ["roc_auc", "ROC-AUC", "AUC", "auc"]),
    sample_count: getValue(row, ["sample_count"])
  };
}

function validMetrics(metrics) {
  return Boolean(metrics) && [
    metrics.accuracy,
    metrics.precision,
    metrics.recall,
    metrics.f1
  ].every(value => numeric(value) !== null);
}

function updateMetricCards(metrics, note) {
  state.metrics = metrics;

  setText("topAccuracy", percent(metrics.accuracy));
  setText("topPrecision", percent(metrics.precision));
  setText("topRecall", percent(metrics.recall));
  setText("topF1", percent(metrics.f1));

  setMetric("accuracyValue", "accuracyBar", metrics.accuracy);
  setMetric("precisionValue", "precisionBar", metrics.precision);
  setMetric("recallValue", "recallBar", metrics.recall);
  setMetric("f1Value", "f1Bar", metrics.f1);
  setMetric("aucValue", "aucBar", metrics.roc_auc);

  setText("metricAccuracy", percent(metrics.accuracy));
  setText("accuracySubtitle", "Model evaluation metric");
  setText("metricsNote", note);

  if (metrics.sample_count !== null && metrics.sample_count !== undefined) {
    setText(
      "metricRecords",
      `${Number(metrics.sample_count).toLocaleString()} records evaluated`
    );
  }

  drawMetricChart(metrics);
}


/* ---------------- CANVAS HELPERS ---------------- */

function prepareCanvas(id, height) {
  const canvas = $(id);
  if (!canvas) return null;

  const width = Math.max(260, Math.floor(canvas.clientWidth || 320));
  const dpr = Math.max(1, window.devicePixelRatio || 1);

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  return { ctx, width, height };
}


/* ---------------- METRIC BAR CHART ---------------- */

function drawMetricChart(metrics) {
  const chart = prepareCanvas("metricsChart", 205);
  if (!chart) return;

  const { ctx, width, height } = chart;
  ctx.clearRect(0, 0, width, height);

  const items = [
    ["Accuracy", metrics.accuracy, COLORS.cyan],
    ["Precision", metrics.precision, COLORS.violet],
    ["Recall", metrics.recall, COLORS.green],
    ["F1 Score", metrics.f1, COLORS.blue],
    ["ROC-AUC", metrics.roc_auc, "#b7a3ff"]
  ];

  const labelWidth = 76;
  const plotWidth = Math.max(60, width - labelWidth - 48);

  items.forEach(([label, raw, color], index) => {
    const y = 10 + index * 34;
    const value = ratio(raw);

    ctx.fillStyle = "#a5b7ca";
    ctx.font = "10px Arial";
    ctx.textAlign = "left";
    ctx.fillText(label, 0, y + 12);

    ctx.fillStyle = "#1a2c41";
    ctx.fillRect(labelWidth, y + 2, plotWidth, 7);

    if (value !== null) {
      ctx.fillStyle = color;
      ctx.fillRect(
        labelWidth,
        y + 2,
        plotWidth * Math.max(0, Math.min(1, value)),
        7
      );
    }

    ctx.fillStyle = "#d5e2f2";
    ctx.textAlign = "right";
    ctx.fillText(percent(raw), width, y + 12);
  });

  ctx.fillStyle = "#71869f";
  ctx.font = "9px Arial";
  ctx.textAlign = "left";
  ctx.fillText("0%", labelWidth, height - 2);

  ctx.textAlign = "right";
  ctx.fillText("100%", labelWidth + plotWidth, height - 2);
}


/* ---------------- DONUT CHART ---------------- */

function drawDonut(id, values, labels, colors) {
  const chart = prepareCanvas(id, 220);
  if (!chart) return;

  const { ctx, width } = chart;
  ctx.clearRect(0, 0, width, 220);

  const nums = values.map(value => {
    const n = numeric(value);
    return n === null ? 0 : Math.max(0, n);
  });

  const total = nums.reduce((sum, value) => sum + value, 0);
  const cx = width / 2;
  const cy = 91;
  const outerRadius = 62;
  const innerRadius = 42;

  if (total <= 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, (outerRadius + innerRadius) / 2, 0, Math.PI * 2);
    ctx.strokeStyle = "#203349";
    ctx.lineWidth = outerRadius - innerRadius;
    ctx.stroke();

    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText("No records", cx, cy + outerRadius + 22);
    return;
  }

  let start = -Math.PI / 2;

  nums.forEach((value, index) => {
    if (value <= 0) return;

    const end = start + (value / total) * Math.PI * 2;

    ctx.beginPath();
    ctx.arc(cx, cy, (outerRadius + innerRadius) / 2, start, end);
    ctx.strokeStyle = colors[index];
    ctx.lineWidth = outerRadius - innerRadius;
    ctx.stroke();

    start = end;
  });

  ctx.fillStyle = COLORS.text;
  ctx.textAlign = "center";
  ctx.font = "700 21px Arial";
  ctx.fillText(total.toLocaleString(), cx, cy + 5);

  ctx.fillStyle = COLORS.muted;
  ctx.font = "10px Arial";
  ctx.fillText("RECORDS", cx, cy + 22);

  const legendWidth = Math.min(width - 24, 290);
  const groupWidth = legendWidth / Math.max(1, labels.length);
  const startX = (width - legendWidth) / 2;

  labels.forEach((label, index) => {
    const x = startX + index * groupWidth;

    ctx.fillStyle = colors[index];
    ctx.beginPath();
    ctx.arc(x + 5, 190, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#9eb0c7";
    ctx.textAlign = "left";
    ctx.font = "10px Arial";
    ctx.fillText(label, x + 13, 193, groupWidth - 16);
  });
}


/* ---------------- MODEL COMPARISON CHART ---------------- */

function drawComparison(models) {
  const chart = prepareCanvas("comparisonChart", 255);
  if (!chart) return;

  const { ctx, width, height } = chart;
  ctx.clearRect(0, 0, width, height);

  if (!models.length) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText("No comparison data available", width / 2, height / 2);
    return;
  }

  const definitions = [
    ["Accuracy", ["Accuracy", "accuracy"], COLORS.cyan],
    ["Precision", ["Precision", "precision"], COLORS.violet],
    ["Recall", ["Recall", "recall"], COLORS.green],
    ["F1 Score", ["F1 Score", "f1_score", "f1"], COLORS.blue]
  ];

  const left = 27;
  const right = 12;
  const top = 38;
  const bottom = 38;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  definitions.forEach(([label, keys, color], index) => {
    const x = left + index * plotWidth / definitions.length;

    ctx.fillStyle = color;
    ctx.fillRect(x, 8, 7, 7);

    ctx.fillStyle = "#9eb0c7";
    ctx.font = "9px Arial";
    ctx.textAlign = "left";
    ctx.fillText(label, x + 10, 15);
  });

  for (let tick = 0; tick <= 1; tick += 0.25) {
    const y = top + plotHeight * (1 - tick);

    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(width - right, y);
    ctx.stroke();

    ctx.fillStyle = "#71869f";
    ctx.font = "8px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`${Math.round(tick * 100)}%`, left, y - 3);
  }

  const groupWidth = plotWidth / models.length;
  const barWidth = Math.max(4, Math.min(18, groupWidth / 7));

  models.forEach((modelRow, index) => {
    const groupX = left + index * groupWidth;

    definitions.forEach(([, keys, color], metricIndex) => {
      const value = ratio(getValue(modelRow, keys));
      if (value === null) return;

      const gap = barWidth + 3;
      const totalBars = definitions.length * gap;
      const x = groupX + (groupWidth - totalBars) / 2 + metricIndex * gap;
      const barHeight = plotHeight * Math.max(0, Math.min(1, value));

      ctx.fillStyle = color;
      ctx.fillRect(
        x,
        top + plotHeight - barHeight,
        barWidth,
        barHeight
      );
    });

    const name = String(modelRow.Model ?? modelRow.model ?? `Model ${index + 1}`);
    ctx.fillStyle = "#a8bad0";
    ctx.font = "9px Arial";
    ctx.textAlign = "center";
    ctx.fillText(
      name.length > 16 ? name.slice(0, 14) + "…" : name,
      groupX + groupWidth / 2,
      height - 12
    );
  });
}


/* ---------------- LOAD MODEL METRICS ---------------- */

async function loadMetrics() {
  let metrics = null;
  let note = "";

  try {
    const result = await getJSON("/api/evaluation-metrics");

    if (result.available === true) {
      const received = normaliseMetrics(result);

      if (validMetrics(received)) {
        metrics = received;
        note = result.evaluation_note ||
          "Metrics loaded from the evaluation API.";
      }
    } else {
      note = result.message || "Using saved model-comparison values.";
    }
  } catch (error) {
    console.warn("Evaluation API:", error);
  }

  if (!metrics) {
    try {
      const response = await getJSON("/api/model-comparison");
      const models = Array.isArray(response)
        ? response
        : Array.isArray(response.models)
          ? response.models
          : [];

      const selected = models.find(row =>
        String(row.Model ?? row.model ?? "")
          .toLowerCase()
          .includes("logistic")
      ) || models[0];

      const received = normaliseMetrics(selected);
      if (validMetrics(received)) {
        metrics = received;
        note = "Showing saved model-comparison figures, not independent test scores.";
      }
    } catch (error) {
      console.warn("Comparison API:", error);
    }
  }

  // Always render a visible comparison baseline while troubleshooting.
  if (!metrics) {
    metrics = normaliseMetrics(FALLBACK_MODELS[0]);
    note = "Fallback comparison figures are shown. Check backend API results.";
  }

  updateMetricCards(metrics, note);
}


/* ---------------- LOAD DATASET ---------------- */

async function loadDataset() {
  try {
    const data = await getJSON("/api/dataset");

    if (data.error) throw new Error(data.error);

    state.dataset = data;

    const rows = Array.isArray(data.rows) ? data.rows : [];
    const columns = Array.isArray(data.columns)
      ? data.columns
      : (rows.length ? Object.keys(rows[0]) : []);

    setText(
      "datasetTotal",
      Number(data.total_rows ?? rows.length).toLocaleString()
    );

    const normalise = name =>
      String(name).trim().toLowerCase().replace(/\s+/g, "_");

    const targetColumn = columns.find(name =>
      ["target", "output", "num", "heartdisease", "heart_disease"]
        .includes(normalise(name))
    );

    let positive = 0;
    let negative = 0;

    if (targetColumn) {
      rows.forEach(row => {
        const value = Number(row[targetColumn]);

        if (Number.isFinite(value) && value > 0) positive++;
        else if (value === 0) negative++;
      });
    }

    setText("positiveCount", positive.toLocaleString());
    setText("negativeCount", negative.toLocaleString());

    const labelled = positive + negative;

    setBarWidth(
      "positiveBar",
      labelled ? positive / labelled : 0
    );

    setBarWidth(
      "negativeBar",
      labelled ? negative / labelled : 0
    );

    setText(
      "datasetNote",
      targetColumn
        ? `${labelled.toLocaleString()} labelled rows · ${data.source || "dataset CSV"}`
        : "Dataset loaded, but target column was not recognised."
    );

    drawDonut(
      "datasetChart",
      [positive, negative],
      ["Positive", "Negative"],
      [COLORS.cyan, COLORS.violet]
    );

  } catch (error) {
    console.error("Dataset API:", error);

    setText("datasetTotal", "Unavailable");
    setText("positiveCount", "—");
    setText("negativeCount", "—");
    setText("datasetNote", `Dataset error: ${error.message}`);

    drawDonut(
      "datasetChart",
      [0, 0],
      ["Positive", "Negative"],
      [COLORS.cyan, COLORS.violet]
    );
  }
}


/* ---------------- LOAD COMPARISON TABLE ---------------- */

async function loadModelComparison() {
  let models = [];

  try {
    const response = await getJSON("/api/model-comparison");
    models = Array.isArray(response)
      ? response
      : Array.isArray(response.models)
        ? response.models
        : [];
  } catch (error) {
    console.warn("Model comparison API:", error);
  }

  if (!models.length) {
    models = FALLBACK_MODELS;
  }

  state.models = models;
  drawComparison(models);

  const body = $("modelComparisonBody");

  if (body) {
    body.innerHTML = models.map(row => `
      <tr>
        <td>${safe(row.Model ?? row.model ?? "Model")}</td>
        <td>${safe(percent(getValue(row, ["Accuracy", "accuracy"])))}</td>
        <td>${safe(percent(getValue(row, ["Precision", "precision"])))}</td>
        <td>${safe(percent(getValue(row, ["Recall", "recall"])))}</td>
        <td>${safe(percent(getValue(row, ["F1 Score", "f1_score", "f1"])))}</td>
      </tr>
    `).join("");
  }
}


/* ---------------- LOAD PREDICTION HISTORY ---------------- */

async function loadHistory() {
  try {
    const [summary, response] = await Promise.all([
      getJSON("/api/dashboard"),
      getJSON("/api/predictions")
    ]);

    state.summary = summary;

    const rows = Array.isArray(response)
      ? response
      : Array.isArray(response.rows)
        ? response.rows
        : [];

    const high = Number(
      summary.high_risk ??
      rows.filter(row => Number(row.prediction) === 1).length
    );

    const low = Number(
      summary.low_risk ??
      rows.filter(row => Number(row.prediction) === 0).length
    );

    const total = Number(summary.total_predictions ?? high + low);

    setText("historySummary", `${total.toLocaleString()} saved assessments`);
    setText("historyHighCount", high.toLocaleString());
    setText("historyLowCount", low.toLocaleString());

    drawDonut(
      "historyChart",
      [high, low],
      ["High Risk", "Low Risk"],
      [COLORS.cyan, COLORS.violet]
    );

    const body = $("historyBody");
    if (!body) return;

    if (!rows.length) {
      showTableMessage("historyBody", 6, "No predictions saved yet.");
      setText("historyNote", "Submit an assessment to save a record.");
      return;
    }

    body.innerHTML = rows.slice(0, 15).map(row => {
      const isHigh = Number(row.prediction) === 1;
      const date = row.created_at
        ? String(row.created_at).replace("T", " ").slice(0, 16)
        : "—";

      const probability = numeric(row.risk_probability);
      const probabilityText = probability === null
        ? "N/A"
        : `${probability.toFixed(1)}%`;

      return `
        <tr>
          <td>${safe(row.id)}</td>
          <td>${safe(date)}</td>
          <td>${safe(row.age)}</td>
          <td>${safe(row.chol)}</td>
          <td>
            <span class="status-pill ${isHigh ? "" : "low"}">
              ${isHigh ? "High Risk" : "Low Risk"}
            </span>
          </td>
          <td>${safe(probabilityText)}</td>
        </tr>
      `;
    }).join("");

    setText(
      "historyNote",
      `Showing latest ${Math.min(rows.length, 15)} saved assessments.`
    );

  } catch (error) {
    console.error("Prediction history API:", error);

    setText("historySummary", "History unavailable");
    setText("historyNote", error.message);

    showTableMessage("historyBody", 6, "Could not load prediction history.");

    drawDonut(
      "historyChart",
      [0, 0],
      ["High Risk", "Low Risk"],
      [COLORS.cyan, COLORS.violet]
    );
  }
}


/* ---------------- MODEL CONNECTION ---------------- */

async function loadHealth() {
  try {
    const data = await getJSON("/api/health");
    const ready = Boolean(data.ready);

    setText("headerStatus", ready ? "Model connected" : "Model unavailable");
    setText("metricStatus", ready ? "Connected" : "Unavailable");

    setText(
      "modelDetail",
      ready
        ? `${data.model || "Trained model"} · ${data.features || 13} features`
        : "Check saved model files"
    );

    setText(
      "connectionTitle",
      ready ? "Trained model is connected" : "Model not available"
    );

    setText(
      "connectionDescription",
      ready
        ? "The existing trained model is loaded."
        : (data.error || "Check the model files.")
    );

    const dot = $("headerDot");
    if (dot) dot.style.background = ready ? COLORS.green : "#f5b85e";

  } catch (error) {
    console.error("Health API:", error);
    setText("headerStatus", "Connection unavailable");
    setText("metricStatus", "Unavailable");
    setText("modelDetail", "Could not connect to FastAPI");
  }
}


/* ---------------- FORM BUTTONS ---------------- */

const predictionForm = $("predictionForm");

if (predictionForm) {
  predictionForm.addEventListener("submit", () => {
    const button = $("predictButton");

    if (button) {
      button.disabled = true;
      button.textContent = "Generating result…";
    }
  });
}

const resetButton = $("resetButton");

if (resetButton) {
  resetButton.addEventListener("click", () => {
    setTimeout(() => {
      const button = $("predictButton");

      if (button) {
        button.disabled = false;
        button.textContent = "✦ Generate model result ↗";
      }
    }, 0);
  });
}

const menuToggle = $("menuToggle");

if (menuToggle) {
  menuToggle.addEventListener("click", () => {
    $("sidebar")?.classList.toggle("open");
  });
}

document.querySelectorAll(".nav-link").forEach(link => {
  link.addEventListener("click", () => {
    $("sidebar")?.classList.remove("open");

    document.querySelectorAll(".nav-link").forEach(item => {
      item.classList.remove("active");
    });

    link.classList.add("active");
  });
});


/* ---------------- PREDICTION RESULT SCROLL ---------------- */

function scrollToPredictionResult() {
  const result = $("resultContent");
  const error = document.querySelector(".error-box");

  if (!result && !error) return;

  setTimeout(() => {
    (result || error).scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }, 250);
}

scrollToPredictionResult();


/* ---------------- RESIZE CHARTS ---------------- */

let resizeTimer;

window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);

  resizeTimer = setTimeout(() => {
    if (state.metrics) drawMetricChart(state.metrics);
    if (state.models.length) drawComparison(state.models);

    if (state.dataset) {
      loadDataset();
    }

    if (state.summary) {
      drawDonut(
        "historyChart",
        [
          Number(state.summary.high_risk || 0),
          Number(state.summary.low_risk || 0)
        ],
        ["High Risk", "Low Risk"],
        [COLORS.cyan, COLORS.violet]
      );
    }
  }, 200);
});


/* ---------------- INITIAL LOAD ---------------- */

// Render metrics and comparison chart immediately.
// Then retrieve current values from the APIs.
updateMetricCards(
  normaliseMetrics(FALLBACK_MODELS[0]),
  "Showing saved comparison figures while the API loads."
);

drawComparison(FALLBACK_MODELS);

async function initialiseDashboard() {
  await Promise.allSettled([
    loadHealth(),
    loadMetrics(),
    loadDataset(),
    loadModelComparison(),
    loadHistory()
  ]);
}

initialiseDashboard();