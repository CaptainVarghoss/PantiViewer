from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_, or_, not_, select
from typing import List, Optional
from pathlib import Path
from datetime import datetime
import os, json, threading, mimetypes, asyncio
import concurrent.futures
from search_constructor import generate_image_search_filter
from websocket_manager import manager # Import the WebSocket manager

import auth
import database
import models
import schemas
import config
import image_processor

router = APIRouter()

# --- Background Task Management ---

# Global executor to limit thumbnail generation threads to prevent resource exhaustion.
thumbnail_executor = concurrent.futures.ThreadPoolExecutor(max_workers=4)
processing_thumbnails = set()
processing_lock = threading.Lock()

def _run_thumbnail_generation(image_id, content_hash, filepath, loop):
    try:
        image_processor.generate_thumbnail_in_background(image_id, content_hash, filepath, loop)
    finally:
        with processing_lock:
            processing_thumbnails.discard(image_id)

def trigger_thumbnail_generation_task(image_id, content_hash, filepath, loop):
    with processing_lock:
        if image_id in processing_thumbnails:
            return
        processing_thumbnails.add(image_id)
    thumbnail_executor.submit(_run_thumbnail_generation, image_id, content_hash, filepath, loop)

# --- Image Endpoints ---

@router.get("/thumbnails/{image_id}", response_class=FileResponse)
def get_thumbnail(image_id: int, db: Session = Depends(database.get_db)):
    
    # Serves thumbnails. If a thumbnail doesn't exist, it triggers generation and returns a placeholder.

    db_image = db.query(models.ImageLocation).filter(models.ImageLocation.id == image_id).first()
    if not db_image:
        print(f"Image with ID {image_id} not found")
        raise HTTPException(status_code=404, detail="Image not found")

    expected_thumbnail_path = os.path.join(config.THUMBNAILS_DIR, f"{db_image.content_hash}_thumb.webp")

    if os.path.exists(expected_thumbnail_path):
        return FileResponse(expected_thumbnail_path, media_type="image/webp")
    else:
        # Trigger background generation
        original_filepath = os.path.join(db_image.path, db_image.filename)

        thumb_size_setting = db.query(models.Setting).filter_by(name='thumb_size').first()
        config_thumbnail_size = config.THUMBNAIL_SIZE

        if thumb_size_setting and thumb_size_setting.value:
            thumb_size = int(thumb_size_setting.value)
        else:
            thumb_size = config_thumbnail_size

        if original_filepath and Path(original_filepath).is_file():
            trigger_thumbnail_generation_task(image_id, db_image.content_hash, original_filepath, database.main_event_loop)
        else:
            print(f"Could not trigger thumbnail generation for {db_image.filename}: original_filepath not found or invalid.")

        # Return a placeholder image or a loading indicator
        placeholder_path = os.path.join(config.STATIC_DIR, "placeholder.png")  # Or a loading animation
        return FileResponse(placeholder_path, media_type="image/png")

@router.get("/images/", response_model=List[schemas.ImageResponse])
def read_images(
    limit: int = 100,
    search_query: Optional[str] = Query(None, description="Search term for filename or path"),
    sort_by: str = Query("date_created", description="Column to sort by (e.g., filename, date_created, checksum)"),
    sort_order: str = Query("desc", description="Sort order: 'asc' or 'desc'"),
    last_sort_value: Optional[str] = Query(None, description="Value of the sort_by column for the last_id item (for stable pagination)"),
    last_content_id: Optional[int] = Query(None, description="Content ID of the last item for pagination tie-breaking."),
    last_location_id: Optional[int] = Query(None, description="Location ID of the last item for pagination tie-breaking."),
    db: Session = Depends(database.get_db),
    active_stages_json: Optional[str] = Query(None, description="JSON string of active filter stages, e.g., '{\"1\":0, \"2\":1}'"),
    trash_only: bool = Query(False, description="If true, only returns images marked as deleted."),
    current_user: models.User = Depends(auth.get_current_user),
):
    """
    Retrieves a list of images with support for searching, sorting, and cursor-based pagination.
    Accessible by all. Eager loads associated tags and includes paths to generated media.
    Triggers thumbnail generation if not found.
    """
    query = db.query(models.ImageLocation)
    query = query.join(models.ImageContent, models.ImageLocation.content_hash == models.ImageContent.content_hash)
    query = query.outerjoin(models.ImagePath, models.ImagePath.path == models.ImageLocation.path)
    query = query.options(
        joinedload(models.ImageLocation.content).joinedload(models.ImageContent.tags)
    )

    # Create a subquery to select all paths that are explicitly marked as ignored.
    query = query.filter(models.ImagePath.is_ignored == False)

    if trash_only:
        query = query.filter(models.ImageLocation.deleted == True)
    else:
        # If not viewing trash, filter out deleted items and apply search/filter criteria
        query = query.filter(models.ImageLocation.deleted == False)
        if search_query or active_stages_json:
            query = query.distinct()
        search_filter = generate_image_search_filter(search_terms=search_query, admin=current_user.admin, active_stages_json=active_stages_json, db=db)
        query = query.filter(search_filter)

    # Apply cursor-based pagination (Keyset Pagination)
    if last_sort_value is not None and last_content_id is not None and last_location_id is not None:
        converted_last_sort_value = last_sort_value
        if sort_by == 'date_created':
            try:
                converted_last_sort_value = datetime.fromisoformat(last_sort_value.replace('Z', '+00:00'))
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date format for last_sort_value.")

        sort_column = getattr(models.ImageContent if sort_by != 'filename' else models.ImageLocation, sort_by)

        # Using tuple comparison for more efficient keyset pagination.
        # This creates a 3-part cursor: (sort_column, content_id, location_id)
        cursor_tuple = (
            sort_column,
            models.ImageContent.content_id,
            models.ImageLocation.id
        )
        last_values_tuple = (
            converted_last_sort_value,
            last_content_id,
            last_location_id
        )

        if sort_order == 'desc':
            query = query.filter(cursor_tuple < last_values_tuple)
        else:  # 'asc'
            query = query.filter(cursor_tuple > last_values_tuple)

    # Apply sorting
    sort_column = getattr(models.ImageContent if sort_by != 'filename' else models.ImageLocation, sort_by)

    if sort_order == 'desc':
        query = query.order_by(sort_column.desc(), models.ImageContent.content_id.desc(), models.ImageLocation.id.desc())
    else:  # 'asc'
        query = query.order_by(sort_column.asc(), models.ImageContent.content_id.asc(), models.ImageLocation.id.asc())

    # Apply limit
    images = query.limit(limit).all()

    response_images = []
    for location in images:
        img = location.content

        # Check if thumbnail exists, if not, trigger generation in background
        expected_thumbnail_path = os.path.join(config.THUMBNAILS_DIR, f"{img.content_hash}_thumb.webp")
        thumbnail_url = f"/static_assets/generated_media/thumbnails/{img.content_hash}_thumb.webp"
        if os.path.exists(expected_thumbnail_path):
            thumbnail_missing = False
        else:
            thumbnail_missing = True
            
            original_filepath = os.path.join(location.path, location.filename)
            if original_filepath and Path(original_filepath).is_file():
                trigger_thumbnail_generation_task(location.id, img.content_hash, original_filepath, database.main_event_loop)
            else:
                print(f"Could not trigger thumbnail generation for {location.filename}: original_filepath not found or invalid.")

        # Handle EXIF data safely without modifying the DB object
        exif_data = img.exif_data
        if isinstance(exif_data, str):
            try:
                exif_data = json.loads(exif_data)
            except json.JSONDecodeError:
                exif_data = {}
        
        response_images.append(schemas.ImageResponse(
            id=location.id,
            filename=location.filename,
            path=location.path,
            thumbnail_url=thumbnail_url,
            thumbnail_missing=thumbnail_missing,
            exif_data=exif_data,
            # Explicitly map fields to avoid passing SQLAlchemy internal state (_sa_instance_state)
            # to Pydantic, which can cause segfaults in threaded environments.
            content_hash=img.content_hash,
            date_created=img.date_created,
            date_modified=img.date_modified,
            is_video=img.is_video,
            width=img.width,
            height=img.height,
            tags=list(img.tags),
            content_id=img.content_id
        ))
    return response_images

@router.get("/images/{image_id}", response_model=schemas.ImageResponse)
def read_image(
        image_id: int,
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
    ):
    # Retrieves a single image by ID. Accessible by all.
    # Eager loads associated tags and includes paths to generated media.
    # Triggers thumbnail generation if not found.

    location_image = db.query(models.ImageLocation).options(
        joinedload(models.ImageLocation.content).joinedload(models.ImageContent.tags)
    ).filter(models.ImageLocation.id == image_id).first()

    if location_image is None:
        raise HTTPException(status_code=404, detail="Image location not found")

    db_image = location_image.content
    if db_image is None:
        raise HTTPException(status_code=404, detail="Image content not found")
    
    # Check if thumbnail exists, if not, trigger generation in background
    expected_thumbnail_path = os.path.join(config.THUMBNAILS_DIR, f"{db_image.content_hash}_thumb.webp")
    if os.path.exists(expected_thumbnail_path):
        thumbnail_url = f"/static_assets/generated_media/thumbnails/{db_image.content_hash}_thumb.webp"
        thumbnail_missing = False
    else:
        # The URL should still point to the expected final location for the frontend.
        thumbnail_url = f"/static_assets/generated_media/thumbnails/{db_image.content_hash}_thumb.webp"
        thumbnail_missing = True
        original_filepath = os.path.join(location_image.path, location_image.filename)
        if original_filepath and Path(original_filepath).is_file():
            print(f"Thumbnail for {location_image.filename} (ID: {location_image.id}) not found. Triggering background generation.")
            trigger_thumbnail_generation_task(location_image.id, db_image.content_hash, original_filepath, database.main_event_loop)
        else:
            print(f"Could not trigger thumbnail generation for {location_image.filename}: original_filepath not found or invalid.")

    exif_data = db_image.exif_data
    if isinstance(exif_data, str):
        try:
            exif_data = json.loads(exif_data)
        except json.JSONDecodeError:
            exif_data = {}

    return schemas.ImageResponse(
        id=location_image.id,
        filename=location_image.filename,
        path=location_image.path,
        thumbnail_url=thumbnail_url,
        thumbnail_missing=thumbnail_missing,
        exif_data=exif_data,
        # Explicitly map fields
        content_hash=db_image.content_hash,
        date_created=db_image.date_created,
        date_modified=db_image.date_modified,
        is_video=db_image.is_video,
        width=db_image.width,
        height=db_image.height,
        tags=list(db_image.tags),
        content_id=db_image.content_id
    )


@router.put("/images/{image_id}/tags", response_model=schemas.ImageResponse)
def update_image(image_id: int, image_update: schemas.ImageTagUpdate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    # Updates an existing image's tags.
    # Requires authentication.

    image_location = db.query(models.ImageLocation).filter(models.ImageLocation.id == image_id).first()
    if image_location is None:
        raise HTTPException(status_code=404, detail="Image location not found")

    db_image = db.query(models.ImageContent).filter(models.ImageContent.content_hash == image_location.content_hash).first()
    if db_image is None:
        raise HTTPException(status_code=404, detail="Image content not found")

    if image_update.tag_ids is not None:
        db_image.tags.clear()
        for tag_id in image_update.tag_ids:
            tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
            if tag:
                db_image.tags.append(tag)
            else:
                raise HTTPException(status_code=400, detail=f"Tag with ID {tag_id} not found.")
    
    db.commit()
    db.refresh(db_image)

    # After updating tags, broadcast a general refresh message
    if database.main_event_loop:
        message = {"type": "refresh_images", "reason": "tags_updated"}
        asyncio.run_coroutine_threadsafe(manager.broadcast_json(message), database.main_event_loop)

    # Re-fetch the image with all its data to return the updated object
    # This avoids calling read_image and creating a new dependency chain
    updated_location_image = db.query(models.ImageLocation).options(
        joinedload(models.ImageLocation.content).joinedload(models.ImageContent.tags)
    ).filter(models.ImageLocation.id == image_id).first()

    return updated_location_image

@router.post("/images/tags/bulk-update", status_code=status.HTTP_204_NO_CONTENT)
def bulk_update_image_tags(
    update_request: schemas.ImageTagBulkUpdate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Adds or removes a single tag from a list of images in bulk.
    Requires authentication.
    """
    image_ids = update_request.image_ids
    tag_id = update_request.tag_id
    action = update_request.action

    if not image_ids:
        return # Nothing to do

    # Fetch the tag to be added/removed
    tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail=f"Tag with ID {tag_id} not found.")

    # Get the content hashes for the given image location IDs
    content_hashes_query = select(models.ImageLocation.content_hash).where(models.ImageLocation.id.in_(image_ids))
    content_hashes = db.execute(content_hashes_query).scalars().all()

    if not content_hashes:
        raise HTTPException(status_code=404, detail="No valid images found for the provided IDs.")

    # Fetch all image content objects at once
    images_to_update = db.query(models.ImageContent).options(joinedload(models.ImageContent.tags)).filter(
        models.ImageContent.content_hash.in_(content_hashes)
    ).all()

    for image_content in images_to_update:
        has_tag = any(t.id == tag_id for t in image_content.tags)
        if action == 'add' and not has_tag:
            image_content.tags.append(tag)
        elif action == 'remove' and has_tag:
            image_content.tags.remove(tag)

    db.commit()

    # After updating tags, broadcast a refresh message for the affected images
    if database.main_event_loop:
        message = {"type": "refresh_images", "reason": "tags_updated_bulk", "image_ids": image_ids}
        asyncio.run_coroutine_threadsafe(manager.broadcast_json(message), database.main_event_loop)

    return

@router.post("/images/{image_id}/delete", status_code=status.HTTP_204_NO_CONTENT)
def mark_image_as_deleted(
    image_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Marks an image location as deleted by setting its 'deleted' flag to True.
    This is a "soft delete".
    """
    image_location = db.query(models.ImageLocation).filter(models.ImageLocation.id == image_id).first()
    if image_location is None:
        raise HTTPException(status_code=404, detail="Image location not found")

    image_location.deleted = True
    db.commit()

    # Broadcast a websocket message to remove the image from all connected clients' views.
    if database.main_event_loop:
        message = {"type": "image_deleted", "image_id": image_id}
        # Use run_coroutine_threadsafe because we are in a synchronous FastAPI route
        # calling an asynchronous function in the main event loop.
        asyncio.run_coroutine_threadsafe(manager.broadcast_json(message), database.main_event_loop)
        print(f"Sent 'image_deleted' notification for image ID {image_id}")
    else:
        print("Warning: Could not get main event loop to broadcast WebSocket message for image deletion.")
    return

@router.post("/images/delete-bulk", status_code=status.HTTP_204_NO_CONTENT)
def mark_images_as_deleted_bulk(
    image_ids: List[int],
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Marks a list of image locations as deleted by setting their 'deleted' flag to True.
    This is a "soft delete" performed in bulk.
    """
    if not image_ids:
        return

    db.query(models.ImageLocation).filter(
        models.ImageLocation.id.in_(image_ids)
    ).update({"deleted": True}, synchronize_session=False)
    
    db.commit()

    if database.main_event_loop:
        message = {"type": "images_deleted", "image_ids": image_ids}
        asyncio.run_coroutine_threadsafe(manager.broadcast_json(message), database.main_event_loop)
        print(f"Sent 'images_deleted' notification for {len(image_ids)} images.")
    return

@router.post("/images/move", status_code=status.HTTP_200_OK)
def move_images_bulk(
    move_request: schemas.ImageMoveRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Moves a list of images to a new directory.
    This involves moving the physical file and updating the ImageLocation record in the DB.
    """
    image_ids = move_request.imageIds
    destination_path = move_request.destinationPath

    if not image_ids:
        raise HTTPException(status_code=400, detail="No image IDs provided.")
    
    # Validate that the destination path is a registered ImagePath
    is_valid_destination = db.query(models.ImagePath).filter(models.ImagePath.path == destination_path).first()
    if not is_valid_destination:
        raise HTTPException(status_code=400, detail="Destination path is not a valid or registered image path.")

    # Eagerly load folder tags for the destination path
    destination_folder_tags = is_valid_destination.tags

    locations_to_move = db.query(models.ImageLocation).options(
        joinedload(models.ImageLocation.content).joinedload(models.ImageContent.tags)
    ).filter(models.ImageLocation.id.in_(image_ids)).all()

    if len(locations_to_move) != len(image_ids):
        raise HTTPException(status_code=404, detail="One or more images not found.")

    # Apply destination folder tags to the images being moved
    if destination_folder_tags:
        for location in locations_to_move:
            for tag in destination_folder_tags:
                if tag not in location.content.tags:
                    location.content.tags.append(tag)

    for location in locations_to_move:
        if location.path == destination_path:
            # Skip if already in the destination
            continue

        source_full_path = os.path.join(location.path, location.filename)
        dest_full_path = os.path.join(destination_path, location.filename)

        try:
            # Move the physical file
            os.rename(source_full_path, dest_full_path) # This is atomic on most OSes
            
            # Update the database record
            location.path = destination_path
        except OSError as e:
            # If a file move fails, we should probably stop and report the error.
            # Rolling back previous moves could be complex, so for now we stop at the first error.
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to move file '{location.filename}': {e}")

    db.commit()
    if database.main_event_loop:
        asyncio.run_coroutine_threadsafe(
            manager.broadcast_json({"type": "refresh_images", "reason": "images_moved"}),
            database.main_event_loop
        )
    return {"message": f"Successfully moved {len(locations_to_move)} images."}

@router.post("/images/{image_id}/restore", status_code=status.HTTP_204_NO_CONTENT)
def restore_image(
    image_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Restores a soft-deleted image by setting its 'deleted' flag to False.
    """
    image_location = db.query(models.ImageLocation).filter(models.ImageLocation.id == image_id).first()
    if image_location is None:
        raise HTTPException(status_code=404, detail="Image location not found")

    image_location.deleted = False
    db.commit()

    # Broadcast a generic refresh message. Clients can refetch to see the restored image.
    if database.main_event_loop:
        message = {"type": "refresh_images", "reason": "image_restored", "image_id": image_id}
        asyncio.run_coroutine_threadsafe(manager.broadcast_json(message), database.main_event_loop)
        print(f"Sent 'image_restored' notification for image ID {image_id}")
    return

@router.delete("/images/{image_id}/permanent", status_code=status.HTTP_204_NO_CONTENT)
def permanently_delete_image(
    image_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Permanently deletes a single image from the disk and the database.
    This action is irreversible and restricted to admins.
    """
    if not current_user.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can permanently delete images.")

    image_location = db.query(models.ImageLocation).filter(models.ImageLocation.id == image_id).first()
    if image_location is None:
        raise HTTPException(status_code=404, detail="Image location not found")

    # Delete the physical file
    full_path = os.path.join(image_location.path, image_location.filename)
    try:
        if os.path.exists(full_path):
            os.remove(full_path)
            print(f"Permanently deleted file: {full_path}")
    except OSError as e:
        print(f"Error deleting file {full_path}: {e}")
        # We can choose to continue and delete the DB record anyway, or raise an error.
        # For now, we'll raise an error to alert the admin.
        raise HTTPException(status_code=500, detail=f"Failed to delete the physical file: {e}")

    # Delete the database record
    db.delete(image_location)
    db.commit()

    # The 'image_deleted' websocket message is already handled by the frontend, so we can reuse it.
    if database.main_event_loop:
        message = {"type": "image_deleted", "image_id": image_id}
        asyncio.run_coroutine_threadsafe(manager.broadcast_json(message), database.main_event_loop)
        print(f"Sent 'image_deleted' (permanent) notification for image ID {image_id}")
    return

@router.get("/trash/info", response_model=schemas.TrashInfo)
def get_trash_info(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Returns the number of items currently in the trash.
    """
    count = db.query(func.count(models.ImageLocation.id)).filter(models.ImageLocation.deleted == True).scalar()
    return {"trash_count": count}

@router.post("/trash/empty", status_code=status.HTTP_204_NO_CONTENT)
def empty_trash(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Permanently deletes all images that are marked as 'deleted' (soft-deleted).
    This involves deleting the physical files and the database records.
    """
    if not current_user.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can empty the trash.")

    trashed_locations = db.query(models.ImageLocation).filter(models.ImageLocation.deleted == True).all()

    if not trashed_locations:
        return # Nothing to do

    for location in trashed_locations:
        full_path = os.path.join(location.path, location.filename)
        try:
            if os.path.exists(full_path):
                os.remove(full_path)
                print(f"Permanently deleted file: {full_path}")
        except OSError as e:
            print(f"Error deleting file {full_path}: {e}")
            # Decide if you want to stop or continue. For now, we continue.
        
        db.delete(location)
    
    db.commit()
    return

@router.post("/trash/restore", status_code=status.HTTP_204_NO_CONTENT)
def restore_trashed_images(
    image_ids: List[int],
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Restores a list of soft-deleted images by setting their 'deleted' flag to False.
    """
    if not image_ids:
        return

    db.query(models.ImageLocation).filter(
        models.ImageLocation.id.in_(image_ids)
    ).update({"deleted": False}, synchronize_session=False)
    
    db.commit()

    # Broadcast a generic refresh message. Clients can refetch to see the restored images.
    if database.main_event_loop:
        message = {"type": "refresh_images", "reason": "images_restored", "image_ids": image_ids}
        asyncio.run_coroutine_threadsafe(manager.broadcast_json(message), database.main_event_loop)
        print(f"Sent 'images_restored' notification for {len(image_ids)} images.")
    return

@router.post("/trash/delete-permanent", status_code=status.HTTP_204_NO_CONTENT)
def permanently_delete_trashed_images(
    image_ids: List[int],
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Permanently deletes a list of images from the disk and the database.
    This action is irreversible and restricted to admins.
    """
    if not current_user.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can permanently delete images.")

    if not image_ids:
        return

    locations_to_delete = db.query(models.ImageLocation).filter(models.ImageLocation.id.in_(image_ids)).all()

    for location in locations_to_delete:
        full_path = os.path.join(location.path, location.filename)
        try:
            if os.path.exists(full_path):
                os.remove(full_path)
        except OSError as e:
            print(f"Error deleting file {full_path}: {e}")
            # Continue even if a file fails to delete

        db.delete(location)

    db.commit()

    if database.main_event_loop:
        message = {"type": "images_deleted", "image_ids": image_ids}
        asyncio.run_coroutine_threadsafe(manager.broadcast_json(message), database.main_event_loop)
        print(f"Sent 'images_deleted' (permanent) notification for {len(image_ids)} images.")
    return

@router.get("/images/original/{checksum}", response_class=FileResponse)
def get_original_image(
    checksum: str,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user) # Protect this endpoint
):
    # Retrieves the original image file using its checksum and filename.
    # This endpoint uses FileResponse to serve files directly from their disk path.

    db_image = db.query(models.ImageLocation).filter(models.ImageLocation.content_hash == checksum).first()

    full_path = os.path.join(db_image.path, db_image.filename)

    if db_image is None:
        raise HTTPException(status_code=404, detail="Image not found in database for the given checksum.")

    try:
        if not os.path.exists(db_image.path) or not os.path.exists(full_path):
            raise HTTPException(status_code=404, detail="Original image file not found on disk or path is invalid.")

        # Determine media type dynamically
        mime_type, _ = mimetypes.guess_type(full_path)
        if not mime_type:
            mime_type = "application/octet-stream" # Fallback if MIME type cannot be guessed

        return FileResponse(full_path, media_type=mime_type)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Image metadata is corrupted.")
    except Exception as e:
        print(f"Error serving original image {checksum}/{db_image.filename}: {e}")
        raise HTTPException(status_code=500, detail="Error serving image.")