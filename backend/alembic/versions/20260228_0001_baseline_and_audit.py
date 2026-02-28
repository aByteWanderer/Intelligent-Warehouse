"""baseline schema + audit/idempotency extensions

Revision ID: 20260228_0001
Revises: 
Create Date: 2026-02-28 12:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.db import Base
from app import models  # noqa: F401


# revision identifiers, used by Alembic.
revision: str = "20260228_0001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    if not _has_table(inspector, table_name):
        return False
    return any(col["name"] == column_name for col in inspector.get_columns(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)

    inspector = sa.inspect(bind)

    if _has_table(inspector, "materials") and not _has_column(inspector, "materials", "is_active"):
        op.add_column("materials", sa.Column("is_active", sa.Integer(), server_default="1", nullable=False))

    if _has_table(inspector, "order_lines") and not _has_column(inspector, "order_lines", "material_sku"):
        op.add_column("order_lines", sa.Column("material_sku", sa.String(length=64), nullable=True))
    if _has_table(inspector, "order_lines") and not _has_column(inspector, "order_lines", "material_name"):
        op.add_column("order_lines", sa.Column("material_name", sa.String(length=128), nullable=True))

    if _has_table(inspector, "orders") and not _has_column(inspector, "orders", "created_by"):
        op.add_column("orders", sa.Column("created_by", sa.String(length=64), nullable=True))

    if _has_table(inspector, "stock_moves") and not _has_column(inspector, "stock_moves", "operator"):
        op.add_column("stock_moves", sa.Column("operator", sa.String(length=64), nullable=True))

    if _has_table(inspector, "locations") and not _has_column(inspector, "locations", "area_id"):
        op.add_column("locations", sa.Column("area_id", sa.Integer(), nullable=True))
    if _has_table(inspector, "locations") and not _has_column(inspector, "locations", "status"):
        op.add_column("locations", sa.Column("status", sa.String(length=32), server_default="ACTIVE", nullable=False))
    if _has_table(inspector, "locations") and not _has_column(inspector, "locations", "binding_status"):
        op.add_column("locations", sa.Column("binding_status", sa.String(length=32), server_default="UNBOUND", nullable=False))
    if _has_table(inspector, "warehouses") and not _has_column(inspector, "warehouses", "factory_id"):
        op.add_column("warehouses", sa.Column("factory_id", sa.Integer(), nullable=True))
    if _has_table(inspector, "areas") and not _has_column(inspector, "areas", "warehouse_id"):
        op.add_column("areas", sa.Column("warehouse_id", sa.Integer(), nullable=True))

    inspector = sa.inspect(bind)
    if _has_table(inspector, "operation_logs"):
        if not _has_column(inspector, "operation_logs", "before_value"):
            op.add_column("operation_logs", sa.Column("before_value", sa.Text(), nullable=True))
        if not _has_column(inspector, "operation_logs", "after_value"):
            op.add_column("operation_logs", sa.Column("after_value", sa.Text(), nullable=True))
        if not _has_column(inspector, "operation_logs", "request_source"):
            op.add_column("operation_logs", sa.Column("request_source", sa.String(length=128), nullable=True))
        if not _has_column(inspector, "operation_logs", "trace_id"):
            op.add_column("operation_logs", sa.Column("trace_id", sa.String(length=64), nullable=True))
            op.create_index("ix_operation_logs_trace_id", "operation_logs", ["trace_id"], unique=False)


def downgrade() -> None:
    pass
