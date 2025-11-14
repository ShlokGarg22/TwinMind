import json
import os
import uuid
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional

USER_DATA_PATH = Path(__file__).parent.parent.parent / "user-data"


class MemoryService:
    async def get_settings(self) -> dict:
        settings_path = USER_DATA_PATH / "settings.json"
        with open(settings_path, "r", encoding="utf-8") as f:
            return json.load(f)

    async def get_user_profile(self) -> dict:
        profile_path = USER_DATA_PATH / "user_profile.json"
        with open(profile_path, "r", encoding="utf-8") as f:
            return json.load(f)

    async def get_context(self) -> dict:
        settings = await self.get_settings()
        context = {}

        if settings.get("memory", {}).get("inject_profile", False):
            context["profile"] = await self.get_user_profile()

        return context

    def inject_context(self, message: str, context: dict) -> str:
        if not context.get("profile"):
            return message

        profile = context["profile"]
        prefs = profile.get("preferences", {})
        
        context_prefix = (
            f"[User Context: Writing style: {prefs.get('writing_style', 'Default')}. "
            f"Tone: {prefs.get('tone', 'Neutral')}]\n\n"
        )
        
        return context_prefix + message

    async def save_chat(self, user_message: str, ai_response: str, model: str, model_type: str):
        timestamp = datetime.now().isoformat()
        chat_entry = {
            "timestamp": timestamp,
            "user": user_message,
            "ai": ai_response,
            "model": model,
            "modelType": model_type
        }

        date_str = timestamp.split("T")[0]
        history_path = USER_DATA_PATH / "chat_history" / f"{date_str}.json"
        
        history = []
        if history_path.exists():
            with open(history_path, "r", encoding="utf-8") as f:
                history = json.load(f)

        history.append(chat_entry)
        
        with open(history_path, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2, ensure_ascii=False)

    async def get_history(self, limit: int = 50) -> List[dict]:
        history_dir = USER_DATA_PATH / "chat_history"
        
        if not history_dir.exists():
            return []

        json_files = sorted(
            [f for f in history_dir.glob("*.json")],
            reverse=True
        )

        all_history = []
        for file_path in json_files[:5]:  # Last 5 days
            with open(file_path, "r", encoding="utf-8") as f:
                day_history = json.load(f)
                all_history.extend(day_history)

        return all_history[:limit]

    async def create_session(self, title: str = "New Chat") -> str:
        """Create a new chat session and return its ID"""
        session_id = str(uuid.uuid4())
        sessions_path = USER_DATA_PATH / "sessions"
        sessions_path.mkdir(exist_ok=True)
        
        session_data = {
            "id": session_id,
            "title": title,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "messages": []
        }
        
        session_file = sessions_path / f"{session_id}.json"
        with open(session_file, "w", encoding="utf-8") as f:
            json.dump(session_data, f, indent=2, ensure_ascii=False)
        
        return session_id

    async def save_session(self, session_id: str, messages: List[dict], title: Optional[str] = None):
        """Save chat session with messages"""
        sessions_path = USER_DATA_PATH / "sessions"
        session_file = sessions_path / f"{session_id}.json"
        
        if not session_file.exists():
            raise Exception("Session not found")
        
        with open(session_file, "r", encoding="utf-8") as f:
            session_data = json.load(f)
        
        session_data["messages"] = messages
        session_data["updated_at"] = datetime.now().isoformat()
        
        if title:
            session_data["title"] = title
        
        with open(session_file, "w", encoding="utf-8") as f:
            json.dump(session_data, f, indent=2, ensure_ascii=False)

    async def load_session(self, session_id: str) -> dict:
        """Load a chat session by ID"""
        sessions_path = USER_DATA_PATH / "sessions"
        session_file = sessions_path / f"{session_id}.json"
        
        if not session_file.exists():
            raise Exception("Session not found")
        
        with open(session_file, "r", encoding="utf-8") as f:
            return json.load(f)

    async def list_sessions(self) -> List[dict]:
        """List all chat sessions"""
        sessions_path = USER_DATA_PATH / "sessions"
        
        if not sessions_path.exists():
            return []
        
        sessions = []
        for session_file in sessions_path.glob("*.json"):
            with open(session_file, "r", encoding="utf-8") as f:
                session_data = json.load(f)
                sessions.append({
                    "id": session_data["id"],
                    "title": session_data["title"],
                    "created_at": session_data["created_at"],
                    "updated_at": session_data["updated_at"],
                    "message_count": len(session_data.get("messages", []))
                })
        
        # Sort by updated_at descending
        sessions.sort(key=lambda x: x["updated_at"], reverse=True)
        return sessions

    async def delete_session(self, session_id: str):
        """Delete a chat session"""
        sessions_path = USER_DATA_PATH / "sessions"
        session_file = sessions_path / f"{session_id}.json"
        
        if session_file.exists():
            session_file.unlink()
