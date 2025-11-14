import json
import os
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
