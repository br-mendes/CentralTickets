// app/layout.js
import './globals.css'

export const metadata = {
  title: 'CentralTickets - Sistema Interno',
  description: 'Sistema interno de tickets para Peta/GMX',
}

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="bg-blue-600 text-white p-4">
          <h1 className="text-2xl font-bold">CentralTickets</h1>
        </header>
        <main className="p-4">{children}</main>
        <footer className="bg-gray-200 p-4 text-center">
          <p>© 2026 CentralTickets - GMX/Peta Tecnologia</p>
        </footer>
      </body>
    </html>
  )
}