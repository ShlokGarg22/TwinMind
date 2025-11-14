import httpx
import os
from typing import List

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")


class LocalModelService:
    async def generate(self, prompt: str, model: str = "llama3") -> str:
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{OLLAMA_URL}/api/generate",
                    json={
                        "model": model,
                        "prompt": prompt,
                        "stream": False
                    }
                )
                
                if response.status_code != 200:
                    raise Exception(f"Ollama error: {response.text}")
                
                data = response.json()
                return data.get("response", "")
                
        except Exception as e:
            raise Exception(f"Local model error: {str(e)}")

    async def list_models(self) -> List[str]:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{OLLAMA_URL}/api/tags")
                
                if response.status_code != 200:
                    return ["llama3", "mistral", "phi3"]  # Fallback
                
                data = response.json()
                models = data.get("models", [])
                return [m.get("name") for m in models]
                
        except Exception:
            return ["llama3", "mistral", "phi3"]  # Fallback
