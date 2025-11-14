import httpx
import os


class CloudModelService:
    async def generate(self, prompt: str, model: str = "openai") -> str:
        if model == "openai" or model.startswith("gpt"):
            return await self.call_openai(prompt)
        elif model == "gemini" or model.startswith("gemini"):
            return await self.call_gemini(prompt)
        raise Exception("Unsupported cloud model")

    async def call_openai(self, prompt: str) -> str:
        api_key = os.getenv("OPENAI_API_KEY")
        
        if not api_key or api_key == "your_openai_key_here":
            raise Exception("OpenAI API key not configured")

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}"
                },
                json={
                    "model": "gpt-3.5-turbo",
                    "messages": [{"role": "user", "content": prompt}]
                }
            )

            if response.status_code != 200:
                error_data = response.json()
                raise Exception(error_data.get("error", {}).get("message", "OpenAI API error"))

            data = response.json()
            return data["choices"][0]["message"]["content"]

    async def call_gemini(self, prompt: str) -> str:
        api_key = os.getenv("GEMINI_API_KEY")
        
        if not api_key or api_key == "your_gemini_key_here":
            raise Exception("Gemini API key not configured")

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key={api_key}",
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
