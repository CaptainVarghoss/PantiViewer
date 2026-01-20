import os
from pathlib import Path
import configparser

# --- Path Definitions ---
# These are based on the file structure and should remain at the top.
CURRENT_DIR = Path(__file__).parent
PROJECT_ROOT = CURRENT_DIR.parent

# --- User Config File Handling ---
USER_CONFIG_FILE = PROJECT_ROOT / "user_config.ini"

def generate_default_config():
    """Generates a default user_config.ini file if it doesn't exist."""
    default_config = configparser.ConfigParser(allow_no_value=True)

    # --- Server Section ---
    default_config['Server'] = {
        '# Host address. Use "127.0.0.1" (default) for only access on local computer. Use "0.0.0.0" instead to allow access from any device on the network.': None,
        'FRONTEND_HOST': '127.0.0.1',
        '# Port number for the FastAPI server.': None,
        'FRONTEND_PORT': '5173',
        '# BACKEND_HOST and BACKEND_PORT can also be set if needed.': None,
        '#': None,
        '# Comma-separated list of allowed CORS origins. Most people don\'t need to change this': None,
        '# Uncomment and enter the urls needed for CORS e.g., http://mydomain.com:5173,http://myotherdomain:5673': None,
        '# CORS_ALLOWED_ORIGINS': ''
    }

    # --- Security Section ---
    default_config['Security'] = {
        '# Access Token Expiration Time (in minutes). Default is 30 days.': None,
        'ACCESS_TOKEN_EXPIRE_MINUTES': '43200',
        '# Secret key for JWT signing. CHANGE THIS.': None,
        '# Generate with: openssl rand -hex 32': None,
        'SECRET_KEY': 'your-super-secret-key-replace-me'
    }

    # --- Database Section ---
    default_config['Database'] = {
        '# Database connection string.': None,
        '# Leave empty to use the default local SQLite database.': None,
        '# Example: postgresql://user:password@localhost/dbname': None,
        'SQLALCHEMY_DATABASE_URL': '',
        '#': None,
        '# Optional: Custom path for the SQLite database file.': None,
        '# Used if SQLALCHEMY_DATABASE_URL is not set.': None,
        'SQLITE_DB_PATH': ''
    }

    # --- Media Section ---
    default_config['Media'] = {
        '# Thumbnail and preview base size.': None,
        '# These should not need to be changed.'
        '# Max dimension (width or height) for generated thumbnails in pixels.': None,
        'THUMBNAIL_SIZE': '400',
        '# Max dimension for generated previews in pixels.': None,
        'PREVIEW_SIZE': '1024'
    }

    with open(USER_CONFIG_FILE, 'w') as configfile:
        configfile.write("# Panti Viewer User Configuration File\n")
        configfile.write("# This file is for user-specific settings. It overrides the application defaults.\n")
        configfile.write("# Environment variables will override settings in this file.\n\n")
        default_config.write(configfile)
    print(f"Generated default configuration file at: {USER_CONFIG_FILE}")

# Check if user config exists, create if not
if not USER_CONFIG_FILE.exists():
    generate_default_config()
else:
    print(f'Loading default configuration file from: {USER_CONFIG_FILE}')

# Read user config
config = configparser.ConfigParser()
config.read(USER_CONFIG_FILE)

# --- Server Configuration ---
frontend_host_from_config = config.get('Server', 'FRONTEND_HOST', fallback='0.0.0.0')
FRONTEND_HOST = os.getenv("FRONTEND_HOST", frontend_host_from_config)

frontend_port_from_config = config.getint('Server', 'FRONTEND_PORT', fallback=5173)
FRONTEND_PORT = int(os.getenv("FRONTEND_APP_PORT", frontend_port_from_config))

# --- Backend Server Configuration ---
backend_host_from_config = config.get('Server', 'BACKEND_HOST', fallback='0.0.0.0')
BACKEND_HOST = os.getenv("BACKEND_APP_HOST", backend_host_from_config)
BACKEND_HOST_LISTEN = os.getenv("BACKEND_HOST_LISTEN", "0.0.0.0")
backend_port_from_config = config.getint('Server', 'BACKEND_PORT', fallback=8000)
BACKEND_PORT = int(os.getenv("BACKEND_APP_PORT", backend_port_from_config))

# --- Security Settings ---
token_expire_from_config = config.getint('Security', 'ACCESS_TOKEN_EXPIRE_MINUTES', fallback=43200)
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", token_expire_from_config))

secret_key_from_config = config.get('Security', 'SECRET_KEY', fallback='your-super-secret-key-replace-me')
SECRET_KEY = os.getenv("SECRET_KEY", secret_key_from_config)

# --- CORS Origins
default_cors_list = [
    f"http://{FRONTEND_HOST}:{FRONTEND_PORT}",
    f"https://{FRONTEND_HOST}:{FRONTEND_PORT}", # Include HTTPS for production scenarios
    f"http://localhost:{FRONTEND_PORT}", # Keep for separate frontend development (Vite's default)
    f"http://127.0.0.1:{FRONTEND_PORT}",
    f"http://{BACKEND_HOST}:{FRONTEND_PORT}", # Allow access from the backend's host IP
    f"http://{BACKEND_HOST}:{BACKEND_PORT}", # Allow backend to be an origin
]
default_cors_str = ",".join(default_cors_list)
cors_from_config = config.get('Server', 'CORS_ALLOWED_ORIGINS', fallback=default_cors_str)
cors_from_env = os.getenv("CORS_ALLOWED_ORIGINS", cors_from_config)
CORS_ALLOWED_ORIGINS = [origin.strip() for origin in cors_from_env.split(',')]

# --- Database Configuration ---
database_url_from_config = config.get('Database', 'SQLALCHEMY_DATABASE_URL', fallback='')
sqlite_db_path_from_config = config.get('Database', 'SQLITE_DB_PATH', fallback='')

if database_url_from_config:
    final_database_url = database_url_from_config
elif sqlite_db_path_from_config:
    final_database_url = f"sqlite:///{sqlite_db_path_from_config}"
else:
    final_database_url = f"sqlite:///{CURRENT_DIR / 'sql_app.db'}"

SQLALCHEMY_DATABASE_URL = os.getenv("SQLALCHEMY_DATABASE_URL", final_database_url)
DATABASE_URL = SQLALCHEMY_DATABASE_URL
SQLALCHEMY_CONNECT_ARGS = {"check_same_thread": False} if SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {}


# --- Media Configuration ---
# Top-level static directory relative to project root
STATIC_DIR_NAME = 'static'
STATIC_DIR = PROJECT_ROOT / STATIC_DIR_NAME

DEFAULT_STATIC_IMAGES_DIR_NAME = 'images'
DEFAULT_STATIC_IMAGES_DIR = STATIC_DIR / DEFAULT_STATIC_IMAGES_DIR_NAME

# --- Frontend Build Configuration ---
# These paths are derived from the project structure and are less likely to be configured by a user.
FRONTEND_DIR_NAME = "frontend"
FRONTEND_BUILD_DIR_NAME = "dist"
FRONTEND_BUILD_DIR = PROJECT_ROOT / FRONTEND_DIR_NAME / FRONTEND_BUILD_DIR_NAME


# --- Generated Media Configuration ---
# These are derived from other settings and project structure.

# Subdirectories for generated media within 'static'
GENERATED_MEDIA_DIR_NAME = "generated_media"
THUMBNAILS_DIR_NAME = "thumbnails"
PREVIEWS_DIR_NAME = "previews"

# Absolute paths for generated media storage
GENERATED_MEDIA_ROOT = STATIC_DIR / GENERATED_MEDIA_DIR_NAME
THUMBNAILS_DIR = GENERATED_MEDIA_ROOT / THUMBNAILS_DIR_NAME
PREVIEWS_DIR = GENERATED_MEDIA_ROOT / PREVIEWS_DIR_NAME

# Sizes for generated images
thumb_size_from_config = config.getint('Media', 'THUMBNAIL_SIZE', fallback=400)
THUMBNAIL_SIZE = int(os.getenv("THUMBNAIL_SIZE", thumb_size_from_config))

preview_size_from_config = config.getint('Media', 'PREVIEW_SIZE', fallback=1024)
PREVIEW_SIZE = int(os.getenv("PREVIEW_SIZE", preview_size_from_config))

# URL path where generated media will be served by FastAPI
# All contents of STATIC_DIR will be served under this prefix
STATIC_FILES_URL_PREFIX = "/static_assets"

# Create these directories if they don't exist
os.makedirs(THUMBNAILS_DIR, exist_ok=True)
os.makedirs(PREVIEWS_DIR, exist_ok=True)