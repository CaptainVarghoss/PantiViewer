from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from typing import Optional
import asyncio
import re

import config

engine = create_engine(
    config.SQLALCHEMY_DATABASE_URL, connect_args=config.SQLALCHEMY_CONNECT_ARGS
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# A global variable to hold the main asyncio event loop, captured at startup.
main_event_loop: Optional[asyncio.AbstractEventLoop] = None

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# --- SQLite Custom REGEXP Function ---
# This function defines the regex logic
def regexp(expression, item):
    try:
        if expression is None or item is None:
            return False
        # Ensure both are strings to prevent crashes on corrupted/unexpected data
        return re.search(str(expression), str(item)) is not None
    except Exception:
        # If the regex pattern is invalid or something else goes wrong, 
        # just return False instead of crashing the whole query.
        return False

@event.listens_for(engine, "connect")
def configure_sqlite_connection(dbapi_connection, connection_record):
    # Register Regex function
    dbapi_connection.create_function("regexp", 2, regexp)
    
    # Enable Write-Ahead Logging (WAL)
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    
    # Set a Busy Timeout
    # If the Initial Scan thread is writing, the API thread will wait 
    # 5 seconds for the lock to clear instead of crashing.
    cursor.execute("PRAGMA busy_timeout=5000")
    
    # Synchronous Normal
    # In WAL mode, 'NORMAL' is faster and still very safe.
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()