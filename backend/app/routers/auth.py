"""
Routes d’authentification pour ia‑crm.

Permet de s’inscrire (création d’utilisateur), de se connecter (récupération
du token JWT) et de récupérer le profil de l’utilisateur courant. Ces routes
utilisent le service ``auth_service`` pour hacher les mots de passe et
générer les tokens.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")


@router.post("/register", response_model=schemas.UserRead)
def register_user(user_in: schemas.UserCreate, db: Session = Depends(get_db)) -> schemas.UserRead:
    """Crée un nouvel utilisateur dans la base de données."""
    # Vérifier que le nom d’utilisateur n’existe pas
    if db.query(models.User).filter(models.User.username == user_in.username).first():
        raise HTTPException(status_code=400, detail="Nom d’utilisateur déjà pris")
    # Vérifier que le tenant existe
    tenant = db.query(models.Tenant).filter(models.Tenant.id == user_in.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=400, detail="Tenant non trouvé")
    hashed_pw = auth_service.get_password_hash(user_in.password)
    user = models.User(
        username=user_in.username,
        email=user_in.email,
        hashed_password=hashed_pw,
        is_active=True,
        is_superuser=user_in.is_superuser or False,
        tenant_id=user_in.tenant_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/token")
def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """Récupère un token JWT pour un utilisateur validé."""
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not auth_service.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Nom d’utilisateur ou mot de passe incorrect")
    token_data = {"sub": str(user.id), "tenant_id": user.tenant_id}
    access_token = auth_service.create_access_token(data=token_data)
    return {"access_token": access_token, "token_type": "bearer"}


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> models.User:
    """Récupère l’utilisateur courant à partir du token JWT."""
    try:
        payload = auth_service.decode_token(token)
        user_id: int = int(payload.get("sub"))
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    return user


@router.get("/me", response_model=schemas.UserRead)
def read_current_user(current_user: models.User = Depends(get_current_user)) -> schemas.UserRead:
    """Retourne l’utilisateur courant."""
    return current_user