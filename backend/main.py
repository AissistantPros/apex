from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
from typing import Optional
from dotenv import load_dotenv
from routes_patients import router as patients_router

load_dotenv('.env.local')

app = FastAPI(title="APEX Backend", version="0.1.0")

# CORS configuration
origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    os.getenv("FRONTEND_URL", "http://localhost:3000"),
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
class HealthResponse(BaseModel):
    status: str
    message: str

# Routes
@app.get("/health", response_model=HealthResponse)
async def health_check():
    return {
        "status": "ok",
        "message": "APEX Backend is running",
    }

@app.post("/verify-token")
async def verify_token(authorization: Optional[str] = Header(None)):
    """Verify JWT token from Supabase"""
    if not authorization:
        raise HTTPException(status_code=401, detail="No authorization header")

    try:
        # For now, just return the token as valid
        # In production, verify against Supabase JWT
        return {"valid": True, "message": "Token verified"}
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

# Include routers
app.include_router(patients_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
