export interface TicketLike {
  glpi_id: number
  date_opening: string
  date_takeaccount?: string
  date_solve?: string
  internal_time_to_own?: number
  internal_time_to_resolve?: number
}

export interface SLACalculation {
  sla_primeira_resposta_horas: number
  sla_primeira_resposta_status: "Cumprido" | "Estourado" | "Nao atendido" | "Sem SLA"
  fora_prazo_inicio: boolean
  fora_prazo_solucao: boolean
  percentual_primeira_resposta: number
  percentual_solucao: number
}

export function calculateSLA(t: TicketLike): SLACalculation {
  const opening = new Date(t.date_opening).getTime()
  const now = Date.now()
  const take = t.date_takeaccount ? new Date(t.date_takeaccount).getTime() : null
  const solve = t.date_solve ? new Date(t.date_solve).getTime() : null

  const dtInicio = take ? (take - opening) / 1000 : (now - opening) / 1000
  const dtSolucao = solve ? (solve - opening) / 1000 : (now - opening) / 1000

  const pInicio = t.internal_time_to_own ? (dtInicio / t.internal_time_to_own) * 100 : 0
  const pSolucao = t.internal_time_to_resolve ? (dtSolucao / t.internal_time_to_resolve) * 100 : 0

  let status: SLACalculation["sla_primeira_resposta_status"] = "Sem SLA"
  if (!t.internal_time_to_own) status = "Sem SLA"
  else if (!take) status = "Nao atendido"
  else if (dtInicio <= t.internal_time_to_own) status = "Cumprido"
  else status = "Estourado"

  return {
    sla_primeira_resposta_horas: (t.internal_time_to_own ?? 0) / 3600,
    sla_primeira_resposta_status: status,
    fora_prazo_inicio: !!t.internal_time_to_own && pInicio > 100,
    fora_prazo_solucao: !!t.internal_time_to_resolve && pSolucao > 100,
    percentual_primeira_resposta: pInicio,
    percentual_solucao: pSolucao,
  }
}
