export function ErrorDisplay({ error, onRetry }) {
  return (
    <div className="error-container">
      <svg className="error-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <h2 className="error-title">{error?.message || 'Erro ao carregar'}</h2>
      <p className="error-message">
        {error?.details || 'Ocorreu um erro inesperado. Tente novamente.'}
      </p>
      {onRetry && (
        <button className="btn btn-primary" onClick={onRetry}>
          Tentar novamente
        </button>
      )}
    </div>
  );
}
