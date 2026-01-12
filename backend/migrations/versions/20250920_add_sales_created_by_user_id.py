"""add created_by_user_id to sales

Revision ID: 20250920_add_sales_created_by_user_id
Revises: 20250920_add_owner_visibility
Create Date: 2025-09-20 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20250920_add_sales_created_by_user_id"
down_revision = "20250920_add_owner_visibility"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sales", sa.Column("created_by_user_id", sa.Integer(), nullable=True))
    op.create_index("ix_sales_created_by_user_id", "sales", ["created_by_user_id"])
    op.create_foreign_key(
        "fk_sales_created_by_user_id_users",
        "sales",
        "users",
        ["created_by_user_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_sales_created_by_user_id_users", "sales", type_="foreignkey")
    op.drop_index("ix_sales_created_by_user_id", table_name="sales")
    op.drop_column("sales", "created_by_user_id")
