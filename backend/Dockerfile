FROM python:3.11-slim

# Installer les dépendances
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir -r requirements.txt

# Copier le code de l’application
COPY app ./app

# Exposer le port pour Uvicorn
EXPOSE 8000

# Point d’entrée
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]