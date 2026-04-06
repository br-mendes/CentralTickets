import { Header } from './components/Header';
import { KanbanBoard } from './components/KanbanBoard';
import { Loading } from './components/Loading';
import { ErrorDisplay } from './components/ErrorDisplay';
import { useTickets } from './hooks/useTickets';

function App() {
  const { tickets, loading, error, lastUpdate, refresh } = useTickets(true);

  return (
    <div className="app">
      <Header 
        lastUpdate={lastUpdate}
        onRefresh={refresh}
        isLoading={loading}
      />
      
      <main className="main">
        {loading && tickets.length === 0 ? (
          <Loading />
        ) : error && tickets.length === 0 ? (
          <ErrorDisplay error={error} onRetry={refresh} />
        ) : (
          <KanbanBoard tickets={tickets} />
        )}
      </main>
    </div>
  );
}

export default App;
