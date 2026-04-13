(function(){
  function tallyTickets(tickets){
    let total = tickets.length;
    let processing = 0;
    let pending = 0;
    let approval = 0;
    for (const t of tickets){
      const st = t.status ?? t.status_id ?? '';
      if (typeof st === 'string'){
        if (st === 'processing') processing++;
        else if (st === 'pending') pending++;
        else if (st === 'pending-approval' || st === 'Aprovação') approval++;
      } else if (typeof st === 'number'){
        if (st === 2) processing++;
        else if (st === 4) pending++;
        else if (st === 7) approval++;
      }
    }
    return { total, processing, pending, approval };
  }
  window.DashboardUtils = { tallyTickets };
})();
