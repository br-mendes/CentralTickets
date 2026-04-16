import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function GLPISourceTickets({ params }) {
  const { source } = params
  const instance = source === 'peta' ? 'peta' : source === 'gmx' ? 'gmx' : null
  if (instance) {
    redirect(`/tickets?instance=${instance}`)
  }
  redirect('/tickets')
}
