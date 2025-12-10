import json
from typing import List, Dict, Optional
import asyncio
from fastapi import WebSocket, Depends

import models

class WebSocketManager:
    def __init__(self):
        # Connections for anonymous/unauthenticated users
        self.anonymous_connections: List[WebSocket] = []
        # Connections for authenticated non-admin users
        self.user_connections: Dict[int, WebSocket] = {}
        # Connections for authenticated admin users
        self.admin_connections: Dict[int, WebSocket] = {}
        # Debouncing state
        self.debounce_task: Optional[asyncio.Task] = None
        self.debounce_delay: float = 1.5  # seconds

    async def connect(self, websocket: WebSocket, user: Optional[models.User] = None):
        """
        Registers a new WebSocket connection.
        """
        if user:
            if user.admin:
                self.admin_connections[user.id] = websocket
                print(f"Admin client connected: {user.username} ({websocket.client.host})")
            else: # Non-admin user
                self.user_connections[user.id] = websocket
                print(f"User client connected: {user.username} ({websocket.client.host})")
        else:
            self.anonymous_connections.append(websocket)
            print(f"Anonymous client connected: {websocket.client.host}")

    def disconnect(self, websocket: WebSocket, user: Optional[models.User] = None):
        """
        Removes a WebSocket connection.
        """
        if user:
            if user.admin and user.id in self.admin_connections:
                del self.admin_connections[user.id]
                print(f"Admin client disconnected: {user.username} ({websocket.client.host})")
            elif not user.admin and user.id in self.user_connections:
                del self.user_connections[user.id]
                print(f"User client disconnected: {user.username} ({websocket.client.host})")
        else:
            if websocket in self.anonymous_connections:
                self.anonymous_connections.remove(websocket)
                print(f"Anonymous client disconnected: {websocket.client.host}")

    async def _send_json(self, websocket: WebSocket, message: dict):
        try:
            await websocket.send_json(message)
        except Exception as e:
            # This can happen if the client disconnects abruptly
            print(f"Error sending message to client {websocket.client.host}: {e}")
    
    async def _debounced_broadcast_task(self):
        """
        The actual task that waits and then sends the broadcast.
        """
        await asyncio.sleep(self.debounce_delay)
        message = {"type": "refresh_images", "reason": "batch_update"}
        print(f"Debounce delay of {self.debounce_delay}s elapsed. Broadcasting general refresh.")
        await self.broadcast_json(message)
        self.debounce_task = None # Clear the task reference once done

    async def schedule_general_refresh_broadcast(self):
        """
        Schedules a general 'refresh_images' broadcast, debouncing rapid calls.
        If called multiple times within the debounce delay, the timer is reset.
        """
        # If a broadcast is already scheduled, cancel it to reset the timer.
        if self.debounce_task:
            self.debounce_task.cancel()
            print("Debounce timer reset due to new activity.")

        # Schedule the new broadcast task.
        self.debounce_task = asyncio.create_task(self._debounced_broadcast_task())
        print("General refresh broadcast scheduled.")

    async def broadcast_json(self, message: dict):
        """
        Sends a JSON message to all connected clients (anonymous, users, and admins).
        """
        if message.get("reason") != "batch_update":
            print(f"Broadcasting immediate message to all clients: {message.get('type')}")
        
        all_connections = self.anonymous_connections + list(self.user_connections.values()) + list(self.admin_connections.values())
        # Use asyncio.gather for concurrent sending to all clients
        if all_connections:
            await asyncio.gather(*(self._send_json(conn, message) for conn in all_connections))

    async def broadcast_to_admins_json(self, message: dict):
        """
        Sends a JSON message only to authenticated admin clients.
        """
        print("Broadcasting message to admin clients.")
        for connection in self.admin_connections.values():
            await self._send_json(connection, message)

    async def broadcast_to_users_json(self, message: dict):
        """
        Sends a JSON message to all authenticated clients (admins and non-admins).
        """
        print("Broadcasting message to all authenticated users.")
        all_user_connections = list(self.user_connections.values()) + list(self.admin_connections.values())
        for connection in all_user_connections:
            await self._send_json(connection, message)

    async def broadcast_to_non_admins_json(self, message: dict):
        """
        Sends a JSON message only to authenticated non-admin clients.
        """
        print("Broadcasting message to non-admin clients.")
        for connection in self.user_connections.values():
            await self._send_json(connection, message)

    async def send_personal_json(self, websocket: WebSocket, message: dict):
        """
        Sends a JSON message to a specific client.
        """
        await self._send_json(websocket, message)

    def get_all_connections(self) -> List[WebSocket]:
        return self.anonymous_connections + list(self.user_connections.values()) + list(self.admin_connections.values())


# Create a single instance of the manager to be used across the application
manager = WebSocketManager()
