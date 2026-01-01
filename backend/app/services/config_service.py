"""
Service pour la gestion des paramètres de configuration.

Ce module fournit des fonctions pour charger des paramètres par défaut à
partir d'un fichier YAML et pour lire/écrire des paramètres spécifiques
au locataire. Les valeurs sont stockées sous forme de chaînes afin de
laisser à l'application la responsabilité de la désérialisation.

Si aucun paramètre n'est présent pour un locataire, ``load_defaults`` peut
être appelé pour préremplir la base à partir du fichier
``backend/app/config/default_config.yml``. Le format du fichier doit être
un mapping ``clé: valeur``, où ``valeur`` peut être un nombre, une chaîne
ou une structure (qui sera sérialisée en JSON).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional, Any, Dict

import yaml
from sqlalchemy.orm import Session

from ..models import ConfigSetting


DEFAULT_CONFIG_PATH = Path(__file__).resolve().parents[1] / "config" / "default_config.yml"


def _serialize_value(value: Any) -> str:
    """Convertit la valeur Python en chaîne JSON si nécessaire.

    Si la valeur est un dict ou une liste, elle est sérialisée en JSON.
    Sinon, elle est simplement convertie en chaîne.
    """
    if isinstance(value, (dict, list)):
        return json.dumps(value)
    return str(value)


def load_defaults(db: Session, tenant_id: int) -> None:
    """Charge les paramètres par défaut depuis le fichier YAML pour un tenant.

    Si un paramètre n'existe pas encore dans la base pour ce locataire,
    il est créé avec la valeur par défaut et une description générique.
    """
    if not DEFAULT_CONFIG_PATH.exists():
        return
    with open(DEFAULT_CONFIG_PATH, "r", encoding="utf-8") as f:
        try:
            raw_config: Dict[str, Any] = yaml.safe_load(f) or {}
        except yaml.YAMLError:
            raw_config = {}
    for key, value in raw_config.items():
        existing = (
            db.query(ConfigSetting)
            .filter(ConfigSetting.tenant_id == tenant_id, ConfigSetting.key == key)
            .first()
        )
        if not existing:
            setting = ConfigSetting(
                tenant_id=tenant_id,
                key=key,
                value=_serialize_value(value),
                description=f"Default setting for {key}",
            )
            db.add(setting)
    db.commit()


def get_all(db: Session, tenant_id: int) -> list[ConfigSetting]:
    """Retourne tous les paramètres de configuration pour un locataire."""
    return (
        db.query(ConfigSetting)
        .filter(ConfigSetting.tenant_id == tenant_id)
        .order_by(ConfigSetting.key)
        .all()
    )


def get_by_key(db: Session, tenant_id: int, key: str) -> Optional[ConfigSetting]:
    """Retourne un paramètre par clé pour un locataire, ou None."""
    return (
        db.query(ConfigSetting)
        .filter(ConfigSetting.tenant_id == tenant_id, ConfigSetting.key == key)
        .first()
    )


def set_config(
    db: Session, tenant_id: int, key: str, value: str, description: Optional[str] = None
) -> ConfigSetting:
    """Crée ou met à jour un paramètre de configuration pour un locataire.

    Si le paramètre existe déjà, sa valeur et sa description sont mises à jour.
    Sinon, une nouvelle entrée est créée.
    """
    setting = get_by_key(db, tenant_id, key)
    if setting:
        setting.value = value
        if description is not None:
            setting.description = description
    else:
        setting = ConfigSetting(
            tenant_id=tenant_id,
            key=key,
            value=value,
            description=description,
        )
        db.add(setting)
    db.commit()
    db.refresh(setting)
    return setting