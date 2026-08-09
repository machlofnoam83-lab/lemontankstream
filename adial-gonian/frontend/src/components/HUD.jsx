import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

// ============================================
// Arc Reactor Animation Component
// ============================================
function ArcReactor({ status, size = 80 }) {
  const isActive = status === 'listening' || status === 'processing';
  
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Outer ring */}
      <div 
        className={`absolute rounded-full border-2 transition-all duration-500 ${
          isActive ? 'border-hud-primary animate-pulse-glow' : 'border-hud-primary/30'
        }`}
        style={{ width: size, height: size, animationDuration: status === 'processing' ? '0.5s' : '2s' }}
      />
      
      {/* Middle ring */}
      <div 
        className={`absolute rounded-full border transition-all duration-500 ${
          isActive ? 'border-hud-secondary/60' : 'border-hud-primary/20'
        }`}
        style={{ width: size * 0.7, height: size * 0.7 }}
      />
      
      {/* Inner circle (core) */}
      <div 
        className={`absolute rounded-full transition-all duration-300 ${
          status === 'idle' ? 'bg-hud-primary/20' :
          status === 'listening' ? 'bg-hud-primary/40' :
          status === 'processing' ? 'bg-hud-warning/40' :
          status === 'speaking' ? 'bg-hud-success/30' :
          'bg-hud-primary/10'
        }`}
        style={{ width: size * 0.4, height: size * 0.4 }}
      />
      
      {/* Center dot */}
      <div 
        className={`absolute rounded-full ${
          status === 'listening' ? 'bg-hud-primary animate-breathe' :
          status === 'processing' ? 'bg-hud-warning' :
          status === 'speaking' ? 'bg-hud-success' :
          'bg-hud-primary/60'
        }`}
        style={{ width: 8, height: 8 }}
      />
      
      {/* Rotating segments */}
      {isActive && (
        <svg className="absolute animate-rotate-slow" style={{ width: size, height: size }}>
          {[0, 60, 120, 180, 240, 300].map((angle, i) => (
            <line
              key={i}
              x1={size/2}
              y1={4}
              x2={size/2}
              y2={12}
              stroke="#00d4ff"
              strokeWidth="1.5"
              opacity="0.4"
              transform={`rotate(${angle} ${size/2} ${size/2})`}
            />
          ))}
        </svg>
      )}
    </div>
  );
}

// ============================================
// Waveform Visualization
// ============================================
function Waveform({ isActive, barCount = 32 }) {
  const [bars, setBars] = useState(new Array(barCount).fill(0.2));
  const animRef = useRef(null);
  
  useEffect(() => {
    if (isActive) {
      const animate = () => {
        setBars(prev => prev.map(() => 0.1 + Math.random() * 0.9));
        animRef.current = requestAnimationFrame(animate);
      };
      animRef.current = requestAnimationFrame(animate);
    } else {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      setBars(new Array(barCount).fill(0.15));
    }
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [isActive, barCount]);

  return (
    <div className="flex items-end justify-center gap-[2px] h-8">
      {bars.map((height, i) => (
        <div
          key={i}
          className="w-[3px] rounded-full transition-all duration-75"
          style={{
            height: `${height * 100}%`,
            background: `linear-gradient(to top, #00d4ff, ${height > 0.6 ? '#ff6b35' : '#00d4ff'})`,
            opacity: 0.4 + height * 0.6,
          }}
        />
      ))}
    </div>
  );
}

// ============================================
// Chat Message Bubble
// ============================================
function ChatBubble({ message, isUser }) {
  return (
    <div className={`flex ${isUser ? 'justify-start' : 'justify-end'} animate-slide-in`}>
      <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm leading-relaxed ${
        isUser 
          ? 'bg-hud-primary/10 border border-hud-primary/20 text-hud-text' 
          : 'bg-hud-panel border border-hud-border text-hud-text'
      }`}>
        {!isUser && (
          <div className="text-[10px] text-hud-primary/60 mb-1 font-hud-mono">אדיאל גוניון</div>
        )}
        <div>{message}</div>
        <div className="text-[9px] text-hud-muted mt-1 font-hud-mono text-left">
          {new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Status Bar
// ============================================
function StatusBar({ status, isConnected, onToggleListen }) {
  const statusLabels = {
    idle: 'מוכן',
    listening: 'מקשיב...',
    processing: 'מעבד...',
    speaking: 'מדבר...',
  };

  const statusColors = {
    idle: 'active',
    listening: 'listening',
    processing: 'processing',
    speaking: 'active',
  };

  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-b border-hud-border/50">
      <div className="flex items-center gap-2">
        <div className={`hud-status-dot ${statusColors[status] || 'active'}`} />
        <span className="text-xs font-hud-mono text-hud-muted">
          {statusLabels[status] || status}
        </span>
      </div>
      
      <div className="flex items-center gap-2">
        {!isConnected && (
          <span className="text-[10px] text-hud-danger font-hud-mono">OFFLINE</span>
        )}
        <button
          onClick={onToggleListen}
          className="hud-btn text-[10px] px-2 py-0.5"
        >
          {status === 'idle' ? 'התחל' : 'עצור'}
        </button>
      </div>
    </div>
  );
}

// ============================================
// Main HUD Component
// ============================================
export default function HUD() {
  const { isConnected, send, on, off } = useWebSocket();
  const [status, setStatus] = useState('idle');
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [position, setPosition] = useState('center');
  const [isListening, setIsListening] = useState(false);
  const chatRef = useRef(null);
  const [lastCommand, setLastCommand] = useState('');

  // Listen for backend events
  useEffect(() => {
    const handleStatus = (data) => setStatus(data.status);
    const handleResponse = (data) => {
      if (data.command) {
        setMessages(prev => [...prev, { text: data.command, isUser: true }]);
      }
      setMessages(prev => [...prev, { text: data.text, isUser: false }]);
    };
    const handleCommand = (data) => {
      setLastCommand(data.text);
      setMessages(prev => [...prev, { text: data.text, isUser: true }]);
    };
    const handleWakeWord = () => {
      setStatus('listening');
      setMessages(prev => [...prev, { text: '🎤 מילת הפעלה זוהתה - מקשיב...', isUser: false }]);
    };
    const handlePosition = (data) => setPosition(data.position);
    const handleConnected = (data) => {
      if (data.status) setStatus(data.status);
      if (data.hud_position) setPosition(data.hud_position);
    };

    on('status_change', handleStatus);
    on('ai_response', handleResponse);
    on('command_received', handleCommand);
    on('wake_word_detected', handleWakeWord);
    on('hud_position', handlePosition);
    on('connected', handleConnected);

    return () => {
      off('status_change', handleStatus);
      off('ai_response', handleResponse);
      off('command_received', handleCommand);
      off('wake_word_detected', handleWakeWord);
      off('hud_position', handlePosition);
      off('connected', handleConnected);
    };
  }, [on, off]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  // Handle text input submit
  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    
    const text = inputText.trim();
    setInputText('');
    setMessages(prev => [...prev, { text, isUser: true }]);
    send('chat_message', { text });
  }, [inputText, send]);

  // Toggle listening
  const handleToggleListen = useCallback(() => {
    setIsListening(prev => !prev);
    send('toggle_listening');
  }, [send]);

  // Move HUD position
  const handleMoveSide = useCallback(() => {
    if (window.electronAPI) window.electronAPI.moveSide();
    setPosition('side');
  }, []);

  const handleMoveCenter = useCallback(() => {
    if (window.electronAPI) window.electronAPI.moveCenter();
    setPosition('center');
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden hud-scanlines">
      {/* Main Container with Glass Effect */}
      <div className="flex-1 flex flex-col hud-panel m-2 overflow-hidden relative hud-corners">
        
        {/* Header */}
        <div className="px-4 py-3 border-b border-hud-border/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ArcReactor status={status} size={48} />
            <div>
              <h1 className="text-lg font-bold text-hud-primary hud-text-glow font-hud tracking-wider">
                אדיאל גוניון
              </h1>
              <p className="text-[10px] font-hud-mono text-hud-muted">
                SMART ASSISTANT v1.0
              </p>
            </div>
          </div>
          
          {/* Position controls */}
          <div className="flex items-center gap-1">
            <button 
              onClick={handleMoveSide}
              className={`hud-btn text-[10px] px-2 py-0.5 ${position === 'side' ? 'bg-hud-primary/20' : ''}`}
              title="שים בצד"
            >
              ◫
            </button>
            <button 
              onClick={handleMoveCenter}
              className={`hud-btn text-[10px] px-2 py-0.5 ${position === 'center' ? 'bg-hud-primary/20' : ''}`}
              title="אמצע"
            >
              ◼
            </button>
            {window.electronAPI && (
              <button 
                onClick={() => window.electronAPI.hide()}
                className="hud-btn text-[10px] px-2 py-0.5 text-hud-danger hover:border-hud-danger/50"
                title="הסתר"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Status Bar */}
        <StatusBar status={status} isConnected={isConnected} onToggleListen={handleToggleListen} />

        {/* Waveform */}
        <div className="px-4 py-2 border-b border-hud-border/30">
          <Waveform isActive={status === 'listening' || status === 'processing'} />
        </div>

        {/* Chat Messages */}
        <div ref={chatRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 opacity-60">
              <div className="text-3xl">⚡</div>
              <p className="text-sm text-hud-muted">
                אמור <span className="text-hud-primary font-bold">"אדיאל גוניון"</span> כדי להתחיל
              </p>
              <p className="text-[10px] font-hud-mono text-hud-muted/60">
                או הקלד פקודה למטה
              </p>
            </div>
          )}
          {messages.map((msg, i) => (
            <ChatBubble key={i} message={msg.text} isUser={msg.isUser} />
          ))}
        </div>

        {/* Input Area */}
        <div className="px-3 py-2 border-t border-hud-border/50">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="הקלד פקודה או שאלה..."
              className="hud-input flex-1"
              disabled={status === 'processing'}
            />
            <button 
              type="submit" 
              className="hud-btn px-3"
              disabled={!inputText.trim() || status === 'processing'}
            >
              ⚡
            </button>
          </form>
          
          {/* Quick Actions */}
          <div className="flex gap-1 mt-2 overflow-x-auto pb-1">
            {[
              { label: 'צלם מסך', cmd: 'מה יש על המסך' },
              { label: 'שים בצד', action: handleMoveSide },
              { label: 'אמצע', action: handleMoveCenter },
              { label: 'נקה', action: () => setMessages([]) },
            ].map((btn, i) => (
              <button
                key={i}
                onClick={() => btn.cmd ? send('chat_message', { text: btn.cmd }) : btn.action?.()}
                className="hud-btn text-[10px] px-2 py-0.5 whitespace-nowrap"
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-3 py-1 border-t border-hud-border/30 flex justify-between items-center">
          <span className="text-[9px] font-hud-mono text-hud-muted/40">
            BACKEND: {isConnected ? '●' : '○'} {isConnected ? 'CONNECTED' : 'OFFLINE'}
          </span>
          <span className="text-[9px] font-hud-mono text-hud-muted/40">
            WAKE: "אדיאל גוניון"
          </span>
        </div>
      </div>
    </div>
  );
}
