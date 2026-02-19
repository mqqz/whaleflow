# WhaleFlow Backend

Run commands from the `backend/` directory.

To run the API:
```
uvicorn app:app --reload
```
Live ingestion requires both `ETH_RPC_URL` and `BTC_RPC_URL` in `.env`.
It also requires `exchange_list.json` to include non-empty `ethereum` and `bitcoin` address maps.

To initialize the database:
```
python init_db.py
```

To backfill the database:
```
python backfill.py --days 7 --chains eth,btc --chunk-minutes 60
```
