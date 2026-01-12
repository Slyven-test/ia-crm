"""restore schema compat (clients/products columns)

Revision ID: 20260112_restore_schema_compat
Revises: 20250920_client_notes_taste
Create Date: 2026-01-12
"""
from alembic import op

# IDs
revision = "20260112_restore_schema_compat"
down_revision = "20250920_client_notes_taste"
branch_labels = None
depends_on = None


def upgrade():
    # --- clients: columns expected by current ORM/API ---
    op.execute("ALTER TABLE clients ADD COLUMN IF NOT EXISTS phone varchar;")
    op.execute("ALTER TABLE clients ADD COLUMN IF NOT EXISTS address_line1 varchar;")
    op.execute("ALTER TABLE clients ADD COLUMN IF NOT EXISTS address_line2 varchar;")
    op.execute("ALTER TABLE clients ADD COLUMN IF NOT EXISTS postal_code varchar;")
    op.execute("ALTER TABLE clients ADD COLUMN IF NOT EXISTS city varchar;")
    op.execute("ALTER TABLE clients ADD COLUMN IF NOT EXISTS country varchar;")
    op.execute("ALTER TABLE clients ADD COLUMN IF NOT EXISTS tags text;")

    op.execute("ALTER TABLE clients ADD COLUMN IF NOT EXISTS owner_user_id integer;")
    op.execute("ALTER TABLE clients ADD COLUMN IF NOT EXISTS visibility varchar;")
    op.execute("ALTER TABLE clients ALTER COLUMN visibility SET DEFAULT 'private';")
    op.execute("UPDATE clients SET visibility = 'private' WHERE visibility IS NULL;")

    op.execute("CREATE INDEX IF NOT EXISTS ix_clients_owner_user_id ON clients(owner_user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_clients_visibility ON clients(visibility);")

    # Optional FK (safe check)
    op.execute(
        """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_clients_owner_user_id_users') THEN
    ALTER TABLE clients
      ADD CONSTRAINT fk_clients_owner_user_id_users
      FOREIGN KEY (owner_user_id) REFERENCES users(id);
  END IF;
END $$;
"""
    )

    # --- products: align with ORM ---
    op.execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS custom_characteristics text;")
    op.execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS owner_user_id integer;")
    op.execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS visibility varchar;")
    op.execute("ALTER TABLE products ALTER COLUMN visibility SET DEFAULT 'private';")
    op.execute("UPDATE products SET visibility = 'private' WHERE visibility IS NULL;")

    op.execute("CREATE INDEX IF NOT EXISTS ix_products_owner_user_id ON products(owner_user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_products_visibility ON products(visibility);")

    op.execute(
        """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_products_owner_user_id_users') THEN
    ALTER TABLE products
      ADD CONSTRAINT fk_products_owner_user_id_users
      FOREIGN KEY (owner_user_id) REFERENCES users(id);
  END IF;
END $$;
"""
    )

    # --- sales: some dumps may miss this ---
    op.execute("ALTER TABLE sales ADD COLUMN IF NOT EXISTS created_by_user_id integer;")
    op.execute("CREATE INDEX IF NOT EXISTS ix_sales_created_by_user_id ON sales(created_by_user_id);")
    op.execute(
        """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sales_created_by_user_id_users') THEN
    ALTER TABLE sales
      ADD CONSTRAINT fk_sales_created_by_user_id_users
      FOREIGN KEY (created_by_user_id) REFERENCES users(id);
  END IF;
END $$;
"""
    )


def downgrade():
    # Downgrade volontairement minimal (evite le risque de drop de donnees)
    pass
