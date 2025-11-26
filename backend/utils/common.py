import logging
from datetime import datetime

from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


def iso_now():
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def log_and_respond(
    success, data=None, error=None, message=None, status_code=200, headers=None
):
    resp = {
        "success": success,
        "data": data if success else None,
        "error": error if not success else None,
        "message": message if not success else None,
    }
    logger.info(f"Response: {resp}")
    return JSONResponse(
        content=resp,
        status_code=status_code,
        headers=headers
        or {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": "true",
        },
    )
