from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Table, Text, UniqueConstraint, Index, event, text
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
from datetime import datetime, timezone

Base = declarative_base()

# Many-to-Many association table for Images and Tags
image_tags = Table(
    'image_tags',
    Base.metadata,
    Column('image_id', Integer, ForeignKey('image_content.content_id'), primary_key=True),
    Column('tag_id', Integer, ForeignKey('tags.id'), primary_key=True),
    Index('idx_image_tags_tag_id', 'tag_id')
)

# Many-to-Many association table for ImagePaths and Tags
imagepath_tags = Table(
    'imagepath_tags',
    Base.metadata,
    Column('imagepath_id', Integer, ForeignKey('imagepaths.id'), primary_key=True),
    Column('tag_id', Integer, ForeignKey('tags.id'), primary_key=True)
)

# Many-to-Many association table for Filters and Tags (positive matches)
filter_tags = Table(
    'filter_tags',
    Base.metadata,
    Column('filter_id', Integer, ForeignKey('filters.id'), primary_key=True),
    Column('tag_id', Integer, ForeignKey('tags.id'), primary_key=True)
)

# Many-to-Many association table for Filters and Tags (negative matches)
filter_neg_tags = Table(
    'filter_neg_tags',
    Base.metadata,
    Column('filter_id', Integer, ForeignKey('filters.id'), primary_key=True),
    Column('tag_id', Integer, ForeignKey('tags.id'), primary_key=True)
)


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    admin = Column(Boolean, default=False)
    login_allowed = Column(Boolean, default=True)


class Tag(Base):
    __tablename__ = "tags"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    admin_only = Column(Boolean, default=False)
    built_in = Column(Boolean, default=False)
    internal = Column(Boolean, default=False)

    images = relationship("ImageContent", secondary=image_tags, back_populates="tags")
    image_paths = relationship("ImagePath", secondary=imagepath_tags, back_populates="tags")
    filters_positive = relationship("Filter", secondary=filter_tags, back_populates="tags")
    filters_negative = relationship("Filter", secondary=filter_neg_tags, back_populates="neg_tags")


class ImagePath(Base):
    __tablename__ = "imagepaths"
    id = Column(Integer, primary_key=True, index=True)
    path = Column(String, unique=True, index=True, nullable=False)
    short_name = Column(String, unique=True, index=True, nullable=False)
    description = Column(String)
    is_ignored = Column(Boolean, default=False)
    admin_only = Column(Boolean, default=True)
    basepath = Column(Boolean, default=False)
    built_in = Column(Boolean, default=False)
    parent = Column(String)

    tags = relationship("Tag", secondary=imagepath_tags, back_populates="image_paths")

class ImageContent(Base):
    __tablename__ = "image_content"
    content_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    content_hash = Column(String, unique=True, index=True, nullable=False)
    is_video = Column(Boolean, default=False)
    exif_data = Column(Text)
    width = Column(Integer)
    height = Column(Integer)
    date_created = Column(DateTime(timezone=True))
    date_modified = Column(DateTime(timezone=True))
    date_indexed = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), server_default=func.now())
    orphaned = Column(Boolean, default=False)
    locations = relationship("ImageLocation", back_populates="content")
    tags = relationship("Tag", secondary=image_tags, back_populates="images")

    __table_args__ = (
        Index("idx_ic_keyset_sort", "date_created", "content_id"),
    )

class ImageLocation(Base):
    __tablename__ = "image_location"
    id = Column(Integer, primary_key=True, index=True)
    content_hash = Column(String, ForeignKey("image_content.content_hash"), index=True, nullable=False)
    filename = Column(String, nullable=False)
    path = Column(String, nullable=False)
    date_scanned = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), server_default=func.now())
    deleted = Column(Boolean, default=False)
    content = relationship("ImageContent", back_populates="locations")
    __table_args__ = (
        Index("idx_il_join_tiebreak", "content_hash", "id"),
        UniqueConstraint('path', 'filename', name='uq_path_filename'),
    )

class Setting(Base):
    __tablename__ = "settings"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    value = Column(String, nullable=False)
    admin_only = Column(Boolean, default=False) # Whether this setting is only editable by admins
    display_name = Column(String) # User-friendly name for the setting
    description = Column(String) # Detailed description
    group = Column(String) # Category for grouping in UI (e.g., 'Appearance', 'Security')
    input_type = Column(String, default='text') # 'text', 'number', 'switch', 'custom_sidebar_switches'

class Filter(Base):
    __tablename__ = "filters"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    search_terms = Column(Text)
    header_display = Column(Integer, default=1)
    admin_only = Column(Boolean, default=False)
    main_stage = Column(String, default="hide")
    main_stage_color = Column(String)
    main_stage_icon = Column(String)
    second_stage = Column(String, default="show")
    second_stage_color = Column(String)
    second_stage_icon = Column(String)
    third_stage = Column(String, default="disabled")
    third_stage_color = Column(String)
    third_stage_icon = Column(String)

    tags = relationship("Tag", secondary=filter_tags, back_populates="filters_positive")
    neg_tags = relationship("Tag", secondary=filter_neg_tags, back_populates="filters_negative")

class Log(Base):
    __tablename__ = "logs"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    level = Column(String, nullable=False, default='INFO') # e.g., INFO, WARNING, ERROR, SUCCESS
    message = Column(Text, nullable=False)
    source = Column(String) # e.g., 'file_watcher', 'user_action'
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    read = Column(Boolean, default=False, nullable=False)

    user = relationship("User")

class ImageFTS(Base):
    # Shadow model for the SQLite FTS5 Virtual Table.
    __tablename__ = "image_fts_index"
    
    # In FTS5, 'rowid' is the hidden primary key. 
    # We map content_id to it so SQLAlchemy is happy.
    location_id = Column(Integer, primary_key=True)
    path = Column(Text)
    filename = Column(Text)
    prompt = Column(Text)
    negative_prompt = Column(Text)
    model = Column(Text)
    sampler = Column(Text)
    scheduler = Column(Text)
    loras = Column(Text)
    upscaler = Column(Text)
    application = Column(Text)
    full_text = Column(Text)

# --- SQL Compilation Logic ---
# This ensures that when create_all() is run,
# it creates a VIRTUAL table instead of a normal one.
@event.listens_for(ImageFTS.__table__, "after_create")
def create_fts_table(target, connection, **kw):
    connection.execute(text("DROP TABLE IF EXISTS image_fts_index;"))
    connection.execute(text("""
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
            full_text
        );
    """))