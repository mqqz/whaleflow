import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()


def get_conn():
    db_host = os.getenv("DB_HOST")
    if not db_host:
        raise RuntimeError("DB_HOST is required")

    # Allow DB_HOST to contain a full PostgreSQL DSN/URL.
    if "://" in db_host:
        return psycopg2.connect(db_host)

    return psycopg2.connect(
        host=db_host,
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASS"),
        port=os.getenv("DB_PORT", 5432),
    )
