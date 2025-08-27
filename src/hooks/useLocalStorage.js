import { useState, useEffect } from 'react'

export function useLocalStorage(key, initialValue) {
  // Estado para armazenar nosso valor
  const [storedValue, setStoredValue] = useState(() => {
    try {
      // Pegar do localStorage usando a chave
      const item = window.localStorage.getItem(key)
      // Fazer parse do JSON armazenado ou retornar valor inicial
      return item ? JSON.parse(item) : initialValue
    } catch (error) {
      // Se erro, retornar valor inicial
      console.error(`Erro ao ler localStorage key "${key}":`, error)
      return initialValue
    }
  })

  // Retornar uma versão wrapeada da função setter do useState que persiste o novo valor no localStorage
  const setValue = (value) => {
    try {
      // Permitir que value seja uma função para que tenhamos a mesma API do useState
      const valueToStore = value instanceof Function ? value(storedValue) : value
      
      // Salvar estado
      setStoredValue(valueToStore)
      
      // Salvar no localStorage
      window.localStorage.setItem(key, JSON.stringify(valueToStore))
    } catch (error) {
      // Uma implementação mais avançada trataria o caso onde o localStorage está cheio
      console.error(`Erro ao salvar no localStorage key "${key}":`, error)
    }
  }

  return [storedValue, setValue]
}