import sqlite3
import os


BASE_DIR = os.path.dirname(
    os.path.dirname(
        os.path.abspath(__file__)
    )
)

DATABASE_DIR = os.path.join(
    BASE_DIR,
    "database"
)

DATABASE_PATH = os.path.join(
    DATABASE_DIR,
    "heart_predictions.db"
)


os.makedirs(
    DATABASE_DIR,
    exist_ok=True
)


connection = sqlite3.connect(
    DATABASE_PATH
)

cursor = connection.cursor()


cursor.execute(
    """
    CREATE TABLE IF NOT EXISTS predictions (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        age INTEGER,

        sex INTEGER,

        cp INTEGER,

        trestbps REAL,

        chol REAL,

        fbs INTEGER,

        restecg INTEGER,

        thalach REAL,

        exang INTEGER,

        oldpeak REAL,

        slope INTEGER,

        ca INTEGER,

        thal INTEGER,

        prediction INTEGER,

        risk_probability REAL,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

    )
    """
)


connection.commit()
connection.close()


print(
    "Database created successfully:"
)

print(
    DATABASE_PATH
)