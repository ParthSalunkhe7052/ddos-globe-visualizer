# DDOS-Globe Backend

## Running the backend

1. Install dependencies:
   ```sh
   pip install -r requirements.txt
   ```
2. Set your AbuseIPDB API key in `.env`:
   ```sh
   echo ABUSEIPDB_API_KEY=your_key_here > .env
   ```
3. Start the server:
   ```sh
   uvicorn backend.main:app --reload
   ```

## Testing the live attacks WebSocket

1. In a new terminal, run:
   ```sh
   python tools/test_ws_client.py
   ```
2. You should see live attack reports printed as JSON.
