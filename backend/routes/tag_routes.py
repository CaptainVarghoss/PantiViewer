from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional

import auth
import database
import models
import schemas

router = APIRouter()

# --- Tag Endpoints ---

@router.post("/tags/", response_model=schemas.Tag, status_code=status.HTTP_201_CREATED)
def create_tag(tag: schemas.TagCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    # Creates a new tag.
    # Protection depends on the 'allow_tag_create' setting and user's admin status.

    # Check if general user tag creation is allowed
    allow_tag_create_setting = db.query(models.Setting).filter_by(name='allow_tag_create').first()
    if allow_tag_create_setting and allow_tag_create_setting.value.lower() != 'true':
        if not current_user.admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tag creation is currently disabled for non-admin users."
            )

    db_tag = models.Tag(**tag.dict())
    db.add(db_tag)
    db.commit()
    db.refresh(db_tag)
    return db_tag

@router.get("/tags/", response_model=List[schemas.Tag])
def read_tags(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
    imageId: Optional[int] = Query(None, description="ID of specific image to get related tags.")
):
    # retrieves a list of tags.
    # If ID is None, returns all tags filtered by admin_only if non-admin
    if not imageId:
        tags = db.query(models.Tag).filter_by(internal=False)

        if not current_user.admin:
            tags = tags.filter_by(admin_only=False)

    else:
        tags = db.query(models.Tag)\
            .join(models.ImageContent.tags)\
            .join(models.ImageLocation, models.ImageLocation.content_hash == models.ImageContent.content_hash)\
            .filter(models.ImageLocation.id == imageId)\
            .all()

    return tags

@router.get("/tags/{tag_id}", response_model=schemas.Tag)
def read_tag(tag_id: int, db: Session = Depends(database.get_db)):
    # Retrieves a single tag by ID. Accessible by all.

    db_tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if db_tag is None:
        raise HTTPException(status_code=404, detail="Tag not found")
    return db_tag

@router.put("/tags/{tag_id}", response_model=schemas.Tag)
def update_tag(tag_id: int, tag: schemas.TagUpdate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    # Updates an existing tag.
    # Protection depends on the 'allow_tag_edit' setting and user's admin status.

    # Check if general user tag editing is allowed
    allow_tag_edit_setting = db.query(models.Setting).filter_by(name='allow_tag_edit').first()
    if allow_tag_edit_setting and allow_tag_edit_setting.value.lower() != 'true':
        if not current_user.admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tag editing is currently disabled for non-admin users."
            )

    db_tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if db_tag is None:
        raise HTTPException(status_code=404, detail="Tag not found")
    for key, value in tag.dict(exclude_unset=True).items():
        setattr(db_tag, key, value)
    db.commit()
    db.refresh(db_tag)
    return db_tag

@router.delete("/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tag(tag_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_admin_user)):
    # Deletes a tag. Only accessible by admin users.

    db_tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if db_tag is None:
        raise HTTPException(status_code=404, detail="Tag not found")
    db.delete(db_tag)
    db.commit()
    return
