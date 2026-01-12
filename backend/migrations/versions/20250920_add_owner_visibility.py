"""add owner and visibility to clients/products

Revision ID: 20250920_add_owner_visibility
Revises: 
Create Date: 2025-09-20 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20250920_add_owner_visibility"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clients", sa.Column("owner_user_id", sa.Integer(), nullable=True))
    op.add_column(
        "clients",
        sa.Column("visibility", sa.String(), nullable=True, server_default="private"),
    )
    op.create_index("ix_clients_owner_user_id", "clients", ["owner_user_id"])
    op.create_index("ix_clients_visibility", "clients", ["visibility"])
    op.create_foreign_key(
        "fk_clients_owner_user_id_users",
        "clients",
        "users",
        ["owner_user_id"],
        ["id"],
    )

    op.add_column("products", sa.Column("owner_user_id", sa.Integer(), nullable=True))
    op.add_column(
        "products",
        sa.Column("visibility", sa.String(), nullable=True, server_default="private"),
    )
    op.create_index("ix_products_owner_user_id", "products", ["owner_user_id"])
    op.create_index("ix_products_visibility", "products", ["visibility"])
    op.create_foreign_key(
        "fk_products_owner_user_id_users",
        "products",
        "users",
        ["owner_user_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_products_owner_user_id_users", "products", type_="foreignkey")
    op.drop_index("ix_products_visibility", table_name="products")
    op.drop_index("ix_products_owner_user_id", table_name="products")
    op.drop_column("products", "visibility")
    op.drop_column("products", "owner_user_id")

    op.drop_constraint("fk_clients_owner_user_id_users", "clients", type_="foreignkey")
    op.drop_index("ix_clients_visibility", table_name="clients")
    op.drop_index("ix_clients_owner_user_id", table_name="clients")
    op.drop_column("clients", "visibility")
    op.drop_column("clients", "owner_user_id")
