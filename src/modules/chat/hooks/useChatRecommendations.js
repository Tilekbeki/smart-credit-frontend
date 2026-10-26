import { useEffect, useMemo, useState } from 'react';
import { recommendationInput } from '../../applications/model/form.js';

export function useChatRecommendations({ form, enabled, onRecommend }) {
  const { purpose, requestedAmountRub, termMonths, monthlyRevenueRub, monthlyExpensesRub } = form;
  const input = useMemo(() => ({ purpose, requestedAmountRub, termMonths, monthlyRevenueRub, monthlyExpensesRub }),
    [purpose, requestedAmountRub, termMonths, monthlyRevenueRub, monthlyExpensesRub]);
  const [calculation, setCalculation] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setSelectedProductId(null);
    setConfirming(false);
    if (!enabled) { setCalculation(null); return undefined; }
    let active = true;
    setCalculation({ input, loading: true, result: null, error: '' });
    Promise.resolve().then(() => onRecommend(recommendationInput(input)))
      .then((response) => {
        if (!active) return;
        setCalculation({ input, loading: false, result: response, error: '' });
        const preferred = response.products?.find((item) => item.product.id === response.recommendedProductId && item.eligible)
          || response.products?.find((item) => item.eligible);
        setSelectedProductId(preferred?.product.id || null);
      })
      .catch((failure) => {
        if (active) setCalculation({ input, loading: false, result: null, error: failure.message || 'Не удалось получить подбор. Попробуйте ещё раз.' });
      });
    // Ignore a response after changing answers, leaving the chat, or starting another calculation.
    return () => { active = false; };
  }, [enabled, input, attempt, onRecommend]);

  // Previous terms must not be actionable while an updated calculation is pending.
  const current = enabled && calculation?.input === input ? calculation : null;
  const result = current?.result || null;
  return {
    result,
    calculating: enabled && (!current || current.loading),
    resultError: current?.error || '',
    setResultError: (error) => setCalculation((previous) => previous?.input === input ? { ...previous, error } : previous),
    retryRecommendation: () => setAttempt((value) => value + 1),
    selectedProductId,
    selectedProduct: result?.products?.find((item) => item.product.id === selectedProductId && item.eligible),
    selectProduct: (id) => { setSelectedProductId(id); setConfirming(false); },
    confirming,
    setConfirming,
  };
}
