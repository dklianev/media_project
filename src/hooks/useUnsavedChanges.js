import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

export function useUnsavedChanges(isDirty) {
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [isDirty]);

    useBlocker(
        () => {
            if (isDirty) {
                return !window.confirm('Имате незапазени промени. Сигурни ли сте, че искате да напуснете?');
            }
            return false;
        },
        [isDirty]
    );
}
