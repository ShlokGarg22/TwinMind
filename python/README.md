# AI Chat Platform - Python Backend

Python FastAPI backend for the AI Chat Platform.

## 🚀 Quick Start

### 1. Install Python Dependencies

```powershell
cd python
pip install -r requirements.txt
```

### 2. Configure Environment

Create/edit `.env` file:

```env
PORT=8000
OPENAI_API_KEY=your_openai_key_here
GEMINI_API_KEY=your_gemini_key_here
OLLAMA_URL=http://localhost:11434
```

### 3. Run the Server

```powershell
# Development mode with auto-reload
python main.py

# Or with uvicorn directly
uvicorn main:app --reload --port 8000
```

## 📁 Structure

```
python/
├── main.py                    # FastAPI app & routes
├── requirements.txt           # Python dependencies
├── .env                       # Environment variables
└── services/
    ├── memory.py             # Memory & context injection
    ├── local_model.py        # Ollama integration
    └── cloud_model.py        # OpenAI/Gemini integration
```

## 🔧 API Endpoints

- `POST /api/chat` - Send message to AI
- `GET /api/settings` - Get user settings
- `GET /api/history` - Get chat history
- `GET /api/models` - List available models

## 📦 Dependencies

- **FastAPI** - Modern async web framework
- **Uvicorn** - ASGI server
- **httpx** - Async HTTP client
- **python-dotenv** - Environment variables
- **pydantic** - Data validation

## 🌟 Features

✅ **Async/Await** - Fast async operations  
✅ **Type Hints** - Full type safety  
✅ **Auto Docs** - Interactive API docs at `/docs`  
✅ **CORS** - Configured for frontend  
✅ **Error Handling** - Proper exception handling  

## 🔗 Connect with Frontend

Frontend is already configured to use `http://localhost:8000/api`

Just run:
1. Python backend: `python main.py`
2. React frontend: `cd ../frontend && npm run dev`

## 📝 Notes

- Ollama must be running for local models
- Add API keys to `.env` for cloud models
- Server runs on port 8000 by default
- API documentation available at `http://localhost:8000/docs`
