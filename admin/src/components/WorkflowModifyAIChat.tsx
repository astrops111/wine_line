import { useState, useRef, useEffect } from 'react';
import { getLocale } from '../lib/i18n';
import { supabase } from '../lib/supabase';

export interface WorkflowAction {
    type: 'UPDATE_WORKFLOW' | 'ADD_STEP' | 'UPDATE_STEP' | 'DELETE_STEP' | 'MOVE_STEP';
    payload: any;
    description: string;
    description_en: string;
}

interface WorkflowSnapshot {
    id: string;
    name: string;
    description: string | null;
    steps: { id: string; name: string; step_order: number; step_type: string; description?: string | null }[];
}

interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    actions?: WorkflowAction[];
    isLoading?: boolean;
}

interface Props {
    workflow: WorkflowSnapshot;
    onApprove: (actions: WorkflowAction[]) => Promise<void>;
}

export function WorkflowModifyAIChat({ workflow, onApprove }: Props) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [approving, setApproving] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const zh = getLocale() === 'zh-TW';

    const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/workflow-modify-agent`;

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    function safeJsonParse(input: string): any | null {
        const trimmed = input.trim();
        if (!trimmed) return null;
        try {
            return JSON.parse(trimmed);
        } catch {
            const startObj = trimmed.indexOf('{');
            const endObj = trimmed.lastIndexOf('}');
            const startArr = trimmed.indexOf('[');
            const endArr = trimmed.lastIndexOf(']');
            const hasObj = startObj !== -1 && endObj !== -1 && endObj > startObj;
            const hasArr = startArr !== -1 && endArr !== -1 && endArr > startArr;
            let candidate = '';
            if (hasObj && (!hasArr || endObj > endArr)) {
                candidate = trimmed.slice(startObj, endObj + 1);
            } else if (hasArr) {
                candidate = trimmed.slice(startArr, endArr + 1);
            }
            if (!candidate) return null;
            let cleaned = candidate.replace(/,\s*([}\]])/g, '$1');
            cleaned = cleaned.replace(/}\s*{/g, '},{');
            try {
                return JSON.parse(cleaned);
            } catch {
                return null;
            }
        }
    }

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
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    prompt: userMsg,
                    context,
                    workflow,
                }),
            });

            if (!res.ok) {
                const errText = await res.text();
                const errJson = safeJsonParse(errText) || {};
                throw new Error((errJson as any).error || `HTTP ${res.status}`);
            }

            const text = await res.text();
            const data = safeJsonParse(text);
            if (!data) throw new Error(zh ? 'AI 回傳非 JSON 格式' : 'AI returned non-JSON response');

            const actions = data.actions as WorkflowAction[];
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

    async function handleApprove(actions: WorkflowAction[]) {
        setApproving(true);
        try {
            await onApprove(actions);
            setMessages(prev => [
                ...prev,
                {
                    role: 'system',
                    content: zh
                        ? `✅ 已成功執行 ${actions.length} 項流程修改！`
                        : `✅ Successfully executed ${actions.length} workflow changes!`,
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
            display: 'flex', flexDirection: 'column', height: '100%', minHeight: '520px',
            background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)',
            overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{
                padding: '12px 16px', borderBottom: '1px solid var(--border-color)',
                display: 'flex', alignItems: 'center', gap: '8px',
                background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(16,185,129,0.08))',
            }}>
                <span style={{ fontSize: '20px' }}>🛠️</span>
                <div>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>
                        {zh ? 'AI 流程修改助手' : 'AI Workflow Modifier'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {zh ? `針對「${workflow.name}」提出修改` : `Modify "${workflow.name}"`}
                    </div>
                </div>
            </div>

            {/* Messages */}
            <div style={{
                flex: 1, overflowY: 'auto', padding: '16px',
                display: 'flex', flexDirection: 'column', gap: '12px',
            }}>
                {messages.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--text-muted)' }}>
                        <div style={{ fontSize: '36px', marginBottom: '10px' }}>🧩</div>
                        <p style={{ fontSize: '13px', lineHeight: 1.6 }}>
                            {zh ? '描述你要如何修改流程，例如：' : 'Describe how you want to change the workflow, e.g.'}
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
                            {[
                                zh ? '「把第3步改成需要主管審核」' : '"Change step 3 to require manager approval"',
                                zh ? '「新增一個員工訓練步驟在最後」' : '"Add a staff training step at the end"',
                                zh ? '「刪除名為『驗收』的步驟」' : '"Remove the step named “Acceptance”"',
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
                                    {zh ? 'AI 正在分析流程...' : 'AI is analyzing the workflow...'}
                                </div>
                            ) : msg.actions ? (
                                <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                                    <div style={{
                                        padding: '12px 16px',
                                        background: 'linear-gradient(135deg, rgba(59,130,246,0.1), rgba(16,185,129,0.15))',
                                        borderBottom: '1px solid var(--border-color)',
                                    }}>
                                        <div style={{ fontWeight: 600, fontSize: '14px' }}>
                                            {msg.content}
                                        </div>
                                    </div>
                                    <div style={{ padding: '8px 16px' }}>
                                        {msg.actions.map((act, idx) => (
                                            <div key={idx} style={{
                                                display: 'flex', alignItems: 'center', gap: '10px', padding: '8px',
                                                borderRadius: 'var(--radius-sm)', marginBottom: '4px',
                                                background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                                            }}>
                                                <span style={{ fontSize: '16px' }}>
                                                    {act.type === 'ADD_STEP' ? '➕' : act.type === 'UPDATE_STEP' ? '✏️' : act.type === 'DELETE_STEP' ? '🗑️' : act.type === 'MOVE_STEP' ? '↕️' : '🧩'}
                                                </span>
                                                <span style={{ flex: 1, fontSize: '13px' }}>
                                                    {zh ? act.description : act.description_en}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
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
                    placeholder={zh ? '描述要修改的內容...' : 'Describe changes...'}
                    disabled={loading} />
                <button className="btn btn-primary" onClick={sendMessage} disabled={loading || !input.trim()}
                    style={{ borderRadius: '20px', padding: '8px 20px' }}>
                    {loading ? '⏳' : '🚀'}
                </button>
            </div>
        </div>
    );
}
