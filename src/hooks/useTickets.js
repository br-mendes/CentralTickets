import { useState, useEffect, useCallback, useRef } from 'react';
import { apiService } from '../services/api';

const REFRESH_INTERVAL = 60000;

export function useTickets(autoRefresh = true) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const intervalRef = useRef(null);

  const fetchTickets = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await apiService.getTickets();
      setTickets(data);
      setLastUpdate(new Date());
    } catch (err) {
      setError({
        message: err.message || 'Erro ao carregar tickets',
        details: 'Verifique sua conexão ou tente novamente mais tarde.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    fetchTickets(false);
  }, [fetchTickets]);

  useEffect(() => {
    fetchTickets(true);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      apiService.killSession();
    };
  }, [fetchTickets]);

  useEffect(() => {
    if (autoRefresh && !loading && !error) {
      intervalRef.current = setInterval(() => {
        fetchTickets(false);
      }, REFRESH_INTERVAL);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh, loading, error, fetchTickets]);

  return {
    tickets,
    loading,
    error,
    lastUpdate,
    refresh,
  };
}
