import json
import uuid
import os
import aiofiles
from datetime import datetime

class ImportService:
    def __init__(self, history_dir="user-data/sessions"):
        # Go up one level from services to python root, then to user-data
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        # Adjust path to be relative to the project root if needed, but here we assume standard structure
        # Actually, let's use the same path convention as memory.py if possible, or just absolute path
        # For now, let's try to find the user-data folder relative to this file
        self.history_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "user-data", "sessions")
        os.makedirs(self.history_dir, exist_ok=True)

    async def import_chatgpt_data(self, file_content: bytes):
        try:
            data = json.loads(file_content)
            imported_count = 0
            
            # Handle both single conversation (dict) and list of conversations (list)
            if isinstance(data, dict):
                data = [data]
            
            for convo in data:
                # Skip empty conversations or those without mapping
                if not convo.get('mapping'):
                    continue

                # 1. Extract Title
                title = convo.get('title', 'Imported Chat')
                
                # 2. Extract Messages (Linearize the tree)
                # ChatGPT uses a tree structure. We'll follow the 'current_node' path.
                messages = []
                current_node_id = convo.get('current_node')
                mapping = convo.get('mapping', {})
                
                while current_node_id:
                    node = mapping.get(current_node_id)
                    if not node:
                        break
                        
                    message_data = node.get('message')
                    if message_data:
                        author_role = message_data.get('author', {}).get('role')
                        content_parts = message_data.get('content', {}).get('parts', [])
                        
                        # Filter out system messages or empty content
                        if author_role in ['user', 'assistant'] and content_parts:
                            text_content = ""
                            for part in content_parts:
                                if isinstance(part, str):
                                    text_content += part
                            
                            if text_content:
                                # Prepend because we are traversing backwards
                                messages.insert(0, {
                                    "role": author_role,
                                    "content": text_content,
                                    "timestamp": message_data.get('create_time')
                                })
                    
                    # Move to parent
                    current_node_id = node.get('parent')

                if not messages:
                    continue

                # 3. Create Session File
                session_id = str(uuid.uuid4())
                timestamp = datetime.now().isoformat()
                session_data = {
                    "id": session_id,
                    "title": title,
                    "created_at": timestamp,
                    "updated_at": timestamp,
                    "messages": messages,
                    "model": "gpt-3.5-turbo" # Default for imports
                }

                # Save to file
                file_path = os.path.join(self.history_dir, f"{session_id}.json")
                async with aiofiles.open(file_path, mode='w') as f:
                    await f.write(json.dumps(session_data, indent=2))
                
                imported_count += 1

            return {"status": "success", "imported": imported_count}

        except Exception as e:
            print(f"Import error: {e}")
            return {"status": "error", "message": str(e)}
