import os
from typing import Optional
from dotenv import load_dotenv

# LOAD ENV VARIABLES FIRST (before any other imports)
load_dotenv('.env.local')

from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from routes_patients import router as patients_router, doctor_profile_router
from routes_visits import router as visits_router
from routes_analysis import router as analysis_router
from routes_chat import router as chat_router
from routes_kb import router as kb_router
from routes_stats import router as stats_router
from routes_clinic import router as clinic_router
from routes_staff import router as staff_router
from routes_marketing import router as marketing_router
from routes_messages import router as messages_router
from routes_admin import router as admin_router
from routes_appointments import router as appointments_router
from routes_support import router as support_router

app = FastAPI(title="APEX Backend", version="0.1.0")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registro de uso (para la analítica del Admin). Solo acciones relevantes (escrituras
# y entradas), nunca el polling de alta frecuencia. No bloquea la respuesta.
@app.middleware("http")
async def usage_logger(request: Request, call_next):
    response = await call_next(request)
    try:
        method = request.method
        path = request.url.path
        interesting = method in ("POST", "PUT", "DELETE") or path == "/staff/whoami"
        noisy = path.startswith(("/health", "/docs", "/openapi", "/auth/", "/admin/logs",
                                 "/admin/overview", "/admin/clinics"))
        auth = request.headers.get("authorization")
        if interesting and not noisy and method != "OPTIONS" and auth:
            from auth import get_actor
            try:
                actor = get_actor(auth)
            except Exception:
                actor = None
            if actor:
                from services.usage import log_event, feature_for
                log_event(actor["user_id"], actor.get("clinic_id"), actor["role"],
                          f"{method} {path}", feature_for(path), status=response.status_code)
    except Exception:
        pass
    return response


# Cualquier error no controlado devuelve JSON en español (con CORS), para que el
# navegador no lo reporte como "Failed to fetch" sin explicación.
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    import traceback
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": "Ocurrió un error en el servidor. Inténtalo de nuevo en un momento."},
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


@app.get("/auth/resolve-username/{username}")
async def resolve_username(username: str):
    """Login por USUARIO (sin correo): resuelve el usuario a su correo interno para que
    el frontend pueda autenticar. Solo devuelve el correo; no expone nada sensible."""
    from db import supabase
    u = (username or "").strip().lower()
    if not u:
        raise HTTPException(404, "Usuario no encontrado")
    # Si ya viene un correo, se usa tal cual.
    if "@" in u:
        return {"email": u}
    r = supabase.table("doctor_profiles").select("email")\
        .eq("username", u).limit(1).execute().data
    if not r or not r[0].get("email"):
        raise HTTPException(404, "Usuario no encontrado")
    return {"email": r[0]["email"]}

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
app.include_router(doctor_profile_router)
app.include_router(visits_router)
app.include_router(analysis_router)
app.include_router(chat_router)
app.include_router(kb_router)
app.include_router(stats_router)
app.include_router(clinic_router)
app.include_router(staff_router)
app.include_router(marketing_router)
app.include_router(messages_router)
app.include_router(admin_router)
app.include_router(appointments_router)
app.include_router(support_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
