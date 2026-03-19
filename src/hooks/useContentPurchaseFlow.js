import { useState } from 'react';
import { api } from '../utils/api';
import { useToastContext } from '../context/ToastContext';

function normalizeModalRequest(payload, fallback = {}) {
  if (!payload) return null;
  return {
    ...payload,
    ...fallback,
    reference_code: payload.reference_code || payload.referenceCode || fallback.reference_code,
    payment_info: payload.payment_info || payload.paymentInfo || fallback.payment_info,
  };
}

export function useContentPurchaseFlow({ onResolved } = {}) {
  const { showToast } = useToastContext();
  const [activeKey, setActiveKey] = useState('');
  const [modalRequest, setModalRequest] = useState(null);

  const requestPurchase = async (targetType, targetId, fallback = {}) => {
    const key = `${targetType}:${targetId}`;
    if (activeKey) return;

    setActiveKey(key);
    try {
      const response = await api.post('/content-purchases', {
        target_type: targetType,
        target_id: targetId,
      });
      setModalRequest(normalizeModalRequest(response, fallback));
      showToast('Заявката за покупка е създадена.');
      if (onResolved) await onResolved();
      return { ok: true, created: true };
    } catch (err) {
      if (err.status === 409 && err.data?.request) {
        setModalRequest(normalizeModalRequest(err.data.request, {
          ...fallback,
          iban: err.data?.iban,
          payment_info: err.data?.payment_info,
        }));
        showToast(err.message || 'Вече има чакаща заявка за това съдържание.');
        if (onResolved) await onResolved();
        return { ok: true, created: false };
      }

      showToast(err.message || 'Неуспешно създаване на заявка за покупка.', 'error');
      return { ok: false, created: false };
    } finally {
      setActiveKey('');
    }
  };

  return {
    modalRequest,
    activeKey,
    isBusy: Boolean(activeKey),
    requestPurchase,
    closePurchaseModal: () => setModalRequest(null),
  };
}
