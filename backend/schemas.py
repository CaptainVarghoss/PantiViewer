from pydantic import BaseModel, ConfigDict, Field
from typing import List, Optional, Any, Dict
from datetime import datetime

# No need for a separate BaseConfig class that inherits from ConfigDict
# Instead, we will directly use ConfigDict within each model's model_config

# --- User Schemas ---
class UserBase(BaseModel):
    username: str
    admin: bool = False
    login_allowed: bool = True

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None # Allow password update
    admin: Optional[bool] = None
    login_allowed: Optional[bool] = None

class User(UserBase):
    id: int
    # No password_hash exposed in the response model for security
    model_config = ConfigDict(from_attributes=True) # Directly use ConfigDict

class PasswordChange(BaseModel):
    new_password: str

# --- Tag Schemas ---
class TagBase(BaseModel):
    name: str
    admin_only: bool = False
    built_in: bool = False

class TagCreate(TagBase):
    pass

class TagUpdate(TagBase):
    name: Optional[str] = None
    admin_only: Optional[bool] = None
    built_in: Optional[bool] = None

class Tag(TagBase):
    id: int
    model_config = ConfigDict(from_attributes=True) # Directly use ConfigDict

# --- ImagePath Schemas ---
class ImagePathBase(BaseModel):
    path: str
    short_name: Optional[str] = None
    description: Optional[str] = None
    is_ignored: bool = False
    admin_only: bool = True
    basepath: bool = False
    built_in: bool = False
    parent: Optional[str] = None

class ImagePathCreate(ImagePathBase):
    pass

class ImagePathUpdate(ImagePathBase):
    path: Optional[str] = None
    short_name: Optional[str] = None
    description: Optional[str] = None
    is_ignored: Optional[bool] = None
    admin_only: Optional[bool] = None
    tag_ids: Optional[List[int]] = None # For associating tags on update

class ImagePath(ImagePathBase):
    id: int
    tags: List[Tag] = [] # List of Tag schemas
    model_config = ConfigDict(from_attributes=True) # Directly use ConfigDict

# --- Image Schemas ---
class ImageBase(BaseModel):
    content_hash: str
    date_created: datetime
    date_modified: datetime
    exif_data: Dict[str, Any] = {} # Can be empty dict
    is_video: bool = False

class ImageCreate(ImageBase):
    tag_ids: List[int] = [] # For associating tags on creation

class ImageUpdate(ImageBase):
    content_hash: Optional[str] = None
    exif_data: Optional[Dict[str, Any]] = None
    is_video: Optional[bool] = None
    tag_ids: Optional[List[int]] = None # For associating tags on update

class ImageTagUpdate(BaseModel):
    tag_ids: List[int] = []

class ImageTagBulkUpdate(BaseModel):
    image_ids: List[int]
    tag_id: int
    action: str # Should be 'add' or 'remove'

class ImageMoveRequest(BaseModel):
    imageIds: List[int]
    destinationPath: str

class ImageLocationSchema(BaseModel):
    id: int
    path: str
    filename: str
    date_scanned: datetime

    model_config = ConfigDict(from_attributes=True)

class ImageContent(ImageBase):
    content_id: int
    width: Optional[int] = None
    height: Optional[int] = None
    tags: List[Tag] = []
    locations: List[ImageLocationSchema] = []

    model_config = ConfigDict(from_attributes=True)

class ImageGridResponse(BaseModel):
    id: int
    filename: str
    content_id: int
    content_hash: str
    date_created: datetime
    is_video: bool = False
    thumbnail_url: Optional[str] = None
    thumbnail_missing: Optional[bool] = False

    model_config = ConfigDict(from_attributes=True, extra='ignore')

class ImageResponse(BaseModel):
    # Fields from ImageLocation
    id: int
    filename: str
    path: str

    # Fields from ImageContent / ImageBase
    content_id: int
    content_hash: str
    date_created: datetime
    date_modified: datetime
    exif_data: Dict[str, Any] = {}
    is_video: bool = False
    width: Optional[int] = None
    height: Optional[int] = None
    tags: List[Tag] = []
    locations: List[ImageLocationSchema] = []

    # Fields added in the route
    thumbnail_url: Optional[str] = None
    thumbnail_missing: Optional[bool] = False

    model_config = ConfigDict(from_attributes=True, extra='ignore')

# --- Setting Schemas ---
class SettingBase(BaseModel):
    name: str
    value: str
    admin_only: bool = False
    display_name: Optional[str] = None
    description: Optional[str] = None
    group: Optional[str] = None
    input_type: str = 'text' # Default value

class SettingCreate(SettingBase):
    pass

class SettingUpdate(SettingBase):
    name: Optional[str] = None
    value: Optional[str] = None
    admin_only: Optional[bool] = None
    display_name: Optional[str] = None
    description: Optional[str] = None
    group: Optional[str] = None
    input_type: Optional[str] = None

class Setting(SettingBase):
    id: int
    source: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

# --- DeviceSetting Schemas ---
class DeviceSettingBase(BaseModel):
    name: str
    user_id: int
    device_id: str
    value: str

class DeviceSettingCreate(DeviceSettingBase):
    pass

class DeviceSettingUpdate(DeviceSettingBase):
    name: Optional[str] = None
    user_id: Optional[int] = None
    device_id: Optional[str] = None
    value: Optional[str] = None

class DeviceSetting(DeviceSettingBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

# --- Filter Schemas ---
class FilterBase(BaseModel):
    name: str
    search_terms: Optional[str] = None
    header_display: int = 0
    admin_only: bool = False
    main_stage: str = "hide"
    main_stage_color: Optional[str] = None
    main_stage_icon: Optional[str] = None
    second_stage: str = "show"
    second_stage_color: Optional[str] = None
    second_stage_icon: Optional[str] = None
    third_stage: str = "disabled"
    third_stage_color: Optional[str] = None
    third_stage_icon: Optional[str] = None

class FilterCreate(FilterBase):
    tag_ids: List[int] = [] # List of tag IDs for positive matches
    neg_tag_ids: List[int] = [] # List of tag IDs for negative matches

class FilterUpdate(FilterBase):
    name: Optional[str] = None
    search_terms: Optional[str] = None
    header_display: Optional[int] = None
    admin_only: Optional[bool] = None
    main_stage: Optional[str] = None
    main_stage_color: Optional[str] = None
    main_stage_icon: Optional[str] = None
    second_stage: Optional[str] = None
    second_stage_color: Optional[str] = None
    second_stage_icon: Optional[str] = None
    third_stage: Optional[str] = None
    third_stage_color: Optional[str] = None
    third_stage_icon: Optional[str] = None
    tag_ids: Optional[List[int]] = None # Optional list of tag IDs for update
    neg_tag_ids: Optional[List[int]] = None # Optional list of negative tag IDs for update

class Filter(FilterBase):
    id: int
    tags: List[Tag] = [] # List of associated Tags (positive)
    neg_tags: List[Tag] = [] # List of associated Tags (negative)
    model_config = ConfigDict(from_attributes=True) # Directly use ConfigDict

# --- Log Schemas ---
class LogBase(BaseModel):
    level: str
    message: str
    source: Optional[str] = None
    user_id: Optional[int] = None
    read: bool = False

class Log(LogBase):
    id: int
    timestamp: datetime
    user: Optional[User] = None
    model_config = ConfigDict(from_attributes=True)

class PaginatedLogs(BaseModel):
    logs: List[Log]
    total: int
# --- Token Schema for Authentication ---
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

class FolderList(BaseModel):
    folders: List[ImagePath]

# --- Trash Schema ---
class TrashInfo(BaseModel):
    trash_count: int

class ReprocessRequest(BaseModel):
    scope: str = Field(..., description="The scope of reprocessing. Must be one of 'file', 'directory', or 'all'.")
    identifier: Optional[str] = Field(None, description="Identifier for the scope. The ImageLocation ID for 'file', or the full path for 'directory'.")