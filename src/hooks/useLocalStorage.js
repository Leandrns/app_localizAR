import { useState, useEffect } from "react";

export function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Erro ao ler localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // Sempre que storedValue mudar, persiste no localStorage
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, JSON.stringify(storedValue));
      }
    } catch (error) {
      console.error(`Erro ao salvar no localStorage key "${key}":`, error);
    }
  }, [key, storedValue]);

  // setValue aceita valor direto ou função (igual ao setState)
  const setValue = (value) => {
    if (typeof value === "function") {
      // delega a atualização para o React, evitando problemas de snapshot
      setStoredValue((prev) => value(prev));
    } else {
      setStoredValue(value);
    }
  };

  return [storedValue, setValue];
}
