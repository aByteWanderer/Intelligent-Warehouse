from pydantic import BaseModel, Field


class WarehouseCreate(BaseModel):
    code: str
    name: str
    factory_id: int | None = Field(default=None, gt=0)


class WarehouseUpdate(BaseModel):
    name: str | None = None
    factory_id: int | None = Field(default=None, gt=0)


class LocationCreate(BaseModel):
    warehouse_id: int
    area_id: int = Field(..., gt=0)
    code: str
    name: str
    status: str = Field("ACTIVE", pattern="^(ACTIVE|DISABLED)$")


class MaterialCreate(BaseModel):
    sku: str
    name: str
    unit: str = "pcs"
    category: str = "general"
    is_common: int = 0


class MaterialUpdate(BaseModel):
    sku: str | None = None
    name: str | None = None
    unit: str | None = None
    category: str | None = None
    is_common: int | None = None
    is_active: int | None = None


class MaterialCommonUpdate(BaseModel):
    is_common: int = Field(0, ge=0, le=1)


class InventoryAdjust(BaseModel):
    material_id: int = Field(..., gt=0)
    location_id: int = Field(..., gt=0)
    delta: int
    reason: str = "manual"


class OrderLineCreate(BaseModel):
    material_id: int = Field(..., gt=0)
    qty: int = Field(..., gt=0)


class InboundCreate(BaseModel):
    order_no: str = Field(..., min_length=1, max_length=64)
    supplier: str = ""
    location_id: int = Field(..., gt=0)
    lines: list[OrderLineCreate]


class OutboundCreate(BaseModel):
    order_no: str = Field(..., min_length=1, max_length=64)
    customer: str = ""
    source_location_id: int = Field(..., gt=0)
    staging_location_id: int | None = Field(default=None, gt=0)
    lines: list[OrderLineCreate]


class OutboundReserve(BaseModel):
    force: int = Field(0, ge=0, le=1)


class OutboundPick(BaseModel):
    staging_location_id: int = Field(..., gt=0)


class OutboundPack(BaseModel):
    pack_all: int = Field(1, ge=0, le=1)


class OutboundShip(BaseModel):
    ship_all: int = Field(1, ge=0, le=1)


class ResetBusinessData(BaseModel):
    include_master_data: int = Field(1, ge=0, le=1)


class LoginRequest(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    username: str
    password: str
    role_ids: list[int] = []
    is_active: int = 1


class UserUpdate(BaseModel):
    password: str | None = None
    role_ids: list[int] | None = None
    is_active: int | None = None


class RoleCreate(BaseModel):
    name: str
    description: str = ""
    permission_codes: list[str] = []


class RoleUpdate(BaseModel):
    description: str | None = None
    permission_codes: list[str] | None = None


class FactoryCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=64)
    name: str = Field(..., min_length=1, max_length=128)
    location: str = ""
    description: str = ""
    factory_type: str = "GENERAL"
    status: str = Field("ACTIVE", pattern="^(ACTIVE|DISABLED)$")


class FactoryUpdate(BaseModel):
    name: str | None = None
    location: str | None = None
    description: str | None = None
    factory_type: str | None = None
    status: str | None = Field(default=None, pattern="^(ACTIVE|DISABLED)$")


class AreaCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=64)
    name: str = Field(..., min_length=1, max_length=128)
    material_type: str = "GENERAL"
    factory_id: int | None = Field(default=None, gt=0)
    warehouse_id: int = Field(..., gt=0)
    status: str = Field("ACTIVE", pattern="^(ACTIVE|DISABLED)$")
    description: str = ""


class AreaUpdate(BaseModel):
    name: str | None = None
    material_type: str | None = None
    factory_id: int | None = Field(default=None, gt=0)
    warehouse_id: int | None = Field(default=None, gt=0)
    status: str | None = Field(default=None, pattern="^(ACTIVE|DISABLED)$")
    description: str | None = None


class LocationUpdate(BaseModel):
    area_id: int | None = Field(default=None, gt=0)
    name: str | None = None
    status: str | None = Field(default=None, pattern="^(ACTIVE|DISABLED)$")


class ContainerCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=64)
    container_type: str = "BIN"
    status: str = Field("UNBOUND", pattern="^(BOUND|UNBOUND)$")
    location_id: int | None = Field(default=None, gt=0)
    description: str = ""


class ContainerUpdate(BaseModel):
    container_type: str | None = None
    description: str | None = None
    status: str | None = Field(default=None, pattern="^(BOUND|UNBOUND)$")


class ContainerBind(BaseModel):
    location_id: int = Field(..., gt=0)


class ContainerMove(BaseModel):
    to_location_id: int = Field(..., gt=0)
    note: str = ""


class ContainerStockAdjust(BaseModel):
    material_id: int = Field(..., gt=0)
    delta: int
    reason: str = "manual"
