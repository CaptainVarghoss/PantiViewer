import os
from PIL import Image as PILImage
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import hashlib
import mimetypes
from datetime import datetime, timezone
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func, not_, text
import json, time
from typing import Tuple, Optional
import threading
import subprocess
import asyncio # Import asyncio
from websocket_manager import manager # Import the WebSocket manager

import models
import database
import config
import schemas
import search_handler

# Define supported image and video MIME types
# This list can be expanded based on your needs
SUPPORTED_MEDIA_TYPES = {
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/tiff',
    'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm',
    'image/heic', # Common for iPhones
    'image/heif', # Common for iPhones
}

def _sanitize_for_json(obj):
    # Recursively sanitize a dictionary or list to make it JSON serializable.
    if isinstance(obj, dict):
        return {k: _sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_sanitize_for_json(elem) for elem in obj]
    elif isinstance(obj, bytes):
        return obj.decode('utf-8', errors='replace')
    return obj

def get_meta(filepath: str) -> Tuple[dict, Optional[int], Optional[int]]:
    if not os.path.exists(filepath):
        return {}, None, None

    mime_type, _ = mimetypes.guess_type(filepath)
    is_video = mime_type and mime_type.startswith('video/')

    if is_video:
        try:
            # Use ffprobe for video dimensions
            ffprobe_command = [
                'ffprobe',
                '-v', 'error',
                '-select_streams', 'v:0',
                '-show_entries', 'stream=width,height',
                '-of', 'json',
                filepath
            ]
            result = subprocess.run(ffprobe_command, check=True, capture_output=True, text=True)
            video_info = json.loads(result.stdout)
            width = video_info['streams'][0].get('width')
            height = video_info['streams'][0].get('height')
            # Videos don't have EXIF in the same way, return empty dict
            return {}, width, height
        except (subprocess.CalledProcessError, json.JSONDecodeError, KeyError, IndexError) as e:
            print(f"Error getting video metadata with ffprobe for {filepath}: {e}")
            # Fallback or fail gracefully
            return {}, None, None

    else: # For images
        try:
            # Use Pillow for image dimensions and EXIF
            image = PILImage.open(filepath)
            exif = dict(image.info)
            width = image.width
            height = image.height
            image.close()
            return _sanitize_for_json(exif), width, height
        except Exception as e:
            print(f"Error getting image metadata for {filepath}: {e}")
            return {}, None, None

    return {}, None, None # Default return if no other condition is met
 
def update_fts_entry(db: Session, location_id: int):
    """Updates or inserts an entry in the FTS index for a specific location."""
    try:
        # Fetch the location with content to ensure we have the latest data
        loc = db.query(models.ImageLocation).options(
            joinedload(models.ImageLocation.content).joinedload(models.ImageContent.tags)
        ).filter(models.ImageLocation.id == location_id).first()
        if not loc or not loc.content:
            return

        content = loc.content
        try:
            exif = json.loads(content.exif_data) if content.exif_data else {}
        except (json.JSONDecodeError, TypeError):
            exif = {}
        
        tags_list = [t.name for t in content.tags] if content.tags else []
        tags_str = " ".join(tags_list)
        
        data = search_handler.flatten_exif_to_fts(loc.id, loc.path, loc.filename, exif, tags_str)
        
        # Use INSERT OR REPLACE to handle both new and updated entries
        sql = text("""
            INSERT OR REPLACE INTO image_fts_index (rowid, location_id, path, filename, prompt, negative_prompt, model, sampler, scheduler, loras, upscaler, application, tags, stub, full_text) 
            VALUES (:location_id, :location_id, :path, :filename, :prompt, :negative_prompt, :model, :sampler, :scheduler, :loras, :upscaler, :application, :tags, :stub, :full_text)
        """)
        db.execute(sql, data)
    except Exception as e:
        print(f"Error updating FTS entry for location {location_id}: {e}")

def remove_fts_entry(db: Session, location_id: int):
    """Removes an entry from the FTS index."""
    try:
        db.execute(text("DELETE FROM image_fts_index WHERE rowid = :id"), {"id": location_id})
    except Exception as e:
        print(f"Error removing FTS entry for location {location_id}: {e}")

def add_file_to_db(
    db: Session,
    file_full_path: str,
    existing_checksums: set,
    image_path_entry: Optional[models.ImagePath] = None,
    loop: Optional[asyncio.AbstractEventLoop] = None
) -> Optional[models.ImageLocation]:
    # Adds a single media file to the database.
    root, f = os.path.split(file_full_path)
    existing_location = db.query(models.ImageLocation).where(models.ImageLocation.path == root, models.ImageLocation.filename == f).first()

    if existing_location:
        # Entry exists for this file location, do nothing.
        return None

    else: # No entry found for this file location, add to database then generate checksum and check against checksum list.
        new_image_content = None
        existing_hash = None

        if not is_supported_media(file_full_path):
            # print(f"Ignoring unsupported file: {file_full_path}")
            return None

        checksum = get_file_checksum(file_full_path)
        if not checksum:
            return None  # Error calculating checksum

        # Check against the provided set first for performance
        if checksum in existing_checksums:
            existing_hash = checksum
        else:
            existing_hash = db.query(models.ImageContent.content_hash).filter(models.ImageContent.content_hash == checksum).scalar()

        if not existing_hash:
            # Content does not exist, add new image data
            print(f"Found new media file: {file_full_path}")
    
            mime_type, _ = mimetypes.guess_type(file_full_path)
            is_video = mime_type and mime_type.startswith('video/')

            initial_meta = {
                "mime_type": mime_type,
            }

            new_meta, width, height = get_meta(file_full_path)
            if new_meta:
                initial_meta.update(new_meta)
            
            # Sanitize the entire dictionary right before dumping to JSON.
            # This ensures all values, including mime_type, are serializable.
            sanitized_meta = _sanitize_for_json(initial_meta)

            json_meta_string = "{}"
            try:
                json_meta_string = json.dumps(sanitized_meta)
            except TypeError as e:
                print(f'Error in metadata for file: {file_full_path}. Skipping.')
                return None # Prevent adding a record with bad metadata

            creation_timestamp = os.path.getctime(file_full_path) # This is OS-dependent, might be creation or last metadata change
            modification_timestamp = os.path.getmtime(file_full_path) # Last content modification
            date_created_dt = datetime.fromtimestamp(creation_timestamp, tz=timezone.utc)
            date_modified_dt = datetime.fromtimestamp(modification_timestamp, tz=timezone.utc)

            new_image_content = models.ImageContent(
                content_hash=checksum,
                exif_data=json_meta_string,
                date_created=date_created_dt,
                date_modified=date_modified_dt,
                is_video=is_video,
                width=width,
                height=height
            )

        # Add location and reference content by hash.
        new_location = models.ImageLocation(
            content_hash=checksum,
            filename=f,
            path=root,
        )

        try:
            if new_image_content:
                db.add(new_image_content)
            db.add(new_location)
            db.commit()
            db.refresh(new_location) # Ensure the object is up-to-date after commit
            
            # Update FTS index for the new file
            update_fts_entry(db, new_location.id)
            db.commit()
            
            existing_checksums.add(checksum) # Update the in-memory set

            # After successfully adding, broadcast a websocket message if the loop is provided
            if loop and image_path_entry:
                # We need to construct the full image object to send to the client
                image_content = db.query(models.ImageContent).options(
                    joinedload(models.ImageContent.tags)
                ).filter_by(content_hash=new_location.content_hash).first()

                if image_content: # Just need to know if it exists to send a message
                    # Determine who to send the message to based on the folder's admin_only status
                    is_admin_only = image_path_entry.admin_only
                    asyncio.run_coroutine_threadsafe(manager.schedule_refresh_broadcast(admin_only=is_admin_only), loop)

            return new_location
        except IntegrityError:
            # This error is expected in a concurrent environment if another thread
            # has already added the same ImageContent or ImageLocation.
            db.rollback()
            return None
        except Exception as e:
            db.rollback()
            print(f"Database error while adding '{file_full_path}': {e}")
            return None

def cleanup_orphaned_image_locations(db: Session):
    # Finds and removes ImageLocation entries where the path does not exist in the ImagePath table.
    print("Checking for orphaned ImageLocation entries...")
    
    # Create a subquery to select all valid paths from the ImagePath table.
    valid_paths_subquery = db.query(models.ImagePath.path).scalar_subquery()

    # Find ImageLocation entries where the path is not in the subquery of valid paths.
    orphaned_locations_query = db.query(models.ImageLocation).filter(
        not_(models.ImageLocation.path.in_(valid_paths_subquery))
    )

    # Execute the delete operation.
    num_deleted = orphaned_locations_query.delete(synchronize_session=False)

    if num_deleted > 0:
        db.commit()
        print(f"Deleted {num_deleted} orphaned ImageLocation entries.")
    else:
        print("No orphaned ImageLocation entries found.")

def check_and_apply_folder_tags(db: Session):
    # Ensures all images within a folder have the tags assigned to that folder.
    print("Checking for folder tag inheritance consistency...")
    folders_with_tags = db.query(models.ImagePath).options(joinedload(models.ImagePath.tags)).filter(models.ImagePath.tags.any()).all()

    if not folders_with_tags:
        print("No folders with tags found. Skipping consistency check.")
        return

    for folder in folders_with_tags:
        folder_tag_ids = {tag.id for tag in folder.tags}
        if not folder_tag_ids:
            continue

        # Get all ImageContent objects for images in this folder
        content_hashes_in_path = db.query(models.ImageLocation.content_hash).filter(models.ImageLocation.path == folder.path).distinct()
        images_to_check = db.query(models.ImageContent).options(joinedload(models.ImageContent.tags)).filter(
            models.ImageContent.content_hash.in_(content_hashes_in_path)
        ).all()

        for image_content in images_to_check:
            image_tag_ids = {tag.id for tag in image_content.tags}
            missing_tags = [tag for tag in folder.tags if tag.id not in image_tag_ids]
            if missing_tags:
                print(f"Found image ID {image_content.content_hash} in '{folder.path}' missing {len(missing_tags)} folder tags. Applying them now.")
                image_content.tags.extend(missing_tags)

def scan_paths(db: Session):
    # Scans all configured paths for new subdirectories and files, committing each discovery immediately.
    print(f"[{datetime.now().isoformat()}] Starting file scan...")
    scan_start = datetime.now()

    new_subdirectories_found = 0
    total_new_files = 0
    total_directories_found = 0
    total_files = 0

    try:
        # Before scanning, clean up any locations that point to now-deleted paths.
        cleanup_orphaned_image_locations(db)

        # Also, ensure folder tags are correctly inherited by all images.
        check_and_apply_folder_tags(db)
        db.commit() # Commit any changes from the tag consistency check

        # Fetch all existing paths and checksums once at the start.
        paths_to_scan = db.query(models.ImagePath).all()
        
        # Sort paths to ensure consistent scan order
        paths_to_scan.sort(key=lambda p: p.path)

        existing_image_paths = {p.path for p in paths_to_scan}
        # Create a set of paths that are already tracked to prevent recursion overlap
        paths_to_scan_set = existing_image_paths.copy()
        
        existing_image_checksums = {row[0] for row in db.query(models.ImageContent.content_hash).all()}

        for image_path_entry in paths_to_scan:
            current_path = image_path_entry.path
            if not os.path.isdir(current_path):
                print(f"Warning: Configured path '{current_path}' does not exist or is not a directory. Skipping.")
                continue
            if image_path_entry.is_ignored == True:
                print(f'Directory ignored, skipping: {current_path}')
                continue
            
            print(f"Scanning directory: {current_path}")
            path_time = datetime.now()
            path_files_scanned = 0
            
            for root, dirs, files in os.walk(current_path, topdown=True):
                # Prevent recursing into subdirectories that are already tracked as separate ImagePaths
                # This ensures files are not counted multiple times across different path entries
                dirs[:] = [d for d in dirs if os.path.join(root, d) not in paths_to_scan_set]

                # --- Discover and immediately commit subdirectories ---
                for d in dirs:
                    subdir_full_path = os.path.join(root, d)
                    if subdir_full_path not in existing_image_paths:
                        try:
                            print(f"Found new subdirectory: {subdir_full_path}")
                            new_image_path = models.ImagePath(
                                path=subdir_full_path, parent=root, description=f"Auto-added: {d}",
                                short_name=d, is_ignored=False, admin_only=True, basepath=False, built_in=False
                            )
                            db.add(new_image_path)
                            db.commit()
                            existing_image_paths.add(subdir_full_path) # Update in-memory set
                            new_subdirectories_found += 1
                            print(f"Committed new subdirectory: {subdir_full_path}")
                        except Exception as e:
                            print(f"Error committing subdirectory {subdir_full_path}: {e}")
                            db.rollback()

                # --- Discover and immediately commit files ---
                files.sort(key=lambda fn: os.path.getctime(os.path.join(root, fn)))
                for f in files:
                    path_files_scanned += 1
                    file_full_path = os.path.join(root, f)
                    # During the main scan, we don't have the asyncio loop, so we can't send websockets here.
                    # The file watcher will handle real-time updates for newly created files.
                    # We pass the image_path_entry for consistency, though the loop is None.
                    newly_added_location = add_file_to_db(db, file_full_path, existing_image_checksums, image_path_entry, None)
                    if newly_added_location:
                        total_new_files += 1
            
            total_files += path_files_scanned
            total_directories_found += 1
            print(f"Scanned {path_files_scanned} files in '{current_path}' in {datetime.now() - path_time}.")
    finally:
        pass # The session is managed by the caller

    scan_duration = datetime.now() - scan_start
    print(f"[{datetime.now().isoformat()}] Full file scan of {total_directories_found} paths and {total_files} files finished in {scan_duration}.")
    print(f"[{datetime.now().isoformat()}] Found {new_subdirectories_found} new subdirectories and {total_new_files} new media files.")

def get_file_checksum(filepath: str, block_size=65536):
    # Calculates the SHA256 checksum of a file.
    sha256 = hashlib.sha256()
    try:
        with open(filepath, 'rb') as f:
            for block in iter(lambda: f.read(block_size), b''):
                sha256.update(block)
        return sha256.hexdigest()
    except Exception as e:
        print(f"Error calculating checksum for {filepath}: {e}")
        return None

def is_supported_media(filepath: str):
    # Checks if a file is a supported image or video based on its MIME type.
    mime_type, _ = mimetypes.guess_type(filepath)
    return mime_type and mime_type in SUPPORTED_MEDIA_TYPES

def generate_thumbnail_in_background(
    image_id: int,
    image_checksum: str,
    original_filepath: str,
    loop: Optional[asyncio.AbstractEventLoop] = None, # Add loop parameter
):
    # Use a short-lived session to get settings
    try:
        with database.SessionLocal() as db:
            thumb_size_setting = db.query(models.Setting).filter_by(name='max_thumb_size').first()
            if thumb_size_setting and thumb_size_setting.value:
                thumb_size = int(thumb_size_setting.value)
    except Exception as e:
        print(f"Background: Error fetching settings for image ID {image_id}: {e}")

    try:
        generate_thumbnail(
            image_id=image_id,
            source_filepath=original_filepath,
            output_filename_base=image_checksum,
            thumb_size=thumb_size
        )
        
        # Notify frontend via WebSocket
        if loop:
            with database.SessionLocal() as db:
                # Efficiently fetch just the admin_only flag by joining tables
                row = db.query(models.ImagePath.admin_only).select_from(models.ImageLocation)\
                    .outerjoin(models.ImagePath, models.ImageLocation.path == models.ImagePath.path)\
                    .filter(models.ImageLocation.id == image_id).first()

                if row is not None:
                    is_admin_only = row[0] if row[0] is not None else False
                    asyncio.run_coroutine_threadsafe(manager.schedule_refresh_broadcast(admin_only=is_admin_only), loop)
    except Exception as e:
        print(f"Background: Error generating thumbnail for image ID {image_id}: {e}")

def generate_thumbnail(
    image_id: int,
    source_filepath: str,
    output_filename_base: str,
    thumb_size: int,
) -> str:

    generated_urls = {}
    source_path_obj = source_filepath
    image_to_process = None
    temp_image_path = None

    if not os.path.exists(source_filepath):
        print(f"Error: Source file not found: {source_filepath}")
        return None

    # Determine if the file is a video based on its MIME type
    mime_type, _ = mimetypes.guess_type(source_filepath)
    is_video = mime_type and mime_type.startswith('video')

    # FIX THIS
    # Needs proper pathing
    thumbnail_output_dir = Path(str(config.THUMBNAILS_DIR))
    os.makedirs(thumbnail_output_dir, exist_ok=True)
    thumb_filepath = os.path.join(thumbnail_output_dir, f"{output_filename_base}_thumb.webp")

    if is_video:
        try:
            temp_image_path = os.path.join(thumbnail_output_dir, f'{output_filename_base}_thumb.png')
            # Use ffmpeg to generate thumbnail from video
            # -ss 00:00:01: Take a screenshot at 1 second into the video
            # -vframes 1: Take only one frame
            # -vf scale='min(iw,{thumb_size}):min(ih,{thumb_size})': Scale to fit within thumb_size while maintaining aspect ratio
            # -q:v 2: Output quality (2 is good, 1-31, lower is better)
            # -y: Overwrite output file without asking
            ffmpeg_command = [
                'ffmpeg',
                '-i', source_filepath,
                '-ss', '00:00:00.001',
                '-vframes', '1',
                '-vf', f"scale='min({thumb_size},iw)':'min({thumb_size},ih)':force_original_aspect_ratio=decrease",
                '-q:v', '2',
                '-y',
                str(temp_image_path)
            ]
            print(f"Running FFmpeg command: {' '.join(ffmpeg_command)}")
            subprocess.run(ffmpeg_command, check=True, capture_output=True)
            print(f"Generated video thumbnail: {thumb_filepath}")

            image_to_process = PILImage.open(temp_image_path)
        except subprocess.CalledProcessError as e:
            print(f"Error generating video thumbnail with ffmpeg for {source_filepath}: {e}")
            print(f"FFmpeg stdout: {e.stdout.decode()}")
            print(f"FFmpeg stderr: {e.stderr.decode()}")
        except Exception as e:
            print(f"Error executing ffmpeg for {source_filepath}: {e}")
    else:
        image_to_process = PILImage.open(source_filepath)

    try:

        # Generate Thumbnail
        thumb_img = image_to_process.copy()
        thumb_img.thumbnail((thumb_size,thumb_size))
        
        thumb_filepath = thumbnail_output_dir / f"{output_filename_base}_thumb.webp"
        temp_thumb_filepath = thumbnail_output_dir / f"{output_filename_base}_thumb.webp.tmp"
        thumb_img.save(temp_thumb_filepath, "webp")
        thumb_img.close()
        image_to_process.close()

    except PILImage.UnidentifiedImageError:
        print(f"Warning: Could not identify image format for {source_filepath}. Skipping image thumbnail generation.")
    except Exception as e:
        print(f"Error generating image thumbnail for {source_filepath}: {e}")
        return None

    # Atomic move to final destination
    os.replace(temp_thumb_filepath, thumb_filepath)

    if (temp_image_path):
        if (os.path.exists(temp_image_path)):
            try:
                os.remove(temp_image_path)
            except Exception as e:
                print(f"Error deleting temporary file {temp_image_path}: {e}")
                return None

    return thumb_filepath

def generate_preview_in_background(
    image_id: int,
    image_checksum: str,
    original_filepath: str,
    preview_size: int,
):
    try:
        print(f"Background: Starting preview generation for image ID {image_id}, checksum {image_checksum}")
        generate_preview(
            source_filepath=original_filepath,
            output_filename_base=image_checksum,
            preview_size=preview_size
        )
        print(f"Background: Finished preview generation for image ID {image_id}")
    except Exception as e:
        print(f"Background: Error generating preview for image ID {image_id}: {e}")

# FIX THIS
# Functions were split for thumbnails and previews.
# Recombine after restructure?
def generate_preview(
    source_filepath: str,
    output_filename_base: str,
    preview_size: int
) -> dict:

    source_path_obj = Path(source_filepath)

    if not source_path_obj.is_file():
        print(f"Error: Source file not found: {source_filepath}")
        return

    try:
        img = PILImage.open(source_filepath)

        import config

        # FIX THIS
        # Needs proper pathing
        preview_output_dir = Path(str(config.PREVIEWS_DIR))

        os.makedirs(preview_output_dir, exist_ok=True)

        # Generate Preview
        preview_img = img.copy()
        preview_img.thumbnail((preview_size,preview_size))
        preview_filepath = preview_output_dir / f"{output_filename_base}_preview.webp"
        preview_img.save(preview_filepath, "webp")
        print(f"Generated preview: {preview_filepath}")

    except PILImage.UnidentifiedImageError:
        print(f"Warning: Could not identify image format for {source_filepath}. Skipping image preview generation.")
    except Exception as e:
        print(f"Error generating image preview for {source_filepath}: {e}")

    return preview_filepath

def reprocess_metadata_task(db_session_factory, scope: str, identifier: Optional[int | str] = None):
    """
    A background task to reprocess metadata for images.

    Args:
        db_session_factory: A callable that returns a new SQLAlchemy Session.
        scope (str): The scope of reprocessing ('file', 'directory', 'all').
        identifier (Optional[Union[int, str]]): The identifier for the scope.
            - For 'file', this is the ImageLocation ID (int).
            - For 'directory', this is the path (str).
            - For 'all', this is not used.
    """
    db = db_session_factory()
    try:
        print(f"[{datetime.now().isoformat()}] Starting metadata reprocessing task for scope: {scope}, identifier: {identifier}")
        start_time = time.time()

        locations_to_process = []
        if scope == 'file':
            location = db.query(models.ImageLocation).filter(models.ImageLocation.id == identifier).first()
            if location:
                locations_to_process.append(location)
        elif scope == 'directory':
            locations_to_process = db.query(models.ImageLocation).filter(models.ImageLocation.path == identifier).all()
        elif scope == 'all':
            locations_to_process = db.query(models.ImageLocation).all()

        if not locations_to_process:
            print(f"[{datetime.now().isoformat()}] No items found to reprocess for scope: {scope}, identifier: {identifier}")
            return

        total_items = len(locations_to_process)
        print(f"Found {total_items} items to reprocess.")

        for index, location in enumerate(locations_to_process):
            full_path = os.path.join(location.path, location.filename)
            if not os.path.exists(full_path):
                print(f"Skipping {full_path} (item {index + 1}/{total_items}): File not found.")
                continue

            print(f"Reprocessing {full_path} (item {index + 1}/{total_items})...")
            new_meta, width, height = get_meta(full_path)

            image_content = db.query(models.ImageContent).filter(models.ImageContent.content_hash == location.content_hash).first()

            if image_content:
                # Update exif_data, width, and height
                image_content.width = width
                image_content.height = height
                
                # Preserve existing mime_type if it exists in the old metadata
                try:
                    existing_meta = json.loads(image_content.exif_data) if isinstance(image_content.exif_data, str) else image_content.exif_data
                    if 'mime_type' in existing_meta:
                        new_meta['mime_type'] = existing_meta['mime_type']
                except (json.JSONDecodeError, TypeError):
                    pass # Ignore if old metadata is invalid

                image_content.exif_data = json.dumps(_sanitize_for_json(new_meta))
                db.commit()

        duration = time.time() - start_time
        print(f"[{datetime.now().isoformat()}] Finished metadata reprocessing task for {total_items} items in {duration:.2f} seconds.")
    finally:
        db.close()

def rebuild_fts_index(db_session_factory):
    """
    Rebuilds the FTS5 index for all images.
    """
    db = db_session_factory()
    try:
        print(f"[{datetime.now().isoformat()}] Starting FTS index rebuild...")
        start_time = time.time()
        
        # Drop and recreate the table to ensure clean state and correct schema
        db.execute(text("DROP TABLE IF EXISTS image_fts_index"))
        db.execute(text("""
            CREATE VIRTUAL TABLE image_fts_index USING fts5(
                location_id UNINDEXED,
                path,
                filename,
                prompt,
                negative_prompt,
                model,
                sampler,
                scheduler,
                loras,
                upscaler,
                application,
                tags,
                stub,
                full_text
            )
        """))
        db.commit()
        
        # Fetch all locations with their content
        locations = db.query(models.ImageLocation).options(
            joinedload(models.ImageLocation.content).joinedload(models.ImageContent.tags)
        ).all()
        
        batch_size = 100
        batch = []
        
        for loc in locations:
            print(f"Processing ID: {loc.id} Path: {loc.path} Filename: {loc.filename}")
            content = loc.content
            if not content:
                continue
            
            try:
                exif = json.loads(content.exif_data) if content.exif_data else {}
            except (json.JSONDecodeError, TypeError):
                exif = {}
                
            tags_list = [t.name for t in content.tags] if content.tags else []
            tags_str = " ".join(tags_list)

            data = search_handler.flatten_exif_to_fts(loc.id, loc.path, loc.filename, exif, tags_str)
            batch.append(data)
            
            if len(batch) >= batch_size:
                db.execute(text("INSERT INTO image_fts_index (rowid, location_id, path, filename, prompt, negative_prompt, model, sampler, scheduler, loras, upscaler, application, tags, stub, full_text) VALUES (:location_id, :location_id, :path, :filename, :prompt, :negative_prompt, :model, :sampler, :scheduler, :loras, :upscaler, :application, :tags, :stub, :full_text)"), batch)
                db.commit()
                batch = []
        
        if batch:
            db.execute(text("INSERT INTO image_fts_index (rowid, location_id, path, filename, prompt, negative_prompt, model, sampler, scheduler, loras, upscaler, application, tags, stub, full_text) VALUES (:location_id, :location_id, :path, :filename, :prompt, :negative_prompt, :model, :sampler, :scheduler, :loras, :upscaler, :application, :tags, :stub, :full_text)"), batch)
            db.commit()
            
        duration = time.time() - start_time
        print(f"[{datetime.now().isoformat()}] FTS index rebuild finished in {duration:.2f} seconds.")
    except Exception as e:
        print(f"Error rebuilding FTS index: {e}")
        db.rollback()
    finally:
        db.close()

def purge_thumbnails() -> int:
    """
    Deletes all files in the thumbnails directory.
    Returns the number of files deleted.
    """
    directory = Path(str(config.THUMBNAILS_DIR))
    if not directory.exists():
        return 0
    
    count = 0
    for item in directory.iterdir():
        if item.is_file():
            try:
                item.unlink()
                count += 1
            except Exception as e:
                print(f"Error deleting thumbnail {item}: {e}")
    return count

def purge_previews() -> int:
    """
    Deletes all files in the previews directory.
    Returns the number of files deleted.
    """
    directory = Path(str(config.PREVIEWS_DIR))
    if not directory.exists():
        return 0
    
    count = 0
    for item in directory.iterdir():
        if item.is_file():
            try:
                item.unlink()
                count += 1
            except Exception as e:
                print(f"Error deleting preview {item}: {e}")
    return count

def vacuum_database() -> Tuple[bool, str]:
    """
    Runs the VACUUM command on the database to rebuild it.
    This can help recover from fragmentation and minor corruption.
    """
    engine = database.engine
    try:
        print(f"[{datetime.now().isoformat()}] Starting database VACUUM process...")
        start_time = time.time()
        
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
            connection.execute(text("VACUUM"))
        
        duration = time.time() - start_time
        message = f"Database vacuum completed successfully in {duration:.2f} seconds."
        print(f"[{datetime.now().isoformat()}] {message}")
        return True, message
    except Exception as e:
        message = f"Error during database vacuum: {e}"
        print(f"Error during database VACUUM: {e}")
        return False, message
