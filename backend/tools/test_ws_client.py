import asyncio
import websockets
import json

async def main():
    uri = "ws://127.0.0.1:8000/ws/live-attacks"
    async with websockets.connect(uri) as websocket:
        try:
            while True:
                msg = await websocket.recv()
                print(json.dumps(json.loads(msg), indent=2))
        except websockets.ConnectionClosed:
            print("WebSocket closed.")

if __name__ == "__main__":
    asyncio.run(main())
