"""add client notes, taste dimensions, and custom fields

Revision ID: 20250920_add_client_notes_taste_dimensions_and_custom_fields
Revises: 20250920_add_sales_created_by_user_id
Create Date: 2025-09-20 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20250920_add_client_notes_taste_dimensions_and_custom_fields"
down_revision = "20250920_add_sales_created_by_user_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clients", sa.Column("phone", sa.String(), nullable=True))
    op.add_column("clients", sa.Column("address_line1", sa.String(), nullable=True))
    op.add_column("clients", sa.Column("address_line2", sa.String(), nullable=True))
    op.add_column("clients", sa.Column("postal_code", sa.String(), nullable=True))
    op.add_column("clients", sa.Column("city", sa.String(), nullable=True))
    op.add_column("clients", sa.Column("country", sa.String(), nullable=True))
    op.add_column("clients", sa.Column("tags", sa.Text(), nullable=True))

    op.add_column("products", sa.Column("custom_characteristics", sa.Text(), nullable=True))

    op.create_table(
        "client_notes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("client_code", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_client_notes_tenant_id", "client_notes", ["tenant_id"])
    op.create_index("ix_client_notes_client_code", "client_notes", ["client_code"])
    op.create_index("ix_client_notes_created_by_user_id", "client_notes", ["created_by_user_id"])

    op.create_table(
        "taste_dimensions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("key", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=True),
        sa.Column("weight", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_index("ix_taste_dimensions_tenant_id", "taste_dimensions", ["tenant_id"])
    op.create_index("ix_taste_dimensions_key", "taste_dimensions", ["key"])
    op.create_unique_constraint(
        "uq_taste_dimensions_tenant_key",
        "taste_dimensions",
        ["tenant_id", "key"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_taste_dimensions_tenant_key", "taste_dimensions", type_="unique")
    op.drop_index("ix_taste_dimensions_key", table_name="taste_dimensions")
    op.drop_index("ix_taste_dimensions_tenant_id", table_name="taste_dimensions")
    op.drop_table("taste_dimensions")

    op.drop_index("ix_client_notes_created_by_user_id", table_name="client_notes")
    op.drop_index("ix_client_notes_client_code", table_name="client_notes")
    op.drop_index("ix_client_notes_tenant_id", table_name="client_notes")
    op.drop_table("client_notes")

    op.drop_column("products", "custom_characteristics")

    op.drop_column("clients", "tags")
    op.drop_column("clients", "country")
    op.drop_column("clients", "city")
    op.drop_column("clients", "postal_code")
    op.drop_column("clients", "address_line2")
    op.drop_column("clients", "address_line1")
    op.drop_column("clients", "phone")
