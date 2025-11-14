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
                    # Return common models as fallback
                    return ["llama3", "llama3.1", "llama2", "mistral", "phi3", "codellama", "gemma"]
                
                data = response.json()
                models = data.get("models", [])
                model_names = [m.get("name") for m in models if m.get("name")]
                
                # If no models found, return fallback list
                if not model_names:
                    return ["llama3", "llama3.1", "llama2", "mistral", "phi3", "codellama", "gemma"]
                
                return model_names
                
        except Exception as e:
            print(f"Error fetching local models: {e}")
            # Return common models as fallback
            return ["llama3", "llama3.1", "llama2", "mistral", "phi3", "codellama", "gemma"]
