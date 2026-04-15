(function(){
  function tallyTickets(tickets){
    let total = tickets.length;
    let processing = 0;
    let pending = 0;
    let approval = 0;
    let slaLate = 0;
    let petaCount = 0;
    let gmxCount = 0;
    let newTickets = 0;
    let solved = 0;
    let closed = 0;
    
    for (const t of tickets){
      const st = t.status ?? t.status_key ?? '';
      const instance = t.instance ?? '';
      const isLate = t.is_sla_late ?? t.isSlaLate ?? t.is_overdue_resolve ?? false;
      
      // Count by status
      if (typeof st === 'string'){
        if (st === 'processing' || st === '2') processing++;
        else if (st === 'pending' || st === '4') pending++;
        else if (st === 'pending-approval' || st === '7' || st === 'Aprovação') approval++;
        else if (st === 'new' || st === '1') newTickets++;
        else if (st === 'solved' || st === '5') solved++;
        else if (st === 'closed' || st === '6') closed++;
      } else if (typeof st === 'number'){
        if (st === 2) processing++;
        else if (st === 4) pending++;
        else if (st === 7) approval++;
        else if (st === 1) newTickets++;
        else if (st === 5) solved++;
        else if (st === 6) closed++;
      }
      
      // SLA late
      if (isLate) slaLate++;
      
      // Count by instance
      if (instance === 'Peta' || instance === 'peta') petaCount++;
      else if (instance === 'GMX' || instance === 'gmx') gmxCount++;
    }
    
    return { 
      total, 
      processing, 
      pending, 
      approval, 
      slaLate,
      petaCount,
      gmxCount,
      new: newTickets,
      solved,
      closed
    };
  }
  window.DashboardUtils = { tallyTickets };
})();