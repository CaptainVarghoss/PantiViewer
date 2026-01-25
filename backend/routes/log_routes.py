from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

import schemas
import models
from auth import get_current_admin_user
from database import get_db
from websocket_manager import manager

router = APIRouter(
    prefix="/logs",
    tags=["Logs"],
    dependencies=[Depends(get_current_admin_user)] # Admin only
)

@router.get("/", response_model=schemas.PaginatedLogs)
def get_logs(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """
    Retrieve a paginated list of log entries, newest first.
    """
    total = db.query(models.Log).count()
    logs = db.query(models.Log).order_by(models.Log.timestamp.desc()).offset(skip).limit(limit).all()
    return {"logs": logs, "total": total}

@router.delete("/", status_code=status.HTTP_204_NO_CONTENT)
async def clear_logs(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_admin_user)):
    """
    Deletes all log entries from the database.
    """
    try:
        num_rows_deleted = db.query(models.Log).delete()
        db.commit()
        
        # Send a toast notification to the admin who cleared the logs
        message = f"Cleared {num_rows_deleted} log entries."
        await manager.send_toast_and_log(db=db, message=message, level="success", user_id=current_user.id, source="log_management", toast_position="top-center")

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))