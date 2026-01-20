from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os, threading
from contextlib import asynccontextmanager
import asyncio
from typing import Optional
from jose import JWTError, jwt

from sqlalchemy.orm import Session
import config
import models
import database
import image_processor
import auth
from websocket_manager import manager
from file_watcher import start_file_watcher

# Import APIRouters
from routes import auth_routes
from routes import core_routes
from routes import user_routes
from routes import tag_routes
from routes import image_path_routes
from routes import image_routes
from routes import setting_routes
#from routes import device_setting_routes
from routes import filter_routes


#from routes import user_filter_routes

# --- Application Lifespan Context Manager ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Handles application startup and shutdown events.

    # Startup Events
    print("Application startup initiated...")
    print("Creating database tables if they don't exist...")
    # Store the main event loop in a globally accessible place
    database.main_event_loop = asyncio.get_running_loop()
    print("Main event loop captured.")
    models.Base.metadata.create_all(bind=database.engine)
    print("Database tables checked/created.")

    # Initialize a database session for initial data population
    db = database.SessionLocal()
    try:
        # Populate initial data if tables are empty
        if not db.query(models.Tag).first():
            print("Adding initial Tags...")
            db.add(models.Tag(name='Favorite', built_in=True))
            db.add(models.Tag(name='Like', built_in=True))
            db.add(models.Tag(name='NSFW', built_in=True))
            db.commit()
            # Refresh the session for the Tag object to be accessible after commit,
            # especially for the relationship linking below.
            db.refresh(db.query(models.Tag).filter_by(name='NSFW').first())

        if not db.query(models.Setting).first():
            print("Adding initial Settings...")
            db.add(models.Setting(name='left_enabled', value='True', admin_only=False,
                                 display_name='Enable Left Icons', description='Controls if the left icons are enabled.',
                                 group='Appearance', input_type='switch'))
            db.add(models.Setting(name='right_enabled', value='False', admin_only=False,
                                 display_name='Enable Right Icons', description='Controls if the right icons are enabled.',
                                 group='Appearance', input_type='switch'))
            db.add(models.Setting(name='allow_signup', value='False', admin_only=True,
                                 display_name='Allow New User Signup', description='If enabled, new users can register themselves. Admin only.',
                                 group='Security', input_type='switch'))
            db.add(models.Setting(name='allow_login', value='False', admin_only=True,
                                 display_name='Allow User Login', description='If disabled, only admins can log in. Admin only.',
                                 group='Security', input_type='switch'))
            db.add(models.Setting(name='allow_tag_add', value='False', admin_only=True,
                                 display_name='Allow Tag Add to Image', description='Allow users to add existing tags to images.',
                                 group='Permissions', input_type='switch'))
            db.add(models.Setting(name='allow_tag_remove', value='False', admin_only=True,
                                 display_name='Allow Tag Remove from Image', description='Allow users to remove tags from images.',
                                 group='Permissions', input_type='switch'))
            db.add(models.Setting(name='allow_tag_create', value='False', admin_only=True,
                                 display_name='Allow Tag Creation', description='Allow users to create new tags.',
                                 group='Permissions', input_type='switch'))
            db.add(models.Setting(name='allow_tag_delete', value='False', admin_only=True,
                                 display_name='Allow Tag Deletion', description='Allow users to delete tags permanently.',
                                 group='Permissions', input_type='switch'))
            db.add(models.Setting(name='allow_tag_edit', value='False', admin_only=True,
                                 display_name='Allow Tag Edit', description='Allow users to edit existing tags (name, color, etc.).',
                                 group='Permissions', input_type='switch'))
            db.add(models.Setting(name='allow_folder_tag_add', value='False', admin_only=True,
                                 display_name='Allow Folder Tag Add', description='Allow users to add tags to folders.',
                                 group='Permissions', input_type='switch'))
            db.add(models.Setting(name='allow_folder_tag_remove', value='False', admin_only=True,
                                 display_name='Allow Folder Tag Remove', description='Allow users to remove tags from folders.',
                                 group='Permissions', input_type='switch'))
            db.add(models.Setting(name='thumb_size', value='400', admin_only=True,
                                 display_name='Thumbnail Size (px)', description='Max dimension for generated image thumbnails.',
                                 group='Media', input_type='number'))
            db.add(models.Setting(name='flyout', value='False', admin_only=True,
                                 display_name='Enable Flyout Mode', description='Enable flyout mode for external media display.',
                                 group='Flyout', input_type='switch'))
            db.add(models.Setting(name='flyout_address', value='False', admin_only=True,
                                 display_name='Flyout Server Address', description='Address for the flyout server if enabled.',
                                 group='Flyout', input_type='text'))
            db.add(models.Setting(name='thumb_num', value='60', admin_only=False,
                                 display_name='Thumbnails Per Page', description='Number of thumbnails to display per page in the image grid.',
                                 group='Appearance', input_type='number'))
            db.add(models.Setting(name='enable_previews', value='False', admin_only=False,
                                 display_name='Enable Previews', description='Enable generation and display of larger image previews.',
                                 group='Media', input_type='switch'))
            db.add(models.Setting(name='preview_size', value='1024', admin_only=True,
                                 display_name='Preview Size (px)', description='Max dimension for generated image previews.',
                                 group='Media', input_type='number'))
            db.add(models.Setting(name='thumb_offset', value='0', admin_only=False,
                                 display_name='Thumbnail Offset', description='Change this to increase or decrease thumbnail size.',
                                 group='Appearance', input_type='number'))
            db.add(models.Setting(name='theme', value='default', admin_only=False,
                                 display_name='Default Theme', description='The default visual theme of the application (e.g., "default", "dark", "light").',
                                 group='Appearance', input_type='text')) # Could be a dropdown in future
            db.commit()

        if not db.query(models.Filter).first():
            print("Adding initial Filter...")
            db.add(models.Filter(
                name='Explicit Content',
                header_display=1,
                main_stage="hide",
                main_stage_color="btn-primary",
                main_stage_icon="MdOutlineExplicit",
                second_stage="show",
                second_stage_color="btn-orange",
                second_stage_icon="MdOutlineExplicit",
                third_stage="show_only",
                third_stage_color="btn-red",
                third_stage_icon="MdOutlineExplicit",
                search_terms='nude|penis|pussy|cock|handjob|fellatio|"anal"|vagina|"ass"|blowjob|deepthroat|irrumatio|oral|"cum"|testicle|cameltoe|uncensored|"open clothes"|"spread legs"'
            ))
            db.commit() # Commit filter first to get its ID

            first_filter_tag = db.query(models.Tag).filter_by(name='NSFW').first()
            first_filter = db.query(models.Filter).filter_by(name='Explicit Content').first()

            if first_filter and first_filter_tag:
                first_filter.tags.append(first_filter_tag)
                db.commit()

        if not db.query(models.User).first():
            print("No users found. Creating a default admin user: admin/adminpass")
            hashed_password = auth.get_password_hash("adminpass")
            admin_user = models.User(username="admin", password_hash=hashed_password, admin=True, login_allowed=True)
            db.add(admin_user)
            db.commit()
            print("Default admin user created.")

        # Run the initial file scan during startup
        print("Running initial file scan...")
        def run_initial_scan_in_thread():
            thread_db = database.SessionLocal()
            try:
                image_processor.scan_paths(thread_db)
            finally:
                thread_db.close()

        # Start the thread for the initial scan
        initial_scan_thread = threading.Thread(target=run_initial_scan_in_thread)
        initial_scan_thread.daemon = True # Allow the program to exit even if this thread is running
        initial_scan_thread.start()

    finally:
        db.close()

    # Start the file watcher in a background thread
    print("Starting file watcher thread...")
    watcher_thread = threading.Thread(
        target=start_file_watcher, args=(database.main_event_loop,), daemon=True
    )
    watcher_thread.start()

    yield

    # Shutdown Events
    print("Application shutdown initiated.")


# --- Initialize FastAPI app with the lifespan context manager ---
app = FastAPI(lifespan=lifespan)

# --- CORS Configuration ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"], # Allows all methods (GET, POST, PUT, DELETE, etc.)
    allow_headers=["*"], # Allows all headers
)

@app.websocket("/ws/image-updates")
async def websocket_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
    db: Session = Depends(database.get_db)
):
    """
    This is the main WebSocket endpoint for clients to connect to.
    """
    await websocket.accept()
    user: Optional[models.User] = None
    if token:
        try:
            # Manually decode token and fetch user with the endpoint's db session
            # This replicates the logic from auth.get_current_user without being a dependency
            payload = jwt.decode(token, config.SECRET_KEY, algorithms=[auth.ALGORITHM])
            username: str = payload.get("sub")
            if username is None:
                user = None # Or raise an exception if you want to close the connection
            else:
                user = db.query(models.User).filter(models.User.username == username).first()

        except (JWTError, Exception):
            # If token is invalid, user remains None, resulting in an anonymous connection.
            pass
    await manager.connect(websocket, user)
    try:
        # This loop keeps the connection alive.
        # It waits for messages from the client, but we won't do anything
        # with them in this basic example.
        while True:
            # We must await something here to keep the connection open
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, user)

# --- Include Routers ---
app.include_router(auth_routes.router, prefix="/api", tags=["Auth"])
app.include_router(core_routes.router, prefix="/api", tags=["Core"])
app.include_router(user_routes.router, prefix="/api", tags=["Users"])
app.include_router(tag_routes.router, prefix="/api", tags=["Tags"])
app.include_router(image_path_routes.router, prefix="/api", tags=["ImagePaths"])
app.include_router(image_routes.router, prefix="/api", tags=["Images"])
app.include_router(setting_routes.router, prefix="/api", tags=["Settings"])
#-- combined with above setting_routes.py #app.include_router(device_setting_routes.router, prefix="/api", tags=["DeviceSettings"])
app.include_router(filter_routes.router, prefix="/api", tags=["Filters"])
# app.include_router(user_filter_routes.router, prefix="/api", tags=["UserFilters"])
# app.include_router(todo_routes.router, prefix="/api", tags=["Todos"])

# --- Serve Static Files (Frontend) ---
# Check if the frontend build directory exists before mounting StaticFiles.
# This ensures that `uvicorn` doesn't fail if the frontend hasn't been built yet.
if config.FRONTEND_BUILD_DIR.is_dir():
    # Mount the static files directory.
    # The `html=True` argument ensures that if a file like `index.html` is requested
    # directly, it will be served. More importantly, it allows serving `index.html`
    # for all routes that don't match an API endpoint, which is crucial for
    # client-side routing (e.g., React Router).
    app.mount(
        "/", # Serve the frontend from the root URL of the FastAPI application
        StaticFiles(directory=config.FRONTEND_BUILD_DIR, html=True),
        name="frontend"
    )
    print(f"Serving frontend from: {config.FRONTEND_BUILD_DIR}")
else:
    print(f"Frontend build directory not found at: {config.FRONTEND_BUILD_DIR}")
    print("Please run 'npm run build' in the frontend directory first.")

# Mount the static directory for generated media
if config.STATIC_DIR.is_dir():
    app.mount(
        config.STATIC_FILES_URL_PREFIX,
        StaticFiles(directory=config.STATIC_DIR),
        name="static"
    )
    print(f"Serving static assets from: {config.STATIC_DIR} at URL prefix: {config.STATIC_FILES_URL_PREFIX}")
else:
    print(f"Static directory not found at: {config.STATIC_DIR}. Generated media will not be served.")