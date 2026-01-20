import asyncio
import json
import os
import threading
from typing import Dict, List

from sqlalchemy.orm import Session
from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

import database
import image_processor
import models
import config
import schemas
from websocket_manager import manager

observer = None

def get_watched_paths(db: Session) -> List[str]:
    """Fetches all directory paths from the ImagePath table."""
    print("File Watcher: Fetching paths to watch from database.")
    return [p.path for p in db.query(models.ImagePath).filter(models.ImagePath.is_ignored == False).all()]


class ImageChangeEventHandler(FileSystemEventHandler):
    """Handles file system events and notifies clients via WebSockets."""

    def __init__(self, loop: asyncio.AbstractEventLoop):
        self.loop = loop

    def _get_db(self):
        """Provides a database session for the event handler.
        A new session is created for each event to ensure thread safety."""
        return database.SessionLocal()

    def _is_supported_media(self, path: str) -> bool:
        """Check if the file is a supported media type."""
        return image_processor.is_supported_media(path)

    def _schedule_broadcast(self, message: Dict):
        """Safely schedules a broadcast on the main asyncio event loop."""
        asyncio.run_coroutine_threadsafe(manager.broadcast_json(message), self.loop)

    def on_created(self, event: FileSystemEvent):
        if not event.is_directory and self._is_supported_media(event.src_path):
            print(f"File Watcher: Created {event.src_path}")
            db = self._get_db()
            image_path = os.path.dirname(event.src_path)
            try:
                # Find the corresponding ImagePath entry to check its admin_only status.
                # This is crucial for determining who should receive the websocket notification.
                image_path_entry = db.query(models.ImagePath).filter(models.ImagePath.path == image_path).first()
                if not image_path_entry:
                    # This can happen if a file is added to a directory that is not yet tracked in the DB.
                    # The main periodic scanner will pick it up later.
                    print(f"File Watcher: Skipping file in untracked path: {event.src_path}")
                    return

                # Get existing checksums to avoid redundant DB queries in add_file_to_db
                existing_checksums = {row[0] for row in db.query(models.ImageContent.content_hash).all()}
                
                # Add the file to the DB. Pass the loop and path entry so it can handle the broadcast.
                image_processor.add_file_to_db(
                    db, event.src_path, existing_checksums, image_path_entry, self.loop
                )
                # The commit is handled within add_file_to_db
            except Exception as e:
                print(f"File Watcher: Error processing created file {event.src_path}: {e}")
                db.rollback()
            finally:
                db.close()

    def on_deleted(self, event: FileSystemEvent):
        if not event.is_directory:
            db = self._get_db()
            try:
                # We are deleting an ImageLocation, not the content itself.
                location_to_delete = db.query(models.ImageLocation).filter(
                    models.ImageLocation.path == os.path.dirname(event.src_path),
                    models.ImageLocation.filename == os.path.basename(event.src_path)
                ).first()

                if location_to_delete:
                    # The record exists, so we can proceed with deletion.
                    # This is the expected path for files deleted outside the application.
                    image_id_to_broadcast = location_to_delete.id
                    db.delete(location_to_delete)
                    db.commit()
                    message = {"type": "image_deleted", "image_id": image_id_to_broadcast}
                    self._schedule_broadcast(message)
                    print(f"File Watcher: Deleted image location {image_id_to_broadcast} from DB and sent notification.")
                else:
                    # The record was already deleted, likely by an API call (e.g., 'Empty Trash').
                    # This is expected, so we can just ignore it and not send a redundant notification.
                    pass
            except Exception as e:
                print(f"File Watcher: Error processing deleted file {event.src_path}: {e}")
                db.rollback()
            finally:
                db.close()

    def on_moved(self, event: FileSystemEvent):
        if not event.is_directory and self._is_supported_media(event.dest_path):
            print(f"File Watcher: Moved {event.src_path} to {event.dest_path}")
            db = self._get_db()
            try:
                # Find the ImageLocation entry for the source path
                location_to_move = db.query(models.ImageLocation).filter(
                    models.ImageLocation.path == os.path.dirname(event.src_path),
                    models.ImageLocation.filename == os.path.basename(event.src_path)
                ).first()

                if location_to_move:
                    new_dir, new_filename = os.path.split(event.dest_path)
                    print(f"File Watcher: Updating path for image location ID {location_to_move.id}")
                    location_to_move.path = new_dir
                    location_to_move.filename = new_filename
                    db.commit()
                    
                    # Determine who to notify based on folder visibility.
                    source_path_entry = db.query(models.ImagePath).filter_by(path=os.path.dirname(event.src_path)).first()
                    dest_path_entry = db.query(models.ImagePath).filter_by(path=new_dir).first()
                    
                    # If either the source or destination is public, notify everyone.
                    # Otherwise, if both are admin-only, only notify admins.
                    is_source_admin = source_path_entry.admin_only if source_path_entry else True
                    is_dest_admin = dest_path_entry.admin_only if dest_path_entry else True
                    
                    message = {"type": "refresh_images", "reason": "images_moved"}
                    
                    if not is_source_admin or not is_dest_admin:
                        # If either path is public, broadcast to all.
                        asyncio.run_coroutine_threadsafe(manager.broadcast_json(message), self.loop)
                        print(f"File Watcher: Sent 'refresh_images' (moved) notification to all users.")
                    else:
                        # If both are admin-only, broadcast only to admins.
                        asyncio.run_coroutine_threadsafe(manager.broadcast_to_admins_json(message), self.loop)
                        print(f"File Watcher: Sent 'refresh_images' (moved) notification to admins only.")
            except Exception as e:
                print(f"File Watcher: Error processing moved file {event.src_path}: {e}")
                db.rollback()
            finally:
                db.close()


def start_file_watcher(loop: asyncio.AbstractEventLoop):
    """Starts the file watcher in a background thread."""
    global observer
    if observer is not None:
        print("File Watcher: Already running.")
        return
    
    print("File watcher starting...")
    db = database.SessionLocal()
    try:
        all_paths = get_watched_paths(db)
    finally:
        db.close()

    if not all_paths:
        print("File Watcher: No paths configured to watch.")
        return

    # --- OPTIMIZATION ---
    # Reduce redundant watches by finding only the top-level directories.
    # For example, if we have ['/a/b', '/a/b/c'], we only need to watch '/a/b' recursively.
    
    # Sort paths to ensure parent directories come before their children.
    all_paths.sort()
    
    paths_to_watch = []
    for path in all_paths:
        # Check if the current path is a sub-directory of a path we've already decided to watch.
        if not any(path.startswith(p.rstrip(os.sep) + os.sep) for p in paths_to_watch):
            paths_to_watch.append(path)

    event_handler = ImageChangeEventHandler(loop)
    observer = Observer()

    for path in paths_to_watch:
        if os.path.exists(path):
            print(f"File Watcher: Watching directory '{path}'")
            observer.schedule(event_handler, path, recursive=True)
        else:
            print(f"File Watcher: Path '{path}' does not exist. Skipping.")

    observer.start()
    print(f"File watcher is running in background, monitoring {len(paths_to_watch)} top-level path(s).")

def stop_file_watcher():
    """Stops the file watcher thread safely."""
    global observer
    if observer:
        print("File Watcher: Stopping...")
        observer.stop()
        observer.join()
        observer = None
        print("File Watcher: Stopped.")
