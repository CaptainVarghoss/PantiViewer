from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional

import auth
import database
import models
import schemas

router = APIRouter()

# --- Setting Endpoints ---

@router.get("/global-settings/", response_model=List[schemas.Setting])
def read_all_global_settings(
    skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_admin_user)
):
    # Retrieves all global settings as a list of Setting objects.
    settings = db.query(models.Setting).offset(skip).limit(limit).all()
    return settings

@router.get("/settings/", response_model=List[schemas.Setting])
def read_settings(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    # Retrieves all global settings.
    # Device specific overrides are now handled client-side via localStorage.
    return db.query(models.Setting).all()

@router.put("/settings/{setting_id}", response_model=schemas.Setting)
def update_setting(setting_id: int, setting: schemas.SettingUpdate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_admin_user)):
    # Updates an existing global setting. Only accessible by admin users.

    db_setting = db.query(models.Setting).filter(models.Setting.id == setting_id).first()
    if db_setting is None:
        raise HTTPException(status_code=404, detail="Setting not found")

    for key, value in setting.dict(exclude_unset=True).items():
        setattr(db_setting, key, value)
    db.commit()
    db.refresh(db_setting)
    return db_setting
