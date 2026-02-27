from datetime import datetime, timedelta
import hashlib
import secrets
from fastapi import FastAPI, Depends, HTTPException, Response, Query, Header
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from .db import Base, engine, SessionLocal
from . import models, schemas

app = FastAPI(title="WMS Intelligent Warehouse")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


PERMISSION_DESCRIPTIONS = {
    "materials.read": "物料查看",
    "materials.write": "物料新增/编辑",
    "materials.delete": "物料删除/停用",
    "inventory.read": "库存查看",
    "inventory.adjust": "库存调整",
    "orders.read": "订单查看",
    "orders.write": "订单创建",
    "inbound.receive": "入库收货",
    "outbound.reserve": "出库预留",
    "outbound.pick": "出库分拣",
    "outbound.pack": "出库打包",
    "outbound.ship": "出库出库",
    "stock_moves.read": "库存流水查看",
    "users.read": "用户查看",
    "users.write": "用户管理",
    "roles.read": "角色查看",
    "roles.write": "角色管理",
    "system.setup": "系统初始化",
}


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def hash_password(password: str, salt: str) -> str:
    return hashlib.sha256((salt + password).encode("utf-8")).hexdigest()


def get_user_permissions(db: Session, user_id: int) -> set[str]:
    stmt = (
        select(models.Permission.code)
        .join(models.RolePermission, models.RolePermission.permission_id == models.Permission.id)
        .join(models.UserRole, models.UserRole.role_id == models.RolePermission.role_id)
        .where(models.UserRole.user_id == user_id)
    )
    return set(db.scalars(stmt).all())


def get_current_user(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "missing token")
    token = authorization.replace("Bearer ", "", 1).strip()
    session = db.scalar(select(models.SessionToken).where(models.SessionToken.token == token))
    if not session or session.expires_at < datetime.utcnow():
        raise HTTPException(401, "invalid or expired token")
    user = db.get(models.User, session.user_id)
    if not user or not user.is_active:
        raise HTTPException(401, "inactive user")
    return user


def require_permission(code: str):
    def checker(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
        perms = get_user_permissions(db, user.id)
        if code not in perms:
            raise HTTPException(403, "permission denied")
        return True

    return checker


def ensure_schema(db: Session):
    Base.metadata.create_all(bind=engine)

    def ensure_column(table: str, column: str, ddl: str):
        cols = db.execute(text(f"PRAGMA table_info({table})")).fetchall()
        col_names = {row[1] for row in cols}
        if column not in col_names:
            db.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))

    ensure_column("materials", "is_active", "is_active INTEGER DEFAULT 1")
    ensure_column("order_lines", "material_sku", "material_sku VARCHAR(64)")
    ensure_column("order_lines", "material_name", "material_name VARCHAR(128)")
    db.execute(text("UPDATE materials SET is_active = 1 WHERE is_active IS NULL"))
    db.execute(text(
        "UPDATE order_lines SET material_sku = (SELECT sku FROM materials WHERE materials.id = order_lines.material_id) "
        "WHERE material_sku IS NULL"
    ))
    db.execute(text(
        "UPDATE order_lines SET material_name = (SELECT name FROM materials WHERE materials.id = order_lines.material_id) "
        "WHERE material_name IS NULL"
    ))
    db.commit()


def seed_permissions_and_admin(db: Session):
    existing = {p.code: p for p in db.scalars(select(models.Permission)).all()}
    for code, desc in PERMISSION_DESCRIPTIONS.items():
        if code not in existing:
            db.add(models.Permission(code=code, description=desc))
        else:
            if existing[code].description != desc:
                existing[code].description = desc
    db.flush()

    admin_role = db.scalar(select(models.Role).where(models.Role.name == "admin"))
    if not admin_role:
        admin_role = models.Role(name="admin", description="System Administrator")
        db.add(admin_role)
        db.flush()

    perm_ids = db.scalars(select(models.Permission.id)).all()
    existing_links = set(
        db.execute(
            text("SELECT permission_id FROM role_permissions WHERE role_id = :rid"),
            {"rid": admin_role.id},
        ).fetchall()
    )
    existing_ids = {row[0] for row in existing_links}
    for pid in perm_ids:
        if pid not in existing_ids:
            db.add(models.RolePermission(role_id=admin_role.id, permission_id=pid))

    admin_user = db.scalar(select(models.User).where(models.User.username == "admin"))
    if not admin_user:
        salt = secrets.token_hex(4)
        admin_user = models.User(
            username="admin",
            salt=salt,
            password_hash=hash_password("admin", salt),
            is_active=1,
        )
        db.add(admin_user)
        db.flush()
        db.add(models.UserRole(user_id=admin_user.id, role_id=admin_role.id))

    db.commit()


@app.on_event("startup")
def on_startup():
    with SessionLocal() as db:
        ensure_schema(db)
        seed_permissions_and_admin(db)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/CLodopfuncs.js")
def clodop_stub():
    return Response(content="", media_type="application/javascript")


@app.post("/auth/login")
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(models.User).where(models.User.username == payload.username))
    if not user or not user.is_active:
        raise HTTPException(401, "invalid credentials")
    if hash_password(payload.password, user.salt) != user.password_hash:
        raise HTTPException(401, "invalid credentials")

    token = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(hours=8)
    db.add(models.SessionToken(user_id=user.id, token=token, expires_at=expires))
    db.commit()

    perms = sorted(get_user_permissions(db, user.id))
    return {"token": token, "user": {"id": user.id, "username": user.username}, "permissions": perms}


@app.post("/auth/logout")
def logout(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(text("DELETE FROM session_tokens WHERE user_id = :uid"), {"uid": user.id})
    db.commit()
    return {"status": "ok"}


@app.get("/auth/me")
def me(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    perms = sorted(get_user_permissions(db, user.id))
    return {"id": user.id, "username": user.username, "permissions": perms}


@app.get("/permissions")
def list_permissions(_: bool = Depends(require_permission("roles.read")), db: Session = Depends(get_db)):
    perms = db.scalars(select(models.Permission)).all()
    return [{"code": p.code, "description": p.description} for p in perms]


@app.get("/users")
def list_users(_: bool = Depends(require_permission("users.read")), db: Session = Depends(get_db)):
    users = db.scalars(select(models.User)).all()
    result = []
    for u in users:
        roles = db.scalars(select(models.Role.name).join(models.UserRole).where(models.UserRole.user_id == u.id)).all()
        result.append({"id": u.id, "username": u.username, "is_active": u.is_active, "roles": roles})
    return result


@app.post("/users")
def create_user(payload: schemas.UserCreate, _: bool = Depends(require_permission("users.write")), db: Session = Depends(get_db)):
    if db.scalar(select(models.User.id).where(models.User.username == payload.username)):
        raise HTTPException(400, "username exists")
    salt = secrets.token_hex(4)
    user = models.User(
        username=payload.username,
        salt=salt,
        password_hash=hash_password(payload.password, salt),
        is_active=payload.is_active,
    )
    db.add(user)
    db.flush()
    for rid in payload.role_ids:
        db.add(models.UserRole(user_id=user.id, role_id=rid))
    db.commit()
    return {"id": user.id}


@app.put("/users/{user_id}")
def update_user(user_id: int, payload: schemas.UserUpdate, _: bool = Depends(require_permission("users.write")), db: Session = Depends(get_db)):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "user not found")
    if payload.password:
        user.password_hash = hash_password(payload.password, user.salt)
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.role_ids is not None:
        db.execute(text("DELETE FROM user_roles WHERE user_id = :uid"), {"uid": user_id})
        for rid in payload.role_ids:
            db.add(models.UserRole(user_id=user_id, role_id=rid))
    db.commit()
    return {"status": "ok"}


@app.get("/roles")
def list_roles(_: bool = Depends(require_permission("roles.read")), db: Session = Depends(get_db)):
    roles = db.scalars(select(models.Role)).all()
    result = []
    for r in roles:
        perms = db.scalars(
            select(models.Permission.code)
            .join(models.RolePermission, models.RolePermission.permission_id == models.Permission.id)
            .where(models.RolePermission.role_id == r.id)
        ).all()
        result.append({"id": r.id, "name": r.name, "description": r.description, "permissions": perms})
    return result


@app.post("/roles")
def create_role(payload: schemas.RoleCreate, _: bool = Depends(require_permission("roles.write")), db: Session = Depends(get_db)):
    if db.scalar(select(models.Role.id).where(models.Role.name == payload.name)):
        raise HTTPException(400, "role exists")
    role = models.Role(name=payload.name, description=payload.description)
    db.add(role)
    db.flush()
    perm_ids = db.scalars(select(models.Permission.id).where(models.Permission.code.in_(payload.permission_codes))).all()
    for pid in perm_ids:
        db.add(models.RolePermission(role_id=role.id, permission_id=pid))
    db.commit()
    return {"id": role.id}


@app.put("/roles/{role_id}")
def update_role(role_id: int, payload: schemas.RoleUpdate, _: bool = Depends(require_permission("roles.write")), db: Session = Depends(get_db)):
    role = db.get(models.Role, role_id)
    if not role:
        raise HTTPException(404, "role not found")
    if payload.description is not None:
        role.description = payload.description
    if payload.permission_codes is not None:
        db.execute(text("DELETE FROM role_permissions WHERE role_id = :rid"), {"rid": role_id})
        perm_ids = db.scalars(select(models.Permission.id).where(models.Permission.code.in_(payload.permission_codes))).all()
        for pid in perm_ids:
            db.add(models.RolePermission(role_id=role_id, permission_id=pid))
    db.commit()
    return {"status": "ok"}


@app.delete("/roles/{role_id}")
def delete_role(role_id: int, _: bool = Depends(require_permission("roles.write")), db: Session = Depends(get_db)):
    role = db.get(models.Role, role_id)
    if not role:
        raise HTTPException(404, "role not found")
    if role.name == "admin":
        raise HTTPException(400, "cannot delete admin role")
    in_use = db.scalar(select(models.UserRole.id).where(models.UserRole.role_id == role_id).limit(1))
    if in_use:
        raise HTTPException(400, "role is assigned to users")
    db.execute(text("DELETE FROM role_permissions WHERE role_id = :rid"), {"rid": role_id})
    db.delete(role)
    db.commit()
    return {"status": "deleted"}


@app.post("/setup/demo")
def setup_demo(
    _: bool = Depends(require_permission("system.setup")),
    db: Session = Depends(get_db),
):
    if db.scalar(select(models.Warehouse.id)):
        return {"status": "exists"}

    wh = models.Warehouse(code="WH1", name="Main Warehouse")
    db.add(wh)
    db.flush()

    loc = models.Location(warehouse_id=wh.id, code="A-01", name="Rack A-01")
    staging = models.Location(warehouse_id=wh.id, code="STAGE", name="Staging")
    db.add_all([loc, staging])

    m1 = models.Material(sku="SKU-1001", name="Carton Box", unit="pcs", category="pack", is_common=1, is_active=1)
    m2 = models.Material(sku="SKU-1002", name="Bubble Wrap", unit="m", category="pack", is_common=1, is_active=1)
    m3 = models.Material(sku="SKU-2001", name="Widget A", unit="pcs", category="product", is_active=1)
    db.add_all([m1, m2, m3])
    db.commit()

    return {"status": "ok"}


@app.get("/warehouses")
def list_warehouses(_: bool = Depends(require_permission("materials.read")), db: Session = Depends(get_db)):
    return db.scalars(select(models.Warehouse)).all()


@app.post("/warehouses")
def create_warehouse(payload: schemas.WarehouseCreate, _: bool = Depends(require_permission("materials.write")), db: Session = Depends(get_db)):
    wh = models.Warehouse(code=payload.code, name=payload.name)
    db.add(wh)
    db.commit()
    db.refresh(wh)
    return wh


@app.get("/locations")
def list_locations(_: bool = Depends(require_permission("materials.read")), db: Session = Depends(get_db)):
    return db.scalars(select(models.Location)).all()


@app.post("/locations")
def create_location(payload: schemas.LocationCreate, _: bool = Depends(require_permission("materials.write")), db: Session = Depends(get_db)):
    loc = models.Location(
        warehouse_id=payload.warehouse_id,
        code=payload.code,
        name=payload.name,
    )
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return loc


@app.get("/materials")
def list_materials(
    include_inactive: int = Query(0),
    _: bool = Depends(require_permission("materials.read")),
    db: Session = Depends(get_db),
):
    stmt = select(models.Material)
    if not include_inactive:
        stmt = stmt.where(models.Material.is_active == 1)
    return db.scalars(stmt).all()


@app.post("/materials")
def create_material(payload: schemas.MaterialCreate, _: bool = Depends(require_permission("materials.write")), db: Session = Depends(get_db)):
    m = models.Material(
        sku=payload.sku,
        name=payload.name,
        unit=payload.unit,
        category=payload.category,
        is_common=payload.is_common,
        is_active=1,
    )
    db.add(m)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(400, "sku already exists")
    db.refresh(m)
    return m


@app.put("/materials/{material_id}")
def update_material(material_id: int, payload: schemas.MaterialUpdate, _: bool = Depends(require_permission("materials.write")), db: Session = Depends(get_db)):
    m = db.get(models.Material, material_id)
    if not m:
        raise HTTPException(404, "material not found")
    for key, value in payload.model_dump(exclude_none=True).items():
        setattr(m, key, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(400, "sku already exists")
    db.refresh(m)
    return m


@app.delete("/materials/{material_id}")
def delete_material(
    material_id: int,
    force: int = Query(0),
    _: bool = Depends(require_permission("materials.delete")),
    db: Session = Depends(get_db),
):
    m = db.get(models.Material, material_id)
    if not m:
        raise HTTPException(404, "material not found")

    has_inventory = db.scalar(
        select(models.Inventory.id)
        .where(models.Inventory.material_id == material_id)
        .where((models.Inventory.quantity > 0) | (models.Inventory.reserved > 0))
        .limit(1)
    )
    has_orders = db.scalar(
        select(models.OrderLine.id)
        .where(models.OrderLine.material_id == material_id)
        .limit(1)
    )

    if has_inventory or has_orders or not force:
        m.is_active = 0
        db.commit()
        reason = "inventory exists" if has_inventory else "order lines exist" if has_orders else "soft delete by default"
        return {"status": "soft_deleted", "reason": reason}

    db.delete(m)
    db.commit()
    return {"status": "deleted"}


@app.post("/materials/{material_id}/common")
def set_material_common(material_id: int, payload: schemas.MaterialCommonUpdate, _: bool = Depends(require_permission("materials.write")), db: Session = Depends(get_db)):
    m = db.get(models.Material, material_id)
    if not m:
        raise HTTPException(404, "material not found")
    m.is_common = payload.is_common
    db.commit()
    return {"status": "ok"}


@app.get("/inventory")
def list_inventory(_: bool = Depends(require_permission("inventory.read")), db: Session = Depends(get_db)):
    stmt = select(models.Inventory)
    return db.scalars(stmt).all()


@app.post("/inventory/adjust")
def adjust_inventory(payload: schemas.InventoryAdjust, _: bool = Depends(require_permission("inventory.adjust")), db: Session = Depends(get_db)):
    with db.begin():
        inv = db.scalar(
            select(models.Inventory)
            .where(models.Inventory.material_id == payload.material_id)
            .where(models.Inventory.location_id == payload.location_id)
        )
        if not inv:
            inv = models.Inventory(
                material_id=payload.material_id,
                location_id=payload.location_id,
                quantity=0,
                reserved=0,
                version=0,
            )
            db.add(inv)
            db.flush()
        inv.quantity += payload.delta
        inv.version += 1
        if inv.quantity < 0:
            raise HTTPException(400, "inventory cannot be negative")
        db.add(
            models.StockMove(
                material_id=payload.material_id,
                from_location_id=None,
                to_location_id=payload.location_id,
                qty=payload.delta,
                move_type=f"ADJUST:{payload.reason}",
            )
        )
    return {"status": "ok"}


@app.post("/inbounds")
def create_inbound(payload: schemas.InboundCreate, _: bool = Depends(require_permission("orders.write")), db: Session = Depends(get_db)):
    with db.begin():
        order = models.Order(
            order_no=payload.order_no,
            order_type="inbound",
            status="CREATED",
            partner=payload.supplier,
            target_location_id=payload.location_id,
        )
        db.add(order)
        db.flush()
        for line in payload.lines:
            material = db.get(models.Material, line.material_id)
            db.add(
                models.OrderLine(
                    order_id=order.id,
                    material_id=line.material_id,
                    material_sku=material.sku if material else None,
                    material_name=material.name if material else None,
                    qty=line.qty,
                )
            )
    return {"order_id": order.id}


@app.post("/inbounds/{order_id}/receive")
def receive_inbound(order_id: int, _: bool = Depends(require_permission("inbound.receive")), db: Session = Depends(get_db)):
    order = db.get(models.Order, order_id)
    if not order or order.order_type != "inbound":
        raise HTTPException(404, "inbound not found")
    if order.status == "RECEIVED":
        return {"status": "already"}
    with db.begin():
        lines = db.scalars(select(models.OrderLine).where(models.OrderLine.order_id == order_id)).all()
        for line in lines:
            inv = db.scalar(
                select(models.Inventory)
                .where(models.Inventory.material_id == line.material_id)
                .where(models.Inventory.location_id == order.target_location_id)
            )
            if not inv:
                inv = models.Inventory(
                    material_id=line.material_id,
                    location_id=order.target_location_id,
                    quantity=0,
                    reserved=0,
                    version=0,
                )
                db.add(inv)
                db.flush()
            inv.quantity += line.qty
            inv.version += 1
            db.add(
                models.StockMove(
                    material_id=line.material_id,
                    from_location_id=None,
                    to_location_id=order.target_location_id,
                    qty=line.qty,
                    move_type="INBOUND_RECEIVE",
                    ref_id=order.id,
                )
            )
        order.status = "RECEIVED"
    return {"status": "ok"}


@app.post("/outbounds")
def create_outbound(payload: schemas.OutboundCreate, _: bool = Depends(require_permission("orders.write")), db: Session = Depends(get_db)):
    with db.begin():
        order = models.Order(
            order_no=payload.order_no,
            order_type="outbound",
            status="CREATED",
            partner=payload.customer,
            source_location_id=payload.source_location_id,
            target_location_id=payload.staging_location_id,
        )
        db.add(order)
        db.flush()
        for line in payload.lines:
            material = db.get(models.Material, line.material_id)
            db.add(
                models.OrderLine(
                    order_id=order.id,
                    material_id=line.material_id,
                    material_sku=material.sku if material else None,
                    material_name=material.name if material else None,
                    qty=line.qty,
                )
            )
    return {"order_id": order.id}


@app.post("/outbounds/{order_id}/reserve")
def reserve_outbound(order_id: int, payload: schemas.OutboundReserve, _: bool = Depends(require_permission("outbound.reserve")), db: Session = Depends(get_db)):
    order = db.get(models.Order, order_id)
    if not order or order.order_type != "outbound":
        raise HTTPException(404, "outbound not found")
    if order.status not in {"CREATED", "RESERVED"}:
        raise HTTPException(400, "invalid status")

    with db.begin():
        lines = db.scalars(select(models.OrderLine).where(models.OrderLine.order_id == order_id)).all()
        for line in lines:
            inv = db.scalar(
                select(models.Inventory)
                .where(models.Inventory.material_id == line.material_id)
                .where(models.Inventory.location_id == order.source_location_id)
            )
            if not inv:
                raise HTTPException(400, "inventory not found")
            available = inv.quantity - inv.reserved
            if available < line.qty and not payload.force:
                raise HTTPException(400, "insufficient available inventory")
            reserve_qty = min(line.qty, available) if not payload.force else line.qty
            inv.reserved += reserve_qty
            inv.version += 1
            line.reserved_qty = reserve_qty
            db.add(
                models.StockMove(
                    material_id=line.material_id,
                    from_location_id=order.source_location_id,
                    to_location_id=order.source_location_id,
                    qty=reserve_qty,
                    move_type="OUTBOUND_RESERVE",
                    ref_id=order.id,
                )
            )
        order.status = "RESERVED"
    return {"status": "ok"}


@app.post("/outbounds/{order_id}/pick")
def pick_outbound(order_id: int, payload: schemas.OutboundPick, _: bool = Depends(require_permission("outbound.pick")), db: Session = Depends(get_db)):
    order = db.get(models.Order, order_id)
    if not order or order.order_type != "outbound":
        raise HTTPException(404, "outbound not found")
    if order.status != "RESERVED":
        raise HTTPException(400, "invalid status")

    with db.begin():
        lines = db.scalars(select(models.OrderLine).where(models.OrderLine.order_id == order_id)).all()
        for line in lines:
            inv = db.scalar(
                select(models.Inventory)
                .where(models.Inventory.material_id == line.material_id)
                .where(models.Inventory.location_id == order.source_location_id)
            )
            if not inv or inv.reserved < line.reserved_qty:
                raise HTTPException(400, "reserved inventory missing")
            inv.reserved -= line.reserved_qty
            inv.version += 1
            line.picked_qty = line.reserved_qty

            staging_inv = db.scalar(
                select(models.Inventory)
                .where(models.Inventory.material_id == line.material_id)
                .where(models.Inventory.location_id == payload.staging_location_id)
            )
            if not staging_inv:
                staging_inv = models.Inventory(
                    material_id=line.material_id,
                    location_id=payload.staging_location_id,
                    quantity=0,
                    reserved=0,
                    version=0,
                )
                db.add(staging_inv)
                db.flush()
            staging_inv.quantity += line.reserved_qty
            staging_inv.version += 1

            db.add(
                models.StockMove(
                    material_id=line.material_id,
                    from_location_id=order.source_location_id,
                    to_location_id=payload.staging_location_id,
                    qty=line.reserved_qty,
                    move_type="OUTBOUND_PICK",
                    ref_id=order.id,
                )
            )
        order.status = "PICKED"
        order.target_location_id = payload.staging_location_id
    return {"status": "ok"}


@app.post("/outbounds/{order_id}/pack")
def pack_outbound(order_id: int, payload: schemas.OutboundPack, _: bool = Depends(require_permission("outbound.pack")), db: Session = Depends(get_db)):
    order = db.get(models.Order, order_id)
    if not order or order.order_type != "outbound":
        raise HTTPException(404, "outbound not found")
    if order.status != "PICKED":
        raise HTTPException(400, "invalid status")

    with db.begin():
        lines = db.scalars(select(models.OrderLine).where(models.OrderLine.order_id == order_id)).all()
        for line in lines:
            if payload.pack_all:
                line.packed_qty = line.picked_qty
        order.status = "PACKED"
    return {"status": "ok"}


@app.post("/outbounds/{order_id}/ship")
def ship_outbound(order_id: int, payload: schemas.OutboundShip, _: bool = Depends(require_permission("outbound.ship")), db: Session = Depends(get_db)):
    order = db.get(models.Order, order_id)
    if not order or order.order_type != "outbound":
        raise HTTPException(404, "outbound not found")
    if order.status != "PACKED":
        raise HTTPException(400, "invalid status")
    if not order.target_location_id:
        raise HTTPException(400, "missing staging location")

    with db.begin():
        lines = db.scalars(select(models.OrderLine).where(models.OrderLine.order_id == order_id)).all()
        for line in lines:
            qty = line.packed_qty if payload.ship_all else line.packed_qty
            inv = db.scalar(
                select(models.Inventory)
                .where(models.Inventory.material_id == line.material_id)
                .where(models.Inventory.location_id == order.target_location_id)
            )
            if not inv or inv.quantity < qty:
                raise HTTPException(400, "insufficient staging inventory")
            inv.quantity -= qty
            inv.version += 1
            db.add(
                models.StockMove(
                    material_id=line.material_id,
                    from_location_id=order.target_location_id,
                    to_location_id=None,
                    qty=qty,
                    move_type="OUTBOUND_SHIP",
                    ref_id=order.id,
                )
            )
        order.status = "SHIPPED"
    return {"status": "ok"}


@app.get("/orders")
def list_orders(order_type: str | None = Query(default=None), _: bool = Depends(require_permission("orders.read")), db: Session = Depends(get_db)):
    stmt = select(models.Order)
    if order_type:
        stmt = stmt.where(models.Order.order_type == order_type)
    return db.scalars(stmt).all()


@app.get("/orders/{order_id}/lines")
def list_order_lines(order_id: int, _: bool = Depends(require_permission("orders.read")), db: Session = Depends(get_db)):
    lines = db.scalars(select(models.OrderLine).where(models.OrderLine.order_id == order_id)).all()
    result = []
    for line in lines:
        result.append(
            {
                "id": line.id,
                "material_id": line.material_id,
                "material_sku": line.material_sku,
                "material_name": line.material_name,
                "qty": line.qty,
                "reserved_qty": line.reserved_qty,
                "picked_qty": line.picked_qty,
                "packed_qty": line.packed_qty,
            }
        )
    return result


@app.get("/stock_moves")
def list_stock_moves(_: bool = Depends(require_permission("stock_moves.read")), db: Session = Depends(get_db)):
    return db.scalars(select(models.StockMove).order_by(models.StockMove.id.desc())).all()
