# WhaleFlow Backend

Canonical way is to run modules from the repository root.

To run the API:
```
uvicorn app:app --reload
```
Live ingestion requires both `ETH_RPC_URL` and `BTC_RPC_URL` in `.env`.

To initialize the database:
```
python init_db.py
```

To backfill the database:
```
python backfill.py --days 7 --chains eth,btc --chunk-minutes 60
```
