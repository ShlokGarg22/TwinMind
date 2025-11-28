import httpx
import os
import json
from typing import List, AsyncGenerator

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
                
                print(f"Ollama response status: {response.status_code}")
                print(f"Ollama response body: {response.text[:500] if response.text else 'Empty'}")
                
                if response.status_code != 200:
                    raise Exception(f"Ollama error: {response.text}")
                
                data = response.json()
                result = data.get("response", "")
                
                if not result:
                    print(f"Warning: Empty response from Ollama. Full data: {data}")
                
                return result
                
        except httpx.ConnectError:
            raise Exception(f"Cannot connect to Ollama at {OLLAMA_URL}. Make sure Ollama is running.")
        except Exception as e:
            raise Exception(f"Local model error: {str(e)}")

    async def generate_stream(self, prompt: str, model: str = "llama3") -> AsyncGenerator[str, None]:
        """Stream response from Ollama"""
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST",
                    f"{OLLAMA_URL}/api/generate",
                    json={
                        "model": model,
                        "prompt": prompt,
                        "stream": True
                    }
                ) as response:
                    if response.status_code != 200:
                        raise Exception(f"Ollama error: {response.status_code}")
                    
                    async for line in response.aiter_lines():
                        if line:
                            try:
                                data = json.loads(line)
                                if "response" in data:
                                    yield data["response"]
                                if data.get("done", False):
                                    break
                            except json.JSONDecodeError:
                                continue
                                
        except httpx.ConnectError:
            raise Exception(f"Cannot connect to Ollama at {OLLAMA_URL}. Make sure Ollama is running.")
        except Exception as e:
            raise Exception(f"Local model streaming error: {str(e)}")

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
