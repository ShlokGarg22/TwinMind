import { useState, useEffect } from 'react'
import './App.css'

const API_URL = 'http://localhost:8000/api';

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [modelType, setModelType] = useState('local');
  const [selectedModel, setSelectedModel] = useState('llama3');
  const [availableModels, setAvailableModels] = useState({ local: [], cloud: {} });

  useEffect(() => {
    fetchModels();
    fetchHistory();
  }, []);

  const fetchModels = async () => {
    try {
      const res = await fetch(`${API_URL}/models`);
      const data = await res.json();
      setAvailableModels(data);
    } catch (error) {
      console.error('Failed to fetch models:', error);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_URL}/history`);
      const data = await res.json();
      setMessages(data.slice(0, 10).reverse());
    } catch (error) {
      console.error('Failed to fetch history:', error);
    }
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = { user: input, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          model: selectedModel,
          modelType
        })
      });

      const data = await res.json();
      
      setMessages(prev => [...prev, {
        ai: data.response,
        model: data.model,
        modelType: data.modelType,
        timestamp: new Date().toISOString()
      }]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, {
        ai: 'Error: ' + error.message,
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <div className="header">
        <h1>🤖 AI Chat Platform</h1>
        <div className="model-selector">
          <select value={modelType} onChange={(e) => setModelType(e.target.value)}>
            <option value="local">Local Model</option>
            <option value="cloud">Cloud Model</option>
          </select>
          <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
            {modelType === 'local' ? (
              availableModels.local.length > 0 ? (
                availableModels.local.map(m => <option key={m} value={m}>{m}</option>)
              ) : (
                <option value="llama3">llama3</option>
              )
            ) : (
              <>
                <option value="openai">OpenAI GPT</option>
                <option value="gemini">Google Gemini</option>
              </>
            )}
          </select>
        </div>
      </div>

      <div className="chat-container">
        {messages.map((msg, idx) => (
          <div key={idx} className={msg.user ? 'message user' : 'message ai'}>
            <div className="message-content">
              {msg.user && <strong>You:</strong>}
              {msg.ai && <strong>AI ({msg.model || 'assistant'}):</strong>}
              <p>{msg.user || msg.ai}</p>
            </div>
          </div>
        ))}
        {loading && <div className="message ai loading">Thinking...</div>}
      </div>

      <div className="input-container">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Type your message..."
          disabled={loading}
        />
        <button onClick={sendMessage} disabled={loading || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  )
}

export default App
