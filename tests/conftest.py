import os

# Utiliser SQLite par défaut pour les tests afin d'éviter toute dépendance Postgres.
os.environ.setdefault("DATABASE_URL", "sqlite:///./test.db")
# Forcer le mode Brevo DRY RUN dans la suite de tests (aucun réseau).
os.environ["BREVO_DRY_RUN"] = "1"
