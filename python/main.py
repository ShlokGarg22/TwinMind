from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from dotenv import load_dotenv
from sse_starlette.sse import EventSourceResponse
import os
import json

from services.memory import MemoryService
from services.local_model import LocalModelService
from services.cloud_model import CloudModelService
from services.long_term_memory import LongTermMemoryService

load_dotenv()

app = FastAPI(title="AI Chat Backend")

# CORS - allow all origins for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Services
memory_service = MemoryService()
local_model_service = LocalModelService()
cloud_model_service = CloudModelService()
long_term_memory = LongTermMemoryService()


class ChatRequest(BaseModel):
    message: str
    model: str
    modelType: str
    useMemory: bool = True


class SessionCreate(BaseModel):
    title: str = "New Chat"


class SessionSave(BaseModel):
    session_id: str
    messages: list
    title: str = None


class MemoryRequest(BaseModel):
    content: str
    label: str = None
    category: str = "general"


@app.post("/api/chat")
async def chat(request: ChatRequest):
    try:
        # Get context from session memory
        context = await memory_service.get_context()
        
        # Get long-term memory context if enabled
        memory_context = ""
        if request.useMemory:
            memory_context = await long_term_memory.get_context_memories(request.message)
        
        # Combine contexts
        enriched_message = request.message
        if memory_context:
            enriched_message = f"{memory_context}\n\nUser message: {request.message}"
        enriched_message = memory_service.inject_context(enriched_message, context)
        
        # Route to appropriate model
        if request.modelType == "local":
            response = await local_model_service.generate(enriched_message, request.model)
        elif request.modelType == "cloud":
            response = await cloud_model_service.generate(enriched_message, request.model)
        else:
            raise HTTPException(status_code=400, detail="Invalid model type")
        
        # Save to history
        await memory_service.save_chat(request.message, response, request.model, request.modelType)
        
        # Extract and save facts from conversation
        if request.useMemory:
            await long_term_memory.extract_facts_from_message(request.message, response)
        
        return {
            "response": response,
            "model": request.model,
            "modelType": request.modelType
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    """Streaming chat endpoint using Server-Sent Events"""
    try:
        # Get context from session memory
        context = await memory_service.get_context()
        
        # Get long-term memory context if enabled
        memory_context = ""
        if request.useMemory:
            memory_context = await long_term_memory.get_context_memories(request.message)
        
        # Combine contexts
        enriched_message = request.message
        if memory_context:
            enriched_message = f"{memory_context}\n\nUser message: {request.message}"
        enriched_message = memory_service.inject_context(enriched_message, context)
        
        async def generate():
            full_response = ""
            try:
                if request.modelType == "local":
                    async for chunk in local_model_service.generate_stream(enriched_message, request.model):
                        full_response += chunk
                        yield {"data": json.dumps({"chunk": chunk, "done": False})}
                elif request.modelType == "cloud":
                    async for chunk in cloud_model_service.generate_stream(enriched_message, request.model):
                        full_response += chunk
                        yield {"data": json.dumps({"chunk": chunk, "done": False})}
                
                # Send final message
                yield {"data": json.dumps({"chunk": "", "done": True, "full_response": full_response})}
                
                # Save to history after streaming completes
                await memory_service.save_chat(request.message, full_response, request.model, request.modelType)
                
                # Extract facts
                if request.useMemory:
                    await long_term_memory.extract_facts_from_message(request.message, full_response)
                    
            except Exception as e:
                yield {"data": json.dumps({"error": str(e), "done": True})}
        
        return EventSourceResponse(generate())
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


# Long-term Memory Endpoints
@app.get("/api/memories")
async def get_memories():
    """Get all long-term memories"""
    try:
        memories = await long_term_memory.get_all_memories()
        return memories
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/memories/pin")
async def pin_memory(request: MemoryRequest):
    """Pin an important memory"""
    try:
        await long_term_memory.pin_memory(request.content, request.label)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/memories/fact")
async def add_fact(request: MemoryRequest):
    """Add a fact about the user"""
    try:
        await long_term_memory.add_fact(request.content, request.category)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/memories/fact/{fact_id}")
async def delete_fact(fact_id: int):
    """Delete a fact"""
    try:
        await long_term_memory.delete_fact(fact_id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/memories/pinned/{memory_id}")
async def delete_pinned(memory_id: int):
    """Delete a pinned memory"""
    try:
        await long_term_memory.delete_pinned_memory(memory_id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/memories/clear")
async def clear_memories():
    """Clear all memories"""
    try:
        await long_term_memory.clear_all()
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
