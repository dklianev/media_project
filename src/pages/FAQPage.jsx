import { motion } from 'framer-motion';
import { HelpCircle, MessagesSquare, CreditCard, PlayCircle, Mail } from 'lucide-react';
import { useState, useEffect } from 'react';
import PageBackground from '../components/PageBackground';
import ScrollReveal from '../components/ScrollReveal';

export default function FAQPage() {
    const [ui, setUi] = useState({
        faq_title: 'Често задавани въпроси',
        faq_description: 'Имаш въпроси относно плащания, достъп или съдържание? Тук сме събрали най-полезната информация за теб.',
        faq_discord_link: 'Свържи се в Discord',
        faq_discord_url: 'https://discord.gg/yourinvite'
    });

    useEffect(() => {
        let active = true;
        import('../utils/settings').then(({ getPublicSettings }) => {
            getPublicSettings().then(settings => {
                if (active && settings) {
                    setUi(prev => ({
                        faq_title: settings.faq_title || prev.faq_title,
                        faq_description: settings.faq_description || prev.faq_description,
                        faq_discord_link: settings.faq_discord_link || prev.faq_discord_link,
                        faq_discord_url: settings.faq_discord_url || prev.faq_discord_url,
                    }));
                }
            }).catch(() => { });
        });
        return () => { active = false; };
    }, []);
    const faqs = [
        {
            category: 'Абонаменти и плащания',
            icon: <CreditCard className="w-5 h-5 text-[var(--accent-gold)]" />,
            items: [
                { q: 'Как да се абонирам?', a: 'Изберете план от страницата "Абонаменти", генерирайте основание и преведете сумата по посочения IBAN. Достъпът се отключва ръчно от администратор, обикновено до няколко часа.' },
                { q: 'Има ли автоматично подновяване?', a: 'В момента абонаментите не се подновяват автоматично. Когато периодът ви изтече, можете да закупите нов план ръчно.' },
                { q: 'Бъркам си основанието — какво да правя?', a: 'Пишете на администраторите в Discord сървъра ни със снимка на превода и правилното ви име.' },
            ]
        },
        {
            category: 'Съдържание и платформи',
            icon: <PlayCircle className="w-5 h-5 text-[var(--accent-gold)]" />,
            items: [
                { q: 'Кога излизат нови епизоди?', a: 'Нови епизоди обикновено се качват веднъж седмично. Можете да следите секцията "Очаквай скоро" за точни дати.' },
                { q: 'Къде са дискусиите?', a: 'Вече можете да коментирате директно под всеки епизод, както и да обсъждате с общността в свързания Discord сървър.' },
            ]
        },
    ];

    return (
        <div className="relative max-w-4xl mx-auto px-4 py-12 overflow-hidden min-h-[80vh]">
            <PageBackground />

            <ScrollReveal variant="fadeUp">
                <div className="text-center mb-12">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--accent-gold)]/10 text-[var(--accent-gold)] mb-4">
                        <HelpCircle className="w-8 h-8" />
                    </div>
                    <h1 className="text-3xl md:text-4xl font-bold mb-4">{ui.faq_title}</h1>
                    <p className="text-[var(--text-secondary)] max-w-xl mx-auto">
                        {ui.faq_description}
                    </p>
                </div>
            </ScrollReveal>

            <div className="space-y-8">
                {faqs.map((section, idx) => (
                    <ScrollReveal key={idx} variant="fadeUp" delay={0.1 * idx}>
                        <div className="glass-card overflow-hidden">
                            <div className="flex items-center gap-3 bg-[var(--bg-secondary)] border-b border-[var(--border)] p-4 sm:p-5">
                                {section.icon}
                                <h2 className="text-xl font-semibold">{section.category}</h2>
                            </div>
                            <div className="p-4 sm:p-6 space-y-6">
                                {section.items.map((item, iOffset) => (
                                    <div key={iOffset}>
                                        <h3 className="text-lg font-medium text-white mb-2">{item.q}</h3>
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
                    <div className="mt-8 p-6 premium-panel text-center">
                        <MessagesSquare className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-3" />
                        <h3 className="text-lg font-semibold mb-2">Не намираш отговор?</h3>
                        <p className="text-sm text-[var(--text-secondary)] mb-4">Ако имаш въпроси, на които не намираш отговор тук, свържи се с нас.</p>
                        <a href={ui.faq_discord_url} target="_blank" rel="noopener noreferrer" className="btn-gold px-6">{ui.faq_discord_link}</a>
                    </div>
                </ScrollReveal>
            </div>
        </div>
    );
}
