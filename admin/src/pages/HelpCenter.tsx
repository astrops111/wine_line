import { useState, useEffect, useRef } from 'react';
import { supabase, FUNCTIONS_URL } from '../lib/supabase';
import { getLocale } from '../lib/i18n';

interface Article {
    id: string;
    title: string;
    title_en: string;
    content: string;
    content_en: string;
    category: string;
    page_route: string;
    tags: string[];
    updated_at: string;
}

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    sources?: { title: string; page_route: string; category: string }[];
    isLoading?: boolean;
}

const CATEGORIES = ['All', 'HR', 'Workflows', 'System', 'LIFF'];
const CATEGORY_LABELS: Record<string, Record<string, string>> = {
    All:       { zh: '全部', en: 'All' },
    HR:        { zh: 'HR 人資', en: 'HR' },
    Workflows: { zh: '流程管理', en: 'Workflows' },
    System:    { zh: '系統', en: 'System' },
    LIFF:      { zh: 'LIFF App', en: 'LIFF' },
};

export function HelpCenter() {
    const zh = getLocale() === 'zh-TW';
    const [articles, setArticles] = useState<Article[]>([]);
    const [selected, setSelected] = useState<Article | null>(null);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('All');
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [chatOpen, setChatOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [chatLoading, setChatLoading] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => { loadArticles(); }, [category]);

    useEffect(() => {
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(() => loadArticles(), 300);
        return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
    }, [search]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    async function loadArticles() {
        setLoading(true);
        let query = supabase
            .from('help_articles')
            .select('id, title, title_en, content, content_en, category, page_route, tags, updated_at')
            .order('category')
            .order('title');

        if (category !== 'All') {
            query = query.eq('category', category);
        }

        const { data } = await query;
        let results = data || [];

        // Client-side search filter
        if (search.trim()) {
            const q = search.toLowerCase();
            results = results.filter(a =>
                a.title.toLowerCase().includes(q) ||
                a.title_en.toLowerCase().includes(q) ||
                a.content.toLowerCase().includes(q) ||
                a.content_en.toLowerCase().includes(q) ||
                (a.tags || []).some((t: string) => t.toLowerCase().includes(q)) ||
                (a.page_route || '').toLowerCase().includes(q)
            );
        }

        setArticles(results);
        setLoading(false);

        // Auto-select first article if currently selected is no longer in results
        if (selected && !results.find(a => a.id === selected.id)) {
            setSelected(results[0] || null);
        }
    }

    async function triggerRegeneration() {
        if (!confirm(
            zh ? '重新生成所有說明文件？這將覆蓋現有內容，過程需要數分鐘。'
               : 'Re-generate all documentation? This will overwrite existing content and may take a few minutes.'
        )) return;

        setGenerating(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
            const res = await fetch(`${FUNCTIONS_URL}/orchestrator`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ task: 'Generate full documentation for all HRM pages' }),
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            await loadArticles();
            alert(zh
                ? `✅ 完成！已索引 ${data.indexed_count ?? '?'} 篇文章。`
                : `✅ Done! Indexed ${data.indexed_count ?? '?'} articles.`);
        } catch (e: any) {
            alert(`${zh ? '失敗：' : 'Error: '}${e.message}`);
        } finally {
            setGenerating(false);
        }
    }

    async function sendMessage() {
        if (!input.trim() || chatLoading) return;
        const userText = input.trim();
        setInput('');

        const newMessages: ChatMessage[] = [...messages, { role: 'user', content: userText }];
        setMessages([...newMessages, { role: 'assistant', content: '', isLoading: true }]);
        setChatLoading(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

            const context = newMessages.map(m => ({ role: m.role, content: m.content }));

            const res = await fetch(`${FUNCTIONS_URL}/help-chatbot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ question: userText, locale: zh ? 'zh-TW' : 'en', context }),
            });

            const data = await res.json();
            if (data.error) throw new Error(data.error);

            setMessages([...newMessages, {
                role: 'assistant',
                content: data.answer,
                sources: data.sources,
            }]);
        } catch (e: any) {
            setMessages([...newMessages, {
                role: 'assistant',
                content: `❌ ${e.message}`,
            }]);
        } finally {
            setChatLoading(false);
        }
    }

    // Group articles by category for the sidebar
    const grouped = CATEGORIES.filter(c => c !== 'All').reduce<Record<string, Article[]>>((acc, cat) => {
        acc[cat] = articles.filter(a => a.category === cat);
        return acc;
    }, {});

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Page Header */}
            <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '4px' }}>
                        📚 {zh ? '說明中心' : 'Help Center'}
                    </h2>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {zh ? '系統操作指南、AI 問答助手' : 'System guides and AI Q&A assistant'}
                        {articles.length > 0 && (
                            <span style={{ marginLeft: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
                                · {articles.length} {zh ? '篇文章' : 'articles'}
                            </span>
                        )}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        className="btn btn-secondary"
                        onClick={() => setChatOpen(o => !o)}
                        style={{ background: chatOpen ? 'rgba(45,212,191,0.15)' : undefined, color: chatOpen ? 'var(--accent-primary)' : undefined }}
                    >
                        🤖 {zh ? 'AI 問答' : 'AI Chat'}
                    </button>
                    <button className="btn btn-primary" onClick={triggerRegeneration} disabled={generating}>
                        {generating
                            ? (zh ? '⏳ 生成中...' : '⏳ Generating...')
                            : `🔄 ${zh ? '重新生成文件' : 'Re-generate Docs'}`}
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div style={{ display: 'flex', gap: '16px', flex: 1, minHeight: 0 }}>

                {/* Left Sidebar: search + category + article list */}
                <div style={{ width: '240px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <input
                        className="input-field"
                        placeholder={zh ? '🔍 搜尋文件...' : '🔍 Search docs...'}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />

                    {/* Category filter */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {CATEGORIES.map(cat => (
                            <button
                                key={cat}
                                className={`tab-item ${category === cat ? 'active' : ''}`}
                                style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '7px 12px', fontSize: '13px' }}
                                onClick={() => setCategory(cat)}
                            >
                                {CATEGORY_LABELS[cat]?.[zh ? 'zh' : 'en'] || cat}
                                {cat !== 'All' && grouped[cat]?.length > 0 && (
                                    <span style={{ marginLeft: 'auto', fontSize: '11px', opacity: 0.6 }}>
                                        {grouped[cat].length}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Article list */}
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {loading ? (
                            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                                ⏳ {zh ? '載入中...' : 'Loading...'}
                            </div>
                        ) : articles.length === 0 ? (
                            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.6 }}>
                                {search ? (zh ? '無搜尋結果' : 'No results')
                                    : (zh ? '尚無文件\n請點擊「重新生成文件」' : 'No docs yet\nClick "Re-generate Docs"')}
                            </div>
                        ) : (
                            articles.map(a => (
                                <div
                                    key={a.id}
                                    onClick={() => setSelected(a)}
                                    style={{
                                        padding: '9px 12px', borderRadius: '6px', cursor: 'pointer',
                                        background: selected?.id === a.id ? 'rgba(45,212,191,0.1)' : 'transparent',
                                        borderLeft: `2px solid ${selected?.id === a.id ? 'var(--accent-primary)' : 'transparent'}`,
                                        transition: 'all 0.15s',
                                    }}
                                    onMouseEnter={e => { if (selected?.id !== a.id) (e.currentTarget as HTMLElement).style.background = 'var(--bg-card)'; }}
                                    onMouseLeave={e => { if (selected?.id !== a.id) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                                >
                                    <div style={{ fontSize: '12.5px', fontWeight: 500, color: selected?.id === a.id ? 'var(--accent-primary)' : 'var(--text-primary)', lineHeight: 1.3 }}>
                                        {zh ? a.title : a.title_en}
                                    </div>
                                    <div style={{ marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{
                                            fontSize: '10px', padding: '1px 5px', borderRadius: '3px',
                                            background: 'rgba(45,212,191,0.1)', color: 'var(--accent-primary)',
                                        }}>
                                            {a.category}
                                        </span>
                                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{a.page_route}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Center: Article Content */}
                <div className="card" style={{ flex: 1, overflow: 'auto', minHeight: '500px', padding: '24px' }}>
                    {selected ? (
                        <div>
                            <div style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                                    <div>
                                        <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '6px' }}>
                                            {zh ? selected.title : selected.title_en}
                                        </h3>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                            <span style={{
                                                fontSize: '11px', padding: '2px 8px', borderRadius: '4px',
                                                background: 'rgba(45,212,191,0.15)', color: 'var(--accent-primary)',
                                            }}>
                                                {selected.category}
                                            </span>
                                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                {selected.page_route}
                                            </span>
                                            {selected.updated_at && (
                                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                    · {zh ? '更新於' : 'Updated'} {selected.updated_at.slice(0, 10)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        className="btn btn-secondary"
                                        style={{ fontSize: '12px', padding: '5px 12px', flexShrink: 0 }}
                                        onClick={() => { setInput(zh ? `關於「${selected.title}」，我想了解更多` : `Tell me more about "${selected.title_en}"`); setChatOpen(true); }}
                                    >
                                        🤖 {zh ? '詢問 AI' : 'Ask AI'}
                                    </button>
                                </div>
                            </div>

                            {/* Render Markdown as formatted text */}
                            <div style={{
                                fontSize: '13.5px', lineHeight: 1.8, color: 'var(--text-primary)',
                                fontFamily: "'DM Sans', 'Noto Sans TC', sans-serif",
                            }}>
                                {(zh ? selected.content : selected.content_en)
                                    .split('\n')
                                    .map((line, i) => {
                                        if (line.startsWith('## ')) return (
                                            <h3 key={i} style={{ fontSize: '16px', fontWeight: 700, marginTop: '20px', marginBottom: '8px', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                                                {line.replace('## ', '')}
                                            </h3>
                                        );
                                        if (line.startsWith('### ')) return (
                                            <h4 key={i} style={{ fontSize: '14px', fontWeight: 600, marginTop: '16px', marginBottom: '6px', color: 'var(--accent-primary)' }}>
                                                {line.replace('### ', '')}
                                            </h4>
                                        );
                                        if (line.startsWith('- ') || line.startsWith('* ')) return (
                                            <div key={i} style={{ paddingLeft: '16px', marginBottom: '4px', display: 'flex', gap: '8px' }}>
                                                <span style={{ color: 'var(--accent-primary)', flexShrink: 0 }}>•</span>
                                                <span>{line.replace(/^[-*] /, '')}</span>
                                            </div>
                                        );
                                        if (/^\d+\. /.test(line)) return (
                                            <div key={i} style={{ paddingLeft: '16px', marginBottom: '4px', display: 'flex', gap: '8px' }}>
                                                <span style={{ color: 'var(--accent-primary)', minWidth: '18px', flexShrink: 0, fontWeight: 600 }}>{line.match(/^(\d+)\./)?.[1]}.</span>
                                                <span>{line.replace(/^\d+\. /, '')}</span>
                                            </div>
                                        );
                                        if (line.startsWith('> ')) return (
                                            <div key={i} style={{ borderLeft: '3px solid var(--accent-primary)', paddingLeft: '12px', margin: '8px 0', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                                {line.replace('> ', '')}
                                            </div>
                                        );
                                        if (line.trim() === '') return <div key={i} style={{ height: '8px' }} />;
                                        return <p key={i} style={{ marginBottom: '6px' }}>{line}</p>;
                                    })
                                }
                            </div>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
                            <div style={{ fontSize: '56px', marginBottom: '16px' }}>📖</div>
                            <p style={{ fontSize: '14px', marginBottom: '8px' }}>
                                {zh ? '從左側選擇文章閱讀' : 'Select an article from the left to read'}
                            </p>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                {articles.length === 0
                                    ? (zh ? '或點擊「重新生成文件」自動產生所有說明文件' : 'Or click "Re-generate Docs" to auto-generate all articles')
                                    : (zh ? `共 ${articles.length} 篇文章` : `${articles.length} articles available`)}
                            </p>
                        </div>
                    )}
                </div>

                {/* Right: AI Chat Panel */}
                {chatOpen && (
                    <div style={{
                        width: '340px', flexShrink: 0,
                        display: 'flex', flexDirection: 'column',
                        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                        borderRadius: '10px', overflow: 'hidden',
                        height: '600px', position: 'sticky', top: '0',
                    }}>
                        {/* Chat Header */}
                        <div style={{
                            padding: '12px 16px', borderBottom: '1px solid var(--border-color)',
                            background: 'linear-gradient(135deg, rgba(45,212,191,0.08), rgba(59,130,246,0.08))',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '20px' }}>🤖</span>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '13px' }}>
                                        {zh ? 'AI 說明助手' : 'AI Help Assistant'}
                                    </div>
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                        Claude · RAG {zh ? '知識庫' : 'Knowledge Base'}
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                    onClick={() => setMessages([])}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px', padding: '2px 6px' }}
                                    title={zh ? '清除對話' : 'Clear chat'}
                                >
                                    🗑
                                </button>
                                <button
                                    onClick={() => setChatOpen(false)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '16px' }}
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        {/* Messages */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {messages.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '30px 12px', color: 'var(--text-muted)' }}>
                                    <div style={{ fontSize: '32px', marginBottom: '10px' }}>💡</div>
                                    <p style={{ fontSize: '12px', lineHeight: 1.6 }}>
                                        {zh
                                            ? '問我任何關於系統功能的問題，我會從文件中找到答案'
                                            : 'Ask me anything about system features — I\'ll find the answer from the docs'}
                                    </p>
                                    <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {(zh
                                            ? ['如何申請請假？', '排班怎麼操作？', '如何設定 LINE 綁定？']
                                            : ['How do I request leave?', 'How does scheduling work?', 'How to configure LINE binding?']
                                        ).map((q, i) => (
                                            <button
                                                key={i}
                                                onClick={() => { setInput(q); }}
                                                style={{
                                                    background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                                                    borderRadius: '8px', padding: '6px 10px', cursor: 'pointer',
                                                    fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'left',
                                                }}
                                            >
                                                {q}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {messages.map((msg, i) => (
                                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                                    <div style={{
                                        maxWidth: '92%', padding: '8px 12px', borderRadius: '10px', fontSize: '12.5px', lineHeight: 1.65,
                                        background: msg.role === 'user' ? 'var(--accent-primary)' : 'var(--bg-primary)',
                                        color: msg.role === 'user' ? '#060a10' : 'var(--text-primary)',
                                        border: msg.role !== 'user' ? '1px solid var(--border-color)' : 'none',
                                    }}>
                                        {msg.isLoading
                                            ? <span style={{ opacity: 0.7 }}>🤔 {zh ? '思考中...' : 'Thinking...'}</span>
                                            : msg.content}
                                    </div>
                                    {msg.sources && msg.sources.length > 0 && (
                                        <div style={{ marginTop: '5px', display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '92%' }}>
                                            {msg.sources.map((s, si) => (
                                                <button
                                                    key={si}
                                                    onClick={() => {
                                                        const found = articles.find(a => a.page_route === s.page_route);
                                                        if (found) { setSelected(found); }
                                                    }}
                                                    style={{
                                                        fontSize: '10px', padding: '2px 7px', borderRadius: '4px',
                                                        background: 'rgba(45,212,191,0.1)', color: 'var(--accent-primary)',
                                                        border: '1px solid rgba(45,212,191,0.2)', cursor: 'pointer',
                                                    }}
                                                    title={s.page_route}
                                                >
                                                    📄 {s.title}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Input */}
                        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '6px' }}>
                            <input
                                className="input-field"
                                style={{ flex: 1, borderRadius: '16px', padding: '7px 14px', fontSize: '12.5px' }}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                                placeholder={zh ? '輸入問題...' : 'Ask a question...'}
                                disabled={chatLoading}
                            />
                            <button
                                className="btn btn-primary"
                                onClick={sendMessage}
                                disabled={chatLoading || !input.trim()}
                                style={{ borderRadius: '16px', padding: '6px 14px', minWidth: '40px' }}
                            >
                                {chatLoading ? '⏳' : '→'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
