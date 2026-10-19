import json
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path

import joblib
import pandas as pd
from fastapi import FastAPI, Request, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
)

app = FastAPI(
    title="HeartWise",
    description="Educational heart-health prediction dashboard",
    version="3.0",
)

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
TEMPLATES_DIR = BASE_DIR / "templates"
DATA_DIR = BASE_DIR / "data"
MODEL_DIR = BASE_DIR / "model"
DATABASE_DIR = BASE_DIR / "database"
UPLOAD_DIR = Path("/tmp/heartwise_uploads")
ML_DIR = BASE_DIR / "machine_learning"

for directory in (
    STATIC_DIR,
    TEMPLATES_DIR,
    DATA_DIR,
    MODEL_DIR,
    DATABASE_DIR,
    UPLOAD_DIR,
    ML_DIR,
):
    directory.mkdir(parents=True, exist_ok=True)

MODEL_PATH = MODEL_DIR / "heart_model.pkl"
SCALER_PATH = MODEL_DIR / "scaler.pkl"
FEATURE_PATH = MODEL_DIR / "features.pkl"
DATABASE_PATH = Path("/tmp/heartwise_predictions.db") if os.getenv("VERCEL") else DATABASE_DIR / "heart_predictions.db"
COMPARISON_PATH = ML_DIR / "model_comparison.csv"

DATASET_CANDIDATES = [
    DATA_DIR / "heart_cleaned.csv",
    DATA_DIR / "heart.csv",
]

FEATURE_NAMES = [
    "age", "sex", "cp", "trestbps", "chol", "fbs",
    "restecg", "thalach", "exang", "oldpeak", "slope",
    "ca", "thal",
]

ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
}
MAX_UPLOAD_SIZE = 5 * 1024 * 1024

app.mount(
    "/static",
    StaticFiles(directory=str(STATIC_DIR)),
    name="static",
)

templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


# LOAD EXISTING TRAINED MODEL. DO NOT RETRAIN IT HERE.
model = None
scaler = None
features = FEATURE_NAMES.copy()
model_load_error = None

try:
    if not MODEL_PATH.is_file():
        raise FileNotFoundError(f"Trained model not found: {MODEL_PATH}")

    model = joblib.load(MODEL_PATH)

    if SCALER_PATH.is_file():
        scaler = joblib.load(SCALER_PATH)

    if FEATURE_PATH.is_file():
        features = list(joblib.load(FEATURE_PATH))

except Exception as exc:
    model_load_error = str(exc)
    print("HeartWise model loading error:", model_load_error)


# DATABASE

def get_connection():
    connection = sqlite3.connect(str(DATABASE_PATH))
    connection.row_factory = sqlite3.Row
    return connection


def ensure_database():
    with get_connection() as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS predictions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT,
                age REAL,
                sex REAL,
                cp REAL,
                trestbps REAL,
                chol REAL,
                fbs REAL,
                restecg REAL,
                thalach REAL,
                exang REAL,
                oldpeak REAL,
                slope REAL,
                ca REAL,
                thal REAL,
                prediction INTEGER,
                risk_probability REAL
            )
        """)


ensure_database()


# DATASET HELPERS

def find_dataset():
    for path in DATASET_CANDIDATES:
        if path.is_file():
            return path
    return None


def load_dataset():
    path = find_dataset()
    if path is None:
        return None
    return pd.read_csv(path)


def json_records(df):
    return json.loads(
        df.to_json(orient="records")
    )


def normalized_columns(df):
    result = df.copy()
    result.columns = [
        str(column).strip().lower().replace(" ", "_")
        for column in result.columns
    ]
    return result


# HOME PAGE

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "prediction": None,
            "prediction_value": None,
            "risk_percentage": None,
            "error": None,
            "form_data": {},
        },
    )


# PREDICTION

@app.post("/predict", response_class=HTMLResponse)
async def predict(request: Request):
    form_data = {}

    try:
        if model is None:
            raise RuntimeError(
                "Model could not be loaded. Check model/heart_model.pkl."
            )

        form = await request.form()
        data = {}

        for name in FEATURE_NAMES:
            value = form.get(name)

            if value is None or str(value).strip() == "":
                raise ValueError(f"Please enter {name}.")

            data[name] = float(value)

        form_data = data.copy()
        input_df = pd.DataFrame([data]).reindex(columns=features)

        if input_df.isna().any().any():
            raise ValueError(
                "Model feature mismatch. Check model/features.pkl."
            )

        if isinstance(model, LogisticRegression):
            if scaler is None:
                raise RuntimeError(
                    "The saved scaler.pkl file is missing."
                )
            prediction_input = scaler.transform(input_df)
        else:
            prediction_input = input_df

        prediction_value = int(model.predict(prediction_input)[0])
        risk_percentage = None

        if hasattr(model, "predict_proba"):
            probabilities = model.predict_proba(prediction_input)[0]
            model_classes = list(model.classes_)

            if 1 in model_classes:
                risk_percentage = round(
                    float(probabilities[model_classes.index(1)]) * 100,
                    2,
                )

        result = "High Risk" if prediction_value == 1 else "Low Risk"

        with get_connection() as connection:
            connection.execute(
                """
                INSERT INTO predictions (
                    created_at, age, sex, cp, trestbps, chol, fbs,
                    restecg, thalach, exang, oldpeak, slope, ca,
                    thal, prediction, risk_probability
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    datetime.now().isoformat(timespec="seconds"),
                    data["age"], data["sex"], data["cp"],
                    data["trestbps"], data["chol"], data["fbs"],
                    data["restecg"], data["thalach"], data["exang"],
                    data["oldpeak"], data["slope"], data["ca"],
                    data["thal"], prediction_value, risk_percentage,
                ),
            )

        return templates.TemplateResponse(
            request=request,
            name="index.html",
            context={
                "prediction": result,
                "prediction_value": prediction_value,
                "risk_percentage": risk_percentage,
                "error": None,
                "form_data": form_data,
            },
        )

    except Exception as exc:
        return templates.TemplateResponse(
            request=request,
            name="index.html",
            context={
                "prediction": None,
                "prediction_value": None,
                "risk_percentage": None,
                "error": str(exc),
                "form_data": form_data,
            },
            status_code=400,
        )


# MODEL HEALTH

@app.get("/api/health")
def health():
    return {
        "status": "running",
        "ready": model is not None,
        "model": type(model).__name__ if model is not None else None,
        "error": model_load_error,
        "features": len(features),
    }


# DATASET API — READ AN ACTUAL CSV FILE

@app.get("/api/dataset")
def dataset():
    try:
        path = find_dataset()

        if path is None:
            return JSONResponse(
                status_code=404,
                content={
                    "columns": [],
                    "rows": [],
                    "total_rows": 0,
                    "error": "Put heart.csv or heart_cleaned.csv inside the data folder.",
                },
            )

        df = pd.read_csv(path)

        return {
            "columns": list(df.columns),
            "rows": json_records(df),
            "total_rows": int(len(df)),
            "source": path.name,
        }

    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={
                "columns": [],
                "rows": [],
                "total_rows": 0,
                "error": str(exc),
            },
        )


# MODEL EVALUATION METRICS

@app.get("/api/evaluation-metrics")
def evaluation_metrics():
    try:
        if model is None:
            return {
                "available": False,
                "message": model_load_error or "Model is not loaded.",
            }

        original_df = load_dataset()

        if original_df is None:
            return {
                "available": False,
                "message": "Dataset CSV was not found inside data/.",
            }

        df = normalized_columns(original_df)

        target_names = [
            "target", "output", "num",
            "heartdisease", "heart_disease",
        ]

        target_column = next(
            (name for name in target_names if name in df.columns),
            None,
        )

        if target_column is None:
            return {
                "available": False,
                "message": "Target column not found in dataset.",
            }

        feature_columns = [
            str(name).strip().lower().replace(" ", "_")
            for name in features
        ]

        missing = [
            name for name in feature_columns
            if name not in df.columns
        ]

        if missing:
            return {
                "available": False,
                "message": f"Dataset is missing model features: {missing}",
            }

        X = df[feature_columns].apply(pd.to_numeric, errors="coerce")
        y_numeric = pd.to_numeric(df[target_column], errors="coerce")
        valid = X.notna().all(axis=1) & y_numeric.notna()

        X = X.loc[valid]
        y_numeric = y_numeric.loc[valid]

        if len(X) == 0 or y_numeric.nunique() < 2:
            return {
                "available": False,
                "message": "Not enough valid labelled rows to evaluate.",
            }

        # Standard heart datasets commonly use 0 for negative
        # and values greater than 0 for positive outcomes.
        y_true = (y_numeric > 0).astype(int)

        if isinstance(model, LogisticRegression):
            if scaler is None:
                return {
                    "available": False,
                    "message": "The Logistic Regression scaler is missing.",
                }
            X_model = scaler.transform(X)
        else:
            X_model = X

        y_pred = model.predict(X_model).astype(int)

        auc = None
        if hasattr(model, "predict_proba"):
            probabilities = model.predict_proba(X_model)
            classes = list(model.classes_)
            if 1 in classes and y_true.nunique() == 2:
                auc = float(
                    roc_auc_score(
                        y_true,
                        probabilities[:, classes.index(1)],
                    )
                )

        return {
            "available": True,
            "sample_count": int(len(X)),
            "accuracy": float(accuracy_score(y_true, y_pred)),
            "precision": float(
                precision_score(y_true, y_pred, zero_division=0)
            ),
            "recall": float(
                recall_score(y_true, y_pred, zero_division=0)
            ),
            "f1": float(f1_score(y_true, y_pred, zero_division=0)),
            "roc_auc": auc,
            "evaluation_note": (
                "Dataset-level diagnostic metrics; these are not "
                "independent test-set scores."
            ),
        }

    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={"available": False, "message": str(exc)},
        )


# SAVED MODEL COMPARISON

@app.get("/api/model-comparison")
def model_comparison():
    try:
        if not COMPARISON_PATH.is_file():
            return []

        return json_records(
            pd.read_csv(COMPARISON_PATH).fillna("")
        )

    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={"error": str(exc)},
        )


# PREDICTION DASHBOARD SUMMARY

@app.get("/api/dashboard")
def dashboard():
    try:
        with get_connection() as connection:
            total = connection.execute(
                "SELECT COUNT(*) FROM predictions"
            ).fetchone()[0]

            high = connection.execute(
                "SELECT COUNT(*) FROM predictions WHERE prediction = 1"
            ).fetchone()[0]

            low = connection.execute(
                "SELECT COUNT(*) FROM predictions WHERE prediction = 0"
            ).fetchone()[0]

            average = connection.execute(
                "SELECT AVG(risk_probability) FROM predictions"
            ).fetchone()[0]

        return {
            "total_predictions": int(total),
            "high_risk": int(high),
            "low_risk": int(low),
            "average_risk": round(float(average), 2) if average is not None else None,
        }

    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={"error": str(exc)},
        )


# PREDICTION HISTORY

@app.get("/api/predictions")
def predictions():
    try:
        with get_connection() as connection:
            rows = connection.execute(
                "SELECT * FROM predictions ORDER BY id DESC LIMIT 100"
            ).fetchall()

        return [dict(row) for row in rows]

    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={"error": str(exc)},
        )


# OPTIONAL REPORT IMAGE UPLOAD

@app.post("/api/scan-report")
async def scan_report(file: UploadFile = File(...)):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Only JPG, PNG and WebP images are allowed.",
        )

    file_data = await file.read()

    if len(file_data) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=400,
            detail="Maximum image size is 5 MB.",
        )

    extension = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }[file.content_type]

    filename = f"{uuid.uuid4().hex}{extension}"
    (UPLOAD_DIR / filename).write_bytes(file_data)

    return {
        "success": True,
        "filename": filename,
        "message": "Image uploaded. Automatic report reading is not implemented.",
    }