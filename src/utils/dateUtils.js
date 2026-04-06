export function formatDate(dateString) {
  if (!dateString) return 'N/A';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Data inválida';
    
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Data inválida';
  }
}

export function formatShortDate(dateString) {
  if (!dateString) return 'N/A';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return 'N/A';
  }
}

export function getRelativeTime(dateString) {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    
    return formatDuration(diffMs);
  } catch {
    return '';
  }
}

export function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    if (remainingHours > 0) {
      return `há ${days} dia${days > 1 ? 's' : ''} e ${remainingHours} hora${remainingHours > 1 ? 's' : ''}`;
    }
    return `há ${days} dia${days > 1 ? 's' : ''}`;
  }
  
  if (hours > 0) {
    return `há ${hours} hora${hours > 1 ? 's' : ''}`;
  }
  
  if (minutes > 0) {
    return `há ${minutes} minuto${minutes > 1 ? 's' : ''}`;
  }
  
  return 'há poucos segundos';
}

export function getCurrentTimeFormatted() {
  return new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
