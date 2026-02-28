import { Plus, Trash2 } from 'lucide-react';

export default function FaqEditor({ value, onChange }) {
    let list = [];
    try {
        if (value) list = JSON.parse(value);
    } catch (e) {
        //
    }

    if (!Array.isArray(list)) list = [];

    const handleChange = (newList) => {
        onChange(JSON.stringify(newList));
    };

    const addCategory = () => {
        handleChange([...list, { category: 'Нова категория', items: [{ q: 'Нов въпрос', a: 'Нов отговор' }] }]);
    };

    const removeCategory = (idx) => {
        if (!window.confirm('Сигурни ли сте, че искате да изтриете тази категория и всички нейни въпроси?')) return;
        const newList = [...list];
        newList.splice(idx, 1);
        handleChange(newList);
    };

    const updateCategoryName = (idx, newName) => {
        const newList = [...list];
        newList[idx].category = newName;
        handleChange(newList);
    };

    const addItem = (catIdx) => {
        const newList = [...list];
        if (!newList[catIdx].items) newList[catIdx].items = [];
        newList[catIdx].items.push({ q: 'Нов въпрос', a: 'Отговор' });
        handleChange(newList);
    };

    const removeItem = (catIdx, itemIdx) => {
        const newList = [...list];
        newList[catIdx].items.splice(itemIdx, 1);
        handleChange(newList);
    };

    const updateItem = (catIdx, itemIdx, field, val) => {
        const newList = [...list];
        newList[catIdx].items[itemIdx][field] = val;
        handleChange(newList);
    };

    return (
        <div className="space-y-4">
            {list.length === 0 && (
                <p className="text-sm text-[var(--text-muted)]">Няма добавени въпроси. Кликнете бутона отдолу, за да започнете.</p>
            )}

            {list.map((cat, catIdx) => (
                <div key={catIdx} className="glass-card p-4 border border-[var(--border)] relative bg-[var(--bg-tertiary)]/30">
                    <div className="flex items-center gap-3 mb-4">
                        <input
                            className="input-dark font-bold text-lg flex-1"
                            value={cat.category || ''}
                            onChange={(e) => updateCategoryName(catIdx, e.target.value)}
                            placeholder="Име на категория..."
                        />
                        <button
                            onClick={() => removeCategory(catIdx)}
                            className="p-2 text-[var(--danger)] hover:bg-[var(--danger)]/10 rounded-lg transition-colors"
                            title="Изтрий категория"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="space-y-3 pl-2 sm:pl-4 border-l-2 border-[var(--border)]">
                        {(cat.items || []).map((item, itemIdx) => (
                            <div key={itemIdx} className="flex gap-2 sm:gap-3 items-start relative group">
                                <div className="flex-1 space-y-2">
                                    <input
                                        className="input-dark text-sm w-full font-medium"
                                        value={item.q || ''}
                                        onChange={(e) => updateItem(catIdx, itemIdx, 'q', e.target.value)}
                                        placeholder="Въпрос..."
                                    />
                                    <textarea
                                        className="input-dark text-sm w-full"
                                        rows={2}
                                        value={item.a || ''}
                                        onChange={(e) => updateItem(catIdx, itemIdx, 'a', e.target.value)}
                                        placeholder="Отговор..."
                                    />
                                </div>
                                <button
                                    onClick={() => removeItem(catIdx, itemIdx)}
                                    className="p-1.5 text-[var(--danger)]/70 hover:text-[var(--danger)] hover:bg-[var(--danger)]/10 rounded-md transition-colors mt-1 shrink-0"
                                    title="Изтрий въпрос"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}

                        <button
                            onClick={() => addItem(catIdx)}
                            className="btn-outline text-xs inline-flex items-center gap-1.5 mt-2"
                        >
                            <Plus className="w-3.5 h-3.5" /> Добави въпрос
                        </button>
                    </div>
                </div>
            ))}

            <button
                onClick={addCategory}
                className="btn-outline w-full justify-center flex items-center gap-2 border-dashed border-[var(--border)] bg-transparent hover:bg-[var(--bg-tertiary)]"
            >
                <Plus className="w-4 h-4" /> Добави нова категория
            </button>
        </div>
    );
}
