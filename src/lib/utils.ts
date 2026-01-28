import clsx from 'clsx'

export function cn(...inputs: any[]) {
  return clsx(inputs)
}

export function statusLabel(status: number | null) {
  switch (status) {
    case 1: return "Novo";
    case 2: return "Atribuído";
    case 3: return "Planejado";
    case 4: return "Em espera";
    case 5: return "Solucionado";
    case 6: return "Fechado";
    default: return String(status ?? "");
  }
}

export function isAlert(slaFirst: number | null, slaResolve: number | null, threshold = 70) {
  return (slaFirst != null && slaFirst >= threshold) || (slaResolve != null && slaResolve >= threshold);
}
