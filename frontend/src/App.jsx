import { useEffect, useRef, useState } from 'react'
import { Box, IconButton, Stack, TextField, Typography, Menu, MenuItem, Chip, Divider, ListItemIcon, ListItemText } from '@mui/material'
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
  AnalyticsOutlined
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

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          model: selectedModel,
          modelType,
        }),
      })

      const data = await res.json()

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.response,
          model: data.model,
          timestamp: new Date().toISOString(),
        },
      ])
      
      // Auto-save session after each exchange
      setTimeout(saveCurrentSession, 500)
    } catch (error) {
      console.error('Chat error:', error)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Error: ${error.message}`,
          timestamp: new Date().toISOString(),
        },
      ])
    } finally {
      setLoading(false)
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
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '8px',
              color: '#fff',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
            }}
          >
            <AddRounded sx={{ mr: 1 }} />
            <Typography variant="body2">New chat</Typography>
          </IconButton>
        </Stack>        <Stack spacing={0.5} sx={{ px: 2, pb: 2, overflowY: 'auto', flex: 1 }}>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', px: 1, py: 0.5 }}>
            Recent Sessions
          </Typography>
          {sessions.length > 0 ? (
            sessions.map((session) => (
              <Box
                key={session.id}
                onClick={() => loadSession(session.id)}
                sx={{
                  p: 1.5,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  bgcolor: currentSessionId === session.id ? 'rgba(255,255,255,0.15)' : 'transparent',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <ChatBubbleOutlineRounded sx={{ fontSize: 16, color: 'rgba(255,255,255,0.7)' }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        color: '#fff',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {session.title}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                      {session.message_count} messages
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            ))
          ) : (
            chatHistory.map(([date, chats], idx) => (
              <Box key={idx}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', px: 1, py: 0.5 }}>
                  {date}
                </Typography>
                {chats.slice(0, 5).map((chat, i) => (
                  <Box
                    key={i}
                    sx={{
                      p: 1.5,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center">
                      <ChatBubbleOutlineRounded sx={{ fontSize: 16, color: 'rgba(255,255,255,0.7)' }} />
                      <Typography
                        variant="body2"
                        sx={{
                          color: '#fff',
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
      </Box>

      {/* Main Chat Area */}
      <Box className="main-area">
        <Box className="top-bar">
          <IconButton onClick={() => setSidebarOpen(!sidebarOpen)} sx={{ color: '#666' }}>
            <MenuRounded />
          </IconButton>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="h6" sx={{ fontWeight: 600, color: '#202124' }}>
              ChatGPT 5.1
            </Typography>
            <Chip
              label={`${selectedModel} (${modelType})`}
              onClick={handleModelMenuOpen}
              onDelete={handleModelMenuOpen}
              deleteIcon={<KeyboardArrowDownRounded />}
              sx={{
                bgcolor: modelType === 'local' ? '#e3f2fd' : '#f3e5f5',
                color: modelType === 'local' ? '#1565c0' : '#6a1b9a',
                fontWeight: 500,
                cursor: 'pointer',
                '& .MuiChip-deleteIcon': {
                  color: modelType === 'local' ? '#1565c0' : '#6a1b9a',
                },
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
              borderRadius: '12px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            },
          }}
        >
          <Typography variant="caption" sx={{ px: 2, py: 1, color: '#666', fontWeight: 600, display: 'block' }}>
            LOCAL MODELS
          </Typography>
          {availableModels.local && availableModels.local.length > 0 ? (
            availableModels.local.map((model) => (
              <MenuItem
                key={model}
                onClick={() => handleModelSelect('local', model)}
                selected={modelType === 'local' && selectedModel === model}
                sx={{ px: 2, py: 1.5 }}
              >
                <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: '#4caf50',
                    }}
                  />
                  <Typography variant="body2" sx={{ flex: 1 }}>{model}</Typography>
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
              <Typography variant="body2" color="text.secondary">
                No local models available
              </Typography>
            </MenuItem>
          )}
          
          <Typography variant="caption" sx={{ px: 2, py: 1, mt: 1, color: '#666', fontWeight: 600, display: 'block' }}>
            CLOUD MODELS
          </Typography>
          {availableModels.cloud && Object.keys(availableModels.cloud).length > 0 ? (
            Object.entries(availableModels.cloud).map(([provider, modelList]) => (
              <Box key={provider}>
                <Typography variant="caption" sx={{ px: 3, py: 0.5, color: '#999', fontWeight: 500, display: 'block' }}>
                  {provider.toUpperCase()}
                </Typography>
                {Array.isArray(modelList) && modelList.length > 0 ? (
                  modelList.map((model) => (
                    <MenuItem
                      key={`${provider}-${model}`}
                      onClick={() => handleModelSelect('cloud', model)}
                      selected={modelType === 'cloud' && selectedModel === model}
                      sx={{ px: 2, py: 1.5, pl: 4 }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
                        <Box
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            bgcolor: '#2196f3',
                          }}
                        />
                        <Typography variant="body2" sx={{ flex: 1 }}>{model}</Typography>
                        {modelType === 'cloud' && selectedModel === model && (
                          <Typography variant="caption" sx={{ color: '#2196f3', fontWeight: 600 }}>
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
              <Typography variant="body2" color="text.secondary">
                No cloud models configured
              </Typography>
            </MenuItem>
          )}
        </Menu>

        <Box className="chat-content">
          {messages.length === 0 ? (
            <Box className="welcome-screen">
              <Typography variant="h3" sx={{ fontWeight: 600, mb: 6, color: '#202124' }}>
                What can I help with?
              </Typography>
            </Box>
          ) : (
            <Stack spacing={4} sx={{ maxWidth: 800, mx: 'auto', width: '100%' }}>
              <AnimatePresence initial={false}>
                {messages.map((msg, idx) => {
                  const isUser = msg.role === 'user'
                  const content = msg.content || ''
                  return (
                    <motion.div
                      key={`${msg.timestamp || idx}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Stack direction="row" spacing={2} alignItems="flex-start">
                        <Box
                          sx={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            bgcolor: isUser ? '#19c37d' : '#ab68ff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontWeight: 600,
                            fontSize: 14,
                            flexShrink: 0,
                          }}
                        >
                          {isUser ? 'Y' : 'C'}
                        </Box>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5, color: '#202124' }}>
                            {isUser ? 'You' : 'ChatGPT'}
                          </Typography>
                          <Typography variant="body1" sx={{ color: '#202124', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                            {content}
                          </Typography>
                        </Box>
                      </Stack>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
              {loading && (
                <Stack direction="row" spacing={2} alignItems="flex-start">
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      bgcolor: '#ab68ff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontWeight: 600,
                      fontSize: 14,
                    }}
                  >
                    C
                  </Box>
                  <Box className="typing-dots">
                    <span />
                    <span />
                    <span />
                  </Box>
                </Stack>
              )}
              <span ref={messagesEndRef} />
            </Stack>
          )}
        </Box>

        <Box className="input-area">
          <Box className="input-wrapper">
            <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
              <Chip
                label="📝 Use Template"
                onClick={handleTemplateMenuOpen}
                variant="outlined"
                size="small"
                sx={{
                  borderColor: 'rgba(0,0,0,0.15)',
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.05)' },
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
                  borderRadius: '12px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                },
              }}
            >
              <Typography variant="subtitle2" sx={{ px: 2, py: 1.5, fontWeight: 600, color: '#202124' }}>
                Prompt Templates
              </Typography>
              <Divider />
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
                        sx={{ px: 2, py: 1, mt: 1, color: '#666', fontWeight: 600, display: 'block' }}
                      >
                        {category.toUpperCase()}
                      </Typography>
                      {categoryTemplates.map((template) => (
                        <MenuItem
                          key={template.id}
                          onClick={() => handleTemplateSelect(template)}
                          sx={{ px: 2, py: 1.5 }}
                        >
                          <ListItemIcon sx={{ minWidth: 32 }}>
                            {getTemplateIcon(template.category)}
                          </ListItemIcon>
                          <ListItemText
                            primary={template.title}
                            primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                          />
                        </MenuItem>
                      ))}
                    </Box>
                  ))
                })()
              ) : (
                <MenuItem disabled sx={{ px: 2, py: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    No templates available
                  </Typography>
                </MenuItem>
              )}
            </Menu>
            
            <TextField
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message ChatGPT"
              fullWidth
              multiline
              maxRows={6}
              variant="outlined"
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: '26px',
                  bgcolor: '#f4f4f4',
                  border: 'none',
                  '& fieldset': { border: 'none' },
                },
              }}
              InputProps={{
                endAdornment: (
                  <IconButton
                    onClick={sendMessage}
                    disabled={loading || !input.trim()}
                    sx={{
                      bgcolor: loading || !input.trim() ? '#d1d1d1' : '#202124',
                      color: '#fff',
                      width: 32,
                      height: 32,
                      '&:hover': {
                        bgcolor: loading || !input.trim() ? '#d1d1d1' : '#404040',
                      },
                      '&.Mui-disabled': {
                        bgcolor: '#d1d1d1',
                        color: '#fff',
                      },
                    }}
                  >
                    <SendRounded sx={{ fontSize: 18 }} />
                  </IconButton>
                ),
              }}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

export default App

