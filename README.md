# WMS Intelligent Warehouse (MVP)

This is a minimal full-stack WMS with inbound, outbound, inventory, materials, common materials, orders, picking, packing, and inventory consistency via transactional updates + stock ledger.

## Stack
- Backend: FastAPI + SQLAlchemy + Alembic + SQLite
- Frontend: React + Vite

## Database
- Current: SQLite file `wms.db` in `/home/alishan/wms/backend/`
- No separate DB service is required for SQLite.
- If you later switch to Postgres, you must deploy a Postgres service separately.

## Auth & Permissions
- Default admin: `admin / admin`
- All APIs require permissions; use the admin account to manage users/roles.

## Run backend
```bash
cd /home/alishan/wms/backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

## DB migration (Alembic)
```bash
cd /home/alishan/wms/backend
. .venv/bin/activate
alembic upgrade head
```
If startup reports schema not initialized, run migration first.

## Run frontend
```bash
cd /home/alishan/wms/frontend
npm install
npm run dev
```

## API base (optional)
Set `VITE_API_BASE` if backend is not on `http://localhost:8000`.

## Frontend routes (hash-based)
- `#/` Dashboard
- `#/materials` 物料管理
- `#/inventory` 库存列表 + 调整
- `#/inbound` 入库
- `#/outbound` 出库
- `#/orders` 订单管理
- `#/records` 库存流水
- `#/docs` 操作文档

## Notes on 404 / CLodopfuncs.js
Some browser plugins request `CLodopfuncs.js`. The backend now serves an empty stub to avoid 404 noise.

## Notes on Inventory Consistency
- All inventory mutations happen inside SQL transactions.
- Inventory rows use `version` for optimistic updates.
- Every change writes a `stock_moves` record.
- Critical write APIs support `Idempotency-Key` for anti-replay.
- Operation logs now include before/after values, request source, and trace id.
- SQLite is used for simplicity; for real concurrency use Postgres (row-level locks).
