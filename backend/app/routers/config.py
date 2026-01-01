"""
Routes d'API pour la gestion des paramètres de configuration.

Ces endpoints permettent de récupérer et de mettre à jour les valeurs
de configuration pour un tenant. À la première requête, les paramètres
par défaut sont chargés depuis ``config/default_config.yml`` s'ils ne
existent pas encore pour le locataire.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..routers.auth import get_current_user
from ..services import config_service
from .. import schemas

router = APIRouter(prefix="/config", tags=["config"])


@router.get("/", response_model=list[schemas.ConfigSettingRead])
def list_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[schemas.ConfigSettingRead]:
    """Liste les paramètres de configuration pour le tenant courant.

    Charge les valeurs par défaut si aucune configuration n'est encore
    présente en base pour le locataire.
    """
    config_service.load_defaults(db, current_user.tenant_id)
    settings = config_service.get_all(db, current_user.tenant_id)
    return settings


@router.put("/{key}", response_model=schemas.ConfigSettingRead)
def update_config(
    key: str,
    config_update: schemas.ConfigSettingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> schemas.ConfigSettingRead:
    """Crée ou met à jour un paramètre de configuration.

    Si le paramètre existe déjà, sa valeur et sa description sont
    remplacées. Si le paramètre n'existe pas, il est créé. La valeur est
    obligatoire lors de la création. Les valeurs complexes doivent être
    sérialisées par le client (JSON ou texte). Cette API ne valide pas
    la structure de la valeur.
    """
    # S'assurer que les valeurs par défaut sont chargées
    config_service.load_defaults(db, current_user.tenant_id)
    # Rechercher l'existant
    setting = config_service.get_by_key(db, current_user.tenant_id, key)
    if setting:
        # Mise à jour partielle
        if config_update.value is not None:
            setting.value = config_update.value
        if config_update.description is not None:
            setting.description = config_update.description
        db.commit()
        db.refresh(setting)
        return setting
    # Création d'un nouveau paramètre
    if config_update.value is None:
        raise HTTPException(status_code=400, detail="value is required to create a setting")
    new_setting = config_service.set_config(
        db,
        current_user.tenant_id,
        key,
        config_update.value,
        config_update.description,
    )
    return new_setting