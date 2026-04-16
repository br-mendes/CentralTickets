// app/components/auth-button.js
'use client'

import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase/client'

export default function AuthButton() {
  const supabase = getSupabaseClient()
  const router = useRouter()

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${location.origin}/auth/callback`,
      },
    })
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.refresh() // Recarrega a página para refletir o logout
  }

  const { data: { session } } = supabase.auth.getSession()

  return (
    <div className="space-x-2">
      {session ? (
        <>
          <span className="text-sm">Olá, {session.user.email}</span>
          <button
            onClick={handleLogout}
            className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 text-sm"
          >
            Sair
          </button>
        </>
      ) : (
        <button
          onClick={handleLogin}
          className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 text-sm"
        >
          Entrar com GitHub
        </button>
      )}
    </div>
  )
}