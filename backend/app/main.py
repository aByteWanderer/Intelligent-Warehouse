from datetime import datetime, timedelta
import hashlib
import json
import secrets
from contextvars import ContextVar
from contextlib import nullcontext
from fastapi import FastAPI, Depends, HTTPException, Response, Query, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError, OperationalError
from .db import SessionLocal
from . import models, schemas

app = FastAPI(title="WMS Intelligent Warehouse")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def audit_trace_middleware(request: Request, call_next):
    trace_id = request.headers.get("X-Trace-Id") or secrets.token_hex(8)
    request_source = request.headers.get("X-Request-Source")
    if not request_source:
        request_source = request.client.host if request.client else "unknown"
    trace_id_ctx.set(trace_id)
    request_source_ctx.set(request_source)
    response = await call_next(request)
    response.headers["X-Trace-Id"] = trace_id
    return response


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
    "areas.read": "区域查看",
    "areas.write": "区域管理",
    "locations.read": "库位查看",
    "locations.write": "库位管理",
    "containers.read": "容器查看",
    "containers.write": "容器管理",
    "container_moves.read": "容器移动记录查看",
    "container_moves.write": "容器移动操作",
}

trace_id_ctx: ContextVar[str | None] = ContextVar("trace_id", default=None)
request_source_ctx: ContextVar[str | None] = ContextVar("request_source", default=None)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def tx(db: Session):
    # SQLAlchemy 2.0 can auto-begin a transaction on reads; avoid nested begin() errors.
    return db.begin() if not db.in_transaction() else nullcontext()


def request_hash(payload: dict | None) -> str:
    normalized = json.dumps(payload or {}, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def replay_or_lock_idempotency(
    user_id: int,
    method: str,
    path: str,
    key: str | None,
    payload: dict | None,
):
    if not key:
        return None, None
    r_hash = request_hash(payload)
    with SessionLocal() as idb:
        existing = idb.scalar(
            select(models.IdempotencyRecord).where(
                models.IdempotencyRecord.user_id == user_id,
                models.IdempotencyRecord.method == method,
                models.IdempotencyRecord.path == path,
                models.IdempotencyRecord.idempotency_key == key,
            )
        )
        if existing:
            if existing.request_hash != r_hash:
                raise HTTPException(409, "幂等键已被用于不同请求")
            if existing.status_code <= 0:
                raise HTTPException(409, "请求处理中，请稍后重试")
            return json.loads(existing.response_body or "{}"), None
        rec = models.IdempotencyRecord(
            user_id=user_id,
            method=method,
            path=path,
            idempotency_key=key,
            request_hash=r_hash,
            status_code=0,
            response_body=None,
        )
        idb.add(rec)
        try:
            idb.commit()
        except IntegrityError:
            idb.rollback()
            raced = idb.scalar(
                select(models.IdempotencyRecord).where(
                    models.IdempotencyRecord.user_id == user_id,
                    models.IdempotencyRecord.method == method,
                    models.IdempotencyRecord.path == path,
                    models.IdempotencyRecord.idempotency_key == key,
                )
            )
            if raced and raced.request_hash == r_hash and raced.status_code > 0:
                return json.loads(raced.response_body or "{}"), None
            raise HTTPException(409, "重复请求，请稍后重试")
    return None, r_hash


def finalize_idempotency(
    user_id: int,
    method: str,
    path: str,
    key: str | None,
    payload_hash: str | None,
    response_body: dict | None = None,
):
    if not key or not payload_hash:
        return
    with SessionLocal() as idb:
        rec = idb.scalar(
            select(models.IdempotencyRecord).where(
                models.IdempotencyRecord.user_id == user_id,
                models.IdempotencyRecord.method == method,
                models.IdempotencyRecord.path == path,
                models.IdempotencyRecord.idempotency_key == key,
            )
        )
        if not rec:
            return
        rec.request_hash = payload_hash
        rec.status_code = 200
        rec.response_body = json.dumps(response_body or {}, ensure_ascii=False)
        idb.commit()


def release_idempotency_lock(user_id: int, method: str, path: str, key: str | None):
    if not key:
        return
    with SessionLocal() as idb:
        rec = idb.scalar(
            select(models.IdempotencyRecord).where(
                models.IdempotencyRecord.user_id == user_id,
                models.IdempotencyRecord.method == method,
                models.IdempotencyRecord.path == path,
                models.IdempotencyRecord.idempotency_key == key,
                models.IdempotencyRecord.status_code == 0,
            )
        )
        if rec:
            idb.delete(rec)
            idb.commit()


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


def require_any_permission(codes: list[str]):
    def checker(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
        perms = get_user_permissions(db, user.id)
        if not any(code in perms for code in codes):
            raise HTTPException(403, "permission denied")
        return True

    return checker


def migrate_inventory_to_default_containers(db: Session):
    existing_rows = db.scalar(select(models.ContainerInventory.id).limit(1))
    if existing_rows:
        return

    locations = db.scalars(select(models.Location)).all()
    for loc in locations:
        container = db.scalar(select(models.Container).where(models.Container.location_id == loc.id))
        if not container:
            container = models.Container(
                code=f"AUTO-{loc.code}-{loc.id}",
                container_type="AUTO",
                status="BOUND",
                location_id=loc.id,
                description="Auto-generated default container",
            )
            db.add(container)
            db.flush()
        loc.binding_status = "BOUND"

        inv_rows = db.scalars(select(models.Inventory).where(models.Inventory.location_id == loc.id)).all()
        for inv in inv_rows:
            if inv.quantity <= 0 and inv.reserved <= 0:
                continue
            db.add(
                models.ContainerInventory(
                    container_id=container.id,
                    material_id=inv.material_id,
                    quantity=inv.quantity,
                    reserved=inv.reserved,
                    version=0,
                )
            )
    db.commit()


def add_operation_log(
    db: Session,
    module: str,
    action: str,
    entity: str,
    entity_id: int | None,
    detail: str = "",
    user: models.User | None = None,
    before_value: dict | None = None,
    after_value: dict | None = None,
):
    # Keep business APIs available even if audit log storage is temporarily broken.
    try:
        with SessionLocal() as log_db:
            log_db.add(
                models.OperationLog(
                    module=module,
                    action=action,
                    entity=entity,
                    entity_id=entity_id,
                    detail=detail,
                    before_value=json.dumps(before_value, ensure_ascii=False) if before_value is not None else None,
                    after_value=json.dumps(after_value, ensure_ascii=False) if after_value is not None else None,
                    operator=user.username if user else None,
                    request_source=request_source_ctx.get(),
                    trace_id=trace_id_ctx.get(),
                )
            )
            log_db.commit()
    except Exception:
        pass


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
        try:
            seed_permissions_and_admin(db)
            migrate_inventory_to_default_containers(db)
        except OperationalError as exc:
            raise RuntimeError("数据库结构未初始化，请先执行 Alembic 迁移：alembic upgrade head") from exc


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
def create_user(
    payload: schemas.UserCreate,
    _: bool = Depends(require_permission("users.write")),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
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
    add_operation_log(db, "users", "create", "user", user.id, f"username={user.username}", current_user)
    db.commit()
    return {"id": user.id}


@app.put("/users/{user_id}")
def update_user(
    user_id: int,
    payload: schemas.UserUpdate,
    _: bool = Depends(require_permission("users.write")),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
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
    add_operation_log(db, "users", "update", "user", user.id, "user updated", current_user)
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
def create_role(
    payload: schemas.RoleCreate,
    _: bool = Depends(require_permission("roles.write")),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if db.scalar(select(models.Role.id).where(models.Role.name == payload.name)):
        raise HTTPException(400, "role exists")
    role = models.Role(name=payload.name, description=payload.description)
    db.add(role)
    db.flush()
    perm_ids = db.scalars(select(models.Permission.id).where(models.Permission.code.in_(payload.permission_codes))).all()
    for pid in perm_ids:
        db.add(models.RolePermission(role_id=role.id, permission_id=pid))
    add_operation_log(db, "roles", "create", "role", role.id, f"name={role.name}", current_user)
    db.commit()
    return {"id": role.id}


@app.put("/roles/{role_id}")
def update_role(
    role_id: int,
    payload: schemas.RoleUpdate,
    _: bool = Depends(require_permission("roles.write")),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
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
    add_operation_log(db, "roles", "update", "role", role_id, "role updated", current_user)
    db.commit()
    return {"status": "ok"}


@app.delete("/roles/{role_id}")
def delete_role(
    role_id: int,
    _: bool = Depends(require_permission("roles.write")),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
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
    add_operation_log(db, "roles", "delete", "role", role_id, f"name={role.name}", current_user)
    db.commit()
    return {"status": "deleted"}


@app.get("/factories")
def list_factories(_: bool = Depends(require_permission("areas.read")), db: Session = Depends(get_db)):
    return db.scalars(select(models.Factory)).all()


@app.post("/factories")
def create_factory(
    payload: schemas.FactoryCreate,
    _: bool = Depends(require_permission("areas.write")),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    factory = models.Factory(
        code=payload.code.strip(),
        name=payload.name,
        location=payload.location,
        description=payload.description,
        factory_type=payload.factory_type,
        status=payload.status,
    )
    db.add(factory)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(400, "工厂编码已存在")
    add_operation_log(db, "factories", "create", "factory", factory.id, f"code={factory.code}", current_user)
    return factory


@app.put("/factories/{factory_id}")
def update_factory(
    factory_id: int,
    payload: schemas.FactoryUpdate,
    _: bool = Depends(require_permission("areas.write")),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    factory = db.get(models.Factory, factory_id)
    if not factory:
        raise HTTPException(404, "工厂不存在")
    for key, value in payload.model_dump(exclude_none=True).items():
        setattr(factory, key, value)
    db.commit()
    add_operation_log(db, "factories", "update", "factory", factory.id, f"code={factory.code}", current_user)
    return factory


@app.delete("/factories/{factory_id}")
def delete_factory(
    factory_id: int,
    _: bool = Depends(require_permission("areas.write")),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    factory = db.get(models.Factory, factory_id)
    if not factory:
        raise HTTPException(404, "工厂不存在")
    area_exists = db.scalar(select(models.Area.id).where(models.Area.factory_id == factory_id).limit(1))
    if area_exists:
        raise HTTPException(400, "工厂下存在区域，不能删除")
    add_operation_log(db, "factories", "delete", "factory", factory.id, f"code={factory.code}", current_user)
    db.delete(factory)
    db.commit()
    return {"status": "deleted"}


@app.get("/areas")
def list_areas(_: bool = Depends(require_permission("areas.read")), db: Session = Depends(get_db)):
    return db.scalars(select(models.Area)).all()


@app.post("/areas")
def create_area(
    payload: schemas.AreaCreate,
    _: bool = Depends(require_permission("areas.write")),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    area = models.Area(
        code=payload.code.strip(),
        name=payload.name,
        material_type=payload.material_type,
        factory_id=payload.factory_id,
        status=payload.status,
        description=payload.description,
    )
    db.add(area)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(400, "区域编码已存在")
    add_operation_log(db, "areas", "create", "area", area.id, f"code={area.code}", current_user)
    return area


@app.put("/areas/{area_id}")
def update_area(
    area_id: int,
    payload: schemas.AreaUpdate,
    _: bool = Depends(require_permission("areas.write")),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    area = db.get(models.Area, area_id)
    if not area:
        raise HTTPException(404, "区域不存在")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(area, key, value)
    db.commit()
    add_operation_log(db, "areas", "update", "area", area.id, f"code={area.code}", current_user)
    return area


@app.delete("/areas/{area_id}")
def delete_area(
    area_id: int,
    _: bool = Depends(require_permission("areas.write")),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    area = db.get(models.Area, area_id)
    if not area:
        raise HTTPException(404, "区域不存在")
    loc_exists = db.scalar(select(models.Location.id).where(models.Location.area_id == area_id).limit(1))
    if loc_exists:
        raise HTTPException(400, "区域下存在库位，不能删除")
    add_operation_log(db, "areas", "delete", "area", area.id, f"code={area.code}", current_user)
    db.delete(area)
    db.commit()
    return {"status": "deleted"}


@app.get("/containers")
def list_containers(_: bool = Depends(require_permission("containers.read")), db: Session = Depends(get_db)):
    return db.scalars(select(models.Container).order_by(models.Container.id.desc())).all()


@app.post("/containers")
def create_container(
    payload: schemas.ContainerCreate,
    _: bool = Depends(require_permission("containers.write")),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    bind_location = None
    if payload.location_id:
        bind_location = db.get(models.Location, payload.location_id)
        if not bind_location:
            raise HTTPException(404, "库位不存在")
        if bind_location.status != "ACTIVE":
            raise HTTPException(400, "库位不是可用状态")
        occupied = db.scalar(select(models.Container.id).where(models.Container.location_id == payload.location_id).limit(1))
        if occupied:
            raise HTTPException(400, "库位已绑定其他容器")

    try:
        with tx(db):
            container = models.Container(
                code=payload.code.strip(),
                container_type=payload.container_type,
                status="BOUND" if payload.location_id else "UNBOUND",
                location_id=payload.location_id,
                description=payload.description,
            )
            db.add(container)
            db.flush()
            if bind_location:
                bind_location.binding_status = "BOUND"
                db.add(
                    models.ContainerMove(
                        container_id=container.id,
                        from_location_id=None,
                        to_location_id=payload.location_id,
                        operator=current_user.username,
                        note="bind_on_create",
                    )
                )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(400, "容器编码已存在")
    add_operation_log(db, "containers", "create", "container", container.id, f"code={container.code}", current_user)
    return container


@app.put("/containers/{container_id}")
def update_container(
    container_id: int,
    payload: schemas.ContainerUpdate,
    _: bool = Depends(require_permission("containers.write")),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    container = db.get(models.Container, container_id)
    if not container:
        raise HTTPException(404, "容器不存在")
    for key, value in payload.model_dump(exclude_none=True).items():
        setattr(container, key, value)
    db.commit()
    add_operation_log(db, "containers", "update", "container", container.id, f"code={container.code}", current_user)
    return container


@app.delete("/containers/{container_id}")
def delete_container(
    container_id: int,
    _: bool = Depends(require_permission("containers.write")),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    container = db.get(models.Container, container_id)
    if not container:
        raise HTTPException(404, "容器不存在")
    if container.location_id:
        raise HTTPException(400, "容器已绑定库位，不能删除")
    has_stock = db.scalar(
        select(models.ContainerInventory.id)
        .where(models.ContainerInventory.container_id == container_id)
        .where((models.ContainerInventory.quantity > 0) | (models.ContainerInventory.reserved > 0))
        .limit(1)
    )
    if has_stock:
        raise HTTPException(400, "容器中仍有库存，不能删除")
    db.execute(text("DELETE FROM container_inventory WHERE container_id = :cid"), {"cid": container_id})
    add_operation_log(db, "containers", "delete", "container", container.id, f"code={container.code}", current_user)
    db.delete(container)
    db.commit()
    return {"status": "deleted"}


@app.get("/container_inventory")
def list_container_inventory(_: bool = Depends(require_permission("containers.read")), db: Session = Depends(get_db)):
    return db.scalars(select(models.ContainerInventory)).all()


@app.get("/container_moves")
def list_container_moves(_: bool = Depends(require_permission("container_moves.read")), db: Session = Depends(get_db)):
    return db.scalars(select(models.ContainerMove).order_by(models.ContainerMove.id.desc())).all()


@app.post("/containers/{container_id}/bind")
def bind_container(
    container_id: int,
    payload: schemas.ContainerBind,
    _: bool = Depends(require_permission("containers.write")),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    container = db.get(models.Container, container_id)
    if not container:
        raise HTTPException(404, "容器不存在")
    location = db.get(models.Location, payload.location_id)
    if not location:
        raise HTTPException(404, "库位不存在")
    if location.status != "ACTIVE":
        raise HTTPException(400, "库位不是可用状态")
    occupied = db.scalar(select(models.Container.id).where(models.Container.location_id == payload.location_id))
    if occupied and occupied != container.id:
        raise HTTPException(400, "库位已绑定其他容器")

    from_location_id = container.location_id
    container.location_id = payload.location_id
    container.status = "BOUND"
    location.binding_status = "BOUND"
    if from_location_id and from_location_id != payload.location_id:
        old_loc = db.get(models.Location, from_location_id)
        if old_loc:
            old_loc.binding_status = "UNBOUND"
    db.add(
        models.ContainerMove(
            container_id=container.id,
            from_location_id=from_location_id,
            to_location_id=payload.location_id,
            operator=current_user.username,
            note="bind",
        )
    )
    db.commit()
    add_operation_log(db, "containers", "bind", "container", container.id, f"location_id={payload.location_id}", current_user)
    return {"status": "ok"}


@app.post("/containers/{container_id}/unbind")
def unbind_container(
    container_id: int,
    _: bool = Depends(require_permission("containers.write")),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    container = db.get(models.Container, container_id)
    if not container:
        raise HTTPException(404, "容器不存在")
    from_location_id = container.location_id
    if not from_location_id:
        return {"status": "already"}
    old_loc = db.get(models.Location, from_location_id)
    if old_loc:
        old_loc.binding_status = "UNBOUND"
    container.location_id = None
    container.status = "UNBOUND"
    db.add(
        models.ContainerMove(
            container_id=container.id,
            from_location_id=from_location_id,
            to_location_id=None,
            operator=current_user.username,
            note="unbind",
        )
    )
    db.commit()
    add_operation_log(db, "containers", "unbind", "container", container.id, f"from_location_id={from_location_id}", current_user)
    return {"status": "ok"}


@app.post("/containers/{container_id}/move")
def move_container(
    container_id: int,
    payload: schemas.ContainerMove,
    _: bool = Depends(require_permission("container_moves.write")),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    container = db.get(models.Container, container_id)
    if not container:
        raise HTTPException(404, "容器不存在")
    if not container.location_id:
        raise HTTPException(400, "容器未绑定库位，无法移动")
    from_loc = db.get(models.Location, container.location_id)
    to_loc = db.get(models.Location, payload.to_location_id)
    if not to_loc:
        raise HTTPException(404, "目标库位不存在")
    if to_loc.status != "ACTIVE":
        raise HTTPException(400, "目标库位不可用")
    occupied = db.scalar(select(models.Container.id).where(models.Container.location_id == payload.to_location_id))
    if occupied and occupied != container.id:
        raise HTTPException(400, "目标库位已绑定容器")

    container.location_id = payload.to_location_id
    container.status = "BOUND"
    if from_loc:
        from_loc.binding_status = "UNBOUND"
    to_loc.binding_status = "BOUND"
    db.add(
        models.ContainerMove(
            container_id=container.id,
            from_location_id=from_loc.id if from_loc else None,
            to_location_id=to_loc.id,
            operator=current_user.username,
            note=payload.note or "move",
        )
    )
    db.commit()
    add_operation_log(db, "containers", "move", "container", container.id, f"{from_loc.id if from_loc else '-'}->{to_loc.id}", current_user)
    return {"status": "ok"}


@app.post("/containers/{container_id}/stock/adjust")
def adjust_container_stock(
    container_id: int,
    payload: schemas.ContainerStockAdjust,
    _: bool = Depends(require_permission("inventory.adjust")),
    current_user: models.User = Depends(get_current_user),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
):
    replay, p_hash = replay_or_lock_idempotency(
        current_user.id,
        "POST",
        f"/containers/{container_id}/stock/adjust",
        idempotency_key,
        payload.model_dump(),
    )
    if replay is not None:
        return replay
    container = db.get(models.Container, container_id)
    if not container:
        release_idempotency_lock(current_user.id, "POST", f"/containers/{container_id}/stock/adjust", idempotency_key)
        raise HTTPException(404, "容器不存在")
    if not container.location_id:
        release_idempotency_lock(current_user.id, "POST", f"/containers/{container_id}/stock/adjust", idempotency_key)
        raise HTTPException(400, "容器未绑定库位，不能存放物料")

    try:
        with tx(db):
            row = db.scalar(
                select(models.ContainerInventory)
                .where(models.ContainerInventory.container_id == container_id)
                .where(models.ContainerInventory.material_id == payload.material_id)
            )
            if not row:
                row = models.ContainerInventory(container_id=container_id, material_id=payload.material_id, quantity=0, reserved=0, version=0)
                db.add(row)
                db.flush()
            row.quantity += payload.delta
            row.version += 1
            if row.quantity < 0:
                raise HTTPException(400, "容器库存不能小于0")

            inv = db.scalar(
                select(models.Inventory)
                .where(models.Inventory.material_id == payload.material_id)
                .where(models.Inventory.location_id == container.location_id)
            )
            if not inv:
                inv = models.Inventory(
                    material_id=payload.material_id,
                    location_id=container.location_id,
                    quantity=0,
                    reserved=0,
                    version=0,
                )
                db.add(inv)
                db.flush()
            inv.quantity += payload.delta
            inv.version += 1
            if inv.quantity < 0:
                raise HTTPException(400, "库位库存不能小于0")

            db.add(
                models.StockMove(
                    material_id=payload.material_id,
                    from_location_id=None,
                    to_location_id=container.location_id,
                    qty=payload.delta,
                    move_type=f"CONTAINER_ADJUST:{payload.reason}",
                    operator=current_user.username,
                )
            )
        db.commit()
    except Exception:
        release_idempotency_lock(current_user.id, "POST", f"/containers/{container_id}/stock/adjust", idempotency_key)
        raise
    add_operation_log(
        db,
        "containers",
        "stock_adjust",
        "container",
        container_id,
        f"material_id={payload.material_id},delta={payload.delta},reason={payload.reason}",
        current_user,
        after_value={"container_id": container_id, "material_id": payload.material_id, "delta": payload.delta},
    )
    response = {"status": "ok"}
    finalize_idempotency(
        current_user.id,
        "POST",
        f"/containers/{container_id}/stock/adjust",
        idempotency_key,
        p_hash,
        response,
    )
    return response


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
def list_warehouses(_: bool = Depends(require_any_permission(["locations.read", "locations.write", "materials.read"])), db: Session = Depends(get_db)):
    return db.scalars(select(models.Warehouse)).all()


@app.post("/warehouses")
def create_warehouse(payload: schemas.WarehouseCreate, _: bool = Depends(require_any_permission(["locations.write", "materials.write"])), db: Session = Depends(get_db)):
    wh = models.Warehouse(code=payload.code.strip(), name=payload.name)
    db.add(wh)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(400, "仓库编码已存在")
    db.refresh(wh)
    return wh


@app.put("/warehouses/{warehouse_id}")
def update_warehouse(
    warehouse_id: int,
    payload: schemas.WarehouseUpdate,
    _: bool = Depends(require_permission("locations.write")),
    db: Session = Depends(get_db),
):
    wh = db.get(models.Warehouse, warehouse_id)
    if not wh:
        raise HTTPException(404, "仓库不存在")
    if payload.name is None:
        raise HTTPException(400, "没有可更新字段")
    wh.name = payload.name
    db.commit()
    db.refresh(wh)
    return wh


@app.delete("/warehouses/{warehouse_id}")
def delete_warehouse(
    warehouse_id: int,
    _: bool = Depends(require_permission("locations.write")),
    db: Session = Depends(get_db),
):
    wh = db.get(models.Warehouse, warehouse_id)
    if not wh:
        raise HTTPException(404, "仓库不存在")
    linked_location = db.scalar(select(models.Location.id).where(models.Location.warehouse_id == warehouse_id).limit(1))
    if linked_location:
        raise HTTPException(400, "仓库下存在库位，不能删除")
    db.delete(wh)
    db.commit()
    return {"status": "deleted"}


@app.get("/locations")
def list_locations(_: bool = Depends(require_any_permission(["locations.read", "materials.read"])), db: Session = Depends(get_db)):
    return db.scalars(select(models.Location)).all()


@app.post("/locations")
def create_location(payload: schemas.LocationCreate, _: bool = Depends(require_permission("locations.write")), db: Session = Depends(get_db)):
    warehouse = db.get(models.Warehouse, payload.warehouse_id)
    if not warehouse:
        raise HTTPException(400, "仓库不存在")
    area = db.get(models.Area, payload.area_id)
    if not area:
        raise HTTPException(400, "区域不存在")
    exists = db.scalar(select(models.Location.id).where(models.Location.code == payload.code.strip()).limit(1))
    if exists:
        raise HTTPException(400, "库位编号已存在")
    loc = models.Location(
        warehouse_id=payload.warehouse_id,
        area_id=area.id,
        code=payload.code.strip(),
        name=payload.name,
        status=payload.status,
        binding_status="UNBOUND",
    )
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return loc


@app.put("/locations/{location_id}")
def update_location(
    location_id: int,
    payload: schemas.LocationUpdate,
    _: bool = Depends(require_permission("locations.write")),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    loc = db.get(models.Location, location_id)
    if not loc:
        raise HTTPException(404, "库位不存在")
    if payload.name is None and payload.area_id is None and payload.status is None:
        raise HTTPException(400, "没有可更新字段")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(loc, key, value)
    db.commit()
    add_operation_log(db, "locations", "update", "location", loc.id, f"code={loc.code}", current_user)
    return loc


@app.delete("/locations/{location_id}")
def delete_location(
    location_id: int,
    _: bool = Depends(require_permission("locations.write")),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    loc = db.get(models.Location, location_id)
    if not loc:
        raise HTTPException(404, "库位不存在")
    container = db.scalar(select(models.Container.id).where(models.Container.location_id == location_id).limit(1))
    if container:
        raise HTTPException(400, "库位已绑定容器，不能删除")
    inv = db.scalar(
        select(models.Inventory.id)
        .where(models.Inventory.location_id == location_id)
        .where((models.Inventory.quantity > 0) | (models.Inventory.reserved > 0))
        .limit(1)
    )
    if inv:
        raise HTTPException(400, "库位存在库存，不能删除")
    add_operation_log(db, "locations", "delete", "location", loc.id, f"code={loc.code}", current_user)
    db.delete(loc)
    db.commit()
    return {"status": "deleted"}


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
def create_material(
    payload: schemas.MaterialCreate,
    _: bool = Depends(require_permission("materials.write")),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
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
    add_operation_log(db, "materials", "create", "material", m.id, f"sku={m.sku}", current_user)
    db.commit()
    return m


@app.put("/materials/{material_id}")
def update_material(
    material_id: int,
    payload: schemas.MaterialUpdate,
    _: bool = Depends(require_permission("materials.write")),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
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
    add_operation_log(db, "materials", "update", "material", m.id, f"sku={m.sku}", current_user)
    db.commit()
    return m


@app.delete("/materials/{material_id}")
def delete_material(
    material_id: int,
    force: int = Query(0),
    _: bool = Depends(require_permission("materials.delete")),
    current_user: models.User = Depends(get_current_user),
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
        add_operation_log(db, "materials", "deactivate", "material", m.id, f"sku={m.sku}", current_user)
        db.commit()
        reason = "inventory exists" if has_inventory else "order lines exist" if has_orders else "soft delete by default"
        return {"status": "soft_deleted", "reason": reason}

    add_operation_log(db, "materials", "delete", "material", m.id, f"sku={m.sku}", current_user)
    db.delete(m)
    db.commit()
    return {"status": "deleted"}


@app.post("/materials/{material_id}/common")
def set_material_common(
    material_id: int,
    payload: schemas.MaterialCommonUpdate,
    _: bool = Depends(require_permission("materials.write")),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    m = db.get(models.Material, material_id)
    if not m:
        raise HTTPException(404, "material not found")
    m.is_common = payload.is_common
    add_operation_log(db, "materials", "set_common", "material", m.id, f"is_common={m.is_common}", current_user)
    db.commit()
    return {"status": "ok"}


@app.get("/inventory")
def list_inventory(_: bool = Depends(require_permission("inventory.read")), db: Session = Depends(get_db)):
    stmt = select(models.Inventory)
    return db.scalars(stmt).all()


@app.post("/inventory/adjust")
def adjust_inventory(
    payload: schemas.InventoryAdjust,
    _: bool = Depends(require_permission("inventory.adjust")),
    current_user: models.User = Depends(get_current_user),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
):
    replay, p_hash = replay_or_lock_idempotency(
        current_user.id,
        "POST",
        "/inventory/adjust",
        idempotency_key,
        payload.model_dump(),
    )
    if replay is not None:
        return replay
    bound_container = db.scalar(select(models.Container.id).where(models.Container.location_id == payload.location_id).limit(1))
    if bound_container:
        release_idempotency_lock(current_user.id, "POST", "/inventory/adjust", idempotency_key)
        raise HTTPException(400, "该库位已绑定容器，请使用容器库存维护")
    try:
        with tx(db):
            inv = db.scalar(
                select(models.Inventory)
                .where(models.Inventory.material_id == payload.material_id)
                .where(models.Inventory.location_id == payload.location_id)
            )
            before_qty = inv.quantity if inv else 0
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
                    operator=current_user.username,
                )
            )
            add_operation_log(
                db,
                "inventory",
                "adjust",
                "inventory",
                inv.id,
                f"material_id={payload.material_id},delta={payload.delta},reason={payload.reason}",
                current_user,
                before_value={"quantity": before_qty},
                after_value={"quantity": inv.quantity},
            )
        db.commit()
    except Exception:
        release_idempotency_lock(current_user.id, "POST", "/inventory/adjust", idempotency_key)
        raise
    response = {"status": "ok"}
    finalize_idempotency(current_user.id, "POST", "/inventory/adjust", idempotency_key, p_hash, response)
    return response


@app.post("/inbounds")
def create_inbound(
    payload: schemas.InboundCreate,
    _: bool = Depends(require_permission("orders.write")),
    current_user: models.User = Depends(get_current_user),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
):
    replay, p_hash = replay_or_lock_idempotency(
        current_user.id,
        "POST",
        "/inbounds",
        idempotency_key,
        payload.model_dump(),
    )
    if replay is not None:
        return replay
    try:
        with tx(db):
            order = models.Order(
                order_no=payload.order_no.strip(),
                order_type="inbound",
                status="CREATED",
                partner=payload.supplier,
                created_by=current_user.username,
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
            add_operation_log(db, "inbound", "create", "order", order.id, f"order_no={order.order_no}", current_user)
        db.commit()
    except IntegrityError:
        db.rollback()
        release_idempotency_lock(current_user.id, "POST", "/inbounds", idempotency_key)
        raise HTTPException(400, "入库单号已存在，请使用新的单号")
    except HTTPException:
        db.rollback()
        release_idempotency_lock(current_user.id, "POST", "/inbounds", idempotency_key)
        raise
    except Exception:
        db.rollback()
        release_idempotency_lock(current_user.id, "POST", "/inbounds", idempotency_key)
        raise
    response = {"order_id": order.id}
    finalize_idempotency(current_user.id, "POST", "/inbounds", idempotency_key, p_hash, response)
    return response


@app.post("/inbounds/{order_id}/receive")
def receive_inbound(
    order_id: int,
    _: bool = Depends(require_permission("inbound.receive")),
    current_user: models.User = Depends(get_current_user),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
):
    replay, p_hash = replay_or_lock_idempotency(
        current_user.id,
        "POST",
        f"/inbounds/{order_id}/receive",
        idempotency_key,
        {},
    )
    if replay is not None:
        return replay
    order = db.get(models.Order, order_id)
    if not order or order.order_type != "inbound":
        release_idempotency_lock(current_user.id, "POST", f"/inbounds/{order_id}/receive", idempotency_key)
        raise HTTPException(404, "inbound not found")
    if order.status == "RECEIVED":
        response = {"status": "already"}
        finalize_idempotency(current_user.id, "POST", f"/inbounds/{order_id}/receive", idempotency_key, p_hash, response)
        return response
    try:
        with tx(db):
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
                        operator=current_user.username,
                        ref_id=order.id,
                    )
                )
            order.status = "RECEIVED"
            add_operation_log(
                db,
                "inbound",
                "receive",
                "order",
                order.id,
                f"order_no={order.order_no}",
                current_user,
                before_value={"status": "CREATED"},
                after_value={"status": "RECEIVED"},
            )
        db.commit()
    except Exception:
        release_idempotency_lock(current_user.id, "POST", f"/inbounds/{order_id}/receive", idempotency_key)
        raise
    response = {"status": "ok"}
    finalize_idempotency(current_user.id, "POST", f"/inbounds/{order_id}/receive", idempotency_key, p_hash, response)
    return response


@app.post("/outbounds")
def create_outbound(
    payload: schemas.OutboundCreate,
    _: bool = Depends(require_permission("orders.write")),
    current_user: models.User = Depends(get_current_user),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
):
    replay, p_hash = replay_or_lock_idempotency(
        current_user.id,
        "POST",
        "/outbounds",
        idempotency_key,
        payload.model_dump(),
    )
    if replay is not None:
        return replay
    try:
        with tx(db):
            order = models.Order(
                order_no=payload.order_no.strip(),
                order_type="outbound",
                status="CREATED",
                partner=payload.customer,
                created_by=current_user.username,
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
            add_operation_log(db, "outbound", "create", "order", order.id, f"order_no={order.order_no}", current_user)
        db.commit()
    except IntegrityError:
        db.rollback()
        release_idempotency_lock(current_user.id, "POST", "/outbounds", idempotency_key)
        raise HTTPException(400, "出库单号已存在，请使用新的单号")
    except HTTPException:
        db.rollback()
        release_idempotency_lock(current_user.id, "POST", "/outbounds", idempotency_key)
        raise
    except Exception:
        db.rollback()
        release_idempotency_lock(current_user.id, "POST", "/outbounds", idempotency_key)
        raise
    response = {"order_id": order.id}
    finalize_idempotency(current_user.id, "POST", "/outbounds", idempotency_key, p_hash, response)
    return response


@app.post("/outbounds/{order_id}/reserve")
def reserve_outbound(
    order_id: int,
    payload: schemas.OutboundReserve,
    _: bool = Depends(require_permission("outbound.reserve")),
    current_user: models.User = Depends(get_current_user),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
):
    replay, p_hash = replay_or_lock_idempotency(
        current_user.id,
        "POST",
        f"/outbounds/{order_id}/reserve",
        idempotency_key,
        payload.model_dump(),
    )
    if replay is not None:
        return replay
    order = db.get(models.Order, order_id)
    if not order or order.order_type != "outbound":
        release_idempotency_lock(current_user.id, "POST", f"/outbounds/{order_id}/reserve", idempotency_key)
        raise HTTPException(404, "出库单不存在")
    if order.status not in {"CREATED", "RESERVED"}:
        release_idempotency_lock(current_user.id, "POST", f"/outbounds/{order_id}/reserve", idempotency_key)
        raise HTTPException(400, "当前状态不允许预留")

    try:
        with tx(db):
            lines = db.scalars(select(models.OrderLine).where(models.OrderLine.order_id == order_id)).all()
            for line in lines:
                inv = db.scalar(
                    select(models.Inventory)
                    .where(models.Inventory.material_id == line.material_id)
                    .where(models.Inventory.location_id == order.source_location_id)
                )
                if not inv:
                    raise HTTPException(400, "源库位无对应库存")
                available = inv.quantity - inv.reserved
                if available < line.qty and not payload.force:
                    raise HTTPException(400, "可用库存不足，无法预留")
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
                        operator=current_user.username,
                        ref_id=order.id,
                    )
                )
            order.status = "RESERVED"
            add_operation_log(
                db,
                "outbound",
                "reserve",
                "order",
                order.id,
                f"order_no={order.order_no}",
                current_user,
                before_value={"status": "CREATED"},
                after_value={"status": "RESERVED"},
            )
        db.commit()
    except Exception:
        release_idempotency_lock(current_user.id, "POST", f"/outbounds/{order_id}/reserve", idempotency_key)
        raise
    response = {"status": "ok"}
    finalize_idempotency(current_user.id, "POST", f"/outbounds/{order_id}/reserve", idempotency_key, p_hash, response)
    return response


@app.post("/outbounds/{order_id}/pick")
def pick_outbound(
    order_id: int,
    payload: schemas.OutboundPick,
    _: bool = Depends(require_permission("outbound.pick")),
    current_user: models.User = Depends(get_current_user),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
):
    replay, p_hash = replay_or_lock_idempotency(
        current_user.id,
        "POST",
        f"/outbounds/{order_id}/pick",
        idempotency_key,
        payload.model_dump(),
    )
    if replay is not None:
        return replay
    order = db.get(models.Order, order_id)
    if not order or order.order_type != "outbound":
        release_idempotency_lock(current_user.id, "POST", f"/outbounds/{order_id}/pick", idempotency_key)
        raise HTTPException(404, "出库单不存在")
    if order.status != "RESERVED":
        release_idempotency_lock(current_user.id, "POST", f"/outbounds/{order_id}/pick", idempotency_key)
        raise HTTPException(400, "当前状态不允许分拣")

    try:
        with tx(db):
            lines = db.scalars(select(models.OrderLine).where(models.OrderLine.order_id == order_id)).all()
            for line in lines:
                inv = db.scalar(
                    select(models.Inventory)
                    .where(models.Inventory.material_id == line.material_id)
                    .where(models.Inventory.location_id == order.source_location_id)
                )
                if not inv or inv.reserved < line.reserved_qty:
                    raise HTTPException(400, "预留库存不足，无法分拣")
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
                        operator=current_user.username,
                        ref_id=order.id,
                    )
                )
            order.status = "PICKED"
            order.target_location_id = payload.staging_location_id
            add_operation_log(
                db,
                "outbound",
                "pick",
                "order",
                order.id,
                f"order_no={order.order_no}",
                current_user,
                before_value={"status": "RESERVED"},
                after_value={"status": "PICKED"},
            )
        db.commit()
    except Exception:
        release_idempotency_lock(current_user.id, "POST", f"/outbounds/{order_id}/pick", idempotency_key)
        raise
    response = {"status": "ok"}
    finalize_idempotency(current_user.id, "POST", f"/outbounds/{order_id}/pick", idempotency_key, p_hash, response)
    return response


@app.post("/outbounds/{order_id}/pack")
def pack_outbound(
    order_id: int,
    payload: schemas.OutboundPack,
    _: bool = Depends(require_permission("outbound.pack")),
    current_user: models.User = Depends(get_current_user),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
):
    replay, p_hash = replay_or_lock_idempotency(
        current_user.id,
        "POST",
        f"/outbounds/{order_id}/pack",
        idempotency_key,
        payload.model_dump(),
    )
    if replay is not None:
        return replay
    order = db.get(models.Order, order_id)
    if not order or order.order_type != "outbound":
        release_idempotency_lock(current_user.id, "POST", f"/outbounds/{order_id}/pack", idempotency_key)
        raise HTTPException(404, "出库单不存在")
    if order.status != "PICKED":
        release_idempotency_lock(current_user.id, "POST", f"/outbounds/{order_id}/pack", idempotency_key)
        raise HTTPException(400, "当前状态不允许打包")

    try:
        with tx(db):
            lines = db.scalars(select(models.OrderLine).where(models.OrderLine.order_id == order_id)).all()
            for line in lines:
                if payload.pack_all:
                    line.packed_qty = line.picked_qty
            order.status = "PACKED"
            add_operation_log(
                db,
                "outbound",
                "pack",
                "order",
                order.id,
                f"order_no={order.order_no}",
                current_user,
                before_value={"status": "PICKED"},
                after_value={"status": "PACKED"},
            )
        db.commit()
    except Exception:
        release_idempotency_lock(current_user.id, "POST", f"/outbounds/{order_id}/pack", idempotency_key)
        raise
    response = {"status": "ok"}
    finalize_idempotency(current_user.id, "POST", f"/outbounds/{order_id}/pack", idempotency_key, p_hash, response)
    return response


@app.post("/outbounds/{order_id}/ship")
def ship_outbound(
    order_id: int,
    payload: schemas.OutboundShip,
    _: bool = Depends(require_permission("outbound.ship")),
    current_user: models.User = Depends(get_current_user),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
):
    replay, p_hash = replay_or_lock_idempotency(
        current_user.id,
        "POST",
        f"/outbounds/{order_id}/ship",
        idempotency_key,
        payload.model_dump(),
    )
    if replay is not None:
        return replay
    order = db.get(models.Order, order_id)
    if not order or order.order_type != "outbound":
        release_idempotency_lock(current_user.id, "POST", f"/outbounds/{order_id}/ship", idempotency_key)
        raise HTTPException(404, "出库单不存在")
    if order.status != "PACKED":
        release_idempotency_lock(current_user.id, "POST", f"/outbounds/{order_id}/ship", idempotency_key)
        raise HTTPException(400, "当前状态不允许出库")
    if not order.target_location_id:
        release_idempotency_lock(current_user.id, "POST", f"/outbounds/{order_id}/ship", idempotency_key)
        raise HTTPException(400, "缺少暂存库位")

    try:
        with tx(db):
            lines = db.scalars(select(models.OrderLine).where(models.OrderLine.order_id == order_id)).all()
            for line in lines:
                qty = line.packed_qty if payload.ship_all else line.packed_qty
                inv = db.scalar(
                    select(models.Inventory)
                    .where(models.Inventory.material_id == line.material_id)
                    .where(models.Inventory.location_id == order.target_location_id)
                )
                if not inv or inv.quantity < qty:
                    raise HTTPException(400, "暂存库位库存不足")
                inv.quantity -= qty
                inv.version += 1
                db.add(
                    models.StockMove(
                        material_id=line.material_id,
                        from_location_id=order.target_location_id,
                        to_location_id=None,
                        qty=qty,
                        move_type="OUTBOUND_SHIP",
                        operator=current_user.username,
                        ref_id=order.id,
                    )
                )
            order.status = "SHIPPED"
            add_operation_log(
                db,
                "outbound",
                "ship",
                "order",
                order.id,
                f"order_no={order.order_no}",
                current_user,
                before_value={"status": "PACKED"},
                after_value={"status": "SHIPPED"},
            )
        db.commit()
    except Exception:
        release_idempotency_lock(current_user.id, "POST", f"/outbounds/{order_id}/ship", idempotency_key)
        raise
    response = {"status": "ok"}
    finalize_idempotency(current_user.id, "POST", f"/outbounds/{order_id}/ship", idempotency_key, p_hash, response)
    return response


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


@app.get("/operation_logs")
def list_operation_logs(_: bool = Depends(require_permission("stock_moves.read")), db: Session = Depends(get_db)):
    return db.scalars(select(models.OperationLog).order_by(models.OperationLog.id.desc())).all()
