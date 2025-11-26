from fastapi import WebSocket


# WebSocket Connection Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        to_remove = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                to_remove.append(connection)
        for ws in to_remove:
            self.disconnect(ws)


manager = ConnectionManager()


# Attack Live Mode state
class LiveConnectionManager:
    def __init__(self):
        self.live_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.live_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.live_connections:
            self.live_connections.remove(websocket)

    async def broadcast(self, payload: dict):
        to_remove: list[WebSocket] = []
        for ws in self.live_connections:
            try:
                await ws.send_json(payload)
            except Exception:
                to_remove.append(ws)
        for ws in to_remove:
            self.disconnect(ws)


live_manager = LiveConnectionManager()
