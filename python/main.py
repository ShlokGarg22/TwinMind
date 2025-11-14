from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import os

from services.memory import MemoryService
from services.local_model import LocalModelService
from services.cloud_model import CloudModelService

load_dotenv()

app = FastAPI(title="AI Chat Backend")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Services
memory_service = MemoryService()
local_model_service = LocalModelService()
cloud_model_service = CloudModelService()


class ChatRequest(BaseModel):
    message: str
    model: str
    modelType: str


@app.post("/api/chat")
async def chat(request: ChatRequest):
    try:
        # Load context and inject
        context = await memory_service.get_context()
        enriched_message = memory_service.inject_context(request.message, context)
        
        # Route to appropriate model
        if request.modelType == "local":
            response = await local_model_service.generate(enriched_message, request.model)
        elif request.modelType == "cloud":
            response = await cloud_model_service.generate(enriched_message, request.model)
        else:
            raise HTTPException(status_code=400, detail="Invalid model type")
        
        # Save to history
        await memory_service.save_chat(request.message, response, request.model, request.modelType)
        
        return {
            "response": response,
            "model": request.model,
            "modelType": request.modelType
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/settings")
async def get_settings():
    try:
        settings = await memory_service.get_settings()
        return settings
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/history")
async def get_history():
    try:
        history = await memory_service.get_history()
        return history
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/models")
async def get_models():
    try:
        local_models = await local_model_service.list_models()
        settings = await memory_service.get_settings()
        
        return {
            "local": local_models,
            "cloud": settings.get("cloud_models", {})
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
