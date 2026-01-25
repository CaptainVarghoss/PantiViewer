import json
from typing import List, Dict, Optional
import asyncio
from fastapi import WebSocket, Depends, WebSocketDisconnect

from sqlalchemy.orm import Session
import models

class WebSocketManager:
    def __init__(self):
        # Connections for anonymous/unauthenticated users
        self.anonymous_connections: List[WebSocket] = []
        # Connections for authenticated non-admin users
        self.user_connections: Dict[int, List[WebSocket]] = {}
        # Connections for authenticated admin users
        self.admin_connections: Dict[int, List[WebSocket]] = {}
        # Debouncing state
        self.public_debounce_task: Optional[asyncio.Task] = None
        self.admin_debounce_task: Optional[asyncio.Task] = None
        self.debounce_delay: float = 1.5  # seconds

    async def connect(self, websocket: WebSocket, user: Optional[models.User] = None):
        # Registers a new WebSocket connection.
        if user:
            if user.admin:
                if user.id not in self.admin_connections:
                    self.admin_connections[user.id] = []
                self.admin_connections[user.id].append(websocket)
                print(f"Admin client connected: {user.username} ({websocket.client.host})")
            else: # Non-admin user
                if user.id not in self.user_connections:
                    self.user_connections[user.id] = []
                self.user_connections[user.id].append(websocket)
                print(f"User client connected: {user.username} ({websocket.client.host})")
        else:
            self.anonymous_connections.append(websocket)
            print(f"Anonymous client connected: {websocket.client.host}")

    def disconnect(self, websocket: WebSocket, user: Optional[models.User] = None):
        # Removes a WebSocket connection.
        if user:
            if user.admin and user.id in self.admin_connections:
                if websocket in self.admin_connections[user.id]:
                    self.admin_connections[user.id].remove(websocket)
                if not self.admin_connections[user.id]:
                    del self.admin_connections[user.id]
                print(f"Admin client disconnected: {user.username} ({websocket.client.host})")
            elif not user.admin and user.id in self.user_connections:
                if websocket in self.user_connections[user.id]:
                    self.user_connections[user.id].remove(websocket)
                if not self.user_connections[user.id]:
                    del self.user_connections[user.id]
                print(f"User client disconnected: {user.username} ({websocket.client.host})")
        else:
            if websocket in self.anonymous_connections:
                self.anonymous_connections.remove(websocket)
                print(f"Anonymous client disconnected: {websocket.client.host}")

    async def listen_for_messages(self, websocket: WebSocket, user: Optional[models.User] = None):
        """
        Listens for incoming messages from a client and handles them.
        This function runs until the client disconnects.
        It handles keep-alive pings and ensures disconnection cleanup.
        """
        try:
            while True:
                data = await websocket.receive_text()
                try:
                    message = json.loads(data)
                    if isinstance(message, dict) and message.get("type") == "ping":
                        await self.send_personal_json(websocket, {"type": "pong"})
                        # Ping/Pong message for debugging websocket
                        # print(f'Received ping from user client: {user.username}')
                except (json.JSONDecodeError, AttributeError):
                    # Not a JSON message or not the structure we expect. Ignore for ping purposes.
                    pass
        except WebSocketDisconnect:
            print(f"Client disconnected: {websocket.client.host}")
        finally:
            self.disconnect(websocket, user)

    async def _send_json(self, websocket: WebSocket, message: dict):
        try:
            await websocket.send_json(message)
        except Exception as e:
            # This can happen if the client disconnects abruptly
            print(f"Error sending message to client {websocket.client.host}: {e}")
    
    async def _debounced_broadcast_task(self, admin_only: bool):
        # The actual task that waits and then sends the broadcast.
        await asyncio.sleep(self.debounce_delay)
        message = {"type": "refresh_images", "reason": "batch_update"}
        
        if admin_only:
            await self.broadcast_to_admins_json(message)
            self.admin_debounce_task = None
        else:
            await self.broadcast_json(message)
            self.public_debounce_task = None

    async def schedule_refresh_broadcast(self, admin_only: bool = False):
        # Schedules a 'refresh_images' broadcast, debouncing rapid calls.
        # Manages separate debounces for public and admin-only refreshes.
        if admin_only:
            # If a public broadcast is already scheduled, admins will get it, so we don't need a separate admin one.
            if self.public_debounce_task and not self.public_debounce_task.done():
                return

            if self.admin_debounce_task and not self.admin_debounce_task.done():
                self.admin_debounce_task.cancel()
            
            self.admin_debounce_task = asyncio.create_task(self._debounced_broadcast_task(admin_only=True))
        else: # Public broadcast
            # If an admin-only broadcast is scheduled, cancel it because this public one will cover admins too.
            if self.admin_debounce_task and not self.admin_debounce_task.done():
                self.admin_debounce_task.cancel()
            
            if self.public_debounce_task and not self.public_debounce_task.done():
                self.public_debounce_task.cancel()

            self.public_debounce_task = asyncio.create_task(self._debounced_broadcast_task(admin_only=False))

    async def broadcast_json(self, message: dict):
        # Sends a JSON message to all connected clients (anonymous, users, and admins).
        admin_sockets = [ws for sockets in self.admin_connections.values() for ws in sockets]
        user_sockets = [ws for sockets in self.user_connections.values() for ws in sockets]
        all_connections = self.anonymous_connections + user_sockets + admin_sockets
        # Use asyncio.gather for concurrent sending to all clients
        if all_connections:
            await asyncio.gather(*(self._send_json(conn, message) for conn in all_connections))

    async def broadcast_to_admins_json(self, message: dict):
        # Sends a JSON message only to authenticated admin clients.
        for sockets in self.admin_connections.values():
            for connection in sockets:
                await self._send_json(connection, message)

    async def broadcast_to_users_json(self, message: dict):
        # Sends a JSON message to all authenticated clients (admins and non-admins).
        print("Broadcasting message to all authenticated users.")
        admin_sockets = [ws for sockets in self.admin_connections.values() for ws in sockets]
        user_sockets = [ws for sockets in self.user_connections.values() for ws in sockets]
        all_user_connections = user_sockets + admin_sockets
        for connection in all_user_connections:
            await self._send_json(connection, message)

    async def broadcast_to_non_admins_json(self, message: dict):
        # Sends a JSON message only to authenticated non-admin clients.
        print("Broadcasting message to non-admin clients.")
        for sockets in self.user_connections.values():
            for connection in sockets:
                await self._send_json(connection, message)

    async def send_personal_json(self, websocket: WebSocket, message: dict):
        # Sends a JSON message to a specific client.
        await self._send_json(websocket, message)

    def get_all_connections(self) -> List[WebSocket]:
        admin_sockets = [ws for sockets in self.admin_connections.values() for ws in sockets]
        user_sockets = [ws for sockets in self.user_connections.values() for ws in sockets]
        return self.anonymous_connections + user_sockets + admin_sockets

    async def send_toast_and_log(
        self,
        db: Session,
        message: str,
        level: str,
        user_id: Optional[int] = None,
        source: Optional[str] = None,
        broadcast_to_admins: bool = False,
        broadcast_to_all: bool = False,
        toast_duration: int = 5000,
        toast_position: Optional[str] = None,
    ):
        """
        Logs a message to the database and sends a toast notification via WebSocket.

        :param db: The database session.
        :param message: The message to log and display.
        :param level: The message level ('SUCCESS', 'INFO', 'WARNING', 'ERROR').
        :param user_id: The ID of the user associated with the event. If provided, the toast is sent to this user.
        :param source: The source of the log message (e.g., 'file_watcher').
        :param broadcast_to_admins: If True, send toast to all admins.
        :param broadcast_to_all: If True, send toast to all connected clients.
        :param toast_duration: Duration for the toast message in milliseconds.
        :param toast_position: Position of the toast on screen (e.g., 'top-left', 'bottom-center').
        """
        # 1. Create Log entry
        try:
            log_entry = models.Log(
                message=message,
                level=level.upper(),
                user_id=user_id,
                source=source
            )
            db.add(log_entry)
            db.commit()
        except Exception as e:
            print(f"Failed to write to log: {e}")
            db.rollback()

        # 2. Prepare WebSocket message
        options = {"duration": toast_duration}
        if toast_position:
            options["position"] = toast_position

        toast_message = {
            "type": "toast",
            "payload": { "message": message, "level": level.lower(), "options": options }
        }

        # 3. Send WebSocket message
        if broadcast_to_all:
            await self.broadcast_json(toast_message)
        elif broadcast_to_admins:
            await self.broadcast_to_admins_json(toast_message)
        elif user_id:
            admin_sockets = self.admin_connections.get(user_id, [])
            user_sockets = self.user_connections.get(user_id, [])
            tasks = [self.send_personal_json(ws, toast_message) for ws in admin_sockets + user_sockets]
            if tasks:
                await asyncio.gather(*tasks)

# Create a single instance of the manager to be used across the application
manager = WebSocketManager()
