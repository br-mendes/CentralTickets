'use client'
import { createContext, useContext, useState } from 'react'
import { applyGlobalFilters } from '../lib/utils'

const FilterCtx = createContext({
  globalSearch: '',
  setGlobalSearch: () => {},
  period: 'all',
  setPeriod: () => {},
  globalTechnician: '',
  setGlobalTechnician: () => {},
  availableTechnicians: [],
  setAvailableTechnicians: () => {},
  applyFilters: (t) => t,
})

export function FilterProvider({ children }) {
  const [globalSearch, setGlobalSearch] = useState('')
  const [period, setPeriod] = useState('all')
  const [globalTechnician, setGlobalTechnician] = useState('')
  const [availableTechnicians, setAvailableTechnicians] = useState([])

  function applyFilters(tickets) {
    return applyGlobalFilters(tickets, { globalSearch, period, globalTechnician })
  }

  return (
    <FilterCtx.Provider value={{
      globalSearch, setGlobalSearch,
      period, setPeriod,
      globalTechnician, setGlobalTechnician,
      availableTechnicians, setAvailableTechnicians,
      applyFilters,
    }}>
      {children}
    </FilterCtx.Provider>
  )
}

export const useFilters = () => useContext(FilterCtx)
