import os

# Utiliser SQLite par défaut pour les tests afin d'éviter toute dépendance Postgres.
os.environ.setdefault("DATABASE_URL", "sqlite:///./test.db")
