from concurrent.futures import ThreadPoolExecutor

from sqlalchemy import select

from app import main, models, schemas


def _prepare_base_data(client, headers):
    wh = client.post("/warehouses", json={"code": "WH-T1", "name": "测试仓"}, headers=headers).json()
    area = client.post("/areas", json={"code": "AR-T1", "name": "测试区", "material_type": "GENERAL", "status": "ACTIVE"}, headers=headers).json()
    return wh, area


def test_warehouse_delete_guard(client_and_db):
    client, _, headers = client_and_db
    wh, area = _prepare_base_data(client, headers)

    loc_resp = client.post(
        "/locations",
        json={"warehouse_id": wh["id"], "area_id": area["id"], "code": "L-T1", "name": "库位1", "status": "ACTIVE"},
        headers=headers,
    )
    assert loc_resp.status_code == 200

    del_resp = client.delete(f"/warehouses/{wh['id']}", headers=headers)
    assert del_resp.status_code == 400
    assert "存在库位" in del_resp.json()["detail"]


def test_outbound_state_machine(client_and_db):
    client, _, headers = client_and_db
    wh, area = _prepare_base_data(client, headers)

    src = client.post(
        "/locations",
        json={"warehouse_id": wh["id"], "area_id": area["id"], "code": "SRC-01", "name": "拣货位", "status": "ACTIVE"},
        headers=headers,
    ).json()
    stg = client.post(
        "/locations",
        json={"warehouse_id": wh["id"], "area_id": area["id"], "code": "STG-01", "name": "暂存位", "status": "ACTIVE"},
        headers=headers,
    ).json()

    material = client.post(
        "/materials",
        json={"sku": "SKU-T1", "name": "测试物料", "unit": "pcs", "category": "general", "is_common": 0},
        headers=headers,
    ).json()

    client.post(
        "/inventory/adjust",
        json={"material_id": material["id"], "location_id": src["id"], "delta": 10, "reason": "init"},
        headers={**headers, "Idempotency-Key": "adj-init-1"},
    )

    order = client.post(
        "/outbounds",
        json={
            "order_no": "OB-T1",
            "customer": "C1",
            "source_location_id": src["id"],
            "staging_location_id": stg["id"],
            "lines": [{"material_id": material["id"], "qty": 3}],
        },
        headers={**headers, "Idempotency-Key": "ob-create-1"},
    ).json()
    oid = order["order_id"]

    assert client.post(f"/outbounds/{oid}/pick", json={"staging_location_id": stg["id"]}, headers=headers).status_code == 400
    assert client.post(f"/outbounds/{oid}/pack", json={"pack_all": 1}, headers=headers).status_code == 400

    assert client.post(f"/outbounds/{oid}/reserve", json={"force": 0}, headers={**headers, "Idempotency-Key": "ob-r-1"}).status_code == 200
    assert client.post(f"/outbounds/{oid}/pick", json={"staging_location_id": stg["id"]}, headers={**headers, "Idempotency-Key": "ob-p-1"}).status_code == 200
    assert client.post(f"/outbounds/{oid}/ship", json={"ship_all": 1}, headers=headers).status_code == 400
    assert client.post(f"/outbounds/{oid}/pack", json={"pack_all": 1}, headers={**headers, "Idempotency-Key": "ob-k-1"}).status_code == 200
    assert client.post(f"/outbounds/{oid}/ship", json={"ship_all": 1}, headers={**headers, "Idempotency-Key": "ob-s-1"}).status_code == 200


def test_concurrent_inventory_consistency(client_and_db):
    client, session_factory, headers = client_and_db
    wh, area = _prepare_base_data(client, headers)

    loc = client.post(
        "/locations",
        json={"warehouse_id": wh["id"], "area_id": area["id"], "code": "L-C1", "name": "并发库位", "status": "ACTIVE"},
        headers=headers,
    ).json()
    material = client.post(
        "/materials",
        json={"sku": "SKU-C1", "name": "并发物料", "unit": "pcs", "category": "general", "is_common": 0},
        headers=headers,
    ).json()

    def worker(i: int):
        with session_factory() as db:
            user = db.scalar(select(models.User).where(models.User.username == "admin"))
            main.adjust_inventory(
                payload=schemas.InventoryAdjust(material_id=material["id"], location_id=loc["id"], delta=1, reason=f"c{i}"),
                _=True,
                current_user=user,
                idempotency_key=f"conc-{i}",
                db=db,
            )

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(worker, range(20)))

    rows = client.get("/inventory", headers=headers).json()
    target = [r for r in rows if r["material_id"] == material["id"] and r["location_id"] == loc["id"]]
    assert len(target) == 1
    assert target[0]["quantity"] == 20

