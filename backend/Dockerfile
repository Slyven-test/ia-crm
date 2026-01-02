FROM python:3.11-slim

# Installer les dépendances
WORKDIR /app
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir -r requirements.txt

# Copier le code de l’application et l’ETL
COPY backend/app ./app
COPY etl ./etl

# Assurer la résolution des modules backend et etl
ENV PYTHONPATH="/app:/app/etl"

# Exposer le port pour Uvicorn
EXPOSE 8000

# Point d’entrée
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
