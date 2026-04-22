import './globals.css'
import Header from './components/Header'
import { FilterProvider } from './context/FilterContext'

export const metadata = {
  title: 'Central de Tickets',
  description: 'Sistema interno de tickets GLPI — Peta/GMX',
  icons: {
    icon: '/favicon-peta.png',
  },
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
        <FilterProvider>
          <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <Header />
            <main style={{ flex: 1, padding: '24px', maxWidth: '1800px', margin: '0 auto', width: '100%' }}>
              {children}
            </main>
          </div>
        </FilterProvider>
      </body>
    </html>
  )
}
