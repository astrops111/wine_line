import { useState, useRef, useEffect } from 'react';
import { getLocale } from '../lib/i18n';
import { supabase } from '../lib/supabase';

export interface TaskAction {
    type: 'CREATE_TASK' | 'UPDATE_TASK' | 'DELETE_TASK';
    payload: any;
    description: string;
    description_en: string;
}

interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    actions?: TaskAction[];
    isLoading?: boolean;
}

interface Props {
    onApprove: (actions: TaskAction[]) => Promise<void>;
}

export function TaskAIChat({ onApprove }: Props) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [approving, setApproving] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const zh = getLocale() === 'zh-TW';

    const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/task-ai-agent`;

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    async function sendMessage() {
        if (!input.trim() || loading) return;
        const userMsg = input.trim();
        setInput('');

        const newMessages: ChatMessage[] = [...messages, { role: 'user', content: userMsg }];
        setMessages([...newMessages, { role: 'assistant', content: '', isLoading: true }]);
        setLoading(true);

        try {
            const context = newMessages
                .filter(m => !m.isLoading)
                .map(m => ({
                    role: m.role,
                    content: m.actions ? JSON.stringify(m.actions) : m.content,
                }));

            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

            const res = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ prompt: userMsg, context }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${res.status}`);
            }

            const data = await res.json();
            const actions = data.actions as TaskAction[];
            const summary = data.summary as string;

            setMessages([
                ...newMessages,
                {
                    role: 'assistant',
                    content: summary || (zh ? '這是我建議的修改：' : 'Here are my suggested changes:'),
                    actions: actions && actions.length > 0 ? actions : undefined,
                },
            ]);
        } catch (err: any) {
            setMessages([
                ...newMessages,
                { role: 'assistant', content: `❌ ${zh ? '發生錯誤' : 'Error'}: ${err.message}` },
            ]);
        } finally {
            setLoading(false);
        }
    }

    async function handleApprove(actions: TaskAction[]) {
        setApproving(true);
        try {
            await onApprove(actions);
            setMessages(prev => [
                ...prev,
                {
                    role: 'system',
                    content: zh
                        ? `✅ 已成功執行 ${actions.length} 項變更！`
                        : `✅ Successfully executed ${actions.length} changes!`,
                },
            ]);
        } catch (err: any) {
            setMessages(prev => [
                ...prev,
                { role: 'system', content: `❌ ${err.message}` },
            ]);
        } finally {
            setApproving(false);
        }
    }

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', height: '100%', minHeight: '600px',
            background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)',
            overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{
                padding: '12px 16px', borderBottom: '1px solid var(--border-color)',
                display: 'flex', alignItems: 'center', gap: '8px',
                background: 'linear-gradient(135deg, rgba(59,130,246,0.1), rgba(16,185,129,0.1))',
            }}>
                <span style={{ fontSize: '20px' }}>🤖</span>
                <div>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>
                        {zh ? 'AI 任務助手' : 'AI Task Assistant'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {zh ? '用自然語言描述你的修改，AI 會幫你執行' : 'Describe your task changes in natural language'}
                    </div>
                </div>
            </div>

            {/* Messages */}
            <div style={{
                flex: 1, overflowY: 'auto', padding: '16px',
                display: 'flex', flexDirection: 'column', gap: '12px',
            }}>
                {messages.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                        <div style={{ fontSize: '40px', marginBottom: '12px' }}>✨</div>
                        <p style={{ fontSize: '14px', lineHeight: 1.6 }}>
                            {zh ? '告訴我你想修改什麼任務，例如：' : 'Tell me what tasks you want to modify, for example:'}
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
                            {[
                                zh ? '「新增一個打掃廁所的任務加到早班店務」' : '"Add a task to clean the restroom to the morning shift"',
                                zh ? '「把今天所有待辦任務指派給 John」' : '"Assign all pending tasks to John today"',
                                zh ? '「幫我把盤點任務的優先級改為緊急」' : '"Change priority of the inventory check task to urgent"',
                            ].map((ex, i) => (
                                <button key={i} onClick={() => { setInput(ex.replace(/[「」""]/g, '')); }}
                                    style={{
                                        padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                                        background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                                        color: 'var(--accent-primary)', fontSize: '12px', cursor: 'pointer',
                                        textAlign: 'left', transition: 'all 0.15s',
                                    }}
                                    onMouseOver={e => (e.currentTarget.style.borderColor = 'var(--accent-primary)')}
                                    onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--border-color)')}>
                                    💡 {ex}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map((msg, i) => (
                    <div key={i} style={{
                        display: 'flex', flexDirection: 'column',
                        alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    }}>
                        <div style={{
                            maxWidth: msg.actions ? '100%' : '85%',
                            padding: msg.actions ? '0' : '10px 14px',
                            borderRadius: '12px',
                            background: msg.role === 'user' ? 'var(--accent-primary)' : msg.role === 'system' ? 'rgba(16,185,129,0.15)' : 'var(--bg-primary)',
                            color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                            fontSize: '13px', lineHeight: 1.6,
                            border: msg.role !== 'user' ? '1px solid var(--border-color)' : 'none',
                            width: msg.actions ? '100%' : undefined,
                        }}>
                            {msg.isLoading ? (
                                <div className="loading-pulse" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>🤔</span>
                                    {zh ? 'AI 正在處理請求...' : 'AI is processing your request...'}
                                </div>
                            ) : msg.actions ? (
                                /* Action suggestion card */
                                <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                                    {/* Title bar */}
                                    <div style={{
                                        padding: '12px 16px',
                                        background: 'linear-gradient(135deg, rgba(59,130,246,0.1), rgba(16,185,129,0.15))',
                                        borderBottom: '1px solid var(--border-color)',
                                    }}>
                                        <div style={{ fontWeight: 600, fontSize: '14px' }}>
                                            {msg.content}
                                        </div>
                                    </div>

                                    {/* Action items */}
                                    <div style={{ padding: '8px 16px' }}>
                                        {msg.actions.map((act, idx) => (
                                            <div key={idx} style={{
                                                display: 'flex', alignItems: 'center', gap: '10px', padding: '8px',
                                                borderRadius: 'var(--radius-sm)', marginBottom: '4px',
                                                background: 'var(--bg-primary)', border: '1px solid var(--border-color)'
                                            }}>
                                                <span style={{ fontSize: '16px' }}>
                                                    {act.type === 'CREATE_TASK' ? '➕' : act.type === 'UPDATE_TASK' ? '✏️' : '🗑️'}
                                                </span>
                                                <span style={{ flex: 1, fontSize: '13px' }}>
                                                    {zh ? act.description : act.description_en}
                                                </span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Action buttons */}
                                    <div style={{
                                        padding: '10px 16px', borderTop: '1px solid var(--border-color)',
                                        display: 'flex', gap: '8px', justifyContent: 'flex-end',
                                        background: 'var(--bg-primary)',
                                    }}>
                                        <button className="btn btn-sm btn-primary" onClick={() => handleApprove(msg.actions!)}
                                            disabled={approving}>
                                            {approving ? (zh ? '執行中...' : 'Executing...') : `✅ ${zh ? '同意並執行' : 'Approve & Execute'}`}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                msg.content
                            )}
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div style={{
                padding: '12px 16px', borderTop: '1px solid var(--border-color)',
                display: 'flex', gap: '8px',
            }}>
                <input className="input-field" style={{ flex: 1, borderRadius: '20px', padding: '10px 16px' }}
                    value={input} onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                    placeholder={zh ? '例如：新增一個盤點庫存任務給小明...' : 'e.g.: Add inventory check task for Ming...'}
                    disabled={loading} />
                <button className="btn btn-primary" onClick={sendMessage} disabled={loading || !input.trim()}
                    style={{ borderRadius: '20px', padding: '8px 20px' }}>
                    {loading ? '⏳' : '🚀'}
                </button>
            </div>
        </div>
    );
}
