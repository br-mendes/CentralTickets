export function calculateSLA(ticket) {
  // If we have pre-calculated percentages from the API, use them
  if (ticket.sla_percentage_first !== undefined && ticket.sla_percentage_first !== null) {
    return {
      percentual_primeira_resposta: ticket.sla_percentage_first,
      percentual_solucao: ticket.sla_percentage_resolve || ticket.sla_percentage_first,
      sla_primeira_resposta_status: getSLAStatus(ticket.sla_percentage_first),
      sla_solucao_status: getSLAStatus(ticket.sla_percentage_resolve || ticket.sla_percentage_first)
    }
  }

  // Fallback: calculate based on is_sla_late flag
  if (ticket.is_sla_late || ticket.is_overdue_first) {
    return {
      percentual_primeira_resposta: 100,
      percentual_solucao: 100,
      sla_primeira_resposta_status: 'Estourado',
      sla_solucao_status: 'Estourado'
    }
  }

  return {
    percentual_primeira_resposta: 50,
    percentual_solucao: 50,
    sla_primeira_resposta_status: 'No Prazo',
    sla_solucao_status: 'No Prazo'
  }
}

function getSLAStatus(percentage) {
  if (percentage >= 100) return 'Estourado'
  if (percentage >= 70) return 'Atenção'
  return 'No Prazo'
}
