import './globals.css'
import Header from './components/Header'

export const metadata = {
  title: 'CentralTickets - Sistema Interno',
  description: 'Sistema interno de tickets para Peta/GMX',
}

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          <Header />
          <main style={{
            flex: 1,
            padding: '24px',
            maxWidth: '1800px',
            margin: '0 auto',
            width: '100%',
          }}>
            {children}
          </main>
          <footer style={{
            borderTop: '1px solid var(--border)',
            padding: '12px 24px',
            textAlign: 'center',
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
          }}>
            © 2026 CentralTickets — GMX/Peta Tecnologia
          </footer>
        </div>
      </body>
    </html>
  )
}
