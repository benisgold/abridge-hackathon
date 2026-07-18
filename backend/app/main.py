from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="abridge-hackathon")

# The Vite dev server proxies /api to this app, so requests are same-origin in
# practice. This is here for when the frontend is pointed at the backend directly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "message": "hello from fastapi"}
