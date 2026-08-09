/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Iron Man HUD color palette
        'hud-primary': '#00d4ff',      // Cyan blue (main arc reactor)
        'hud-secondary': '#ff6b35',    // Orange accent
        'hud-gold': '#ffd700',         // Gold highlights
        'hud-dark': '#0a0e17',         // Deep dark background
        'hud-panel': '#0d1525cc',      // Panel background (with alpha)
        'hud-border': '#00d4ff33',     // Subtle border
        'hud-text': '#e0f0ff',         // Light text
        'hud-muted': '#5a7a9a',        // Muted text
        'hud-success': '#00ff88',      // Green (active/ready)
        'hud-warning': '#ffaa00',      // Warning
        'hud-danger': '#ff3366',       // Error
      },
      fontFamily: {
        'hud': ['Rajdhani', 'Orbitron', 'monospace'],
        'hud-mono': ['Share Tech Mono', 'monospace'],
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'scan-line': 'scanLine 4s linear infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'rotate-slow': 'rotateSlow 20s linear infinite',
        'breathe': 'breathe 3s ease-in-out infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 5px #00d4ff, 0 0 10px #00d4ff33' },
          '50%': { boxShadow: '0 0 15px #00d4ff, 0 0 30px #00d4ff66' },
        },
        scanLine: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        rotateSlow: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        breathe: {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
