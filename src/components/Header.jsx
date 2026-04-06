import { getCurrentTimeFormatted } from '../utils/dateUtils';

export function Header({ lastUpdate, onRefresh, isLoading }) {
  const updateTime = lastUpdate ? getCurrentTimeFormatted() : null;

  return (
    <header className="header">
      <div className="header-content">
        <h1>Central de Tickets</h1>
        <div className="header-actions">
          {updateTime && (
            <span className="last-update">
              Última atualização: {updateTime}
            </span>
          )}
          <button 
            className="btn btn-primary" 
            onClick={onRefresh}
            disabled={isLoading}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2v6h-6"></path>
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
              <path d="M3 22v-6h6"></path>
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
            </svg>
            Atualizar
          </button>
        </div>
      </div>
    </header>
  );
}
