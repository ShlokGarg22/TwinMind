import httpx
import os
import json
from typing import Dict, List, AsyncGenerator


class CloudModelService:
    def get_available_models(self) -> Dict[str, List[str]]:
        """Return available cloud models organized by provider"""
        models = {}
        
        # Always show all cloud models, regardless of API key status
        # Users can configure keys later
        models["openai"] = ["gpt-4", "gpt-3.5-turbo", "gpt-4-turbo"]
        models["gemini"] = ["gemini-pro", "gemini-1.5-pro"]
        models["anthropic"] = ["claude-3-opus", "claude-3-sonnet", "claude-3-haiku"]
        
        return models

    async def generate(self, prompt: str, model: str = "openai") -> str:
        if model == "openai" or model.startswith("gpt"):
            return await self.call_openai(prompt, model)
        elif model == "gemini" or model.startswith("gemini"):
            return await self.call_gemini(prompt, model)
        elif model == "anthropic" or model.startswith("claude"):
            return await self.call_anthropic(prompt, model)
        raise Exception("Unsupported cloud model")

    async def generate_stream(self, prompt: str, model: str = "openai") -> AsyncGenerator[str, None]:
        """Stream responses from cloud models"""
        if model == "openai" or model.startswith("gpt"):
            async for chunk in self.stream_openai(prompt, model):
                yield chunk
        elif model == "gemini" or model.startswith("gemini"):
            # Gemini doesn't have native streaming via simple API, fall back to non-streaming
            response = await self.call_gemini(prompt, model)
            yield response
        elif model == "anthropic" or model.startswith("claude"):
            async for chunk in self.stream_anthropic(prompt, model):
                yield chunk
        else:
            raise Exception("Unsupported cloud model")

    async def stream_openai(self, prompt: str, model: str = "gpt-3.5-turbo") -> AsyncGenerator[str, None]:
        """Stream from OpenAI API"""
        api_key = os.getenv("OPENAI_API_KEY")
        
        if not api_key or api_key == "your_openai_key_here":
            raise Exception("OpenAI API key not configured")

        if model == "openai":
            model = "gpt-3.5-turbo"

        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST",
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}"
                },
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "stream": True
                }
            ) as response:
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str.strip() == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            if "choices" in data and len(data["choices"]) > 0:
                                delta = data["choices"][0].get("delta", {})
                                content = delta.get("content", "")
                                if content:
                                    yield content
                        except json.JSONDecodeError:
                            continue

    async def stream_anthropic(self, prompt: str, model: str = "claude-3-sonnet") -> AsyncGenerator[str, None]:
        """Stream from Anthropic API"""
        api_key = os.getenv("ANTHROPIC_API_KEY")
        
        if not api_key or api_key == "your_anthropic_key_here":
            raise Exception("Anthropic API key not configured")

        if model == "anthropic":
            model = "claude-3-sonnet-20240229"
        elif not model.endswith("-20240229"):
            model = f"{model}-20240229"

        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST",
                "https://api.anthropic.com/v1/messages",
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01"
                },
                json={
                    "model": model,
                    "max_tokens": 4096,
                    "messages": [{"role": "user", "content": prompt}],
                    "stream": True
                }
            ) as response:
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:]
                        try:
                            data = json.loads(data_str)
                            if data.get("type") == "content_block_delta":
                                delta = data.get("delta", {})
                                text = delta.get("text", "")
                                if text:
                                    yield text
                        except json.JSONDecodeError:
                            continue

    async def call_openai(self, prompt: str, model: str = "gpt-3.5-turbo") -> str:
        api_key = os.getenv("OPENAI_API_KEY")
        
        if not api_key or api_key == "your_openai_key_here":
            raise Exception("OpenAI API key not configured")

        # Extract model name if it's just the provider
        if model == "openai":
            model = "gpt-3.5-turbo"

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}"
                },
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}]
                }
            )

            if response.status_code != 200:
                error_data = response.json()
                raise Exception(error_data.get("error", {}).get("message", "OpenAI API error"))

            data = response.json()
            return data["choices"][0]["message"]["content"]

    async def call_gemini(self, prompt: str, model: str = "gemini-pro") -> str:
        api_key = os.getenv("GEMINI_API_KEY")
        
        if not api_key or api_key == "your_gemini_key_here":
            raise Exception("Gemini API key not configured")

        # Extract model name if it's just the provider
        if model == "gemini":
            model = "gemini-pro"

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}",
                headers={"Content-Type": "application/json"},
                json={
                    "contents": [{"parts": [{"text": prompt}]}]
                }
            )

            if response.status_code != 200:
                error_data = response.json()
                raise Exception(error_data.get("error", {}).get("message", "Gemini API error"))

            data = response.json()
            return data["candidates"][0]["content"]["parts"][0]["text"]

    async def call_anthropic(self, prompt: str, model: str = "claude-3-sonnet") -> str:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        
        if not api_key or api_key == "your_anthropic_key_here":
            raise Exception("Anthropic API key not configured")

        # Extract model name if it's just the provider
        if model == "anthropic":
            model = "claude-3-sonnet-20240229"
        elif not model.endswith("-20240229"):
            model = f"{model}-20240229"

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01"
                },
                json={
                    "model": model,
                    "max_tokens": 4096,
                    "messages": [{"role": "user", "content": prompt}]
                }
            )

            if response.status_code != 200:
                error_data = response.json()
                raise Exception(error_data.get("error", {}).get("message", "Anthropic API error"))

            data = response.json()
            return data["content"][0]["text"]

