import { HelpCircle, MessagesSquare, PlayCircle, Send } from 'lucide-react';
import { useState, useEffect } from 'react';
import PageBackground from '../components/PageBackground';
import ScrollReveal from '../components/ScrollReveal';
import { getPublicSettings } from '../utils/settings';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useToastContext } from '../context/ToastContext';

const DEFAULT_FAQS = [
    {
        category: 'Абонаменти и плащания',
        items: [
            { q: 'Как да се абонирам?', a: 'Изберете план от страницата "Абонаменти", генерирайте основание и преведете сумата по посочения IBAN. Достъпът се отключва ръчно от администратор, обикновено до няколко часа.' },
            { q: 'Има ли автоматично подновяване?', a: 'В момента абонаментите не се подновяват автоматично. Когато периодът ви изтече, можете да закупите нов план ръчно.' },
            { q: 'Бъркам си основанието — какво да правя?', a: 'Изпратете запитване чрез формата по-долу и опишете правилното име, сумата и датата на превода, за да проверим плащането.' },
        ]
    },
    {
        category: 'Съдържание и платформи',
        items: [
            { q: 'Кога излизат нови епизоди?', a: 'Нови епизоди обикновено се качват веднъж седмично. Можете да следите секцията "Очаквай скоро" за точни дати.' },
            { q: 'Къде са дискусиите?', a: 'Можете да коментирате директно под всеки епизод. Ако имате въпрос към екипа, използвайте формата за запитване по-долу.' },
        ]
    },
];

function normalizeFaqAnswer(question, answer) {
    const normalizedQuestion = String(question || '').toLowerCase();
    const normalizedAnswer = String(answer || '').trim();

    if (!/discord/i.test(normalizedAnswer)) {
        return normalizedAnswer;
    }

    if (/основани/.test(normalizedQuestion)) {
        return 'Изпратете запитване чрез формата по-долу и опишете правилното име, сумата и датата на превода, за да проверим плащането.';
    }

    if (/дискуси/.test(normalizedQuestion)) {
        return 'Можете да коментирате директно под всеки епизод. Ако имате въпрос към екипа, използвайте формата за запитване по-долу.';
    }

    return 'За съдействие по този въпрос използвайте формата за запитване по-долу и опишете случая възможно най-подробно.';
}

function normalizeFaqDescription(description) {
    const normalizedDescription = String(description || '').trim();

    if (!/discord/i.test(normalizedDescription)) {
        return normalizedDescription;
    }

    return 'Имаш въпроси относно плащания, достъп или съдържание? Тук сме събрали най-полезната информация, а ако не намираш отговор, използвай формата за запитване по-долу.';
}

function normalizeFaqSections(sections) {
    if (!Array.isArray(sections)) {
        return DEFAULT_FAQS;
    }

    const normalized = sections
        .filter(section => section && Array.isArray(section.items))
        .map(section => ({
            ...section,
            items: section.items
                .filter(item => item && item.q && item.a)
                .map(item => ({
                    ...item,
                    a: normalizeFaqAnswer(item.q, item.a),
                })),
        }))
        .filter(section => section.items.length > 0);

    return normalized.length > 0 ? normalized : DEFAULT_FAQS;
}

export default function FAQPage() {
    const [ui, setUi] = useState({
        faq_title: 'Често задавани въпроси',
        faq_description: 'Имаш въпроси относно плащания, достъп или съдържание? Тук сме събрали най-полезната информация, а ако не намираш отговор, използвай формата за запитване по-долу.',
    });

    const [faqList, setFaqList] = useState(() => normalizeFaqSections(DEFAULT_FAQS));
    const { user } = useAuth();
    const { showToast } = useToastContext();
    const [ticket, setTicket] = useState({ subject: '', message: '' });
    const [submitting, setSubmitting] = useState(false);

    const handleTicketSubmit = async (e) => {
        e.preventDefault();
        if (!ticket.subject || !ticket.message) {
            return showToast('Моля, попълнете всички полета.', 'error');
        }
        setSubmitting(true);
        try {
            await api.post('/support', ticket);
            showToast('Запитването е изпратено успешно! Ще получите отговор като известие.', 'success');
            setTicket({ subject: '', message: '' });
        } catch (err) {
            showToast(err.message || 'Възникна грешка при изпращането', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    useEffect(() => {
        let active = true;
        getPublicSettings().then(settings => {
            if (active && settings) {
                setUi(prev => ({
                    faq_title: settings.faq_title || prev.faq_title,
                    faq_description: normalizeFaqDescription(settings.faq_description) || prev.faq_description,
                }));
                if (settings.faq_items) {
                    try {
                        const parsed = JSON.parse(settings.faq_items);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            setFaqList(normalizeFaqSections(parsed));
                        }
                    } catch (err) {
                        console.error('Failed to parse dynamic FAQ items:', err);
                    }
                }
            }
        }).catch(() => { });
        return () => { active = false; };
    }, []);

    return (
        <div className="relative max-w-4xl mx-auto px-4 py-12 overflow-hidden min-h-[80vh]">
            <PageBackground />

            <ScrollReveal variant="fadeUp">
                <div className="text-center mb-12">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--accent-gold)]/10 text-[var(--accent-gold)] mb-4">
                        <HelpCircle className="w-8 h-8" />
                    </div>
                    <h1 className="text-3xl md:text-4xl font-bold mb-4">{ui.faq_title}</h1>
                    <p className="text-center text-[var(--text-secondary)] max-w-2xl mx-auto">
                        {ui.faq_description}
                    </p>
                </div>
            </ScrollReveal>

            <div className="space-y-8">
                {faqList.map((section, idx) => (
                    <ScrollReveal key={idx} variant="fadeUp" delay={0.1 * idx}>
                        <div className="glass-card overflow-hidden">
                            <div className="flex items-center gap-3 bg-[var(--bg-secondary)] border-b border-[var(--border)] p-4 sm:p-5">
                                <PlayCircle className="w-5 h-5 text-[var(--accent-gold)]" />
                                <h2 className="text-xl font-semibold">{section.category}</h2>
                            </div>
                            <div className="p-4 sm:p-6 space-y-6">
                                {section.items.map((item, iOffset) => (
                                    <div key={iOffset}>
                                        <h3 className="text-lg font-medium mb-2">{item.q}</h3>
                                        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{item.a}</p>
                                        {iOffset < section.items.length - 1 && (
                                            <div className="my-5 h-px bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </ScrollReveal>
                ))}

                <ScrollReveal variant="fadeUp" delay={0.3}>
                    <div className="mt-8 p-6 sm:p-8 premium-panel max-w-2xl mx-auto">
                        <div className="text-center mb-6">
                            <MessagesSquare className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-3" />
                            <h3 className="text-xl font-semibold mb-2">Не намираш отговор?</h3>
                            <p className="text-sm text-[var(--text-secondary)]">Ако имаш въпроси, на които не намираш отговор тук, изпрати ни запитване.</p>
                        </div>

                        {!user ? (
                            <div className="p-4 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-center text-sm text-[var(--text-secondary)]">
                                Трябва да влезете в профила си, за да изпратите запитване.
                            </div>
                        ) : (
                            <form onSubmit={handleTicketSubmit} className="space-y-4 text-left">
                                <div>
                                    <label className="text-sm text-[var(--text-muted)] block mb-1">Тема</label>
                                    <input
                                        type="text"
                                        className="input-dark w-full"
                                        placeholder="Напр. Проблем с плащане"
                                        value={ticket.subject}
                                        onChange={e => setTicket(prev => ({ ...prev, subject: e.target.value }))}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="text-sm text-[var(--text-muted)] block mb-1">Съобщение</label>
                                    <textarea
                                        className="input-dark w-full"
                                        rows={4}
                                        placeholder="Опишете проблема или въпроса си..."
                                        value={ticket.message}
                                        onChange={e => setTicket(prev => ({ ...prev, message: e.target.value }))}
                                        required
                                    />
                                </div>
                                <button type="submit" disabled={submitting} className="btn-gold w-full justify-center flex items-center gap-2">
                                    {submitting ? 'Изпращане...' : <>Изпрати запитване <Send className="w-4 h-4" /></>}
                                </button>
                            </form>
                        )}
                    </div>
                </ScrollReveal>
            </div>
        </div>
    );
}
