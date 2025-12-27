import React, { useState, useEffect, useCallback } from 'react';
import { 
  Inbox, Trash2, Copy, RefreshCw, ShieldCheck, Sparkles, 
  ChevronRight, ChevronLeft, Search, Archive, 
  Settings, Mail, Plus, ChevronDown, Activity, 
  Loader2, Check, Menu, X, AlertTriangle
} from 'lucide-react';
import { Email } from './types';
import { analyzeEmail } from './services/geminiService';

const CUSTOM_DOMAIN = 'your-domain.com'; 
// Swapped to put public providers first so it works out-of-the-box
const ALL_DOMAINS = ['1secmail.com', '1secmail.net', CUSTOM_DOMAIN];

// Aesthetic White Type Email Icon Component
const AestheticMailIcon = ({ size = 16, className = "" }: { size?: number, className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="1.5" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M21 8V17C21 18.1046 20.1046 19 19 19H5C3.89543 19 3 18.1046 3 17V8" />
    <path d="M3 8L10.8906 13.2604C11.5624 13.7082 12.4376 13.7082 13.1094 13.2604L21 8" />
    <path d="M3 8C3 6.89543 3.89543 6 5 6H19C20.1046 6 21 6.89543 21 8" />
  </svg>
);

const App: React.FC = () => {
  const [emailAddress, setEmailAddress] = useState('');
  const [login, setLogin] = useState('');
  const [domain, setDomain] = useState(ALL_DOMAINS[0]);
  const [inbox, setInbox] = useState<Email[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showDomainDropdown, setShowDomainDropdown] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [serverStatus, setServerStatus] = useState<any>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  
  const currentEmail = inbox.find(e => e.id === selectedId);

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 768) {
        setViewMode('mobile');
        setSidebarOpen(false);
      } else if (width < 1024) {
        setViewMode('tablet');
        setSidebarOpen(false);
      } else {
        setViewMode('desktop');
        setSidebarOpen(true);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const safeJsonParse = async (response: Response) => {
    const contentType = response.headers.get("content-type");
    const text = await response.text();
    
    if (contentType && contentType.includes("application/json")) {
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error(`Malformed JSON response from server`);
      }
    } else {
      // If it's a 404 HTML page, it's likely Vite or Express fallback
      if (response.status === 404) {
        throw new Error("API endpoint not found (404). Backend server might be offline.");
      }
      // Fallback parse if header is missing but body looks like JSON
      if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
        try { return JSON.parse(text); } catch (e) {}
      }
      throw new Error(`Server returned non-JSON response (${response.status})`);
    }
  };

  const checkStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await safeJsonParse(res);
      setServerStatus(data);
      setApiError(null);
    } catch (e: any) {
      setServerStatus({ status: 'offline' });
      // Only set API error if user is trying to use custom domain
      if (domain === CUSTOM_DOMAIN) {
        setApiError(e.message);
      }
    }
  };

  const generateNewAddress = useCallback((targetDomain?: string) => {
    setIsGenerating(true);
    const newLogin = Math.random().toString(36).substring(2, 10);
    const newDomain = targetDomain || domain;
    
    setLogin(newLogin);
    setDomain(newDomain);
    setEmailAddress(`${newLogin}@${newDomain}`);
    setInbox([]);
    setSelectedId(null);
    setShowSettings(false);
    setApiError(null);
    
    setTimeout(() => {
      setIsGenerating(false);
      setShowDomainDropdown(false);
    }, 400);
  }, [domain]);

  const fetchInbox = useCallback(async () => {
    if (!login || !domain) return;
    setIsRefreshing(true);
    
    try {
      const isCustom = domain === CUSTOM_DOMAIN;
      const l = encodeURIComponent(login);
      const d = encodeURIComponent(domain);
      
      const apiUrl = isCustom 
        ? `/api/messages?login=${l}&domain=${d}`
        : `https://www.1secmail.com/api/v1/?action=getMessages&login=${l}&domain=${d}`;

      const response = await fetch(apiUrl);
      if (!response.ok) {
        if (response.status === 404 && isCustom) {
          throw new Error("Backend API not found. Please ensure server.js is running.");
        }
        throw new Error(`Service responded with ${response.status}`);
      }
      
      const data = await safeJsonParse(response);
      
      if (!Array.isArray(data)) {
        console.error("API Error: Expected array, got:", data);
        return;
      }

      const formattedEmails: Email[] = data.map((msg: any) => ({
        id: msg.id.toString(),
        sender: isCustom ? msg.from : (msg.from?.split('<')[0]?.trim() || msg.from || "Unknown"),
        senderEmail: msg.from || "Unknown",
        subject: msg.subject || "(No Subject)",
        content: isCustom ? msg.body : "Loading content...", 
        timestamp: isCustom ? new Date(msg.date).toLocaleTimeString() : msg.date,
        read: false
      }));

      setInbox(formattedEmails);
      setApiError(null);
    } catch (error: any) {
      console.error("Inbox Fetch Error:", error.message);
      if (domain === CUSTOM_DOMAIN) setApiError(error.message);
    } finally {
      setIsRefreshing(false);
    }
  }, [login, domain]);

  // Effect to fetch individual message content for 1secmail
  useEffect(() => {
    const fetchContent = async () => {
      if (!selectedId || !login || !domain) return;
      const email = inbox.find(e => e.id === selectedId);
      if (!email || email.content !== "Loading content...") return;

      try {
        const l = encodeURIComponent(login);
        const d = encodeURIComponent(domain);
        const apiUrl = `https://www.1secmail.com/api/v1/?action=readMessage&login=${l}&domain=${d}&id=${selectedId}`;
        const res = await fetch(apiUrl);
        if (res.ok) {
          const data = await safeJsonParse(res);
          setInbox(prev => prev.map(e => e.id === selectedId ? { ...e, content: data.textBody || data.body || "No content" } : e));
        }
      } catch (err) {
        console.error("Failed to fetch content", err);
      }
    };
    fetchContent();
  }, [selectedId, login, domain, inbox]);

  useEffect(() => {
    generateNewAddress(ALL_DOMAINS[0]);
    checkStatus();
    const statusInterval = setInterval(checkStatus, 30000);
    return () => clearInterval(statusInterval);
  }, []);

  useEffect(() => {
    const refreshInterval = setInterval(fetchInbox, 10000);
    return () => clearInterval(refreshInterval);
  }, [fetchInbox]);

  const copyToClipboard = () => {
    if (!emailAddress) return;
    navigator.clipboard.writeText(emailAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAiAnalysis = async (email: Email) => {
    setIsAnalyzing(true);
    const result = await analyzeEmail(email);
    setInbox(prev => prev.map(e => e.id === email.id ? { 
      ...e, 
      isAiProcessed: true, 
      summary: result.summary || "Analysis failed.", 
      riskLevel: result.riskLevel || 'low'
    } : e));
    setIsAnalyzing(false);
  };

  const isListViewVisible = viewMode !== 'mobile' || (!selectedId && !showSettings);
  const isDetailViewVisible = viewMode !== 'mobile' || selectedId || showSettings;

  return (
    <div className="flex h-screen w-full bg-[#09090b] text-[#fafafa] overflow-hidden relative">
      {viewMode === 'mobile' && sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] animate-in fade-in duration-300"
          // Fix: setSidebarOpen(false) instead of truncated setSidebar
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      {/* Sidebar Navigation */}
      <div className={`
        ${viewMode === 'mobile' ? 'fixed inset-y-0 left-0 z-[110] w-72' : 'w-64 border-r border-[#27272a]'}
        ${viewMode === 'mobile' && !sidebarOpen ? '-translate-x-full' : 'translate-x-0'}
        flex flex-col bg-[#09090b] transition-transform duration-300 ease-in-out
      `}>
        <div className="p-4 border-b border-[#27272a] flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-lg tracking-tight">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <span>Xinici Mail</span>
          </div>
          {viewMode === 'mobile' && (
            <button onClick={() => setSidebarOpen(false)} className="p-1">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <button 
            onClick={() => { setSelectedId(null); setShowSettings(false); if(viewMode === 'mobile') setSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${!selectedId && !showSettings ? 'bg-[#27272a] text-white' : 'text-[#a1a1aa] hover:bg-[#18181b] hover:text-[#fafafa]'}`}
          >
            <Inbox className="w-4 h-4" />
            <span>Inbox</span>
            <span className="ml-auto text-xs opacity-60">{inbox.length}</span>
          </button>
          <button 
            onClick={() => { setShowSettings(true); if(viewMode === 'mobile') setSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${showSettings ? 'bg-[#27272a] text-white' : 'text-[#a1a1aa] hover:bg-[#18181b] hover:text-[#fafafa]'}`}
          >
            <Settings className="w-4 h-4" />
            <span>Settings</span>
          </button>
        </div>
        <div className="p-4 border-t border-[#27272a]">
          <div className="flex items-center gap-2 text-[10px] text-[#a1a1aa] uppercase tracking-widest">
             <Activity className={`w-2 h-2 ${serverStatus?.status === 'online' ? 'text-green-500' : 'text-red-500'}`} />
             <span>Server: {serverStatus?.status || 'Offline'}</span>
          </div>
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-[#27272a] flex items-center px-4 gap-4">
          {viewMode !== 'desktop' && (
            <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 text-[#a1a1aa] hover:text-white">
              <Menu className="w-5 h-5" />
            </button>
          )}
          
          <div className="flex-1 flex items-center bg-[#18181b] rounded-full px-4 py-1.5 border border-[#27272a] max-w-xl">
             <AestheticMailIcon size={18} className="text-[#a1a1aa] mr-3" />
             <span className="flex-1 font-mono text-sm truncate">{emailAddress || "Generating..."}</span>
             <button onClick={copyToClipboard} className="ml-2 p-1 text-[#a1a1aa] hover:text-white transition-colors">
               {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
             </button>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => generateNewAddress()} 
              disabled={isGenerating}
              className="hidden sm:flex items-center gap-2 px-4 py-1.5 bg-white text-black hover:bg-[#e4e4e7] rounded-full text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              New Address
            </button>
            <button 
              onClick={fetchInbox} 
              disabled={isRefreshing}
              className={`p-2 rounded-full border border-[#27272a] text-[#a1a1aa] hover:text-white hover:bg-[#18181b] transition-all ${isRefreshing ? 'animate-spin' : ''}`}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          {isListViewVisible && (
            <div className={`flex-col ${selectedId && viewMode === 'tablet' ? 'hidden' : 'flex'} w-full md:w-80 lg:w-96 border-r border-[#27272a] bg-[#09090b]`}>
              <div className="flex-1 overflow-y-auto">
                {inbox.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center p-8 text-center text-[#71717a]">
                    <Mail className="w-10 h-10 opacity-10 mb-4" />
                    <p className="text-sm font-medium mb-1">Inbox is empty</p>
                    <p className="text-xs">Waiting for incoming messages...</p>
                  </div>
                ) : (
                  inbox.map(email => (
                    <button 
                      key={email.id}
                      onClick={() => setSelectedId(email.id)}
                      className={`w-full text-left p-4 border-b border-[#27272a] transition-colors ${selectedId === email.id ? 'bg-[#18181b]' : 'hover:bg-[#0f0f12]'}`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-semibold text-sm truncate pr-2">{email.sender}</span>
                        <span className="text-[10px] text-[#71717a] uppercase">{email.timestamp}</span>
                      </div>
                      <div className="text-sm font-medium mb-1 truncate text-[#e4e4e7]">{email.subject}</div>
                      <div className="text-xs text-[#a1a1aa] line-clamp-1 leading-relaxed">{email.content}</div>
                      {email.isAiProcessed && (
                        <div className={`mt-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border inline-flex ${
                          email.riskLevel === 'high' ? 'text-red-400 border-red-900/50 bg-red-950/20' : 
                          email.riskLevel === 'medium' ? 'text-yellow-400 border-yellow-900/50 bg-yellow-950/20' : 
                          'text-emerald-400 border-emerald-900/50 bg-emerald-950/20'
                        }`}>
                          <ShieldCheck className="w-3 h-3" />
                          {email.riskLevel} Risk
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {isDetailViewVisible && (
            <div className="flex-1 bg-[#09090b] flex flex-col min-w-0">
              {showSettings ? (
                <div className="p-8 max-w-xl mx-auto w-full">
                  <h2 className="text-2xl font-bold mb-6">Settings</h2>
                  <div className="space-y-6">
                    <div className="p-4 bg-[#18181b] rounded-xl border border-[#27272a]">
                      <h3 className="text-sm font-semibold mb-3">Domain Selection</h3>
                      <div className="grid gap-2">
                        {ALL_DOMAINS.map(d => (
                          <button
                            key={d}
                            onClick={() => generateNewAddress(d)}
                            className={`flex items-center justify-between p-3 rounded-lg border transition-all ${domain === d ? 'bg-white/5 border-white/20' : 'border-transparent hover:bg-white/5'}`}
                          >
                            <span className="text-sm font-mono">{d}</span>
                            {domain === d && <Check className="w-4 h-4 text-purple-400" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : currentEmail ? (
                <>
                  <div className="p-6 border-b border-[#27272a] flex flex-col gap-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <h1 className="text-xl font-bold text-[#fafafa] leading-tight">{currentEmail.subject}</h1>
                        <div className="flex items-center gap-2 text-sm text-[#a1a1aa]">
                          <span className="font-medium text-[#e4e4e7]">{currentEmail.sender}</span>
                          <span className="text-xs">&lt;{currentEmail.senderEmail}&gt;</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {viewMode === 'mobile' && (
                          <button onClick={() => setSelectedId(null)} className="p-2 rounded-full hover:bg-[#18181b]">
                            <ChevronLeft className="w-5 h-5" />
                          </button>
                        )}
                        <button className="p-2 rounded-full hover:bg-[#18181b] text-red-400">
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-gradient-to-br from-[#18181b] to-[#09090b] border border-purple-500/20 relative overflow-hidden group">
                      {!currentEmail.isAiProcessed ? (
                        <div className="flex flex-col items-center justify-center py-2 text-center">
                          <p className="text-xs text-[#a1a1aa] mb-3 font-mono">Run Gemini security analysis on this email.</p>
                          <button 
                            onClick={() => handleAiAnalysis(currentEmail)}
                            disabled={isAnalyzing || currentEmail.content === "Loading content..."}
                            className="flex items-center gap-2 px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-full text-xs font-bold transition-all shadow-lg shadow-purple-900/20"
                          >
                            {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                            Run Security Analysis
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3 relative z-10">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-400">Gemini Intelligence Report</span>
                            <div className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                              currentEmail.riskLevel === 'high' ? 'bg-red-500/10 text-red-400' : 
                              currentEmail.riskLevel === 'medium' ? 'bg-yellow-500/10 text-yellow-400' : 
                              'bg-emerald-500/10 text-emerald-400'
                            }`}>
                              {currentEmail.riskLevel} Risk
                            </div>
                          </div>
                          <p className="text-sm text-[#e4e4e7] leading-relaxed italic border-l-2 border-purple-500/20 pl-4">"{currentEmail.summary}"</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6">
                    <div className="text-sm leading-relaxed whitespace-pre-wrap font-sans text-[#fafafa]">
                      {currentEmail.content}
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center p-8 text-center text-[#71717a]">
                   <Mail className="w-16 h-16 opacity-5 mb-6" />
                   <h2 className="text-lg font-semibold text-[#e4e4e7] mb-2">Select a message</h2>
                   <p className="text-sm max-w-xs">Pick an email from the inbox list to view its contents and perform AI-powered risk assessment.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Fix: Added default export for App component to resolve index.tsx import error
export default App;
