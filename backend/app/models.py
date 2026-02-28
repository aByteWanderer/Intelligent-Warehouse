from datetime import datetime
from sqlalchemy import String, Integer, ForeignKey, DateTime, UniqueConstraint, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base


class Warehouse(Base):
    __tablename__ = "warehouses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    factory_id: Mapped[int | None] = mapped_column(ForeignKey("factories.id"), nullable=True, index=True)

    locations: Mapped[list["Location"]] = relationship(back_populates="warehouse")


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id"), index=True)
    area_id: Mapped[int | None] = mapped_column(ForeignKey("areas.id"), nullable=True, index=True)
    code: Mapped[str] = mapped_column(String(32), index=True)
    name: Mapped[str] = mapped_column(String(128))
    status: Mapped[str] = mapped_column(String(32), default="ACTIVE")
    binding_status: Mapped[str] = mapped_column(String(32), default="UNBOUND")

    warehouse: Mapped[Warehouse] = relationship(back_populates="locations")


class Material(Base):
    __tablename__ = "materials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sku: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    unit: Mapped[str] = mapped_column(String(16), default="pcs")
    category: Mapped[str] = mapped_column(String(64), default="general")
    is_common: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[int] = mapped_column(Integer, default=1)


class Inventory(Base):
    __tablename__ = "inventory"
    __table_args__ = (UniqueConstraint("material_id", "location_id", name="uq_inventory_material_location"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    material_id: Mapped[int] = mapped_column(ForeignKey("materials.id"), index=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"), index=True)
    quantity: Mapped[int] = mapped_column(Integer, default=0)
    reserved: Mapped[int] = mapped_column(Integer, default=0)
    version: Mapped[int] = mapped_column(Integer, default=0)

    material: Mapped[Material] = relationship()
    location: Mapped[Location] = relationship()


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_no: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    order_type: Mapped[str] = mapped_column(String(16))  # inbound | outbound
    status: Mapped[str] = mapped_column(String(32), default="CREATED")
    partner: Mapped[str] = mapped_column(String(128), default="")
    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source_location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id"), nullable=True)
    target_location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class OrderLine(Base):
    __tablename__ = "order_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    material_id: Mapped[int] = mapped_column(ForeignKey("materials.id"), index=True)
    material_sku: Mapped[str | None] = mapped_column(String(64), nullable=True)
    material_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    qty: Mapped[int] = mapped_column(Integer)
    reserved_qty: Mapped[int] = mapped_column(Integer, default=0)
    picked_qty: Mapped[int] = mapped_column(Integer, default=0)
    packed_qty: Mapped[int] = mapped_column(Integer, default=0)

    material: Mapped[Material] = relationship()
    order: Mapped[Order] = relationship()


class StockMove(Base):
    __tablename__ = "stock_moves"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    material_id: Mapped[int] = mapped_column(ForeignKey("materials.id"), index=True)
    from_location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id"), nullable=True)
    to_location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id"), nullable=True)
    qty: Mapped[int] = mapped_column(Integer)
    move_type: Mapped[str] = mapped_column(String(32))
    operator: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ref_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class OperationLog(Base):
    __tablename__ = "operation_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    module: Mapped[str] = mapped_column(String(64), index=True)
    action: Mapped[str] = mapped_column(String(64))
    entity: Mapped[str] = mapped_column(String(64))
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    detail: Mapped[str] = mapped_column(String(512), default="")
    before_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    after_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    operator: Mapped[str | None] = mapped_column(String(64), nullable=True)
    request_source: Mapped[str | None] = mapped_column(String(128), nullable=True)
    trace_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class Factory(Base):
    __tablename__ = "factories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    location: Mapped[str] = mapped_column(String(128), default="")
    description: Mapped[str] = mapped_column(String(256), default="")
    factory_type: Mapped[str] = mapped_column(String(64), default="GENERAL")
    status: Mapped[str] = mapped_column(String(32), default="ACTIVE")


class Area(Base):
    __tablename__ = "areas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    material_type: Mapped[str] = mapped_column(String(64), default="GENERAL")
    factory_id: Mapped[int | None] = mapped_column(ForeignKey("factories.id"), nullable=True, index=True)
    warehouse_id: Mapped[int | None] = mapped_column(ForeignKey("warehouses.id"), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(32), default="ACTIVE")
    description: Mapped[str] = mapped_column(String(256), default="")


class Container(Base):
    __tablename__ = "containers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    container_type: Mapped[str] = mapped_column(String(64), default="BIN")
    status: Mapped[str] = mapped_column(String(32), default="UNBOUND")
    location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id"), nullable=True, unique=True, index=True)
    description: Mapped[str] = mapped_column(String(256), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class ContainerInventory(Base):
    __tablename__ = "container_inventory"
    __table_args__ = (UniqueConstraint("container_id", "material_id", name="uq_container_material"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    container_id: Mapped[int] = mapped_column(ForeignKey("containers.id"), index=True)
    material_id: Mapped[int] = mapped_column(ForeignKey("materials.id"), index=True)
    quantity: Mapped[int] = mapped_column(Integer, default=0)
    reserved: Mapped[int] = mapped_column(Integer, default=0)
    version: Mapped[int] = mapped_column(Integer, default=0)


class ContainerMove(Base):
    __tablename__ = "container_moves"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    container_id: Mapped[int] = mapped_column(ForeignKey("containers.id"), index=True)
    from_location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id"), nullable=True)
    to_location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id"), nullable=True)
    operator: Mapped[str | None] = mapped_column(String(64), nullable=True)
    note: Mapped[str] = mapped_column(String(256), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(128))
    salt: Mapped[str] = mapped_column(String(32))
    is_active: Mapped[int] = mapped_column(Integer, default=1)


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    description: Mapped[str] = mapped_column(String(128), default="")


class Permission(Base):
    __tablename__ = "permissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    description: Mapped[str] = mapped_column(String(256), default="")


class UserRole(Base):
    __tablename__ = "user_roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), index=True)


class RolePermission(Base):
    __tablename__ = "role_permissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), index=True)
    permission_id: Mapped[int] = mapped_column(ForeignKey("permissions.id"), index=True)


class SessionToken(Base):
    __tablename__ = "session_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    token: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)


class IdempotencyRecord(Base):
    __tablename__ = "idempotency_records"
    __table_args__ = (
        UniqueConstraint("user_id", "method", "path", "idempotency_key", name="uq_idempotency_scope"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    method: Mapped[str] = mapped_column(String(16))
    path: Mapped[str] = mapped_column(String(128))
    idempotency_key: Mapped[str] = mapped_column(String(128), index=True)
    request_hash: Mapped[str] = mapped_column(String(128))
    status_code: Mapped[int] = mapped_column(Integer, default=0)
    response_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
