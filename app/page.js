// app/page.js
import Link from 'next/link'

// Server Component

export default function HomePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Bem-vindo ao CentralTickets</h1>
      <p className="text-gray-600">
        Sistema interno para gerenciamento de tickets da GMX e Peta Tecnologia.
      </p>
      <div className="space-x-4">
        <Link
          href="/tickets"
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Ver Todos os Tickets
        </Link>
        <Link
          href="/glpi/peta/tickets"
          className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
        >
          Tickets Peta
        </Link>
        <Link
          href="/glpi/gmx/tickets"
          className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600"
        >
          Tickets GMX
        </Link>
      </div>
    </div>
  )
}