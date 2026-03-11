import { useState } from 'react';
import { getLocale } from '../lib/i18n';

interface LawRule {
    category: string; rule: string; regulation: string; article: string; link: string;
}

const LABOR_LAWS: { title: string; titleEn: string; fullTextZh: string; fullTextEn: string; rules: LawRule[] }[] = [
    {
        title: '勞動基準法', titleEn: 'Labour Standards Act',
        fullTextZh: 'https://laws.mol.gov.tw/FLAW/FLAWDAT0201.aspx?lsid=FL014930',
        fullTextEn: 'https://laws.mol.gov.tw/Eng/FLAWDAT01.aspx?id=FL014930',
        rules: [
            { category: '工時', rule: '每日正常工時', regulation: '≤ 8 小時/天', article: 'Art. 30 §1', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=30' },
            { category: '工時', rule: '每週正常工時', regulation: '≤ 40 小時/週', article: 'Art. 30 §1', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=30' },
            { category: '工時', rule: '二週彈性工時', regulation: '可跨兩週分配，每週 ≤ 48小時，每日最多 +2小時', article: 'Art. 30 §2', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=30' },
            { category: '工時', rule: '每日上限 (含加班)', regulation: '≤ 12 小時/天', article: 'Art. 32 §2', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=32' },
            { category: '工時', rule: '出勤紀錄保存', regulation: '須保存 5 年', article: 'Art. 30 §6', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=30' },
            { category: '加班', rule: '每月加班上限', regulation: '≤ 46 小時/月', article: 'Art. 32 §2', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=32' },
            { category: '加班', rule: '延長加班上限', regulation: '≤ 54時/月、≤ 138時/3月（需勞資會議同意）', article: 'Art. 32 §3', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=32' },
            { category: '加班', rule: '超過30人報備', regulation: '須向地方主管機關報備', article: 'Art. 32 §3', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=32' },
            { category: '加班費', rule: '平日加班（前2小時）', regulation: '基本工資 × 1.34（⅓加給）', article: 'Art. 24 §1-1', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=24' },
            { category: '加班費', rule: '平日加班（2小時後）', regulation: '基本工資 × 1.67（⅔加給）', article: 'Art. 24 §1-2', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=24' },
            { category: '加班費', rule: '休息日加班（前2小時）', regulation: '基本工資 × 1.34', article: 'Art. 24 §2-1', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=24' },
            { category: '加班費', rule: '休息日加班（2小時後）', regulation: '基本工資 × 1.67', article: 'Art. 24 §2-2', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=24' },
            { category: '加班費', rule: '國定假日出勤', regulation: '基本工資 × 2.0（雙倍薪資）', article: 'Art. 39', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=39' },
            { category: '加班費', rule: '補休選項', regulation: '經勞工同意可以補休代替加班費', article: 'Art. 32-1', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=32-1' },
            { category: '休息與休假', rule: '連續工作4小時休息', regulation: '≥ 30 分鐘', article: 'Art. 35', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=35' },
            { category: '休息與休假', rule: '每週休假', regulation: '7天中2天：1例假 + 1休息日', article: 'Art. 36 §1', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=36' },
            { category: '休息與休假', rule: '例假日出勤', regulation: '禁止（不可抗力除外）', article: 'Art. 40', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=40' },
            { category: '休息與休假', rule: '休息日出勤', regulation: '允許，但需支付加班費', article: 'Art. 36 / Art. 24', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=36' },
            { category: '輪班', rule: '班次間休息', regulation: '≥ 11 小時連續休息', article: 'Art. 34 §2', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=34' },
            { category: '輪班', rule: '縮短休息（特殊情況）', regulation: '可縮短至 ≥ 8小時（需中央核定+勞資會議同意）', article: 'Art. 34 §2', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=34' },
            { category: '輪班', rule: '輪班頻率', regulation: '輪班制勞工每週應輪替', article: 'Art. 34 §1', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=34' },
            { category: '特別休假', rule: '6個月–1年', regulation: '3 天', article: 'Art. 38 §1-1', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=38' },
            { category: '特別休假', rule: '1–2年', regulation: '7 天', article: 'Art. 38 §1-2', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=38' },
            { category: '特別休假', rule: '2–3年', regulation: '10 天', article: 'Art. 38 §1-3', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=38' },
            { category: '特別休假', rule: '3–5年', regulation: '14 天', article: 'Art. 38 §1-4', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=38' },
            { category: '特別休假', rule: '5–10年', regulation: '15 天', article: 'Art. 38 §1-5', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=38' },
            { category: '特別休假', rule: '10年以上', regulation: '15 + 每年加1天（上限 30 天）', article: 'Art. 38 §1-6', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=38' },
            { category: '特別休假', rule: '未休假折算', regulation: '雇主須折算工資給勞工', article: 'Art. 38 §4', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=38' },
            { category: '國定假日', rule: '應休假日', regulation: '勞工於國定假日享有休假權', article: 'Art. 37', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=37' },
            { category: '國定假日', rule: '假日出勤薪資', regulation: '經勞工同意出勤，薪資 × 2', article: 'Art. 39', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=39' },
        ]
    },
    {
        title: '性別平等工作法', titleEn: 'Act of Gender Equality in Employment',
        fullTextZh: 'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=N0030014',
        fullTextEn: 'https://law.moj.gov.tw/ENG/LawClass/LawAll.aspx?pcode=N0030014',
        rules: [
            { category: '懷孕勞工', rule: '夜間禁止工作', regulation: '懷孕勞工禁止於 22:00–06:00 工作', article: 'Art. 49', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=49' },
            { category: '懷孕勞工', rule: '減輕工作量', regulation: '雇主應依懷孕/哺乳勞工請求調整工作', article: 'Art. 19', link: 'https://law.moj.gov.tw/ENG/LawClass/LawAll.aspx?pcode=N0030014' },
            { category: '產假', rule: '產假', regulation: '分娩前後 8 週（任職滿6個月有薪）', article: 'Art. 15', link: 'https://law.moj.gov.tw/ENG/LawClass/LawAll.aspx?pcode=N0030014' },
            { category: '哺乳', rule: '哺乳時間', regulation: '60分鐘/天（子女未滿2歲），算入工時', article: 'Art. 18', link: 'https://law.moj.gov.tw/ENG/LawClass/LawAll.aspx?pcode=N0030014' },
        ]
    },
    {
        title: '童工及青少年勞工保護', titleEn: 'Child & Young Worker Protections',
        fullTextZh: 'https://laws.mol.gov.tw/FLAW/FLAWDAT0201.aspx?lsid=FL014930',
        fullTextEn: 'https://laws.mol.gov.tw/Eng/FLAWDAT01.aspx?id=FL014930',
        rules: [
            { category: '童工(<16歲)', rule: '每日工時', regulation: '≤ 8 小時，每週 ≤ 40 小時', article: 'Art. 47', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=47' },
            { category: '童工(<16歲)', rule: '夜間禁止工作', regulation: '禁止於 20:00–06:00 工作', article: 'Art. 48', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=48' },
            { category: '童工(<16歲)', rule: '禁止加班', regulation: '不得加班或於假日工作', article: 'Art. 47', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=47' },
            { category: '童工(<16歲)', rule: '休息要求', regulation: '每連續工作 2 小時，≥ 15 分鐘休息', article: 'Art. 47', link: 'https://laws.mol.gov.tw/Eng/FLAWDAT0202.aspx?lsid=FL014930&flno=47' },
        ]
    }
];

export function ShiftRules() {
    const zh = getLocale() === 'zh-TW';
    const [expandedLaw, setExpandedLaw] = useState<number>(0);
    const [filterCat, setFilterCat] = useState<string>('all');

    const currentLaw = LABOR_LAWS[expandedLaw];
    const allCategories = [...new Set(currentLaw.rules.map(r => r.category))];
    const filtered = filterCat === 'all' ? currentLaw.rules : currentLaw.rules.filter(r => r.category === filterCat);

    const categoryIcons: Record<string, string> = {
        '工時': '⏰', '加班': '📈', '加班費': '💰', '休息與休假': '🛌', '輪班': '🔄',
        '特別休假': '🏖', '國定假日': '🎌', '懷孕勞工': '🤰', '產假': '👶', '哺乳': '🍼',
        '童工(<16歲)': '🧒',
    };

    return (
        <div className="fade-in">
            <div className="page-header">
                <h1>⚖️ {zh ? '排班規則' : 'Shift Rules'}</h1>
                <p className="page-subtitle">{zh ? '台灣勞動法排班相關規定一覽' : 'Taiwan labour law shift scheduling regulations'}</p>
            </div>

            {/* Law tabs */}
            <div className="tab-bar" style={{ marginBottom: '16px' }}>
                {LABOR_LAWS.map((law, i) => (
                    <button key={i} className={`tab-item ${expandedLaw === i ? 'active' : ''}`} onClick={() => { setExpandedLaw(i); setFilterCat('all'); }}>
                        {i === 0 ? '📜' : i === 1 ? '⚖️' : '🧒'} {zh ? law.title : law.titleEn}
                    </button>
                ))}
            </div>

            {/* Full text links */}
            <div className="card" style={{ padding: '12px 16px', marginBottom: '16px', display: 'flex', gap: '16px', alignItems: 'center', fontSize: '13px' }}>
                <span style={{ fontWeight: 600 }}>{zh ? currentLaw.title : currentLaw.titleEn}</span>
                <a href={currentLaw.fullTextZh} target="_blank" rel="noopener" style={{ color: 'var(--accent-primary)' }}>📖 {zh ? '中文全文' : 'Chinese Full Text'}</a>
                <a href={currentLaw.fullTextEn} target="_blank" rel="noopener" style={{ color: 'var(--accent-primary)' }}>📖 {zh ? '英文全文' : 'English Full Text'}</a>
                <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>{currentLaw.rules.length} {zh ? '條規定' : 'rules'}</span>
            </div>

            {/* Category filter */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <button className={`btn btn-sm ${filterCat === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilterCat('all')}>
                    {zh ? '全部' : 'All'} ({currentLaw.rules.length})
                </button>
                {allCategories.map(cat => (
                    <button key={cat} className={`btn btn-sm ${filterCat === cat ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilterCat(cat)}>
                        {categoryIcons[cat] || '📌'} {cat} ({currentLaw.rules.filter(r => r.category === cat).length})
                    </button>
                ))}
            </div>

            {/* Rules table */}
            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                        <tr style={{ background: 'var(--bg-primary)' }}>
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)', width: '120px' }}>{zh ? '類別' : 'Category'}</th>
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)', width: '200px' }}>{zh ? '規則' : 'Rule'}</th>
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)' }}>{zh ? '規定內容' : 'Regulation'}</th>
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)', width: '120px' }}>{zh ? '條文' : 'Article'}</th>
                            <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)', width: '60px' }}>{zh ? '連結' : 'Link'}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((rule, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                <td style={{ padding: '8px 14px', color: 'var(--text-secondary)' }}>
                                    <span>{categoryIcons[rule.category] || '📌'} {rule.category}</span>
                                </td>
                                <td style={{ padding: '8px 14px', fontWeight: 600 }}>{rule.rule}</td>
                                <td style={{ padding: '8px 14px' }}>
                                    <span style={{ background: 'var(--bg-primary)', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>
                                        {rule.regulation}
                                    </span>
                                </td>
                                <td style={{ padding: '8px 14px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-muted)' }}>{rule.article}</td>
                                <td style={{ padding: '8px 14px', textAlign: 'center' }}>
                                    <a href={rule.link} target="_blank" rel="noopener" style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>🔗</a>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* 2025 Holiday Amendment callout */}
            <div className="card" style={{ marginTop: '16px', borderLeft: '4px solid var(--accent-primary)' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
                    📢 2025 {zh ? '紀念日及節日實施條例修正' : 'Holiday Amendments'}
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                    {zh ? '自2025/2026年起，新增5個國定假日：' : 'From 2025/2026, 5 new national holidays added:'}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px', marginTop: '10px' }}>
                    {[
                        { name: '農曆小年夜', en: 'Lunar Little New Year\'s Eve', from: '2026' },
                        { name: '勞動節（擴大適用）', en: 'Labour Day (expanded)', from: '2026' },
                        { name: '教師節', en: 'Teachers\' Day (Sep 28)', from: '2025' },
                        { name: '臺灣光復節', en: 'Retrocession Day (Oct 25)', from: '2025' },
                        { name: '行憲紀念日', en: 'Constitution Day (Dec 25)', from: '2025' },
                    ].map((h, i) => (
                        <div key={i} style={{ background: 'var(--bg-primary)', borderRadius: '6px', padding: '8px 12px', fontSize: '12px' }}>
                            <div style={{ fontWeight: 600 }}>{zh ? h.name : h.en}</div>
                            <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>{zh ? '生效自' : 'From'} {h.from}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
