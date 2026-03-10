import { useState, useRef, useEffect } from 'react';
import { getLocale } from '../lib/i18n';

interface WorkflowSuggestion {
    name: string;
    name_en: string;
    description: string;
    description_en: string;
    estimated_days: number;
    steps: SuggestedStep[];
    summary: string;
    summary_en: string;
}

interface SuggestedStep {
    step_order: number;
    name: string;
    name_en: string;
    step_type: string;
    estimated_minutes: number;
    suggested_role: string;
    description: string;
}

interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    suggestion?: WorkflowSuggestion;
    isLoading?: boolean;
}

interface Props {
    onApprove: (suggestion: WorkflowSuggestion) => Promise<void>;
}

export function WorkflowAIChat({ onApprove }: Props) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [approving, setApproving] = useState(false);
    const [editingSteps, setEditingSteps] = useState<SuggestedStep[] | null>(null);
    const [editingSuggestion, setEditingSuggestion] = useState<WorkflowSuggestion | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const zh = getLocale() === 'zh-TW';

    const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/workflow-ai`;

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
                    content: m.suggestion ? JSON.stringify(m.suggestion) : m.content,
                }));

            const res = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: userMsg, context }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${res.status}`);
            }

            const data = await res.json();
            const suggestion = data.workflow as WorkflowSuggestion;

            setMessages([
                ...newMessages,
                {
                    role: 'assistant',
                    content: suggestion.summary || suggestion.summary_en || '',
                    suggestion,
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

    async function handleApprove(suggestion: WorkflowSuggestion) {
        setApproving(true);
        try {
            await onApprove(suggestion);
            setMessages(prev => [
                ...prev,
                {
                    role: 'system',
                    content: zh
                        ? `✅ 已成功建立流程「${suggestion.name}」，包含 ${suggestion.steps.length} 個步驟！`
                        : `✅ Successfully created workflow "${suggestion.name_en}" with ${suggestion.steps.length} steps!`,
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

    function startEditing(suggestion: WorkflowSuggestion) {
        setEditingSuggestion(suggestion);
        setEditingSteps(suggestion.steps.map(s => ({ ...s })));
    }

    function updateEditStep(idx: number, field: string, value: any) {
        if (!editingSteps) return;
        const updated = [...editingSteps];
        (updated[idx] as any)[field] = value;
        setEditingSteps(updated);
    }

    function removeEditStep(idx: number) {
        if (!editingSteps) return;
        const updated = editingSteps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step_order: i + 1 }));
        setEditingSteps(updated);
    }

    function addEditStep() {
        if (!editingSteps) return;
        setEditingSteps([
            ...editingSteps,
            {
                step_order: editingSteps.length + 1,
                name: '',
                name_en: '',
                step_type: 'task',
                estimated_minutes: 30,
                suggested_role: 'staff',
                description: '',
            },
        ]);
    }

    async function approveEdited() {
        if (!editingSuggestion || !editingSteps) return;
        const edited: WorkflowSuggestion = { ...editingSuggestion, steps: editingSteps };
        setEditingSteps(null);
        setEditingSuggestion(null);
        await handleApprove(edited);
    }

    const roleColors: Record<string, string> = {
        admin: '#ef4444', manager: '#a855f7', staff: '#3b82f6', operations: '#f97316',
    };

    const roleLabels: Record<string, string> = {
        admin: zh ? '管理員' : 'Admin',
        manager: zh ? '主管' : 'Manager',
        staff: zh ? '人員' : 'Staff',
        operations: zh ? '營運' : 'Operations',
    };

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', height: '100%', minHeight: '500px',
            background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)',
            overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{
                padding: '12px 16px', borderBottom: '1px solid var(--border-color)',
                display: 'flex', alignItems: 'center', gap: '8px',
                background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(59,130,246,0.1))',
            }}>
                <span style={{ fontSize: '20px' }}>🤖</span>
                <div>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>
                        {zh ? 'AI 流程助手' : 'AI Workflow Assistant'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {zh ? '用自然語言描述你需要的流程，AI 會幫你設計' : 'Describe your workflow needs in natural language'}
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
                        <div style={{ fontSize: '40px', marginBottom: '12px' }}>🧙‍♂️</div>
                        <p style={{ fontSize: '14px', lineHeight: 1.6 }}>
                            {zh ? '告訴我你想建立什麼流程，例如：' : 'Tell me what workflow you need, for example:'}
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
                            {[
                                zh ? '「我需要一個新員工入職訓練流程」' : '"I need an employee onboarding workflow"',
                                zh ? '「設計一個每月庫存盤點的工作流程」' : '"Design a monthly inventory check process"',
                                zh ? '「建立一個客戶活動企劃執行流程」' : '"Create a customer event planning workflow"',
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
                        {/* Message bubble */}
                        <div style={{
                            maxWidth: msg.suggestion ? '100%' : '85%',
                            padding: msg.suggestion ? '0' : '10px 14px',
                            borderRadius: '12px',
                            background: msg.role === 'user' ? 'var(--accent-primary)' : msg.role === 'system' ? 'rgba(16,185,129,0.15)' : 'var(--bg-primary)',
                            color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                            fontSize: '13px', lineHeight: 1.6,
                            border: msg.role !== 'user' ? '1px solid var(--border-color)' : 'none',
                            width: msg.suggestion ? '100%' : undefined,
                        }}>
                            {msg.isLoading ? (
                                <div className="loading-pulse" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>🤔</span>
                                    {zh ? 'AI 正在設計流程...' : 'AI is designing the workflow...'}
                                </div>
                            ) : msg.suggestion ? (
                                /* Workflow suggestion card */
                                <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                                    {/* Title bar */}
                                    <div style={{
                                        padding: '14px 16px',
                                        background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(59,130,246,0.1))',
                                        borderBottom: '1px solid var(--border-color)',
                                    }}>
                                        <div style={{ fontWeight: 600, fontSize: '15px' }}>
                                            📋 {msg.suggestion.name}
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                            {msg.suggestion.description} · {zh ? '預計' : 'Est.'} {msg.suggestion.estimated_days} {zh ? '天' : 'days'}
                                        </div>
                                    </div>

                                    {/* Summary */}
                                    <div style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, borderBottom: '1px solid var(--border-color)' }}>
                                        {zh ? msg.suggestion.summary : msg.suggestion.summary_en}
                                    </div>

                                    {/* Steps */}
                                    <div style={{ padding: '12px 16px' }}>
                                        <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-muted)' }}>
                                            {zh ? `📝 ${msg.suggestion.steps.length} 個步驟` : `📝 ${msg.suggestion.steps.length} Steps`}
                                        </div>
                                        {msg.suggestion.steps.map((step) => (
                                            <div key={step.step_order} style={{
                                                display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 8px',
                                                borderRadius: 'var(--radius-sm)', marginBottom: '3px',
                                                background: step.step_order % 2 === 0 ? 'transparent' : 'var(--bg-primary)',
                                            }}>
                                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', width: '20px', textAlign: 'center', fontWeight: 600 }}>
                                                    {step.step_order}
                                                </span>
                                                <span style={{ flex: 1, fontSize: '12px' }}>{step.name}</span>
                                                <span style={{
                                                    fontSize: '10px', padding: '1px 6px', borderRadius: '6px',
                                                    background: `${roleColors[step.suggested_role] || '#666'}20`,
                                                    color: roleColors[step.suggested_role] || '#666',
                                                }}>
                                                    {roleLabels[step.suggested_role] || step.suggested_role}
                                                </span>
                                                <span style={{ fontSize: '10px', color: 'var(--text-muted)', minWidth: '40px', textAlign: 'right' }}>
                                                    {step.estimated_minutes}min
                                                </span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Action buttons */}
                                    <div style={{
                                        padding: '12px 16px', borderTop: '1px solid var(--border-color)',
                                        display: 'flex', gap: '8px', justifyContent: 'flex-end',
                                        background: 'var(--bg-primary)',
                                    }}>
                                        <button className="btn btn-sm btn-secondary" onClick={() => startEditing(msg.suggestion!)}
                                            disabled={approving}>
                                            ✏️ {zh ? '編輯後採用' : 'Edit & Adopt'}
                                        </button>
                                        <button className="btn btn-sm btn-primary" onClick={() => handleApprove(msg.suggestion!)}
                                            disabled={approving}
                                            style={{ minWidth: '100px' }}>
                                            {approving ? (zh ? '建立中...' : 'Creating...') : `✅ ${zh ? '直接採用' : 'Approve & Create'}`}
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
                    placeholder={zh ? '描述你需要的流程...' : 'Describe the workflow you need...'}
                    disabled={loading} />
                <button className="btn btn-primary" onClick={sendMessage} disabled={loading || !input.trim()}
                    style={{ borderRadius: '20px', padding: '8px 20px' }}>
                    {loading ? '⏳' : '🚀'}
                </button>
            </div>

            {/* Edit Modal */}
            {editingSteps && editingSuggestion && (
                <div className="modal-overlay" onClick={() => { setEditingSteps(null); setEditingSuggestion(null); }}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', maxHeight: '85vh' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 600 }}>
                                ✏️ {zh ? '編輯流程步驟' : 'Edit Workflow Steps'}
                            </h3>
                            <button className="btn btn-sm btn-secondary" onClick={() => { setEditingSteps(null); setEditingSuggestion(null); }}>✕</button>
                        </div>

                        <div style={{ marginBottom: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                            📋 {editingSuggestion.name} — {editingSteps.length} {zh ? '個步驟' : 'steps'}
                        </div>

                        <div style={{ maxHeight: '50vh', overflowY: 'auto', marginBottom: '16px' }}>
                            {editingSteps.map((step, idx) => (
                                <div key={idx} style={{
                                    display: 'flex', gap: '8px', alignItems: 'center', padding: '8px',
                                    background: idx % 2 === 0 ? 'var(--bg-primary)' : 'transparent',
                                    borderRadius: 'var(--radius-sm)', marginBottom: '2px',
                                }}>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', width: '20px', textAlign: 'center' }}>
                                        {step.step_order}
                                    </span>
                                    <input className="input-field" style={{ flex: 1, padding: '4px 8px', fontSize: '12px' }}
                                        value={step.name} onChange={e => updateEditStep(idx, 'name', e.target.value)} />
                                    <select className="select" style={{ fontSize: '11px', padding: '4px' }} value={step.suggested_role}
                                        onChange={e => updateEditStep(idx, 'suggested_role', e.target.value)}>
                                        <option value="admin">{zh ? '管理員' : 'Admin'}</option>
                                        <option value="manager">{zh ? '主管' : 'Manager'}</option>
                                        <option value="staff">{zh ? '人員' : 'Staff'}</option>
                                        <option value="operations">{zh ? '營運' : 'Operations'}</option>
                                    </select>
                                    <input className="input-field" type="number" style={{ width: '60px', padding: '4px', fontSize: '12px', textAlign: 'center' }}
                                        value={step.estimated_minutes} onChange={e => updateEditStep(idx, 'estimated_minutes', parseInt(e.target.value) || 0)} />
                                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>min</span>
                                    <button className="btn btn-sm" style={{ padding: '2px 6px', color: 'var(--accent-red)' }}
                                        onClick={() => removeEditStep(idx)}>✕</button>
                                </div>
                            ))}
                        </div>

                        <button className="btn btn-sm btn-secondary" onClick={addEditStep} style={{ marginBottom: '16px' }}>
                            ➕ {zh ? '新增步驟' : 'Add Step'}
                        </button>

                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary" onClick={() => { setEditingSteps(null); setEditingSuggestion(null); }}>
                                {zh ? '取消' : 'Cancel'}
                            </button>
                            <button className="btn btn-primary" onClick={approveEdited} disabled={approving}>
                                ✅ {zh ? '採用此版本' : 'Approve Edited'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
