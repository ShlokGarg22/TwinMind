import aiosqlite
import json
import re
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict

DB_PATH = Path(__file__).parent.parent.parent / "user-data" / "memories.db"


class LongTermMemoryService:
    def __init__(self):
        self.db_path = DB_PATH
        self._initialized = False

    async def initialize(self):
        """Create database tables if they don't exist"""
        if self._initialized:
            return
            
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        
        async with aiosqlite.connect(self.db_path) as db:
            # User facts table - stores extracted facts about user
            await db.execute("""
                CREATE TABLE IF NOT EXISTS user_facts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    fact TEXT NOT NULL,
                    category TEXT DEFAULT 'general',
                    source TEXT,
                    created_at TEXT NOT NULL,
                    importance INTEGER DEFAULT 1
                )
            """)
            
            # Conversation summaries table
            await db.execute("""
                CREATE TABLE IF NOT EXISTS conversation_summaries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT,
                    summary TEXT NOT NULL,
                    topics TEXT,
                    created_at TEXT NOT NULL
                )
            """)
            
            # Pinned memories - user explicitly saved
            await db.execute("""
                CREATE TABLE IF NOT EXISTS pinned_memories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    content TEXT NOT NULL,
                    label TEXT,
                    created_at TEXT NOT NULL
                )
            """)
            
            await db.commit()
        
        self._initialized = True

    async def add_fact(self, fact: str, category: str = "general", source: str = None, importance: int = 1):
        """Store a fact about the user"""
        await self.initialize()
        
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """INSERT INTO user_facts (fact, category, source, created_at, importance)
                   VALUES (?, ?, ?, ?, ?)""",
                (fact, category, source, datetime.now().isoformat(), importance)
            )
            await db.commit()

    async def get_facts(self, limit: int = 20) -> List[Dict]:
        """Get stored facts, ordered by importance and recency"""
        await self.initialize()
        
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                """SELECT * FROM user_facts 
                   ORDER BY importance DESC, created_at DESC 
                   LIMIT ?""",
                (limit,)
            )
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]

    async def search_facts(self, query: str, limit: int = 10) -> List[Dict]:
        """Search facts by keyword"""
        await self.initialize()
        
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                """SELECT * FROM user_facts 
                   WHERE fact LIKE ? 
                   ORDER BY importance DESC, created_at DESC 
                   LIMIT ?""",
                (f"%{query}%", limit)
            )
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]

    async def add_summary(self, session_id: str, summary: str, topics: List[str] = None):
        """Store a conversation summary"""
        await self.initialize()
        
        topics_json = json.dumps(topics) if topics else None
        
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """INSERT INTO conversation_summaries (session_id, summary, topics, created_at)
                   VALUES (?, ?, ?, ?)""",
                (session_id, summary, topics_json, datetime.now().isoformat())
            )
            await db.commit()

    async def get_summaries(self, limit: int = 10) -> List[Dict]:
        """Get recent conversation summaries"""
        await self.initialize()
        
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                """SELECT * FROM conversation_summaries 
                   ORDER BY created_at DESC 
                   LIMIT ?""",
                (limit,)
            )
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]

    async def pin_memory(self, content: str, label: str = None):
        """User-pinned important memory"""
        await self.initialize()
        
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """INSERT INTO pinned_memories (content, label, created_at)
                   VALUES (?, ?, ?)""",
                (content, label, datetime.now().isoformat())
            )
            await db.commit()

    async def get_pinned_memories(self) -> List[Dict]:
        """Get all pinned memories"""
        await self.initialize()
        
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT * FROM pinned_memories ORDER BY created_at DESC"
            )
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]

    async def delete_fact(self, fact_id: int):
        """Delete a fact by ID"""
        await self.initialize()
        
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("DELETE FROM user_facts WHERE id = ?", (fact_id,))
            await db.commit()

    async def delete_pinned_memory(self, memory_id: int):
        """Delete a pinned memory by ID"""
        await self.initialize()
        
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("DELETE FROM pinned_memories WHERE id = ?", (memory_id,))
            await db.commit()

    async def get_context_memories(self, message: str, limit: int = 5) -> str:
        """Get relevant memories to inject into context"""
        await self.initialize()
        
        context_parts = []
        
        # Get recent facts
        facts = await self.get_facts(limit=limit)
        if facts:
            fact_text = "\n".join([f"- {f['fact']}" for f in facts])
            context_parts.append(f"[Known facts about user:\n{fact_text}]")
        
        # Get pinned memories
        pinned = await self.get_pinned_memories()
        if pinned:
            pinned_text = "\n".join([f"- {p['content']}" for p in pinned[:3]])
            context_parts.append(f"[Important context:\n{pinned_text}]")
        
        # Search for relevant facts based on message keywords
        keywords = self._extract_keywords(message)
        for keyword in keywords[:3]:
            relevant = await self.search_facts(keyword, limit=2)
            for fact in relevant:
                if fact not in facts:
                    context_parts.append(f"[Relevant: {fact['fact']}]")
        
        return "\n".join(context_parts) if context_parts else ""

    def _extract_keywords(self, text: str) -> List[str]:
        """Extract meaningful keywords from text"""
        # Remove common words
        stopwords = {'i', 'me', 'my', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 
                     'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
                     'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall',
                     'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for',
                     'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
                     'before', 'after', 'above', 'below', 'between', 'under', 'again',
                     'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
                     'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
                     'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
                     'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while',
                     'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom'}
        
        words = re.findall(r'\b\w+\b', text.lower())
        keywords = [w for w in words if w not in stopwords and len(w) > 2]
        return keywords[:10]

    async def extract_facts_from_message(self, user_message: str, ai_response: str) -> List[str]:
        """Extract facts from conversation to store"""
        extracted = []
        
        # Patterns to detect user facts
        patterns = [
            (r"(?:my name is|i'm called|call me)\s+([A-Z][a-z]+)", "name"),
            (r"(?:i live in|i'm from|i'm based in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)", "location"),
            (r"(?:i work as|i'm a|my job is|i do)\s+([a-z]+(?:\s+[a-z]+){0,3})", "occupation"),
            (r"(?:i like|i love|i enjoy|my hobby is)\s+([a-z]+(?:\s+[a-z]+){0,3})", "interest"),
            (r"(?:i prefer|i always use|my favorite)\s+([a-z]+(?:\s+[a-z]+){0,3})", "preference"),
        ]
        
        message_lower = user_message.lower()
        
        for pattern, category in patterns:
            matches = re.findall(pattern, message_lower, re.IGNORECASE)
            for match in matches:
                fact = f"User's {category}: {match}"
                extracted.append((fact, category))
        
        # Store extracted facts
        for fact, category in extracted:
            await self.add_fact(fact, category=category, source="auto-extracted")
        
        return [f[0] for f in extracted]

    async def get_all_memories(self) -> Dict:
        """Get all memories for display"""
        await self.initialize()
        
        return {
            "facts": await self.get_facts(limit=50),
            "summaries": await self.get_summaries(limit=20),
            "pinned": await self.get_pinned_memories()
        }

    async def clear_all(self):
        """Clear all memories (use with caution)"""
        await self.initialize()
        
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("DELETE FROM user_facts")
            await db.execute("DELETE FROM conversation_summaries")
            await db.execute("DELETE FROM pinned_memories")
            await db.commit()
