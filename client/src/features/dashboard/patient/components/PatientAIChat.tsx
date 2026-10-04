import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Send, Loader2, AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { patientService, type AIChatMessage } from '@/services/patient.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const DISCLAIMER =
  'This assistant provides an overview based on your past records only. Please visit a doctor for detailed clinical analysis and personalized medical advice.';

const GREETING: AIChatMessage = {
  role: 'assistant',
  content:
    "Hello! I'm your personal health assistant. I have access to your medical records on mediNexus and can help you with:\n\n• Understanding your past prescriptions and medicines\n• What conditions or illnesses you've been treated for\n• Your uploaded reports and referrals\n• General questions about your health history\n\nWhat would you like to know?\n\n⚠️ This overview is based on your past records only. Please consult a doctor for detailed clinical analysis and personalized medical advice.",
};

// ─── Message bubble ───────────────────────────────────────────────────────────

const MessageBubble = ({ msg }: { msg: AIChatMessage }) => {
  const isUser = msg.role === 'user';

  // Render AI messages with basic line-break formatting
  const renderContent = (content: string) => {
    return content.split('\n').map((line, i) => (
      <span key={i}>
        {line}
        {i < content.split('\n').length - 1 && <br />}
      </span>
    ));
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      {!isUser && (
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center mr-2 mt-0.5">
          <Sparkles className="h-3 w-3 text-primary" />
        </div>
      )}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-muted/70 text-foreground rounded-bl-sm border border-border/50'
        }`}
      >
        {renderContent(msg.content)}
      </div>
    </div>
  );
};

// ─── Typing indicator ─────────────────────────────────────────────────────────

const TypingIndicator = () => (
  <div className="flex justify-start mb-3">
    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center mr-2 mt-0.5">
      <Sparkles className="h-3 w-3 text-primary" />
    </div>
    <div className="bg-muted/70 border border-border/50 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
          style={{ animationDelay: `${i * 150}ms`, animationDuration: '900ms' }}
        />
      ))}
    </div>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

export const PatientAIChat = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AIChatMessage[]>([GREETING]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track whether user has sent at least one message (to show pulse only before first open)
  const [hasOpened, setHasOpened] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, open]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [open]);

  const handleOpen = () => {
    setOpen(true);
    setHasOpened(true);
  };

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: AIChatMessage = { role: 'user', content: text };
    const nextMessages = [...messages, userMsg];

    setMessages(nextMessages);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      // Pass the full conversation history (excluding the greeting to keep tokens lean)
      const historyToSend = nextMessages
        .slice(1) // skip the greeting
        .slice(-18); // at most 9 previous turns

      const res = await patientService.aiChat({
        message: text,
        history: historyToSend.slice(0, -1), // all but the message we just added
      });

      const reply: string = (res as any).data?.reply ?? 'Sorry, I could not generate a response.';
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ?? err?.message ?? 'Something went wrong. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleReset = () => {
    setMessages([GREETING]);
    setError(null);
    setInput('');
  };

  return (
    <>
      {/* ── Floating trigger button ──────────────────────────────────────────── */}
      {!open && (
        <button
          onClick={handleOpen}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-primary text-primary-foreground rounded-full px-4 py-2.5 shadow-lg hover:shadow-xl hover:bg-primary/90 transition-all duration-200 group"
          aria-label="Open health assistant"
        >
          <div className="relative">
            <Sparkles className="h-4 w-4" />
            {/* Pulse ring — shown only until first open */}
            {!hasOpened && (
              <span className="absolute -inset-1.5 rounded-full border border-primary-foreground/40 animate-ping" />
            )}
          </div>
          <span className="text-sm font-medium">Ask my records</span>
        </button>
      )}

      {/* ── Chat panel ────────────────────────────────────────────────────────── */}
      {open && (
        <div
          ref={panelRef}
          className="fixed bottom-6 right-6 z-50 w-[540px] max-w-[calc(100vw-2rem)] flex flex-col bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
          style={{ height: '680px' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-card flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium leading-none">Health Assistant</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Powered by your records</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleReset}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                title="New conversation"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2">
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}
            {loading && <TypingIndicator />}
            {error && (
              <div className="flex items-start gap-2 mb-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2.5">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Disclaimer */}
          <div className="px-4 py-2 border-t bg-muted/20 flex-shrink-0">
            <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
              ⚠️ {DISCLAIMER}
            </p>
          </div>

          {/* Input */}
          <div className="px-3 py-3 border-t flex items-center gap-2 flex-shrink-0 bg-card">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your health records…"
              maxLength={1000}
              disabled={loading}
              className="flex-1 text-sm bg-muted/50 border border-border rounded-xl px-3.5 py-2 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all placeholder:text-muted-foreground/60 disabled:opacity-50"
            />
            <Button
              size="icon"
              className="h-9 w-9 rounded-xl flex-shrink-0"
              onClick={handleSend}
              disabled={!input.trim() || loading}
              aria-label="Send message"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      )}
    </>
  );
};
