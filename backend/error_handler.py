import logging
from typing import Any, Dict, Optional

from fastapi import FastAPI, Request, WebSocket, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ValidationError

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ErrorResponse(BaseModel):
    error: str
    message: str
    details: Optional[Dict[str, Any]] = None


class APIError(Exception):
    def __init__(
        self,
        message: str,
        error_code: str,
        status_code: int = 500,
        details: Optional[Dict[str, Any]] = None,
    ):
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        self.details = details
        super().__init__(self.message)


class InvalidIPError(APIError):
    def __init__(self, ip: str):
        super().__init__(
            message=f"Invalid IP address: {ip}",
            error_code="INVALID_IP",
            status_code=422,
        )


class RateLimitError(APIError):
    def __init__(self, service: str):
        super().__init__(
            message=f"Rate limit exceeded for {service}",
            error_code="RATE_LIMIT_EXCEEDED",
            status_code=429,
        )


class ServiceUnavailableError(APIError):
    def __init__(self, service: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=f"{service} service is currently unavailable",
            error_code="SERVICE_UNAVAILABLE",
            status_code=503,
            details=details,
        )


def setup_error_handlers(app: FastAPI):
    @app.exception_handler(APIError)
    async def api_error_handler(request: Request, exc: APIError):
        logger.error(f"API Error: {exc.error_code} - {exc.message}")
        return JSONResponse(
            status_code=exc.status_code,
            content=ErrorResponse(
                error=exc.error_code, message=exc.message, details=exc.details
            ).dict(exclude_none=True),
        )

    @app.exception_handler(ValidationError)
    async def validation_error_handler(request: Request, exc: ValidationError):
        logger.error(f"Validation Error: {exc}")
        return JSONResponse(
            status_code=422,
            content=ErrorResponse(
                error="VALIDATION_ERROR",
                message="Invalid request data",
                details={"errors": exc.errors()},
            ).dict(exclude_none=True),
        )

    @app.exception_handler(Exception)
    async def general_error_handler(request: Request, exc: Exception):
        logger.error(f"Unhandled Error: {exc}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content=ErrorResponse(
                error="INTERNAL_SERVER_ERROR", message="An unexpected error occurred"
            ).dict(exclude_none=True),
        )


async def handle_ws_error(websocket: WebSocket, error: APIError):
    """Handle WebSocket errors by sending error message and optionally closing connection"""
    try:
        if websocket.client_state.CONNECTED:
            await websocket.send_json(
                {
                    "error": error.error_code,
                    "message": error.message,
                    "details": error.details,
                }
            )
            if error.status_code >= 500:  # Close connection for server errors
                await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
    except Exception as e:
        logger.error(f"Error sending WebSocket error message: {e}")
