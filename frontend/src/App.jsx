import { useEffect, useRef, useState } from 'react'
import { Box, IconButton, Stack, TextField, Typography, Menu, MenuItem, Chip, Divider, ListItemIcon, ListItemText, CircularProgress } from '@mui/material'
import { 
  AddRounded, 
  ChatBubbleOutlineRounded, 
  MenuRounded, 
  SendRounded, 
  KeyboardArrowDownRounded,
  LightbulbOutlined,
  CodeOutlined,
  DescriptionOutlined,
  SchoolOutlined,
  EmailOutlined,
  AnalyticsOutlined,
  StopRounded,
  CloudUploadRounded
} from '@mui/icons-material'
import { AnimatePresence, motion } from 'framer-motion'
import './App.css'

const API_URL = 'http://localhost:8000/api'

const normalizeMessage = (item) => {
  if (!item) return null
  if (item.role) return item
  if (item.user) {
    return {
      role: 'user',
      content: item.user,
      timestamp: item.timestamp,
    }
  }
  if (item.ai) {
    return {
      role: 'assistant',
      content: item.ai,
      timestamp: item.timestamp,
    }
  }
  return null
}


function App() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [chatHistory, setChatHistory] = useState([])
  const [sessions, setSessions] = useState([])
  const [modelType, setModelType] = useState('local')
  const [selectedModel, setSelectedModel] = useState('llama3')
  const [availableModels, setAvailableModels] = useState({ local: [], cloud: {} })
  const [anchorEl, setAnchorEl] = useState(null)
  const [templateAnchorEl, setTemplateAnchorEl] = useState(null)
  const [templates, setTemplates] = useState([])
  const [currentSessionId, setCurrentSessionId] = useState(null)
  const [abortController, setAbortController] = useState(null)
  const [isImporting, setIsImporting] = useState(false)
  const messagesEndRef = useRef(null)

  const menuOpen = Boolean(anchorEl)
  const templateMenuOpen = Boolean(templateAnchorEl)

  useEffect(() => {
    fetchModels()
    fetchHistory()
    fetchTemplates()
    fetchSessions()
    createNewSession()
  }, [])

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, loading])

  const fetchModels = async () => {
    try {
      const res = await fetch(`${API_URL}/models`)
      const data = await res.json()
      setAvailableModels(data)
      
      // Set initial model
      if (data.local && data.local.length > 0) {
        setSelectedModel(data.local[0])
      }
    } catch (error) {
      console.error('Failed to fetch models:', error)
    }
  }

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_URL}/history`)
      const data = await res.json()
      const normalized = data
        .slice(0, 20)
        .reverse()
        .map((item) => normalizeMessage(item))
        .filter(Boolean)
      setMessages(normalized)
      
      // Group by date for sidebar
      const grouped = {}
      data.forEach((item) => {
        const date = new Date(item.timestamp).toLocaleDateString()
        if (!grouped[date]) grouped[date] = []
        grouped[date].push(item)
      })
      setChatHistory(Object.entries(grouped))
    } catch (error) {
      console.error('Failed to fetch history:', error)
    }
  }

  const fetchTemplates = async () => {
    try {
      const res = await fetch(`${API_URL}/templates`)
      const data = await res.json()
      setTemplates(data)
    } catch (error) {
      console.error('Failed to fetch templates:', error)
    }
  }

  const fetchSessions = async () => {
    try {
      const res = await fetch(`${API_URL}/sessions`)
      const data = await res.json()
      setSessions(data)
    } catch (error) {
      console.error('Failed to fetch sessions:', error)
    }
  }

  const loadSession = async (sessionId) => {
    try {
      const res = await fetch(`${API_URL}/sessions/${sessionId}`)
      const data = await res.json()
      setCurrentSessionId(data.id)
      setMessages(data.messages || [])
    } catch (error) {
      console.error('Failed to load session:', error)
    }
  }

  const createNewSession = async () => {
    try {
      const res = await fetch(`${API_URL}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Chat' }),
      })
      const data = await res.json()
      setCurrentSessionId(data.session_id)
      setMessages([])
      fetchSessions()
    } catch (error) {
      console.error('Failed to create session:', error)
    }
  }

  const saveCurrentSession = async () => {
    if (!currentSessionId || messages.length === 0) return
    
    try {
      await fetch(`${API_URL}/sessions/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: currentSessionId,
          messages,
          title: messages[0]?.content?.substring(0, 50) || 'New Chat',
        }),
      })
      fetchSessions()
    } catch (error) {
      console.error('Failed to save session:', error)
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || loading) return

    const timestamp = new Date().toISOString()
    const userMessage = { role: 'user', content: input.trim(), timestamp }
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)
    setIsStreaming(true)

    // Create abort controller for stop functionality
    const controller = new AbortController()
    setAbortController(controller)

    // Add placeholder for assistant message
    const assistantPlaceholder = {
      role: 'assistant',
      content: '',
      model: selectedModel,
      timestamp: new Date().toISOString(),
      isStreaming: true,
    }
    setMessages((prev) => [...prev, assistantPlaceholder])

    try {
      const response = await fetch(`${API_URL}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          model: selectedModel,
          modelType,
          useMemory: true,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error('Failed to connect to streaming endpoint')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              
              if (data.error) {
                throw new Error(data.error)
              }

              if (data.chunk) {
                fullContent += data.chunk
                // Update the last message with accumulated content
                setMessages((prev) => {
                  const newMessages = [...prev]
                  const lastIndex = newMessages.length - 1
                  if (lastIndex >= 0 && newMessages[lastIndex].role === 'assistant') {
                    newMessages[lastIndex] = {
                      ...newMessages[lastIndex],
                      content: fullContent,
                    }
                  }
                  return newMessages
                })
              }

              if (data.done) {
                // Mark streaming as complete
                setMessages((prev) => {
                  const newMessages = [...prev]
                  const lastIndex = newMessages.length - 1
                  if (lastIndex >= 0 && newMessages[lastIndex].role === 'assistant') {
                    newMessages[lastIndex] = {
                      ...newMessages[lastIndex],
                      isStreaming: false,
                    }
                  }
                  return newMessages
                })
              }
            } catch (parseError) {
              // Ignore parse errors for incomplete chunks
              console.debug('Parse error (might be incomplete chunk):', parseError)
            }
          }
        }
      }
      
      // Auto-save session after each exchange
      setTimeout(saveCurrentSession, 500)
    } catch (error) {
      if (error.name === 'AbortError') {
        // User stopped generation
        setMessages((prev) => {
          const newMessages = [...prev]
          const lastIndex = newMessages.length - 1
          if (lastIndex >= 0 && newMessages[lastIndex].role === 'assistant') {
            newMessages[lastIndex] = {
              ...newMessages[lastIndex],
              content: newMessages[lastIndex].content + '\n\n[Generation stopped by user]',
              isStreaming: false,
            }
          }
          return newMessages
        })
      } else {
        console.error('Chat error:', error)
        const errorMessage = error.message || 'Failed to get response'
        setMessages((prev) => {
          const newMessages = [...prev]
          const lastIndex = newMessages.length - 1
          if (lastIndex >= 0 && newMessages[lastIndex].role === 'assistant') {
            newMessages[lastIndex] = {
              ...newMessages[lastIndex],
              content: `⚠️ Error: ${errorMessage}\n\nIf using local models, make sure Ollama is running (run 'ollama serve' in terminal).`,
              isStreaming: false,
            }
          }
          return newMessages
        })
      }
    } finally {
      setLoading(false)
      setIsStreaming(false)
      setAbortController(null)
    }
  }

  const stopGeneration = () => {
    if (abortController) {
      abortController.abort()
    }
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage()
    }
  }

  const handleModelMenuOpen = (event) => {
    setAnchorEl(event.currentTarget)
  }

  const handleModelMenuClose = () => {
    setAnchorEl(null)
  }

  const handleModelSelect = (type, model) => {
    setModelType(type)
    setSelectedModel(model)
    handleModelMenuClose()
  }

  const handleTemplateMenuOpen = (event) => {
    setTemplateAnchorEl(event.currentTarget)
  }

  const handleTemplateMenuClose = () => {
    setTemplateAnchorEl(null)
  }

  const handleTemplateSelect = (template) => {
    setInput(template.prompt)
    handleTemplateMenuClose()
  }

  const getTemplateIcon = (category) => {
    const icons = {
      Analysis: <AnalyticsOutlined fontSize="small" />,
      Productivity: <DescriptionOutlined fontSize="small" />,
      Creative: <LightbulbOutlined fontSize="small" />,
      Development: <CodeOutlined fontSize="small" />,
      Writing: <EmailOutlined fontSize="small" />,
      Education: <SchoolOutlined fontSize="small" />,
    }
    return icons[category] || <LightbulbOutlined fontSize="small" />
  }

  const handleFileUpload = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    setIsImporting(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch(`${API_URL}/import/chatgpt`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Import failed')
      }

      const result = await response.json()
      await fetchSessions()
      alert(`Successfully imported ${result.imported_count} sessions!`)
    } catch (error) {
      console.error('Import error:', error)
      alert('Failed to import chat history')
    } finally {
      setIsImporting(false)
      event.target.value = ''
    }
  }

  const getAvailableModels = () => {
    const models = []
    if (availableModels.local && availableModels.local.length > 0) {
      availableModels.local.forEach((model) => {
        models.push({ type: 'local', name: model })
      })
    }
    if (availableModels.cloud) {
      Object.entries(availableModels.cloud).forEach(([provider, modelList]) => {
        if (Array.isArray(modelList)) {
          modelList.forEach((model) => {
            models.push({ type: 'cloud', name: model, provider })
          })
        } else {
          models.push({ type: 'cloud', name: provider, provider })
        }
      })
    }
    return models
  }

  return (
    <Box className="app-container">
      {/* Sidebar */}
      <Box className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
          <Stack spacing={1} sx={{ p: 2 }}>
          <IconButton
            onClick={createNewSession}
            sx={{
              width: '100%',
              justifyContent: 'flex-start',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
              color: '#fff',
              bgcolor: 'rgba(255,255,255,0.05)',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
              transition: 'all 0.2s ease'
            }}
          >
            <AddRounded sx={{ mr: 1 }} />
            <Typography variant="body2" fontWeight={500}>New chat</Typography>
          </IconButton>
        </Stack>        
        <Stack spacing={0.5} sx={{ px: 2, pb: 2, overflowY: 'auto', flex: 1 }}>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', px: 1, py: 1, fontWeight: 600, letterSpacing: '0.5px' }}>
            RECENT
          </Typography>
          {sessions.length > 0 ? (
            sessions.map((session) => (
              <Box
                key={session.id}
                onClick={() => loadSession(session.id)}
                sx={{
                  p: 1.5,
                  borderRadius: '12px',
                  cursor: 'pointer',
                  bgcolor: currentSessionId === session.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                  border: currentSessionId === session.id ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' },
                  transition: 'all 0.2s ease'
                }}
              >
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <ChatBubbleOutlineRounded sx={{ fontSize: 18, color: 'rgba(255,255,255,0.6)' }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        color: '#e2e8f0',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontWeight: 500
                      }}
                    >
                      {session.title}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                      {session.message_count} messages
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            ))
          ) : (
            chatHistory.map(([date, chats], idx) => (
              <Box key={idx}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', px: 1, py: 1, mt: 1, display: 'block' }}>
                  {date}
                </Typography>
                {chats.slice(0, 5).map((chat, i) => (
                  <Box
                    key={i}
                    sx={{
                      p: 1.5,
                      borderRadius: '12px',
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' },
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <ChatBubbleOutlineRounded sx={{ fontSize: 18, color: 'rgba(255,255,255,0.6)' }} />
                      <Typography
                        variant="body2"
                        sx={{
                          color: '#e2e8f0',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {chat.user || chat.content || 'Chat'}
                      </Typography>
                    </Stack>
                  </Box>
                ))}
              </Box>
            ))
          )}
        </Stack>

        <Box sx={{ p: 2, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <input
            accept=".json"
            style={{ display: 'none' }}
            id="import-file-upload"
            type="file"
            onChange={handleFileUpload}
            disabled={isImporting}
          />
          <label htmlFor="import-file-upload">
            <IconButton
              component="span"
              disabled={isImporting}
              sx={{
                width: '100%',
                justifyContent: 'flex-start',
                borderRadius: '12px',
                color: 'rgba(255,255,255,0.7)',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.05)', color: '#fff' },
                transition: 'all 0.2s ease'
              }}
            >
              {isImporting ? (
                <CircularProgress size={20} sx={{ mr: 1, color: 'inherit' }} />
              ) : (
                <CloudUploadRounded sx={{ mr: 1 }} />
              )}
              <Typography variant="body2" fontWeight={500}>
                {isImporting ? 'Importing...' : 'Import ChatGPT'}
              </Typography>
            </IconButton>
          </label>
        </Box>
      </Box>

      {/* Main Chat Area */}
      <Box className="main-area">
        <Box className="top-bar">
          <IconButton onClick={() => setSidebarOpen(!sidebarOpen)} sx={{ color: 'rgba(255,255,255,0.7)' }}>
            <MenuRounded />
          </IconButton>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="h6" sx={{ fontWeight: 600, color: '#fff', letterSpacing: '-0.5px' }}>
              TwinMind AI
            </Typography>
            <Chip
              label={`${selectedModel} (${modelType})`}
              onClick={handleModelMenuOpen}
              onDelete={handleModelMenuOpen}
              deleteIcon={<KeyboardArrowDownRounded />}
              sx={{
                bgcolor: 'rgba(255,255,255,0.1)',
                color: '#fff',
                fontWeight: 500,
                cursor: 'pointer',
                border: '1px solid rgba(255,255,255,0.1)',
                backdropFilter: 'blur(10px)',
                '& .MuiChip-deleteIcon': {
                  color: 'rgba(255,255,255,0.7)',
                },
                '&:hover': {
                  bgcolor: 'rgba(255,255,255,0.15)',
                }
              }}
            />
          </Stack>
          <Box sx={{ width: 40 }} />
        </Box>

        <Menu
          anchorEl={anchorEl}
          open={menuOpen}
          onClose={handleModelMenuClose}
          PaperProps={{
            sx: {
              mt: 1,
              minWidth: 240,
              maxHeight: 400,
              borderRadius: '16px',
              bgcolor: 'rgba(20, 20, 25, 0.9)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#fff',
              boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
            },
          }}
        >
          <Typography variant="caption" sx={{ px: 2, py: 1, color: 'rgba(255,255,255,0.5)', fontWeight: 600, display: 'block' }}>
            LOCAL MODELS
          </Typography>
          {availableModels.local && availableModels.local.length > 0 ? (
            availableModels.local.map((model) => (
              <MenuItem
                key={model}
                onClick={() => handleModelSelect('local', model)}
                selected={modelType === 'local' && selectedModel === model}
                sx={{ 
                  px: 2, py: 1.5,
                  '&.Mui-selected': { bgcolor: 'rgba(59, 130, 246, 0.2)' },
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' }
                }}
              >
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ width: '100%' }}>
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: '#4caf50',
                      boxShadow: '0 0 10px rgba(76, 175, 80, 0.5)'
                    }}
                  />
                  <Typography variant="body2" sx={{ flex: 1, color: '#fff' }}>{model}</Typography>
                  {modelType === 'local' && selectedModel === model && (
                    <Typography variant="caption" sx={{ color: '#4caf50', fontWeight: 600 }}>
                      ✓
                    </Typography>
                  )}
                </Stack>
              </MenuItem>
            ))
          ) : (
            <MenuItem disabled sx={{ px: 2, py: 1 }}>
              <Typography variant="body2" color="rgba(255,255,255,0.5)">
                No local models available
              </Typography>
            </MenuItem>
          )}
          
          <Typography variant="caption" sx={{ px: 2, py: 1, mt: 1, color: 'rgba(255,255,255,0.5)', fontWeight: 600, display: 'block' }}>
            CLOUD MODELS
          </Typography>
          {availableModels.cloud && Object.keys(availableModels.cloud).length > 0 ? (
            Object.entries(availableModels.cloud).map(([provider, modelList]) => (
              <Box key={provider}>
                <Typography variant="caption" sx={{ px: 3, py: 0.5, color: 'rgba(255,255,255,0.3)', fontWeight: 500, display: 'block' }}>
                  {provider.toUpperCase()}
                </Typography>
                {Array.isArray(modelList) && modelList.length > 0 ? (
                  modelList.map((model) => (
                    <MenuItem
                      key={`${provider}-${model}`}
                      onClick={() => handleModelSelect('cloud', model)}
                      selected={modelType === 'cloud' && selectedModel === model}
                      sx={{ 
                        px: 2, py: 1.5, pl: 4,
                        '&.Mui-selected': { bgcolor: 'rgba(59, 130, 246, 0.2)' },
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' }
                      }}
                    >
                      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ width: '100%' }}>
                        <Box
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            bgcolor: '#3b82f6',
                            boxShadow: '0 0 10px rgba(59, 130, 246, 0.5)'
                          }}
                        />
                        <Typography variant="body2" sx={{ flex: 1, color: '#fff' }}>{model}</Typography>
                        {modelType === 'cloud' && selectedModel === model && (
                          <Typography variant="caption" sx={{ color: '#3b82f6', fontWeight: 600 }}>
                            ✓
                          </Typography>
                        )}
                      </Stack>
                    </MenuItem>
                  ))
                ) : null}
              </Box>
            ))
          ) : (
            <MenuItem disabled sx={{ px: 2, py: 1 }}>
              <Typography variant="body2" color="rgba(255,255,255,0.5)">
                No cloud models configured
              </Typography>
            </MenuItem>
          )}
        </Menu>

        <Box className="chat-content">
          {messages.length === 0 ? (
            <Box className="welcome-screen">
              <Typography variant="h2" sx={{ fontWeight: 700, mb: 2, background: 'linear-gradient(135deg, #fff 0%, #94a3b8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                TwinMind AI
              </Typography>
              <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.6)', maxWidth: 500, lineHeight: 1.6 }}>
                Your advanced AI assistant with long-term memory and streaming capabilities.
              </Typography>
            </Box>
          ) : (
            <Stack spacing={3} sx={{ maxWidth: 850, mx: 'auto', width: '100%', px: 2 }}>
              <AnimatePresence initial={false}>
                {messages.map((msg, idx) => {
                  const isUser = msg.role === 'user'
                  const content = msg.content || ''
                  return (
                    <motion.div
                      key={`${msg.timestamp || idx}`}
                      initial={{ opacity: 0, y: 20, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                      className={`message-bubble ${isUser ? 'user' : 'assistant'}`}
                    >
                      <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: '1rem' }}>
                        {content}
                      </Typography>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
              {loading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="message-bubble assistant"
                  style={{ width: 'fit-content' }}
                >
                  <Box className="typing-dots">
                    <span />
                    <span />
                    <span />
                  </Box>
                </motion.div>
              )}
              <span ref={messagesEndRef} />
            </Stack>
          )}
        </Box>

        <Box className="input-area">
          <Box className="input-wrapper">
            <Stack direction="row" spacing={1} sx={{ mb: 1, px: 1, pt: 1 }}>
              <Chip
                label="✨ Templates"
                onClick={handleTemplateMenuOpen}
                variant="outlined"
                size="small"
                sx={{
                  borderColor: 'rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.7)',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.3)' },
                }}
              />
            </Stack>
            
            <Menu
              anchorEl={templateAnchorEl}
              open={templateMenuOpen}
              onClose={handleTemplateMenuClose}
              PaperProps={{
                sx: {
                  mt: 1,
                  minWidth: 320,
                  maxHeight: 500,
                  borderRadius: '16px',
                  bgcolor: 'rgba(20, 20, 25, 0.9)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                },
              }}
            >
              <Typography variant="subtitle2" sx={{ px: 2, py: 1.5, fontWeight: 600, color: '#fff' }}>
                Prompt Templates
              </Typography>
              <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />
              {templates.length > 0 ? (
                (() => {
                  const categories = {}
                  templates.forEach((template) => {
                    if (!categories[template.category]) {
                      categories[template.category] = []
                    }
                    categories[template.category].push(template)
                  })
                  
                  return Object.entries(categories).map(([category, categoryTemplates]) => (
                    <Box key={category}>
                      <Typography
                        variant="caption"
                        sx={{ px: 2, py: 1, mt: 1, color: 'rgba(255,255,255,0.5)', fontWeight: 600, display: 'block' }}
                      >
                        {category.toUpperCase()}
                      </Typography>
                      {categoryTemplates.map((template) => (
                        <MenuItem
                          key={template.id}
                          onClick={() => handleTemplateSelect(template)}
                          sx={{ 
                            px: 2, py: 1.5,
                            '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' }
                          }}
                        >
                          <ListItemIcon sx={{ minWidth: 32, color: 'rgba(255,255,255,0.7)' }}>
                            {getTemplateIcon(template.category)}
                          </ListItemIcon>
                          <ListItemText
                            primary={template.title}
                            primaryTypographyProps={{ variant: 'body2', fontWeight: 500, color: '#fff' }}
                          />
                        </MenuItem>
                      ))}
                    </Box>
                  ))
                })()
              ) : (
                <MenuItem disabled sx={{ px: 2, py: 1 }}>
                  <Typography variant="body2" color="rgba(255,255,255,0.5)">
                    No templates available
                  </Typography>
                </MenuItem>
              )}
            </Menu>
            
            <TextField
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message TwinMind AI..."
              fullWidth
              multiline
              maxRows={6}
              variant="outlined"
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: '24px',
                  color: '#fff',
                  '& fieldset': { border: 'none' },
                },
                '& .MuiInputBase-input::placeholder': {
                  color: 'rgba(255,255,255,0.4)',
                  opacity: 1,
                },
              }}
              InputProps={{
                endAdornment: isStreaming ? (
                    <IconButton
                      onClick={stopGeneration}
                      sx={{
                        bgcolor: 'rgba(220, 53, 69, 0.2)',
                        color: '#ff6b6b',
                        width: 36,
                        height: 36,
                        border: '1px solid rgba(220, 53, 69, 0.3)',
                        '&:hover': {
                          bgcolor: 'rgba(220, 53, 69, 0.3)',
                        },
                      }}
                    >
                      <StopRounded sx={{ fontSize: 20 }} />
                    </IconButton>
                  ) : (
                    <IconButton
                      onClick={sendMessage}
                      disabled={loading || !input.trim()}
                      sx={{
                        bgcolor: loading || !input.trim() ? 'rgba(255,255,255,0.05)' : '#3b82f6',
                        color: loading || !input.trim() ? 'rgba(255,255,255,0.3)' : '#fff',
                        width: 36,
                        height: 36,
                        boxShadow: loading || !input.trim() ? 'none' : '0 0 15px rgba(59, 130, 246, 0.5)',
                        '&:hover': {
                          bgcolor: loading || !input.trim() ? 'rgba(255,255,255,0.05)' : '#2563eb',
                        },
                        '&.Mui-disabled': {
                          bgcolor: 'rgba(255,255,255,0.05)',
                          color: 'rgba(255,255,255,0.3)',
                        },
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <SendRounded sx={{ fontSize: 18 }} />
                    </IconButton>
                  ),
              }}
            />
          </Box>
          <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 2, color: 'rgba(255,255,255,0.3)' }}>
            TwinMind AI can make mistakes. Consider checking important information.
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}

export default App

