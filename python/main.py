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


class SessionCreate(BaseModel):
    title: str = "New Chat"


class SessionSave(BaseModel):
    session_id: str
    messages: list
    title: str = None


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
        cloud_models = cloud_model_service.get_available_models()
        
        return {
            "local": local_models,
            "cloud": cloud_models
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/sessions")
async def create_session(request: SessionCreate):
    try:
        session_id = await memory_service.create_session(request.title)
        return {"session_id": session_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sessions")
async def list_sessions():
    try:
        sessions = await memory_service.list_sessions()
        return sessions
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    try:
        session = await memory_service.load_session(session_id)
        return session
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/sessions/save")
async def save_session(request: SessionSave):
    try:
        await memory_service.save_session(request.session_id, request.messages, request.title)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    try:
        await memory_service.delete_session(session_id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/templates")
async def get_templates():
    """Get prompt templates"""
    templates = [
        {
            "id": "analyze",
            "title": "Analyze & Explain",
            "prompt": "Analyze the following and provide a detailed explanation with key insights:\n\n",
            "category": "Analysis"
        },
        {
            "id": "summarize",
            "title": "Summarize Content",
            "prompt": "Please summarize the following content in a clear and concise manner:\n\n",
            "category": "Productivity"
        },
        {
            "id": "brainstorm",
            "title": "Brainstorm Ideas",
            "prompt": "Help me brainstorm creative ideas for:\n\n",
            "category": "Creative"
        },
        {
            "id": "debug",
            "title": "Debug Code",
            "prompt": "Help me debug this code. Identify the issue and suggest fixes:\n\n```\n\n```",
            "category": "Development"
        },
        {
            "id": "refactor",
            "title": "Refactor Code",
            "prompt": "Refactor the following code to improve readability, performance, and best practices:\n\n```\n\n```",
            "category": "Development"
        },
        {
            "id": "write_email",
            "title": "Write Professional Email",
            "prompt": "Write a professional email with the following details:\n\nTo:\nSubject:\nContext:\n\n",
            "category": "Writing"
        },
        {
            "id": "explain_eli5",
            "title": "Explain Like I'm 5",
            "prompt": "Explain the following concept in simple terms that a 5-year-old would understand:\n\n",
            "category": "Education"
        },
        {
            "id": "pros_cons",
            "title": "Pros & Cons Analysis",
            "prompt": "Provide a detailed pros and cons analysis for:\n\n",
            "category": "Analysis"
        },
        {
            "id": "step_by_step",
            "title": "Step-by-Step Guide",
            "prompt": "Create a detailed step-by-step guide for:\n\n",
            "category": "Education"
        },
        {
            "id": "translate",
            "title": "Translate Text",
            "prompt": "Translate the following text to [TARGET LANGUAGE]:\n\n",
            "category": "Productivity"
        }
    ]
    return templates


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
