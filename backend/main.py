import asyncio
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from backend.api.endpoints import router as api_router
from backend.error_handler import setup_error_handlers
from backend.live_feed_service import get_service
from backend.services.feed_poller import _start_live_mode_tasks

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="DDoS Globe Visualizer Backend",
    description="Backend API for DDoS globe visualization and analysis.",
    version="1.0.0",
)

# Set up templates and static files with robust absolute paths
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_TEMPLATES_DIR = os.path.join(_BASE_DIR, "templates")
_STATIC_DIR = os.path.join(_BASE_DIR, "static")

# Templates are also initialized in endpoints.py, but we might need them here or just rely on endpoints
# If endpoints.py uses its own templates instance, that's fine as long as paths are correct.

if os.path.isdir(_STATIC_DIR):
    app.mount("/static", StaticFiles(directory=_STATIC_DIR), name="static")

# Set up error handlers
setup_error_handlers(app)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(api_router)


@app.on_event("startup")
async def _startup_hooks():
    # Start Attack Live Mode background loops
    asyncio.create_task(_start_live_mode_tasks())
    # Start live feed service background worker
    try:
        get_service().start()
        logger.info("LiveFeedService started")
    except Exception as e:
        logger.error(f"Failed to start LiveFeedService: {e}")


if __name__ == "__main__":
    import uvicorn

    # Print startup information
    print("🚀 Starting DDoS Globe Visualizer Backend...")
    print(f"📍 Server will be available at: http://localhost:8000")
    print(f"🔧 Admin dashboard at: http://localhost:8000/admin")
    print(f"❤️  Health check at: http://localhost:8000/health")
    print("=" * 50)

    try:
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=8000,
            log_level="info",
            access_log=True,
            reload=False,
        )
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
    except Exception as e:
        print(f"❌ Server error: {e}")
        raise
