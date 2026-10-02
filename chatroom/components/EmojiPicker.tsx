import { useState, useRef, useEffect } from 'react'

const EMOJI_CATEGORIES = [
  {
    label: '😊 faces',
    emojis: ['😀','😂','😭','😍','🥹','😎','🤔','😴','🥲','😤','🫡','🤯','😱','🥸','🤪','😵','🫠','😶','🙄','😬','🤐','😐','😑','😶‍🌫️','🫤','🥴','😵‍💫','🤠','🤡','👻','💀','👽']
  },
  {
    label: '👋 gestures',
    emojis: ['👋','🤝','👍','👎','👏','🙌','🤜','🤛','✌️','🤞','🫶','❤️','🔥','✨','💫','💥','💢','💤','💬','👀','🫦','🧠','👁️']
  },
  {
    label: '🌙 vibes',
    emojis: ['🌙','⭐','🌈','☁️','⚡','🌊','🍃','🌸','🌺','🍄','🌵','🦋','🐝','🐸','🦊','🐙','🌙','🔮','🪩','🎭','🎨','🖼️','📺','📻','💾','🖥️','📟','☎️']
  },
  {
    label: '💬 retro',
    emojis: ['💾','📼','📟','☎️','📺','📻','🖥️','⌨️','🖱️','📠','🔌','💿','📡','🕹️','👾','🎮','🃏','🎲','♟️','🎯','🏆','⌛','⏳','🔑','🗝️','📝','✉️','📮']
  },
]

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  isMobile: boolean
  isEmbedded?: boolean
}

export default function EmojiPicker({ onSelect, isMobile, isEmbedded }: EmojiPickerProps) {
  const [open, setOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const panelStyle: React.CSSProperties = (isMobile && !isEmbedded) ? {
    position: 'fixed',
    bottom: 60,
    left: '50%',
    width: 'min(92vw, 360px)',
    transform: 'translateX(-50%)',
    zIndex: 300,
    background: '#f0f0f0',
    borderTop: '2px solid #ffffff',
    borderLeft: '2px solid #ffffff',
    borderRight: '2px solid #404040',
    borderBottom: '2px solid #404040',
    boxShadow: '0 -4px 12px rgba(0,0,0,0.2)',
  } : {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    width: Math.min(360, window.innerWidth * 0.72),
    zIndex: 300,
    background: '#f0f0f0',
    borderTop: '2px solid #ffffff',
    borderLeft: '2px solid #ffffff',
    borderRight: '2px solid #404040',
    borderBottom: '2px solid #404040',
    boxShadow: '2px 2px 0 rgba(0,0,0,0.3)',
    marginBottom: 4,
  }

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      {/* Trigger button */}
      <button
        className="btn-retro"
        onClick={() => setOpen(v => !v)}
        style={{
          padding: '3px 8px',
          fontSize: 16,
          minWidth: 'unset',
          background: open ? '#d4d0c8' : undefined,
          border: open ? '2px inset #808080' : undefined,
        }}
        title="emoji"
      >
        🙂
      </button>

      {/* Panel */}
      {open && (
        <div style={panelStyle}>
          {/* Title bar */}
          <div style={{
            background: '#000080',
            color: '#ffffff',
            fontSize: 11,
            fontWeight: 'bold',
            padding: '3px 8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            letterSpacing: '0.05em',
          }}>
            emoji.exe
            <span
              onClick={() => setOpen(false)}
              style={{ cursor: 'pointer', fontSize: 13 }}
            >✕</span>
          </div>

          {/* Category tabs */}
          <div style={{
            display: 'flex',
            borderBottom: '1px solid #808080',
            background: '#d4d0c8',
            overflowX: 'auto',
            scrollbarWidth: 'none',
          }}>
            {EMOJI_CATEGORIES.map((cat, i) => (
              <button
                key={i}
                onClick={() => setActiveCategory(i)}
                style={{
                  padding: '4px 10px',
                  fontSize: 11,
                  fontFamily: 'Courier New',
                  background: activeCategory === i ? '#f0f0f0' : 'transparent',
                  border: 'none',
                  borderBottom: activeCategory === i ? '2px solid #000080' : '2px solid transparent',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  color: activeCategory === i ? '#000080' : '#444',
                  fontWeight: activeCategory === i ? 'bold' : 'normal',
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Emoji grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: 2,
            padding: 8,
            maxHeight: 180,
            overflowY: 'auto',
          }}>
            {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji, i) => (
              <button
                key={i}
                onClick={() => { onSelect(emoji); setOpen(false) }}
                style={{
                  fontSize: isMobile ? 22 : 20,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 2px',
                  borderRadius: 2,
                  lineHeight: 1,
                  WebkitTapHighlightColor: 'transparent',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#d4d0c8')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
