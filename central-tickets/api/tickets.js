const { createClient } = require('@supabase/supabase-js')

const VALID_INSTANCES = ['PETA', 'GMX']

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  const instance = String(req.query.instance || '').toUpperCase()

  if (!VALID_INSTANCES.includes(instance)) {
    return res.status(400).json({ error: 'Instancia invalida. Use PETA ou GMX.' })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: 'Configuracao do Supabase nao encontrada.' })
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  const { data, error } = await supabase
    .from('tickets_cache')
    .select('*')
    .eq('instance', instance)
    .order('date_mod', { ascending: false })

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json(data)
}
